// A settled weight sent by a signed-in device (a phone or computer reading a Bluetooth scale
// itself, lib/scaleBt.ts). Same limits as the bridge's /api/scale-ticks/ingest, checked in one
// tested place.
import { WEIGH_MAX_KG } from "./barrels";

export const TICK_MIN_KG = 0.5;
/** A device that was offline may send its saved weights later: accept up to 12 hours late. */
export const TICK_MAX_AGE_SEC = 12 * 3600;

export type TickInput = { ok: true; source: string; nonce: string; weightKg: number; ageSec: number } | { ok: false; error: string };

export function checkTickInput(body: unknown): TickInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const source = typeof b.source === "string" ? b.source : "";
  const nonce = typeof b.nonce === "string" ? b.nonce : "";
  const weightKg = typeof b.weightKg === "number" ? b.weightKg : NaN;
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(source)) return { ok: false, error: "Bad source name." };
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) return { ok: false, error: "Bad nonce." };
  if (!Number.isFinite(weightKg) || weightKg < TICK_MIN_KG || weightKg > WEIGH_MAX_KG) return { ok: false, error: "Weight out of range." };
  const age = typeof b.ageSec === "number" && Number.isFinite(b.ageSec) ? b.ageSec : 0;
  return { ok: true, source, nonce, weightKg: Math.round(weightKg * 1000) / 1000, ageSec: Math.min(TICK_MAX_AGE_SEC, Math.max(0, age)) };
}

/** Start and end (UTC instants) of one business day in India. */
export function istDayRange(date: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+05:30`);
  if (!Number.isFinite(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 86400000) };
}
