// What the Android "Cashier desk" widget shows: money still to receive, bills waiting, oil held / ready to give.
// Pure; the rows are today's register rows (same ones the counter's Bills page reads).
import { groupBills, type SaleRow } from "@/lib/counterRecords";
import { handoverOf, heldNeed, heldQueue, isTracked, payStatus } from "@/lib/counterTrack";

export interface CashierSummary {
  toReceive: number;   // rupees still to come in (cash + UPI, not udhaar)
  billsToPay: number;  // bills with money pending
  oilHeld: number;     // bills whose oil is still held
  oilReady: number;    // of those, paid and ready to give
  oldestMin: number;   // minutes the oldest held bill has waited
}

export function cashierSummary(rows: SaleRow[], now = Date.now()): CashierSummary {
  const bills = groupBills(rows, (item, label) => label || item || "Item");
  let toReceive = 0;
  let billsToPay = 0;
  for (const b of bills) {
    if (!isTracked(b.track)) continue;
    const due = b.track.payPending ? b.total : (() => { const ps = payStatus(b.modes, b.track); return ps.cashDue + ps.upiDue; })();
    if (due > 0) { toReceive += due; billsToPay++; }
  }
  const q = heldQueue(bills);
  const oldest = q.length ? Math.max(...q.map((b) => now - new Date(b.createdAt).getTime())) : 0;
  return {
    toReceive: Math.round(toReceive * 100) / 100,
    billsToPay,
    oilHeld: bills.filter((b) => isTracked(b.track) && handoverOf(b.track) === "HELD").length,
    oilReady: q.filter((b) => heldNeed(b.modes, b.track) === "READY").length,
    oldestMin: Math.max(0, Math.floor(oldest / 60_000)),
  };
}
