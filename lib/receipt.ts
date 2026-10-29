// A receipt for the roll printer (bill, payment received, job-work challan, day summary...) as plain data,
// so any page can build one and the receipt sheet prints it with the device's saved slip printer.
// Pure helpers only; tested in lib/__tests__/receipt.test.ts.

export interface ReceiptRow {
  /** left side: item / what */
  name: string;
  /** small line under it: "12 kg × ₹180", "Cash" */
  detail?: string;
  /** right side, already formatted ("₹2,160") */
  amount?: string;
}
export interface ReceiptTotal {
  label: string;
  value: string;
  strong?: boolean;
}
export interface ReceiptDoc {
  /** big word on top: BILL, RECEIPT, ESTIMATE, JOB-WORK CHALLAN, DAY SUMMARY */
  title: string;
  /** bill / receipt number */
  no?: string;
  /** when, already formatted */
  when?: string;
  /** customer / party */
  party?: string;
  rows: ReceiptRow[];
  totals?: ReceiptTotal[];
  /** lines printed small under the totals (notes, payment mode, "Thank you") */
  notes?: string[];
  /** monospace block (used by the day summary) */
  pre?: string;
  /** text encoded in a QR at the bottom (a link or a code), optional */
  qr?: string;
}

export interface ShopInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
}
export const DEFAULT_SHOP: ShopInfo = { name: "MAHADEV TRADERS" };

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
/** ₹1,23,456.5 → "₹1,23,456.50"; whole rupees stay whole. */
export function rupees(n: number | null | undefined): string {
  const v = Number(n) || 0;
  const s = Math.abs(v % 1) > 0.004 ? v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : inr.format(Math.round(v));
  return `₹${s}`;
}

/** "29 Oct 2026, 8:12 pm" in India time. */
export function receiptTime(d: Date | string | number = Date.now()): string {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** A file / job name for the receipt: "BILL-INV-0042". */
export function receiptName(doc: Pick<ReceiptDoc, "title" | "no">): string {
  return `${doc.title}${doc.no ? `-${doc.no}` : ""}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "receipt";
}

/** Keep what the sheet can show: trims text, drops empty rows, caps the length so a slip never runs to metres. */
export function cleanReceipt(doc: ReceiptDoc): ReceiptDoc {
  const t = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
  return {
    title: t(doc.title, 40) || "RECEIPT",
    no: t(doc.no, 40) || undefined,
    when: t(doc.when, 60) || undefined,
    party: t(doc.party, 80) || undefined,
    rows: (doc.rows || []).map((r) => ({ name: t(r.name, 80), detail: t(r.detail, 120) || undefined, amount: t(r.amount, 30) || undefined })).filter((r) => r.name || r.amount).slice(0, 80),
    totals: (doc.totals || []).map((x) => ({ label: t(x.label, 40), value: t(x.value, 30), strong: !!x.strong })).filter((x) => x.label || x.value).slice(0, 12),
    notes: (doc.notes || []).map((n) => t(n, 200)).filter(Boolean).slice(0, 12),
    pre: typeof doc.pre === "string" ? doc.pre.slice(0, 6000) : undefined,
    qr: t(doc.qr, 300) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Builders for the common receipts
// ---------------------------------------------------------------------------
const qtyText = (q: number, unit: string) => `${Math.round(q * 1000) / 1000} ${unit || ""}`.trim();
const MODE_TEXT: Record<string, string> = { CASH: "Cash", UPI: "UPI", BANK: "Bank", CREDIT: "Udhaar (credit)", OTHER: "Other" };
export const modeText = (m: string | null | undefined) => (m ? MODE_TEXT[m] ?? m : "");

export interface BillLine {
  name: string;
  qty: number;
  unit: string;
  rateInr: number;
  discountPct?: number;
  totalInr: number;
}

/** A sale bill / invoice as a roll receipt. */
export function billReceipt(b: {
  no?: string;
  date?: string;
  party?: string;
  lines: BillLine[];
  subtotalInr: number;
  cgstInr?: number;
  sgstInr?: number;
  igstInr?: number;
  totalInr: number;
  paymentMode?: string;
  notes?: string | null;
  title?: string;
}): ReceiptDoc {
  const gst = (b.cgstInr ?? 0) + (b.sgstInr ?? 0);
  const totals: ReceiptTotal[] = [];
  if (gst > 0 || (b.igstInr ?? 0) > 0) totals.push({ label: "Subtotal", value: rupees(b.subtotalInr) });
  if (gst > 0) totals.push({ label: "CGST + SGST", value: rupees(gst) });
  if ((b.igstInr ?? 0) > 0) totals.push({ label: "IGST", value: rupees(b.igstInr) });
  totals.push({ label: "TOTAL", value: rupees(b.totalInr), strong: true });
  return {
    title: b.title ?? "BILL",
    no: b.no,
    when: b.date,
    party: b.party,
    rows: b.lines.map((l) => ({
      name: l.name,
      detail: `${qtyText(l.qty, l.unit)} × ${rupees(l.rateInr)}${l.discountPct ? ` − ${l.discountPct}%` : ""}`,
      amount: rupees(l.totalInr),
    })),
    totals,
    notes: [b.paymentMode ? `Paid by: ${modeText(b.paymentMode)}` : "", b.notes ?? ""].filter(Boolean),
  };
}

/** One Quick Register entry (a sale, udhaar received, payment...) as a receipt. */
export function entryReceipt(e: { title: string; id?: string; when?: string; party?: string | null; what?: string; detail?: string; amountInr: number; mode?: string; notes?: string | null }): ReceiptDoc {
  return {
    title: e.title,
    no: e.id ? e.id.slice(-6).toUpperCase() : undefined,
    when: e.when,
    party: e.party || undefined,
    rows: [{ name: e.what || e.title, detail: e.detail, amount: rupees(e.amountInr) }],
    totals: [{ label: "AMOUNT", value: rupees(e.amountInr), strong: true }],
    notes: [e.mode ? `Mode: ${modeText(e.mode)}` : "", e.notes ?? ""].filter(Boolean),
  };
}
