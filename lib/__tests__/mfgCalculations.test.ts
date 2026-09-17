import { describe, expect, it } from "vitest";
import {
  computeBarrelYield,
  mfgYieldBand,
  DEFAULT_REF_OIL_PCT,
  type BarrelBatchInput,
} from "../mfgCalculations";

// The exact worked example from oil_yield_tracker.py's analyze_barrel_cycle:
// 600kg + 400kg seed, Step 1 240, Steps 2-4 180/38/760, system oil 220
// override -> 218kg actual oil, 21.8% efficiency, -2kg short/extra,
// 7.0kg/0.7% unaccounted loss, no flags, 130.8/87.2 supplier attribution.
describe("computeBarrelYield — oil_yield_tracker.py worked example", () => {
  const input: BarrelBatchInput = {
    suppliers: [
      { name: "A", seedKg: 600 },
      { name: "B", seedKg: 400 },
    ],
    step1Kg: 240,
    step2Kg: 180,
    step3Kg: 38,
    step4Kg: 760,
    systemOilKgOverride: 220,
    // moisture default 1.5% -> 15kg
  };
  const r = computeBarrelYield(input);

  it("totals the seed across both suppliers", () => {
    expect(r.totalSeedKg).toBe(1000);
  });
  it("actual oil = step2 + step3", () => {
    expect(r.actualOilKg).toBe(218);
  });
  it("extraction efficiency = 21.8%", () => {
    expect(r.extractionEfficiencyPct).toBeCloseTo(21.8, 6);
  });
  it("short/extra = actual − system = -2kg", () => {
    expect(r.shortExtraOilKg).toBe(-2);
  });
  it("unaccounted loss = 7.0kg / 0.7%", () => {
    expect(r.unaccountedLossKg).toBeCloseTo(7, 6);
    expect(r.unaccountedLossPct).toBeCloseTo(0.7, 6);
  });
  it("attributes oil proportional to seed weight (130.8 / 87.2)", () => {
    expect(r.supplierAttribution[0].oilKg).toBeCloseTo(130.8, 6);
    expect(r.supplierAttribution[1].oilKg).toBeCloseTo(87.2, 6);
  });
  it("trips no flags", () => {
    expect(r.massBalanceFlagged).toBe(false);
    expect(r.shortExtraFlagged).toBe(false);
    expect(r.cakeFlagged).toBe(false);
    expect(r.yieldPoor).toBe(false);
    expect(r.complete).toBe(true);
  });
});

describe("mfgYieldBand — Karadi default (ref=22) tiers", () => {
  it("below 20% is poor", () => {
    expect(mfgYieldBand(19.9, 22)).toBe("poor");
  });
  it("20–22% is standard", () => {
    expect(mfgYieldBand(20, 22)).toBe("standard");
    expect(mfgYieldBand(21.9, 22)).toBe("standard");
  });
  it("22–23% is high", () => {
    expect(mfgYieldBand(22, 22)).toBe("high");
    expect(mfgYieldBand(22.9, 22)).toBe("high");
  });
  it("23% and above is best", () => {
    expect(mfgYieldBand(23, 22)).toBe("best");
    expect(mfgYieldBand(30, 22)).toBe("best");
  });
  it("re-anchors to a custom reference %", () => {
    // ref=30 -> below 28 poor, [28,30) standard, [30,31) high, >=31 best
    expect(mfgYieldBand(27, 30)).toBe("poor");
    expect(mfgYieldBand(29, 30)).toBe("standard");
    expect(mfgYieldBand(30.5, 30)).toBe("high");
    expect(mfgYieldBand(31, 30)).toBe("best");
  });
});

describe("computeBarrelYield — flags in isolation", () => {
  // Base: 1000kg seed, ref 22 -> system oil 220, expected cake 780.
  // A clean batch: actual oil ~220 (22%), cake ~780, low loss.
  function base(overrides: Partial<BarrelBatchInput> = {}): BarrelBatchInput {
    return {
      suppliers: [{ name: "A", seedKg: 1000 }],
      step1Kg: 240,
      step2Kg: 180,
      step3Kg: 40, // 220 actual -> 22% -> high band, 0 short/extra
      step4Kg: 780, // matches expected cake
      ...overrides,
    };
  }

  it("clean batch trips nothing and lands in the high band", () => {
    const r = computeBarrelYield(base());
    expect(r.actualOilKg).toBe(220);
    expect(r.extractionEfficiencyPct).toBeCloseTo(22, 6);
    expect(r.yieldBand).toBe("high");
    expect(r.massBalanceFlagged).toBe(false);
    expect(r.shortExtraFlagged).toBe(false);
    expect(r.cakeFlagged).toBe(false);
  });

  it("short/extra flag trips when |actual − system| > 2kg", () => {
    // actual oil 210 vs system 220 -> -10kg short.
    const r = computeBarrelYield(base({ step2Kg: 170, step3Kg: 40, step4Kg: 780 }));
    expect(r.shortExtraOilKg).toBe(-10);
    expect(r.shortExtraFlagged).toBe(true);
  });

  it("mass-balance flag trips when unaccounted loss > 2%", () => {
    // Drop step4 cake sharply so seed − oil − cake − moisture is large.
    // 1000 − 220 − 700 − 15 = 65kg = 6.5% > 2%.
    const r = computeBarrelYield(base({ step4Kg: 700 }));
    expect(r.unaccountedLossPct).toBeCloseTo(6.5, 6);
    expect(r.massBalanceFlagged).toBe(true);
  });

  it("cake flag trips when |actual cake − expected| > 2% of seed", () => {
    // expected cake 780, tolerance 20kg. Actual 750 -> gap -30 -> flagged.
    const r = computeBarrelYield(base({ step4Kg: 750 }));
    expect(r.expectedCakeKg).toBe(780);
    expect(r.cakeGapKg).toBe(-30);
    expect(r.cakeFlagged).toBe(true);
  });

  it("poor-yield band trips when efficiency is well below reference", () => {
    // actual oil 150 -> 15% -> poor.
    const r = computeBarrelYield(base({ step2Kg: 120, step3Kg: 30, step4Kg: 780 }));
    expect(r.extractionEfficiencyPct).toBeCloseTo(15, 6);
    expect(r.yieldBand).toBe("poor");
    expect(r.yieldPoor).toBe(true);
  });
});

describe("computeBarrelYield — incompleteness", () => {
  it("does not score a batch missing step3/step4", () => {
    const r = computeBarrelYield({
      suppliers: [{ name: "A", seedKg: 1000 }],
      step1Kg: 240,
      step2Kg: 180,
    });
    expect(r.complete).toBe(false);
    expect(r.actualOilKg).toBeNull();
    expect(r.unaccountedLossKg).toBeNull();
    expect(r.massBalanceFlagged).toBe(false);
    expect(r.shortExtraFlagged).toBe(false);
  });

  it("uses the default reference % when none is given", () => {
    const r = computeBarrelYield({
      suppliers: [{ name: "A", seedKg: 1000 }],
      step2Kg: 110,
      step3Kg: 110,
      step4Kg: 780,
    });
    expect(r.refOilPct).toBe(DEFAULT_REF_OIL_PCT);
    expect(r.systemOilKg).toBe(220); // 1000 * 22%
  });
});
