"use client";

// Manufacturing → "Oil moved from mill to tank": one entry per transfer (mill, batch, tank, kg),
// and a warning for decanted batches whose oil has no transfer entry after two days.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MfgBatchDTO } from "@/lib/types";
import { businessDate } from "@/lib/register";
import { batchLabel, MILLS, TRANSFER_TANKS, TRANSFER_WAIT_DAYS, transferSummary, type TransferRow, type TransferTank } from "@/lib/millTransfer";

const box = "rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1";
const kg = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const TANK_NAME: Record<string, string> = Object.fromEntries(TRANSFER_TANKS.map((t) => [t.key, t.name]));

export default function MillTransferPanel({ batches }: { batches: MfgBatchDTO[] }) {
  const today = businessDate(Date.now());
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(today);
  const [batchId, setBatchId] = useState("");
  const [mill, setMill] = useState<string>(MILLS[0]);
  const [toTank, setToTank] = useState<TransferTank>("k2");
  const [oilKg, setOilKg] = useState("");
  const [note, setNote] = useState("");

  const from = businessDate(Date.now() - 120 * 86400000);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops-records?kinds=mill_transfer&from=${from}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load.");
      setRows(((j.data || []) as TransferRow[]).slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [from]);
  useEffect(() => {
    void load();
  }, [load]);

  // batches from the last 120 days, newest first
  const recent = useMemo(() => batches.filter((b) => b.date.slice(0, 10) >= from).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60), [batches, from]);
  const summary = useMemo(() => transferSummary(recent, rows, today), [recent, rows, today]);
  const waiting = summary.batches.filter((b) => b.waiting);

  const pickBatch = (id: string) => {
    setBatchId(id);
    const b = recent.find((x) => x.id === id);
    if (b?.mill && (MILLS as readonly string[]).includes(b.mill)) setMill(b.mill);
    const s = summary.batches.find((x) => x.batchId === id);
    if (s && s.leftKg > 0 && !oilKg) setOilKg(String(s.leftKg));
  };
  const save = async () => {
    setError("");
    const b = recent.find((x) => x.id === batchId);
    setSaving(true);
    try {
      const res = await fetch("/api/ops-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "mill_transfer", date, ref: toTank, status: "done", data: { mill, batchId: b?.id ?? null, batchLabel: b ? batchLabel(b) : null, toTank, oilKg: Number(oilKg), note } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save.");
      setOilKg("");
      setNote("");
      setBatchId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
      <strong className="text-sm">Oil moved from mill to tank</strong>
      {!!waiting.length && (
        <div className="rounded border border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-sm text-red-900 dark:text-red-200">
          <strong>Decanted more than {TRANSFER_WAIT_DAYS} days ago, with oil not yet logged as moved:</strong>
          {waiting.map((b) => (
            <div key={b.batchId}>
              {b.label}: decanted {kg(b.decantKg)} kg, moved {kg(b.movedKg)} kg, <strong>{kg(b.leftKg)} kg not logged</strong> ({b.daysSinceDecant} days){" "}
              <button className="underline" onClick={() => pickBatch(b.batchId)}>Log it</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-0.5"><span className="block text-xs opacity-70">Date</span><input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={box} /></label>
        <label className="space-y-0.5"><span className="block text-xs opacity-70">Batch</span>
          <select value={batchId} onChange={(e) => pickBatch(e.target.value)} className={`${box} max-w-[16rem]`}>
            <option value="">Not from a listed batch</option>
            {recent.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}{b.step3Kg ? ` · ${kg(b.step3Kg)} kg` : ""}</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="block text-xs opacity-70">Mill</span>
          <select value={mill} onChange={(e) => setMill(e.target.value)} className={box}>{MILLS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="space-y-0.5"><span className="block text-xs opacity-70">Into</span>
          <select value={toTank} onChange={(e) => setToTank(e.target.value as TransferTank)} className={box}>{TRANSFER_TANKS.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select>
        </label>
        <label className="space-y-0.5"><span className="block text-xs opacity-70">Oil kg</span><input type="number" inputMode="decimal" min="0" value={oilKg} onChange={(e) => setOilKg(e.target.value)} className={`${box} w-24`} /></label>
        <label className="space-y-0.5 flex-1 min-w-[8rem]"><span className="block text-xs opacity-70">Note</span><input value={note} onChange={(e) => setNote(e.target.value)} className={`${box} w-full`} /></label>
        <button disabled={saving || !oilKg} onClick={save} className="rounded px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-50">{saving ? "Saving…" : "Save transfer"}</button>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!rows.length ? (
        <p className="text-sm opacity-70">No transfer logged yet.</p>
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs opacity-60"><tr><th className="py-1">Date</th><th>Mill</th><th>Batch</th><th>Into</th><th className="text-right">Oil kg</th><th className="pl-3">By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1 tabular-nums">{r.date}</td>
                  <td>{r.data.mill}</td>
                  <td className="text-xs">{r.data.batchLabel || <span className="opacity-50">not linked</span>}{r.data.note ? ` · ${r.data.note}` : ""}</td>
                  <td>{TANK_NAME[r.data.toTank] || r.data.toTank}</td>
                  <td className="text-right tabular-nums font-semibold">{kg(r.data.oilKg)}</td>
                  <td className="pl-3 text-xs opacity-70">{r.by || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs opacity-60">Last 120 days: {kg(summary.totalKg)} kg moved{summary.unlinkedKg > 0 ? `, of which ${kg(summary.unlinkedKg)} kg not linked to a batch` : ""}. A wrong entry can be removed by the owner only.</p>
    </section>
  );
}
