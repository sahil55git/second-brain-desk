// 📦 Stock & shop-floor tools: seed godown stacks, contracts / forward buys, packing material + BOM,
// maintenance plan + spares, settling-tank timers, tank dipstick charts, cycle counting, stock
// variance and barrel deposits. Records come from the generic OpsRecord table (kind + data).
// Pure — tested in lib/__tests__/stockOps.test.ts.
import { poProgress, type PoLine } from "./ops";
import { stockTallyReport, type BizData } from "./bizReports";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const gapDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export interface OpsRec { id: string; kind: string; date: string; ref: string | null; data: Record<string, unknown>; status: string; createdAt?: string }
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

// ===========================================================================
// Seed godown: stacks of bags in, out, and moisture checks
// ===========================================================================
// godown_in  { stack, seed, supplier, bags, kg, moisturePct, rate }   ref = stack
// godown_out { stack, bags, kg, to }                                   ref = stack
// godown_check { stack, moisturePct, note }                           ref = stack
export interface Stack { stack: string; seed: string; supplier: string; inDate: string; bagsIn: number; kgIn: number; bagsLeft: number; kgLeft: number; moistureIn: number | null; moistureNow: number | null; shrinkKg: number; ageDays: number; valueInr: number | null; fifo: boolean; warn: string | null }
export function godownStacks(recs: OpsRec[], today: string): Stack[] {
  const by: Record<string, Stack & { rate: number | null }> = {};
  for (const r of [...recs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const k = norm(r.ref || r.data.stack);
    if (!k) continue;
    if (r.kind === "godown_in") {
      const s = (by[k] ||= { stack: str(r.data.stack || r.ref), seed: str(r.data.seed), supplier: str(r.data.supplier), inDate: r.date, bagsIn: 0, kgIn: 0, bagsLeft: 0, kgLeft: 0, moistureIn: null, moistureNow: null, shrinkKg: 0, ageDays: 0, valueInr: null, fifo: false, warn: null, rate: null });
      s.bagsIn += num(r.data.bags); s.kgIn += num(r.data.kg); s.bagsLeft += num(r.data.bags); s.kgLeft += num(r.data.kg);
      if (r.data.moisturePct != null && r.data.moisturePct !== "") { s.moistureIn = num(r.data.moisturePct); s.moistureNow ??= s.moistureIn; }
      if (num(r.data.rate)) s.rate = num(r.data.rate);
    } else if (by[k] && r.kind === "godown_out") {
      by[k].bagsLeft -= num(r.data.bags); by[k].kgLeft -= num(r.data.kg);
    } else if (by[k] && r.kind === "godown_check" && r.data.moisturePct != null) {
      by[k].moistureNow = num(r.data.moisturePct);
    }
  }
  const open = Object.values(by).filter((s) => s.kgLeft > 0.5 || s.bagsLeft > 0);
  // weight lost as the seed dries: kg × (m0 − m1) / (100 − m1)
  for (const s of open) {
    s.ageDays = gapDays(s.inDate, today);
    if (s.moistureIn != null && s.moistureNow != null && s.moistureNow < s.moistureIn) s.shrinkKg = r1((s.kgLeft * (s.moistureIn - s.moistureNow)) / (100 - s.moistureNow));
    s.valueInr = s.rate ? Math.round((s.kgLeft - s.shrinkKg) * s.rate) : null;
    s.kgLeft = r1(s.kgLeft);
  }
  // oldest stack of each seed should be used first
  const oldest: Record<string, string> = {};
  for (const s of [...open].sort((a, b) => (a.inDate < b.inDate ? -1 : 1))) oldest[norm(s.seed)] ||= s.stack;
  for (const s of open) {
    s.fifo = oldest[norm(s.seed)] === s.stack;
    s.warn = s.moistureNow != null && s.moistureNow > 9 ? `moisture ${s.moistureNow}% — dry it, risk of fungus` : s.ageDays > 90 ? `${s.ageDays} days old — use soon` : null;
  }
  return open.map(({ rate: _r, ...s }) => { void _r; return s; }).sort((a, b) => (a.inDate < b.inDate ? -1 : 1));
}

// ===========================================================================
// Contracts / forward buys → reuse the purchase-order filling
// ===========================================================================
// contract { supplier, item, qty, unit, rate, from, to }   status open | cancelled
export function contractProgress(recs: OpsRec[], d: BizData, today: string) {
  const orders = recs.filter((r) => r.kind === "contract").map((r) => ({
    id: r.id, no: `C-${r.id.slice(-4).toUpperCase()}`, date: str(r.data.from) || r.date, supplier: str(r.data.supplier), dueDate: str(r.data.to) || null, status: r.status === "cancelled" ? "cancelled" : "open",
    lines: [{ item: str(r.data.item), qty: num(r.data.qty), unit: str(r.data.unit) || "kg", rate: num(r.data.rate) }] as PoLine[],
  }));
  return poProgress(orders, d, today).map((p) => {
    const l = p.lines[0];
    const daysLeft = p.dueDate ? gapDays(today, p.dueDate) : null;
    const pace = daysLeft != null && daysLeft > 0 && l.left > 0 ? r1(l.left / daysLeft) : null;
    return { ...p, item: l.item, booked: l.qty, got: l.got, left: l.left, rate: l.rate, avgRate: l.avgRate, daysLeft, perDayNeeded: pace, valueLeft: Math.round(l.left * l.rate) };
  });
}

// ===========================================================================
// Packing material + BOM
// ===========================================================================
// pack_item { name, unit, cost, opening, reorder }  ref = name
// pack_move { name, qty (+in / −out), note }         ref = name
// pack_bom  { sku, parts: [{ name, qty }] }          ref = sku
// pack_run  { sku, units }                            ref = sku  (uses the BOM)
export interface PackRow { name: string; unit: string; cost: number; stock: number; reorder: number; low: boolean; usedPerDay: number; daysLeft: number | null }
export function packingStock(recs: OpsRec[], today: string, lookback = 30): PackRow[] {
  const items: Record<string, PackRow> = {};
  const bom: Record<string, { name: string; qty: number }[]> = {};
  const used: Record<string, number> = {};
  for (const r of recs) {
    if (r.kind === "pack_item") { const k = norm(r.data.name || r.ref); items[k] = { name: str(r.data.name || r.ref), unit: str(r.data.unit) || "pcs", cost: num(r.data.cost), stock: num(r.data.opening), reorder: num(r.data.reorder), low: false, usedPerDay: 0, daysLeft: null }; }
    if (r.kind === "pack_bom") bom[norm(r.data.sku || r.ref)] = (Array.isArray(r.data.parts) ? r.data.parts : []) as { name: string; qty: number }[];
  }
  for (const r of [...recs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const recent = gapDays(r.date, today) < lookback;
    if (r.kind === "pack_move") { const it = items[norm(r.data.name || r.ref)]; if (it) { it.stock += num(r.data.qty); if (num(r.data.qty) < 0 && recent) used[norm(it.name)] = (used[norm(it.name)] || 0) - num(r.data.qty); } }
    if (r.kind === "pack_run") for (const p of bom[norm(r.data.sku || r.ref)] || []) {
      const it = items[norm(p.name)];
      if (!it) continue;
      const q = num(p.qty) * num(r.data.units);
      it.stock -= q;
      if (recent) used[norm(it.name)] = (used[norm(it.name)] || 0) + q;
    }
  }
  return Object.values(items).map((it) => {
    const perDay = (used[norm(it.name)] || 0) / lookback;
    return { ...it, stock: r1(it.stock), low: it.stock <= it.reorder, usedPerDay: r2(perDay), daysLeft: perDay > 0 ? Math.floor(it.stock / perDay) : null };
  }).sort((a, b) => (a.low === b.low ? (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) : a.low ? -1 : 1));
}
/** Packing cost of one unit of each SKU from its BOM. */
export function bomCosts(recs: OpsRec[]): { sku: string; parts: { name: string; qty: number; cost: number }[]; cost: number; missing: string[] }[] {
  const items: Record<string, number> = {};
  for (const r of recs) if (r.kind === "pack_item") items[norm(r.data.name || r.ref)] = num(r.data.cost);
  return recs.filter((r) => r.kind === "pack_bom").map((r) => {
    const parts = ((Array.isArray(r.data.parts) ? r.data.parts : []) as { name: string; qty: number }[]).map((p) => ({ name: p.name, qty: num(p.qty), cost: r2(num(p.qty) * (items[norm(p.name)] ?? 0)) }));
    return { sku: str(r.data.sku || r.ref), parts, cost: r2(parts.reduce((a, p) => a + p.cost, 0)), missing: parts.filter((p) => items[norm(p.name)] == null).map((p) => p.name) };
  });
}

// ===========================================================================
// Maintenance plan + spares
// ===========================================================================
// maint_plan { machine, task, everyHours?, everyDays? }  ref = machine
// spare      { name, qty, min, cost }                     ref = name
// spare_move { name, qty (+/−), note }                    ref = name
export interface MachineLogLite2 { date: string; machine: string; kind: string; hours: number | null; note: string | null }
export interface MaintDue { machine: string; task: string; lastDone: string | null; hoursSince: number; daysSince: number | null; dueIn: string; overdue: boolean; pct: number }
export function maintenanceDue(recs: OpsRec[], logs: MachineLogLite2[], today: string): MaintDue[] {
  return recs.filter((r) => r.kind === "maint_plan").map((r) => {
    const machine = str(r.data.machine || r.ref), task = str(r.data.task);
    const everyH = num(r.data.everyHours), everyD = num(r.data.everyDays);
    const mine = logs.filter((l) => norm(l.machine) === norm(machine));
    const done = mine.filter((l) => l.kind === "service" && (!task || norm(l.note).includes(norm(task)) || !l.note)).map((l) => l.date).sort();
    const last = done[done.length - 1] || null;
    const hoursSince = r1(mine.filter((l) => l.kind !== "service" && (!last || l.date > last)).reduce((a, l) => a + (l.hours || 0), 0));
    const daysSince = last ? gapDays(last, today) : null;
    const pH = everyH ? hoursSince / everyH : 0, pD = everyD && daysSince != null ? daysSince / everyD : 0;
    const pct = Math.round(Math.max(pH, pD) * 100);
    const dueIn = everyH && (pH >= pD) ? `${Math.max(0, Math.round(everyH - hoursSince))} h` : everyD ? `${Math.max(0, everyD - (daysSince ?? everyD))} days` : "—";
    return { machine, task, lastDone: last, hoursSince, daysSince, dueIn, overdue: pct >= 100, pct };
  }).sort((a, b) => b.pct - a.pct);
}
export function sparesStock(recs: OpsRec[]): { name: string; qty: number; min: number; cost: number; low: boolean }[] {
  const s: Record<string, { name: string; qty: number; min: number; cost: number; low: boolean }> = {};
  for (const r of recs) if (r.kind === "spare") s[norm(r.data.name || r.ref)] = { name: str(r.data.name || r.ref), qty: num(r.data.qty), min: num(r.data.min), cost: num(r.data.cost), low: false };
  for (const r of recs) if (r.kind === "spare_move" && s[norm(r.data.name || r.ref)]) s[norm(r.data.name || r.ref)].qty += num(r.data.qty);
  return Object.values(s).map((x) => ({ ...x, low: x.qty <= x.min })).sort((a, b) => Number(b.low) - Number(a.low));
}

// ===========================================================================
// Settling-tank timers
// ===========================================================================
// settle { tank, product, kg, startAt (ISO), hours }  status open | done
export function settlingStatus(recs: OpsRec[], nowMs: number) {
  return recs.filter((r) => r.kind === "settle" && r.status !== "done").map((r) => {
    const start = Date.parse(str(r.data.startAt)) || Date.parse(`${r.date}T06:00:00Z`);
    const hours = num(r.data.hours) || 72;
    const readyAt = start + hours * 3600000;
    const leftH = (readyAt - nowMs) / 3600000;
    return { id: r.id, tank: str(r.data.tank), product: str(r.data.product), kg: num(r.data.kg), startAt: new Date(start).toISOString(), readyAt: new Date(readyAt).toISOString(), hours, leftH: r1(leftH), ready: leftH <= 0, pct: Math.max(0, Math.min(100, Math.round(((nowMs - start) / (hours * 3600000)) * 100))) };
  }).sort((a, b) => a.leftH - b.leftH);
}

// ===========================================================================
// Tank dipstick: cm → kg from each tank's calibration points
// ===========================================================================
export function dipToKg(points: { cm: number; kg: number }[], cm: number): number | null {
  const p = points.filter((x) => Number.isFinite(x.cm) && Number.isFinite(x.kg)).sort((a, b) => a.cm - b.cm);
  if (!p.length || !Number.isFinite(cm)) return null;
  if (p.length === 1) return r1((cm / p[0].cm) * p[0].kg);
  if (cm <= p[0].cm) return r1(Math.max(0, p[0].kg * (cm / p[0].cm)));
  for (let i = 1; i < p.length; i++) if (cm <= p[i].cm) {
    const a = p[i - 1], b = p[i];
    return r1(a.kg + ((cm - a.cm) / (b.cm - a.cm)) * (b.kg - a.kg));
  }
  const a = p[p.length - 2], b = p[p.length - 1];
  return r1(b.kg + ((cm - b.cm) / (b.cm - a.cm)) * (b.kg - a.kg));
}
/** A round tank lying flat / standing: kg from size when no chart is made yet. */
export function cylinderKg(o: { diameterCm: number; heightCm?: number; lyingLengthCm?: number; densityKgL?: number }, dipCm: number): number {
  const r = o.diameterCm / 2, dens = o.densityKgL ?? 0.91;
  if (o.lyingLengthCm) {
    const h = Math.min(Math.max(dipCm, 0), o.diameterCm);
    const area = r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h);
    return r1((area * o.lyingLengthCm) / 1000 * dens);
  }
  return r1((Math.PI * r * r * Math.max(0, dipCm)) / 1000 * dens);
}

// ===========================================================================
// Cycle counting: 3 items a day, every item counted at least once a fortnight
// ===========================================================================
export function cycleItems(all: string[], today: string, counted: { item: string; date: string }[], n = 3): string[] {
  const last: Record<string, string> = {};
  for (const c of counted) if (!last[norm(c.item)] || c.date > last[norm(c.item)]) last[norm(c.item)] = c.date;
  const seed = Number(today.replace(/-/g, "")) % 997;
  return [...all].sort((a, b) => {
    const la = last[norm(a)] || "0000", lb = last[norm(b)] || "0000";
    if (la !== lb) return la < lb ? -1 : 1; // never / longest ago first
    const ha = (a.length * 31 + a.charCodeAt(0) + seed) % 97, hb = (b.length * 31 + b.charCodeAt(0) + seed) % 97;
    return ha - hb;
  }).slice(0, n);
}
// cycle_count { item, book, counted }
export function cycleResults(recs: OpsRec[]) {
  return recs.filter((r) => r.kind === "cycle_count").map((r) => {
    const book = num(r.data.book), counted = num(r.data.counted);
    const diff = r1(counted - book);
    return { id: r.id, date: r.date, item: str(r.data.item), book, counted, diff, pct: book ? r1((diff / book) * 100) : null, flag: Math.abs(diff) >= 1 && (!book || Math.abs(diff / book) > 0.01) };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ===========================================================================
// Stock variance from the daily tallies
// ===========================================================================
export function varianceSummary(d: BizData, s: { from: string; to: string }, rates: Record<string, number> = {}) {
  const t = stockTallyReport(d, s);
  const by: Record<string, { product: string; tallies: number; flagged: number; netGap: number; absGap: number; worst: { date: string; session: string; gap: number } | null }> = {};
  for (const r of t.rows) {
    if (r.gap == null) continue;
    const p = (by[r.product] ||= { product: r.product, tallies: 0, flagged: 0, netGap: 0, absGap: 0, worst: null });
    p.tallies++; p.netGap += r.gap; p.absGap += Math.abs(r.gap);
    if (r.flagged) p.flagged++;
    if (!p.worst || Math.abs(r.gap) > Math.abs(p.worst.gap)) p.worst = { date: r.date, session: r.session, gap: r.gap };
  }
  const rows = Object.values(by).map((p) => ({ ...p, netGap: r1(p.netGap), absGap: r1(p.absGap), valueInr: rates[norm(p.product)] ? Math.round(p.netGap * rates[norm(p.product)]) : null })).sort((a, b) => b.absGap - a.absGap);
  const investigate = t.rows.filter((r) => r.flagged).sort((a, b) => Math.abs(b.gap || 0) - Math.abs(a.gap || 0)).slice(0, 15).map((r) => ({
    ...r,
    hint: (r.gap || 0) > 0 ? "less in tank than the books — a sale not entered, spill, or wrong count" : "more in tank than the books — a sale entered twice, purchase not entered, or wrong count",
  }));
  return { rows, investigate, threshold: t.threshold };
}

// ===========================================================================
// Barrel deposits: barrels out with customers / suppliers
// ===========================================================================
export interface FleetLite { code: string; location: string; holder: string | null; sinceAt: string; status: string; product: string | null; netKg: number | null }
export function barrelDeposits(fleet: FleetLite[], nowMs: number, o: { perBarrelInr?: number; maxDays?: number; paid?: Record<string, number> } = {}) {
  const per = o.perBarrelInr ?? 0, max = o.maxDays ?? 15;
  const by: Record<string, { holder: string; place: string; barrels: { code: string; days: number; status: string; product: string | null }[]; oldestDays: number; depositDue: number; paid: number; late: number }> = {};
  for (const b of fleet) {
    if (!["CUSTOMER", "SUPPLIER", "VEHICLE"].includes(b.location)) continue;
    const holder = (b.holder || "(unknown)").trim();
    const h = (by[norm(holder)] ||= { holder, place: b.location, barrels: [], oldestDays: 0, depositDue: 0, paid: o.paid?.[norm(holder)] || 0, late: 0 });
    const days = Math.floor((nowMs - Date.parse(b.sinceAt)) / 86400000);
    h.barrels.push({ code: b.code, days, status: b.status, product: b.product });
    h.oldestDays = Math.max(h.oldestDays, days);
    if (days > max) h.late++;
  }
  return Object.values(by).map((h) => ({ ...h, depositDue: Math.max(0, h.barrels.length * per - h.paid) })).sort((a, b) => b.oldestDays - a.oldestDays);
}
