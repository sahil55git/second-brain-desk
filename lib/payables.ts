// What the shop owes its suppliers (SOP self-crushing step 1: seed is bought on credit, a
// running account per supplier, paid in 10–20 days).
//
// Nothing new is stored for this. It reads what the desks already record:
//   owed  = purchase bills on credit (Purchases desk)
//         + purchases on credit in the Quick Register
//   paid  = Quick Register → Payment → Supplier, for that supplier (any mode)
// Payments are set against the oldest unpaid purchase first. Pure functions, no database.

export interface PayBill {
  id: string;
  /** where it was recorded */
  source: "bill" | "register";
  /** supplier's bill number, or the item bought for a register purchase */
  ref: string;
  date: string;
  amountInr: number;
  partyId: string | null;
  partyName: string | null;
}
export interface PayPayment {
  id: string;
  date: string;
  amountInr: number;
  partyId: string | null;
  partyName: string | null;
}
export interface PayParty {
  id: string;
  name: string;
}

export type PayStatus = "ok" | "due" | "late";
/** Days since purchase: up to 10 is fine, 11–20 is the payment window, past 20 is late. */
export const PAY_OK_DAYS = 10;
export const PAY_LATE_DAYS = 20;

export interface OpenBill extends PayBill {
  remainingInr: number;
  daysOld: number;
  status: PayStatus;
}
export interface SupplierDue {
  /** party id, or "name:<lowercase name>" when the entry was typed without picking a party */
  key: string;
  partyId: string | null;
  name: string;
  billedInr: number;
  paidInr: number;
  /** still to pay (0 when paid ahead) */
  owedInr: number;
  /** paid more than was bought on credit */
  advanceInr: number;
  openBills: OpenBill[];
  oldestDays: number;
  status: PayStatus;
  lastPaymentDate: string | null;
}
export interface PayablesSummary {
  suppliers: SupplierDue[];
  totalOwedInr: number;
  lateInr: number;
  dueInr: number;
  /** supplier payments typed with no supplier name: they could not be set against anyone */
  unassignedPaidInr: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** Whole days from one business date to another (never negative). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function payStatus(daysOld: number): PayStatus {
  return daysOld > PAY_LATE_DAYS ? "late" : daysOld > PAY_OK_DAYS ? "due" : "ok";
}

export function payables(bills: PayBill[], payments: PayPayment[], parties: PayParty[], today: string): PayablesSummary {
  const byId = new Map(parties.map((p) => [p.id, p]));
  const byName = new Map(parties.map((p) => [norm(p.name), p]));
  // one supplier, however the entry named them: picked party, or the same name typed by hand
  const keyOf = (partyId: string | null, partyName: string | null): { key: string; partyId: string | null; name: string } | null => {
    const p = (partyId && byId.get(partyId)) || byName.get(norm(partyName));
    if (p) return { key: p.id, partyId: p.id, name: p.name };
    const n = norm(partyName);
    return n ? { key: `name:${n}`, partyId: null, name: (partyName || "").trim() } : null;
  };

  const acc = new Map<string, { partyId: string | null; name: string; bills: PayBill[]; paid: number; lastPay: string | null }>();
  const slot = (k: { key: string; partyId: string | null; name: string }) => {
    let s = acc.get(k.key);
    if (!s) acc.set(k.key, (s = { partyId: k.partyId, name: k.name, bills: [], paid: 0, lastPay: null }));
    return s;
  };
  for (const b of bills) {
    if (!(b.amountInr > 0)) continue;
    const k = keyOf(b.partyId, b.partyName) ?? { key: "name:?", partyId: null, name: "Supplier not named" };
    slot(k).bills.push(b);
  }
  let unassigned = 0;
  for (const p of payments) {
    if (!(p.amountInr > 0)) continue;
    const k = keyOf(p.partyId, p.partyName);
    if (!k) {
      unassigned += p.amountInr;
      continue;
    }
    const s = slot(k);
    s.paid += p.amountInr;
    if (!s.lastPay || p.date > s.lastPay) s.lastPay = p.date;
  }

  const suppliers: SupplierDue[] = [];
  for (const [key, s] of Array.from(acc.entries())) {
    const billed = s.bills.reduce((a, b) => a + b.amountInr, 0);
    let left = s.paid;
    const open: OpenBill[] = [];
    for (const b of [...s.bills].sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))) {
      const used = Math.min(left, b.amountInr);
      left -= used;
      const remaining = r2(b.amountInr - used);
      if (remaining > 0.005) {
        const daysOld = daysBetween(b.date, today);
        open.push({ ...b, remainingInr: remaining, daysOld, status: payStatus(daysOld) });
      }
    }
    const owed = r2(Math.max(0, billed - s.paid));
    const oldestDays = open.length ? open[0].daysOld : 0;
    // nothing bought on credit and nothing paid ahead: not a payables row
    if (!s.bills.length && s.paid <= 0) continue;
    suppliers.push({
      key,
      partyId: s.partyId,
      name: s.name,
      billedInr: r2(billed),
      paidInr: r2(s.paid),
      owedInr: owed,
      advanceInr: r2(Math.max(0, s.paid - billed)),
      openBills: open,
      oldestDays,
      status: open.length ? payStatus(oldestDays) : "ok",
      lastPaymentDate: s.lastPay,
    });
  }
  // most urgent first: oldest unpaid purchase, then the biggest amount
  suppliers.sort((a, b) => Number(b.owedInr > 0) - Number(a.owedInr > 0) || b.oldestDays - a.oldestDays || b.owedInr - a.owedInr || a.name.localeCompare(b.name));
  const sumOpen = (st: PayStatus) => r2(suppliers.reduce((a, s) => a + s.openBills.filter((b) => b.status === st).reduce((x, b) => x + b.remainingInr, 0), 0));
  return { suppliers, totalOwedInr: r2(suppliers.reduce((a, s) => a + s.owedInr, 0)), lateInr: sumOpen("late"), dueInr: sumOpen("due"), unassignedPaidInr: r2(unassigned) };
}
