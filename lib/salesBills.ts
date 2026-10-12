// Sales split view — pure helpers. The register stores one row per item /
// payment channel; here we put them back together as BILLS, bucket them by
// hour and classify them as paid / udhaar / part-paid. No React, no Prisma.
import { entryChannel, splitInfo, type PayChannel } from "./register";

export interface SaleRow {
  id: string;
  kind: string;
  amountInr: number;
  paymentMode: string;
  item?: string | null;
  itemLabel?: string | null;
  qty?: number | null;
  unit?: string | null;
  rateInr?: number | null;
  partyName?: string | null;
  notes?: string | null;
  createdAt: string | Date;
  details?: unknown;
}

export type BillStatus = "paid" | "udhaar" | "part";
export interface BillItem { name: string; qty: number | null; unit: string | null; rate: number | null; amount: number }
export interface Bill {
  id: string;
  at: number;
  hour: number;
  party: string | null;
  notes: string | null;
  fresh: boolean;
  items: BillItem[];
  total: number;
  paid: number;
  pending: number;
  channels: { channel: PayChannel; amount: number }[];
  status: BillStatus;
  rowIds: string[];
}
export type BillFilter = "all" | "paid" | "udhaar";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function istHour(ts: string | number | Date): number {
  const h = new Date(ts).toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  return Number(h) % 24;
}

export function billStatus(total: number, pending: number): BillStatus {
  if (pending <= 0.004) return "paid";
  return pending >= total - 0.004 ? "udhaar" : "part";
}

/** Groups SALE / FRESH_CRUSH register rows into bills (newest first). */
export function groupBills(rows: SaleRow[], nameOf: (r: SaleRow) => string): Bill[] {
  const groups = new Map<string, SaleRow[]>();
  for (const r of rows) {
    if (r.kind !== "SALE" && r.kind !== "FRESH_CRUSH") continue;
    const key = splitInfo(r.details)?.id || r.id;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const bills: Bill[] = [];
  for (const [id, g] of Array.from(groups.entries())) {
    g.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const lineMap = new Map<string, BillItem>();
    const chan = new Map<PayChannel, number>();
    let total = 0;
    let pending = 0;
    for (const r of g) {
      const bl = (r.details as { bill?: { line?: unknown } } | null | undefined)?.bill?.line;
      const lk = typeof bl === "number" ? `l${bl}` : "l1";
      const cur = lineMap.get(lk) || { name: nameOf(r), qty: null, unit: null, rate: null, amount: 0 };
      cur.amount = r2(cur.amount + r.amountInr);
      if (r.qty && cur.qty == null) { cur.qty = Number(r.qty); cur.unit = r.unit || null; cur.rate = r.rateInr ?? null; }
      lineMap.set(lk, cur);
      const c = entryChannel({ paymentMode: r.paymentMode, details: r.details });
      chan.set(c, r2((chan.get(c) || 0) + r.amountInr));
      total = r2(total + r.amountInr);
      if (r.paymentMode === "CREDIT") pending = r2(pending + r.amountInr);
    }
    const at = new Date(g[0].createdAt).getTime();
    bills.push({
      id,
      at,
      hour: istHour(at),
      party: g.find((r) => r.partyName)?.partyName || null,
      notes: g.find((r) => r.notes)?.notes || null,
      fresh: g[0].kind === "FRESH_CRUSH",
      items: Array.from(lineMap.values()),
      total,
      paid: r2(total - pending),
      pending,
      channels: Array.from(chan.entries()).map(([channel, amount]) => ({ channel, amount })),
      status: billStatus(total, pending),
      rowIds: g.map((r) => r.id),
    });
  }
  return bills.sort((a, b) => b.at - a.at);
}

/** Sales ₹ per hour (index = hour 0..23). */
export function hourBuckets(bills: Bill[]): number[] {
  const out = new Array(24).fill(0);
  for (const b of bills) out[b.hour] = r2(out[b.hour] + b.total);
  return out;
}

export function filterBills(bills: Bill[], filter: BillFilter, hour: number | null): Bill[] {
  return bills.filter((b) => {
    if (hour !== null && b.hour !== hour) return false;
    if (filter === "paid") return b.status === "paid";
    if (filter === "udhaar") return b.status !== "paid";
    return true;
  });
}

export function billTotals(bills: Bill[]) {
  return bills.reduce(
    (t, b) => ({ count: t.count + 1, total: r2(t.total + b.total), pending: r2(t.pending + b.pending) }),
    { count: 0, total: 0, pending: 0 },
  );
}
