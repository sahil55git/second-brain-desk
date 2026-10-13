// Cash tally sheet — ONE table that says how the cash in the drawer is made.
// Every line has: what the app already holds (cash), what the paper memo sheet says (typed),
// and the figure USED for the tally. A typed figure REPLACES the app's figure for that line
// (never added on top), so nothing is counted twice.
//
// Sales on the memo sheet are the whole day's sales (cash + GPay + PhonePe). The UPI part
// never reached the drawer, so it is taken off: typed UPI totals if given, else the app's UPI sales.
import { entryCashEffect, entryChannel, type CashEvent, type RegisterEntryLike } from "./register";

export const SHEET_LINES = ["OPENING", "SALE", "UDHAAR", "OTHER_IN", "PURCHASE", "EXPENSE", "JOBWORK", "SALARY", "OWNER_DRAW"] as const;
export type SheetLine = (typeof SHEET_LINES)[number];
export const isSheetLine = (v: unknown): v is SheetLine => typeof v === "string" && (SHEET_LINES as readonly string[]).includes(v);

export const SHEET_META: Record<SheetLine, { icon: string; en: string; dir: "in" | "out"; hint: string }> = {
  OPENING: { icon: "🌅", en: "Opening cash", dir: "in", hint: "cash in the drawer at the start" },
  SALE: { icon: "💰", en: "Sales", dir: "in", hint: "whole day's sales from the memo sheet" },
  UDHAAR: { icon: "🙌", en: "Udhaar received", dir: "in", hint: "old dues paid in cash" },
  OTHER_IN: { icon: "➕", en: "Other cash in", dir: "in", hint: "job-work cash, anything else" },
  PURCHASE: { icon: "🛒", en: "Purchase", dir: "out", hint: "paid in cash" },
  EXPENSE: { icon: "🧾", en: "Expense", dir: "out", hint: "paid in cash" },
  JOBWORK: { icon: "🌾", en: "Job-work paid", dir: "out", hint: "paid to customers" },
  SALARY: { icon: "🤝", en: "Salary / payment", dir: "out", hint: "paid in cash" },
  OWNER_DRAW: { icon: "🧔", en: "Owner withdraw / pigmee", dir: "out", hint: "cash taken out" },
};

export interface AppLineCash {
  /** counter cash this line moved, per the app's own entries */
  cash: number;
  /** every channel (cash + UPI + udhaar), used to see what is missing from the app */
  amount: number;
  /** UPI part (GPay + PhonePe) — only matters for Sales */
  upi: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What the app's own entries give for each sheet line. Adds up to the app's expected cash exactly. */
export function appSheet(opening: number, entries: RegisterEntryLike[], jwEvents: CashEvent[], uptoMs?: number): Record<SheetLine, AppLineCash> {
  const o = Object.fromEntries(SHEET_LINES.map((l) => [l, { cash: 0, amount: 0, upi: 0 }])) as Record<SheetLine, AppLineCash>;
  o.OPENING.cash = opening;
  o.OPENING.amount = opening;
  for (const e of entries) {
    if (uptoMs !== undefined && +new Date(e.createdAt) > uptoMs) continue;
    const line: SheetLine =
      e.kind === "SALE" || e.kind === "FRESH_CRUSH" ? "SALE"
      : e.kind === "UDHAAR_IN" ? "UDHAAR"
      : e.kind === "EXPENSE" ? "EXPENSE"
      : e.kind === "PAYMENT" ? "SALARY"
      : e.kind === "PIGMEE" || e.kind === "OWNER_DRAW" ? "OWNER_DRAW"
      : "PURCHASE";
    const amt = Number(e.amountInr) || 0;
    const eff = entryCashEffect(e);
    o[line].cash += SHEET_META[line].dir === "in" ? eff : -eff;
    o[line].amount += amt;
    const ch = entryChannel(e as { paymentMode: string; details?: unknown });
    if (ch === "UPI" || ch === "OWNER_PHONEPE") o[line].upi += amt;
  }
  for (const ev of jwEvents) {
    if (uptoMs !== undefined && ev.at > uptoMs) continue;
    if (ev.amount >= 0) {
      o.OTHER_IN.cash += ev.amount;
      o.OTHER_IN.amount += ev.amount;
    } else {
      o.JOBWORK.cash += -ev.amount;
      o.JOBWORK.amount += -ev.amount;
    }
  }
  for (const l of SHEET_LINES) o[l] = { cash: r2(o[l].cash), amount: r2(o[l].amount), upi: r2(o[l].upi) };
  return o;
}

export interface TypedLine {
  amountInr: number;
  enteredByName?: string | null;
  updatedAt?: string;
}

export interface SheetRow {
  line: SheetLine;
  dir: "in" | "out";
  app: number;
  /** typed from the memo sheet, or null */
  memo: number | null;
  /** UPI taken off the memo sales (Sales row only) */
  upiOff: number;
  /** the figure the tally uses */
  used: number;
  /** memo total not yet entered in the app (null when nothing typed or not applicable) */
  missing: number | null;
  by?: string | null;
  at?: string;
}

export interface Sheet {
  rows: SheetRow[];
  totalIn: number;
  totalOut: number;
  expected: number;
  /** expected cash from the app's entries alone */
  appExpected: number;
  anyTyped: boolean;
  upi: { gpay: number; phonepe: number; gpayTyped: boolean; phonepeTyped: boolean; total: number };
}

export function buildSheet(
  app: Record<SheetLine, AppLineCash>,
  typed: Partial<Record<SheetLine, TypedLine>>,
  upiTyped: { gpay?: number | null; phonepe?: number | null },
  appUpi: { gpay: number; phonepe: number }
): Sheet {
  const gpayTyped = upiTyped.gpay != null;
  const phonepeTyped = upiTyped.phonepe != null;
  const gpay = gpayTyped ? (upiTyped.gpay as number) : appUpi.gpay;
  const phonepe = phonepeTyped ? (upiTyped.phonepe as number) : appUpi.phonepe;
  const rows: SheetRow[] = SHEET_LINES.map((line) => {
    const a = app[line];
    const t = typed[line];
    const memo = t ? r2(t.amountInr) : null;
    let upiOff = 0;
    let used = a.cash;
    if (memo !== null) {
      if (line === "SALE") {
        upiOff = r2(gpayTyped || phonepeTyped ? gpay + phonepe : a.upi);
        used = r2(Math.max(0, memo - upiOff));
      } else used = memo;
    }
    const missing = memo === null || line === "OPENING" ? null : r2(Math.max(0, memo - a.amount));
    return { line, dir: SHEET_META[line].dir, app: a.cash, memo, upiOff, used: r2(used), missing, by: t?.enteredByName ?? null, at: t?.updatedAt };
  });
  const sum = (d: "in" | "out", k: "used" | "app") => r2(rows.filter((x) => x.dir === d).reduce((s, x) => s + x[k], 0));
  const totalIn = sum("in", "used");
  const totalOut = sum("out", "used");
  return {
    rows,
    totalIn,
    totalOut,
    expected: r2(totalIn - totalOut),
    appExpected: r2(sum("in", "app") - sum("out", "app")),
    anyTyped: rows.some((x) => x.memo !== null),
    upi: { gpay: r2(gpay), phonepe: r2(phonepe), gpayTyped, phonepeTyped, total: r2(gpay + phonepe) },
  };
}

/** Normalize one posted sheet line ({ line, amountInr }). */
export function normalizeSheetLine(raw: unknown): { line: SheetLine; amountInr: number } | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !isSheetLine(r.line)) return null;
  const amt = Number(r.amountInr);
  if (!Number.isFinite(amt) || amt < 0 || amt > 100_000_000) return null;
  return { line: r.line, amountInr: r2(amt) };
}
