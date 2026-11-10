// Who may change or delete an old record, and the number checks the job-work
// routes share. Pure functions — no database — so they are easy to test.
//
// Dates are business dates ("YYYY-MM-DD", India time). When a row only has a
// timestamp (for example JobWorkIntake.createdAt), pass businessDate(createdAt),
// never a UTC slice: an entry made at 11 pm India time is already the next day
// in UTC.

export interface RuleUser {
  isOwner: boolean;
}

/** Owner: any day. Staff: only a record dated today. */
export function canDelete(user: RuleUser, rowDate: string, today: string): boolean {
  return user.isOwner || rowDate === today;
}

/** Same rule as delete: staff fix today's records, the owner any day. */
export function canEdit(user: RuleUser, rowDate: string, today: string): boolean {
  return user.isOwner || rowDate === today;
}

/** Staff may settle at the standard rate give or take this many rupees per kg. */
export const STAFF_RATE_TOLERANCE_INR = 1;

export function staffRateOk(rate: number, standardRate: number): boolean {
  return Number.isFinite(rate) && Math.abs(rate - standardRate) <= STAFF_RATE_TOLERANCE_INR;
}

/** A finite number greater than zero, or null (null, "", NaN, text, zero and negatives all give null). */
export function parsePositive(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * An amount of money that is zero or more, or null when it is not a usable
 * number. A blank (null or "") means zero, as the desks have always treated it.
 */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === "") return 0;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
