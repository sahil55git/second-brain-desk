// UPI "payment received" notifications → which waiting counter bill they pay (pure, tested).

export interface UpiHit {
  amount: number;
  payer: string;
  /** the bank's reference / UTR / transaction id, when the notification shows one */
  ref?: string;
  /** a bill number the customer typed in the payment note ("Bill 12"), when the notification shows the note */
  billNo?: number;
}

const AMOUNT = /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
// money going OUT or only asked for: never counts as a payment received
const NOT_IN = /\byou paid\b|\byou sent\b|\bpaid to\b|\bsent to\b|\bpayment to\b|debited|\brequested\b|\brequest\b|\bpay request\b|\bto pay\b|reminder|\bfailed\b|\bpending\b|\bdeclined\b|\brefund/i;
const IS_IN = /\breceived\b|\bcredited\b|\bpaid you\b|\bsent you\b|payment from|\bhas paid\b|money received|credit alert/i;

function payerIn(s: string): string {
  const p = /\bfrom\s+([A-Za-z][A-Za-z .'-]{1,30}?)(?=$|[.,!(]|\s+(?:via|on|using|to|ref|upi|at)\b)/i.exec(s) || /^([A-Za-z][A-Za-z .'-]{1,30}?)\s+(?:paid|sent) you/i.exec(s);
  return p ? p[1].trim() : "";
}

// A transaction reference: UTR / UPI Ref / Txn ID / Transaction ID followed by 8 to 24 letters or digits that include a digit
const REF = /\b(?:utr|upi\s*ref(?:erence)?(?:\s*(?:no|id|number))?|ref(?:erence)?(?:\s*(?:no|id|number))?|txn(?:\s*(?:id|no))?|transaction(?:\s*(?:id|no|ref(?:erence)?))?)\b\s*[:#.\-]?\s*([A-Za-z0-9]{8,24})\b/gi;
export function refOf(s: string): string | undefined {
  const re = new RegExp(REF.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) if (/\d/.test(m[1])) return m[1].toUpperCase();
  return undefined;
}
// "Bill 12", "Bill no 12", "bill #12" in the payment note
export function billNoOf(s: string): number | undefined {
  const m = /\bbill\s*(?:no\.?|number|#)?\s*[:#-]?\s*(\d{1,7})\b/i.exec(s);
  return m ? Number(m[1]) : undefined;
}

/** The amount, payer, bank reference and bill number (when shown) of a "money received" notification, or null for anything else. */
export function parseUpi(title: string, text: string): UpiHit | null {
  const s = `${title || ""} ${text || ""}`.replace(/\s+/g, " ").trim();
  if (!s || NOT_IN.test(s) || !IS_IN.test(s)) return null;
  const m = AMOUNT.exec(s);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[1].replace(/,/g, "")) * 100) / 100;
  if (!(amount > 0)) return null;
  const one = (v: string) => (v || "").replace(/\s+/g, " ").trim();
  // the title and the body are tried on their own first, so a long body cannot swallow the name ("₹1.70 received from SAHIL L" + "See live notifications…")
  const payer = payerIn(one(title)) || payerIn(one(text)) || payerIn(s);
  const ref = refOf(s);
  const billNo = billNoOf(s);
  return { amount, payer, ...(ref ? { ref } : {}), ...(billNo ? { billNo } : {}) };
}

export interface UpiEvent {
  id: string;
  at: number;
  amount: number;
  payer: string;
  ref?: string;
  billNo?: number;
}
export interface PendingBill {
  key: string;
  /** when the bill was saved (ms) */
  at: number;
  /** UPI amount still to be confirmed */
  due: number;
  /** printed bill number (a plain serial) */
  no?: string;
  /** customer name on the bill, if any */
  party?: string | null;
}

const BEFORE_MS = 10 * 60_000; // the customer may pay a little before the bill is saved
const AFTER_MS = 2 * 60 * 60_000;

/** Could this payment be for this bill: same amount, and it arrived from 10 minutes before the bill to 2 hours after. */
export function fitsBill(e: { amount: number; at: number }, b: { due: number; at: number }): boolean {
  return Math.abs(e.amount - b.due) < 0.005 && e.at >= b.at - BEFORE_MS && e.at <= b.at + AFTER_MS;
}

const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) || []);
/** Do the payer's name on the UPI notification and the customer's name on the bill look like the same person? */
export function sameName(payer: string, party: string | null | undefined): boolean {
  if (!payer || !party) return false;
  const a = words(payer);
  const b = words(party);
  return a.some((x) => b.some((y) => x === y || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y))));
}

/** The same payment shown twice (apps often post one notification twice): same app text, a short time apart. */
export function samePayment(a: { amount: number; payer: string; ref?: string; at: number }, b: { amount: number; payer: string; ref?: string; at: number }): boolean {
  if (a.ref && b.ref) return a.ref === b.ref;
  return Math.abs(a.amount - b.amount) < 0.005 && a.payer.toLowerCase() === b.payer.toLowerCase() && Math.abs(a.at - b.at) <= 90_000;
}

export type MatchHow = "bill no" | "only bill" | "name";
export interface UpiPlan {
  /** certain: the payment is for exactly this bill */
  auto: { eventId: string; billKey: string; how: MatchHow }[];
  /** several bills could be the one: the person chooses (candidates oldest first) */
  ask: { eventId: string; billKeys: string[] }[];
}

/**
 * Pairs payments with waiting bills, one to one, and never guesses:
 *  1. the note names the bill ("Bill 12") → that bill;
 *  2. only one bill has that amount in the time window (and no other payment fits it) → that bill;
 *  3. several bills have the amount → the one whose customer name matches the payer, if exactly one does;
 *  4. otherwise the payment goes to `ask`: the person taps the right bill, so nobody is paid twice or for the wrong bill.
 * A payment that fits no waiting bill is in neither list.
 */
export function planUpi(events: UpiEvent[], bills: PendingBill[], used: Set<string>): UpiPlan {
  const fits = (e: UpiEvent, b: PendingBill) => !used.has(e.id) && fitsBill(e, b);
  const evs = [...events].sort((x, y) => x.at - y.at);
  const taken = new Set<string>();
  const auto: UpiPlan["auto"] = [];
  const ask: UpiPlan["ask"] = [];
  const claim = (e: UpiEvent, b: PendingBill, how: MatchHow) => {
    taken.add(b.key);
    auto.push({ eventId: e.id, billKey: b.key, how });
  };
  // 1) bill number in the payment note
  for (const e of evs) {
    if (!e.billNo) continue;
    const c = bills.filter((b) => !taken.has(b.key) && fits(e, b) && Number(b.no) === e.billNo);
    if (c.length === 1) claim(e, c[0], "bill no");
  }
  const done = () => new Set(auto.map((a) => a.eventId));
  // 2) and 3) by amount, then by name
  for (const e of evs) {
    if (done().has(e.id) || used.has(e.id)) continue;
    const cands = bills.filter((b) => !taken.has(b.key) && fits(e, b)).sort((x, y) => x.at - y.at);
    if (!cands.length) continue;
    if (cands.length === 1) {
      const b = cands[0];
      const rivals = evs.filter((o) => o.id !== e.id && !done().has(o.id) && fits(o, b));
      if (!rivals.length) claim(e, b, "only bill");
      continue; // two payments of the same amount for one bill: left for the person
    }
    const named = cands.filter((b) => sameName(e.payer, b.party));
    if (named.length === 1) claim(e, named[0], "name");
    else ask.push({ eventId: e.id, billKeys: cands.map((b) => b.key) });
  }
  // a bill claimed later in the loop is no longer a choice
  const left = ask.map((a) => ({ ...a, billKeys: a.billKeys.filter((k) => !taken.has(k)) })).filter((a) => a.billKeys.length > 0);
  return { auto, ask: left };
}

/** The certain matches only (kept for callers that do not ask). */
export function matchUpi(events: UpiEvent[], bills: PendingBill[], used: Set<string>): { eventId: string; billKey: string }[] {
  return planUpi(events, bills, used).auto.map(({ eventId, billKey }) => ({ eventId, billKey }));
}
