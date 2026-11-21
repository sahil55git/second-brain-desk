// Reports over saved counter bills (pure, tested): daily sales, item-wise, payments, discounts, pending, held, staff,
// customers, busy hours, and cancelled bills (from the owner's activity log). Everything works on SavedBill rows already
// loaded for the chosen dates, so a report is just a different way of reading the same bills.
import type { SavedBill } from "./counterRecords";
import { handoverOf, isTracked, payStatus } from "./counterTrack";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const billKg = (b: SavedBill) => r3(b.lines.reduce((a, l) => a + (l.unit === "kg" && l.qty ? l.qty : 0), 0));

/** The discount typed on a bill is kept in its notes ("Item discount ₹10 · Discount ₹5"). */
export function discountOf(b: Pick<SavedBill, "notes">): { item: number; bill: number; total: number } {
  const n = b.notes || "";
  const num = (re: RegExp) => {
    const m = n.match(re);
    return m ? Number(m[1].replace(/,/g, "")) || 0 : 0;
  };
  const item = num(/Item discount ₹\s*([\d,.]+)/);
  const bill = num(/(?:^|[^m] |· )Discount ₹\s*([\d,.]+)/);
  return { item: r2(item), bill: r2(bill), total: r2(item + bill) };
}

export interface Totals {
  bills: number;
  sales: number;
  kg: number;
  avg: number;
  discount: number;
  /** money still to receive on these bills (cash/UPI not in yet, udhaar not paid) */
  pending: number;
  /** bills whose oil has not been given yet */
  held: number;
  modes: Record<string, number>;
}
export function totals(bills: SavedBill[]): Totals {
  const modes: Record<string, number> = {};
  let sales = 0, kg = 0, discount = 0, pending = 0, held = 0;
  for (const b of bills) {
    sales += b.total;
    kg += billKg(b);
    discount += discountOf(b).total;
    if (isTracked(b.track)) {
      pending += payStatus(b.modes, b.track).due;
      if (handoverOf(b.track) === "HELD") held++;
    }
    const pend = b.track?.payPending === true;
    for (const [m, v] of Object.entries(b.modes)) {
      const key = pend && m === "CASH" ? "PENDING" : m;
      modes[key] = r2((modes[key] || 0) + v);
    }
  }
  return { bills: bills.length, sales: r2(sales), kg: r3(kg), avg: bills.length ? r2(sales / bills.length) : 0, discount: r2(discount), pending: r2(pending), held, modes };
}

export interface DayRow { date: string; bills: number; kg: number; total: number; discount: number }
/** one row per day, newest first */
export function dayWise(bills: SavedBill[]): DayRow[] {
  const m = new Map<string, DayRow>();
  for (const b of bills) {
    const d = m.get(b.date) || { date: b.date, bills: 0, kg: 0, total: 0, discount: 0 };
    d.bills++;
    d.kg = r3(d.kg + billKg(b));
    d.total = r2(d.total + b.total);
    d.discount = r2(d.discount + discountOf(b).total);
    m.set(b.date, d);
  }
  return Array.from(m.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export interface ItemRow { key: string; label: string; unit: string; qty: number; bills: number; amount: number; avgRate: number; share: number }
/** item-wise sales, biggest first. Same item in different units stays apart. */
export function itemWise(bills: SavedBill[]): ItemRow[] {
  const m = new Map<string, ItemRow & { seen: Set<string> }>();
  let all = 0;
  for (const b of bills) {
    for (const l of b.lines) {
      const unit = l.unit || "";
      const key = `${(l.item || l.label).toLowerCase()}|${unit}`;
      const r = m.get(key) || { key, label: l.label, unit, qty: 0, bills: 0, amount: 0, avgRate: 0, share: 0, seen: new Set<string>() };
      r.qty = r3(r.qty + (l.qty || 0));
      r.amount = r2(r.amount + l.amount);
      if (!r.seen.has(b.key)) { r.seen.add(b.key); r.bills++; }
      all += l.amount;
      m.set(key, r);
    }
  }
  return Array.from(m.values())
    .map((x) => {
      const r: ItemRow = { key: x.key, label: x.label, unit: x.unit, qty: x.qty, bills: x.bills, amount: x.amount, avgRate: 0, share: 0 };
      return { ...r, avgRate: r.qty > 0 ? r2(r.amount / r.qty) : 0, share: all > 0 ? Math.round((r.amount / all) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface DiscRow { bill: SavedBill; item: number; billDisc: number; total: number; pct: number }
export function discountBills(bills: SavedBill[]): DiscRow[] {
  const out: DiscRow[] = [];
  for (const b of bills) {
    const d = discountOf(b);
    if (d.total > 0) out.push({ bill: b, item: d.item, billDisc: d.bill, total: d.total, pct: Math.round((d.total / (b.total + d.total)) * 1000) / 10 });
  }
  return out.sort((a, b) => b.total - a.total);
}

export interface PendRow { bill: SavedBill; due: number; udhaar: boolean; waitingMs: number }
/** bills with money still to receive, the oldest first */
export function pendingBills(bills: SavedBill[], now = Date.now()): PendRow[] {
  const out: PendRow[] = [];
  for (const b of bills) {
    if (!isTracked(b.track)) continue;
    const ps = payStatus(b.modes, b.track);
    if (ps.due > 0) out.push({ bill: b, due: ps.due, udhaar: ps.creditDue > 0 && ps.cashDue + ps.upiDue === 0, waitingMs: Math.max(0, now - new Date(b.createdAt).getTime()) });
  }
  return out.sort((a, b) => b.waitingMs - a.waitingMs);
}

/** bills whose oil is still held, the oldest first; `blocked` = money not in yet */
export function heldBills(bills: SavedBill[], now = Date.now()): { bill: SavedBill; blocked: number; waitingMs: number }[] {
  const out: { bill: SavedBill; blocked: number; waitingMs: number }[] = [];
  for (const b of bills) {
    if (!isTracked(b.track) || handoverOf(b.track) !== "HELD") continue;
    const ps = payStatus(b.modes, b.track);
    out.push({ bill: b, blocked: b.track.payPending ? b.total : r2(ps.cashDue + ps.upiDue), waitingMs: Math.max(0, now - new Date(b.createdAt).getTime()) });
  }
  return out.sort((a, b) => b.waitingMs - a.waitingMs);
}

export interface GroupRow { name: string; bills: number; total: number; kg: number; share: number }
function group(bills: SavedBill[], by: (b: SavedBill) => string): GroupRow[] {
  const m = new Map<string, GroupRow>();
  let all = 0;
  for (const b of bills) {
    const n = by(b);
    const r = m.get(n) || { name: n, bills: 0, total: 0, kg: 0, share: 0 };
    r.bills++;
    r.total = r2(r.total + b.total);
    r.kg = r3(r.kg + billKg(b));
    all += b.total;
    m.set(n, r);
  }
  return Array.from(m.values()).map((r) => ({ ...r, share: all > 0 ? Math.round((r.total / all) * 1000) / 10 : 0 })).sort((a, b) => b.total - a.total);
}
export const staffWise = (bills: SavedBill[], none = "—") => group(bills, (b) => b.by || none);
export const customerWise = (bills: SavedBill[], walkIn = "Walk-in") => group(bills, (b) => (b.party || "").trim() || walkIn);

/** udhaar (credit) still to collect, by customer */
export function udhaarDue(bills: SavedBill[]): { name: string; bills: number; due: number }[] {
  const m = new Map<string, { name: string; bills: number; due: number }>();
  for (const b of bills) {
    if (!isTracked(b.track)) continue;
    const c = payStatus(b.modes, b.track).creditDue;
    if (c <= 0) continue;
    const n = (b.party || "").trim() || "—";
    const r = m.get(n) || { name: n, bills: 0, due: 0 };
    r.bills++;
    r.due = r2(r.due + c);
    m.set(n, r);
  }
  return Array.from(m.values()).sort((a, b) => b.due - a.due);
}

export const istHour = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).slice(0, 2)) % 24;
export interface HourRow { hour: number; bills: number; total: number }
/** busy hours: bills and sales per hour of the day (only hours that had a bill) */
export function hourWise(bills: SavedBill[]): HourRow[] {
  const m = new Map<number, HourRow>();
  for (const b of bills) {
    const h = istHour(b.createdAt);
    const r = m.get(h) || { hour: h, bills: 0, total: 0 };
    r.bills++;
    r.total = r2(r.total + b.total);
    m.set(h, r);
  }
  return Array.from(m.values()).sort((a, b) => a.hour - b.hour);
}

export interface AuditLite { id: string; at: string; by: string; action: string; entity: string; summary: string }
export interface CancelRow { id: string; at: string; by: string; bill: string; amount: number; party: string; reason: string; edited: boolean }
/** Cancelled counter bills out of the activity log. A bill that was edited and saved again is listed as "edited", apart from real cancels. */
export function cancelledBills(rows: AuditLite[]): CancelRow[] {
  const out: CancelRow[] = [];
  for (const r of rows) {
    if (r.action !== "DELETE" || r.entity !== "RegisterEntry" || !/^SALE\b/.test(r.summary)) continue;
    const amt = r.summary.match(/^SALE Rs\s*([\d,.]+)/);
    const bill = r.summary.match(/Counter bill #(\w+):\s*/);
    const dash = r.summary.indexOf(" — ");
    const tail = dash >= 0 ? r.summary.slice(dash + 3) : "";
    const reason = tail.replace(/^Counter bill #\w+:\s*/, "").trim();
    const mid = r.summary.slice(0, dash >= 0 ? dash : undefined);
    const party = mid.replace(/^SALE Rs\s*[\d,.]+\s*/, "").replace(/\s*of \d{4}-\d{2}-\d{2}.*$/, "").trim();
    out.push({ id: r.id, at: r.at, by: r.by, bill: bill ? bill[1] : "", amount: amt ? Number(amt[1].replace(/,/g, "")) || 0 : 0, party, reason, edited: /^edited at the counter/i.test(reason) });
  }
  return out;
}

/** first and last day of a preset, from today's business date (YYYY-MM-DD) */
export function presetRange(p: "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth", today: string): { from: string; to: string } {
  const d = (s: string, add = 0) => {
    const t = new Date(`${s}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + add);
    return t.toISOString().slice(0, 10);
  };
  if (p === "today") return { from: today, to: today };
  if (p === "yesterday") return { from: d(today, -1), to: d(today, -1) };
  if (p === "7d") return { from: d(today, -6), to: today };
  if (p === "30d") return { from: d(today, -29), to: today };
  if (p === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() - 1);
  const f = first.toISOString().slice(0, 10);
  return { from: f, to: d(`${today.slice(0, 7)}-01`, -1) };
}
