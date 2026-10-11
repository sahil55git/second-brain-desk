// Turns a desk's records into compact text for the AI terminal (answer-only).
// Pure formatting — the route fetches the rows. Kept short so free models cope.
import type { ExpenseDTO, PurchaseBillDTO, SalesInvoiceDTO } from "@/lib/types";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const q = (n: number) => String(Math.round(n * 100) / 100);
export const CONTEXT_MAX_CHARS = 14000;

export function cap(text: string, max = CONTEXT_MAX_CHARS): string {
  return text.length <= max ? text : text.slice(0, max) + "\n… (older records cut off)";
}

type Doc = Pick<PurchaseBillDTO, "date" | "paymentMode" | "totalInr"> & {
  party?: { name: string } | null;
  lineItems: { name: string; qty: number; unit: string; rateInr: number; gstRatePct: number }[];
};

function docLine(d: Doc, no: string) {
  const items = d.lineItems.map((l) => `${l.name} ${q(l.qty)}${l.unit} @${inr(l.rateInr)} (${q(l.gstRatePct)}%)`).join("; ");
  return `${d.date} ${no} ${d.party?.name ?? "?"} [${d.paymentMode}] total ${inr(d.totalInr)}: ${items}`;
}

export function purchaseContext(bills: PurchaseBillDTO[]): string {
  return ["=== PURCHASE BILLS (newest first) ===", ...bills.map((b) => docLine(b, `bill ${b.billNo}`))].join("\n");
}

export function salesContext(invoices: SalesInvoiceDTO[], bills: PurchaseBillDTO[]): string {
  const cost = new Map<string, string>();
  for (const b of bills)
    for (const l of b.lineItems) {
      const k = l.name.toLowerCase();
      if (!cost.has(k)) cost.set(k, `${l.name}: last bought ${inr(l.rateInr)}/${l.unit} on ${b.date} from ${b.party?.name ?? "?"}`);
    }
  return [
    "=== SALES INVOICES (newest first) ===",
    ...invoices.map((s) => docLine(s, `inv ${s.invoiceNo}`)),
    "",
    "=== LAST PURCHASE COST PER ITEM ===",
    ...Array.from(cost.values()),
  ].join("\n");
}

export function expenseContext(expenses: ExpenseDTO[]): string {
  return ["=== EXPENSES (newest first) ===", ...expenses.map((e) => `${e.date} ${e.category} ${inr(e.amountInr)} [${e.paymentMode}]${e.party?.name ? ` to ${e.party.name}` : ""}${e.notes ? ` — ${e.notes.slice(0, 60)}` : ""}`)].join("\n");
}

export interface LotLine {
  lotNo: string;
  date: string;
  supplierName: string;
  product: string;
  barrels: number;
  done: number;
  measuredNetKg: number;
  declaredNetKg: number | null;
  diffKg: number | null;
}

export function barrelLotsContext(lots: LotLine[]): string {
  return [
    "=== BARREL LOTS (oil weighed full and empty; owner only) ===",
    ...lots.map((l) => `${l.date} lot ${l.lotNo} ${l.supplierName}, ${l.product}: ${l.done}/${l.barrels} barrels emptied, measured net ${q(l.measuredNetKg)} kg${l.declaredNetKg != null ? `, challan ${q(l.declaredNetKg)} kg` : ""}${l.diffKg != null ? `, difference ${q(l.diffKg)} kg` : ""}`),
  ].join("\n");
}
