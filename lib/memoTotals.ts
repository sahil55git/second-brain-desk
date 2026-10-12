// Cash tally "memo sheet" totals. The manager writes a paper cash memo; the
// owner types its totals into the Cash tally. Those totals are kept SEPARATE
// from the register (no RegisterEntry rows, no effect on sales / stock / GST /
// party balances). They only change the cash the tally EXPECTS in the counter,
// and show how much of each line is still missing from the app.
import { entryChannel, type CashEvent, type RegisterEntryLike } from "./register";

export const MEMO_LINES = ["SALE", "PURCHASE", "EXPENSE", "JOBWORK", "UDHAAR", "SALARY"] as const;
export type MemoLine = (typeof MEMO_LINES)[number];
export const isMemoLine = (v: unknown): v is MemoLine => typeof v === "string" && (MEMO_LINES as readonly string[]).includes(v);

export const MEMO_META: Record<MemoLine, { icon: string; en: string; kn: string; sign: 1 | -1; unit: string }> = {
  SALE: { icon: "💰", en: "Sales", kn: "ಮಾರಾಟ", sign: 1, unit: "kg" },
  PURCHASE: { icon: "🛒", en: "Purchase", kn: "ಖರೀದಿ", sign: -1, unit: "kg" },
  EXPENSE: { icon: "🧾", en: "Expense", kn: "ಖರ್ಚು", sign: -1, unit: "" },
  JOBWORK: { icon: "🌾", en: "Job-work", kn: "ಜಾಬ್‌ವರ್ಕ್", sign: -1, unit: "kg" },
  UDHAAR: { icon: "🙌", en: "Udhaar received", kn: "ಉಧಾರ ಬಂದದ್ದು", sign: 1, unit: "" },
  SALARY: { icon: "🤝", en: "Salary / payment", kn: "ಸಂಬಳ / ಪಾವತಿ", sign: -1, unit: "" },
};

export interface AppLine {
  /** every payment channel, in rupees */
  amount: number;
  cash: number;
  upi: number;
  phonepe: number;
  credit: number;
  qty: number;
}
const blank = (): AppLine => ({ amount: 0, cash: 0, upi: 0, phonepe: 0, credit: 0, qty: 0 });

export function lineOfKind(kind: string): MemoLine | null {
  switch (kind) {
    case "SALE":
    case "FRESH_CRUSH":
      return "SALE";
    case "PURCHASE":
      return "PURCHASE";
    case "EXPENSE":
      return "EXPENSE";
    case "UDHAAR_IN":
      return "UDHAAR";
    case "PAYMENT":
      return "SALARY";
    default:
      return null; // PIGMEE / OWNER_DRAW are not memo lines
  }
}

/** What the app (register + job-work) already holds, per memo line. */
export function appLines(entries: RegisterEntryLike[], jwEvents: CashEvent[], uptoMs?: number): Record<MemoLine, AppLine> {
  const out = Object.fromEntries(MEMO_LINES.map((l) => [l, blank()])) as Record<MemoLine, AppLine>;
  for (const e of entries) {
    if (uptoMs !== undefined && +new Date(e.createdAt) > uptoMs) continue;
    const line = lineOfKind(e.kind);
    if (!line) continue;
    const o = out[line];
    const amt = Number(e.amountInr) || 0;
    o.amount += amt;
    const ch = entryChannel(e as { paymentMode: string; details?: unknown });
    if (ch === "CASH") o.cash += amt;
    else if (ch === "UPI") o.upi += amt;
    else if (ch === "OWNER_PHONEPE") o.phonepe += amt;
    else o.credit += amt;
    o.qty += Number((e as { qty?: number | null }).qty) || 0;
  }
  // Job-work counter cash: money paid out to customers is a cash OUT (line JOBWORK).
  for (const ev of jwEvents) {
    if (uptoMs !== undefined && ev.at > uptoMs) continue;
    out.JOBWORK.cash += -ev.amount;
    out.JOBWORK.amount += -ev.amount;
  }
  for (const l of MEMO_LINES) for (const k of Object.keys(out[l]) as (keyof AppLine)[]) out[l][k] = Math.round(out[l][k] * 100) / 100;
  return out;
}

export interface MemoRow {
  line: MemoLine;
  amountInr: number;
  cashInr: number;
  qty: number | null;
  unit: string | null;
  source?: string;
  enteredByName?: string | null;
  updatedAt?: string | Date;
}

/** Expected counter cash once the saved memo totals replace the app's own cash for their lines. */
export function memoAdjustedCash(appSystemCash: number, app: Record<MemoLine, AppLine>, memo: MemoRow[]): number {
  let v = appSystemCash;
  for (const m of memo) v += MEMO_META[m.line].sign * (m.cashInr - app[m.line].cash);
  return Math.round(v * 100) / 100;
}

/** How much of a line's memo total is not yet in the app (never negative). */
export const notInApp = (memoAmount: number, app: AppLine): number => Math.max(0, Math.round((memoAmount - app.amount) * 100) / 100);

/** Clean one posted memo line. Returns null when it should be ignored. */
export function normalizeMemoLine(raw: unknown): (MemoRow & { source: string }) | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !isMemoLine(r.line)) return null;
  const amt = Number(r.amountInr);
  if (!Number.isFinite(amt) || amt < 0 || amt > 100_000_000) return null;
  const cashRaw = r.cashInr === "" || r.cashInr === null || r.cashInr === undefined ? amt : Number(r.cashInr);
  const cash = Number.isFinite(cashRaw) ? Math.min(Math.max(0, cashRaw), amt) : amt;
  const q = r.qty === "" || r.qty === null || r.qty === undefined ? null : Number(r.qty);
  const unit = typeof r.unit === "string" && ["kg", "ltr", "bags", "pcs"].includes(r.unit) ? r.unit : null;
  const source = r.source === "scale-scan" || r.source === "paper-scan" ? r.source : "typed";
  return { line: r.line, amountInr: Math.round(amt * 100) / 100, cashInr: Math.round(cash * 100) / 100, qty: q !== null && Number.isFinite(q) && q >= 0 ? q : null, unit, source };
}

/** UPI totals typed from the GPay / PhonePe apps. Kept in the tally only; they never change counter cash. */
export const UPI_LINES = ["UPI_GPAY", "UPI_PHONEPE"] as const;
export type UpiLine = (typeof UPI_LINES)[number];
export const isUpiLine = (v: unknown): v is UpiLine => typeof v === "string" && (UPI_LINES as readonly string[]).includes(v);

export function normalizeUpiLine(raw: unknown): { line: UpiLine; amountInr: number } | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !isUpiLine(r.line)) return null;
  const amt = Number(r.amountInr);
  if (!Number.isFinite(amt) || amt < 0 || amt > 100_000_000) return null;
  return { line: r.line, amountInr: Math.round(amt * 100) / 100 };
}
