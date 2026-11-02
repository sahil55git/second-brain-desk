// 🧠 Business intelligence: should-yield prediction, buy-now advisor, true cost per kg, smart
// reorder, what-if simulator, weather watch and year-on-year. Pure — tested in lib/__tests__/intel.test.ts.
import { computeBarrelYield } from "./mfgCalculations";
import { profitLoss } from "./money";
import { PRODUCTS, avgSellRate, lastPurchase, runOut, type RunOut } from "./insights";
import { salesReport, expenseReport, type BizData } from "./bizReports";
import type { Forecast } from "./ops";
import type { MandiSignal } from "./mandi";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => String(s || "").trim().toLowerCase();
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

// ===========================================================================
// Should-yield: expected oil % for a lot before you buy it
// ===========================================================================
export interface LotObs { supplier: string; product: string; oilPct: number; moisturePct: number | null; seedKg: number; date: string }
export function lotHistory(d: BizData, from: string): LotObs[] {
  const out: LotObs[] = [];
  for (const b of d.mfg) {
    if (b.date.slice(0, 10) < from) continue;
    const sup = (b.suppliers || []).filter((s) => s.name?.trim() && s.seedKg > 0);
    const y = computeBarrelYield({ suppliers: sup.map((s) => ({ name: s.name, seedKg: s.seedKg })), step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg, refOilPct: b.refOilPct, moisturePct: b.moisturePct, systemOilKgOverride: b.systemOilKgOverride });
    if (!y.totalSeedKg || !y.actualOilKg) continue;
    const pct = (y.actualOilKg / y.totalSeedKg) * 100;
    for (const s of sup) out.push({ supplier: s.name.trim(), product: b.productItem, oilPct: r2(pct), moisturePct: b.moisturePct ?? null, seedKg: s.seedKg, date: b.date.slice(0, 10) });
  }
  return out;
}
/** Weighted least squares of oil % on moisture (falls back to −0.6 points per 1% moisture). */
function moistureSlope(obs: LotObs[]): number {
  const o = obs.filter((x) => x.moisturePct != null);
  if (o.length < 4) return -0.6;
  const w = o.reduce((a, x) => a + x.seedKg, 0);
  const mx = o.reduce((a, x) => a + x.seedKg * x.moisturePct!, 0) / w, my = o.reduce((a, x) => a + x.seedKg * x.oilPct, 0) / w;
  const sxx = o.reduce((a, x) => a + x.seedKg * (x.moisturePct! - mx) ** 2, 0);
  if (sxx < 1e-6) return -0.6;
  const s = o.reduce((a, x) => a + x.seedKg * (x.moisturePct! - mx) * (x.oilPct - my), 0) / sxx;
  return Math.max(-2, Math.min(0, s));
}
export interface YieldGuess { expectedPct: number | null; low: number | null; high: number | null; basis: string; lots: number; fairSeedRate: number | null }
export function shouldYield(obs: LotObs[], q: { product?: string; supplier?: string; moisturePct?: number | null; oilRate?: number | null; cakeRate?: number | null; crushPerKg?: number | null }): YieldGuess {
  const prod = obs.filter((x) => !q.product || norm(x.product).includes(norm(q.product).split(" ")[0]));
  const mine = prod.filter((x) => q.supplier && norm(x.supplier) === norm(q.supplier));
  const base = mine.length >= 2 ? mine : prod;
  if (!base.length) return { expectedPct: null, low: null, high: null, basis: "no past lots for this seed", lots: 0, fairSeedRate: null };
  const w = base.reduce((a, x) => a + x.seedKg, 0);
  const mean = base.reduce((a, x) => a + x.seedKg * x.oilPct, 0) / w;
  const sd = Math.sqrt(base.reduce((a, x) => a + x.seedKg * (x.oilPct - mean) ** 2, 0) / w);
  const mBase = base.filter((x) => x.moisturePct != null);
  const meanM = mBase.length ? mBase.reduce((a, x) => a + x.moisturePct!, 0) / mBase.length : null;
  const adj = q.moisturePct != null && meanM != null ? moistureSlope(prod) * (q.moisturePct - meanM) : 0;
  const exp = mean + adj;
  const oil = exp / 100;
  const fair = q.oilRate ? r2(oil * q.oilRate + (1 - oil - 0.02) * (q.cakeRate || 0) - oil * (q.crushPerKg || 0)) : null;
  return { expectedPct: r1(exp), low: r1(exp - Math.max(0.5, sd)), high: r1(exp + Math.max(0.5, sd)), basis: mine.length >= 2 ? `${mine.length} past lots from ${q.supplier}` : `${base.length} past lots of this seed`, lots: base.length, fairSeedRate: fair };
}

// ===========================================================================
// Buy-now advisor: stock days + mandi trend + harvest season + cash
// ===========================================================================
const SEASON: Record<string, { months: number[]; seed: string }> = {
  groundnut: { months: [10, 11, 12, 3, 4], seed: "Groundnut" },
  mustard: { months: [2, 3, 4], seed: "Mustard" },
  sunflower: { months: [3, 9, 10], seed: "Sunflower" },
  karadi: { months: [2, 3], seed: "Safflower" },
  soyabean: { months: [10, 11], seed: "Soyabean" },
};
export interface BuyAdvice { key: string; name: string; score: number; action: "buy now" | "buy a little" | "wait" | "no need"; reasons: string[] }
export function buyAdvice(rows: RunOut[], mandi: MandiSignal[], o: { month: number; cashLow?: number | null }): BuyAdvice[] {
  return rows.filter((r) => r.key !== "ekatva").map((r) => {
    let score = 0;
    const reasons: string[] = [];
    if (r.daysLeft != null) {
      if (r.daysLeft <= 3) { score += 40; reasons.push(`only ${r.daysLeft} days of stock`); }
      else if (r.daysLeft <= 10) { score += 25; reasons.push(`${r.daysLeft} days of stock`); }
      else if (r.daysLeft > 30) { score -= 25; reasons.push(`${r.daysLeft} days of stock — plenty`); }
    }
    const s = SEASON[r.key];
    const m = s ? mandi.find((x) => norm(x.commodity).startsWith(norm(s.seed).slice(0, 6))) : undefined;
    if (m) {
      if (m.signal === "buy") { score += 25; reasons.push(`mandi ${Math.round((1 - m.latest / (m.avg30 || m.latest)) * 100)}% below its 30-day average`); }
      if (m.signal === "wait") { score -= 15; reasons.push(`mandi up ${m.change7Pct}% this week`); }
    }
    if (s?.months.includes(o.month)) { score += 15; reasons.push("harvest season — prices usually soft"); }
    else if (s && s.months.includes(((o.month + 10) % 12) + 1)) { score -= 5; reasons.push("harvest arrives next month"); }
    if (o.cashLow != null && o.cashLow < 0) { score -= 20; reasons.push("cash forecast goes negative this month"); }
    const action: BuyAdvice["action"] = score >= 45 ? "buy now" : score >= 20 ? "buy a little" : score <= -15 ? "no need" : "wait";
    return { key: r.key, name: r.name, score, action, reasons };
  }).sort((a, b) => b.score - a.score);
}

// ===========================================================================
// True cost per kg of oil
// ===========================================================================
export interface CostSet { powerTariff: number; labourShare: number; freightPerKg: number; interestPct: number; holdDays: number; packPerKg: Record<string, number> }
export const DEFAULT_COST_SET: CostSet = { powerTariff: 9, labourShare: 0.6, freightPerKg: 0.5, interestPct: 11, holdDays: 30, packPerKg: {} };
export interface CostKgRow { key: string; name: string; seed: number | null; power: number | null; labour: number | null; packing: number; freight: number; interest: number | null; cakeCredit: number | null; total: number | null; sell: number | null; margin: number | null; oilPct: number | null }
export function costPerKg(d: BizData, today: string, set: CostSet, o: { powerUnits30?: number; oilKg30?: number; cakeRate?: Record<string, number> } = {}): CostKgRow[] {
  const span = { from: addDays(today, -29), to: today };
  const ex = expenseReport(d, span);
  const labour = ex.salary * set.labourShare;
  const oilKg = o.oilKg30 || 0;
  const labourPerKg = oilKg > 0 ? labour / oilKg : null;
  const powerPerKg = oilKg > 0 && o.powerUnits30 ? (o.powerUnits30 * set.powerTariff) / oilKg : null;
  const obs = lotHistory(d, addDays(today, -180));
  return PRODUCTS.filter((p) => p.make !== "blend").map((p) => {
    const lb = lastPurchase(d, p);
    const oilPct = p.make === "crush" ? shouldYield(obs, { product: p.words[0] }).expectedPct : null;
    const seedRate = lb?.rate ?? null;
    const seed = seedRate == null ? null : p.make === "crush" ? (oilPct ? seedRate / (oilPct / 100) : null) : seedRate;
    const cakeRate = o.cakeRate?.[p.key] ?? 0;
    const cakeCredit = p.make === "crush" && oilPct ? -(((100 - oilPct - 2) / oilPct) * cakeRate) : null;
    const interest = seed != null ? (seed * set.interestPct * set.holdDays) / 36500 : null;
    const packing = set.packPerKg[p.key] ?? 0;
    const power = p.make === "crush" ? powerPerKg : 0, lab = p.make === "crush" ? labourPerKg : 0;
    const parts = [seed, power, lab, packing, set.freightPerKg, interest, cakeCredit];
    const total = seed == null ? null : r2(parts.reduce<number>((a, x) => a + (x || 0), 0));
    const sell = avgSellRate(d, p, today).rate;
    return { key: p.key, name: p.name, seed: seed == null ? null : r2(seed), power: power == null ? null : r2(power), labour: lab == null ? null : r2(lab), packing, freight: set.freightPerKg, interest: interest == null ? null : r2(interest), cakeCredit: cakeCredit == null ? null : r2(cakeCredit), total, sell, margin: total != null && sell != null ? r2(sell - total) : null, oilPct };
  });
}

// ===========================================================================
// Smart reorder: what to buy for the next N days
// ===========================================================================
export interface ReorderLine { key: string; name: string; needKg: number; haveKg: number | null; buyKg: number; seedKg: number | null; supplier: string | null; rate: number | null; reason: string }
export function smartReorder(d: BizData, today: string, forecast: Forecast[], o: { days?: number; safetyDays?: number; obs?: LotObs[] } = {}): ReorderLine[] {
  const days = o.days ?? 14, safety = o.safetyDays ?? 4;
  const ro = runOut(d, today);
  return ro.filter((r) => r.key !== "ekatva").map((r) => {
    const p = PRODUCTS.find((x) => x.key === r.key)!;
    const f = forecast.find((x) => p.words.some((w) => norm(x.product).includes(w)));
    const perDay = f ? f.next4 / 28 : r.perDay || 0;
    const need = perDay * (days + safety);
    const have = r.stockKg;
    const buy = Math.max(0, Math.round((need - (have ?? 0)) / 10) * 10);
    const oilPct = p.make === "crush" ? shouldYield(o.obs || [], { product: p.words[0] }).expectedPct : null;
    const lb = lastPurchase(d, p);
    return {
      key: r.key, name: r.name, needKg: Math.round(need), haveKg: have, buyKg: buy,
      seedKg: p.make === "crush" && buy && oilPct ? Math.round(buy / (oilPct / 100) / 10) * 10 : null,
      supplier: lb?.party || null, rate: lb?.rate || null,
      reason: `${Math.round(perDay)} kg/day${f?.next.some((n) => n.festival) ? ` (${f.next.find((n) => n.festival)!.festival} ahead)` : ""} × ${days + safety} days − ${have ?? "?"} kg in stock`,
    };
  }).filter((x) => x.buyKg > 0).sort((a, b) => b.buyKg - a.buyKg);
}

// ===========================================================================
// What-if simulator on last 30 days
// ===========================================================================
export interface WhatIf { salesPct: number; pricePct: number; costPct: number; expensePct: number }
export function whatIf(d: BizData, today: string, w: WhatIf) {
  const base = profitLoss(d, { from: addDays(today, -29), to: today });
  const vol = 1 + w.salesPct / 100;
  const sales = base.sales * vol * (1 + w.pricePct / 100);
  const buys = base.purchases * vol * (1 + w.costPct / 100);
  const exp = base.expenses * (1 + w.expensePct / 100);
  const net = sales - buys - exp;
  return { base: { sales: base.sales, purchases: base.purchases, expenses: base.expenses, net: base.net }, sales: Math.round(sales), purchases: Math.round(buys), expenses: Math.round(exp), net: Math.round(net), change: Math.round(net - base.net), breakEvenPricePct: base.sales > 0 ? r1((((buys + exp - base.sales * vol) / (base.sales * vol)) * 100)) : null };
}

// ===========================================================================
// Weather watch (Open-Meteo daily data for seed regions)
// ===========================================================================
export const REGIONS = [
  { name: "Bidar", lat: 17.91, lon: 77.52, crops: ["karadi", "soyabean"] },
  { name: "Kalaburagi", lat: 17.33, lon: 76.83, crops: ["karadi", "sunflower"] },
  { name: "Latur", lat: 18.4, lon: 76.56, crops: ["soyabean", "karadi"] },
  { name: "Raichur", lat: 16.2, lon: 77.36, crops: ["sunflower", "groundnut"] },
  { name: "Rajkot (Saurashtra)", lat: 22.3, lon: 70.8, crops: ["groundnut"] },
  { name: "Bharatpur (Rajasthan)", lat: 27.22, lon: 77.49, crops: ["mustard"] },
];
export interface RegionWeather { name: string; crops: string[]; past7mm: number; next7mm: number; maxTemp: number | null; note: string; level: "ok" | "watch" | "alert" }
export function weatherNote(name: string, crops: string[], daily: { time: string[]; precipitation_sum: (number | null)[]; temperature_2m_max?: (number | null)[] }, today: string, month: number): RegionWeather {
  let past = 0, next = 0, tmax: number | null = null;
  daily.time.forEach((t, i) => {
    const mm = daily.precipitation_sum[i] || 0;
    if (t <= today && t > addDays(today, -7)) past += mm;
    if (t > today && t <= addDays(today, 7)) { next += mm; const tm = daily.temperature_2m_max?.[i]; if (tm != null) tmax = Math.max(tmax ?? -99, tm); }
  });
  const harvest = crops.some((c) => SEASON[c]?.months.includes(month));
  let note = "Normal weather.", level: RegionWeather["level"] = "ok";
  if (next >= 60 && harvest) { note = "Heavy rain coming in harvest time — crop damage / late arrivals can push prices up. Consider buying earlier."; level = "alert"; }
  else if (next >= 60) { note = "Heavy rain coming — good for sowing; watch for flooding."; level = "watch"; }
  else if (past + next < 2 && !harvest && [6, 7, 8, 9].includes(month)) { note = "Dry spell in sowing season — next crop may be smaller; prices can firm up."; level = "watch"; }
  else if (tmax != null && tmax >= 42) { note = `Very hot (${tmax}°C) — stress on standing crop.`; level = "watch"; }
  return { name, crops, past7mm: r1(past), next7mm: r1(next), maxTemp: tmax, note, level };
}

// ===========================================================================
// Year-on-year
// ===========================================================================
export function yoy(d: BizData, today: string) {
  const months: { month: string; label: string; sales: number; lastYear: number; netNow: number; netLast: number; changePct: number | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    const ym = dt.toISOString().slice(0, 7);
    const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const to = end > today ? today : end;
    const lyFrom = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}-01`, lyTo = `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`;
    const now = profitLoss(d, { from: `${ym}-01`, to }), last = profitLoss(d, { from: lyFrom, to: lyTo });
    months.push({ month: ym, label: dt.toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }), sales: now.sales, lastYear: last.sales, netNow: now.net, netLast: last.net, changePct: last.sales > 0 ? Math.round(((now.sales - last.sales) / last.sales) * 100) : null });
  }
  const ytdFrom = `${today.slice(0, 4)}-04-01` <= today ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const lyYtdFrom = `${Number(ytdFrom.slice(0, 4)) - 1}${ytdFrom.slice(4)}`, lyToday = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const ytd = salesReport(d, { from: ytdFrom, to: today }).total, lyYtd = salesReport(d, { from: lyYtdFrom, to: lyToday }).total;
  return { months, ytd, lyYtd, ytdChangePct: lyYtd > 0 ? Math.round(((ytd - lyYtd) / lyYtd) * 100) : null, fyStart: ytdFrom };
}
