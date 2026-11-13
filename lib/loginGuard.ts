// Wrong-password limit for the login screen: five wrong tries for one username inside
// fifteen minutes locks that username until the oldest of those tries is fifteen minutes old.
// Pure rule here; lib/auth.ts keeps the tries in the LoginAttempt table.
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** `failTimes` = when the recent wrong tries happened (ms). */
export function lockedOut(failTimes: number[], now: number): boolean {
  return failTimes.filter((t) => now - t < LOGIN_WINDOW_MS && t <= now).length >= LOGIN_MAX_FAILS;
}
