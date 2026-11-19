// Payment status and goods hand-over of a counter bill (pure, tested).
// Money is already in the books when the bill is saved (cash, UPI, udhaar rows); this only tracks
// whether the money has really arrived and whether the oil / oil can has left the shop.

export type Handover = "GIVEN" | "HELD";
export type PayState = "PAID" | "PARTLY" | "PENDING" | "UNPAID";

export interface UpiProof {
  at: string;
  by: string;
  /** the bank's reference / UTR / transaction id, when the notification showed one */
  ref?: string;
  /** who paid, as the UPI app showed it */
  payer?: string;
  /** rupees in that payment */
  amount?: number;
  /** the UPI app that showed it (package name) */
  pkg?: string;
  /** the notification's own id on the shop device (so one payment is never used for two bills) */
  evId?: string;
  /** when the payment arrived (ms) */
  evAt?: number;
}

export interface BillTrack {
  handover?: Handover;
  handedAt?: string;
  /** UPI part checked on the shop's phone / bank app; when it came from a UPI notification, which payment it was */
  upiOk?: UpiProof;
  /** this bill's goods were held for the cash too: the cash part counts as "to receive" until the counter confirms it */
  cashWait?: boolean;
  /** "Pay at the queue": the bill was printed with no payment mode yet (saved as cash, waiting); the counter / cashier chooses Cash, UPI, Udhaar or Split when the money comes */
  payPending?: boolean;
  /** cash part confirmed in the drawer by whoever sits at the counter */
  cashOk?: { at: string; by: string; given?: number; change?: number };
  /** udhaar part collected later (an UDHAAR_IN entry was made) */
  paidLater?: { at: string; by: string; mode: "CASH" | "UPI"; amount: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What was saved on the bill's first row (details.track). Anything odd is ignored. */
export function trackOf(details: unknown): BillTrack {
  const t = ((details || {}) as { track?: Record<string, unknown> }).track;
  if (!t || typeof t !== "object") return {};
  const out: BillTrack = {};
  if (t.handover === "GIVEN" || t.handover === "HELD") out.handover = t.handover;
  if (typeof t.handedAt === "string") out.handedAt = t.handedAt;
  if (t.cashWait === true) out.cashWait = true;
  if (t.payPending === true) out.payPending = true;
  const c = t.cashOk as { at?: unknown; by?: unknown; given?: unknown; change?: unknown } | undefined;
  if (c && typeof c.at === "string") {
    const g = Number(c.given);
    const ch = Number(c.change);
    out.cashOk = { at: c.at, by: typeof c.by === "string" ? c.by : "", ...(Number.isFinite(g) && g > 0 ? { given: g } : {}), ...(Number.isFinite(ch) && ch >= 0 && g > 0 ? { change: ch } : {}) };
  }
  const u = t.upiOk as Record<string, unknown> | undefined;
  if (u && typeof u.at === "string") {
    const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
    const amt = Number(u.amount);
    const evAt = Number(u.evAt);
    out.upiOk = {
      at: u.at,
      by: typeof u.by === "string" ? u.by : "",
      ...(txt(u.ref, 40) ? { ref: txt(u.ref, 40) } : {}),
      ...(txt(u.payer, 60) ? { payer: txt(u.payer, 60) } : {}),
      ...(Number.isFinite(amt) && amt > 0 ? { amount: amt } : {}),
      ...(txt(u.pkg, 80) ? { pkg: txt(u.pkg, 80) } : {}),
      ...(txt(u.evId, 80) ? { evId: txt(u.evId, 80) } : {}),
      ...(Number.isFinite(evAt) && evAt > 0 ? { evAt } : {}),
    };
  }
  const p = t.paidLater as { at?: unknown; by?: unknown; mode?: unknown; amount?: unknown } | undefined;
  if (p && typeof p.at === "string" && Number.isFinite(Number(p.amount))) {
    out.paidLater = { at: p.at, by: typeof p.by === "string" ? p.by : "", mode: p.mode === "UPI" ? "UPI" : "CASH", amount: Number(p.amount) };
  }
  return out;
}

/** Cash / other money is in the drawer at once; UPI waits for a check; udhaar waits for the customer. */
export function payStatus(modes: Record<string, number>, track: BillTrack): { state: PayState; due: number; upiDue: number; creditDue: number; cashDue: number } {
  const upi = r2(modes.UPI || 0);
  const credit = r2(modes.CREDIT || 0);
  const upiDue = upi > 0 && !track.upiOk ? upi : 0;
  const creditDue = credit > 0 && !track.paidLater ? credit : 0;
  const cash = r2(modes.CASH || 0);
  const cashDue = cash > 0 && track.cashWait && !track.cashOk ? cash : 0;
  const due = r2(upiDue + creditDue + cashDue);
  const total = r2(Object.values(modes).reduce((a, v) => a + v, 0));
  if (due <= 0) return { state: "PAID", due: 0, upiDue: 0, creditDue: 0, cashDue: 0 };
  if (due >= total) return { state: creditDue > 0 ? "UNPAID" : "PENDING", due, upiDue, creditDue, cashDue };
  return { state: creditDue > 0 ? "PARTLY" : "PENDING", due, upiDue, creditDue, cashDue };
}

/** Suggested hand-over when the bill is made: UPI part → hold until it is checked; cash → hold too when the shop works that way ("hold bill"), else give; udhaar only → give. */
export function defaultHandover(modes: Record<string, number>, holdCash = false): Handover {
  return (modes.UPI || 0) > 0 || (holdCash && (modes.CASH || 0) > 0) ? "HELD" : "GIVEN";
}

/** Shop rule: oil goes out only after the money is in. Cash or UPI still to receive (or an undecided pay-at-queue bill) blocks it; an udhaar part does not. Returns the amount still due, 0 when the oil may go. */
export function oilBlockedAmount(modes: Record<string, number>, track: BillTrack): number {
  const ps = payStatus(modes, track);
  if (track.payPending) return r2(Object.values(modes).reduce((a, v) => a + v, 0));
  return r2(ps.cashDue + ps.upiDue);
}

/** Printed, but the customer has not paid yet and no payment mode is chosen. */
export const isPayPending = (t: BillTrack) => t.payPending === true;

/** Bills saved before this feature have no hand-over mark: treated as given. */
export function handoverOf(track: BillTrack): Handover {
  return track.handover === "HELD" ? "HELD" : "GIVEN";
}

/** Anything still to settle: money not confirmed, or goods still held. */
export function needsAttention(modes: Record<string, number>, track: BillTrack): boolean {
  return payStatus(modes, track).state !== "PAID" || handoverOf(track) === "HELD";
}

/** Bills made before tracking existed carry no hand-over mark: no tags, nothing to settle. */
export function isTracked(track: BillTrack): boolean {
  return track.handover !== undefined;
}

/** The payment behind "UPI received", for bills and the register: "UPI ₹500 · Anil · Ref 432198765432"; "" when it was ticked by hand with no details. */
export function upiLine(u: UpiProof | undefined): string {
  if (!u || (!u.ref && !u.payer && !u.amount)) return "";
  const rs = u.amount ? `₹${u.amount % 1 ? u.amount.toFixed(2) : u.amount}` : "";
  return ["UPI", rs, u.payer, u.ref ? `Ref ${u.ref}` : ""].filter(Boolean).join(" · ").replace(/^UPI · /, "UPI ");
}

/** What a held bill is waiting for before the goods may go: the cash, the UPI, both, or nothing (money is in: just give the goods). */
export type HeldNeed = "CASH" | "UPI" | "CASH+UPI" | "READY";
export function heldNeed(modes: Record<string, number>, track: BillTrack): HeldNeed {
  const ps = payStatus(modes, track);
  if (ps.cashDue > 0 && ps.upiDue > 0) return "CASH+UPI";
  if (ps.cashDue > 0) return "CASH";
  if (ps.upiDue > 0) return "UPI";
  return "READY";
}

/** The held queue: bills whose goods are still inside, longest-waiting first. Bills with money still to receive come before bills that are ready to give. */
export function heldQueue<T extends { createdAt: string; modes: Record<string, number>; track: BillTrack }>(bills: T[]): T[] {
  return bills
    .filter((b) => isTracked(b.track) && handoverOf(b.track) === "HELD")
    .sort((a, b) => {
      const ra = heldNeed(a.modes, a.track) === "READY" ? 1 : 0;
      const rb = heldNeed(b.modes, b.track) === "READY" ? 1 : 0;
      return ra - rb || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/** "just now", "5 min", "1 h 20 min" for how long a bill has been waiting. */
export function waitText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
