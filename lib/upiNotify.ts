// UPI "payment received" notifications → which waiting counter bill they pay (pure, tested).

export interface UpiHit {
  amount: number;
  payer: string;
}

const AMOUNT = /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
// money going OUT or only asked for: never counts as a payment received
const NOT_IN = /\byou paid\b|\byou sent\b|\bpaid to\b|\bsent to\b|\bpayment to\b|debited|\brequested\b|\brequest\b|\bpay request\b|\bto pay\b|reminder|\bfailed\b|\bpending\b|\bdeclined\b|\brefund/i;
const IS_IN = /\breceived\b|\bcredited\b|\bpaid you\b|\bsent you\b|payment from|\bhas paid\b|money received|credit alert/i;

function payerIn(s: string): string {
  const p = /\bfrom\s+([A-Za-z][A-Za-z .'-]{1,30}?)(?=$|[.,!(]|\s+(?:via|on|using|to|ref|upi|at)\b)/i.exec(s) || /^([A-Za-z][A-Za-z .'-]{1,30}?)\s+(?:paid|sent) you/i.exec(s);
  return p ? p[1].trim() : "";
}

/** The amount and payer of a "money received" notification, or null for anything else. */
export function parseUpi(title: string, text: string): UpiHit | null {
  const s = `${title || ""} ${text || ""}`.replace(/\s+/g, " ").trim();
  if (!s || NOT_IN.test(s) || !IS_IN.test(s)) return null;
  const m = AMOUNT.exec(s);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[1].replace(/,/g, "")) * 100) / 100;
  if (!(amount > 0)) return null;
  const payer = payerIn((text || "").replace(/\s+/g, " ").trim()) || payerIn(s);
  return { amount, payer };
}

export interface UpiEvent {
  id: string;
  at: number;
  amount: number;
  payer: string;
}
export interface PendingBill {
  key: string;
  /** when the bill was saved (ms) */
  at: number;
  /** UPI amount still to be confirmed */
  due: number;
}

const BEFORE_MS = 10 * 60_000; // the customer may pay a little before the bill is saved
const AFTER_MS = 2 * 60 * 60_000;

/**
 * Pairs payments with bills, one to one. A payment is used only when exactly one waiting bill
 * has that amount in the time window and no other payment fits that bill too; anything unclear
 * stays for the person to tick by hand.
 */
export function matchUpi(events: UpiEvent[], bills: PendingBill[], used: Set<string>): { eventId: string; billKey: string }[] {
  const fits = (e: UpiEvent, b: PendingBill) => !used.has(e.id) && Math.abs(e.amount - b.due) < 0.005 && e.at >= b.at - BEFORE_MS && e.at <= b.at + AFTER_MS;
  const out: { eventId: string; billKey: string }[] = [];
  for (const b of bills) {
    const evs = events.filter((e) => fits(e, b));
    if (evs.length !== 1) continue;
    const rivals = bills.filter((o) => o.key !== b.key && fits(evs[0], o));
    if (rivals.length) continue;
    out.push({ eventId: evs[0].id, billKey: b.key });
  }
  return out;
}
