// GST tax invoice for the counter (pure, tested). Counter prices are what the customer pays, so GST is
// taken OUT of each amount (tax-inclusive): tax = amount × rate ÷ (100 + rate). Taxable values and tax add up
// to the bill total to the paisa. Rates and HSN codes are the owner's per item; confirm them with the accountant.

import { rupees, type ReceiptDoc, type ReceiptTotal } from "./receipt";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Common starting HSN codes for the shop's goods (the owner can change each in the item list). */
export const DEFAULT_HSN: Record<string, string> = {
  sunflower: "1512",
  karadi: "1512",
  groundnut: "1508",
  mustard: "1514",
  ekatva: "1517",
  cake: "2306",
};
export const DEFAULT_GST_PCT = 5;

export const validGstin = (g: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.trim().toUpperCase());

export interface GstLineIn {
  name: string;
  hsn: string;
  pct: number;
  /** what the customer pays for this line (after discount) */
  amount: number;
}
export interface GstLineOut extends GstLineIn {
  taxable: number;
  tax: number;
}
export interface GstRateRow {
  pct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}
export interface GstResult {
  lines: GstLineOut[];
  byRate: GstRateRow[];
  taxable: number;
  tax: number;
  total: number;
}

export function gstSplit(lines: GstLineIn[], igst: boolean): GstResult {
  const out: GstLineOut[] = lines.map((l) => {
    const pct = Math.max(0, l.pct || 0);
    const tax = r2((l.amount * pct) / (100 + pct));
    return { ...l, pct, tax, taxable: r2(l.amount - tax) };
  });
  const m = new Map<number, GstRateRow>();
  for (const l of out) {
    const cur = m.get(l.pct) || { pct: l.pct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable = r2(cur.taxable + l.taxable);
    // tax per rate is added up first, then split, so CGST + SGST is never a paisa off the total tax
    if (igst) cur.igst = r2(cur.igst + l.tax);
    else cur.cgst = r2(cur.cgst + l.tax);
    m.set(l.pct, cur);
  }
  const byRate = Array.from(m.values())
    .sort((a, b) => a.pct - b.pct)
    .map((r) => {
      if (igst) return r;
      const total = r.cgst;
      const c = r2(total / 2);
      return { ...r, cgst: c, sgst: r2(total - c) };
    });
  const tax = r2(out.reduce((a, l) => a + l.tax, 0));
  const taxable = r2(out.reduce((a, l) => a + l.taxable, 0));
  return { lines: out, byRate, taxable, tax, total: r2(taxable + tax) };
}

const pctText = (n: number) => `${Math.round(n * 100) / 100}%`;

/** The printed tax invoice: items with HSN and rate, then taxable value and CGST + SGST (or IGST) per rate. */
export function taxInvoiceDoc(a: {
  no: string;
  when: string;
  party?: string;
  gstin?: string;
  igst: boolean;
  lines: (GstLineIn & { detail?: string })[];
  /** after the grand total (payment split, cash received …) */
  after?: ReceiptTotal[];
  /** between the taxable lines and the grand total (net weight, discount, round-off …) */
  notes?: string[];
  qr?: string;
}): ReceiptDoc {
  const g = gstSplit(a.lines, a.igst);
  const totals: ReceiptTotal[] = [{ label: "Taxable value", value: rupees(g.taxable) }];
  for (const r of g.byRate) {
    if (!r.pct) continue;
    if (a.igst) totals.push({ label: `IGST ${pctText(r.pct)}`, value: rupees(r.igst) });
    else {
      totals.push({ label: `CGST ${pctText(r.pct / 2)}`, value: rupees(r.cgst) });
      totals.push({ label: `SGST ${pctText(r.pct / 2)}`, value: rupees(r.sgst) });
    }
  }
  totals.push({ label: "TOTAL", value: rupees(g.total), strong: true }, ...(a.after || []));
  return {
    title: "TAX INVOICE",
    no: a.no,
    when: a.when,
    party: [a.party, a.gstin ? `GSTIN ${a.gstin.toUpperCase()}` : ""].filter(Boolean).join(" · ") || undefined,
    rows: g.lines.map((l, i) => ({
      name: l.name,
      detail: [l.hsn ? `HSN ${l.hsn}` : "", `GST ${pctText(l.pct)}`, a.lines[i].detail || ""].filter(Boolean).join(" · "),
      amount: rupees(l.amount),
    })),
    totals,
    notes: ["Prices include GST", ...(a.notes || [])],
    qr: a.qr,
  };
}
