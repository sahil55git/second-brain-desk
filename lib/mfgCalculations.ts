// Manufacturing — self-crushing barrel/batch yield math.
//
// Faithful TypeScript port of 05_Scripts/oil_yield_tracker.py's
// analyze_barrel_cycle(), plus the plan doc's Version 19/20 refinements
// (per-batch reference-yield %, 4-tier yield band, oil-cake cross-check,
// per-supplier oil attribution, the SOP's >2kg short/extra escalation).
//
// These are high-stakes (they drive loss/unbilled-stock flags), so keep
// them pure and deterministic, and covered by lib/__tests__/
// mfgCalculations.test.ts. Every threshold below comes straight from the
// plan doc / the Python script — do not invent new ones.

// Default reference oil yield (%). Karadi's own stated average (plan doc,
// Version 20: "100kg seed -> 22% oil, 78% cake"). Editable per batch.
export const DEFAULT_REF_OIL_PCT = 22;

// Default moisture loss (%) subtracted in the mass-balance check. Plan
// doc / oil_yield_tracker.py default, overridable per batch.
export const DEFAULT_MOISTURE_PCT = 1.5;

// Mass-balance tolerance: unaccounted loss over this % of total seed is
// flagged (oil_yield_tracker.py's own threshold). The oil-cake cross-check
// reuses the same tolerance (plan doc, Version 20).
export const MASS_BALANCE_TOLERANCE_PCT = 2;

// Short/extra oil escalation: |actual − system| over this many kg is
// flagged (sop-self-crushing-production.md, ported in Version 19).
export const SHORT_EXTRA_TOLERANCE_KG = 2;

export const OIL_TYPES = [
  "Karadi oil",
  "Groundnut oil",
  "Sunflower oil",
  "Coconut oil",
  "Other",
] as const;

export interface BatchSupplier {
  name: string;
  seedKg: number;
}

export interface BarrelBatchInput {
  suppliers: BatchSupplier[]; // up to two, per the SOP
  step1Kg?: number | null; // crude oil pumped in at crush time
  step2Kg?: number | null; // partial skim (after 2-3 days)
  step3Kg?: number | null; // full decant (after 3-4 days)
  step4Kg?: number | null; // waste / sediment removed (~= oil-cake)
  refOilPct?: number | null; // per-batch reference yield %, default 22
  moisturePct?: number | null; // default 1.5
  systemOilKgOverride?: number | null; // explicit expected-oil override
}

export type YieldBand = "poor" | "standard" | "high" | "best";

export interface SupplierAttribution {
  name: string;
  seedKg: number;
  oilKg: number; // actual oil attributed proportional to seed weight
}

export interface BarrelYieldResult {
  totalSeedKg: number;
  actualOilKg: number | null; // step2 + step3, once both are in
  extractionEfficiencyPct: number | null; // actual oil / total seed
  systemOilKg: number | null; // override, else total seed * refOilPct
  shortExtraOilKg: number | null; // actual − system (negative = short)
  moistureLossKg: number;
  unaccountedLossKg: number | null; // total seed − oil − step4 − moisture
  unaccountedLossPct: number | null;
  expectedCakeKg: number; // total seed * (100 − refOilPct)%
  actualCakeKg: number | null; // = step4
  cakeGapKg: number | null; // actual − expected
  yieldBand: YieldBand | null;
  refOilPct: number;
  supplierAttribution: SupplierAttribution[];
  // Flags
  massBalanceFlagged: boolean;
  shortExtraFlagged: boolean;
  cakeFlagged: boolean;
  yieldPoor: boolean; // band === "poor"
  // A batch is "complete" (and therefore scored) once both step3 and
  // step4 are logged — before that, loss would be an artifact of the oil
  // not having finished separating out.
  complete: boolean;
}

function num(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  return Number(v);
}

/**
 * mfgYieldBand() — the plan doc's four named tiers (Version 20), anchored
 * to each batch's own reference %:
 *   below (ref−2)%          -> poor
 *   [ref−2, ref)%           -> standard
 *   [ref, ref+1)%           -> high
 *   ref+1% and above        -> best
 * For the Karadi default ref=22 that is exactly Sahil's numbers:
 * below 20 poor, 20–22 standard, 22–23 high, above 23 best.
 */
export function mfgYieldBand(effPct: number, refPct: number): YieldBand {
  if (effPct < refPct - 2) return "poor";
  if (effPct < refPct) return "standard";
  if (effPct < refPct + 1) return "high";
  return "best";
}

/**
 * computeBarrelYield() — the full mass-balance / yield analysis for one
 * barrel batch. Returns nulls (rather than guesses) for anything that
 * can't be computed until the batch is complete.
 */
export function computeBarrelYield(input: BarrelBatchInput): BarrelYieldResult {
  const refOilPct =
    num(input.refOilPct) !== null ? (num(input.refOilPct) as number) : DEFAULT_REF_OIL_PCT;
  const moisturePct =
    num(input.moisturePct) !== null ? (num(input.moisturePct) as number) : DEFAULT_MOISTURE_PCT;

  const totalSeedKg = input.suppliers.reduce(
    (sum, s) => sum + (num(s.seedKg) || 0),
    0
  );

  const step2 = num(input.step2Kg);
  const step3 = num(input.step3Kg);
  const step4 = num(input.step4Kg);

  // Complete = both step3 and step4 logged (plan doc, Version 19).
  const complete = step3 !== null && step4 !== null;

  // actual oil = step2 + step3 (needs both to be meaningful).
  const actualOilKg =
    step2 !== null && step3 !== null ? step2 + step3 : null;

  const extractionEfficiencyPct =
    actualOilKg !== null && totalSeedKg > 0
      ? (actualOilKg / totalSeedKg) * 100
      : null;

  const systemOilKg =
    num(input.systemOilKgOverride) !== null
      ? (num(input.systemOilKgOverride) as number)
      : totalSeedKg > 0
      ? (totalSeedKg * refOilPct) / 100
      : null;

  const shortExtraOilKg =
    actualOilKg !== null && systemOilKg !== null
      ? actualOilKg - systemOilKg
      : null;

  const moistureLossKg = (totalSeedKg * moisturePct) / 100;

  const unaccountedLossKg =
    complete && actualOilKg !== null && step4 !== null
      ? totalSeedKg - actualOilKg - step4 - moistureLossKg
      : null;
  const unaccountedLossPct =
    unaccountedLossKg !== null && totalSeedKg > 0
      ? (unaccountedLossKg / totalSeedKg) * 100
      : null;

  const expectedCakeKg = (totalSeedKg * (100 - refOilPct)) / 100;
  const actualCakeKg = step4;
  const cakeGapKg = actualCakeKg !== null ? actualCakeKg - expectedCakeKg : null;

  const yieldBand =
    extractionEfficiencyPct !== null
      ? mfgYieldBand(extractionEfficiencyPct, refOilPct)
      : null;

  // Per-supplier oil attribution (proportional to seed weight).
  const supplierAttribution: SupplierAttribution[] = input.suppliers.map((s) => {
    const seedKg = num(s.seedKg) || 0;
    const oilKg =
      actualOilKg !== null && totalSeedKg > 0
        ? (actualOilKg * seedKg) / totalSeedKg
        : 0;
    return { name: s.name, seedKg, oilKg };
  });

  // Flags (only meaningful once the batch is complete).
  const massBalanceFlagged =
    complete &&
    unaccountedLossPct !== null &&
    unaccountedLossPct > MASS_BALANCE_TOLERANCE_PCT;

  const shortExtraFlagged =
    complete &&
    shortExtraOilKg !== null &&
    Math.abs(shortExtraOilKg) > SHORT_EXTRA_TOLERANCE_KG;

  const cakeToleranceKg = (totalSeedKg * MASS_BALANCE_TOLERANCE_PCT) / 100;
  const cakeFlagged =
    complete && cakeGapKg !== null && Math.abs(cakeGapKg) > cakeToleranceKg;

  const yieldPoor = complete && yieldBand === "poor";

  return {
    totalSeedKg,
    actualOilKg,
    extractionEfficiencyPct,
    systemOilKg,
    shortExtraOilKg,
    moistureLossKg,
    unaccountedLossKg,
    unaccountedLossPct,
    expectedCakeKg,
    actualCakeKg,
    cakeGapKg,
    yieldBand,
    refOilPct,
    supplierAttribution,
    massBalanceFlagged,
    shortExtraFlagged,
    cakeFlagged,
    yieldPoor,
    complete,
  };
}

export const YIELD_BAND_LABELS: Record<YieldBand, string> = {
  poor: "Poor yield",
  standard: "Standard yield",
  high: "High yield",
  best: "Best yield",
};

/**
 * yieldSnapshotFrom() — build the snapshotted yield analysis from a raw
 * batch record (suppliers may be untyped JSON), so the stored `yield`
 * always matches computeBarrelYield() at save time. Lives here (a plain
 * module) rather than in a route.ts, since Next.js route files may only
 * export route handlers.
 */
export function yieldSnapshotFrom(rec: {
  suppliers: unknown;
  step1Kg?: number | null;
  step2Kg?: number | null;
  step3Kg?: number | null;
  step4Kg?: number | null;
  refOilPct?: number | null;
  moisturePct?: number | null;
  systemOilKgOverride?: number | null;
}): BarrelYieldResult {
  const suppliers: BatchSupplier[] = Array.isArray(rec.suppliers)
    ? (rec.suppliers as BatchSupplier[]).map((s) => ({
        name: String(s?.name ?? ""),
        seedKg: Number(s?.seedKg) || 0,
      }))
    : [];
  return computeBarrelYield({
    suppliers,
    step1Kg: rec.step1Kg ?? null,
    step2Kg: rec.step2Kg ?? null,
    step3Kg: rec.step3Kg ?? null,
    step4Kg: rec.step4Kg ?? null,
    refOilPct: rec.refOilPct ?? null,
    moisturePct: rec.moisturePct ?? null,
    systemOilKgOverride: rec.systemOilKgOverride ?? null,
  });
}
