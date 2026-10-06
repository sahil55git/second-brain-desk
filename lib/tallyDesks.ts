// Tally hub — shared maths for the six "count it, compare it, flag the gap"
// desks (job-work customer stock, seed, cake & by-products, packaging, udhar &
// supplier balances, tank dips). Pure functions only: the API computes the
// expected figure on the server and the screen shows the same numbers.
import { MASS_BALANCE_TOLERANCE_PCT } from "./register";

export type DeskId = "JOBWORK" | "SEED" | "CAKE" | "PACK" | "UDHAR" | "TANK";
/** direct = expected comes straight from the books; flow = previous count + in − out. */
export type DeskMode = "direct" | "flow";

export interface DeskMeta {
  id: DeskId;
  icon: string;
  title: string;
  kn: string;
  unit: string;
  mode: DeskMode;
  hint: string;
  /** may the user add their own rows (a customer, a tank, a packing item…)? */
  canAdd: boolean;
}

export const DESKS: DeskMeta[] = [
  { id: "JOBWORK", icon: "🧾", title: "Job-work customer stock", kn: "ಗ್ರಾಹಕರ ಬೀಜ ಸ್ಟಾಕ್", unit: "kg", mode: "direct", canAdd: true,
    hint: "Customer seed physically in the shop vs. the challans not yet settled. More than the books = unrecorded stock; less = processed or gone without a settled challan (GST s.143 / ITC-04 risk)." },
  { id: "SEED", icon: "🌾", title: "Seed & raw material", kn: "ಬೀಜ / ಕಚ್ಚಾ ವಸ್ತು", unit: "kg", mode: "flow", canAdd: true,
    hint: "Expected = last count + received − crushed (crushing is taken from the register's Fresh-crush entries)." },
  { id: "CAKE", icon: "🟤", title: "Cake & by-products", kn: "ಹಿಂಡಿ / ಉಪ-ಉತ್ಪನ್ನ", unit: "kg", mode: "flow", canAdd: true,
    hint: "Expected = last count + cake made (Fresh-crush entries) − cake sold. Add husk / sediment etc. as extra rows." },
  { id: "PACK", icon: "📦", title: "Packaging", kn: "ಪ್ಯಾಕಿಂಗ್", unit: "pcs", mode: "flow", canAdd: true,
    hint: "Tins, bottles, labels, cartons. Set a reorder level per item — the row turns amber when stock falls to it." },
  { id: "UDHAR", icon: "📒", title: "Udhar & supplier balances", kn: "ಉದ್ರಿ / ಸರಬರಾಜುದಾರ ಬಾಕಿ", unit: "₹", mode: "direct", canAdd: true,
    hint: "Customers: what the register says they owe you. Suppliers: credit purchases not yet paid. Enter what the party confirms." },
  { id: "TANK", icon: "🛢️", title: "Tank dip vs book stock", kn: "ಟ್ಯಾಂಕ್ ಅಳತೆ", unit: "kg", mode: "direct", canAdd: true,
    hint: "Enter the dip (cm) × kg per cm — or the kg directly. Compared with the last stock-tally figure for that tank." },
];
export const DESK_IDS = DESKS.map((d) => d.id);
export const deskMeta = (id: string) => DESKS.find((d) => d.id === id) || null;

export interface RowDef {
  key: string;
  label: string;
  unit: string;
  group?: string; // UDHAR: "customer" | "supplier"
  custom?: boolean;
  /** direct desks: expected figure from the books (null = nothing to compare with) */
  expected: number | null;
  /** flow desks */
  prev: number | null;
  autoIn: number;
  autoOut: number;
  /** values carried from the last saved count (reorder level, kg per cm …) */
  min?: number | null;
  kgPerCm?: number | null;
  /** explanation shown under the row ("3 open challans, oldest 9 days") */
  note?: string;
}

export interface RowInput {
  counted?: number | null;
  received?: number | null; // manual in (flow)
  used?: number | null; // manual out (flow)
  min?: number | null;
  dip?: number | null;
  kgPerCm?: number | null;
  label?: string;
  unit?: string;
  group?: string;
  custom?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Expected figure for a row, whatever the desk's mode. null = no basis yet. */
export function expectedFor(mode: DeskMode, def: Pick<RowDef, "expected" | "prev" | "autoIn" | "autoOut">, input: RowInput): number | null {
  if (mode === "direct") return def.expected;
  if (def.prev === null) return null; // first count sets the baseline
  return r2(def.prev + def.autoIn + (input.received || 0) - def.autoOut - (input.used || 0));
}

/** counted − expected (positive = more than the books, negative = less). */
export function gapOf(expected: number | null, counted: number | null): number | null {
  if (expected === null || counted === null || counted === undefined) return null;
  return r2(counted - expected);
}

/**
 * Is the gap big enough to flag? Quantities use the project's 2% mass-balance
 * tolerance (but never less than a floor so tiny stocks don't flag on rounding);
 * money and pieces flag on any real difference.
 */
export function isGapFlagged(desk: DeskId, expected: number | null, counted: number | null): boolean {
  const g = gapOf(expected, counted);
  if (g === null) return false;
  if (desk === "UDHAR") return Math.abs(g) >= 1;
  if (desk === "PACK") return Math.abs(g) >= 1;
  const floor = desk === "TANK" ? 1 : 0.5;
  return Math.abs(g) > Math.max(floor, ((expected || 0) * MASS_BALANCE_TOLERANCE_PCT) / 100);
}

/** Packaging: at or below the reorder level. */
export const isLow = (counted: number | null | undefined, min: number | null | undefined) =>
  counted !== null && counted !== undefined && min !== null && min !== undefined && min > 0 && counted <= min;

/** Counted value of a TANK row: kg typed directly, else dip (cm) × kg per cm. */
export function tankKg(i: RowInput): number | null {
  if (i.counted !== null && i.counted !== undefined) return i.counted;
  if (i.dip != null && i.kgPerCm != null && i.dip >= 0 && i.kgPerCm > 0) return r2(i.dip * i.kgPerCm);
  return null;
}

/** What a gap means, in plain words, per desk. */
export function gapMessage(desk: DeskId, gap: number | null): string {
  if (gap === null || gap === 0) return "";
  const more = gap > 0;
  switch (desk) {
    case "JOBWORK":
      return more ? "More seed than the challans show — UNRECORDED customer stock. Enter the challan." : "Less seed than the open challans — processed or released without a settled challan. Check before filing ITC-04.";
    case "UDHAR":
      return more ? "Party says they owe MORE than the register — a missing entry." : "Party says they owe LESS than the register — a payment may not have been recorded.";
    case "SEED":
    case "CAKE":
      return more ? "More than expected — a purchase or receipt may be missing." : "Less than expected — usage, sale or loss not recorded.";
    case "TANK":
      return more ? "Tank holds more than the book says." : "Tank holds less than the book says — check for loss or an unrecorded sale.";
    default:
      return more ? "More than expected." : "Less than expected — used or lost without a record.";
  }
}

// ---------------------------------------------------------------------------
// Books → expected figures
// ---------------------------------------------------------------------------
export interface IntakeLite { customer: string; seedKg: number; settled: boolean; settledAt?: Date | string | null; createdAt: Date | string }

/** Customer seed still in the shop: unsettled challans, per customer. */
export function jobWorkExpected(intakes: IntakeLite[], uptoMs: number, nowMs: number): RowDef[] {
  const by = new Map<string, { label: string; kg: number; n: number; oldest: number }>();
  for (const i of intakes) {
    const at = +new Date(i.createdAt);
    // still open as of that moment: not settled, or settled only afterwards
    if (at > uptoMs || (i.settled && (!i.settledAt || +new Date(i.settledAt) <= uptoMs))) continue;
    const name = i.customer.trim() || "(no name)";
    // same customer typed with different case / spacing = one customer
    const cur = by.get(name.toLowerCase()) || { label: name, kg: 0, n: 0, oldest: at };
    cur.kg += i.seedKg;
    cur.n += 1;
    cur.oldest = Math.min(cur.oldest, at);
    by.set(name.toLowerCase(), cur);
  }
  return Array.from(by.entries())
    .sort((a, b) => b[1].kg - a[1].kg)
    .map(([lk, v]) => ({
      key: `c:${lk}`,
      label: v.label,
      unit: "kg",
      expected: r2(v.kg),
      prev: null,
      autoIn: 0,
      autoOut: 0,
      note: `${v.n} open challan${v.n === 1 ? "" : "s"} · oldest ${Math.max(0, Math.floor((nowMs - v.oldest) / 86400000))} day(s)`,
    }));
}

export interface RegLite { date: string; kind: string; item: string | null; qty: number | null; unit: string | null; amountInr: number; paymentMode: string; partyName: string | null; details?: unknown }

/** Customers who owe us / suppliers we owe, per the register, as of a date. */
export function balancesAsOf(rows: RegLite[], asOf: string): RowDef[] {
  const cust = new Map<string, { label: string; v: number }>();
  const supp = new Map<string, { label: string; v: number }>();
  const add = (m: Map<string, { label: string; v: number }>, name: string, v: number) => {
    const k = name.toLowerCase();
    const cur = m.get(k) || { label: name, v: 0 };
    cur.v += v;
    m.set(k, cur);
  };
  for (const e of rows) {
    if (e.date > asOf) continue;
    const name = (e.partyName || "").trim();
    if (!name) continue;
    if (e.paymentMode === "CREDIT" && (e.kind === "SALE" || e.kind === "FRESH_CRUSH")) add(cust, name, e.amountInr);
    else if (e.kind === "UDHAAR_IN") add(cust, name, -e.amountInr);
    else if (e.paymentMode === "CREDIT" && e.kind === "PURCHASE") add(supp, name, e.amountInr);
    else if (e.kind === "PAYMENT" && e.item !== "salary") add(supp, name, -e.amountInr);
  }
  const mk = (m: Map<string, { label: string; v: number }>, group: string): RowDef[] =>
    Array.from(m.entries())
      .filter(([, x]) => Math.abs(x.v) >= 1)
      .sort((a, b) => b[1].v - a[1].v)
      .map(([k, x]) => ({ key: `${group[0]}:${k}`, label: x.label, unit: "₹", group, expected: r2(x.v), prev: null, autoIn: 0, autoOut: 0 }));
  return [...mk(cust, "customer"), ...mk(supp, "supplier")];
}

export const SEED_ROWS = [
  { key: "mustard", label: "Mustard seed" },
  { key: "sunflower", label: "Sunflower seed" },
  { key: "groundnut", label: "Groundnut seed" },
  { key: "karadi", label: "Karadi (safflower) seed" },
];
export const CAKE_ROWS = [
  { key: "cake", label: "Oil cake (khali)" },
];
export const PACK_ROWS = [
  { key: "tins", label: "Tins / cans" },
  { key: "bottles", label: "Bottles / pouches" },
  { key: "labels", label: "Labels" },
  { key: "cartons", label: "Cartons" },
];
export const TANK_ROWS = [
  { key: "karadi1", label: "Karadi (tank 1)" },
  { key: "k2", label: "K2 tank" },
];

/** Sum of Fresh-crush seed / cake per seed type for dates in (afterDate, upto]. */
export function crushTotals(rows: RegLite[], afterDate: string | null, upto: string) {
  const seed: Record<string, number> = {};
  let cake = 0;
  for (const e of rows) {
    if (e.kind !== "FRESH_CRUSH" || e.date > upto || (afterDate !== null && e.date <= afterDate)) continue;
    const d = (e.details || {}) as { seedKg?: number; cakeKg?: number };
    const k = e.item || "";
    seed[k] = (seed[k] || 0) + (Number(d.seedKg) || 0);
    cake += Number(d.cakeKg) || 0;
  }
  return { seed, cake };
}

/** Cake sold from the register (kg) for dates in (afterDate, upto]. */
export function cakeSold(rows: RegLite[], afterDate: string | null, upto: string): number {
  let t = 0;
  for (const e of rows) {
    if (e.kind !== "SALE" || e.item !== "cake" || e.date > upto || (afterDate !== null && e.date <= afterDate)) continue;
    t += e.qty || 0;
  }
  return t;
}

/** Packaging received per item (purchases of tins / labels), pieces. */
export function packReceived(rows: RegLite[], afterDate: string | null, upto: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of rows) {
    if (e.kind !== "PURCHASE" || e.date > upto || (afterDate !== null && e.date <= afterDate)) continue;
    if (e.item === "tins") out.tins = (out.tins || 0) + (e.qty || 0);
    if (e.item === "labels") out.labels = (out.labels || 0) + (e.qty || 0);
  }
  return out;
}

/** KV id under which a desk's count for a date is stored (RegisterConfig table). */
export const tallyId = (desk: DeskId, date: string) => `tally:${desk}:${date}`;
export const tallyPrefix = (desk: DeskId) => `tally:${desk}:`;
