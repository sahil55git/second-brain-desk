// Job-work crushing mass balance and "oil still at the shop" checks (Spec B,
// SOP job-work steps 5, 7, 8). Pure functions so they are easy to test.
//
// The 2% tolerance is the same one the self-crushing mass balance uses.
import { businessDate } from "@/lib/register";
import { KHALI_SPLIT } from "@/lib/calculations";

export const JOBWORK_LOSS_TOLERANCE_PCT = 2;

// Oil collection was not tracked before this date, so older intakes are never
// reported as "oil still at shop" (there would be hundreds of false alarms).
// Change the date only if Sahil wants the history back-filled first.
export const OIL_TRACKING_FROM = "2026-11-12";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DayBalance {
  seedKg: number;
  outKg: number;
  lossKg: number;
  lossPct: number;
  flag: boolean;
}

/** Seed in vs oil + cake out. Positive loss = less came out than went in. */
export function dayBalance(seedKgTotal: number, oilKg: number, cakeKg: number): DayBalance {
  const seed = Number(seedKgTotal) || 0;
  const out = (Number(oilKg) || 0) + (Number(cakeKg) || 0);
  const lossKg = seed - out;
  // No seed in means there is nothing to measure against.
  const lossPct = seed > 0 ? (lossKg / seed) * 100 : 0;
  return {
    seedKg: r2(seed),
    outKg: r2(out),
    lossKg: r2(lossKg),
    lossPct: r2(lossPct),
    flag: seed > 0 && Math.abs(lossPct) > JOBWORK_LOSS_TOLERANCE_PCT,
  };
}

interface IntakeLike {
  createdAt: string | number | Date;
  settled: boolean;
  oilCollectedAt?: string | number | Date | null;
}

const dayOf = (i: IntakeLike) => businessDate(i.createdAt);

/** Intakes from an earlier day (on or after `since`) whose oil has not been collected. */
export function uncollected<T extends IntakeLike>(intakes: T[], today: string, since = OIL_TRACKING_FROM): T[] {
  return intakes.filter((i) => !i.oilCollectedAt && dayOf(i) < today && dayOf(i) >= since);
}

/** Intakes from an earlier day that are still not settled. */
export function unsettled<T extends IntakeLike>(intakes: T[], today: string): T[] {
  return intakes.filter((i) => !i.settled && dayOf(i) < today);
}

/** Total seed kg that came in on one business day. */
export function seedKgOn(intakes: (IntakeLike & { seedKg: number })[], date: string): number {
  return intakes.filter((i) => dayOf(i) === date).reduce((a, i) => a + i.seedKg, 0);
}

/**
 * Business dates before `today` (and on or after `from`) that had intakes but no
 * recorded output. Callers pass `from` so old history does not raise alerts.
 */
export function daysMissingOutput(
  intakes: (IntakeLike & { seedKg: number })[],
  outputs: { date: string }[],
  today: string,
  from = OIL_TRACKING_FROM
): string[] {
  const have = new Set(outputs.map((o) => o.date));
  const days = new Set(intakes.map(dayOf));
  return Array.from(days)
    .filter((d) => d < today && d >= from && !have.has(d))
    .sort();
}

export interface KhaliStock {
  measuredKg: number; // from days that have a recorded output
  estimateKg: number; // from days without one (78% of the shop's seed)
  totalKg: number;
}

/**
 * Cake the shop holds from job-work crushing. A day with a recorded output uses
 * the measured cake, shared between shop-cake and customer-cake entries in
 * proportion to their seed (the output is one number for the whole day). A day
 * without an output keeps the old fixed-percentage estimate.
 */
export function khaliStock(
  intakes: (IntakeLike & { seedKg: number; cakeOwnership: string })[],
  outputs: { date: string; cakeKg: number }[]
): KhaliStock {
  const out = new Map(outputs.map((o) => [o.date, o.cakeKg]));
  const perDay = new Map<string, { all: number; shop: number }>();
  for (const i of intakes) {
    const d = dayOf(i);
    const x = perDay.get(d) ?? { all: 0, shop: 0 };
    x.all += i.seedKg;
    if (i.cakeOwnership === "SHOP") x.shop += i.seedKg;
    perDay.set(d, x);
  }
  let measured = 0;
  let estimate = 0;
  for (const [d, x] of Array.from(perDay.entries())) {
    const cake = out.get(d);
    if (cake !== undefined && x.all > 0) measured += (cake * x.shop) / x.all;
    else estimate += (x.shop * KHALI_SPLIT.khaliPct) / 100;
  }
  return { measuredKg: r2(measured), estimateKg: r2(estimate), totalKg: r2(measured + estimate) };
}
