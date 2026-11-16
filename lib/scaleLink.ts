// The connection rules for a Bluetooth / serial scale, as a pure state machine (tested in
// lib/__tests__/scaleLink.test.ts). The driver in lib/scaleBt.ts only does what this says.
//
//   off ──start──▶ connecting ──opened──▶ silent ──first weight──▶ live
//                      ▲                    │  ▲                     │
//                      │                    │  └── no weight 3 s ────┘
//                      │        no weight 8 s (link is dead: close it)
//                      │                    ▼
//                      └──── retry time ── waiting   (1 s, 2 s, 4 s, 8 s, then every 15 s, for ever)
//
// "blocked" = needs a person (permission refused, scale not chosen). Everything else heals itself.

export type LinkStatus = "off" | "connecting" | "silent" | "live" | "waiting" | "blocked";

export interface LinkState {
  status: LinkStatus;
  /** Failed tries since the last good weight. */
  attempt: number;
  /** When the next try is due (waiting). */
  retryAt: number | null;
  /** When the link opened (silent / live). */
  openedAt: number | null;
  /** When the last good weight line arrived. */
  lastDataAt: number | null;
  /** Why the last try failed, in plain words. */
  error: string | null;
}

export type LinkEvent =
  | { type: "start" }
  | { type: "opened" }
  | { type: "data" }
  | { type: "closed"; error?: string; fatal?: boolean }
  | { type: "tick" }
  | { type: "stop" };

export const LINK_OFF: LinkState = { status: "off", attempt: 0, retryAt: null, openedAt: null, lastDataAt: null, error: null };

/** Wait before try 1, 2, 3 …; the last value repeats for ever. */
export const RETRY_STEPS_MS = [1000, 2000, 4000, 8000, 15000];
/** No weight for this long while live: show "no data" (scale switched off? out of range?). */
export const SILENT_MS = 3000;
/** No weight for this long after opening / after the last weight: the link is dead, reopen it. */
export const DEAD_MS = 8000;

/** `spread` is 0–1 (random in the app, fixed in tests): ±15 % so two devices do not retry in step. */
export function retryDelay(attempt: number, spread = 0.5): number {
  const base = RETRY_STEPS_MS[Math.min(Math.max(attempt, 1), RETRY_STEPS_MS.length) - 1];
  return Math.round(base * (0.85 + 0.3 * Math.min(1, Math.max(0, spread))));
}

export function linkReduce(s: LinkState, e: LinkEvent, now: number, spread = 0.5): LinkState {
  switch (e.type) {
    case "start":
      return { ...LINK_OFF, status: "connecting" };
    case "stop":
      return LINK_OFF;
    case "opened":
      if (s.status !== "connecting") return s;
      return { ...s, status: "silent", openedAt: now, lastDataAt: null, retryAt: null };
    case "data":
      if (s.status !== "silent" && s.status !== "live") return s;
      // only a real weight proves the link works: the retry count starts again from here
      return { ...s, status: "live", lastDataAt: now, attempt: 0, error: null };
    case "closed": {
      if (s.status === "off" || s.status === "blocked") return s;
      if (e.fatal) return { ...LINK_OFF, status: "blocked", error: e.error ?? "The scale needs to be chosen again." };
      const attempt = s.attempt + 1;
      return { status: "waiting", attempt, retryAt: now + retryDelay(attempt, spread), openedAt: null, lastDataAt: s.lastDataAt, error: e.error ?? s.error };
    }
    case "tick":
      if (s.status === "live" && s.lastDataAt !== null && now - s.lastDataAt > SILENT_MS) return { ...s, status: "silent" };
      return s;
  }
}

/** The link is open but nothing readable has come for too long: close it and try again. */
export function linkIsDead(s: LinkState, now: number): boolean {
  if (s.status !== "silent") return false;
  const from = Math.max(s.lastDataAt ?? 0, s.openedAt ?? 0);
  return now - from > DEAD_MS;
}

/** Time for the next try. */
export function linkRetryDue(s: LinkState, now: number): boolean {
  return s.status === "waiting" && s.retryAt !== null && now >= s.retryAt;
}

/** One line for the screen. */
export function linkLabel(s: LinkState, now: number): string {
  switch (s.status) {
    case "off":
      return "Not connected";
    case "connecting":
      return "Connecting…";
    case "live":
      return "Connected";
    case "silent":
      return s.lastDataAt ? "Connected, no weight coming" : "Connected, waiting for the first weight";
    case "waiting": {
      const sec = s.retryAt ? Math.max(0, Math.ceil((s.retryAt - now) / 1000)) : 0;
      return `Lost. Trying again in ${sec}s (try ${s.attempt + 1})`;
    }
    case "blocked":
      return "Needs you";
  }
}
