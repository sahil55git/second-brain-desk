// Saved Bluetooth scales, shared by the whole shop (stored under the "btScales" app setting).
// A profile remembers a scale's name, what it is used for and how to open it; each phone, tablet
// or computer then just picks which profile to use. Pure helpers, tested in __tests__.
import type { BtConfig } from "./scaleBt";

export const BT_USES = ["any", "counter", "barrels", "purchase"] as const;
export type BtUse = (typeof BT_USES)[number];
export const BT_BAUDS = [9600, 2400, 4800, 19200] as const;
export const BT_MAX_SCALES = 12;

export interface BtScaleProfile {
  id: string;
  name: string;
  use: BtUse;
  /** native: the scale's Bluetooth address; serial: blank (the browser remembers the port) */
  deviceId: string;
  /** the name Bluetooth shows for the device */
  deviceName: string;
  kind: "native" | "serial";
  baud: number;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function parseBtScales(raw: unknown): BtScaleProfile[] {
  const list = raw && typeof raw === "object" ? (raw as { scales?: unknown }).scales : null;
  if (!Array.isArray(list)) return [];
  const out: BtScaleProfile[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = clean(o.id, 40);
    const name = clean(o.name, 40);
    const kind = o.kind === "serial" ? "serial" : o.kind === "native" ? "native" : null;
    if (!id || !name || !kind || out.some((x) => x.id === id || x.name.toLowerCase() === name.toLowerCase())) continue;
    const baud = BT_BAUDS.includes(Number(o.baud) as (typeof BT_BAUDS)[number]) ? Number(o.baud) : 9600;
    out.push({
      id, name, kind, baud,
      use: BT_USES.includes(o.use as BtUse) ? (o.use as BtUse) : "any",
      deviceId: clean(o.deviceId, 60),
      deviceName: clean(o.deviceName, 60),
    });
    if (out.length >= BT_MAX_SCALES) break;
  }
  return out;
}

/** Why this profile cannot be saved (with the others already saved), or null. */
export function btProfileProblem(p: BtScaleProfile, others: BtScaleProfile[]): string | null {
  if (!clean(p.name, 40)) return "Give the scale a name.";
  if (others.some((o) => o.id !== p.id && o.name.trim().toLowerCase() === p.name.trim().toLowerCase())) return "Another scale already has this name.";
  if (p.kind === "native" && !p.deviceId) return "Choose the scale from the paired Bluetooth devices.";
  if (!BT_BAUDS.includes(p.baud as (typeof BT_BAUDS)[number])) return "Choose a speed from the list.";
  if (others.filter((o) => o.id !== p.id).length >= BT_MAX_SCALES) return `You can save up to ${BT_MAX_SCALES} scales.`;
  return null;
}

export function newBtScaleId(): string {
  return `bs-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Saves (or replaces) one profile; keeps the list sorted by name. */
export function upsertBtScale(list: BtScaleProfile[], p: BtScaleProfile): BtScaleProfile[] {
  return [...list.filter((x) => x.id !== p.id), { ...p, name: clean(p.name, 40) }].sort((a, b) => a.name.localeCompare(b.name));
}

export function removeBtScale(list: BtScaleProfile[], id: string): BtScaleProfile[] {
  return list.filter((x) => x.id !== id);
}

/** What the link driver needs to open this scale on this device. */
export function profileToConfig(p: BtScaleProfile): BtConfig {
  return { kind: p.kind, id: p.deviceId, name: p.deviceName || p.name, baud: p.baud };
}

/** Is this profile the scale the device is set to right now? */
export function isActiveProfile(p: BtScaleProfile, cfg: BtConfig | null): boolean {
  if (!cfg || cfg.kind !== p.kind) return false;
  return p.kind === "native" ? cfg.id === p.deviceId : cfg.name === (p.deviceName || p.name);
}
