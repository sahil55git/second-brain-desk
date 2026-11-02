// 💰 Money tools: invoice extras (amount in words, HSN summary, UPI, e-way bill JSON), rate cards,
// profit & loss, 30-day cash forecast and expense budgets. Pure — tested in lib/__tests__/money.test.ts.
// GST / e-way output is a helper for the owner and the CA, not tax advice: check on the portal.
import { expenseReport, purchaseReport, salesReport, udhaarReport, type BizData, type DateSpan } from "./bizReports";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Amount in words (Indian system: lakh, crore)
// ---------------------------------------------------------------------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function three(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? two(rest) : ""].filter(Boolean).join(" ");
}
/** 12345.5 → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  let n = Math.floor(total / 100);
  const paise = total % 100;
  if (n === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  const rupees = parts.join(" ");
  return `Rupees ${rupees || "Zero"}${paise ? ` and ${two(paise)} Paise` : ""} Only`;
}

// ---------------------------------------------------------------------------
// HSN-wise tax summary (printed under a GST invoice)
// ---------------------------------------------------------------------------
export interface TaxLine { hsnCode: string | null; gstRatePct: number; lineSubtotalInr: number; discountPct?: number; lineTaxInr?: number }
export interface HsnRow { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number }
export function hsnSummary(lines: TaxLine[], interState: boolean): HsnRow[] {
  const by: Record<string, HsnRow> = {};
  for (const l of lines) {
    const hsn = (l.hsnCode || "—").trim() || "—";
    const key = `${hsn}|${l.gstRatePct}`;
    const taxable = l.lineSubtotalInr * (1 - (l.discountPct || 0) / 100);
    const tax = l.lineTaxInr ?? (taxable * l.gstRatePct) / 100;
    const row = (by[key] ||= { hsn, rate: l.gstRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 });
    row.taxable += taxable;
    row.tax += tax;
    if (interState) row.igst += tax;
    else { row.cgst += tax / 2; row.sgst += tax / 2; }
  }
  return Object.values(by).map((r) => ({ ...r, taxable: r2(r.taxable), cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst), tax: r2(r.tax) }));
}

// ---------------------------------------------------------------------------
// UPI
// ---------------------------------------------------------------------------
export function upiPay(vpa: string, name: string, amount: number, note: string): string {
  const q = new URLSearchParams({ pa: vpa.trim(), pn: name.slice(0, 40), am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 60) });
  return `upi://pay?${q.toString()}`;
}
export const validVpa = (v: string | null | undefined) => !!v && /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v.trim());

// ---------------------------------------------------------------------------
// E-way bill (NIC bulk-upload JSON). Needed when the consignment value is over ₹50,000.
// ---------------------------------------------------------------------------
export const EWAY_LIMIT = 50000;
export const ewayNeeded = (totalInr: number) => totalInr > EWAY_LIMIT;

const STATE_CODES: Record<string, number> = {
  "jammu and kashmir": 1, "himachal pradesh": 2, punjab: 3, chandigarh: 4, uttarakhand: 5, haryana: 6, delhi: 7, rajasthan: 8,
  "uttar pradesh": 9, bihar: 10, sikkim: 11, "arunachal pradesh": 12, nagaland: 13, manipur: 14, mizoram: 15, tripura: 16,
  meghalaya: 17, assam: 18, "west bengal": 19, jharkhand: 20, odisha: 21, orissa: 21, chhattisgarh: 22, "madhya pradesh": 23,
  gujarat: 24, "dadra and nagar haveli and daman and diu": 26, maharashtra: 27, karnataka: 29, goa: 30, lakshadweep: 31,
  kerala: 32, "tamil nadu": 33, puducherry: 34, "andaman and nicobar islands": 35, telangana: 36, "andhra pradesh": 37, ladakh: 38,
};
/** "Karnataka" / "KA" / "29" / a GSTIN → 29. */
export function stateCode(stateOrGstin: string | null | undefined): number | null {
  const s = String(stateOrGstin || "").trim().toLowerCase();
  if (!s) return null;
  if (/^\d{2}[a-z]{5}\d{4}[a-z]/i.test(s)) return Number(s.slice(0, 2));
  if (/^\d{1,2}$/.test(s)) return Number(s);
  const short: Record<string, string> = { ka: "karnataka", mh: "maharashtra", tg: "telangana", ts: "telangana", ap: "andhra pradesh", tn: "tamil nadu", kl: "kerala", ga: "goa", gj: "gujarat", dl: "delhi" };
  return STATE_CODES[short[s] || s] ?? null;
}
const pin = (addr: string | null | undefined) => Number(/\b(\d{6})\b/.exec(addr || "")?.[1] || 0);

export interface EwayInput {
  invoice: { invoiceNo: string; date: string; interState: boolean; subtotalInr: number; cgstInr: number; sgstInr: number; igstInr: number; totalInr: number; lineItems: { name: string; hsnCode: string | null; qty: number; unit: string; gstRatePct: number; lineSubtotalInr: number; discountPct?: number }[] };
  seller: { gstin: string | null; businessName: string; address: string | null; state: string | null };
  buyer: { gstin: string | null; name: string; address: string | null; state: string | null };
  transport: { vehicleNo: string; distanceKm: number; mode?: 1 | 2 | 3 | 4; transporterId?: string };
}
const UQC: Record<string, string> = { kg: "KGS", kgs: "KGS", ltr: "LTR", l: "LTR", litre: "LTR", pcs: "NOS", nos: "NOS", tin: "NOS", qtl: "QTL", ton: "TON", bag: "BAG", box: "BOX", btl: "BTL" };
/** Problems that stop the JSON from uploading. Empty = ready. */
export function ewayProblems(x: EwayInput): string[] {
  const p: string[] = [];
  if (!x.seller.gstin) p.push("Your GSTIN is not set (Settings → Business).");
  if (!pin(x.seller.address)) p.push("Your address needs a 6-digit PIN code.");
  if (!pin(x.buyer.address)) p.push("The buyer's address needs a 6-digit PIN code.");
  if (!stateCode(x.buyer.gstin || x.buyer.state)) p.push("The buyer's state is not set.");
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(x.transport.vehicleNo.replace(/[\s-]/g, "").toUpperCase())) p.push("Vehicle number looks wrong (e.g. KA38A1234).");
  if (!(x.transport.distanceKm > 0 && x.transport.distanceKm <= 4000)) p.push("Distance (km) is needed.");
  if (x.invoice.lineItems.some((l) => !l.hsnCode)) p.push("Every line needs an HSN code.");
  return p;
}
export function ewayJson(x: EwayInput) {
  const d = x.invoice.date.split("-").reverse().join("/");
  const fromState = stateCode(x.seller.gstin || x.seller.state) || 29;
  const toState = stateCode(x.buyer.gstin || x.buyer.state) || fromState;
  return {
    version: "1.0.0621",
    billLists: [{
      userGstin: x.seller.gstin, supplyType: "O", subSupplyType: 1, subSupplyDesc: "", docType: "INV", docNo: x.invoice.invoiceNo, docDate: d, transType: 1,
      fromGstin: x.seller.gstin, fromTrdName: x.seller.businessName, fromAddr1: (x.seller.address || "").slice(0, 120), fromAddr2: "", fromPlace: "", fromPincode: pin(x.seller.address), fromStateCode: fromState, actualFromStateCode: fromState,
      toGstin: x.buyer.gstin || "URP", toTrdName: x.buyer.name, toAddr1: (x.buyer.address || "").slice(0, 120), toAddr2: "", toPlace: "", toPincode: pin(x.buyer.address), toStateCode: toState, actualToStateCode: toState,
      totalValue: r2(x.invoice.subtotalInr), cgstValue: r2(x.invoice.cgstInr), sgstValue: r2(x.invoice.sgstInr), igstValue: r2(x.invoice.igstInr), cessValue: 0, cessNonAdvolValue: 0, otherValue: 0, totInvValue: r2(x.invoice.totalInr),
      transMode: x.transport.mode || 1, transDistance: String(Math.round(x.transport.distanceKm)), transporterName: "", transporterId: x.transport.transporterId || "", transDocNo: "", transDocDate: "",
      vehicleNo: x.transport.vehicleNo.replace(/[\s-]/g, "").toUpperCase(), vehicleType: "R",
      itemList: x.invoice.lineItems.map((l, i) => {
        const taxable = r2(l.lineSubtotalInr * (1 - (l.discountPct || 0) / 100));
        return {
          itemNo: i + 1, productName: l.name.slice(0, 100), productDesc: l.name.slice(0, 100), hsnCode: Number(String(l.hsnCode || "0").replace(/\D/g, "")), quantity: l.qty, qtyUnit: UQC[l.unit.toLowerCase()] || "OTH", taxableAmount: taxable,
          cgstRate: x.invoice.interState ? 0 : l.gstRatePct / 2, sgstRate: x.invoice.interState ? 0 : l.gstRatePct / 2, igstRate: x.invoice.interState ? l.gstRatePct : 0, cessRate: 0, cessNonAdvol: 0,
        };
      }),
    }],
  };
}

// ---------------------------------------------------------------------------
// Rate cards: price lists (Retail / Wholesale / Hotel …) and which party gets which list
// ---------------------------------------------------------------------------
export interface RateList { key: string; name: string; rates: Record<string, number> } // item name (lower) → ₹ per unit, pre-tax
export interface RateCards { lists: RateList[]; parties: Record<string, string>; partyRates?: Record<string, Record<string, number>>; defaultList?: string }
export const EMPTY_CARDS: RateCards = { lists: [{ key: "retail", name: "Retail", rates: {} }, { key: "wholesale", name: "Wholesale", rates: {} }], parties: {}, defaultList: "retail" };
const norm = (s: string | null | undefined) => String(s || "").trim().toLowerCase();

/** The card rate for this party + item: the party's own rate, else its list, else the default list. */
export function rateFor(cards: RateCards | null | undefined, partyName: string | null | undefined, item: string | null | undefined): { rate: number; from: string } | null {
  if (!cards || !item) return null;
  const it = norm(item), p = norm(partyName);
  const own = cards.partyRates?.[p]?.[it];
  if (own) return { rate: own, from: "party rate" };
  const listKey = (p && cards.parties[p]) || cards.defaultList;
  const list = cards.lists.find((l) => l.key === listKey);
  const r = list?.rates[it];
  return r ? { rate: r, from: list!.name } : null;
}
/** Below the card rate by more than `tolPct` → a warning line. */
export function belowCard(cards: RateCards | null | undefined, partyName: string | null | undefined, item: string, rate: number, tolPct = 0.5): string | null {
  const c = rateFor(cards, partyName, item);
  if (!c || !(rate > 0)) return null;
  return rate < c.rate * (1 - tolPct / 100) ? `${item}: ₹${rate} is below the ${c.from} rate ₹${c.rate}` : null;
}

// ---------------------------------------------------------------------------
// Profit & loss (trading view: sales − purchases − running expenses)
// ---------------------------------------------------------------------------
export function profitLoss(d: BizData, s: DateSpan) {
  const sales = salesReport(d, s), buys = purchaseReport(d, s), ex = expenseReport(d, s);
  // supplier payments settle purchases already counted → not an expense here
  const running = r2(ex.total - ex.supplierPayments);
  const gross = r2(sales.total - buys.total);
  const net = r2(gross - running);
  return {
    sales: sales.total, purchases: buys.total, gross, expenses: running, net,
    marginPct: sales.total > 0 ? r2((net / sales.total) * 100) : null,
    topExpenses: ex.byCategory.filter((c) => !/supplier/i.test(c.key)).slice(0, 6).map((c) => ({ name: c.key, amount: c.amount })),
  };
}

// ---------------------------------------------------------------------------
// 30-day cash forecast: today's cash + average daily money in/out + udhaar likely to come in
// ---------------------------------------------------------------------------
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
export interface ForecastOpts { openingInr: number; today: string; days?: number; lookback?: number; collectPct?: number; fixed?: { name: string; amountInr: number; day: number }[] }
export function cashForecast(d: BizData, o: ForecastOpts) {
  const look = o.lookback || 60, days = o.days || 30;
  const span = { from: addDays(o.today, -look + 1), to: o.today };
  const sales = salesReport(d, span), buys = purchaseReport(d, span), ex = expenseReport(d, span);
  // money actually received / paid (credit sales and credit purchases move cash later)
  const creditSales = d.register.filter((e) => e.paymentMode === "CREDIT" && (e.kind === "SALE" || e.kind === "FRESH_CRUSH") && e.date >= span.from && e.date <= span.to).reduce((a, e) => a + e.amountInr, 0)
    + d.sales.filter((x) => x.paymentMode === "CREDIT" && x.date >= span.from && x.date <= span.to).reduce((a, x) => a + x.totalInr, 0);
  const udhaarIn = d.register.filter((e) => e.kind === "UDHAAR_IN" && e.date >= span.from && e.date <= span.to).reduce((a, e) => a + e.amountInr, 0);
  const creditBuys = d.purchases.filter((x) => x.paymentMode === "CREDIT" && x.date >= span.from && x.date <= span.to).reduce((a, x) => a + x.totalInr, 0);
  const inPerDay = (sales.total - creditSales + udhaarIn) / look;
  const outPerDay = (buys.total - creditBuys + ex.total) / look;
  const pending = udhaarReport(d, o.today).outstanding;
  const collectPerDay = Math.max(0, pending * ((o.collectPct ?? 40) / 100) / days - udhaarIn / look);
  let bal = o.openingInr, low = { date: o.today, inr: bal };
  const series: { date: string; inr: number }[] = [{ date: o.today, inr: r2(bal) }];
  for (let i = 1; i <= days; i++) {
    const date = addDays(o.today, i);
    const dom = Number(date.slice(8, 10));
    bal += inPerDay + collectPerDay - outPerDay;
    for (const f of o.fixed || []) if (f.day === dom) bal -= f.amountInr;
    series.push({ date, inr: r2(bal) });
    if (bal < low.inr) low = { date, inr: r2(bal) };
  }
  return { inPerDay: r2(inPerDay), outPerDay: r2(outPerDay), udhaarPending: r2(pending), collectPerDay: r2(collectPerDay), end: r2(bal), low, series, firstNegative: series.find((p) => p.inr < 0)?.date || null };
}

// ---------------------------------------------------------------------------
// Expense budgets (monthly limit per category) with pace
// ---------------------------------------------------------------------------
export type Budgets = Record<string, number>; // category (as the expense report names it) → ₹ per month
export interface BudgetRow { name: string; limit: number; spent: number; projected: number; pct: number; level: "ok" | "watch" | "over" }
export function budgetRows(budgets: Budgets | null | undefined, d: BizData, today: string): BudgetRow[] {
  if (!budgets) return [];
  const from = `${today.slice(0, 8)}01`;
  const ex = expenseReport(d, { from, to: today });
  const dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const dom = Number(today.slice(8, 10));
  const spentBy: Record<string, number> = {};
  for (const c of ex.byCategory) spentBy[norm(c.key)] = c.amount;
  return Object.entries(budgets).filter(([, v]) => v > 0).map(([name, limit]) => {
    const spent = spentBy[norm(name)] || 0;
    const projected = r2((spent / dom) * dim);
    const pct = Math.round((spent / limit) * 100);
    const level: BudgetRow["level"] = spent > limit ? "over" : projected > limit ? "watch" : "ok";
    return { name, limit, spent: r2(spent), projected, pct, level };
  }).sort((a, b) => b.pct - a.pct);
}
