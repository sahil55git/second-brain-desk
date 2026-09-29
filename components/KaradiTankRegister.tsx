"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useScale } from "./ScaleProvider";

const SOURCE = "SI850-KARADI";
const PENDING_KEY = "karadiTankPendingTransfer";
type Movement = { id: string; direction: string; beforeKg: number; afterKg: number; quantityKg: number; startedAt: string; finishedAt: string; note: string | null; recordedBy: string };
type Reading = { id: string; weightKg: number; bucketAt: string };
type Pending = { beforeKg: number; startedAt: string; requestId: string };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export default function KaradiTankRegister() {
  const { readings, connected } = useScale();
  const current = readings[SOURCE];
  const fresh = connected && !!current && Date.now() - current.receivedAt < 12000;
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState("");
  const [from, setFrom] = useState(() => localDate(new Date()));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [movements, setMovements] = useState<Movement[]>([]);
  const [snapshots, setSnapshots] = useState<Reading[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString();
      const res = await fetch(`/api/tank?fromInstant=${encodeURIComponent(start)}&toInstant=${encodeURIComponent(end)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load tank report");
      setMovements(json.data.movements);
      setSnapshots(json.data.readings);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load tank report"); }
  }, [from, to]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PENDING_KEY);
      if (saved) {
        const value = JSON.parse(saved) as Pending;
        if (Number.isFinite(value.beforeKg) && value.startedAt && value.requestId) setPending(value);
      }
    } catch { window.localStorage.removeItem(PENDING_KEY); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function begin() {
    if (!fresh || !current || pending) return;
    const value = { beforeKg: current.weight, startedAt: new Date().toISOString(), requestId: crypto.randomUUID() };
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    setPending(value);
    setError("");
  }

  async function finish() {
    if (!fresh || !current || !pending || saving) return;
    const change = Math.round((current.weight - pending.beforeKg) * 100) / 100;
    if (Math.abs(change) < 0.2) { setError("The tank weight has changed by less than 0.2 kg."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/tank", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "movement", source: SOURCE, ...pending, afterKg: current.weight, note }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not record movement");
      window.localStorage.removeItem(PENDING_KEY);
      setPending(null);
      setNote("");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record movement"); }
    finally { setSaving(false); }
  }

  function exportCsv() {
    const lines = [["Type", "Date and time (IST)", "Start (kg)", "End (kg)", "Quantity (kg)", "Note", "Recorded by"],
      ...movements.map((m) => [m.direction, dateTime(m.finishedAt), m.beforeKg, m.afterKg, m.quantityKg, m.note || "", m.recordedBy]),
      ...snapshots.map((s) => ["SNAPSHOT", dateTime(s.bucketAt), "", s.weightKg, "", "", ""])]
      .map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", lines], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `karadi-tank-${from}-to-${to}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totals = useMemo(() => movements.reduce((sum, m) => ({
    inKg: sum.inKg + (m.direction === "IN" ? m.quantityKg : 0),
    outKg: sum.outKg + (m.direction === "OUT" ? m.quantityKg : 0),
  }), { inKg: 0, outKg: 0 }), [movements]);

  return <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
    <div><h2 className="font-semibold">Karadi tank register</h2>
      <p className="text-xs opacity-65">Physical weight samples are saved once per minute while this page is open. Confirm each filling or dispensing transfer to count it in totals. Times shown in IST.</p></div>
    <div className="flex flex-wrap gap-3 items-end">
      <div><div className="text-xs opacity-60">Current tank weight</div><div className="text-2xl font-bold tabular-nums">{fresh ? current?.weight.toFixed(2) : "—"} kg <span className="text-xs font-normal">{fresh ? "LIVE" : "OFFLINE"}</span></div></div>
      {!pending ? <button type="button" disabled={!fresh} onClick={begin} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-2 text-sm disabled:opacity-50">Start transfer</button>
        : <div className="space-y-2"><div className="text-sm">Started {dateTime(pending.startedAt)} at <strong>{pending.beforeKg.toFixed(2)} kg</strong>. {fresh && current ? `Change: ${(current.weight - pending.beforeKg).toFixed(2)} kg` : "Waiting for live scale"}</div>
          <input className="rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-sm" placeholder="Note / invoice reference" value={note} onChange={(e) => setNote(e.target.value)} />{" "}
          <button type="button" disabled={!fresh || saving} onClick={() => void finish()} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-2 text-sm disabled:opacity-50">{saving ? "Saving…" : "Finish and record"}</button>{" "}
          <button type="button" disabled={saving} onClick={() => { if (window.confirm("Discard this unfinished transfer?")) { localStorage.removeItem(PENDING_KEY); setPending(null); setNote(""); } }} className="rounded border px-3 py-2 text-sm">Cancel</button></div>}
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block rounded border bg-transparent p-1" /></label>
      <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block rounded border bg-transparent p-1" /></label>
      <button type="button" onClick={() => void refresh()} className="rounded border px-3 py-1.5">Refresh report</button>
      <button type="button" onClick={exportCsv} className="rounded border px-3 py-1.5">Download CSV</button>
    </div>
    <div className="flex gap-6 text-sm"><span>Total in: <strong>{totals.inKg.toFixed(2)} kg</strong></span><span>Total out: <strong>{totals.outKg.toFixed(2)} kg</strong></span><span>Snapshots: <strong>{snapshots.length}</strong></span></div>
    <div className="overflow-x-auto max-h-72"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Date &amp; time (IST)</th><th className="p-2">Type</th><th className="p-2">From → to</th><th className="p-2">Quantity</th><th className="p-2">Note</th></tr></thead>
      <tbody>{movements.map((m) => <tr key={m.id} className="border-t border-black/10 dark:border-white/10"><td className="p-2">{dateTime(m.finishedAt)}</td><td className="p-2">{m.direction}</td><td className="p-2">{m.beforeKg.toFixed(2)} → {m.afterKg.toFixed(2)}</td><td className="p-2">{m.quantityKg.toFixed(2)} kg</td><td className="p-2">{m.note || "—"}</td></tr>)}
        {!movements.length && <tr><td colSpan={5} className="p-3 opacity-55">No confirmed transfers in this period.</td></tr>}</tbody></table></div>
  </section>;
}
