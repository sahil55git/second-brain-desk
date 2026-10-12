// Refunds (credit notes) against a sales bill. Pure rules, shared by the
// API and the refund panel. A refund never exceeds what was sold on a line,
// and its amount is the line's own total (GST included) pro-rated by the
// quantity returned, so partial returns add up to the bill exactly.

import { round2 } from "@/lib/gst";

export const REFUND_REASONS = ["Damaged", "Wrong item", "Quality", "Other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export interface RefundSourceLine {
  id: string;
  name: string;
  unit: string;
  qty: number;
  returnedQty: number;
  lineTotalInr: number;
}

export interface RefundRequest {
  reason: string;
  note?: string;
  lines: { lineId: string; qty: number }[];
}

export interface RefundPlanLine {
  lineId: string;
  name: string;
  unit: string;
  qty: number;
  amountInr: number;
}

const EPS = 1e-6;

/** Quantity still returnable on a line. */
export function remainingQty(line: Pick<RefundSourceLine, "qty" | "returnedQty">): number {
  return Math.max(0, Math.round((line.qty - line.returnedQty) * 1000) / 1000);
}

/** Refund for returning `qty` of a line: pro-rated on the line's total, rounded to paisa. */
export function refundAmount(line: Pick<RefundSourceLine, "qty" | "lineTotalInr">, qty: number): number {
  if (line.qty <= 0) return 0;
  return round2((line.lineTotalInr * qty) / line.qty);
}

/**
 * Check a refund request against the bill's lines. Returns the plan (what
 * goes back into stock, and how much money) or the first problem found.
 */
export function planRefund(req: RefundRequest, lines: RefundSourceLine[]): { ok: true; plan: RefundPlanLine[]; totalInr: number } | { ok: false; error: string } {
  if (!(REFUND_REASONS as readonly string[]).includes(req.reason)) {
    return { ok: false, error: "Choose a reason for the refund." };
  }
  const wanted = req.lines.filter((l) => Number(l.qty) > EPS);
  if (wanted.length === 0) return { ok: false, error: "Select at least one item and a quantity to return." };

  const plan: RefundPlanLine[] = [];
  for (const w of wanted) {
    const line = lines.find((l) => l.id === w.lineId);
    if (!line) return { ok: false, error: "A selected item is not on this bill." };
    const qty = Math.round(Number(w.qty) * 1000) / 1000;
    const left = remainingQty(line);
    if (qty > left + EPS) {
      return { ok: false, error: `Only ${left} ${line.unit} of ${line.name} can still be returned.` };
    }
    plan.push({ lineId: line.id, name: line.name, unit: line.unit, qty, amountInr: refundAmount(line, qty) });
  }
  const totalInr = round2(plan.reduce((a, p) => a + p.amountInr, 0));
  return { ok: true, plan, totalInr };
}
