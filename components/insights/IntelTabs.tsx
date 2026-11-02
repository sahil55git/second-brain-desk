"use client";

// 🧠 Insights → Should-yield, Buy advisor, Cost per kg, Smart reorder, What-if, Weather, Year-on-year.
import { useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { DEFAULT_COSTS, runOut, yieldLots } from "@/lib/insights";
import { cashForecast } from "@/lib/money";
import { demandForecast } from "@/lib/ops";
import { mandiSignals, COMMODITIES, type MandiRow, type MandiSignal } from "@/lib/mandi";
import { DEFAULT_COST_SET, REGIONS, buyAdvice, costPerKg, lotHistory, shouldYield, smartReorder, weatherNote, whatIf, yoy, type CostSet, type RegionWeather, type WhatIf } from "@/lib/intel";

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const rs2 = (n: number | null | undefined) => (n == null ? "–" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const getSetting = (key: string) => fetch(`/api/settings/app?key=${key}`).then((r) => r.json()).then((j) => j.data ?? null).catch(() => null);
const useMandi = () => {
  const [m, setM] = useState<MandiSignal[]>([]);
  useEffect(() => { fetch("/api/mandi").then((r) => r.json()).then((j) => setM(j.data ? mandiSignals(j.data.rows as MandiRow[], COMMODITIES) : [])).catch(() => {}); }, []);
  return m;
};

// ------------------------------------------------------------------ should-yield
export function PredictTab({ d, today }: { d: BizData; today: string }) {
  const obs = useMemo(() => lotHistory(d, shift(today, -365)), [d, today]);
  const suppliers = Array.from(new Set(obs.map((o) => o.supplier))).sort();
  const products = Array.from(new Set(obs.map((o) => o.product))).sort();
  const [q, setQ] = useState({ product: products[0] || "Karadi oil", supplier: "", moisture: "", oilRate: "", cakeRate: "22", crush: "8", offer: "" });
  const g = shouldYield(obs, { product: q.product, supplier: q.supplier || undefined, moisturePct: q.moisture ? Number(q.moisture) : null, oilRate: Number(q.oilRate) || null, cakeRate: Number(q.cakeRate) || 0, crushPerKg: Number(q.crush) || 0 });
  const offer = Number(q.offer) || null;
  return (
    <>
      <section className="hub-card">
        <h3>🔮 Before you buy a seed lot</h3>
        <div className="ins-row">
          <label>Oil <select value={q.product} onChange={(e) => setQ({ ...q, product: e.target.value })}>{(products.length ? products : ["Karadi oil"]).map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Supplier <input list="py-sup" value={q.supplier} onChange={(e) => setQ({ ...q, supplier: e.target.value })} /></label>
          <datalist id="py-sup">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          <label>Moisture % <input type="number" value={q.moisture} onChange={(e) => setQ({ ...q, moisture: e.target.value })} /></label>
          <label>Oil sells ₹/kg <input type="number" value={q.oilRate} onChange={(e) => setQ({ ...q, oilRate: e.target.value })} /></label>
          <label>Cake ₹/kg <input type="number" value={q.cakeRate} onChange={(e) => setQ({ ...q, cakeRate: e.target.value })} /></label>
          <label>Crushing ₹/kg oil <input type="number" value={q.crush} onChange={(e) => setQ({ ...q, crush: e.target.value })} /></label>
          <label>Seed offered at ₹/kg <input type="number" value={q.offer} onChange={(e) => setQ({ ...q, offer: e.target.value })} /></label>
        </div>
      </section>
      <div className="ins-kpis">
        <div className="hub-card"><small>Expected oil</small><b>{g.expectedPct == null ? "–" : `${g.expectedPct}%`}</b><small>{g.low != null ? `likely ${g.low}–${g.high}%` : g.basis}</small></div>
        <div className="hub-card"><small>Fair seed price</small><b>{rs2(g.fairSeedRate)}</b><small>break-even per kg of seed</small></div>
        {offer && g.fairSeedRate && <div className={`hub-card ${offer <= g.fairSeedRate ? "ins-good" : "ins-bad"}`}><small>Offer ₹{offer}</small><b>{offer <= g.fairSeedRate ? "✅ Worth it" : "❌ Too costly"}</b><small>{offer <= g.fairSeedRate ? `₹${(g.fairSeedRate - offer).toFixed(2)}/kg margin` : `₹${(offer - g.fairSeedRate).toFixed(2)}/kg loss`}</small></div>}
      </div>
      <p className="hub-m small">From {g.basis}. Wetter seed gives less oil; the fair price = oil % × oil rate + cake % × cake rate − crushing.</p>
    </>
  );
}

// ------------------------------------------------------------------ buy advisor
export function AdvisorTab({ d, today }: { d: BizData; today: string }) {
  const mandi = useMandi();
  const [cash, setCash] = useState<number | null>(null);
  useEffect(() => { void getSetting("cashplan").then((p) => { const f = cashForecast(d, { openingInr: p?.openingInr || 0, today, collectPct: p?.collectPct ?? 40, fixed: p?.fixed || [] }); setCash(p ? f.low.inr : null); }); }, [d, today]);
  const advice = useMemo(() => buyAdvice(runOut(d, today), mandi, { month: Number(today.slice(5, 7)), cashLow: cash }), [d, today, mandi, cash]);
  const col: Record<string, string> = { "buy now": "out", "buy a little": "low", wait: "", "no need": "ok" };
  return (
    <>
      <div className="ins-cards">{advice.map((a) => (
        <div key={a.key} className={`hub-card ins-run ${col[a.action]}`}>
          <div className="ins-run-h"><b>{a.name}</b><span className={`ins-chip ${col[a.action]}`}>{a.action}</span></div>
          <ul className="hub-m small" style={{ margin: 0, paddingLeft: 18 }}>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ))}</div>
      <p className="hub-m small">Looks at days of stock left, the mandi price against its 30-day average, harvest season, and whether cash is tight this month (Profit &amp; cash). A guide, not a guarantee.</p>
    </>
  );
}

// ------------------------------------------------------------------ cost per kg
export function CostTab({ d, today }: { d: BizData; today: string }) {
  const [set, setSet] = useState<CostSet>(DEFAULT_COST_SET);
  const [units, setUnits] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void getSetting("costs").then((c) => c && setSet((s) => ({ ...s, ...c })));
    fetch(`/api/machines?from=${shift(today, -29)}`).then((r) => r.json()).then((j) => setUnits(((j.data || []) as { date: string; powerUnits: number | null }[]).filter((l) => l.date >= shift(today, -29)).reduce((a, l) => a + (l.powerUnits || 0), 0))).catch(() => {});
  }, [today]);
  const oilKg = useMemo(() => yieldLots(d, shift(today, -29)).reduce((a, l) => a + l.oilKg, 0), [d, today]);
  const cake = Object.fromEntries(Object.entries(DEFAULT_COSTS).map(([k, v]) => [k, v.cakeRate]));
  const rows = useMemo(() => costPerKg(d, today, set, { powerUnits30: units, oilKg30: oilKg, cakeRate: cake }), [d, today, set, units, oilKg]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { const r = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "costs", data: set }) }); setMsg(r.ok ? "Saved ✓" : "Could not save"); };
  return (
    <>
      <div className="ins-tbl"><table>
        <thead><tr><th>Oil</th><th className="r">Seed</th><th className="r">Power</th><th className="r">Labour</th><th className="r">Packing</th><th className="r">Freight</th><th className="r">Interest</th><th className="r">Cake back</th><th className="r">True cost /kg</th><th className="r">Selling</th><th className="r">Margin</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key} className={r.margin != null && r.margin < 0 ? "low" : ""}>
            <td><b>{r.name}</b>{r.oilPct != null && <div className="hub-m small">{r.oilPct}% oil</div>}</td>
            <td className="r">{rs2(r.seed)}</td><td className="r">{rs2(r.power)}</td><td className="r">{rs2(r.labour)}</td><td className="r">{rs2(r.packing)}</td><td className="r">{rs2(r.freight)}</td><td className="r">{rs2(r.interest)}</td><td className="r">{rs2(r.cakeCredit)}</td>
            <td className="r"><b>{rs2(r.total)}</b></td><td className="r">{rs2(r.sell)}</td><td className={`r ${r.margin != null && r.margin < 0 ? "bad" : "good"}`}>{rs2(r.margin)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <section className="hub-card"><h3>Your figures</h3>
        <div className="ins-row">
          <label>Power ₹/unit <input type="number" value={set.powerTariff} onChange={(e) => setSet({ ...set, powerTariff: Number(e.target.value) || 0 })} /></label>
          <label>Salary share on crushing (0–1) <input type="number" step="0.1" value={set.labourShare} onChange={(e) => setSet({ ...set, labourShare: Number(e.target.value) || 0 })} /></label>
          <label>Freight ₹/kg <input type="number" value={set.freightPerKg} onChange={(e) => setSet({ ...set, freightPerKg: Number(e.target.value) || 0 })} /></label>
          <label>Interest % a year <input type="number" value={set.interestPct} onChange={(e) => setSet({ ...set, interestPct: Number(e.target.value) || 0 })} /></label>
          <label>Days stock is held <input type="number" value={set.holdDays} onChange={(e) => setSet({ ...set, holdDays: Number(e.target.value) || 0 })} /></label>
          <button className="hub-btn primary" onClick={() => void save()}>Save</button>{msg && <span className="hub-m">{msg}</span>}
        </div>
        <p className="hub-m small">Last 30 days: {Math.round(units)} power units (Machines log) and {Math.round(oilKg)} kg oil crushed. Seed cost per kg oil = seed rate ÷ oil %. Packing per kg comes from the Packing BOM / Profit per kg settings.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ smart reorder
export function ReorderTab({ d, today }: { d: BizData; today: string }) {
  const [days, setDays] = useState(14);
  const [msg, setMsg] = useState<string | null>(null);
  const lines = useMemo(() => smartReorder(d, today, demandForecast(d, today), { days, obs: lotHistory(d, shift(today, -365)) }), [d, today, days]);
  const draft = async (l: (typeof lines)[number]) => {
    const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier: l.supplier || "Supplier", date: today, dueDate: shift(today, 3), lines: [{ item: l.seedKg ? `${l.name} seed` : l.name, qty: l.seedKg || l.buyKg, unit: "kg", rate: l.rate || 0 }], notes: `Smart reorder: ${l.reason}` }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${j.data.no} drafted — see Orders & suppliers` : j.error || "Could not draft");
  };
  return (
    <>
      <div className="ins-range">{[7, 14, 30].map((n) => <button key={n} className={`hub-btn sm${days === n ? " primary" : ""}`} onClick={() => setDays(n)}>Cover {n} days</button>)}{msg && <span className="hub-m">{msg}</span>}</div>
      <div className="ins-cards">{lines.map((l) => (
        <div key={l.key} className="hub-card ins-run low">
          <div className="ins-run-h"><b>{l.name}</b><span className="ins-chip low">buy {l.buyKg} kg oil</span></div>
          {l.seedKg && <div className="ins-run-v">{l.seedKg.toLocaleString("en-IN")}<small> kg seed</small></div>}
          <small className="hub-m">{l.reason}</small>
          {l.supplier && <small>Last from {l.supplier}{l.rate ? ` at ₹${l.rate}` : ""}</small>}
          <button className="hub-btn sm primary" onClick={() => void draft(l)}>🧾 Draft purchase order</button>
        </div>
      ))}</div>
      {!lines.length && <div className="hub-banner ins-good">✅ Stock covers the next {days} days — nothing to reorder.</div>}
      <p className="hub-m small">Need = forecast kg/day (festival weeks included) × (days + 4 safety days) − stock from the last tally. Packing material lows are on the Packing page.</p>
    </>
  );
}

// ------------------------------------------------------------------ what-if
export function ScenarioTab({ d, today }: { d: BizData; today: string }) {
  const [w, setW] = useState<WhatIf>({ salesPct: 0, pricePct: 0, costPct: 0, expensePct: 0 });
  const r = useMemo(() => whatIf(d, today, w), [d, today, w]);
  const sl = (k: keyof WhatIf, label: string, min = -30, max = 30) => (
    <label className="ins-sl">{label} <b>{w[k] > 0 ? "+" : ""}{w[k]}%</b><input type="range" min={min} max={max} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></label>
  );
  return (
    <>
      <section className="hub-card ins-sls">
        {sl("salesPct", "Kg sold")}{sl("pricePct", "Selling price")}{sl("costPct", "Seed / oil cost")}{sl("expensePct", "Running expenses")}
        <button className="hub-btn sm" onClick={() => setW({ salesPct: 0, pricePct: 0, costPct: 0, expensePct: 0 })}>Reset</button>
      </section>
      <div className="ins-kpis">
        <div className="hub-card"><small>Last 30 days profit</small><b>{rs(r.base.net)}</b></div>
        <div className={`hub-card ${r.change >= 0 ? "ins-good" : "ins-bad"}`}><small>With these changes</small><b>{rs(r.net)}</b><small>{r.change >= 0 ? "+" : ""}{rs(r.change)} a month</small></div>
        <div className="hub-card"><small>Sales / purchases / expenses</small><b style={{ fontSize: 16 }}>{rs(r.sales)} · {rs(r.purchases)} · {rs(r.expenses)}</b></div>
        {r.breakEvenPricePct != null && <div className="hub-card"><small>Price change to break even</small><b>{r.breakEvenPricePct > 0 ? "+" : ""}{r.breakEvenPricePct}%</b></div>}
      </div>
      <p className="hub-m small">Example: seed up 10% → move “Seed / oil cost” to +10 and see how much the selling price must rise to keep the same profit.</p>
    </>
  );
}

// ------------------------------------------------------------------ weather
export function WeatherTab({ today }: { today: string }) {
  const [rows, setRows] = useState<RegionWeather[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const lat = REGIONS.map((r) => r.lat).join(","), lon = REGIONS.map((r) => r.lon).join(",");
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max&past_days=7&forecast_days=8&timezone=Asia%2FKolkata`)
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j) ? j : [j];
        setRows(list.map((x, i) => weatherNote(REGIONS[i].name, REGIONS[i].crops, x.daily, today, Number(today.slice(5, 7)))));
      })
      .catch(() => setErr("Could not reach the weather service."));
  }, [today]);
  return (
    <>
      {err && <div className="hub-banner">{err}</div>}
      <div className="ins-cards">{(rows || []).map((w) => (
        <div key={w.name} className={`hub-card ins-run ${w.level === "alert" ? "out" : w.level === "watch" ? "low" : "ok"}`}>
          <div className="ins-run-h"><b>🌦️ {w.name}</b><span className="hub-m small">{w.crops.join(", ")}</span></div>
          <div className="ins-mstats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}><span><b>{w.past7mm}</b><small>mm last 7 d</small></span><span><b>{w.next7mm}</b><small>mm next 7 d</small></span><span><b>{w.maxTemp ?? "–"}°</b><small>max next 7 d</small></span></div>
          <p className="ins-say">{w.note}</p>
        </div>
      ))}</div>
      {!rows && !err && <p className="hub-m">Loading weather…</p>}
      <p className="hub-m small">Rain and heat in the seed-growing areas (Open-Meteo forecast). Heavy rain at harvest or a dry sowing season usually pushes seed prices up later.</p>
    </>
  );
}

// ------------------------------------------------------------------ year-on-year
export function YoyTab({ today }: { today: string }) {
  const [d, setD] = useState<BizData | null>(null);
  useEffect(() => { fetch(`/api/reports/hub?from=${shift(today, -400)}&to=${today}`).then((r) => r.json()).then((j) => setD(j.data || null)).catch(() => {}); }, [today]);
  const y = useMemo(() => (d ? yoy(d, today) : null), [d, today]);
  if (!y) return <p className="hub-m">Loading the last 13 months…</p>;
  const max = Math.max(1, ...y.months.flatMap((m) => [m.sales, m.lastYear]));
  return (
    <>
      <div className="ins-kpis">
        <div className="hub-card"><small>This financial year (from {y.fyStart.split("-").reverse().join("-")})</small><b>{rs(y.ytd)}</b></div>
        <div className="hub-card"><small>Same days last year</small><b>{rs(y.lyYtd)}</b></div>
        <div className={`hub-card ${(y.ytdChangePct ?? 0) >= 0 ? "ins-good" : "ins-bad"}`}><small>Change</small><b>{y.ytdChangePct == null ? "–" : `${y.ytdChangePct > 0 ? "+" : ""}${y.ytdChangePct}%`}</b></div>
      </div>
      <section className="hub-card"><h3>Sales by month <small className="hub-m">■ this year □ last year</small></h3>
        <div className="ins-yoy">{y.months.map((m) => (
          <div key={m.month} className="ins-yoy-c" title={`${m.label}: ${rs(m.sales)} vs ${rs(m.lastYear)}`}>
            <div className="ins-yoy-b"><i className="ly" style={{ height: `${(m.lastYear / max) * 100}%` }} /><i className="ty" style={{ height: `${(m.sales / max) * 100}%` }} /></div>
            <small>{m.label}</small>
            {m.changePct != null && <small className={m.changePct >= 0 ? "good" : "bad"}>{m.changePct > 0 ? "+" : ""}{m.changePct}%</small>}
          </div>
        ))}</div>
      </section>
      <p className="hub-m small">Profit (net) this year vs last for each month is in the hover. Data before the app was used shows as zero.</p>
    </>
  );
}
