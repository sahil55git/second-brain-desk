// Bluetooth / serial weighing scales that send the weight as plain ASCII lines, one line per
// reading ("+ 012.345 kg\r\n"), continuously. That is what iScale Bluetooth scales send (serial
// port profile, 9600 8N1), and most Indian platform scales with an RS-232 or Bluetooth module.
//
// Pure functions only (no browser, no Bluetooth) so the same code runs in the page, in the
// Android app's page and in the tests. Rules, in order of importance:
//   1. A line that is not clearly a weight is dropped, never guessed.
//   2. Only kg and g are accepted; any other unit is dropped.
//   3. "Steady" is decided here when the scale does not say it: the same value, several
//      times in a row, for long enough.
import { WEIGH_MAX_KG } from "./barrels";

export interface ParsedWeight {
  /** Signed weight in kg (negative = below zero / tare removed). */
  weightKg: number;
  /** Unit the scale sent. */
  unit: "kg" | "g";
  /** Digits after the decimal point as sent (tells the scale's step). */
  decimals: number;
  /** What the scale itself said about steadiness, when its format carries a flag. */
  flag: "stable" | "moving" | null;
}

export interface ParseOptions {
  /** A line with a number but no unit: treat as kg, or drop (default). */
  unitless?: "kg" | "reject";
}

const MAX_LINE = 48;
// sign, optional spaces, digits with an optional fixed decimal part, optional spaces, optional unit, end of line
const WEIGHT_RE = /([+-]?)\s*(\d{1,6})(?:\.(\d{1,4}))?\s*(kg|g)?$/i;

/** One line from the scale → a weight, or null when the line is not clearly a weight. */
export function parseWeightLine(input: string, opts: ParseOptions = {}): ParsedWeight | null {
  // control characters (STX / ETX / NUL) some indicators wrap the line in
  const line = input.replace(/[^\x20-\x7e]/g, "").trim();
  if (!line || line.length > MAX_LINE) return null;
  const m = WEIGHT_RE.exec(line);
  if (!m) return null;
  const prefix = line.slice(0, m.index);
  // a second number before the weight means we do not know which one is the weight
  if (/\d/.test(prefix)) return null;
  // the prefix may only hold status words and separators ("ST,GS," / "US,NT," / "wn" / "W:" / "=")
  if (!/^[A-Za-z,:;=\s]*$/.test(prefix)) return null;
  const unitRaw = (m[4] || "").toLowerCase();
  if (!unitRaw && opts.unitless !== "kg") return null;
  const unit: "kg" | "g" = unitRaw === "g" ? "g" : "kg";
  const decimals = m[3] ? m[3].length : 0;
  const value = Number(`${m[2]}${m[3] ? "." + m[3] : ""}`);
  if (!Number.isFinite(value)) return null;
  const kg = (m[1] === "-" ? -1 : 1) * (unit === "g" ? value / 1000 : value);
  if (Math.abs(kg) > WEIGH_MAX_KG) return null;
  const words = prefix.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const flag = words.includes("ST") ? "stable" : words.includes("US") ? "moving" : null;
  return { weightKg: roundKg(kg), unit, decimals: unit === "g" ? decimals + 3 : decimals, flag };
}

const roundKg = (kg: number) => Math.round(kg * 10000) / 10000 + 0; // + 0 turns -0 into 0

/** Bytes from the scale → text. Anything that is not printable ASCII or a line end is dropped. */
export function bytesToAscii(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 10 || b === 13 || (b >= 32 && b <= 126)) s += String.fromCharCode(b);
  }
  return s;
}

/** Cuts the incoming stream into lines (CR, LF or CR LF). Survives garbage and half lines. */
export class LineFramer {
  private rest = "";
  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split(/\r\n|\r|\n/);
    this.rest = parts.pop() ?? "";
    // no line end for a long time: noise or the wrong speed. Start again instead of growing.
    if (this.rest.length > 128) this.rest = "";
    return parts.filter((p) => p.trim().length > 0);
  }
  reset() {
    this.rest = "";
  }
}

export interface StabilityOptions {
  /** How many equal readings in a row … */
  count?: number;
  /** … spread over at least this long. */
  windowMs?: number;
}

/** Steady or still moving. Uses the scale's own flag when it sends one. */
export class StabilityTracker {
  private anchor: number | null = null;
  private since = 0;
  private n = 0;
  private readonly count: number;
  private readonly windowMs: number;
  constructor(o: StabilityOptions = {}) {
    this.count = o.count ?? 4;
    this.windowMs = o.windowMs ?? 600;
  }
  push(p: ParsedWeight, now: number): boolean {
    if (this.anchor !== null && Math.abs(p.weightKg - this.anchor) < 1e-9) this.n++;
    else {
      this.anchor = p.weightKg;
      this.since = now;
      this.n = 1;
    }
    if (p.flag) return p.flag === "stable";
    return this.n >= this.count && now - this.since >= this.windowMs;
  }
  reset() {
    this.anchor = null;
    this.n = 0;
  }
}

export interface SettleOptions {
  /** Lightest load worth recording (the tick table's own floor is 0.5 kg). */
  minKg?: number;
  /** A new steady weight on the same load must differ by at least this to count again. */
  changeKg?: number;
}

/**
 * "A load was put on and came to rest": fires once per load, so one barrel on the platform
 * gives one saved weight, not one per second. Fires again when the pan was emptied in
 * between, or when the steady weight changed (oil added to the can).
 */
export class SettleDetector {
  private armed = true;
  private last: number | null = null;
  private readonly minKg: number;
  private readonly changeKg: number;
  constructor(o: SettleOptions = {}) {
    this.minKg = o.minKg ?? 0.5;
    this.changeKg = o.changeKg ?? 0.05;
  }
  /** Returns the weight to record, or null. */
  push(weightKg: number, stable: boolean): number | null {
    if (weightKg < this.minKg) {
      // emptied (or below the floor): the next load is a new weighing
      if (stable) {
        this.armed = true;
        this.last = null;
      }
      return null;
    }
    if (!stable) return null;
    if (!this.armed && this.last !== null && Math.abs(weightKg - this.last) < Math.max(this.changeKg, this.last * 0.005)) return null;
    this.armed = false;
    this.last = weightKg;
    return weightKg;
  }
  reset() {
    this.armed = true;
    this.last = null;
  }
}

/** "iScale i-20" → "BT-ISCALE-I-20": the source name saved with each weight. */
export function btSourceName(deviceName: string): string {
  const clean = deviceName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return `BT-${clean || "SCALE"}`;
}
