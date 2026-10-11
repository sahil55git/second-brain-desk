// Quick Register — pure, testable logic (no React, no Prisma).
//
// The Quick Register is a counter CASH BOOK for the shop manager. Every
// money figure here is about physical cash in the counter drawer:
//   - UPI / udhaar (credit) entries are recorded but do NOT move the counter.
//   - PIGMEE and OWNER_DRAW take cash out of the counter but are NOT expenses.
//   - Job-work cash comes from JobWorkIntake rows (the Job-Work Desk's own
//     table), never from RegisterEntry, so it is counted exactly once.
//
// The settlement maths for job-work is NOT re-implemented here — it lives in
// lib/calculations.ts (expectedSettlement etc.) and is reused as-is.

import type { CashInputs } from "./calculations";

export type Side = "in" | "out" | "oth";
export type RegisterKind =
  | "SALE"
  | "FRESH_CRUSH"
  | "UDHAAR_IN"
  | "PURCHASE"
  | "EXPENSE"
  | "PAYMENT"
  | "PIGMEE"
  | "OWNER_DRAW";
export type Mode = "CASH" | "UPI" | "BANK" | "CREDIT" | "OTHER";
export type LangMode = "both" | "en" | "kn";

export const KIND_SIDE: Record<RegisterKind, Side> = {
  SALE: "in",
  FRESH_CRUSH: "in",
  UDHAAR_IN: "in",
  PURCHASE: "out",
  EXPENSE: "out",
  PAYMENT: "out",
  PIGMEE: "oth",
  OWNER_DRAW: "oth",
};

export const ALL_KINDS = Object.keys(KIND_SIDE) as RegisterKind[];

// ---------------------------------------------------------------------------
// Catalog (icon + English + Kannada). Custom items learned from "Other" are
// appended at runtime from RegisterConfig.customItems.
// ---------------------------------------------------------------------------
export type CatalogItem = { key: string; icon: string; en: string; kn: string };

export const CATALOG: Partial<Record<RegisterKind, CatalogItem[]>> = {
  SALE: [
    { key: "sunflower", icon: "🌻", en: "Sunflower", kn: "ಸೂರ್ಯಕಾಂತಿ" },
    { key: "karadi", icon: "🟠", en: "Karadi", kn: "ಕರಡಿ" },
    { key: "groundnut", icon: "🥜", en: "Groundnut", kn: "ಶೇಂಗಾ" },
    { key: "ekatva", icon: "🧴", en: "Ekatva", kn: "ಏಕತ್ವ" },
    { key: "cake", icon: "🟤", en: "Oil cake (khali)", kn: "ಹಿಂಡಿ" },
  ],
  // Our own seed crushed in front of the customer (fresh crush sale).
  FRESH_CRUSH: [
    { key: "groundnut", icon: "🥜", en: "Groundnut", kn: "ಶೇಂಗಾ" },
    { key: "karadi", icon: "🟠", en: "Karadi (safflower)", kn: "ಕರಡಿ (ಕುಸುಬೆ)" },
    { key: "sunflower", icon: "🌻", en: "Sunflower", kn: "ಸೂರ್ಯಕಾಂತಿ" },
    { key: "mustard", icon: "🟡", en: "Mustard", kn: "ಸಾಸಿವೆ" },
  ],
  PURCHASE: [
    { key: "seed", icon: "🌾", en: "Seed", kn: "ಬೀಜ" },
    { key: "oil", icon: "🛢️", en: "Oil", kn: "ಎಣ್ಣೆ" },
    { key: "tins", icon: "🥫", en: "Tins / cans", kn: "ಡಬ್ಬ" },
    { key: "labels", icon: "🏷️", en: "Labels / packing", kn: "ಲೇಬಲ್" },
  ],
  EXPENSE: [
    { key: "diesel", icon: "⛽", en: "Diesel", kn: "ಡೀಸೆಲ್" },
    { key: "tea", icon: "☕", en: "Tea / food", kn: "ಚಹಾ / ಊಟ" },
    { key: "power", icon: "💡", en: "Electricity", kn: "ವಿದ್ಯುತ್" },
    { key: "transport", icon: "🛺", en: "Transport", kn: "ಸಾಗಣೆ" },
    { key: "repair", icon: "🔧", en: "Repair", kn: "ರಿಪೇರಿ" },
  ],
  PAYMENT: [
    { key: "salary", icon: "👷", en: "Salary", kn: "ಸಂಬಳ" },
    { key: "supplier", icon: "🚚", en: "Supplier", kn: "ಸರಬರಾಜುದಾರ" },
  ],
};

export const OTHER_ITEM: CatalogItem = { key: "other", icon: "➕", en: "Other", kn: "ಇತರೆ" };

export const UNITS: CatalogItem[] = [
  { key: "kg", icon: "⚖️", en: "kg", kn: "ಕೆಜಿ" },
  { key: "ltr", icon: "🧴", en: "Litre", kn: "ಲೀಟರ್" },
  { key: "bags", icon: "🛍️", en: "Bags", kn: "ಚೀಲ" },
  { key: "pcs", icon: "🔢", en: "Pieces", kn: "ಸಂಖ್ಯೆ" },
  { key: "box", icon: "📦", en: "Box", kn: "ಬಾಕ್ಸ್" },
];

export const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;

// ---------------------------------------------------------------------------
// Config (RegisterConfig.data)
// ---------------------------------------------------------------------------
export interface CustomItem {
  key: string;
  label: string;
}

export interface RegisterConfigData {
  rates: Record<string, number>; // `${KIND}:${itemKey}` -> ₹ per unit
  customItems: Partial<Record<RegisterKind, CustomItem[]>>;
  pigmeeDefault: number;
  defaultLangMode: LangMode;
  openings: Record<string, number>; // date -> manual opening-cash override
  // Shop-wide defaults for a device that has never been set up (Settings).
  defaultLayout: "auto" | "side" | "stack";
  defaultFavs: string[];
  defaultWork: string;
  // Proof of payment (lib/proofs.ts): money-out kinds that must carry a
  // signature / photo before they can be saved, at or above proofMinInr.
  proofRequired: ("PAYMENT" | "PURCHASE" | "EXPENSE")[];
  proofMinInr: number;
}

export const DEFAULT_CONFIG: RegisterConfigData = {
  rates: {},
  customItems: {},
  pigmeeDefault: 1000,
  defaultLangMode: "both",
  openings: {},
  defaultLayout: "auto",
  defaultFavs: ["SALE", "EXPENSE", "jwNew"],
  defaultWork: "calc",
  proofRequired: [],
  proofMinInr: 0,
};

export function normalizeConfig(raw: unknown): RegisterConfigData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RegisterConfigData>;
  const lang = r.defaultLangMode;
  return {
    rates: { ...(r.rates || {}) },
    customItems: { ...(r.customItems || {}) },
    pigmeeDefault: typeof r.pigmeeDefault === "number" ? r.pigmeeDefault : DEFAULT_CONFIG.pigmeeDefault,
    defaultLangMode: lang === "en" || lang === "kn" || lang === "both" ? lang : "both",
    openings: { ...(r.openings || {}) },
    defaultLayout: r.defaultLayout === "side" || r.defaultLayout === "stack" ? r.defaultLayout : "auto",
    defaultFavs: Array.isArray(r.defaultFavs) ? r.defaultFavs.filter((x) => typeof x === "string").slice(0, 20) : [...DEFAULT_CONFIG.defaultFavs],
    defaultWork: typeof r.defaultWork === "string" ? r.defaultWork : "calc",
    proofRequired: Array.isArray(r.proofRequired)
      ? (["PAYMENT", "PURCHASE", "EXPENSE"] as const).filter((k) => (r.proofRequired as unknown[]).includes(k))
      : [],
    proofMinInr: typeof r.proofMinInr === "number" && r.proofMinInr >= 0 ? r.proofMinInr : 0,
  };
}

export const rateKey = (kind: RegisterKind, item?: string | null) => `${kind}:${item || "_"}`;

export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0C80-\u0CFF]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return s ? `c_${s}` : `c_${Date.now().toString(36)}`;
}

/** Catalog items for a kind: built-ins, then learned custom items, then "Other". */
export function itemsFor(kind: RegisterKind, cfg: RegisterConfigData): CatalogItem[] {
  const base = CATALOG[kind] || [];
  const custom = (cfg.customItems[kind] || []).map((c) => ({
    key: c.key,
    icon: "⭐",
    en: c.label,
    kn: c.label,
  }));
  return base.length || custom.length ? [...base, ...custom, OTHER_ITEM] : [];
}

/** Adds a learned custom item (idempotent). Returns the new config and the key. */
export function learnItem(
  cfg: RegisterConfigData,
  kind: RegisterKind,
  label: string
): { cfg: RegisterConfigData; key: string } {
  const clean = label.trim();
  const list = cfg.customItems[kind] || [];
  const existing = list.find((c) => c.label.toLowerCase() === clean.toLowerCase());
  if (existing) return { cfg, key: existing.key };
  const builtin = (CATALOG[kind] || []).find(
    (c) => c.en.toLowerCase() === clean.toLowerCase() || c.kn === clean
  );
  if (builtin) return { cfg, key: builtin.key };
  const key = slugify(clean);
  return {
    cfg: { ...cfg, customItems: { ...cfg.customItems, [kind]: [...list, { key, label: clean }] } },
    key,
  };
}

// ---------------------------------------------------------------------------
// Cash maths
// ---------------------------------------------------------------------------
export interface RegisterEntryLike {
  kind: RegisterKind;
  amountInr: number;
  paymentMode: Mode;
  item?: string | null;
  createdAt: string | Date;
  date?: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Split payment — one sale paid across several channels. It is stored as one
// RegisterEntry per channel (so every cash/UPI/udhaar report stays correct),
// all sharing details.split.id. The owner's personal PhonePe is not shop
// cash and not shop UPI, so it is stored as mode OTHER + details.channel.
// ---------------------------------------------------------------------------
export type PayChannel = "CASH" | "UPI" | "OWNER_PHONEPE" | "CREDIT";
export const PAY_CHANNELS: PayChannel[] = ["CASH", "UPI", "OWNER_PHONEPE", "CREDIT"];
export interface SplitPart {
  channel: PayChannel;
  amount: number;
}
const money2 = (n: number) => Math.round(n * 100) / 100;

export function channelToMode(c: PayChannel): Mode {
  return c === "OWNER_PHONEPE" ? "OTHER" : c;
}

/** The channel a stored entry was paid through. */
export function entryChannel(e: { paymentMode: string; details?: unknown }): PayChannel {
  const d = e.details as { channel?: unknown } | null | undefined;
  if (e.paymentMode === "OTHER" && d && d.channel === "OWNER_PHONEPE") return "OWNER_PHONEPE";
  return e.paymentMode === "UPI" || e.paymentMode === "CREDIT" ? e.paymentMode : "CASH";
}

/** Split group info of a stored entry, if it belongs to one. */
export function splitInfo(details: unknown): { id: string; i: number; n: number } | null {
  const sp = (details as { split?: { id?: unknown; i?: unknown; n?: unknown } } | null | undefined)?.split;
  return sp && typeof sp.id === "string" ? { id: sp.id, i: Number(sp.i) || 1, n: Number(sp.n) || 1 } : null;
}

/**
 * Validates the parts of a split payment against the sale total. Zero parts
 * are dropped; each channel may appear once; the parts must add up to the
 * total (to the paisa). One remaining part is just a normal single payment.
 */
export function normalizeSplit(total: number, raw: unknown): { ok: true; parts: SplitPart[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Split payment must be a list" };
  const parts: SplitPart[] = [];
  for (const p of raw) {
    const channel = (p as { channel?: unknown })?.channel as PayChannel;
    const amount = money2(Number((p as { amount?: unknown })?.amount));
    if (!PAY_CHANNELS.includes(channel)) return { ok: false, error: "Unknown payment channel in split" };
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Split amounts must be numbers" };
    if (amount === 0) continue;
    if (parts.some((x) => x.channel === channel)) return { ok: false, error: "Use each payment type only once" };
    parts.push({ channel, amount });
  }
  if (!parts.length) return { ok: false, error: "Enter at least one payment amount" };
  const sum = money2(parts.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(sum - money2(total)) > 0.01) {
    return { ok: false, error: `Payments add up to ₹${sum} but the sale is ₹${money2(total)}` };
  }
  return { ok: true, parts };
}

/** Effect of one register entry on the physical counter cash. */
export function entryCashEffect(e: RegisterEntryLike): number {
  const side = KIND_SIDE[e.kind];
  if (side === "oth") return -e.amountInr; // pigmee / owner draw always leave as cash
  if (e.paymentMode !== "CASH") return 0;
  return side === "in" ? e.amountInr : -e.amountInr;
}

export interface JobWorkLike {
  cakeOwnership: "SHOP" | "CUSTOMER";
  advanceCustomerInr: number;
  advanceAutoInr: number;
  settled: boolean;
  settlementAmountInr: number | null;
  settledAt: string | Date | null;
  createdAt: string | Date;
}

export interface CashEvent {
  at: number; // epoch ms
  amount: number; // +in / -out of the counter
  bucket: "jwIn" | "jwOut";
}

/**
 * Counter-cash events produced by job-work intakes, using the SAME sign
 * convention as expectedSettlement() in lib/calculations.ts:
 *  - SHOP keeps cake (shop pays the customer): advances at intake and the
 *    settlement payout both leave the counter.
 *  - CUSTOMER keeps cake (customer pays the shop): expectedSettlement()
 *    subtracts the advance from what the customer still owes, i.e. the
 *    advance is money already received — counter IN; the settlement is
 *    also counter IN.
 * A negative settlement (advance exceeded the amount due) flips direction.
 */
export function jobWorkCashEvents(j: JobWorkLike): CashEvent[] {
  const sign = j.cakeOwnership === "SHOP" ? -1 : 1;
  const events: CashEvent[] = [];
  const adv = (j.advanceCustomerInr || 0) + (j.advanceAutoInr || 0);
  if (adv) {
    const amount = sign * adv;
    events.push({ at: +new Date(j.createdAt), amount, bucket: amount >= 0 ? "jwIn" : "jwOut" });
  }
  if (j.settled && j.settledAt && j.settlementAmountInr) {
    const amount = sign * j.settlementAmountInr;
    events.push({ at: +new Date(j.settledAt), amount, bucket: amount >= 0 ? "jwIn" : "jwOut" });
  }
  return events;
}

/** Local "YYYY-MM-DD" for a timestamp in the given IANA zone (default IST). */
export function businessDate(at: number | string | Date, timeZone = "Asia/Kolkata"): string {
  const d = new Date(at);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

export interface DayTotals {
  cashIn: number;
  cashOut: number;
  upiIn: number;
  upiOut: number;
  creditGiven: number; // udhaar sales
  creditTaken: number; // purchases on credit
  ownerPhonePeIn: number; // sale money received on the owner's personal PhonePe
  pigmee: number;
  ownerDraw: number;
  jwIn: number;
  jwOut: number;
  byKind: Partial<Record<RegisterKind, number>>;
}

export function dayTotals(entries: RegisterEntryLike[], jwEvents: CashEvent[] = []): DayTotals {
  const t: DayTotals = {
    cashIn: 0,
    cashOut: 0,
    upiIn: 0,
    upiOut: 0,
    creditGiven: 0,
    creditTaken: 0,
    ownerPhonePeIn: 0,
    pigmee: 0,
    ownerDraw: 0,
    jwIn: 0,
    jwOut: 0,
    byKind: {},
  };
  for (const e of entries) {
    t.byKind[e.kind] = (t.byKind[e.kind] || 0) + e.amountInr;
    const side = KIND_SIDE[e.kind];
    if (e.kind === "PIGMEE") t.pigmee += e.amountInr;
    else if (e.kind === "OWNER_DRAW") t.ownerDraw += e.amountInr;
    else if (e.paymentMode === "CASH") {
      if (side === "in") t.cashIn += e.amountInr;
      else t.cashOut += e.amountInr;
    } else if (e.paymentMode === "CREDIT") {
      if (side === "in") t.creditGiven += e.amountInr;
      else t.creditTaken += e.amountInr;
    } else if (entryChannel(e) === "OWNER_PHONEPE") t.ownerPhonePeIn += e.amountInr;
    else if (side === "in") t.upiIn += e.amountInr;
    else t.upiOut += e.amountInr;
  }
  for (const ev of jwEvents) {
    if (ev.amount >= 0) t.jwIn += ev.amount;
    else t.jwOut += -ev.amount;
  }
  return t;
}

/**
 * System cash = opening + all counter-cash movements up to `uptoMs`
 * (inclusive). Tally 1 (midday) passes the moment of counting, so entries
 * logged after it are excluded; Tally 2 passes the closing moment.
 */
export function systemCash(
  opening: number,
  entries: RegisterEntryLike[],
  jwEvents: CashEvent[],
  uptoMs?: number
): number {
  let c = opening;
  for (const e of entries) {
    if (uptoMs !== undefined && +new Date(e.createdAt) > uptoMs) continue;
    c += entryCashEffect(e);
  }
  for (const ev of jwEvents) {
    if (uptoMs !== undefined && ev.at > uptoMs) continue;
    c += ev.amount;
  }
  return c;
}

/**
 * Maps the register's movements up to `uptoMs` into the Daily Closing desk's
 * existing CashInputs buckets, so a register tally is stored as a normal
 * DailyClosing row and computeSystemCash()/cashGapFlag() (₹300 rule) apply
 * unchanged. Sum of buckets always equals systemCash() for the same inputs.
 */
export function toClosingBuckets(
  opening: number,
  entries: RegisterEntryLike[],
  jwEvents: CashEvent[],
  uptoMs?: number
): CashInputs {
  const b: CashInputs = {
    cashInOpening: opening,
    cashInSales: 0,
    cashInOther: 0,
    cashOutGrn: 0,
    cashOutExpenses: 0,
    cashOutSalary: 0,
    cashOutUpi: 0,
    cashOutDraw: 0,
    cashOutOther: 0,
  };
  for (const e of entries) {
    if (uptoMs !== undefined && +new Date(e.createdAt) > uptoMs) continue;
    const eff = entryCashEffect(e);
    if (!eff) continue;
    switch (e.kind) {
      case "SALE":
      case "FRESH_CRUSH":
        b.cashInSales += eff;
        break;
      case "UDHAAR_IN":
        b.cashInOther += eff;
        break;
      case "EXPENSE":
        b.cashOutExpenses += -eff;
        break;
      case "PAYMENT":
        if (e.item === "salary") b.cashOutSalary += -eff;
        else b.cashOutOther += -eff;
        break;
      case "PIGMEE":
      case "OWNER_DRAW":
        b.cashOutDraw += -eff;
        break;
      default:
        b.cashOutOther += -eff; // PURCHASE
    }
  }
  for (const ev of jwEvents) {
    if (uptoMs !== undefined && ev.at > uptoMs) continue;
    if (ev.amount >= 0) b.cashInOther += ev.amount;
    else b.cashOutGrn += -ev.amount;
  }
  return b;
}

export interface ClosingLike {
  date: string;
  session: "AFTERNOON" | "NIGHT";
  counterCashInr: number;
  createdAt: string | Date;
}

/**
 * Opening cash for `date`:
 *  1. a manual override for that date (RegisterConfig.openings), else
 *  2. the most recent NIGHT count on an earlier date (from either the Quick
 *     Register or the Daily Closing desk) plus any counter movement logged
 *     on that day AFTER the count (e.g. Sahil took cash after closing), else
 *  3. 0.
 * `laterMovementsFor(date, afterMs)` returns the cash effect logged on that
 * earlier date after the count — supplied by the caller (it needs the DB).
 */
export function openingFor(
  date: string,
  overrides: Record<string, number>,
  closings: ClosingLike[],
  laterMovementsFor: (date: string, afterMs: number) => number
): { value: number; source: "override" | "lastClosing" | "none"; fromDate?: string } {
  if (typeof overrides[date] === "number") return { value: overrides[date], source: "override" };
  const prev = closings
    .filter((c) => c.session === "NIGHT" && c.date < date)
    .sort((a, b) => (a.date === b.date ? +new Date(b.createdAt) - +new Date(a.createdAt) : a.date < b.date ? 1 : -1))[0];
  if (!prev) return { value: 0, source: "none" };
  return {
    value: prev.counterCashInr + laterMovementsFor(prev.date, +new Date(prev.createdAt)),
    source: "lastClosing",
    fromDate: prev.date,
  };
}

export function denominationTotal(denoms: Record<string, number>, coins: number): number {
  let t = Number(coins) || 0;
  for (const d of DENOMINATIONS) t += (Number(denoms[String(d)]) || 0) * d;
  return t;
}

// ---------------------------------------------------------------------------
// Accountant CSV
// ---------------------------------------------------------------------------
export interface CsvRow {
  date: string;
  time: string;
  side: string;
  type: string;
  item: string;
  qty: number | "";
  unit: string;
  rate: number | "";
  party: string;
  mode: string;
  amount: number;
  notes: string;
}

export function toCsv(rows: CsvRow[]): string {
  const head = ["date", "time", "side", "type", "item", "qty", "unit", "rate", "party", "mode", "amount", "notes"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(","), ...rows.map((r) => head.map((h) => esc((r as unknown as Record<string, unknown>)[h])).join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Fresh crush sale — the customer buys oil crushed in front of them from the
// SHOP's own seed (not job-work: job-work is the customer's seed, GST s.143).
// One entry = one crushing: seed used -> oil produced -> part sold to the
// customer, any extra transferred to a tank/barrel, plus oil cake kept.
// ---------------------------------------------------------------------------
export interface FreshCrushDetails {
  seedKg: number; // shop's seed used
  oilKg: number; // fresh oil produced
  soldKg?: number | null; // oil sold to the customer, in kg (when sold by weight)
  extraKg: number; // extra oil moved to tank / barrel
  extraTo?: string | null; // which tank / barrel
  cakeKg: number; // oil cake (khali) kept by the shop
}

// Same tolerance as 05_Scripts/oil_yield_tracker.py: flag when the invisible
// loss (seed − oil − cake) is more than 2% of the seed.
export const MASS_BALANCE_TOLERANCE_PCT = 2;

export function freshCrushStats(d: FreshCrushDetails) {
  const seed = Number(d.seedKg) || 0;
  const oil = Number(d.oilKg) || 0;
  const cake = Number(d.cakeKg) || 0;
  const yieldPct = seed > 0 ? (oil / seed) * 100 : 0;
  const lossKg = seed - oil - cake;
  const lossPct = seed > 0 ? (lossKg / seed) * 100 : 0;
  // Oil that is neither sold nor moved to a tank (only checkable when sold in kg).
  const unaccountedOilKg =
    typeof d.soldKg === "number" ? Math.round((oil - d.soldKg - (Number(d.extraKg) || 0)) * 100) / 100 : null;
  return {
    yieldPct,
    lossKg,
    lossPct,
    lossFlag: cake > 0 && lossPct > MASS_BALANCE_TOLERANCE_PCT,
    unaccountedOilKg,
  };
}

/** Suggested extra-to-tank when the sale is in kg: oil produced − oil sold. */
export function suggestedExtraKg(oilKg: number, soldKg: number | null): number | null {
  if (!(oilKg > 0) || soldKg === null || !(soldKg >= 0) || soldKg > oilKg) return null;
  return Math.round((oilKg - soldKg) * 100) / 100;
}

export function normalizeFreshCrush(raw: unknown): FreshCrushDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const seedKg = n(r.seedKg);
  const oilKg = n(r.oilKg);
  const extraKg = r.extraKg === undefined || r.extraKg === null || r.extraKg === "" ? 0 : n(r.extraKg);
  const cakeKg = r.cakeKg === undefined || r.cakeKg === null || r.cakeKg === "" ? 0 : n(r.cakeKg);
  const soldKg = r.soldKg === undefined || r.soldKg === null || r.soldKg === "" ? null : n(r.soldKg);
  if (!(seedKg > 0) || !(oilKg > 0) || oilKg > seedKg) return null;
  if (!(extraKg >= 0) || !(cakeKg >= 0) || extraKg > oilKg || oilKg + cakeKg > seedKg * 1.02) return null;
  if (soldKg !== null && (!(soldKg >= 0) || soldKg + extraKg > oilKg * 1.02)) return null;
  const extraTo = typeof r.extraTo === "string" && r.extraTo.trim() ? r.extraTo.trim().slice(0, 60) : null;
  return { seedKg, oilKg, soldKg, extraKg, extraTo, cakeKg };
}

export interface FreshCrushTotals {
  count: number;
  amount: number;
  bySeed: Record<string, { seedKg: number; oilKg: number; extraKg: number; cakeKg: number; amount: number; count: number }>;
  extraByTank: Record<string, number>;
  flagged: number;
}

export function freshCrushTotals(
  entries: { kind: RegisterKind; item?: string | null; amountInr: number; details?: unknown }[]
): FreshCrushTotals {
  const t: FreshCrushTotals = { count: 0, amount: 0, bySeed: {}, extraByTank: {}, flagged: 0 };
  for (const e of entries) {
    if (e.kind !== "FRESH_CRUSH") continue;
    const d = normalizeFreshCrush(e.details);
    if (!d) continue;
    const k = e.item || "other";
    const s = (t.bySeed[k] ||= { seedKg: 0, oilKg: 0, extraKg: 0, cakeKg: 0, amount: 0, count: 0 });
    s.seedKg += d.seedKg;
    s.oilKg += d.oilKg;
    s.extraKg += d.extraKg;
    s.cakeKg += d.cakeKg;
    s.amount += e.amountInr;
    s.count += 1;
    t.count += 1;
    t.amount += e.amountInr;
    if (d.extraKg > 0) {
      const tank = d.extraTo || "Tank / barrel";
      t.extraByTank[tank] = (t.extraByTank[tank] || 0) + d.extraKg;
    }
    if (freshCrushStats(d).lossFlag) t.flagged += 1;
  }
  return t;
}

/**
 * Until when entries count towards a cash tally. Today: right now. A late
 * (back-dated) tally: the midday one counts up to 1 pm of its day, the closing
 * one counts the whole day — so it matches what was in the counter then.
 */
export function cashCutoffMs(date: string, session: "AFTERNOON" | "NIGHT", nowMs: number): number {
  if (date === businessDate(nowMs)) return nowMs;
  return session === "AFTERNOON" ? new Date(`${date}T13:00:00+05:30`).getTime() : new Date(`${date}T23:59:59.999+05:30`).getTime();
}
