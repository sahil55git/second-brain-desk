// Manufacturing quick desk — small pure helpers (what is due, month totals,
// next barrel label). The yield maths itself stays in lib/mfgCalculations.ts.
import { computeBarrelYield, type BarrelBatchInput } from "./mfgCalculations";

export interface BatchLite {
  barrel: string;
  date: string;
  suppliers: { name: string; seedKg: number }[];
  step1Kg: number | null;
  step2Kg: number | null;
  step3Kg: number | null;
  step4Kg: number | null;
  step2Date: string | null;
  step3Date: string | null;
  refOilPct: number | null;
  moisturePct: number | null;
  systemOilKgOverride: number | null;
}

export const STEP_LABELS: Record<1 | 2 | 3 | 4, { en: string; hint: string }> = {
  1: { en: "① Crude oil", hint: "pumped in at crush time" },
  2: { en: "② Skim", hint: "after 2–3 days" },
  3: { en: "③ Decant", hint: "after 3–4 days" },
  4: { en: "④ Waste / cake", hint: "sediment removed" },
};

export const toInput = (b: BatchLite): BarrelBatchInput => ({
  suppliers: b.suppliers,
  step1Kg: b.step1Kg,
  step2Kg: b.step2Kg,
  step3Kg: b.step3Kg,
  step4Kg: b.step4Kg,
  refOilPct: b.refOilPct,
  moisturePct: b.moisturePct,
  systemOilKgOverride: b.systemOilKgOverride,
});

/** The first step still to be entered; null when all four are in. */
export function nextStep(b: Pick<BatchLite, "step1Kg" | "step2Kg" | "step3Kg" | "step4Kg">): 1 | 2 | 3 | 4 | null {
  if (b.step1Kg == null) return 1;
  if (b.step2Kg == null) return 2;
  if (b.step3Kg == null) return 3;
  if (b.step4Kg == null) return 4;
  return null;
}

const dayMs = 86400000;
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / dayMs);

/** A short "what to do next" line for an open barrel, or null if nothing is due. */
export function dueNote(b: BatchLite, today: string): { text: string; late: boolean } | null {
  const n = nextStep(b);
  if (n === null) return null;
  if (n === 1) return { text: "Enter the crude oil pumped in (step 1).", late: false };
  if (n === 2) {
    const d = daysBetween(b.date, today);
    return { text: d >= 2 ? `Skim (step 2) is due — ${d} days since crush.` : `Skim (step 2) in ${2 - d} day(s).`, late: d >= 2 };
  }
  if (n === 3) {
    const d = daysBetween(b.step2Date || b.date, today);
    return { text: d >= 3 ? `Decant (step 3) is due — ${d} days since skim.` : `Decant (step 3) in ${3 - d} day(s).`, late: d >= 3 };
  }
  return { text: "Enter the waste / sediment (step 4) to finish this barrel.", late: false };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Totals for batches that started in a month ("YYYY-MM"). */
export function monthStats(batches: BatchLite[], month: string) {
  let barrels = 0, seedKg = 0, oilKg = 0, doneSeedKg = 0, doneOilKg = 0, open = 0, flagged = 0, done = 0;
  for (const b of batches) {
    if (!b.date.startsWith(month)) continue;
    const y = computeBarrelYield(toInput(b));
    barrels++;
    seedKg += y.totalSeedKg;
    if (y.actualOilKg != null) oilKg += y.actualOilKg;
    if (y.complete) {
      done++;
      doneSeedKg += y.totalSeedKg;
      doneOilKg += y.actualOilKg ?? 0;
      if (y.massBalanceFlagged || y.shortExtraFlagged || y.cakeFlagged || y.yieldPoor) flagged++;
    } else open++;
  }
  return { barrels, done, open, flagged, seedKg: r1(seedKg), oilKg: r1(oilKg), efficiencyPct: doneSeedKg > 0 ? r1((doneOilKg / doneSeedKg) * 100) : null };
}

/** "A12" → "A13", "Barrel 7" → "Barrel 8"; "" when there is no number to count on. */
export function suggestNextBarrel(latest: string | undefined): string {
  const m = /^(.*?)(\d+)\s*$/.exec((latest || "").trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : "";
}
