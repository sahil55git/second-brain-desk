// Returns at the Weigh & Bill counter (pure, tested). A return is a SALE_RETURN register entry that
// points at the bill it came from (details.returnOf = the plain bill number): the stock comes back,
// and the money goes back out (cash / UPI) or the customer's udhaar falls.
import type { SaleRow, SavedBill } from "./counterRecords";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type RefundMode = "CASH" | "UPI" | "CREDIT";

/** What has already been taken back from one bill. */
export interface ReturnedSoFar {
  amount: number;
  qty: Record<string, number>;
  amt: Record<string, number>;
}

/** Same item on a bill (e.g. two weighings of karadi) is one returnable line. */
export const lineKey = (item: string | null, label: string | null) => (item && item !== "other" ? item : `other:${(label || "").trim().toLowerCase()}`);

export function returnedByBill(rows: SaleRow[]): Map<string, ReturnedSoFar> {
  const out = new Map<string, ReturnedSoFar>();
  for (const r of rows) {
    if (r.kind !== "SALE_RETURN") continue;
    const no = Number((r.details as { returnOf?: unknown } | null)?.returnOf);
    if (!Number.isInteger(no) || no <= 0) continue;
    const k = String(no);
    const cur = out.get(k) || { amount: 0, qty: {}, amt: {} };
    const lk = lineKey(r.item, r.itemLabel);
    cur.amount = r2(cur.amount + r.amountInr);
    cur.amt[lk] = r2((cur.amt[lk] || 0) + r.amountInr);
    if (r.qty) cur.qty[lk] = r3((cur.qty[lk] || 0) + r.qty);
    out.set(k, cur);
  }
  return out;
}

export interface ReturnItem {
  key: string;
  item: string | null;
  label: string;
  unit: string | null;
  soldQty: number;
  soldNet: number;
  leftQty: number;
  leftAmt: number;
}

/** The lines of a bill that can still come back, with what is left of each. */
export function returnables(bill: SavedBill, prior?: ReturnedSoFar): ReturnItem[] {
  const m = new Map<string, ReturnItem>();
  for (const l of bill.lines) {
    const key = lineKey(l.item, l.label);
    const cur = m.get(key) || { key, item: l.item, label: l.label, unit: l.unit, soldQty: 0, soldNet: 0, leftQty: 0, leftAmt: 0 };
    cur.soldQty = r3(cur.soldQty + (l.qty && l.qty > 0 ? l.qty : 1)); // a line saved as a total only comes back whole
    cur.soldNet = r2(cur.soldNet + l.amount);
    m.set(key, cur);
  }
  return Array.from(m.values()).map((i) => ({
    ...i,
    leftQty: Math.max(0, r3(i.soldQty - (prior?.qty[i.key] || 0))),
    leftAmt: Math.max(0, r2(i.soldNet - (prior?.amt[i.key] || 0))),
  }));
}

/** Money back for `qty` of an item: pro-rata of what was really paid for it (after discount); the last of it takes the rest. */
export function refundFor(it: ReturnItem, qty: number): number {
  if (!(qty > 0) || it.leftQty <= 0) return 0;
  if (qty >= it.leftQty - 0.0005) return it.leftAmt;
  return Math.min(it.leftAmt, r2((qty * it.soldNet) / it.soldQty));
}

/** Refund the way the customer paid: udhaar bill → reduce udhaar, UPI → UPI, else cash. */
export function defaultRefundMode(bill: SavedBill): RefundMode {
  const top = Object.entries(bill.modes).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top === "CREDIT" ? "CREDIT" : top === "UPI" ? "UPI" : "CASH";
}

export interface ReturnBody {
  date: string;
  kind: "SALE_RETURN";
  amountInr: number;
  paymentMode: RefundMode;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  totalSale: false;
  lines?: { item: string | null; itemLabel: string | null; qty: number; unit: string | null; rate: number; amount: number }[];
  returnOf?: number;
  partyName: string | null;
  notes: string;
}

export function returnBody(
  bill: SavedBill,
  items: ReturnItem[],
  picks: Record<string, number>,
  opts: { date: string; mode: RefundMode; party?: string; reason?: string }
): { err: string } | { body: ReturnBody; amount: number } {
  const lines: NonNullable<ReturnBody["lines"]> = [];
  for (const it of items) {
    const q = r3(picks[it.key] || 0);
    if (!(q > 0)) continue;
    if (q > it.leftQty + 0.0005) return { err: `Only ${it.leftQty} ${it.unit || ""} of ${it.label} is left to return.` };
    const amount = refundFor(it, q);
    if (!(amount > 0)) return { err: `${it.label}: nothing left to refund.` };
    lines.push({ item: it.item, itemLabel: !it.item || it.item === "other" ? it.label : null, qty: q, unit: it.unit, rate: r2(amount / q), amount });
  }
  if (!lines.length) return { err: "Pick at least one item to return." };
  const party = (opts.party ?? bill.party ?? "").trim();
  if (opts.mode === "CREDIT" && !party) return { err: "Udhaar needs the customer's name." };
  const amountInr = r2(lines.reduce((a, l) => a + l.amount, 0));
  const no = Number(bill.no);
  const one = lines.length === 1 ? lines[0] : null;
  return {
    amount: amountInr,
    body: {
      date: opts.date,
      kind: "SALE_RETURN",
      amountInr,
      paymentMode: opts.mode,
      totalSale: false,
      item: one ? one.item : null,
      itemLabel: one ? one.itemLabel : null,
      qty: one ? one.qty : null,
      unit: one ? one.unit : null,
      rateInr: one ? one.rate : null,
      lines: lines.length > 1 ? lines : undefined,
      ...(Number.isInteger(no) && no > 0 ? { returnOf: no } : {}),
      partyName: party || null,
      notes: [`Return of bill #${bill.no}`, opts.reason?.trim()].filter(Boolean).join(" · "),
    },
  };
}
