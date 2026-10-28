// Barrel fleet — pure rules (no database, no browser), so they can be tested.
//
// The shop owns about 20 reusable barrels. Each has ONE permanent code (BRL-07)
// and ONE registered tare (its own empty weight). The same barrel is filled,
// sent out, sold, brought back and refilled many times:
//
//   net oil = gross (oil + barrel on the scale) − tare (registered empty weight)
//
// Every weighing and movement is appended to a ledger. This file holds the
// rules; `barrelFleetServer.ts` and the API routes apply them.
import { BARREL_DEFAULTS, WEIGH_MAX_KG, allowedDiffKg, round1, validKg } from "./barrels";

/** Defaults — my starting values (not from the existing scripts); the shop can change them here. */
export const FLEET_DEFAULTS = {
  /** Most oil a barrel may take. The shop's usual fill is 180 kg and a barrel can take 10 kg more. */
  capacityKg: 190,
  usualFillKg: 180,
  /** An empty weight this far from the registered tare is odd (oil left inside, a dent, or the wrong barrel). */
  tareDriftKg: BARREL_DEFAULTS.emptyOutlierKg,
  /** A barrel away from the shop longer than this many days is flagged as possibly lost. */
  maxAwayDays: 30,
} as const;

export const LOCATIONS = ["SHOP", "VEHICLE", "CUSTOMER", "SUPPLIER", "REPAIR"] as const;
export type Location = (typeof LOCATIONS)[number];
export const LOCATION_LABEL: Record<Location, { en: string; kn: string }> = {
  SHOP: { en: "In shop", kn: "ಅಂಗಡಿಯಲ್ಲಿ" },
  VEHICLE: { en: "In vehicle", kn: "ವಾಹನದಲ್ಲಿ" },
  CUSTOMER: { en: "With customer", kn: "ಗ್ರಾಹಕರ ಬಳಿ" },
  SUPPLIER: { en: "With supplier", kn: "ಸರಬರಾಜುದಾರರ ಬಳಿ" },
  REPAIR: { en: "In repair", kn: "ದುರಸ್ತಿಯಲ್ಲಿ" },
};

export const PURPOSES = ["SALE", "TRANSPORT", "STORAGE", "REFILL", "OTHER"] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABEL: Record<Purpose, string> = {
  SALE: "Sale to customer",
  TRANSPORT: "Transport",
  STORAGE: "Storage",
  REFILL: "Sent for refill / purchase",
  OTHER: "Other",
};

export const CONDITIONS = ["OK", "DENTED", "LEAKING", "RETIRED"] as const;
export type Condition = (typeof CONDITIONS)[number];

export type FleetStatus = "NEW" | "EMPTY" | "FULL";
export type FleetPhase = "GROSS" | "EMPTY";
export type FleetAction = "REGISTER" | "GROSS" | "EMPTY" | "MOVE" | "EDIT";

export const ACTION_LABEL: Record<FleetAction, string> = {
  REGISTER: "Registered",
  GROSS: "Weighed full",
  EMPTY: "Weighed empty",
  MOVE: "Moved",
  EDIT: "Changed",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w: number) => String(n).padStart(w, "0");
export { round1, round2 };

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------
/** BRL-07. Numbers above 99 simply grow: BRL-100. */
export function fleetCode(n: number): string {
  return `BRL-${pad(n, 2)}`;
}

/** Read a typed / scanned code back. Tolerates spaces, lower case and a scanner that swallowed the dash. */
export function parseFleetCode(raw: string): { code: string; no: number } | null {
  const t = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = /^BRL-?(\d{1,3})$/.exec(t);
  if (!m) return null;
  const no = Number(m[1]);
  if (no < 1) return null;
  return { code: fleetCode(no), no };
}

/** Find a fleet code inside whatever the scanner gave: the bare barcode text or the QR link. */
export function findFleetCode(raw: string): { code: string; no: number } | null {
  const direct = parseFleetCode(raw);
  if (direct) return direct;
  const m = /BRL-?\d{1,3}/i.exec(String(raw || ""));
  return m ? parseFleetCode(m[0]) : null;
}

/** What the QR on a fleet barrel label holds: a link that opens that barrel's page (what is in it, where it is, its history, and the buttons to weigh or send it). The path (not a ?query) so a login redirect keeps it. */
export function fleetLink(origin: string, code: string): string {
  const c = findFleetCode(code)?.code ?? code;
  return `${origin.replace(/\/+$/, "")}/barrels/fleet/${encodeURIComponent(c)}`;
}

/** The next `count` free codes, counting on from the highest number already used (or from `startNo`). */
export function nextFleetCodes(existing: string[], count: number, startNo?: number): string[] {
  const used = new Set(existing.map((c) => parseFleetCode(c)?.no).filter((n): n is number => n != null));
  let n = startNo && startNo > 0 ? startNo : (used.size ? Math.max(...Array.from(used)) : 0) + 1;
  const out: string[] = [];
  while (out.length < count) {
    if (!used.has(n)) out.push(fleetCode(n));
    n++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
export interface FleetBarrelLike {
  code: string;
  status: string;
  active: boolean;
  condition: string;
  capacityKg: number;
  tareKg: number | null;
  tareAt?: Date | string | null;
  grossKg: number | null;
  netKg: number | null;
  lastGrossDiffKg: number | null;
  lastEmptyKg: number | null;
  lastEmptyAt?: Date | string | null;
  location: string;
  sinceAt: Date | string;
}

/** Oil in the barrel: what the scale said minus the barrel's own weight. */
export function fleetNet(grossKg: number | null | undefined, tareKg: number | null | undefined): number | null {
  if (grossKg == null || tareKg == null) return null;
  return round2(grossKg - tareKg);
}

/** Rules for saving one weighing. Returns an error message, or null when allowed. */
export function checkFleetWeigh(
  phase: FleetPhase,
  kg: unknown,
  b: Pick<FleetBarrelLike, "status" | "active" | "condition" | "tareKg" | "grossKg" | "code">
): string | null {
  if (!validKg(kg)) return `Weight must be more than 0 and at most ${WEIGH_MAX_KG} kg.`;
  if (!b.active || b.condition === "RETIRED") return `${b.code} is retired. Ask the owner if it should be used again.`;
  if (phase === "GROSS") {
    if (b.tareKg == null) return `${b.code} has no tare yet. Weigh it EMPTY once first; that weight becomes its tare.`;
    if (kg <= b.tareKg) return `Full weight must be more than the barrel's own weight (${round2(b.tareKg)} kg). Is it really full?`;
    return null;
  }
  if (b.status === "FULL" && b.grossKg != null && kg >= b.grossKg) return "Empty barrel cannot weigh as much as (or more than) it did when full.";
  return null;
}

export interface EmptyOutcome {
  /** This weighing becomes the barrel's registered tare. */
  setsTare: boolean;
  /** This empty weight minus the registered tare (null when it sets the tare). */
  driftKg: number | null;
  /** Oil that left the barrel: last full weight − this empty weight (only when the barrel was full). */
  pouredKg: number | null;
}

export function emptyOutcome(b: Pick<FleetBarrelLike, "status" | "tareKg" | "grossKg">, kg: number, setTare = false): EmptyOutcome {
  const setsTare = b.tareKg == null || setTare;
  return {
    setsTare,
    driftKg: !setsTare && b.tareKg != null ? round2(kg - b.tareKg) : null,
    pouredKg: b.status === "FULL" && b.grossKg != null ? round2(b.grossKg - kg) : null,
  };
}

export interface GrossOutcome {
  tareKg: number;
  netKg: number;
  /** Full weight the last time this barrel was weighed full (only while it is still full). */
  prevGrossKg: number | null;
  /** This full weight − the previous one (negative = oil went missing since). */
  diffKg: number | null;
  /** How much difference is normal for the oil that was inside. */
  allowedKg: number | null;
  overCapacity: boolean;
}

export function grossOutcome(b: Pick<FleetBarrelLike, "status" | "tareKg" | "grossKg" | "netKg" | "capacityKg">, kg: number): GrossOutcome {
  const tare = b.tareKg as number;
  const net = round2(kg - tare);
  const prev = b.status === "FULL" && b.grossKg != null ? b.grossKg : null;
  return {
    tareKg: tare,
    netKg: net,
    prevGrossKg: prev,
    diffKg: prev != null ? round2(kg - prev) : null,
    allowedKg: prev != null ? round2(allowedDiffKg(b.netKg ?? Math.max(0, prev - tare))) : null,
    overCapacity: net > b.capacityKg,
  };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
export function checkMove(
  b: Pick<FleetBarrelLike, "active" | "condition" | "location" | "code">,
  to: unknown,
  who: string | null
): string | null {
  if (!b.active || b.condition === "RETIRED") return `${b.code} is retired.`;
  if (typeof to !== "string" || !(LOCATIONS as readonly string[]).includes(to)) return "Choose where the barrel is going.";
  if (to !== "SHOP" && (!who || who.trim().length < 2)) return "Write who is taking it: customer, supplier or vehicle.";
  if (to === b.location && to === "SHOP") return `${b.code} is already in the shop.`;
  return null;
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
export type FleetFlagLevel = "warn" | "alert";
export type FleetFlagCode =
  | "NO_TARE"
  | "TARE_DRIFT"
  | "OVER_CAPACITY"
  | "OIL_LOST"
  | "OIL_GAINED"
  | "AWAY_TOO_LONG"
  | "LEAKING"
  | "DENTED"
  | "MANUAL";
export interface FleetFlag {
  code: FleetFlagCode;
  level: FleetFlagLevel;
  msg: string;
}

const ms = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).getTime());
export function daysAway(b: Pick<FleetBarrelLike, "location" | "sinceAt">, nowMs: number): number | null {
  if (b.location === "SHOP") return null;
  return Math.max(0, Math.floor((nowMs - new Date(b.sinceAt).getTime()) / 86_400_000));
}

/** Problems visible on a barrel right now. */
export function fleetFlags(b: FleetBarrelLike, nowMs: number, opts = FLEET_DEFAULTS): FleetFlag[] {
  const f: FleetFlag[] = [];
  if (!b.active || b.condition === "RETIRED") return f;
  if (b.tareKg == null) f.push({ code: "NO_TARE", level: "warn", msg: `${b.code}: no tare yet. Weigh it empty once to set it.` });

  // last empty weight compared with the registered tare (only if weighed after the tare was set)
  if (b.tareKg != null && b.lastEmptyKg != null) {
    const afterTare = ms(b.lastEmptyAt) != null && ms(b.tareAt) != null ? (ms(b.lastEmptyAt) as number) > (ms(b.tareAt) as number) : true;
    const d = round2(b.lastEmptyKg - b.tareKg);
    if (afterTare && Math.abs(d) > opts.tareDriftKg)
      f.push({
        code: "TARE_DRIFT",
        level: "warn",
        msg: `${b.code}: last empty weight ${round2(b.lastEmptyKg)} kg is ${d > 0 ? "+" : ""}${d} kg from its tare ${round2(b.tareKg)} kg. ${d > 0 ? "Oil left inside, mud or a dent?" : "Lighter than registered: wrong barrel or scale zero?"}`,
      });
  }

  if (b.status === "FULL" && b.netKg != null && b.netKg > b.capacityKg)
    f.push({ code: "OVER_CAPACITY", level: "warn", msg: `${b.code}: ${round2(b.netKg)} kg oil is more than its ${round2(b.capacityKg)} kg capacity.` });

  if (b.status === "FULL" && b.lastGrossDiffKg != null && b.netKg != null) {
    const allowed = allowedDiffKg(b.netKg);
    if (b.lastGrossDiffKg < 0 && -b.lastGrossDiffKg > allowed)
      f.push({ code: "OIL_LOST", level: "alert", msg: `${b.code}: ${round2(-b.lastGrossDiffKg)} kg LESS than when it was last weighed full. Leak or oil taken out?` });
    if (b.lastGrossDiffKg > 0 && b.lastGrossDiffKg > allowed)
      f.push({ code: "OIL_GAINED", level: "warn", msg: `${b.code}: ${round2(b.lastGrossDiffKg)} kg MORE than when it was last weighed full. Topped up, or a different barrel?` });
  }

  const away = daysAway(b, nowMs);
  if (away != null && away > opts.maxAwayDays)
    f.push({ code: "AWAY_TOO_LONG", level: "warn", msg: `${b.code}: away from the shop ${away} days (${(LOCATION_LABEL[b.location as Location]?.en ?? b.location).toLowerCase()}). Ask for it back.` });

  if (b.condition === "LEAKING") f.push({ code: "LEAKING", level: "alert", msg: `${b.code}: marked LEAKING. Do not fill it until it is repaired.` });
  if (b.condition === "DENTED") f.push({ code: "DENTED", level: "warn", msg: `${b.code}: dented. Its empty weight may have changed; weigh it empty and ask the owner to check the tare.` });
  return f;
}

export interface FleetEventLike {
  action: string;
  source: string | null;
  kg: number | null;
  detail: Record<string, unknown> | null;
}

/** Things worth the owner's attention on one ledger row. */
export function eventFlags(e: FleetEventLike): FleetFlag[] {
  const f: FleetFlag[] = [];
  const d = e.detail ?? {};
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  if (e.source === "MANUAL") f.push({ code: "MANUAL", level: "warn", msg: "Weight typed by hand, not taken from the scale." });
  const drift = num("driftKg");
  if (e.action === "EMPTY" && drift != null && Math.abs(drift) > FLEET_DEFAULTS.tareDriftKg)
    f.push({ code: "TARE_DRIFT", level: "warn", msg: `Empty weight ${drift > 0 ? "+" : ""}${drift} kg from the registered tare.` });
  const diff = num("diffKg");
  const allowed = num("allowedKg");
  if (e.action === "GROSS" && diff != null && allowed != null && Math.abs(diff) > allowed)
    f.push(diff < 0 ? { code: "OIL_LOST", level: "alert", msg: `${-diff} kg less than the previous full weighing.` } : { code: "OIL_GAINED", level: "warn", msg: `${diff} kg more than the previous full weighing.` });
  if (e.action === "GROSS" && d.overCapacity === true) f.push({ code: "OVER_CAPACITY", level: "warn", msg: "More oil than the barrel's capacity." });
  return f;
}

// ---------------------------------------------------------------------------
// Summary + exports
// ---------------------------------------------------------------------------
export interface FleetSummary {
  barrels: number;
  inShop: number;
  away: number;
  full: number;
  empty: number;
  noTare: number;
  /** Oil kg held in full barrels (last full weighing). */
  oilKg: number;
  /** Part of that oil that is outside the shop. */
  oilAwayKg: number;
  byLocation: Record<string, number>;
  alerts: number;
  warnings: number;
}

export function fleetSummary(all: FleetBarrelLike[], nowMs: number): FleetSummary {
  const live = all.filter((b) => b.active && b.condition !== "RETIRED");
  const full = live.filter((b) => b.status === "FULL");
  const flags = live.flatMap((b) => fleetFlags(b, nowMs));
  const byLocation: Record<string, number> = {};
  for (const b of live) byLocation[b.location] = (byLocation[b.location] ?? 0) + 1;
  return {
    barrels: live.length,
    inShop: live.filter((b) => b.location === "SHOP").length,
    away: live.filter((b) => b.location !== "SHOP").length,
    full: full.length,
    empty: live.filter((b) => b.status === "EMPTY").length,
    noTare: live.filter((b) => b.tareKg == null).length,
    oilKg: round1(full.reduce((s, b) => s + (b.netKg ?? 0), 0)),
    oilAwayKg: round1(full.filter((b) => b.location !== "SHOP").reduce((s, b) => s + (b.netKg ?? 0), 0)),
    byLocation,
    alerts: flags.filter((x) => x.level === "alert").length,
    warnings: flags.filter((x) => x.level === "warn").length,
  };
}

export const csvCell = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  // a cell starting with = + - @ would be read as a formula by Excel
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export interface FleetRowForCsv extends FleetBarrelLike {
  mark: string | null;
  product: string | null;
  holder: string | null;
}

export function fleetCsv(rows: FleetRowForCsv[], nowMs: number): string {
  const head = ["Code", "Mark", "Status", "Where", "With", "Days away", "Oil inside", "Oil kg", "Tare kg", "Last full kg", "Capacity kg", "Condition", "Flags"];
  const lines = [head.map(csvCell).join(",")];
  for (const b of rows) {
    lines.push(
      [
        b.code,
        b.mark ?? "",
        b.status,
        LOCATION_LABEL[b.location as Location]?.en ?? b.location,
        b.holder ?? "",
        daysAway(b, nowMs) ?? "",
        b.status === "FULL" ? b.product ?? "" : "",
        b.status === "FULL" ? b.netKg ?? "" : "",
        b.tareKg ?? "",
        b.grossKg ?? "",
        b.capacityKg,
        b.condition,
        fleetFlags(b, nowMs).map((x) => x.code).join(" "),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return "﻿" + lines.join("\r\n");
}

export interface LedgerRow {
  at: string | Date;
  barrelCode: string;
  action: string;
  kg: number | null;
  tareKg: number | null;
  netKg: number | null;
  product: string | null;
  fromLoc: string | null;
  toLoc: string | null;
  party: string | null;
  vehicleNo: string | null;
  purpose: string | null;
  ref: string | null;
  source: string | null;
  by: string;
  note: string | null;
}

export function ledgerCsv(rows: LedgerRow[]): string {
  const head = ["Date & time (IST)", "Barrel", "What", "Scale kg", "Tare kg", "Net oil kg", "Oil", "From", "To", "Party / holder", "Vehicle", "Purpose", "Reference", "Weight from", "By", "Note"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
        r.barrelCode,
        ACTION_LABEL[r.action as FleetAction] ?? r.action,
        r.kg ?? "",
        r.tareKg ?? "",
        r.netKg ?? "",
        r.product ?? "",
        r.fromLoc ?? "",
        r.toLoc ?? "",
        r.party ?? "",
        r.vehicleNo ?? "",
        r.purpose ?? "",
        r.ref ?? "",
        r.source === "MANUAL" ? "typed" : r.source === "SCALE" ? "scale" : "",
        r.by,
        r.note ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return "﻿" + lines.join("\r\n");
}
