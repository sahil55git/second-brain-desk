// Payment status and goods hand-over of a counter bill (pure, tested).
// Money is already in the books when the bill is saved (cash, UPI, udhaar rows); this only tracks
// whether the money has really arrived and whether the oil / oil can has left the shop.

export type Handover = "GIVEN" | "HELD";
export type PayState = "PAID" | "PARTLY" | "PENDING" | "UNPAID";

export interface BillTrack {
  handover?: Handover;
  handedAt?: string;
  /** UPI part checked on the shop's phone / bank app */
  upiOk?: { at: string; by: string };
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
  const u = t.upiOk as { at?: unknown; by?: unknown } | undefined;
  if (u && typeof u.at === "string") out.upiOk = { at: u.at, by: typeof u.by === "string" ? u.by : "" };
  const p = t.paidLater as { at?: unknown; by?: unknown; mode?: unknown; amount?: unknown } | undefined;
  if (p && typeof p.at === "string" && Number.isFinite(Number(p.amount))) {
    out.paidLater = { at: p.at, by: typeof p.by === "string" ? p.by : "", mode: p.mode === "UPI" ? "UPI" : "CASH", amount: Number(p.amount) };
  }
  return out;
}

/** Cash / other money is in the drawer at once; UPI waits for a check; udhaar waits for the customer. */
export function payStatus(modes: Record<string, number>, track: BillTrack): { state: PayState; due: number; upiDue: number; creditDue: number } {
  const upi = r2(modes.UPI || 0);
  const credit = r2(modes.CREDIT || 0);
  const upiDue = upi > 0 && !track.upiOk ? upi : 0;
  const creditDue = credit > 0 && !track.paidLater ? credit : 0;
  const due = r2(upiDue + creditDue);
  const total = r2(Object.values(modes).reduce((a, v) => a + v, 0));
  if (due <= 0) return { state: "PAID", due: 0, upiDue: 0, creditDue: 0 };
  if (due >= total) return { state: creditDue > 0 ? "UNPAID" : "PENDING", due, upiDue, creditDue };
  return { state: creditDue > 0 ? "PARTLY" : "PENDING", due, upiDue, creditDue };
}

/** Suggested hand-over when the bill is made: cash → give; UPI part → hold until it is checked; udhaar only → give. */
export function defaultHandover(modes: Record<string, number>): Handover {
  return (modes.UPI || 0) > 0 ? "HELD" : "GIVEN";
}

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
