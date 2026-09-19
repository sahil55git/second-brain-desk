// GST computation for Sales/Purchase (erp-architecture-plan.md, Phase 2).
// Regular dealer: intra-state supply is split CGST + SGST (half the rate
// each); inter-state supply is a single IGST at the full rate. Which one
// applies is decided by comparing the party's state to the business's home
// state — same state => intra (CGST+SGST), different => inter (IGST).
//
// All money is rounded to 2 decimal places at each line and at the invoice
// total, matching how a printed GST invoice actually reads. We deliberately
// round per line (not once at the end) so the sum of the line totals a
// customer can add up by hand equals the invoice total — the same choice
// Vyapar/Tally make.

export type GstTreatment = "intra" | "inter";

export interface GstLineInput {
  qty: number;
  rateInr: number; // per-unit, pre-tax
  gstRatePct: number;
}

export interface GstLineResult {
  lineSubtotalInr: number; // qty * rate, rounded
  lineTaxInr: number; // subtotal * gstRate/100, rounded
  lineTotalInr: number; // subtotal + tax
}

export interface GstTotals {
  subtotalInr: number;
  cgstInr: number;
  sgstInr: number;
  igstInr: number;
  totalInr: number;
}

/** Round to 2 dp, guarding against binary-float noise (e.g. 1.005). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // +Number.EPSILON nudge so values like 1.005 round up, not down.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Decide intra- vs inter-state. States are compared case-insensitively and
 * trimmed. If either state is missing/blank we FALL BACK to intra-state
 * (CGST+SGST) — the safe local default for a shop whose customers are almost
 * all in-state, and the business must set its home state in Settings anyway.
 */
export function gstTreatment(
  businessState: string | null | undefined,
  partyState: string | null | undefined
): GstTreatment {
  const b = (businessState || "").trim().toLowerCase();
  const p = (partyState || "").trim().toLowerCase();
  if (!b || !p) return "intra";
  return b === p ? "intra" : "inter";
}

/** Per-line subtotal/tax/total. Tax here is the TOTAL gst on the line
 * (the CGST/SGST split happens only at the invoice level, on the summed
 * tax, so halves never round inconsistently line by line). */
export function computeLine(line: GstLineInput): GstLineResult {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rateInr) || 0;
  const gstPct = Number(line.gstRatePct) || 0;

  const lineSubtotalInr = round2(qty * rate);
  const lineTaxInr = round2((lineSubtotalInr * gstPct) / 100);
  const lineTotalInr = round2(lineSubtotalInr + lineTaxInr);

  return { lineSubtotalInr, lineTaxInr, lineTotalInr };
}

/**
 * Roll up lines into invoice totals with the correct CGST/SGST vs IGST split.
 * The total tax is summed from the per-line rounded taxes first, then split —
 * so for intra-state, CGST and SGST are each half the summed tax (with any
 * odd paisa handed to CGST so cgst + sgst == totalTax exactly).
 */
export function computeTotals(
  lines: GstLineInput[],
  treatment: GstTreatment
): GstTotals {
  let subtotalInr = 0;
  let totalTaxInr = 0;

  for (const line of lines) {
    const r = computeLine(line);
    subtotalInr = round2(subtotalInr + r.lineSubtotalInr);
    totalTaxInr = round2(totalTaxInr + r.lineTaxInr);
  }

  let cgstInr = 0;
  let sgstInr = 0;
  let igstInr = 0;

  if (treatment === "inter") {
    igstInr = totalTaxInr;
  } else {
    // Split in two; give any leftover paisa to CGST so the halves sum exactly.
    cgstInr = round2(totalTaxInr / 2);
    sgstInr = round2(totalTaxInr - cgstInr);
  }

  const totalInr = round2(subtotalInr + totalTaxInr);
  return { subtotalInr, cgstInr, sgstInr, igstInr, totalInr };
}

/** Format an invoice number from prefix + counter, e.g. "INV-" + 42 =>
 * "INV-0042". The counter passed in is the NEW (already-incremented) value. */
export function formatInvoiceNo(prefix: string, counter: number): string {
  const p = prefix || "INV-";
  return `${p}${String(counter).padStart(4, "0")}`;
}
