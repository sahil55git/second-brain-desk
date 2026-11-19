// "Pay at the queue": a bill is printed with no payment mode (saved as cash, marked payPending). When the money comes,
// the counter or the cashier picks Cash / UPI / Udhaar / Split. This works out which register rows change (pure, tested).
import { allocateBill } from "./register";

export type SettleMode = "CASH" | "UPI" | "CREDIT";
export const SETTLE_MODES: SettleMode[] = ["CASH", "UPI", "CREDIT"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface SettleRow {
  id: string;
  amountInr: number;
  paymentMode: string;
  /** which bill line this row belongs to (1-based) when the bill has several lines */
  line?: number;
}
export interface SettleItem {
  /** an existing row to change, or null for a new row copied from `copyOf` (quantity and rate stay on the first row of a line) */
  id: string | null;
  copyOf: string;
  amountInr: number;
  paymentMode: SettleMode;
  line: number;
  /** position in the bill, 1-based (becomes split.i) */
  i: number;
}

export function planSettle(
  rows: SettleRow[],
  parts: { mode: string; amount: number }[]
): { ok: true; items: SettleItem[]; total: number } | { ok: false; error: string } {
  if (!rows.length) return { ok: false, error: "Bill not found." };
  if (rows.some((r) => r.paymentMode !== "CASH")) return { ok: false, error: "This bill already has a payment mode." };
  const total = r2(rows.reduce((a, r) => a + r.amountInr, 0));
  const clean = parts.map((p) => ({ mode: p.mode as SettleMode, amount: r2(Number(p.amount)) })).filter((p) => p.amount > 0);
  if (!clean.length) return { ok: false, error: "Enter how the customer paid." };
  if (clean.some((p) => !SETTLE_MODES.includes(p.mode))) return { ok: false, error: "Unknown payment mode." };
  if (new Set(clean.map((p) => p.mode)).size !== clean.length) return { ok: false, error: "Each payment mode can be used once." };
  const sum = r2(clean.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(sum - total) > 0.005) return { ok: false, error: `The parts add up to ₹${sum} but the bill is ₹${total}.` };
  const alloc = allocateBill(rows.map((r) => ({ amount: r.amountInr })), clean.map((p) => ({ channel: p.mode, amount: p.amount })));
  const items: SettleItem[] = [];
  const seen = new Set<number>();
  alloc.forEach((a, idx) => {
    const row = rows[a.line];
    const fresh = !seen.has(a.line);
    seen.add(a.line);
    items.push({ id: fresh ? row.id : null, copyOf: row.id, amountInr: a.amount, paymentMode: a.channel, line: row.line ?? a.line + 1, i: idx + 1 });
  });
  return { ok: true, items, total };
}
