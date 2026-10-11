// Smart entry — pure helpers shared by every desk (no database, no browser):
//  - match a scanned / spoken supplier or item name to the masters
//  - find an item from a scanned barcode / QR / SKU
//  - check a GSTIN (format + checksum) so OCR mistakes are caught
//  - rate history ("last time you paid ₹X")
//  - live checks for purchase bills, sales invoices and expenses
// These run without AI: they are exact, instant and free. The AI terminal only
// drafts and explains; it never decides.

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const NOISE = /\b(m\/s|ms|pvt|private|ltd|limited|llp|co|company|and|&|the|sri|shri|shree)\b/g;

export function normName(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,()'"/\\-]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** 0..1 — how alike two names are (Dice coefficient on letter pairs, plus whole-word containment). */
export function similarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tx = x.split(" ");
  const ty = y.split(" ");
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  // "pawan refiner" vs "pawan refineries" — every word of the shorter name starts a word of the longer
  if (short.every((w) => long.some((l) => l.startsWith(w) || w.startsWith(l)))) return 0.9;
  const bx = bigrams(x);
  const by = bigrams(y);
  if (!bx.length || !by.length) return 0;
  const pool = [...by];
  let hit = 0;
  for (const g of bx) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  return (2 * hit) / (bx.length + by.length);
}

export const MATCH_MIN = 0.62;

export interface PartyLike {
  id: string;
  name: string;
  gstin?: string | null;
  active?: boolean;
}

/** Find the master party for a name / GSTIN read off a bill. GSTIN match wins over a name match. */
export function matchParty<T extends PartyLike>(name: string | null | undefined, gstin: string | null | undefined, parties: T[]): { party: T; score: number; by: "gstin" | "name" } | null {
  const live = parties.filter((p) => p.active !== false);
  const g = cleanGstin(gstin);
  if (g) {
    const hit = live.find((p) => cleanGstin(p.gstin) === g);
    if (hit) return { party: hit, score: 1, by: "gstin" };
  }
  if (!name) return null;
  let best: { party: T; score: number } | null = null;
  for (const p of live) {
    const s = similarity(name, p.name);
    if (!best || s > best.score) best = { party: p, score: s };
  }
  return best && best.score >= MATCH_MIN ? { ...best, by: "name" } : null;
}

export interface ItemLike {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  hsnCode?: string | null;
  gstRatePct?: number | null;
  active?: boolean;
}

export function matchItem<T extends ItemLike>(name: string | null | undefined, items: T[]): { item: T; score: number } | null {
  if (!name) return null;
  const byCode = findItemByCode(name, items);
  if (byCode) return { item: byCode, score: 1 };
  let best: { item: T; score: number } | null = null;
  for (const it of items.filter((i) => i.active !== false)) {
    const s = similarity(name, it.name);
    if (!best || s > best.score) best = { item: it, score: s };
  }
  return best && best.score >= MATCH_MIN ? best : null;
}

/** A scanned barcode / QR / typed code → item. Matches barcode, then SKU, then exact name. */
export function findItemByCode<T extends ItemLike>(raw: string | null | undefined, items: T[]): T | null {
  const code = String(raw || "").trim();
  if (!code) return null;
  const up = code.toUpperCase();
  const live = items.filter((i) => i.active !== false);
  return (
    live.find((i) => (i.barcode || "").trim().toUpperCase() === up) ||
    live.find((i) => (i.sku || "").trim().toUpperCase() === up) ||
    live.find((i) => i.name.trim().toUpperCase() === up) ||
    null
  );
}

/** Next shop code for an item that has no barcode yet: MT000001, MT000002 … (prints as Code 128 and QR). */
export function nextItemCode(items: ItemLike[]): string {
  let max = 0;
  for (const i of items) {
    const m = /^MT(\d{6})$/.exec((i.barcode || "").trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `MT${String(max + 1).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// GSTIN — 15 characters, last one is a checksum. A wrong checksum almost always
// means the photo was misread (or the bill is wrong).
// ---------------------------------------------------------------------------
const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export function cleanGstin(g: string | null | undefined): string {
  return String(g || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

export function checkGstin(g: string | null | undefined): { ok: true; state: string | null } | { ok: false; why: string } {
  const s = cleanGstin(g);
  if (!s) return { ok: false, why: "empty" };
  if (s.length !== 15) return { ok: false, why: `${s.length} characters (a GSTIN has 15)` };
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return { ok: false, why: "pattern does not fit a GSTIN" };
  if (gstinCheckChar(s.slice(0, 14)) !== s[14]) return { ok: false, why: "check digit does not match — probably misread" };
  return { ok: true, state: GST_STATES[s.slice(0, 2)] ?? null };
}

// ---------------------------------------------------------------------------
// Rate history
// ---------------------------------------------------------------------------
export interface DocLine {
  itemId: string | null;
  name: string;
  qty: number;
  rateInr: number;
}
export interface DocLike {
  id?: string;
  date: string;
  partyId: string;
  party?: { name: string } | null;
  lineItems: DocLine[];
}
export interface BillLike extends DocLike {
  billNo?: string;
}
export interface RatePoint {
  rate: number;
  date: string;
  party: string | null;
  partyId: string;
}

/** Past rates for one item (by item id, else by name), newest first. */
export function rateHistory(docs: DocLike[], key: { itemId?: string | null; name?: string | null }, partyId?: string | null): RatePoint[] {
  const nm = normName(key.name);
  const out: RatePoint[] = [];
  for (const d of docs) {
    if (partyId && d.partyId !== partyId) continue;
    for (const l of d.lineItems) {
      const same = key.itemId ? l.itemId === key.itemId : nm && normName(l.name) === nm;
      if (same && l.rateInr > 0) out.push({ rate: l.rateInr, date: d.date, party: d.party?.name ?? null, partyId: d.partyId });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Live checks
// ---------------------------------------------------------------------------
export type CheckLevel = "info" | "warn" | "alert";
export interface Check {
  level: CheckLevel;
  msg: string;
  line?: number;
}
export interface DraftLineLite {
  itemId?: string | null;
  name: string;
  qty: number;
  rateInr: number;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
const money = (n: number) => "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN");
const r2 = (n: number) => Math.round(n * 100) / 100;

export const CHECK_LIMITS = {
  /** A purchase rate this far from the last one for the same item is pointed out. */
  purchaseRatePct: 10,
  /** A sale rate this far from the usual one for the item is pointed out. */
  saleRatePct: 15,
  /** Bill total read from the photo vs the lines' total: allowed gap. */
  totalGapInr: 1,
  /** An expense this many times the category's usual amount is pointed out. */
  expenseTimesMedian: 3,
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function dateChecks(date: string, today: string): Check[] {
  if (!date) return [];
  if (date > today) return [{ level: "warn", msg: `Date ${date} is in the future.` }];
  const days = (Date.parse(today) - Date.parse(date)) / 86_400_000;
  if (days > 60) return [{ level: "info", msg: `Date ${date} is ${Math.round(days)} days back — entering an old bill?` }];
  return [];
}

export function purchaseChecks(
  d: {
    partyId: string;
    partyGstin?: string | null;
    billNo: string;
    date: string;
    lines: DraftLineLite[];
    linesTotalInr: number;
    scanned?: { totalInr?: number | null; gstin?: string | null } | null;
  },
  ctx: { bills: BillLike[]; today: string }
): Check[] {
  const out: Check[] = [];
  const bills = ctx.bills;
  const billKey = (v: unknown) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); // "SIV-649" = "siv 649"
  const bn = billKey(d.billNo);
  if (d.partyId && bn) {
    const dup = bills.find((b) => b.partyId === d.partyId && billKey(b.billNo) === bn);
    if (dup) out.push({ level: "alert", msg: `Bill no. ${d.billNo} from this supplier is already entered (${dup.date}). Entering it again would double the purchase.` });
  }
  out.push(...dateChecks(d.date, ctx.today));
  const sg = d.scanned?.gstin;
  if (sg) {
    const g = checkGstin(sg);
    if (!g.ok) out.push({ level: "warn", msg: `GSTIN on the bill "${sg}" looks wrong: ${g.why}. Check it on the paper.` });
    else if (d.partyGstin && cleanGstin(d.partyGstin) !== cleanGstin(sg))
      out.push({ level: "alert", msg: `GSTIN on the bill (${cleanGstin(sg)}) is not the supplier's GSTIN in your Parties list (${cleanGstin(d.partyGstin)}).` });
  }
  const st = d.scanned?.totalInr;
  if (st != null && st > 0 && d.linesTotalInr > 0 && Math.abs(st - d.linesTotalInr) > Math.max(CHECK_LIMITS.totalGapInr, st * 0.005))
    out.push({ level: "warn", msg: `The bill says ${money(st)} but the lines add up to ${money(d.linesTotalInr)} (gap ${money(r2(d.linesTotalInr - st))}). Check qty, rate and GST %.` });
  d.lines.forEach((l, i) => {
    if (!l.name.trim() || !(l.qty > 0)) return;
    if (!(l.rateInr > 0)) {
      out.push({ level: "warn", line: i, msg: `Line ${i + 1} (${l.name}): no rate.` });
      return;
    }
    const last = rateHistory(bills, { itemId: l.itemId, name: l.name })[0];
    if (last) {
      const p = pct(l.rateInr, last.rate);
      if (Math.abs(p) > CHECK_LIMITS.purchaseRatePct)
        out.push({ level: "warn", line: i, msg: `Line ${i + 1} (${l.name}): rate ${money(l.rateInr)} is ${p > 0 ? "+" : ""}${Math.round(p)}% vs last purchase ${money(last.rate)} on ${last.date}${last.party ? ` (${last.party})` : ""}.` });
    }
  });
  return out;
}

export function salesChecks(
  d: { partyId: string; date: string; lines: DraftLineLite[] },
  ctx: { invoices: DocLike[]; bills: DocLike[]; today: string }
): Check[] {
  const out: Check[] = [...dateChecks(d.date, ctx.today)];
  d.lines.forEach((l, i) => {
    if (!l.name.trim() || !(l.qty > 0)) return;
    if (!(l.rateInr > 0)) {
      out.push({ level: "warn", line: i, msg: `Line ${i + 1} (${l.name}): no rate.` });
      return;
    }
    const cost = rateHistory(ctx.bills, { itemId: l.itemId, name: l.name })[0];
    if (cost && l.rateInr < cost.rate)
      out.push({ level: "alert", line: i, msg: `Line ${i + 1} (${l.name}): selling at ${money(l.rateInr)}, below the last purchase rate ${money(cost.rate)} (${cost.date}).` });
    const sold = rateHistory(ctx.invoices, { itemId: l.itemId, name: l.name }).slice(0, 10);
    const usual = median(sold.map((s) => s.rate));
    if (usual != null && sold.length >= 2) {
      const p = pct(l.rateInr, usual);
      if (Math.abs(p) > CHECK_LIMITS.saleRatePct)
        out.push({ level: p < 0 ? "warn" : "info", line: i, msg: `Line ${i + 1} (${l.name}): ${money(l.rateInr)} is ${p > 0 ? "+" : ""}${Math.round(p)}% vs the usual ${money(usual)} (last ${sold.length} sales).` });
    }
  });
  return out;
}

export interface ExpenseLike {
  id?: string;
  date: string;
  category: string;
  amountInr: number;
}

export function expenseChecks(d: { date: string; category: string; amountInr: number }, ctx: { expenses: ExpenseLike[]; today: string }): Check[] {
  const out: Check[] = [...dateChecks(d.date, ctx.today)];
  if (!(d.amountInr > 0) || !d.category.trim()) return out;
  const cat = normName(d.category);
  const dup = ctx.expenses.find((e) => e.date === d.date && normName(e.category) === cat && Math.abs(e.amountInr - d.amountInr) < 0.5);
  if (dup) out.push({ level: "alert", msg: `${d.category} ${money(d.amountInr)} on ${d.date} is already entered. Same receipt twice?` });
  const same = ctx.expenses.filter((e) => normName(e.category) === cat).map((e) => e.amountInr);
  const usual = median(same);
  if (usual != null && same.length >= 3 && d.amountInr > usual * CHECK_LIMITS.expenseTimesMedian)
    out.push({ level: "warn", msg: `${money(d.amountInr)} is ${r2(d.amountInr / usual)}× the usual ${d.category} expense (${money(usual)}).` });
  return out;
}

// ---------------------------------------------------------------------------
// AI-drafted lines → clean lines
// ---------------------------------------------------------------------------
export interface FilledLine {
  name: string;
  hsnCode: string;
  qty: number | null;
  unit: string;
  rateInr: number | null;
  gstRatePct: number | null;
}

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[,₹\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function cleanAiLines(raw: unknown, max = 30): FilledLine[] {
  if (!Array.isArray(raw)) return [];
  const out: FilledLine[] = [];
  for (const r of raw.slice(0, max)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const gst = numOrNull(o.gstRatePct);
    out.push({
      name,
      hsnCode: typeof o.hsnCode === "string" ? o.hsnCode.replace(/\D/g, "").slice(0, 8) : typeof o.hsnCode === "number" ? String(o.hsnCode) : "",
      qty: numOrNull(o.qty),
      unit: typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().toLowerCase().slice(0, 10) : "kg",
      rateInr: numOrNull(o.rateInr),
      gstRatePct: gst != null && gst <= 40 ? gst : null,
    });
  }
  return out;
}
