// Oil cake (khali) sold. SOP self-crushing step 6: cake piles up at both mills and is sold in
// bulk now and then, by the owner. A khali sale is already an entry in the Quick Register
// (Sale → Oil cake); this only reads those entries back as a sale log with totals.

export interface KhaliEntry {
  id: string;
  date: string;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  notes: string | null;
}
export interface KhaliSummary {
  rows: KhaliEntry[];
  /** kg sold, counting only entries that carry a weight in kg */
  kg: number;
  amountInr: number;
  /** average rate per kg over the entries that carry a weight */
  avgRateInr: number | null;
  /** entries saved with money but no kg (the weight is unknown, so they are left out of kg and rate) */
  withoutKg: number;
  /** sold on credit and so not yet in the cash */
  creditInr: number;
  byBuyer: { name: string; kg: number; amountInr: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function khaliSummary(entries: KhaliEntry[]): KhaliSummary {
  const rows = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  let kg = 0;
  let amount = 0;
  let weighedAmount = 0;
  let withoutKg = 0;
  let credit = 0;
  const buyers = new Map<string, { name: string; kg: number; amountInr: number }>();
  for (const e of rows) {
    const hasKg = e.unit === "kg" && typeof e.qty === "number" && e.qty > 0;
    amount += e.amountInr;
    if (hasKg) {
      kg += e.qty as number;
      weighedAmount += e.amountInr;
    } else withoutKg++;
    if (e.paymentMode === "CREDIT") credit += e.amountInr;
    const name = (e.partyName || "").trim() || "Buyer not named";
    const b = buyers.get(name.toLowerCase()) ?? { name, kg: 0, amountInr: 0 };
    b.kg += hasKg ? (e.qty as number) : 0;
    b.amountInr += e.amountInr;
    buyers.set(name.toLowerCase(), b);
  }
  return {
    rows,
    kg: r2(kg),
    amountInr: r2(amount),
    avgRateInr: kg > 0 ? r2(weighedAmount / kg) : null,
    withoutKg,
    creditInr: r2(credit),
    byBuyer: Array.from(buyers.values()).map((b) => ({ name: b.name, kg: r2(b.kg), amountInr: r2(b.amountInr) })).sort((a, b) => b.amountInr - a.amountInr),
  };
}
