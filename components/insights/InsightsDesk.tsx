"use client";

// 📈 Insights (/insights, owner): oil yield by lot and supplier, stock run-out and what to buy,
// profit per kg for each oil, a map of tanks and barrels, and udhaar reminders by WhatsApp.
// Numbers come from lib/insights.ts (pure); this page only fetches and draws.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { udhaarReport } from "@/lib/bizReports";
import { businessDate } from "@/lib/register";
import { TANKS, fillPct } from "@/lib/stockTanks";
import {
  DEFAULT_COSTS, MARGIN_TARGET_PCT, PRODUCTS, priceFor, profitRows, reminderRows, reminderText, runOut, runOutLine, supplierYield, waPhone, yieldLots,
  type CostInputs, type UdhaarNote,
} from "@/lib/insights";
import { csvRows, matchStatement, readStatement, type BankTxn, type MatchResult, type RegEntry } from "@/lib/bankMatch";
import { BudgetTab, PlTab, RatesTab } from "./MoneyTabs";
import "./insights.css";

type Tab = "pl" | "yield" | "stock" | "profit" | "map" | "udhaar" | "bank" | "budget" | "rates";
const TABS: { key: Tab; label: string }[] = [
  { key: "pl", label: "💰 Profit & cash" },
  { key: "yield", label: "🌾 Oil yield" },
  { key: "stock", label: "📦 Stock & buying" },
  { key: "profit", label: "💹 Profit per kg" },
  { key: "map", label: "🛢️ Tanks & barrels" },
  { key: "udhaar", label: "🙌 Udhaar reminders" },
  { key: "bank", label: "🏦 Bank match" },
  { key: "budget", label: "🎯 Budgets" },
  { key: "rates", label: "📋 Rate cards" },
];
const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const rs2 = (n: number | null | undefined) => (n == null ? "–" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("-") : "–");
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export default function InsightsDesk() {
  const today = useMemo(() => businessDate(Date.now()), []);
  const [tab, setTab] = useState<Tab>("yield");
  const [data, setData] = useState<BizData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = window.location.hash.slice(1) as Tab;
    if (TABS.some((x) => x.key === t)) setTab(t);
  }, []);
  useEffect(() => {
    fetch(`/api/reports/hub?from=${shift(today, -180)}&to=${today}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.data) throw new Error(j.error || "Could not load the figures.");
        setData(j.data);
      })
      .catch((e: Error) => setErr(e.message));
  }, [today]);
  const pick = (t: Tab) => {
    setTab(t);
    try { history.replaceState(null, "", `#${t}`); } catch {}
  };

  return (
    <div className="hub ins">
      <header className="hub-top">
        <div><h1>📈 Insights</h1><div className="hub-m">What the shop&apos;s own numbers say — yield, stock, profit, udhaar.</div></div>
      </header>
      <nav className="hub-tabs ins-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => pick(t.key)}>{t.label}</button>
        ))}
      </nav>
      {err && <div className="hub-banner">{err}</div>}
      {!data && !err && <p className="hub-m">Loading…</p>}
      {data && tab === "yield" && <YieldTab d={data} today={today} />}
      {data && tab === "stock" && <StockTab d={data} today={today} />}
      {data && tab === "profit" && <ProfitTab d={data} today={today} />}
      {tab === "map" && <MapTab today={today} />}
      {data && tab === "udhaar" && <UdhaarTab d={data} today={today} />}
      {tab === "bank" && <BankTab />}
      {data && tab === "pl" && <PlTab d={data} today={today} />}
      {data && tab === "budget" && <BudgetTab d={data} today={today} />}
      {data && tab === "rates" && <RatesTab d={data} />}
    </div>
  );
}

// ------------------------------------------------------------------ 1. yield
function YieldTab({ d, today }: { d: BizData; today: string }) {
  const [days, setDays] = useState(90);
  const from = shift(today, -days);
  const lots = useMemo(() => yieldLots(d, from), [d, from]);
  const sups = useMemo(() => supplierYield(d, from), [d, from]);
  const products = Array.from(new Set(lots.map((l) => l.product)));
  const [prod, setProd] = useState<string>("all");
  const shown = lots.filter((l) => prod === "all" || l.product === prod);
  const avg = shown.length ? shown.reduce((a, l) => a + l.oilKg, 0) / shown.reduce((a, l) => a + l.seedKg, 0) * 100 : null;
  const best = sups[0];
  return (
    <>
      <div className="hub-range ins-range">
        {[30, 90, 180].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n} days</button>)}
        <select value={prod} onChange={(e) => setProd(e.target.value)} aria-label="Oil">
          <option value="all">All oils</option>
          {products.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="hub-kpis">
        <div className="hub-kpi g"><div className="l">Average oil %</div><div className="v">{avg == null ? "–" : `${avg.toFixed(1)}%`}</div><div className="s">{shown.length} lots</div></div>
        <div className="hub-kpi b"><div className="l">Best supplier</div><div className="v">{best ? best.supplier : "–"}</div><div className="s">{best ? `${best.oilPct}% · ${best.lots} lots` : "add suppliers to barrels"}</div></div>
        <div className="hub-kpi o"><div className="l">Seed crushed</div><div className="v">{Math.round(shown.reduce((a, l) => a + l.seedKg, 0)).toLocaleString("en-IN")} kg</div><div className="s">oil {Math.round(shown.reduce((a, l) => a + l.oilKg, 0)).toLocaleString("en-IN")} kg</div></div>
      </div>
      <section className="hub-card">
        <h3>Oil % per lot</h3>
        <LineChart points={shown.map((l) => ({ x: l.date, y: l.oilPct, label: `${l.label} · ${l.product}${l.suppliers.length ? ` · ${l.suppliers.join(", ")}` : ""}` }))} unit="%" avg={avg} />
      </section>
      <section className="hub-card">
        <h3>By supplier <small className="hub-m">(barrels with a supplier; fresh crush has none)</small></h3>
        {sups.length === 0 ? <p className="hub-m">No barrels with suppliers in this period.</p> : (
          <div className="ins-bars">
            {sups.map((s) => (
              <div key={s.supplier} className="ins-bar">
                <span className="n">{s.supplier}</span>
                <span className="b"><i style={{ width: `${Math.min(100, (s.oilPct / Math.max(...sups.map((x) => x.oilPct))) * 100)}%` }} className={s.vsAvg >= 0 ? "up" : "down"} /></span>
                <span className="v">{s.oilPct}%</span>
                <small>{s.vsAvg >= 0 ? "+" : ""}{s.vsAvg} pts · {s.lots} lots · {Math.round(s.seedKg)} kg · last {dmy(s.last)}</small>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="hub-card">
        <h3>All lots</h3>
        <div className="ins-tbl"><table><thead><tr><th>Date</th><th>Lot</th><th>Oil</th><th>Supplier</th><th className="r">Seed kg</th><th className="r">Oil kg</th><th className="r">Oil %</th></tr></thead>
          <tbody>{[...shown].reverse().map((l) => (
            <tr key={l.id}><td>{dmy(l.date)}</td><td>{l.label}</td><td>{l.product}</td><td>{l.suppliers.join(", ") || "–"}</td><td className="r">{l.seedKg}</td><td className="r">{l.oilKg}</td><td className={`r ${avg && l.oilPct < avg - 2 ? "bad" : ""}`}>{l.oilPct}%</td></tr>
          ))}{!shown.length && <tr><td colSpan={7} className="hub-m">No finished barrels or fresh crush in this period.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}

function LineChart({ points, unit, avg }: { points: { x: string; y: number; label: string }[]; unit: string; avg: number | null }) {
  if (points.length < 2) return <p className="hub-m">{points.length ? "One lot so far — the line appears from the second." : "Nothing yet."}</p>;
  const W = 640, H = 200, P = 28;
  const ys = points.map((p) => p.y);
  const lo = Math.floor(Math.min(...ys) - 2), hi = Math.ceil(Math.max(...ys) + 2);
  const xs = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const yv = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${yv(p.y).toFixed(1)}`).join(" ");
  return (
    <div className="ins-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Oil percentage per lot">
        {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={P} x2={W - P} y1={yv(v)} y2={yv(v)} className="grid" /><text x={2} y={yv(v) + 4} className="ax">{v.toFixed(0)}{unit}</text></g>)}
        {avg != null && <line x1={P} x2={W - P} y1={yv(avg)} y2={yv(avg)} className="avg" />}
        <path d={path} className="ln" />
        {points.map((p, i) => <circle key={i} cx={xs(i)} cy={yv(p.y)} r={4} className="pt"><title>{`${dmy(p.x)} · ${p.y}${unit} · ${p.label}`}</title></circle>)}
        <text x={P} y={H - 6} className="ax">{dmy(points[0].x)}</text>
        <text x={W - P} y={H - 6} className="ax" textAnchor="end">{dmy(points[points.length - 1].x)}</text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ 2. stock run-out
function StockTab({ d, today }: { d: BizData; today: string }) {
  const rows = useMemo(() => runOut(d, today), [d, today]);
  return (
    <>
      <div className="ins-cards">
        {rows.map((r) => (
          <div key={r.key} className={`hub-card ins-run ${r.level}`}>
            <div className="ins-run-h"><b>{r.name}</b><span className={`ins-chip ${r.level}`}>{r.level === "out" ? "Out" : r.level === "low" ? "Buy soon" : r.level === "ok" ? "OK" : "No count"}</span></div>
            <div className="ins-run-v">{r.daysLeft != null ? <>{r.daysLeft}<small> days left</small></> : r.stockKg != null ? <>{r.stockKg}<small> kg</small></> : "–"}</div>
            <div className="hub-m small">{r.stockKg != null ? `${r.stockKg} kg at the ${dmy(r.stockDate)} count` : "No stock count yet"}{r.perDay ? ` · uses ~${r.perDay} kg/day` : ""}</div>
            <div className="ins-run-buy">{r.lastBuy ? <>Last bought {dmy(r.lastBuy.date)}{r.lastBuy.party ? <> from <b>{r.lastBuy.party}</b></> : null}{r.lastBuy.rate ? <> at <b>₹{r.lastBuy.rate}</b>/{r.lastBuy.unit || "kg"}</> : null}{r.lastBuy.qty ? ` · ${r.lastBuy.qty} ${r.lastBuy.unit || ""}` : ""}</> : "No purchase found"}</div>
            <p className="ins-say">{runOutLine(r)}</p>
          </div>
        ))}
      </div>
      <p className="hub-m small">Stock comes from the daily stock count (Stock page); use per day from the last 14 days of counts, or sales when there are no counts.</p>
    </>
  );
}

// ------------------------------------------------------------------ 3. profit
function ProfitTab({ d, today }: { d: BizData; today: string }) {
  const [set, setSet] = useState<Record<string, Partial<CostInputs>>>({});
  const [oils, setOils] = useState<Record<string, number | null>>({ sunflower: null, ricebran: null });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/settings/app?key=profit").then((r) => r.json()).then((j) => {
      if (j.data) { setSet(j.data.set || {}); setOils({ sunflower: null, ricebran: null, ...(j.data.oils || {}) }); }
    }).catch(() => {});
  }, []);
  const rows = useMemo(() => {
    const sf = profitRows(d, today, set).find((r) => r.key === "sunflower");
    return profitRows(d, today, set, { sunflower: oils.sunflower ?? sf?.rate ?? null, ricebran: oils.ricebran ?? null });
  }, [d, today, set, oils]);
  const save = async () => {
    const r = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "profit", data: { set, oils } }) });
    setMsg(r.ok ? "Saved ✓" : "Could not save");
    setTimeout(() => setMsg(null), 2500);
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const edit = (k: string, f: keyof CostInputs, v: string) => setSet((s) => ({ ...s, [k]: { ...s[k], [f]: f === "crushPerKg" || f === "packPerKg" || f === "cakeRate" ? Number(v) || 0 : num(v) } }));
  const best = [...rows].filter((r) => r.marginPerKg != null).sort((a, b) => (b.profit30 ?? 0) - (a.profit30 ?? 0))[0];
  return (
    <>
      {best && <div className="hub-banner ins-good">💡 <b>{best.name}</b> earned the most in the last 30 days: about {rs(best.profit30)} ({rs2(best.marginPerKg)}/kg on {best.soldKg30} kg).</div>}
      <div className="ins-tbl">
        <table className="ins-profit">
          <thead><tr><th>Oil</th><th className="r">Seed / oil rate</th><th className="r">Oil %</th><th className="r">Cost / kg</th><th className="r">Selling / kg</th><th className="r">Margin / kg</th><th className="r">Sold 30 d</th><th className="r">Profit 30 d</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const low = r.marginPct != null && r.marginPct < MARGIN_TARGET_PCT;
              return (
                <tr key={r.key} className={low ? "low" : ""}>
                  <td><b>{r.name}</b><div className="hub-m small">{r.make === "crush" ? "crushed here" : r.make === "buy" ? "bought as oil" : "blend"} · {r.note}</div></td>
                  <td className="r">{rs2(r.rate)}<div className="hub-m small">{r.rateFrom}</div></td>
                  <td className="r">{r.oilPct == null ? "–" : `${r.oilPct}%`}</td>
                  <td className="r"><b>{rs2(r.costPerKg)}</b></td>
                  <td className="r">{rs2(r.sell)}<div className="hub-m small">{r.sellFrom}</div></td>
                  <td className={`r ${low ? "bad" : "good"}`}>{rs2(r.marginPerKg)}{r.marginPct != null && <div className="small">{r.marginPct}%</div>}</td>
                  <td className="r">{r.soldKg30} kg</td>
                  <td className="r">{rs(r.profit30)}</td>
                  <td>{low && r.costPerKg ? <span className="ins-chip low">Raise to ₹{priceFor(r.costPerKg)}</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="hub-card">
        <h3>Your costs <small className="hub-m">(blank = taken from the last purchase / recent sales / yield)</small></h3>
        <div className="ins-tbl"><table className="ins-costs">
          <thead><tr><th>Oil</th><th>Rate ₹/kg</th><th>Oil %</th><th>Crushing ₹/kg oil</th><th>Packing ₹/kg</th><th>Cake ₹/kg</th><th>Selling ₹/kg</th></tr></thead>
          <tbody>{PRODUCTS.map((p) => {
            const c = { ...DEFAULT_COSTS[p.key], ...(set[p.key] || {}) };
            const inp = (f: keyof CostInputs, ph: string) => <input type="number" inputMode="decimal" value={(c[f] as number | null) ?? ""} placeholder={ph} onChange={(e) => edit(p.key, f, e.target.value)} aria-label={`${p.name} ${f}`} />;
            return <tr key={p.key}><td>{p.name}</td><td>{inp("rate", "auto")}</td><td>{p.make === "crush" ? inp("oilPct", "auto") : "–"}</td><td>{p.make === "crush" ? inp("crushPerKg", "0") : "–"}</td><td>{inp("packPerKg", "0")}</td><td>{p.make === "crush" ? inp("cakeRate", "0") : "–"}</td><td>{inp("sell", "auto")}</td></tr>;
          })}</tbody></table></div>
        <div className="ins-row">
          <label>Ekatva blend: sunflower oil ₹/kg <input type="number" value={oils.sunflower ?? ""} placeholder="auto" onChange={(e) => setOils({ ...oils, sunflower: num(e.target.value) })} /></label>
          <label>rice bran oil ₹/kg <input type="number" value={oils.ricebran ?? ""} placeholder="needed" onChange={(e) => setOils({ ...oils, ricebran: num(e.target.value) })} /></label>
          <button className="hub-btn primary" onClick={save}>Save costs</button>
          {msg && <span className="hub-m">{msg}</span>}
        </div>
        <p className="hub-m small">Cost per kg of crushed oil = seed rate × seed per kg oil + crushing + packing − cake sold. Red = margin under {MARGIN_TARGET_PCT}%: the price shown keeps {MARGIN_TARGET_PCT}%.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ 4. tanks and barrels map
interface Fleet { id: string; code: string; status: string; product: string | null; netKg: number | null; location: string; holder: string | null; sinceAt: string; awayDays?: number; condition: string }
interface Lot { id: string; lotNo?: string; supplierName?: string; product?: string; date?: string; barrels?: { grossKg: number | null; emptyKg: number | null }[] }
function MapTab({ today }: { today: string }) {
  const [tank, setTank] = useState<Record<string, number | null>>({});
  const [countAt, setCountAt] = useState<string>("");
  const [fleet, setFleet] = useState<Fleet[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const load = useCallback(async () => {
    const st = await fetch(`/api/register/stock?date=${today}`).then((r) => r.json()).catch(() => ({}));
    const s = st.data;
    if (s) {
      const pick = (k: string): number | null => {
        const n = s.sessions?.NIGHT?.stock?.[k]?.today ?? s.sessions?.AFTERNOON?.stock?.[k]?.today;
        if (typeof n === "number") return n;
        const y = s.yesterday?.NIGHT?.[k] ?? s.yesterday?.AFTERNOON?.[k];
        return typeof y === "number" ? y : null;
      };
      const out: Record<string, number | null> = {};
      for (const t of TANKS) {
        const vals = [t.key, ...(t.also || []).map((a) => a.key)].map(pick).filter((v): v is number => v != null);
        out[t.key] = vals.length ? vals.reduce((a, v) => a + v, 0) : null;
      }
      setTank(out);
      setCountAt(s.sessions?.NIGHT ? "today's closing count" : s.sessions?.AFTERNOON ? "today's midday count" : "the last count");
    }
    const f = await fetch("/api/barrel-fleet").then((r) => r.json()).catch(() => ({}));
    setFleet(f.data || []);
    const b = await fetch("/api/barrels").then((r) => r.json()).catch(() => ({}));
    setLots(Array.isArray(b.data) ? b.data : b.data?.receipts || []);
  }, [today]);
  useEffect(() => { void load(); }, [load]);
  const places = ["SHOP", "VEHICLE", "CUSTOMER", "SUPPLIER", "REPAIR"];
  const placeName: Record<string, string> = { SHOP: "🏠 In the shop", VEHICLE: "🚚 On a vehicle", CUSTOMER: "👤 With customers", SUPPLIER: "🏭 At suppliers", REPAIR: "🔧 Repair" };
  const days = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86400000));
  return (
    <>
      <section className="hub-card">
        <div className="hub-card-head"><h3>Tanks <small className="hub-m">from {countAt || "the stock count"}</small></h3><a className="hub-btn sm" href="/stock">Count stock</a></div>
        <div className="ins-tanks">
          {TANKS.map((t) => {
            const kg = tank[t.key] ?? null;
            const pct = fillPct(kg, t.capKg);
            return (
              <div key={t.key} className="ins-tank" title={`${t.name}: ${kg ?? "?"} of ${t.capKg} kg`}>
                <div className="ins-tank-body"><i style={{ height: `${pct}%`, background: t.color }} /><span>{kg == null ? "?" : `${pct}%`}</span></div>
                <b>{t.name}</b><small>{kg == null ? "not counted" : `${Math.round(kg)} / ${t.capKg} kg`}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="hub-card">
        <div className="hub-card-head"><h3>Our barrels</h3><a className="hub-btn sm" href="/barrels/fleet">Open fleet</a></div>
        {fleet.length === 0 ? <p className="hub-m">No barrels registered yet (Barrels → Our barrels).</p> : places.map((pl) => {
          const here = fleet.filter((b) => b.location === pl);
          if (!here.length) return null;
          return (
            <div key={pl} className="ins-place">
              <h4>{placeName[pl]} <small>{here.length} · {Math.round(here.reduce((a, b) => a + (b.status === "FULL" ? b.netKg || 0 : 0), 0))} kg oil</small></h4>
              <div className="ins-drums">
                {here.map((b) => (
                  <a key={b.id} href={`/barrels/fleet/${encodeURIComponent(b.code)}`} className={`ins-drum ${b.status.toLowerCase()} ${b.condition !== "OK" ? "warn" : ""}`} title={`${b.code} · ${b.status}${b.product ? ` · ${b.product}` : ""}${b.netKg ? ` · ${b.netKg} kg` : ""}${b.holder ? ` · ${b.holder}` : ""} · since ${days(b.sinceAt)} d`}>
                    <span className="c">{b.code.replace(/^BRL-?/, "")}</span>
                    <span className="p">{b.status === "FULL" ? `${b.product || "oil"} ${b.netKg ? Math.round(b.netKg) : ""}` : b.status === "EMPTY" ? "empty" : "new"}</span>
                    <span className="d">{b.holder ? b.holder.slice(0, 10) : `${days(b.sinceAt)}d`}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <section className="hub-card">
        <div className="hub-card-head"><h3>Supplier barrels waiting</h3><a className="hub-btn sm" href="/barrels">Receiving</a></div>
        {lots.length === 0 ? <p className="hub-m">No open lots.</p> : (
          <div className="ins-drums">
            {lots.flatMap((l) => (l.barrels || []).map((b, i) => (
              <a key={`${l.id}-${i}`} href="/barrels" className={`ins-drum ${b.grossKg == null ? "new" : b.emptyKg == null ? "full" : "empty"}`} title={`${l.lotNo || ""} ${l.supplierName || ""} ${l.product || ""}`}>
                <span className="c">{i + 1}</span><span className="p">{b.grossKg == null ? "to weigh" : b.emptyKg == null ? "to empty" : "done"}</span><span className="d">{(l.supplierName || "").slice(0, 10)}</span>
              </a>
            )))}
          </div>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ 5. udhaar reminders
function UdhaarTab({ d, today }: { d: BizData; today: string }) {
  const [notes, setNotes] = useState<UdhaarNote[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [shop, setShop] = useState<{ name: string; upi: string }>({ name: "Mahadev Traders, Bidar", upi: "" });
  const [promising, setPromising] = useState<string | null>(null);
  const [pDate, setPDate] = useState(shift(today, 3));
  const [pAmt, setPAmt] = useState("");
  const load = useCallback(() => {
    fetch("/api/udhaar/notes").then((r) => r.json()).then((j) => setNotes(j.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    fetch("/api/parties").then((r) => r.json()).then((j) => setPhones(Object.fromEntries(((j.data || []) as { name: string; phone: string | null }[]).filter((p) => p.phone).map((p) => [p.name, p.phone as string])))).catch(() => {});
    fetch("/api/settings/app?key=shop").then((r) => r.json()).then((j) => j.data && setShop((s) => ({ ...s, ...j.data }))).catch(() => {});
  }, [load]);
  const rows = useMemo(() => reminderRows(udhaarReport(d, today).rows, phones, notes, today), [d, today, phones, notes]);
  const note = async (body: Record<string, unknown>) => {
    await fetch("/api/udhaar/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  };
  const send = (r: (typeof rows)[number]) => {
    const text = reminderText({ name: r.name, balance: r.balance, shop: shop.name, vpa: shop.upi || null, today });
    const ph = waPhone(r.phone);
    window.open(`https://wa.me/${ph || ""}?text=${encodeURIComponent(text)}`, "_blank");
    void note({ name: r.name, kind: "REMIND", date: today, amount: r.balance });
  };
  const saveShop = () => fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "shop", data: shop }) });
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const weekDue = rows.filter((r) => r.sinceRemind == null || r.sinceRemind >= 7);
  return (
    <>
      <div className="hub-kpis">
        <div className="hub-kpi r"><div className="l">To collect</div><div className="v">{rs(total)}</div><div className="s">{rows.length} people</div></div>
        <div className="hub-kpi o"><div className="l">Remind this week</div><div className="v">{weekDue.length}</div><div className="s">not reminded in 7 days</div></div>
        <div className="hub-kpi b"><div className="l">Promises</div><div className="v">{rows.filter((r) => r.promise).length}</div><div className="s">{rows.filter((r) => r.promiseLate).length} late</div></div>
      </div>
      <details className="hub-card ins-shop">
        <summary>Shop name and UPI id for the message {shop.upi ? `· ${shop.upi}` : "· add your UPI id"}</summary>
        <div className="ins-row">
          <label>Shop name <input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} /></label>
          <label>UPI id <input value={shop.upi} placeholder="mahadev@ybl" onChange={(e) => setShop({ ...shop, upi: e.target.value.trim() })} /></label>
          <button className="hub-btn primary" onClick={() => void saveShop()}>Save</button>
        </div>
      </details>
      <div className="ins-tbl">
        <table className="ins-ud">
          <thead><tr><th>Customer</th><th className="r">Balance</th><th className="r">Days</th><th>Promise</th><th>Reminded</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className={r.promiseLate ? "late" : ""}>
                <td><b>{r.name}</b><div className="hub-m small">{r.phone || "no phone — add it in Parties"}</div></td>
                <td className="r"><b>{rs(r.balance)}</b></td>
                <td className={`r ${r.days >= 30 ? "bad" : ""}`}>{r.days}</td>
                <td>{r.promise ? <span className={`ins-chip ${r.promiseLate ? "out" : "ok"}`}>{dmy(r.promise.date)}{r.promise.amount ? ` · ${rs(r.promise.amount)}` : ""}</span> : "–"}</td>
                <td>{r.remindedOn ? `${dmy(r.remindedOn)} (${r.sinceRemind}d)` : "never"}</td>
                <td className="ins-act">
                  <button className="hub-btn sm primary" onClick={() => send(r)}>💬 WhatsApp</button>
                  <button className="hub-btn sm" onClick={() => { setPromising(promising === r.name ? null : r.name); setPAmt(String(Math.round(r.balance))); }}>📅 Promise</button>
                  {promising === r.name && (
                    <span className="ins-promise">
                      <input type="date" value={pDate} min={today} onChange={(e) => setPDate(e.target.value)} />
                      <input type="number" value={pAmt} onChange={(e) => setPAmt(e.target.value)} aria-label="Amount promised" />
                      <button className="hub-btn sm primary" onClick={() => { void note({ name: r.name, kind: "PROMISE", date: pDate, amount: Number(pAmt) || null }); setPromising(null); }}>Save</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="hub-m">Nobody owes anything. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="hub-m small">WhatsApp opens with the message ready (and your UPI pay link when the UPI id is set); you press Send. Each send is noted so you see who was reminded this week.</p>
    </>
  );
}

// ------------------------------------------------------------------ 6. bank / UPI statement matching
function BankTab() {
  const [res, setRes] = useState<MatchResult | null>(null);
  const [span, setSpan] = useState<{ from: string; to: string; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<"bank" | "reg" | "ok">("bank");
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      let rows: unknown[][];
      if (/\.xlsx?$/i.test(f.name)) {
        const { default: readXlsx } = await import("read-excel-file/universal");
        rows = ((await readXlsx(f))[0]?.data || []) as unknown[][];
      } else rows = csvRows(await f.text());
      const { txns, problem } = readStatement(rows);
      if (problem) throw new Error(problem);
      const from = txns.reduce((a, t) => (t.date < a ? t.date : a), txns[0].date);
      const to = txns.reduce((a, t) => (t.date > a ? t.date : a), txns[0].date);
      const r = await fetch(`/api/register/range?from=${shift(from, -2)}&to=${shift(to, 2)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load the register.");
      setRes(matchStatement(txns, j.data as RegEntry[]));
      setSpan({ from, to, n: txns.length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  };
  const amt = (n: number) => <span className={n >= 0 ? "good" : "bad"}>{n >= 0 ? "+" : "−"}₹{Math.abs(n).toLocaleString("en-IN")}</span>;
  return (
    <>
      <section className="hub-card">
        <h3>Upload a bank or UPI statement</h3>
        <p className="hub-m">Download the statement from net-banking, PhonePe Business or GPay for Business as <b>CSV or Excel</b>, then choose it here. It never leaves this page — only the matching is shown.</p>
        <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} disabled={busy} />
        {busy && <span className="hub-m"> Reading…</span>}
        {err && <p className="hub-banner">{err}</p>}
      </section>
      {res && span && (
        <>
          <div className="hub-kpis">
            <div className="hub-kpi g"><div className="l">Matched ✓</div><div className="v">{res.matched.length}</div><div className="s">of {span.n} bank lines · {dmy(span.from)} to {dmy(span.to)}</div></div>
            <div className="hub-kpi r"><div className="l">In the bank, not in the register</div><div className="v">{res.bankOnly.length}</div><div className="s">{rs(res.bankOnly.reduce((a, t) => a + Math.abs(t.amount), 0))}</div></div>
            <div className="hub-kpi o"><div className="l">In the register, not in the bank</div><div className="v">{res.registerOnly.length}</div><div className="s">{rs(res.registerOnly.reduce((a, e) => a + e.amountInr, 0))}</div></div>
          </div>
          <div className="hub-range">
            <button className={show === "bank" ? "on" : ""} onClick={() => setShow("bank")}>Missing from register ({res.bankOnly.length})</button>
            <button className={show === "reg" ? "on" : ""} onClick={() => setShow("reg")}>Missing from bank ({res.registerOnly.length})</button>
            <button className={show === "ok" ? "on" : ""} onClick={() => setShow("ok")}>Matched ({res.matched.length})</button>
          </div>
          <div className="ins-tbl"><table>
            {show === "bank" && (<><thead><tr><th>Date</th><th>Bank description</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>{res.bankOnly.map((t: BankTxn) => <tr key={t.i}><td>{dmy(t.date)}</td><td>{t.desc}{t.ref && <div className="hub-m small">{t.ref}</div>}</td><td className="r">{amt(t.amount)}</td><td><a className="hub-btn sm" href={`/register?date=${t.date}`}>Add in register</a></td></tr>)}
              {!res.bankOnly.length && <tr><td colSpan={4} className="hub-m">Everything in the bank is in the register ✓</td></tr>}</tbody></>)}
            {show === "reg" && (<><thead><tr><th>Date</th><th>Entry</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>{res.registerOnly.map((e) => <tr key={e.id}><td>{dmy(e.date)}</td><td>{e.kind.replace("_", " ").toLowerCase()} · {e.partyName || e.itemLabel || e.item || ""} <span className="hub-m small">({e.paymentMode})</span></td><td className="r">{rs(e.amountInr)}</td><td><a className="hub-btn sm" href={`/register?date=${e.date}`}>Check / edit</a></td></tr>)}
              {!res.registerOnly.length && <tr><td colSpan={4} className="hub-m">Every UPI / bank entry is in the statement ✓</td></tr>}</tbody></>)}
            {show === "ok" && (<><thead><tr><th>Bank date</th><th>Bank</th><th>Register</th><th className="r">Amount</th></tr></thead>
              <tbody>{res.matched.map((m) => <tr key={m.bank.i}><td>{dmy(m.bank.date)}{m.dayGap ? <span className="hub-m small"> ({m.dayGap}d)</span> : null}</td><td>{m.bank.desc}</td><td>{m.entry.partyName || m.entry.itemLabel || m.entry.kind}</td><td className="r">{amt(m.bank.amount)}</td></tr>)}</tbody></>)}
          </table></div>
          <p className="hub-m small">A match = the same amount within 2 days. Cash entries are not compared; pigmee and owner draws are left out.</p>
        </>
      )}
    </>
  );
}
