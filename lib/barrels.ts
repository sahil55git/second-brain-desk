// Barrel receiving — pure rules (no database, no browser), so they can be tested.
//
// The flow: oil arrives from a supplier in barrels. Every barrel gets a label
// (barcode). Each barrel is weighed FULL on the platform scale, then emptied
// into the tank, then weighed EMPTY. Net oil = full − empty. The lot is
// "reconciled" when every barrel has both weights; the total is compared with
// what the supplier's challan says.

export type Phase = "GROSS" | "EMPTY";
export type WeighSource = "SCALE" | "MANUAL";

/** Defaults — chosen as sensible starting points, not from the existing scripts. */
export const BARREL_DEFAULTS = {
  /** Measured net vs the supplier's declared net: allowed difference, % of declared. */
  netTolerancePct: 0.5,
  /** …but never flag a difference smaller than this many kg. */
  netToleranceMinKg: 0.5,
  /** An empty barrel this far from the lot's typical empty barrel is odd (oil left in it, or a swapped barrel). */
  emptyOutlierKg: 1.0,
  /** A full barrel still not emptied + weighed after this many hours is listed as pending. */
  maxOpenHours: 24,
  /** A scale reading can be used for a weighment only this long after it settled. */
  tickMaxAgeSec: 120,
} as const;

export const WEIGH_MAX_KG = 1000; // same ceiling the scale bridge enforces

export interface BarrelLike {
  id: string;
  seq: number;
  code: string;
  declaredNetKg: number | null;
  grossKg: number | null;
  grossAt: Date | string | null;
  grossSource: string | null;
  emptyKg: number | null;
  emptyAt: Date | string | null;
  emptySource: string | null;
}

export interface ReceiptLike {
  declaredNetKg: number | null;
  declaredBarrels: number | null;
  rateInrPerKg: number | null;
}

export type FlagLevel = "warn" | "alert";
export type FlagCode =
  | "MANUAL_GROSS"
  | "MANUAL_EMPTY"
  | "EMPTY_NOT_LIGHTER"
  | "EMPTY_OUTLIER"
  | "NET_SHORT"
  | "NET_EXCESS"
  | "STILL_FULL"
  | "LOT_SHORT"
  | "LOT_EXCESS"
  | "BARRELS_FEWER";

export interface Flag {
  code: FlagCode;
  level: FlagLevel;
  seq?: number;
  kg?: number;
  msg: string;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Lot number: R + yymmdd + "-" + the day's running number, e.g. R261010-1. */
export function lotNoFor(date: string, dayCount: number): string {
  const [y, m, d] = date.split("-");
  return `R${y.slice(2)}${m}${d}-${dayCount}`;
}

/** Barrel code printed in the barcode, e.g. R261010-1-03. */
export function barrelCode(lotNo: string, seq: number): string {
  return `${lotNo}-${pad(seq, 2)}`;
}

/** Read a scanned / typed code back. Tolerates spaces, lower case, and a scanner that swallowed the dashes. */
export function parseBarrelCode(raw: string): { lotNo: string; seq: number; code: string } | null {
  const t = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = /^R(\d{6})-?(\d{1,3})-?(\d{2,3})$/.exec(t);
  if (!m) return null;
  const lotNo = `R${m[1]}-${Number(m[2])}`;
  const seq = Number(m[3]);
  return { lotNo, seq, code: barrelCode(lotNo, seq) };
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
export function validKg(kg: unknown): kg is number {
  return typeof kg === "number" && Number.isFinite(kg) && kg > 0 && kg <= WEIGH_MAX_KG;
}

export function barrelNet(b: Pick<BarrelLike, "grossKg" | "emptyKg">): number | null {
  if (b.grossKg == null || b.emptyKg == null) return null;
  return round2(b.grossKg - b.emptyKg);
}

export type BarrelState = "NEW" | "FULL" | "DONE";
export function barrelState(b: Pick<BarrelLike, "grossKg" | "emptyKg">): BarrelState {
  if (b.grossKg == null) return "NEW";
  if (b.emptyKg == null) return "FULL";
  return "DONE";
}

/** Rules for saving one weighment. Returns an error message, or null when allowed. */
export function checkWeigh(
  phase: Phase,
  kg: unknown,
  b: Pick<BarrelLike, "grossKg" | "emptyKg">,
  opts: { reweigh?: boolean } = {}
): string | null {
  if (!validKg(kg)) return `Weight must be more than 0 and at most ${WEIGH_MAX_KG} kg.`;
  if (phase === "GROSS") {
    if (b.grossKg != null && !opts.reweigh) return "This barrel's full weight is already saved. Only the owner can weigh it again.";
    if (b.emptyKg != null && kg <= b.emptyKg) return "Full weight cannot be less than the empty weight.";
    return null;
  }
  if (b.grossKg == null) return "Weigh the barrel full first.";
  if (b.emptyKg != null && !opts.reweigh) return "This barrel's empty weight is already saved. Only the owner can weigh it again.";
  if (kg >= b.grossKg) return "Empty barrel cannot weigh as much as (or more than) the full barrel.";
  return null;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const toMs = (d: Date | string | null) => (d == null ? null : new Date(d).getTime());

export function allowedDiffKg(declaredKg: number, opts = BARREL_DEFAULTS): number {
  return Math.max(opts.netToleranceMinKg, (declaredKg * opts.netTolerancePct) / 100);
}

/** Flags for one barrel. `peerEmptyMedian` = median empty weight of the lot's OTHER weighed barrels. */
export function barrelFlags(
  b: BarrelLike,
  peerEmptyMedian: number | null,
  nowMs: number,
  opts = BARREL_DEFAULTS
): Flag[] {
  const flags: Flag[] = [];
  const tag = `Barrel ${pad(b.seq, 2)}`;
  if (b.grossSource === "MANUAL")
    flags.push({ code: "MANUAL_GROSS", level: "warn", seq: b.seq, msg: `${tag}: full weight was typed by hand, not taken from the scale.` });
  if (b.emptySource === "MANUAL")
    flags.push({ code: "MANUAL_EMPTY", level: "warn", seq: b.seq, msg: `${tag}: empty weight was typed by hand, not taken from the scale.` });

  const net = barrelNet(b);
  if (net != null && net <= 1)
    flags.push({ code: "EMPTY_NOT_LIGHTER", level: "alert", seq: b.seq, kg: net, msg: `${tag}: full and empty weights are almost the same (${net} kg oil). Was it really full?` });

  if (b.emptyKg != null && peerEmptyMedian != null && Math.abs(b.emptyKg - peerEmptyMedian) > opts.emptyOutlierKg) {
    const d = round1(b.emptyKg - peerEmptyMedian);
    flags.push({
      code: "EMPTY_OUTLIER",
      level: "warn",
      seq: b.seq,
      kg: d,
      msg: `${tag}: empty weight ${b.emptyKg} kg is ${d > 0 ? "+" : ""}${d} kg from the other barrels' ${round1(peerEmptyMedian)} kg. ${d > 0 ? "Oil may be left inside, or the wrong barrel." : "Lighter than the rest — wrong barrel or a scale zero problem."}`,
    });
  }

  if (net != null && b.declaredNetKg != null) {
    const diff = round2(net - b.declaredNetKg);
    if (Math.abs(diff) > allowedDiffKg(b.declaredNetKg, opts))
      flags.push({
        code: diff < 0 ? "NET_SHORT" : "NET_EXCESS",
        level: diff < 0 ? "alert" : "warn",
        seq: b.seq,
        kg: diff,
        msg: `${tag}: received ${net} kg, supplier says ${b.declaredNetKg} kg (${diff > 0 ? "+" : ""}${diff} kg).`,
      });
  }

  const grossMs = toMs(b.grossAt);
  if (b.grossKg != null && b.emptyKg == null && grossMs != null && nowMs - grossMs > opts.maxOpenHours * 3600_000)
    flags.push({ code: "STILL_FULL", level: "warn", seq: b.seq, msg: `${tag}: weighed full more than ${opts.maxOpenHours} hours ago and not yet emptied and weighed.` });
  return flags;
}

export type LotState = "NOT_STARTED" | "WEIGHING_IN" | "UNLOADING" | "RECONCILED";

export interface ReceiptSummary {
  barrels: number;
  fullWeighed: number;
  done: number;
  pending: number; // full, waiting to be emptied + weighed
  notWeighed: number;
  state: LotState;
  grossTotalKg: number;
  emptyTotalKg: number;
  /** Σ (full − empty) over barrels that have both weights. */
  measuredNetKg: number;
  /** Supplier's declared net: the challan total, else the sum of per-barrel declarations. */
  declaredNetKg: number | null;
  /** measured − declared; only when every barrel is DONE. */
  diffKg: number | null;
  /** Oil missing vs the challan in kg (positive = short) when the lot is complete. */
  shortKg: number | null;
  shortValueInr: number | null;
  flags: Flag[];
}

export function receiptSummary(r: ReceiptLike, barrels: BarrelLike[], nowMs: number, opts = BARREL_DEFAULTS): ReceiptSummary {
  const done = barrels.filter((b) => barrelState(b) === "DONE");
  const full = barrels.filter((b) => barrelState(b) === "FULL");
  const fresh = barrels.filter((b) => barrelState(b) === "NEW");
  const grossTotalKg = round2(barrels.reduce((s, b) => s + (b.grossKg ?? 0), 0));
  const emptyTotalKg = round2(done.reduce((s, b) => s + (b.emptyKg ?? 0), 0));
  const measuredNetKg = round2(done.reduce((s, b) => s + (barrelNet(b) ?? 0), 0));

  const perBarrelDeclared = barrels.every((b) => b.declaredNetKg != null) && barrels.length > 0
    ? round2(barrels.reduce((s, b) => s + (b.declaredNetKg ?? 0), 0))
    : null;
  const declaredNetKg = r.declaredNetKg ?? perBarrelDeclared;

  const flags: Flag[] = [];
  const emptyKgs = (excludeId: string) => barrels.filter((b) => b.emptyKg != null && b.id !== excludeId).map((b) => b.emptyKg as number);
  for (const b of barrels) {
    const peers = emptyKgs(b.id);
    flags.push(...barrelFlags(b, peers.length >= 3 ? median(peers) : null, nowMs, opts));
  }

  const complete = barrels.length > 0 && done.length === barrels.length;
  let diffKg: number | null = null;
  let shortKg: number | null = null;
  let shortValueInr: number | null = null;
  if (complete && declaredNetKg != null) {
    diffKg = round2(measuredNetKg - declaredNetKg);
    shortKg = round2(-diffKg);
    if (Math.abs(diffKg) > allowedDiffKg(declaredNetKg, opts)) {
      flags.push({
        code: diffKg < 0 ? "LOT_SHORT" : "LOT_EXCESS",
        level: diffKg < 0 ? "alert" : "warn",
        kg: diffKg,
        msg: `Whole lot: received ${measuredNetKg} kg, challan says ${declaredNetKg} kg (${diffKg > 0 ? "+" : ""}${diffKg} kg).`,
      });
    }
    if (diffKg < 0 && r.rateInrPerKg != null) shortValueInr = Math.round(-diffKg * r.rateInrPerKg);
  }
  if (r.declaredBarrels != null && barrels.length < r.declaredBarrels)
    flags.push({ code: "BARRELS_FEWER", level: "alert", msg: `Challan says ${r.declaredBarrels} barrels, only ${barrels.length} labelled so far.` });

  const state: LotState = complete
    ? "RECONCILED"
    : done.length > 0 || full.length > 0
      ? fresh.length === 0 ? "UNLOADING" : "WEIGHING_IN"
      : "NOT_STARTED";

  return {
    barrels: barrels.length,
    fullWeighed: barrels.length - fresh.length,
    done: done.length,
    pending: full.length,
    notWeighed: fresh.length,
    state,
    grossTotalKg,
    emptyTotalKg,
    measuredNetKg,
    declaredNetKg,
    diffKg,
    shortKg,
    shortValueInr,
    flags,
  };
}

/** Is this scale reading recent enough to be used for a weighment? */
export function tickFresh(settledAtMs: number, nowMs: number, opts = BARREL_DEFAULTS): boolean {
  const age = (nowMs - settledAtMs) / 1000;
  return age >= -5 && age <= opts.tickMaxAgeSec;
}

// ---------------------------------------------------------------------------
// Blind receiving: the person weighing barrels does not see what the supplier
// claims, the rate, or the shortage — only the owner does. This stops anyone
// from "making the numbers fit" and keeps rates private.
// ---------------------------------------------------------------------------
const STAFF_FLAGS: FlagCode[] = ["EMPTY_NOT_LIGHTER", "EMPTY_OUTLIER", "STILL_FULL"];

export interface ShapedBarrel extends BarrelLike {
  net: number | null;
  state: BarrelState;
  [k: string]: unknown;
}
export interface ShapedReceipt extends ReceiptLike {
  barrels: ShapedBarrel[];
  summary: ReceiptSummary;
  [k: string]: unknown;
}

export function staffView<T extends ShapedReceipt>(r: T): T {
  return {
    ...r,
    rateInrPerKg: null,
    declaredNetKg: null,
    barrels: r.barrels.map((b) => ({ ...b, declaredNetKg: null })),
    summary: {
      ...r.summary,
      declaredNetKg: null,
      diffKg: null,
      shortKg: null,
      shortValueInr: null,
      flags: r.summary.flags.filter((f) => STAFF_FLAGS.includes(f.code)),
    },
  };
}
