"use client";

// 💰 Insights → Profit & cash, Budgets, Rate cards. Numbers from lib/money.ts (pure).
import { useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { expenseReport } from "@/lib/bizReports";
import { EMPTY_CARDS, budgetRows, cashForecast, profitLoss, type Budgets, type RateCards } from "@/lib/money";

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const dmy = (d: string) => d.split("-").reverse().join("-");
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const put = (key: string, data: unknown) => fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, data }) }).then((r) => r.ok);
const get = (key: string) => fetch(`/api/settings/app?key=${key}`).then((r) => r.json()).then((j) => j.data ?? null).catch(() => null);

function useSaved() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, flash: (ok: boolean) => { setMsg(ok ? "Saved ✓" : "Could not save"); setTimeout(() => setMsg(null), 2500); } };
}

// ------------------------------------------------------------------ profit & loss + cash forecast
interface CashPlan { openingInr: number; collectPct: number; fixed: { name: string; amountInr: number; day: number }[] }
const PERIODS = [
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];
export function PlTab({ d, today }: { d: BizData; today: string }) {
  const [period, setPeriod] = useState("month");
  const [plan, setPlan] = useState<CashPlan>({ openingInr: 0, collectPct: 40, fixed: [] });
  const s = useSaved();
  useEffect(() => { void get("cashplan").then((p) => p && setPlan((x) => ({ ...x, ...p }))); }, []);
  const span = useMemo(() => {
    if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
    if (period === "last") { const end = shift(`${today.slice(0, 8)}01`, -1); return { from: `${end.slice(0, 8)}01`, to: end }; }
    return { from: shift(today, -Number(period) + 1), to: today };
  }, [period, today]);
  const pl = useMemo(() => profitLoss(d, span), [d, span]);
  const fc = useMemo(() => cashForecast(d, { openingInr: plan.openingInr, today, collectPct: plan.collectPct, fixed: plan.fixed }), [d, today, plan]);
  const max = Math.max(1, ...fc.series.map((p) => Math.abs(p.inr)));
  const W = 600, H = 160, y0 = H / 2;
  const pts = fc.series.map((p, i) => `${(i / (fc.series.length - 1)) * W},${y0 - (p.inr / max) * (H / 2 - 8)}`).join(" ");
  const setFixed = (i: number, patch: Partial<CashPlan["fixed"][number]>) => setPlan({ ...plan, fixed: plan.fixed.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <>
      <div className="ins-range">
        {PERIODS.map((p) => <button key={p.key} className={`hub-btn sm${period === p.key ? " primary" : ""}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
        <span className="hub-m small">{dmy(span.from)} → {dmy(span.to)}</span>
      </div>
      <div className="ins-kpis">
        <div className="hub-card"><small>Sales</small><b>{rs(pl.sales)}</b></div>
        <div className="hub-card"><small>Purchases</small><b>{rs(pl.purchases)}</b></div>
        <div className="hub-card"><small>Running expenses</small><b>{rs(pl.expenses)}</b></div>
        <div className={`hub-card ${pl.net >= 0 ? "ins-good" : "ins-bad"}`}><small>Net (before stock change)</small><b>{rs(pl.net)}</b>{pl.marginPct != null && <small>{pl.marginPct}% of sales</small>}</div>
      </div>
      {pl.topExpenses.length > 0 && (
        <section className="hub-card"><h3>Where the expenses went</h3>
          <div className="ins-bars">{pl.topExpenses.map((e) => (
            <div key={e.name} className="ins-bar"><span className="n">{e.name}</span><span className="b"><i className="down" style={{ width: `${Math.round((e.amount / pl.topExpenses[0].amount) * 100)}%` }} /></span><span className="v">{rs(e.amount)}</span></div>
          ))}</div>
        </section>
      )}
      <p className="hub-m small">Sales − purchases − running expenses (supplier payments are left out — the purchase is already counted). Stock bought but not yet sold makes this look lower; it is a guide, not your audited P&amp;L.</p>

      <section className="hub-card">
        <h3>💸 Cash in the next 30 days</h3>
        <div className={`hub-banner ${fc.firstNegative ? "ins-bad" : "ins-good"}`}>
          {fc.firstNegative
            ? <>⚠️ Cash may run short around <b>{dmy(fc.firstNegative)}</b> (lowest {rs(fc.low.inr)} on {dmy(fc.low.date)}). Collect udhaar or delay a purchase.</>
            : <>✅ Cash stays positive — about {rs(fc.end)} in 30 days (lowest {rs(fc.low.inr)} on {dmy(fc.low.date)}).</>}
        </div>
        <div className="ins-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cash forecast">
          <line className="grid" x1="0" x2={W} y1={y0} y2={y0} />
          <polyline className="ln" points={pts} />
        </svg></div>
        <p className="hub-m small">Money in ≈ {rs(fc.inPerDay)}/day · out ≈ {rs(fc.outPerDay)}/day (last 60 days) · udhaar pending {rs(fc.udhaarPending)}, expecting {plan.collectPct}% of it back this month.</p>
        <div className="ins-row">
          <label>Cash + bank today ₹ <input type="number" value={plan.openingInr || ""} onChange={(e) => setPlan({ ...plan, openingInr: Number(e.target.value) || 0 })} /></label>
          <label>Udhaar you expect back % <input type="number" value={plan.collectPct} onChange={(e) => setPlan({ ...plan, collectPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
        </div>
        <h4>Fixed monthly payments (rent, EMI, power bill…)</h4>
        {plan.fixed.map((f, i) => (
          <div key={i} className="ins-row">
            <label>Name <input value={f.name} onChange={(e) => setFixed(i, { name: e.target.value })} /></label>
            <label>₹ <input type="number" value={f.amountInr || ""} onChange={(e) => setFixed(i, { amountInr: Number(e.target.value) || 0 })} /></label>
            <label>Day of month <input type="number" min={1} max={31} value={f.day} onChange={(e) => setFixed(i, { day: Number(e.target.value) || 1 })} /></label>
            <button className="hub-btn sm" onClick={() => setPlan({ ...plan, fixed: plan.fixed.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="ins-row">
          <button className="hub-btn sm" onClick={() => setPlan({ ...plan, fixed: [...plan.fixed, { name: "", amountInr: 0, day: 5 }] })}>＋ Add payment</button>
          <button className="hub-btn primary" onClick={async () => s.flash(await put("cashplan", plan))}>Save</button>
          {s.msg && <span className="hub-m">{s.msg}</span>}
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ budgets
export function BudgetTab({ d, today }: { d: BizData; today: string }) {
  const [b, setB] = useState<Budgets>({});
  const s = useSaved();
  useEffect(() => { void get("budgets").then((x) => x && setB(x)); }, []);
  const rows = useMemo(() => budgetRows(b, d, today), [b, d, today]);
  const cats = useMemo(() => expenseReport(d, { from: shift(today, -90), to: today }).byCategory.map((c) => c.key).filter((k) => !/supplier/i.test(k)), [d, today]);
  const names = Array.from(new Set(cats.concat(Object.keys(b))));
  return (
    <>
      {rows.filter((r) => r.level !== "ok").map((r) => (
        <div key={r.name} className={`hub-banner ${r.level === "over" ? "ins-bad" : ""}`}>
          {r.level === "over" ? "🔴" : "🟠"} <b>{r.name}</b>: {rs(r.spent)} of {rs(r.limit)} spent{r.level === "watch" ? ` — on pace for ${rs(r.projected)} this month` : " — over budget"}.
        </div>
      ))}
      <div className="ins-cards">
        {rows.map((r) => (
          <div key={r.name} className={`hub-card ins-run ${r.level === "over" ? "out" : r.level === "watch" ? "low" : "ok"}`}>
            <div className="ins-run-h"><b>{r.name}</b><span className={`ins-chip ${r.level === "over" ? "out" : r.level === "watch" ? "low" : "ok"}`}>{r.pct}%</span></div>
            <div className="ins-bar" style={{ gridTemplateColumns: "1fr" }}><span className="b"><i className={r.level === "ok" ? "" : "down"} style={{ width: `${Math.min(100, r.pct)}%` }} /></span></div>
            <small className="hub-m">{rs(r.spent)} of {rs(r.limit)} · month-end pace {rs(r.projected)}</small>
          </div>
        ))}
      </div>
      <section className="hub-card">
        <h3>Monthly limits</h3>
        <div className="ins-tbl"><table>
          <thead><tr><th>Expense</th><th>₹ per month (blank = no limit)</th></tr></thead>
          <tbody>{names.map((n) => (
            <tr key={n}><td>{n}</td><td><input type="number" value={b[n] || ""} onChange={(e) => setB({ ...b, [n]: Number(e.target.value) || 0 })} aria-label={`${n} budget`} /></td></tr>
          ))}</tbody>
        </table></div>
        <div className="ins-row">
          <button className="hub-btn primary" onClick={async () => s.flash(await put("budgets", Object.fromEntries(Object.entries(b).filter(([, v]) => v > 0))))}>Save limits</button>
          {s.msg && <span className="hub-m">{s.msg}</span>}
        </div>
        <p className="hub-m small">Categories come from your last 90 days of expenses. Orange = on pace to cross the limit this month; red = already over.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ rate cards
export function RatesTab({ d }: { d: BizData }) {
  const [c, setC] = useState<RateCards>(EMPTY_CARDS);
  const [newList, setNewList] = useState("");
  const [party, setParty] = useState("");
  const s = useSaved();
  useEffect(() => { void get("rates").then((x) => x && setC({ ...EMPTY_CARDS, ...x })); }, []);
  const items = useMemo(() => {
    const names = new Set<string>();
    d.items.filter((i) => i.active).forEach((i) => names.add(i.name.toLowerCase()));
    c.lists.forEach((l) => Object.keys(l.rates).forEach((k) => names.add(k)));
    return Array.from(names).sort();
  }, [d.items, c.lists]);
  const parties = useMemo(() => Array.from(new Set(d.register.map((e) => (e.partyName || "").trim()).concat(d.sales.map((x) => x.party?.name || "")).filter(Boolean))).sort(), [d]);
  const setRate = (key: string, item: string, v: string) => setC({ ...c, lists: c.lists.map((l) => (l.key === key ? { ...l, rates: { ...l.rates, [item]: Number(v) || 0 } } : l)) });
  const clean = (x: RateCards): RateCards => ({ ...x, lists: x.lists.map((l) => ({ ...l, rates: Object.fromEntries(Object.entries(l.rates).filter(([, v]) => v > 0)) })) });
  return (
    <>
      <section className="hub-card">
        <h3>📋 Price lists <small className="hub-m">(₹ per unit before GST)</small></h3>
        <div className="ins-tbl"><table>
          <thead><tr><th>Item</th>{c.lists.map((l) => <th key={l.key}>{l.name}{c.defaultList === l.key ? " ★" : ""}</th>)}</tr></thead>
          <tbody>{items.map((it) => (
            <tr key={it}><td>{it}</td>{c.lists.map((l) => <td key={l.key}><input type="number" inputMode="decimal" value={l.rates[it] || ""} onChange={(e) => setRate(l.key, it, e.target.value)} aria-label={`${l.name} ${it}`} /></td>)}</tr>
          ))}</tbody>
        </table></div>
        <div className="ins-row">
          <label>New list (e.g. Hotel, Caterer) <input value={newList} onChange={(e) => setNewList(e.target.value)} /></label>
          <button className="hub-btn sm" disabled={!newList.trim()} onClick={() => { setC({ ...c, lists: [...c.lists, { key: newList.trim().toLowerCase().replace(/\W+/g, "-"), name: newList.trim(), rates: {} }] }); setNewList(""); }}>＋ Add list</button>
          <label>Walk-in customers use <select value={c.defaultList || ""} onChange={(e) => setC({ ...c, defaultList: e.target.value })}>{c.lists.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}</select></label>
        </div>
      </section>
      <section className="hub-card">
        <h3>Which customer gets which list</h3>
        <div className="ins-row">
          <label>Customer <input list="rate-parties" value={party} onChange={(e) => setParty(e.target.value)} /></label>
          <datalist id="rate-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
          {c.lists.map((l) => <button key={l.key} className="hub-btn sm" disabled={!party.trim()} onClick={() => { setC({ ...c, parties: { ...c.parties, [party.trim().toLowerCase()]: l.key } }); setParty(""); }}>→ {l.name}</button>)}
        </div>
        <ul className="ins-plist">{Object.entries(c.parties).map(([p, k]) => (
          <li key={p}><b>{p}</b> → {c.lists.find((l) => l.key === k)?.name || k} <button className="hub-btn sm" onClick={() => { const n = { ...c.parties }; delete n[p]; setC({ ...c, parties: n }); }}>✕</button></li>
        ))}</ul>
      </section>
      <div className="ins-row">
        <button className="hub-btn primary" onClick={async () => s.flash(await put("rates", clean(c)))}>Save rate cards</button>
        {s.msg && <span className="hub-m">{s.msg}</span>}
      </div>
      <p className="hub-m small">The Sales desk fills the card rate when you pick an item and shows it in red if a bill goes below it.</p>
    </>
  );
}
