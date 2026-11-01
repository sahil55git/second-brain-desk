// 🏭 Operations brain: purchase orders + supplier scores, expeller (machine) report with sediment
// loss, demand forecast, anomaly watch and the weekly review. Pure — tested in lib/__tests__/ops.test.ts.
import { computeBarrelYield } from "./mfgCalculations";
import { expenseReport, purchaseReport, salesReport, udhaarReport, registerItemName, type BizData, type RegisterRow } from "./bizReports";
import { supplierYield } from "./insights";
import { budgetRows, profitLoss, rateFor, type Budgets, type RateCards } from "./money";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const gapDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ===========================================================================
// Purchase orders
// ===========================================================================
export interface PoLine { item: string; qty: number; unit: string; rate: number }
export interface PurchaseOrderLite { id: string; no: string; date: string; supplier: string; dueDate: string | null; status: string; lines: PoLine[] }
export interface PoLineProgress extends PoLine { got: number; left: number; lastDate: string | null; avgRate: number | null }
export interface PoProgress { id: string; no: string; supplier: string; date: string; dueDate: string | null; status: "open" | "part" | "done" | "late" | "cancelled"; pct: number; lines: PoLineProgress[]; doneDate: string | null; lateDays: number }

/** Everything received from a supplier (register purchases + purchase bills): item, kg, rate, date. */
export function receipts(d: BizData): { supplier: string; item: string; qty: number; rate: number | null; date: string }[] {
  const out: { supplier: string; item: string; qty: number; rate: number | null; date: string }[] = [];
  for (const e of d.register) {
    if (e.kind !== "PURCHASE" || !(e.qty && e.qty > 0)) continue;
    out.push({ supplier: norm(e.partyName), item: norm(registerItemName(e)), qty: e.qty, rate: e.rateInr ?? (e.amountInr ? e.amountInr / e.qty : null), date: e.date });
  }
  for (const b of d.purchases) for (const l of b.lineItems || []) {
    if (!(l.qty > 0)) continue;
    out.push({ supplier: norm(b.party?.name), item: norm(l.name), qty: l.qty, rate: l.rateInr, date: b.date });
  }
  return out;
}
const itemMatch = (want: string, got: string) => { const w = norm(want), g = norm(got); return !!w && !!g && (w === g || g.includes(w) || w.includes(g)); };

/** Each order's lines filled from what actually arrived from that supplier on/after the order date (oldest order first). */
export function poProgress(orders: PurchaseOrderLite[], d: BizData, today: string): PoProgress[] {
  const pool = receipts(d).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ ...r, left: r.qty }));
  const sorted = [...orders].sort((a, b) => (a.date < b.date ? -1 : 1));
  const res: PoProgress[] = [];
  for (const o of sorted) {
    const lines: PoLineProgress[] = o.lines.map((l) => {
      let got = 0, cost = 0, lastDate: string | null = null;
      if (o.status !== "cancelled") for (const r of pool) {
        if (got >= l.qty) break;
        if (r.left <= 0 || r.date < o.date || r.supplier !== norm(o.supplier) || !itemMatch(l.item, r.item)) continue;
        const take = Math.min(r.left, l.qty - got);
        r.left -= take; got += take; cost += take * (r.rate ?? l.rate); lastDate = r.date;
      }
      return { ...l, got: r1(got), left: r1(Math.max(0, l.qty - got)), lastDate, avgRate: got ? r2(cost / got) : null };
    });
    const want = lines.reduce((a, l) => a + l.qty, 0), got = lines.reduce((a, l) => a + l.got, 0);
    const pct = want ? Math.round((got / want) * 100) : 0;
    const doneDate = pct >= 98 ? lines.reduce<string | null>((a, l) => (l.lastDate && (!a || l.lastDate > a) ? l.lastDate : a), null) : null;
    const lateDays = o.dueDate ? Math.max(0, gapDays(o.dueDate, doneDate || today)) : 0;
    const status: PoProgress["status"] = o.status === "cancelled" ? "cancelled" : pct >= 98 ? "done" : lateDays > 0 ? "late" : got > 0 ? "part" : "open";
    res.push({ id: o.id, no: o.no, supplier: o.supplier, date: o.date, dueDate: o.dueDate, status, pct, lines, doneDate, lateDays });
  }
  return res.reverse();
}

export interface SupplierScore { supplier: string; score: number; yieldPct: number | null; onTimePct: number | null; rateVsAvgPct: number | null; buys: number; lastDate: string | null; notes: string[] }
/** 0–100: oil yield (40), on-time delivery (30), price vs the average paid for the same item (30). Missing parts count as average. */
export function supplierScores(d: BizData, orders: PoProgress[], today: string, days = 180): SupplierScore[] {
  const from = addDays(today, -days);
  const rec = receipts(d).filter((r) => r.date >= from && r.supplier);
  const avgRate: Record<string, { q: number; v: number }> = {};
  for (const r of rec) if (r.rate) { const a = (avgRate[r.item] ||= { q: 0, v: 0 }); a.q += r.qty; a.v += r.qty * r.rate; }
  const yields = supplierYield(d, from);
  const avgYield = yields.length ? yields.reduce((a, y) => a + y.oilPct, 0) / yields.length : null;
  const names = Array.from(new Set(rec.map((r) => r.supplier).concat(orders.map((o) => norm(o.supplier)))));
  return names.map((s) => {
    const mine = rec.filter((r) => r.supplier === s);
    let rq = 0, rv = 0;
    for (const r of mine) if (r.rate && avgRate[r.item]) { rq += r.qty * (avgRate[r.item].v / avgRate[r.item].q); rv += r.qty * r.rate; }
    const rateVsAvgPct = rq ? r1(((rv - rq) / rq) * 100) : null;
    const y = yields.find((x) => norm(x.supplier) === s);
    const done = orders.filter((o) => norm(o.supplier) === s && (o.status === "done" || o.status === "late") && o.dueDate);
    const onTimePct = done.length ? Math.round((done.filter((o) => o.lateDays === 0).length / done.length) * 100) : null;
    const yScore = y && avgYield ? Math.max(0, Math.min(40, 20 + (y.oilPct - avgYield) * 5)) : 20;
    const tScore = onTimePct == null ? 15 : (onTimePct / 100) * 30;
    const pScore = rateVsAvgPct == null ? 15 : Math.max(0, Math.min(30, 15 - rateVsAvgPct * 3));
    const notes: string[] = [];
    if (y && avgYield && y.oilPct < avgYield - 1) notes.push(`yield ${y.oilPct}% vs ${r1(avgYield)}% average`);
    if (rateVsAvgPct != null && rateVsAvgPct > 2) notes.push(`pays ${rateVsAvgPct}% above average`);
    if (onTimePct != null && onTimePct < 70) notes.push(`on time only ${onTimePct}%`);
    return { supplier: mine[0]?.supplier || s, score: Math.round(yScore + tScore + pScore), yieldPct: y?.oilPct ?? null, onTimePct, rateVsAvgPct, buys: mine.length, lastDate: mine.reduce<string | null>((a, r) => (!a || r.date > a ? r.date : a), null), notes };
  }).sort((a, b) => b.score - a.score);
}

// ===========================================================================
// Machines (expellers / mills): yield, sediment, power, downtime, service due
// ===========================================================================
export interface MachineLogLite { date: string; machine: string; hours: number | null; powerUnits: number | null; downtimeMin: number | null; kind: string; note: string | null }
export interface MachineRow {
  machine: string; batches: number; seedKg: number; oilKg: number; oilPct: number | null; sedimentKg: number; sedimentPct: number | null; lossPct: number | null;
  unitsPerQtl: number | null; hours: number; downtimeHrs: number; hoursSinceService: number | null; serviceDue: boolean; lastService: string | null; sedimentLossInr: number | null;
}
export const SERVICE_HOURS = 250;
export function machineReport(d: BizData, logs: MachineLogLite[], from: string, opts: { oilRate?: number | null; trapPct?: number; serviceHours?: number } = {}): MachineRow[] {
  const by: Record<string, MachineRow> = {};
  const slot = (m: string) => (by[norm(m) || "(no machine)"] ||= { machine: m.trim() || "(no machine)", batches: 0, seedKg: 0, oilKg: 0, oilPct: null, sedimentKg: 0, sedimentPct: null, lossPct: null, unitsPerQtl: null, hours: 0, downtimeHrs: 0, hoursSinceService: null, serviceDue: false, lastService: null, sedimentLossInr: null });
  const lossW: Record<string, { w: number; v: number }> = {};
  for (const b of d.mfg) {
    if (b.date.slice(0, 10) < from) continue;
    const y = computeBarrelYield({ suppliers: (b.suppliers || []).map((s) => ({ name: s.name, seedKg: s.seedKg })), step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg, refOilPct: b.refOilPct, moisturePct: b.moisturePct, systemOilKgOverride: b.systemOilKgOverride });
    if (!y.totalSeedKg) continue;
    const row = slot(b.mill || "");
    row.batches++; row.seedKg += y.totalSeedKg; row.oilKg += y.actualOilKg || 0; row.sedimentKg += b.step4Kg || 0;
    if (y.unaccountedLossPct != null) { const k = norm(row.machine); const l = (lossW[k] ||= { w: 0, v: 0 }); l.w += y.totalSeedKg; l.v += y.totalSeedKg * y.unaccountedLossPct; }
  }
  const power: Record<string, number> = {}, seedForPower: Record<string, number> = {};
  for (const l of logs) {
    if (l.date < from && l.kind !== "service") continue;
    const row = slot(l.machine);
    if (l.kind === "service") { if (!row.lastService || l.date > row.lastService) row.lastService = l.date; continue; }
    row.hours += l.hours || 0; row.downtimeHrs += (l.downtimeMin || 0) / 60;
    if (l.powerUnits) power[norm(row.machine)] = (power[norm(row.machine)] || 0) + l.powerUnits;
  }
  for (const k of Object.keys(by)) seedForPower[k] = by[k].seedKg;
  return Object.entries(by).map(([k, r]) => {
    const crude = r.oilKg + r.sedimentKg;
    const sinceService = r.lastService ? logs.filter((l) => norm(l.machine) === k && l.kind !== "service" && l.date > r.lastService!).reduce((a, l) => a + (l.hours || 0), 0) : null;
    return {
      ...r, seedKg: r1(r.seedKg), oilKg: r1(r.oilKg), sedimentKg: r1(r.sedimentKg),
      oilPct: r.seedKg ? r2((r.oilKg / r.seedKg) * 100) : null,
      sedimentPct: crude ? r2((r.sedimentKg / crude) * 100) : null,
      lossPct: lossW[k] ? r2(lossW[k].v / lossW[k].w) : null,
      unitsPerQtl: power[k] && seedForPower[k] ? r2(power[k] / (seedForPower[k] / 100)) : null,
      hours: r1(r.hours), downtimeHrs: r1(r.downtimeHrs),
      hoursSinceService: sinceService == null ? null : r1(sinceService),
      serviceDue: sinceService != null && sinceService >= (opts.serviceHours || SERVICE_HOURS),
      // oil still trapped in the sediment (about `trapPct` of its weight), valued at the oil rate
      sedimentLossInr: opts.oilRate && r.sedimentKg ? Math.round(r.sedimentKg * (opts.trapPct ?? 0.3) * opts.oilRate) : null,
    };
  }).sort((a, b) => b.seedKg - a.seedKg);
}
/** Where 100 kg of seed went: oil, sediment, cake (seed − crude − moisture), invisible loss. */
export function seedSplit(r: Pick<MachineRow, "seedKg" | "oilKg" | "sedimentKg" | "lossPct">) {
  if (!r.seedKg) return null;
  const oil = (r.oilKg / r.seedKg) * 100, sed = (r.sedimentKg / r.seedKg) * 100, loss = Math.max(0, r.lossPct || 0);
  return { oil: r1(oil), sediment: r1(sed), loss: r1(loss), cake: r1(Math.max(0, 100 - oil - sed - loss)) };
}

// ===========================================================================
// Demand forecast (per product, next 4 weeks) with festival lift
// ===========================================================================
export const FESTIVALS: { name: string; date: string; lift: number }[] = [
  { name: "Diwali", date: "2026-11-08", lift: 1.45 }, { name: "Christmas", date: "2026-12-25", lift: 1.05 },
  { name: "Sankranti", date: "2027-01-14", lift: 1.25 }, { name: "Ramzan Eid", date: "2027-03-10", lift: 1.25 },
  { name: "Ugadi", date: "2027-04-07", lift: 1.3 }, { name: "Bakrid", date: "2027-05-17", lift: 1.15 },
  { name: "Ganesh Chaturthi", date: "2027-09-04", lift: 1.3 }, { name: "Dasara", date: "2027-10-16", lift: 1.3 },
  { name: "Diwali", date: "2027-10-29", lift: 1.45 },
];
export interface Forecast { product: string; weekly: number[]; avg4: number; trendPct: number | null; next: { week: string; kg: number; festival: string | null }[]; next4: number }
export function demandForecast(d: BizData, today: string, weeks = 12): Forecast[] {
  const start = addDays(today, -weeks * 7 + 1);
  const by: Record<string, number[]> = {};
  const name: Record<string, string> = {};
  const add = (prod: string, date: string, kg: number) => {
    if (date < start || date > today || !(kg > 0)) return;
    const k = norm(prod); name[k] ||= prod;
    const w = Math.floor(gapDays(start, date) / 7);
    (by[k] ||= Array(weeks).fill(0))[w] += kg;
  };
  for (const e of d.register) if (e.kind === "SALE" && e.qty) add(registerItemName(e), e.date, e.qty);
  for (const x of d.sales) for (const l of x.lineItems || []) add(l.name, x.date, l.qty);
  return Object.entries(by).map(([k, w]) => {
    const last4 = w.slice(-4), prev4 = w.slice(-8, -4);
    const avg4 = last4.reduce((a, b) => a + b, 0) / 4;
    const p = prev4.reduce((a, b) => a + b, 0) / 4;
    const trend = p > 0 ? (avg4 - p) / p : 0;
    const base = 0.6 * avg4 + 0.4 * (w.reduce((a, b) => a + b, 0) / weeks);
    const next = [1, 2, 3, 4].map((i) => {
      const ws = addDays(today, (i - 1) * 7 + 1), we = addDays(ws, 6);
      const f = FESTIVALS.find((x) => x.date >= addDays(ws, -3) && x.date <= addDays(we, 3));
      const kg = Math.max(0, base * (1 + Math.max(-0.3, Math.min(0.3, trend)) * 0.5) * (f ? f.lift : 1));
      return { week: ws, kg: Math.round(kg), festival: f?.name || null };
    });
    return { product: name[k], weekly: w.map(Math.round), avg4: Math.round(avg4), trendPct: p > 0 ? Math.round(trend * 100) : null, next, next4: next.reduce((a, x) => a + x.kg, 0) };
  }).filter((f) => f.weekly.some((x) => x > 0)).sort((a, b) => b.next4 - a.next4);
}

// ===========================================================================
// Anomaly watch: things that look wrong, owner only
// ===========================================================================
export interface Anomaly { level: "red" | "orange"; area: string; text: string; path: string; date: string }
const istHour = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
export function anomalies(d: BizData, today: string, o: { cards?: RateCards | null; budgets?: Budgets | null; days?: number } = {}): Anomaly[] {
  const from = addDays(today, -(o.days ?? 3) + 1);
  const out: Anomaly[] = [];
  const hist = d.register.filter((e) => e.date >= addDays(today, -45) && e.date < from);
  // 1. sale rate well below the usual (or the rate card)
  const usual: Record<string, number[]> = {};
  for (const e of hist) if (e.kind === "SALE" && e.rateInr) (usual[norm(registerItemName(e))] ||= []).push(e.rateInr);
  for (const e of d.register) {
    if (e.date < from || e.date > today) continue;
    const item = registerItemName(e);
    if (e.kind === "SALE" && e.rateInr) {
      const card = rateFor(o.cards, e.partyName, item);
      const med = median(usual[norm(item)] || []);
      const ref = card?.rate || ((usual[norm(item)] || []).length >= 5 ? med : 0);
      if (ref && e.rateInr < ref * 0.92) out.push({ level: e.rateInr < ref * 0.85 ? "red" : "orange", area: "Low rate", text: `${item} sold at ₹${e.rateInr} to ${e.partyName || "walk-in"} — usual ₹${Math.round(ref)} (${Math.round((1 - e.rateInr / ref) * 100)}% less)`, path: `/register?date=${e.date}`, date: e.date });
    }
    // 2. entries made late at night, or for a day long gone
    const made = businessDate(e.createdAt);
    if (gapDays(e.date, made) >= 2 && e.amountInr >= 1000) out.push({ level: "orange", area: "Back-dated", text: `${kindWord(e)} ₹${Math.round(e.amountInr)} for ${dmy(e.date)} was entered on ${dmy(made)}`, path: `/register?date=${e.date}`, date: e.date });
    else { const h = istHour(e.createdAt); if ((h >= 23 || h < 5) && e.amountInr >= 2000) out.push({ level: "orange", area: "Late entry", text: `${kindWord(e)} ₹${Math.round(e.amountInr)} entered at ${h}:00 at night`, path: `/register?date=${e.date}`, date: e.date }); }
    // 3. an entry edited after saving
    const edits = (e.details as { edits?: unknown[] } | null)?.edits;
    if (Array.isArray(edits) && edits.length && e.amountInr >= 1000) out.push({ level: "orange", area: "Edited", text: `${kindWord(e)} ₹${Math.round(e.amountInr)} (${dmy(e.date)}) was changed ${edits.length}× after saving`, path: `/register?date=${e.date}`, date: e.date });
  }
  // 4. an expense day far above normal
  const exHist: Record<string, number> = {};
  for (const e of hist) if (e.kind === "EXPENSE") exHist[e.date] = (exHist[e.date] || 0) + e.amountInr;
  const normalDay = median(Object.values(exHist));
  for (let i = 0; i < (o.days ?? 3); i++) {
    const day = addDays(today, -i);
    const t = d.register.filter((e) => e.kind === "EXPENSE" && e.date === day).reduce((a, e) => a + e.amountInr, 0);
    if (normalDay > 0 && t > normalDay * 3 && t > 2000) out.push({ level: "orange", area: "Expenses", text: `Expenses on ${dmy(day)} were ₹${Math.round(t)} — about ${Math.round(t / normalDay)}× a normal day`, path: `/register?date=${day}`, date: day });
  }
  // 5. cash count short at closing
  for (const c of d.closings) {
    if (c.date < from) continue;
    const diff = c.cashDiffInr;
    // cashDiffInr > 0 means short (system cash more than counted)
    if (typeof diff === "number" && diff > 200) out.push({ level: diff > 1000 ? "red" : "orange", area: "Cash short", text: `Cash was ₹${Math.round(diff)} short at closing on ${dmy(c.date)}`, path: "/cash", date: c.date });
  }
  // 6. big discount on a bill
  for (const x of d.sales) {
    if (x.date < from) continue;
    const big = (x.lineItems || []).filter((l) => (l.discountPct || 0) >= 10);
    if (big.length) out.push({ level: "orange", area: "Discount", text: `${x.invoiceNo} (${x.party?.name || ""}) has ${big.map((l) => `${l.discountPct}% off ${l.name}`).join(", ")}`, path: "/sales", date: x.date });
  }
  // 7. budget crossed
  for (const b of budgetRows(o.budgets, d, today)) if (b.level === "over") out.push({ level: "orange", area: "Budget", text: `${b.name}: ₹${Math.round(b.spent)} spent, limit ₹${b.limit}`, path: "/insights#budget", date: today });
  return out.sort((a, b) => (a.level === b.level ? (a.date < b.date ? 1 : -1) : a.level === "red" ? -1 : 1)).slice(0, 15);
}
const dmy = (d: string) => d.split("-").reverse().join("-");
const kindWord = (e: RegisterRow) => ({ SALE: "Sale", PURCHASE: "Purchase", EXPENSE: "Expense", PAYMENT: "Payment", UDHAAR_IN: "Udhaar in", FRESH_CRUSH: "Fresh crush" } as Record<string, string>)[e.kind] || e.kind;
function businessDate(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}

// ===========================================================================
// Weekly review (Sunday morning, chat + Insights)
// ===========================================================================
export function weeklyReview(d: BizData, today: string, o: { cards?: RateCards | null; budgets?: Budgets | null } = {}) {
  const end = addDays(today, -1), start = addDays(end, -6);
  const pEnd = addDays(start, -1), pStart = addDays(pEnd, -6);
  const now = profitLoss(d, { from: start, to: end }), prev = profitLoss(d, { from: pStart, to: pEnd });
  const ch = (a: number, b: number) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))}%` : "");
  const top = salesReport(d, { from: start, to: end });
  const items = (top.byItem || []).slice(0, 3);
  const ex = expenseReport(d, { from: start, to: end });
  const ud = udhaarReport(d, end), udPrev = udhaarReport(d, pEnd);
  const buys = purchaseReport(d, { from: start, to: end });
  const fc = demandForecast(d, today).slice(0, 3);
  const watch = anomalies(d, end, { ...o, days: 7 }).slice(0, 5);
  const lines: string[] = [
    `**🗓️ Week ${dmy(start)} → ${dmy(end)}**`,
    `💰 Sales ₹${Math.round(now.sales).toLocaleString("en-IN")} ${ch(now.sales, prev.sales)} · net ₹${Math.round(now.net).toLocaleString("en-IN")} ${ch(now.net, prev.net)}`,
    `🛒 Bought ₹${Math.round(buys.total).toLocaleString("en-IN")} · 💸 expenses ₹${Math.round(now.expenses).toLocaleString("en-IN")}${ex.byCategory[0] ? ` (most: ${ex.byCategory[0].key})` : ""}`,
    `🙌 Udhaar outstanding ₹${Math.round(ud.outstanding).toLocaleString("en-IN")} ${ud.outstanding > udPrev.outstanding ? "▲ grew" : "▼ came down"} by ₹${Math.abs(Math.round(ud.outstanding - udPrev.outstanding)).toLocaleString("en-IN")}`,
  ];
  if (items.length) lines.push(`🏆 Best sellers: ${items.map((i) => i.key).join(", ")}`);
  if (fc.length) lines.push(`📦 Next 4 weeks: ${fc.map((f) => `${f.product} ~${f.next4} kg${f.next.some((n) => n.festival) ? ` (${f.next.find((n) => n.festival)!.festival})` : ""}`).join(" · ")}`);
  const todo: string[] = [];
  if (ud.outstanding > udPrev.outstanding) todo.push("Collect udhaar — it grew this week");
  if (now.net < prev.net && prev.net > 0) todo.push("Profit fell — check rates against the rate card and cost");
  const fest = fc.find((f) => f.next.some((n) => n.festival));
  if (fest) todo.push(`Stock up for ${fest.next.find((n) => n.festival)!.festival}`);
  if (watch.length) lines.push("", "**👀 Look at**", ...watch.map((w) => `${w.level === "red" ? "🔴" : "🟠"} ${w.text}`));
  if (todo.length) lines.push("", "**✅ This week**", ...todo.map((t, i) => `${i + 1}. ${t}`));
  return { start, end, text: lines.join("\n"), now, prev };
}
