"use client";

// 📦 Insights → Contracts, Stock variance, Barrel deposits. Numbers from lib/stockOps.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { barrelDeposits, contractProgress, varianceSummary, type FleetLite, type OpsRec } from "@/lib/stockOps";

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("-") : "–");
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function ContractsTab({ d, today }: { d: BizData; today: string }) {
  const [recs, setRecs] = useState<OpsRec[]>([]);
  const [f, setF] = useState({ supplier: "", item: "", qty: "", unit: "kg", rate: "", from: today, to: shift(today, 30) });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/ops-records?kinds=contract").then((r) => r.json()).then((j) => setRecs(j.data || [])).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => contractProgress(recs, d, today), [recs, d, today]);
  const save = async () => {
    const r = await fetch("/api/ops-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "contract", date: today, ref: f.supplier, data: { ...f, qty: Number(f.qty) || 0, rate: Number(f.rate) || 0 } }) });
    setMsg(r.ok ? "Contract saved ✓" : "Could not save");
    if (r.ok) { setF({ ...f, supplier: "", item: "", qty: "", rate: "" }); void load(); }
  };
  const cancel = async (id: string) => { await fetch("/api/ops-records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "cancelled" }) }); void load(); };
  const open = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
  return (
    <>
      {open.length > 0 && <div className="hub-banner">🤝 {open.length} open contracts · {rs(open.reduce((a, r) => a + r.valueLeft, 0))} still to come</div>}
      <div className="ins-cards">{rows.map((r) => (
        <div key={r.id} className={`hub-card ins-run ${r.status === "late" ? "out" : r.status === "done" ? "ok" : r.daysLeft != null && r.daysLeft < 7 && r.left > 0 ? "low" : ""}`}>
          <div className="ins-run-h"><b>{r.supplier} · {r.item}</b><span className="ins-chip">{r.status}</span></div>
          <div className="ins-bar"><span className="n">{r.got.toLocaleString("en-IN")} / {r.booked.toLocaleString("en-IN")} kg</span><span className="b"><i style={{ width: `${r.pct}%` }} /></span><span className="v">{r.pct}%</span></div>
          <small className="hub-m">@ ₹{r.rate}{r.avgRate != null ? ` (billed avg ₹${r.avgRate})` : ""} · {dmy(r.date)} → {dmy(r.dueDate)}{r.daysLeft != null ? ` · ${r.daysLeft} days left` : ""}</small>
          {r.perDayNeeded != null && <small>Needs ≈ {r.perDayNeeded} kg/day to finish on time · {rs(r.valueLeft)} left</small>}
          {r.status !== "done" && r.status !== "cancelled" && <button className="hub-btn sm" onClick={() => void cancel(r.id)}>Close / cancel</button>}
        </div>
      ))}</div>
      <section className="hub-card"><h3>＋ New contract / forward booking</h3>
        <div className="ins-row">
          <label>Supplier <input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></label>
          <label>Item <input value={f.item} placeholder="Groundnut seed" onChange={(e) => setF({ ...f, item: e.target.value })} /></label>
          <label>Booked qty <input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label>Rate ₹ <input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></label>
          <label>From <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label>Deliver by <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <button className="hub-btn primary" disabled={!f.supplier || !Number(f.qty)} onClick={() => void save()}>Save</button>
          {msg && <span className="hub-m">{msg}</span>}
        </div>
        <p className="hub-m small">Deliveries fill in by themselves from purchases with the same supplier and item.</p>
      </section>
    </>
  );
}

export function VarianceTab({ d, today }: { d: BizData; today: string }) {
  const [days, setDays] = useState(30);
  const v = useMemo(() => varianceSummary(d, { from: shift(today, -days + 1), to: today }), [d, today, days]);
  return (
    <>
      <div className="ins-range">{[7, 30, 90].map((n) => <button key={n} className={`hub-btn sm${days === n ? " primary" : ""}`} onClick={() => setDays(n)}>{n} days</button>)}<span className="hub-m small">Gap = book stock − counted (+ means less in the tank). Flag at {v.threshold} kg.</span></div>
      <div className="ins-tbl"><table>
        <thead><tr><th>Product</th><th className="r">Counts</th><th className="r">Flagged</th><th className="r">Net gap kg</th><th className="r">Total |gap|</th><th>Worst</th></tr></thead>
        <tbody>{v.rows.map((r) => (
          <tr key={r.product} className={r.flagged ? "low" : ""}><td><b>{r.product}</b></td><td className="r">{r.tallies}</td><td className={`r ${r.flagged ? "bad" : ""}`}>{r.flagged}</td><td className={`r ${Math.abs(r.netGap) >= 2 ? "bad" : ""}`}>{r.netGap > 0 ? "+" : ""}{r.netGap}</td><td className="r">{r.absGap}</td><td className="hub-m small">{r.worst ? `${dmy(r.worst.date)} ${r.worst.session}: ${r.worst.gap} kg` : "–"}</td></tr>
        ))}</tbody>
      </table></div>
      {v.investigate.length > 0 && (
        <section className="hub-card"><h3>🔎 Look into these</h3>
          {v.investigate.map((r, i) => <div key={i} className="ins-w hub-card"><b>{dmy(r.date)} {r.session} · {r.product}: {r.gap! > 0 ? "+" : ""}{r.gap} kg</b><span className="hub-m small">{r.hint}</span></div>)}
        </section>
      )}
      {!v.rows.length && <p className="hub-m">No stock counts in this period. Count stock in the Quick Register or <a href="/stock">Stock tally</a>.</p>}
    </>
  );
}

interface DepSet { perBarrelInr: number; maxDays: number; paid: Record<string, number> }
export function DepositsTab() {
  const [fleet, setFleet] = useState<FleetLite[]>([]);
  const [s, setS] = useState<DepSet>({ perBarrelInr: 0, maxDays: 15, paid: {} });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/barrel-fleet").then((r) => r.json()).then((j) => setFleet(j.data?.barrels || j.data || [])).catch(() => {});
    fetch("/api/settings/app?key=deposits").then((r) => r.json()).then((j) => j.data && setS((x) => ({ ...x, ...j.data }))).catch(() => {});
  }, []);
  const rows = useMemo(() => barrelDeposits(Array.isArray(fleet) ? fleet : [], Date.now(), s), [fleet, s]);
  const save = async (next: DepSet) => { setS(next); const r = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "deposits", data: next }) }); setMsg(r.ok ? "Saved ✓" : "Could not save"); setTimeout(() => setMsg(null), 2000); };
  const wa = (h: (typeof rows)[number]) => `https://wa.me/?text=${encodeURIComponent(`Namaste ${h.holder}, ${h.barrels.length} of our barrels (${h.barrels.map((b) => b.code).join(", ")}) are with you — the oldest for ${h.oldestDays} days. Please return the empty barrels. — Mahadev Traders`)}`;
  return (
    <>
      <div className="ins-row">
        <label>Deposit per barrel ₹ <input type="number" value={s.perBarrelInr || ""} onChange={(e) => setS({ ...s, perBarrelInr: Number(e.target.value) || 0 })} /></label>
        <label>Return within (days) <input type="number" value={s.maxDays} onChange={(e) => setS({ ...s, maxDays: Number(e.target.value) || 15 })} /></label>
        <button className="hub-btn primary" onClick={() => void save(s)}>Save</button>{msg && <span className="hub-m">{msg}</span>}
      </div>
      <div className="ins-cards">{rows.map((h) => (
        <div key={h.holder} className={`hub-card ins-run ${h.late ? "out" : "ok"}`}>
          <div className="ins-run-h"><b>{h.holder}</b><span className="ins-chip">{h.barrels.length} barrels</span></div>
          <small className="hub-m">{h.barrels.map((b) => `${b.code} (${b.days} d)`).join(" · ")}</small>
          {h.late > 0 && <small className="bad">{h.late} out longer than {s.maxDays} days</small>}
          {s.perBarrelInr > 0 && <small>Deposit due {rs(h.depositDue)} {h.paid ? `(paid ${rs(h.paid)})` : ""}</small>}
          <div className="ins-row">
            <a className="hub-btn sm" href={wa(h)} target="_blank" rel="noreferrer">📤 Ask to return</a>
            {s.perBarrelInr > 0 && <label>Paid ₹ <input type="number" value={s.paid[h.holder.toLowerCase()] || ""} onChange={(e) => setS({ ...s, paid: { ...s.paid, [h.holder.toLowerCase()]: Number(e.target.value) || 0 } })} onBlur={() => void save(s)} /></label>}
          </div>
        </div>
      ))}</div>
      {!rows.length && <p className="hub-m">All barrels are at the shop. (Barrels marked with a customer, supplier or vehicle on the barrel page show here.)</p>}
    </>
  );
}
