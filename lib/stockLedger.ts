// One stock figure per oil.
//
// Until now the app showed three unrelated lists: the physical count (daily tally), what the
// bills say, and what the Quick Register says. This puts them on one line per oil:
//
//   counted      the last physical count (tank weight or the daily tally)
//   carried      that count, plus what came in and minus what went out since it was taken
//   book         the first count on record, plus everything in, minus everything out since then
//   gap          carried − book: oil the books cannot explain (minus = less oil than the books say)
//
// Which of the two is "the stock" is the owner's choice (settings key "stockLedger"):
//   physical  the carried count is the stock for every oil; the book is a check
//   book      the book is the stock for every oil; the count is a check
//   hybrid    per oil: oils kept in a tank follow the count, the rest follow the book,
//             and the owner can override any single oil
// Switching mode never changes a record; it only changes which figure is shown as the stock.
//
// Pure functions (no database). Tested in lib/__tests__/stockLedger.test.ts.
import { STOCK_PRODUCTS } from "./calculations";
import { TANKS } from "./stockTanks";
import { sessionStamp } from "./stockTally";
import type { BizData } from "./bizReports";

export type Basis = "physical" | "book";
export type LedgerMode = "physical" | "book" | "hybrid";
export interface LedgerSettings {
  mode: LedgerMode;
  /** hybrid only: the owner's choice for single oils (the rest use the tank rule) */
  perProduct: Record<string, Basis>;
  /** the book starts from the first count on or after this date (empty = the first count ever) */
  bookStart: string | null;
}
export const LEDGER_DEFAULT: LedgerSettings = { mode: "hybrid", perProduct: {}, bookStart: null };

/** One litre of edible oil weighs about this many kg. Used only when an entry was made in litres. */
export const LTR_TO_KG = 0.91;
const TANK_KEYS = new Set(TANKS.flatMap((t) => [t.key, ...(t.also || []).map((a) => a.key)]));

export function ledgerSettings(saved: unknown): LedgerSettings {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const mode: LedgerMode = s.mode === "physical" || s.mode === "book" || s.mode === "hybrid" ? s.mode : LEDGER_DEFAULT.mode;
  const perProduct: Record<string, Basis> = {};
  if (s.perProduct && typeof s.perProduct === "object") {
    for (const p of STOCK_PRODUCTS) {
      const v = (s.perProduct as Record<string, unknown>)[p.key];
      if (v === "physical" || v === "book") perProduct[p.key] = v;
    }
  }
  return { mode, perProduct, bookStart: typeof s.bookStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.bookStart) ? s.bookStart : null };
}

/** Which figure is the stock for this oil under these settings. */
export function basisFor(key: string, s: LedgerSettings): Basis {
  if (s.mode === "physical") return "physical";
  if (s.mode === "book") return "book";
  return s.perProduct[key] ?? (TANK_KEYS.has(key) ? "physical" : "book");
}

// --------------------------------------------------------------------------- names → oils
const ALIASES: [string, RegExp][] = [
  ["golddrop", /gold\s*drop|goldrop/],
  ["k2", /\bk\s*-?2\b/],
  ["sf", /sun\s*flower|\bsf\b|suryakanti/],
  ["karadi1", /karadi|safflower|kusube|kusum/],
  ["groundnut", /ground\s*nut|shenga|peanut|\bgn\b/],
  ["soyabean", /soya|soybean|soy\b/],
  ["coconut", /coconut|kobbari|copra/],
  ["teapowder", /\btea\b|chaha|chai/],
  ["til", /\btil\b|sesame|ellu|gingelly/],
  ["mustard", /mustard|sasive|sarson/],
];
/** The tally product an item / tank name means, or null when it is not one of the ten. */
export function productKeyFor(name: string | null | undefined): string | null {
  const n = String(name || "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!n) return null;
  const exact = STOCK_PRODUCTS.find((p) => p.key === n);
  if (exact) return exact.key;
  for (const [key, re] of ALIASES) if (re.test(n)) return key;
  return null;
}

// --------------------------------------------------------------------------- movements
export type MoveSource = "register sale" | "register purchase" | "sales bill" | "purchase bill" | "fresh crush to tank" | "mill transfer" | "packing";
export interface LedgerMove {
  product: string;
  date: string;
  /** when it happened (ms) */
  at: number;
  kg: number;
  dir: "in" | "out";
  source: MoveSource;
  /** converted from litres */
  approx: boolean;
}
export interface NotCounted {
  name: string;
  why: "not a tallied oil" | "unit is not kg or litre" | "sale saved as one total, no item";
  entries: number;
  qty: number;
}
export interface OpsLite {
  id: string;
  kind: string;
  date: string;
  data: Record<string, unknown>;
  createdAt?: string;
}

const noon = (date: string) => Date.parse(`${date}T12:00:00+05:30`);
/** The entry's own time when it was typed on its business day; noon for an entry dated to another day. */
function stamp(date: string, createdAt: string | undefined | null): number {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(t)) return noon(date);
  const ist = new Date(t + 5.5 * 3600000).toISOString().slice(0, 10);
  return ist === date ? t : noon(date);
}
function toKg(qty: number, unit: string | null | undefined): { kg: number; approx: boolean } | null {
  const u = (unit || "kg").toLowerCase();
  if (u === "kg" || u === "kgs") return { kg: qty, approx: false };
  if (u === "ltr" || u === "l" || u === "litre" || u === "liter") return { kg: qty * LTR_TO_KG, approx: true };
  return null;
}

/** Every recorded movement of a tallied oil, and what could not be counted (never silently dropped). */
export function ledgerMoves(d: BizData, ops: OpsLite[] = []): { moves: LedgerMove[]; notCounted: NotCounted[] } {
  const moves: LedgerMove[] = [];
  const skipped = new Map<string, NotCounted>();
  const skip = (name: string, why: NotCounted["why"], qty: number) => {
    const k = `${why}|${name.toLowerCase()}`;
    const s = skipped.get(k) ?? { name, why, entries: 0, qty: 0 };
    s.entries++;
    s.qty += qty;
    skipped.set(k, s);
  };
  const add = (name: string, qty: number, unit: string | null | undefined, dir: "in" | "out", source: MoveSource, date: string, at: number) => {
    const product = productKeyFor(name);
    if (!product) return skip(name || "(no name)", "not a tallied oil", qty);
    const w = toKg(qty, unit);
    if (!w) return skip(name, "unit is not kg or litre", qty);
    moves.push({ product, date, at, kg: w.kg, dir, source, approx: w.approx });
  };

  for (const e of d.register) {
    const at = stamp(e.date, e.createdAt);
    if (e.kind === "SALE") {
      if (!e.item && !e.itemLabel) {
        skip("Total sale", "sale saved as one total, no item", 0);
        continue;
      }
      if (e.qty && e.qty > 0) add(e.itemLabel || e.item || "", e.qty, e.unit, "out", "register sale", e.date, at);
    } else if (e.kind === "PURCHASE") {
      if (e.qty && e.qty > 0) add(e.itemLabel || e.item || "", e.qty, e.unit, "in", "register purchase", e.date, at);
    } else if (e.kind === "FRESH_CRUSH") {
      // oil crushed in front of the customer is sold on the spot; only the extra goes into a tank
      const x = (e.details && typeof e.details === "object" ? e.details : {}) as { extraKg?: unknown; extraTo?: unknown };
      const extra = Number(x.extraKg);
      if (Number.isFinite(extra) && extra > 0) {
        const tank = productKeyFor(typeof x.extraTo === "string" ? x.extraTo : "") ?? productKeyFor(e.itemLabel || e.item);
        if (tank) moves.push({ product: tank, date: e.date, at, kg: extra, dir: "in", source: "fresh crush to tank", approx: false });
        else skip(String(x.extraTo || e.item || "fresh crush"), "not a tallied oil", extra);
      }
    }
  }
  for (const inv of d.sales) {
    const at = stamp(inv.date, (inv as { createdAt?: string }).createdAt);
    for (const l of inv.lineItems || []) {
      const kept = l.qty - (l.returnedQty ?? 0);
      if (kept > 0) add(l.name, kept, l.unit, "out", "sales bill", inv.date, at);
    }
  }
  for (const b of d.purchases) {
    const at = stamp(b.date, (b as { createdAt?: string }).createdAt);
    for (const l of b.lineItems || []) if (l.qty > 0) add(l.name, l.qty, l.unit, "in", "purchase bill", b.date, at);
  }
  for (const r of ops) {
    const kg = Number(r.data.oilKg);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    const at = stamp(r.date, r.createdAt);
    if (r.kind === "mill_transfer") {
      const product = r.data.toTank === "k2" ? "k2" : r.data.toTank === "tank1" ? "karadi1" : null;
      if (product) moves.push({ product, date: r.date, at, kg, dir: "in", source: "mill transfer", approx: false });
    } else if (r.kind === "pack_run") {
      const tank = TANKS.find((t) => t.name === r.data.fromTank);
      if (tank) moves.push({ product: tank.key, date: r.date, at, kg, dir: "out", source: "packing", approx: false });
    }
  }
  moves.sort((a, b) => a.at - b.at);
  return { moves, notCounted: Array.from(skipped.values()).map((s) => ({ ...s, qty: r2(s.qty) })).sort((a, b) => b.entries - a.entries) };
}

// --------------------------------------------------------------------------- counts
export interface CountPoint {
  product: string;
  date: string;
  session: string;
  at: number;
  kg: number;
}
/** Every physical count on record, oldest first. */
export function ledgerCounts(closings: BizData["closings"]): CountPoint[] {
  const out: CountPoint[] = [];
  for (const c of closings) {
    for (const [product, v] of Object.entries(c.stock || {})) {
      const kg = (v as { today?: number | null })?.today;
      if (typeof kg === "number" && Number.isFinite(kg) && kg >= 0) out.push({ product, date: c.date, session: c.session, at: sessionStamp(c.date, c.session).getTime(), kg });
    }
  }
  // a session saved twice (corrected count): the later save of the same slot wins
  out.sort((a, b) => a.at - b.at);
  const last = new Map<string, CountPoint>();
  for (const c of out) last.set(`${c.product}|${c.at}`, c);
  return Array.from(last.values()).sort((a, b) => a.at - b.at);
}

// --------------------------------------------------------------------------- the ledger
export interface LedgerRow {
  key: string;
  label: string;
  /** tally products added into this row (Karadi = tank 1 + K2) */
  members: string[];
  basis: Basis;
  /** the stock under the chosen basis (null = never counted) */
  stockKg: number | null;
  counted: { kg: number; date: string; session: string } | null;
  inSinceKg: number;
  outSinceKg: number;
  carriedKg: number | null;
  bookFrom: { kg: number; date: string } | null;
  bookInKg: number;
  bookOutKg: number;
  bookKg: number | null;
  gapKg: number | null;
  gapPct: number | null;
  /** a gap worth looking at: 1 kg or more AND more than 1 % of the book */
  flag: boolean;
  /** some entries were in litres and converted at 0.91 kg per litre */
  approx: boolean;
  /** days since the last count */
  countAgeDays: number | null;
}
export interface Ledger {
  asOf: string;
  settings: LedgerSettings;
  rows: LedgerRow[];
  notCounted: NotCounted[];
  totals: { stockKg: number; flagged: number; neverCounted: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** K2 feeds Karadi tank 1 and moves between the two are not logged, so they are one line. */
const GROUPS: { key: string; label: string; members: string[] }[] = [{ key: "karadi", label: "Karadi (tank 1 + K2)", members: ["karadi1", "k2"] }];
export const GAP_MIN_KG = 1;
export const GAP_MIN_PCT = 1;

interface Part {
  counted: CountPoint | null;
  inSince: number;
  outSince: number;
  bookFrom: CountPoint | null;
  bookIn: number;
  bookOut: number;
  approx: boolean;
}
function part(product: string, moves: LedgerMove[], counts: CountPoint[], asOfAt: number, bookStart: string | null): Part {
  const mine = counts.filter((c) => c.product === product && c.at <= asOfAt);
  const counted = mine.length ? mine[mine.length - 1] : null;
  const bookFrom = mine.find((c) => !bookStart || c.date >= bookStart) ?? null;
  const p: Part = { counted, inSince: 0, outSince: 0, bookFrom, bookIn: 0, bookOut: 0, approx: false };
  for (const m of moves) {
    if (m.product !== product || m.at > asOfAt) continue;
    if (counted && m.at > counted.at) {
      if (m.dir === "in") p.inSince += m.kg;
      else p.outSince += m.kg;
      if (m.approx) p.approx = true;
    }
    if (bookFrom && m.at > bookFrom.at) {
      if (m.dir === "in") p.bookIn += m.kg;
      else p.bookOut += m.kg;
      if (m.approx) p.approx = true;
    }
  }
  return p;
}

export function stockLedger(moves: LedgerMove[], counts: CountPoint[], notCounted: NotCounted[], asOf: string, saved?: unknown): Ledger {
  const settings = ledgerSettings(saved);
  const asOfAt = Date.parse(`${asOf}T23:59:59+05:30`);
  const grouped = new Set(GROUPS.flatMap((g) => g.members));
  const defs = [...STOCK_PRODUCTS.filter((p) => !grouped.has(p.key)).map((p) => ({ key: p.key, label: p.label, members: [p.key] })), ...GROUPS];
  const order = (k: string) => {
    const i = STOCK_PRODUCTS.findIndex((p) => p.key === k);
    return i < 0 ? 99 : i;
  };
  defs.sort((a, b) => order(a.members[0]) - order(b.members[0]));

  const rows: LedgerRow[] = defs.map((def) => {
    const parts = def.members.map((m) => part(m, moves, counts, asOfAt, settings.bookStart));
    const have = parts.filter((p) => p.counted);
    const sum = (f: (p: Part) => number) => parts.reduce((a, p) => a + f(p), 0);
    // the row is counted once any of its tanks was; a tank never counted adds nothing
    const lastCount = have.length ? have.reduce((a, p) => (p.counted!.at > a.counted!.at ? p : a)).counted! : null;
    const counted = lastCount ? { kg: r2(have.reduce((a, p) => a + p.counted!.kg, 0)), date: lastCount.date, session: lastCount.session } : null;
    const carriedKg = counted ? r2(counted.kg + sum((p) => (p.counted ? p.inSince - p.outSince : 0))) : null;
    const books = parts.filter((p) => p.bookFrom);
    const firstBook = books.length ? books.reduce((a, p) => (p.bookFrom!.at < a.bookFrom!.at ? p : a)).bookFrom! : null;
    const bookStartKg = books.reduce((a, p) => a + p.bookFrom!.kg, 0);
    const bookInKg = r2(sum((p) => (p.bookFrom ? p.bookIn : 0)));
    const bookOutKg = r2(sum((p) => (p.bookFrom ? p.bookOut : 0)));
    const bookKg = firstBook ? r2(bookStartKg + bookInKg - bookOutKg) : null;
    const gapKg = carriedKg !== null && bookKg !== null ? r2(carriedKg - bookKg) : null;
    const gapPct = gapKg !== null && bookKg !== null && Math.abs(bookKg) > 0.005 ? r2((gapKg / Math.abs(bookKg)) * 100) : null;
    // one basis per row: the owner's choice for the row's main tank
    const basis = basisFor(def.members[0], settings);
    return {
      key: def.key,
      label: def.label,
      members: def.members,
      basis,
      stockKg: basis === "physical" ? carriedKg : bookKg,
      counted,
      inSinceKg: r2(sum((p) => (p.counted ? p.inSince : 0))),
      outSinceKg: r2(sum((p) => (p.counted ? p.outSince : 0))),
      carriedKg,
      bookFrom: firstBook ? { kg: r2(bookStartKg), date: firstBook.date } : null,
      bookInKg,
      bookOutKg,
      bookKg,
      gapKg,
      gapPct,
      flag: gapKg !== null && Math.abs(gapKg) >= GAP_MIN_KG && (gapPct === null || Math.abs(gapPct) > GAP_MIN_PCT),
      approx: parts.some((p) => p.approx),
      countAgeDays: lastCount ? Math.max(0, Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${lastCount.date}T00:00:00Z`)) / 86400000)) : null,
    };
  });
  return {
    asOf,
    settings,
    rows,
    notCounted,
    totals: { stockKg: r2(rows.reduce((a, r) => a + (r.stockKg ?? 0), 0)), flagged: rows.filter((r) => r.flag).length, neverCounted: rows.filter((r) => !r.counted).length },
  };
}

// --------------------------------------------------------------------------- one oil, day by day
export interface LedgerDay {
  date: string;
  inKg: number;
  outKg: number;
  /** the closing count that day (the last one taken), when there was one */
  countedKg: number | null;
  /** previous count + in − out since it; null before the first count */
  expectedKg: number | null;
  /** counted − expected on a day with a count */
  gapKg: number | null;
  sources: string[];
}
/** Day by day for one ledger row: what moved, what was expected, what was counted. Newest first. */
export function ledgerDays(rowKey: string, moves: LedgerMove[], counts: CountPoint[], from: string, to: string): LedgerDay[] {
  const members = GROUPS.find((g) => g.key === rowKey)?.members ?? [rowKey];
  const out: LedgerDay[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return out;
  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const dayEnd = Date.parse(`${date}T23:59:59+05:30`);
    const dayMoves = moves.filter((m) => members.includes(m.product) && m.date === date);
    const inKg = dayMoves.filter((m) => m.dir === "in").reduce((a, m) => a + m.kg, 0);
    const outKg = dayMoves.filter((m) => m.dir === "out").reduce((a, m) => a + m.kg, 0);
    // Per tank: on a day it was counted, compare the count with (the count before it + what
    // moved in between). A tank not counted that day is carried forward on both sides, so it
    // adds nothing to the day's gap.
    const net = (m: string, after: number, until: number) =>
      moves.filter((mv) => mv.product === m && mv.at > after && mv.at <= until).reduce((a, mv) => a + (mv.dir === "in" ? mv.kg : -mv.kg), 0);
    let c = 0;
    let x = 0;
    let anyToday = false;
    let known = false;
    let firstCount = false;
    for (const m of members) {
      const mine = counts.filter((p) => p.product === m && p.at <= dayEnd);
      const todays = mine.filter((p) => p.date === date);
      const ref = todays.length ? todays[todays.length - 1] : null;
      if (ref) {
        anyToday = true;
        const before = mine.filter((p) => p.at < ref.at);
        const prev = before[before.length - 1];
        c += ref.kg;
        if (prev) {
          x += prev.kg + net(m, prev.at, ref.at);
          known = true;
        } else {
          x += ref.kg;
          firstCount = true; // nothing to compare the very first count with
        }
      } else if (mine.length) {
        const last = mine[mine.length - 1];
        const carried = last.kg + net(m, last.at, dayEnd);
        c += carried;
        x += carried;
        known = true;
      }
    }
    const counted = anyToday ? r2(c) : null;
    const expected = known && !(anyToday && firstCount && members.length === 1) ? r2(x) : null;
    if (!dayMoves.length && counted === null) continue;
    out.push({ date, inKg: r2(inKg), outKg: r2(outKg), countedKg: counted, expectedKg: expected, gapKg: counted !== null && expected !== null ? r2(counted - expected) : null, sources: Array.from(new Set(dayMoves.map((m) => m.source))) });
  }
  return out.reverse();
}
