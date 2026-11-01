"use client";

// 🏭 Insights → Orders & suppliers, Machines, Forecast, Watch, Weekly review. Numbers from lib/ops.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { anomalies, demandForecast, machineReport, poProgress, seedSplit, supplierScores, weeklyReview, type MachineLogLite, type PoLine, type PurchaseOrderLite } from "@/lib/ops";
import type { Budgets, RateCards } from "@/lib/money";

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("-") : "–");
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const getSetting = (key: string) => fetch(`/api/settings/app?key=${key}`).then((r) => r.json()).then((j) => j.data ?? null).catch(() => null);
const md = (t: string) => t.split("\n").map((l, i) => <div key={i} className={l.startsWith("**") ? "ins-wk-h" : ""}>{l.replace(/\*\*/g, "") || " "}</div>);

// ------------------------------------------------------------------ purchase orders + supplier scores
const STATUS: Record<string, string> = { open: "⏳ Open", part: "🚚 Part received", done: "✅ Received", late: "⚠️ Late", cancelled: "✕ Cancelled" };
export function OrdersTab({ d, today }: { d: BizData; today: string }) {
  const [orders, setOrders] = useState<PurchaseOrderLite[]>([]);
  const [form, setForm] = useState<{ supplier: string; phone: string; dueDate: string; lines: PoLine[] }>({ supplier: "", phone: "", dueDate: shift(today, 3), lines: [{ item: "", qty: 0, unit: "kg", rate: 0 }] });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/orders").then((r) => r.json()).then((j) => setOrders(j.data || [])).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const prog = useMemo(() => poProgress(orders, d, today), [orders, d, today]);
  const scores = useMemo(() => supplierScores(d, prog, today), [d, prog, today]);
  const suppliers = useMemo(() => Array.from(new Set(d.register.filter((e) => e.kind === "PURCHASE" && e.partyName).map((e) => e.partyName!.trim()).concat(d.purchases.map((p) => p.party?.name || "").filter(Boolean)))).sort(), [d]);
  const setLine = (i: number, p: Partial<PoLine>) => setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const save = async () => {
    const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, date: today }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || "Could not save.");
    setMsg(`${j.data.no} saved ✓`);
    setForm({ supplier: "", phone: "", dueDate: shift(today, 3), lines: [{ item: "", qty: 0, unit: "kg", rate: 0 }] });
    void load();
  };
  const share = (p: (typeof prog)[number]) => {
    const o = orders.find((x) => x.id === p.id) as (PurchaseOrderLite & { phone?: string | null }) | undefined;
    const text = [`*Purchase order ${p.no}* — Mahadev Traders`, `Date: ${dmy(p.date)}${p.dueDate ? ` · Deliver by ${dmy(p.dueDate)}` : ""}`, ...p.lines.map((l) => `• ${l.item}: ${l.qty} ${l.unit}${l.rate ? ` @ ₹${l.rate}` : ""}`)].join("\n");
    const ph = (o?.phone || "").replace(/\D/g, "");
    return `https://wa.me/${ph.length === 10 ? `91${ph}` : ph}?text=${encodeURIComponent(text)}`;
  };
  const cancel = async (id: string, status: string) => { await fetch("/api/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); void load(); };
  return (
    <>
      <section className="hub-card">
        <h3>＋ New purchase order</h3>
        <div className="ins-row">
          <label>Supplier <input list="po-sup" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></label>
          <datalist id="po-sup">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          <label>WhatsApp no. <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Deliver by <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        </div>
        {form.lines.map((l, i) => (
          <div key={i} className="ins-row">
            <label>Item <input value={l.item} placeholder="Groundnut seed" onChange={(e) => setLine(i, { item: e.target.value })} /></label>
            <label>Qty <input type="number" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} /></label>
            <label>Unit <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{["kg", "qtl", "ltr", "tin", "pcs"].map((u) => <option key={u}>{u}</option>)}</select></label>
            <label>Rate ₹ <input type="number" value={l.rate || ""} onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} /></label>
          </div>
        ))}
        <div className="ins-row">
          <button className="hub-btn sm" onClick={() => setForm({ ...form, lines: [...form.lines, { item: "", qty: 0, unit: "kg", rate: 0 }] })}>＋ Item</button>
          <button className="hub-btn primary" onClick={() => void save()}>Save order</button>
          {msg && <span className="hub-m">{msg}</span>}
        </div>
        <p className="hub-m small">When the goods come, just enter the purchase as usual (Quick Register or Purchase desk) with the same supplier name — the order fills itself.</p>
      </section>
      <div className="ins-cards">
        {prog.map((p) => (
          <div key={p.id} className={`hub-card ins-run ${p.status === "late" ? "out" : p.status === "done" ? "ok" : p.status === "part" ? "low" : ""}`}>
            <div className="ins-run-h"><b>{p.no} · {p.supplier}</b><span className="ins-chip">{STATUS[p.status]}</span></div>
            <small className="hub-m">{dmy(p.date)}{p.dueDate ? ` → due ${dmy(p.dueDate)}` : ""}{p.lateDays ? ` · ${p.lateDays} days late` : ""}</small>
            {p.lines.map((l) => (
              <div key={l.item} className="ins-bar"><span className="n">{l.item}</span><span className="b"><i style={{ width: `${Math.min(100, (l.got / l.qty) * 100)}%` }} /></span><span className="v">{l.got}/{l.qty}</span>{l.avgRate != null && l.rate > 0 && l.avgRate > l.rate && <small className="bad">billed ₹{l.avgRate} vs ordered ₹{l.rate}</small>}</div>
            ))}
            <div className="ins-row">
              <a className="hub-btn sm" href={share(p)} target="_blank" rel="noreferrer">📤 WhatsApp</a>
              {p.status !== "done" && <button className="hub-btn sm" onClick={() => void cancel(p.id, p.status === "cancelled" ? "open" : "cancelled")}>{p.status === "cancelled" ? "Reopen" : "Cancel"}</button>}
            </div>
          </div>
        ))}
      </div>
      <section className="hub-card">
        <h3>⭐ Supplier scores <small className="hub-m">(last 6 months)</small></h3>
        <div className="ins-tbl"><table>
          <thead><tr><th>Supplier</th><th className="r">Score</th><th className="r">Oil yield</th><th className="r">On time</th><th className="r">Price vs avg</th><th className="r">Buys</th><th>Watch</th></tr></thead>
          <tbody>{scores.map((s) => (
            <tr key={s.supplier} className={s.score < 45 ? "low" : ""}>
              <td><b>{s.supplier}</b><div className="hub-m small">last {dmy(s.lastDate)}</div></td>
              <td className={`r ${s.score >= 60 ? "good" : s.score < 45 ? "bad" : ""}`}>{s.score}</td>
              <td className="r">{s.yieldPct == null ? "–" : `${s.yieldPct}%`}</td>
              <td className="r">{s.onTimePct == null ? "–" : `${s.onTimePct}%`}</td>
              <td className={`r ${s.rateVsAvgPct != null && s.rateVsAvgPct > 2 ? "bad" : ""}`}>{s.rateVsAvgPct == null ? "–" : `${s.rateVsAvgPct > 0 ? "+" : ""}${s.rateVsAvgPct}%`}</td>
              <td className="r">{s.buys}</td>
              <td className="hub-m small">{s.notes.join(" · ")}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="hub-m small">Score out of 100: oil yield 40, on-time delivery 30, price against what you paid others for the same item 30.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ machines
export function MachinesTab({ d, today }: { d: BizData; today: string }) {
  const [logs, setLogs] = useState<MachineLogLite[]>([]);
  const [days, setDays] = useState(30);
  const [oilRate, setOilRate] = useState<number | null>(null);
  useEffect(() => { fetch(`/api/machines?from=${shift(today, -365)}`).then((r) => r.json()).then((j) => setLogs(j.data || [])).catch(() => {}); }, [today]);
  useEffect(() => {
    const rates = d.register.filter((e) => e.kind === "SALE" && e.rateInr && /karadi|safflower|oil/i.test(`${e.item} ${e.itemLabel}`)).slice(0, 30).map((e) => e.rateInr!);
    setOilRate(rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null);
  }, [d]);
  const rows = useMemo(() => machineReport(d, logs, shift(today, -days), { oilRate }), [d, logs, today, days, oilRate]);
  return (
    <>
      <div className="ins-range">
        {[30, 90, 180].map((n) => <button key={n} className={`hub-btn sm${days === n ? " primary" : ""}`} onClick={() => setDays(n)}>{n} days</button>)}
        <a className="hub-btn sm" href="/machines">⚙️ Log hours / power / service</a>
      </div>
      {rows.filter((r) => r.serviceDue).map((r) => <div key={r.machine} className="hub-banner ins-bad">🔧 <b>{r.machine}</b> has run {r.hoursSinceService} hours since its last service ({dmy(r.lastService)}) — service due.</div>)}
      <div className="ins-cards">
        {rows.map((r) => {
          const sp = seedSplit(r);
          return (
            <div key={r.machine} className="hub-card ins-mach">
              <div className="ins-run-h"><b>⚙️ {r.machine}</b><span className="hub-m small">{r.batches} batches · {Math.round(r.seedKg).toLocaleString("en-IN")} kg seed</span></div>
              {sp && (
                <>
                  <div className="ins-split" aria-label="Where 100 kg of seed went">
                    <i className="o" style={{ width: `${sp.oil}%` }} title={`Oil ${sp.oil}%`} />
                    <i className="s" style={{ width: `${sp.sediment}%` }} title={`Sediment ${sp.sediment}%`} />
                    <i className="c" style={{ width: `${sp.cake}%` }} title={`Cake ${sp.cake}%`} />
                    <i className="l" style={{ width: `${sp.loss}%` }} title={`Unaccounted ${sp.loss}%`} />
                  </div>
                  <small className="hub-m">100 kg seed → oil {sp.oil} · sediment {sp.sediment} · cake {sp.cake} · lost {sp.loss} kg</small>
                </>
              )}
              <div className="ins-mstats">
                <span><b>{r.oilPct ?? "–"}%</b><small>oil yield</small></span>
                <span><b className={r.sedimentPct != null && r.sedimentPct > 12 ? "bad" : ""}>{r.sedimentPct ?? "–"}%</b><small>sediment of crude</small></span>
                <span><b>{r.unitsPerQtl ?? "–"}</b><small>units / qtl</small></span>
                <span><b>{r.downtimeHrs}h</b><small>stopped</small></span>
              </div>
              {r.sedimentLossInr != null && <small className="hub-m">Oil trapped in {r.sedimentKg} kg sediment ≈ {rs(r.sedimentLossInr)} — better filtering / re-pressing can win part of it back.</small>}
              {r.lossPct != null && r.lossPct > 2 && <small className="bad">Unaccounted loss {r.lossPct}% — above the 2% limit.</small>}
            </div>
          );
        })}
      </div>
      {!rows.length && <p className="hub-m">No batches with a machine (mill) name yet. Fill “Mill” on Manufacturing batches, and log hours on the machines page.</p>}
    </>
  );
}

// ------------------------------------------------------------------ forecast
export function ForecastTab({ d, today }: { d: BizData; today: string }) {
  const rows = useMemo(() => demandForecast(d, today), [d, today]);
  return (
    <>
      <p className="hub-m">Kg likely to sell each week — from the last 12 weeks, the recent trend, and festival weeks (Diwali, Sankranti, Ugadi, Eid, Dasara…).</p>
      <div className="ins-tbl"><table>
        <thead><tr><th>Product</th><th>Last 12 weeks</th><th className="r">Avg / week</th><th className="r">Trend</th>{rows[0]?.next.map((n) => <th key={n.week} className="r">wk {dmy(n.week).slice(0, 5)}</th>)}<th className="r">Next 4 wks</th></tr></thead>
        <tbody>{rows.map((f) => {
          const max = Math.max(1, ...f.weekly);
          return (
            <tr key={f.product}>
              <td><b>{f.product}</b></td>
              <td><svg viewBox="0 0 120 24" width="120" height="24" className="ins-spark"><polyline points={f.weekly.map((v, i) => `${(i / (f.weekly.length - 1)) * 120},${22 - (v / max) * 20}`).join(" ")} /></svg></td>
              <td className="r">{f.avg4} kg</td>
              <td className={`r ${f.trendPct != null && f.trendPct < -10 ? "bad" : f.trendPct != null && f.trendPct > 10 ? "good" : ""}`}>{f.trendPct == null ? "–" : `${f.trendPct > 0 ? "+" : ""}${f.trendPct}%`}</td>
              {f.next.map((n) => <td key={n.week} className="r">{n.kg}{n.festival && <div className="ins-chip low">{n.festival}</div>}</td>)}
              <td className="r"><b>{f.next4} kg</b></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {!rows.length && <p className="hub-m">No sales with kg yet.</p>}
    </>
  );
}

// ------------------------------------------------------------------ watch (anomalies) + weekly review
function useCardsBudgets() {
  const [o, setO] = useState<{ cards: RateCards | null; budgets: Budgets | null }>({ cards: null, budgets: null });
  useEffect(() => { void Promise.all([getSetting("rates"), getSetting("budgets")]).then(([cards, budgets]) => setO({ cards, budgets })); }, []);
  return o;
}
export function WatchTab({ d, today }: { d: BizData; today: string }) {
  const o = useCardsBudgets();
  const [days, setDays] = useState(7);
  const list = useMemo(() => anomalies(d, today, { ...o, days }), [d, today, o, days]);
  return (
    <>
      <div className="ins-range">{[3, 7, 30].map((n) => <button key={n} className={`hub-btn sm${days === n ? " primary" : ""}`} onClick={() => setDays(n)}>Last {n} days</button>)}</div>
      {list.length === 0 && <div className="hub-banner ins-good">✅ Nothing unusual — no low rates, back-dated or edited entries, cash gaps, big discounts or budget breaks.</div>}
      <div className="ins-watch">
        {list.map((a, i) => (
          <a key={i} href={a.path} className={`hub-card ins-w ${a.level}`}>
            <span className="ins-chip">{a.level === "red" ? "🔴" : "🟠"} {a.area}</span>
            <span>{a.text}</span>
          </a>
        ))}
      </div>
      <p className="hub-m small">Checks: sale rate 8%+ below the rate card or the usual; entries made 2+ days later or after 11 pm; entries changed after saving; an expense day 3× normal; cash short at closing; discounts of 10%+; budgets crossed. These also come in the bot&apos;s 🔔 alerts.</p>
    </>
  );
}
export function WeeklyTab({ d, today }: { d: BizData; today: string }) {
  const o = useCardsBudgets();
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const w = useMemo(() => weeklyReview(d, today, o), [d, today, o]);
  const ask = async () => {
    setBusy(true);
    const r = await fetch("/api/review", { method: "POST" }).then((x) => x.json()).catch(() => ({}));
    setAi(r.data?.ai || r.error || "AI is not set up.");
    setBusy(false);
  };
  return (
    <>
      <section className="hub-card ins-wk">{md(w.text)}</section>
      <div className="ins-row">
        <button className="hub-btn primary" disabled={busy} onClick={() => void ask()}>{busy ? "Thinking…" : "🤖 AI advice on this week"}</button>
        <span className="hub-m small">Comes to Telegram / Discord every Sunday morning too.</span>
      </div>
      {ai && <section className="hub-card ins-wk">{md(ai)}</section>}
    </>
  );
}
