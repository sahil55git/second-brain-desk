"use client";

import { useCallback, useEffect, useState } from "react";
import { businessDate } from "@/lib/register";

interface Log { id: string; date: string; machine: string; kind: string; hours: number | null; powerUnits: number | null; downtimeMin: number | null; note: string | null; by: string | null }
const KINDS = [
  { k: "run", label: "▶️ Ran today" },
  { k: "stop", label: "⛔ Breakdown / stop" },
  { k: "service", label: "🔧 Service done" },
];
const dmy = (d: string) => d.split("-").reverse().join("-");

export default function MachineLogDesk() {
  const today = businessDate(Date.now());
  const [logs, setLogs] = useState<Log[]>([]);
  const [f, setF] = useState({ date: today, machine: "", kind: "run", hours: "", powerUnits: "", downtimeMin: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(() => fetch("/api/machines?from=" + new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)).then((r) => r.json()).then((j) => setLogs(j.data || [])).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const machines = Array.from(new Set(logs.map((l) => l.machine))).sort();
  if (!machines.length) machines.push("Expeller 1", "Expeller 2", "Filter press");
  const save = async () => {
    const r = await fetch("/api/machines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ ok: false, t: j.error || "Could not save." });
    setMsg({ ok: true, t: `Saved: ${f.machine}` });
    setF({ ...f, hours: "", powerUnits: "", downtimeMin: "", note: "" });
    void load();
  };
  const inp = (k: keyof typeof f, label: string, type = "number") => <label style={{ display: "grid", gap: 4, fontSize: 13 }}>{label}<input type={type} inputMode={type === "number" ? "decimal" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <div className="hub">
      <header className="hub-top">
        <div><h1>⚙️ Machines</h1><div className="hub-m">Hours, power units, breakdowns and service for each machine.</div></div>
        <nav className="hub-links"><a className="hub-btn" href="/insights#machines">📈 Report</a></nav>
      </header>
      <section className="hub-card" style={{ display: "grid", gap: 10, maxWidth: 640 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{machines.map((m) => <button key={m} className={`hub-btn sm${f.machine === m ? " primary" : ""}`} onClick={() => setF({ ...f, machine: m })}>{m}</button>)}</div>
        {inp("machine", "Machine", "text")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{KINDS.map((k) => <button key={k.k} className={`hub-btn sm${f.kind === k.k ? " primary" : ""}`} onClick={() => setF({ ...f, kind: k.k })}>{k.label}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {inp("date", "Date", "date")}
          {f.kind !== "service" && inp("hours", "Hours run")}
          {f.kind === "run" && inp("powerUnits", "Power units (meter)")}
          {f.kind !== "service" && inp("downtimeMin", "Stopped (minutes)")}
        </div>
        {inp("note", f.kind === "service" ? "What was done (worm shaft, cage bars, cloth…)" : "Note", "text")}
        <button className="hub-btn primary" disabled={!f.machine.trim()} onClick={() => void save()}>Save</button>
        {msg && <div className="hub-m" role="status" style={{ color: msg.ok ? "var(--h-g)" : "var(--h-r)" }}>{msg.t}</div>}
      </section>
      <section className="hub-card">
        <h3>Recent</h3>
        {logs.slice(0, 40).map((l) => (
          <div key={l.id} className="hub-m" style={{ padding: "4px 0", borderBottom: "1px solid var(--h-line)" }}>
            <b>{dmy(l.date)} · {l.machine}</b> — {KINDS.find((k) => k.k === l.kind)?.label || l.kind}
            {l.hours != null ? ` · ${l.hours} h` : ""}{l.powerUnits != null ? ` · ${l.powerUnits} units` : ""}{l.downtimeMin ? ` · stopped ${l.downtimeMin} min` : ""}{l.note ? ` · ${l.note}` : ""}{l.by ? ` · ${l.by}` : ""}
          </div>
        ))}
        {!logs.length && <p className="hub-m">Nothing logged yet.</p>}
      </section>
    </div>
  );
}
