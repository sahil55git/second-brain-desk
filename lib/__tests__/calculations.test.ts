import { describe, expect, it } from "vitest";
import {
  CAN_TYPES,
  CASH_GAP_THRESHOLD_INR,
  cashGapFlag,
  computeProductTally,
  computeSystemCash,
  defaultPaySplit,
  expectedSettlement,
  expectedSettlementWithRate,
  getYesterdayStock,
  grossSettlement,
  KHALI_SPLIT,
  STANDARD_RATE,
  STOCK_PRODUCTS,
  canCharge,
  type JobWorkEntryLike,
} from "../calculations";

describe("STANDARD_RATE / grossSettlement", () => {
  it("uses ₹6/kg when the shop keeps the cake", () => {
    const entry: JobWorkEntryLike = { seedKg: 80, cakeOwnership: "SHOP" };
    expect(grossSettlement(entry)).toBe(480);
  });

  it("uses ₹10/kg when the customer keeps the cake", () => {
    const entry: JobWorkEntryLike = { seedKg: 45, cakeOwnership: "CUSTOMER" };
    expect(grossSettlement(entry)).toBe(450);
  });

  it("honors an explicit rate override", () => {
    const entry: JobWorkEntryLike = { seedKg: 100, cakeOwnership: "SHOP" };
    expect(grossSettlement(entry, 7)).toBe(700);
  });
});

describe("canCharge", () => {
  it("is zero with no cans", () => {
    expect(canCharge(null)).toBe(0);
    expect(canCharge({})).toBe(0);
  });

  it("sums qty * rate across can types", () => {
    expect(
      canCharge({
        can15: { qty: 1, rate: CAN_TYPES.can15.rate },
        can5new: { qty: 2, rate: CAN_TYPES.can5new.rate },
      })
    ).toBe(50 + 2 * 40);
  });
});

describe("expectedSettlement / expectedSettlementWithRate", () => {
  it("SHOP direction: due = gross - advances - cans", () => {
    const entry: JobWorkEntryLike = {
      seedKg: 80,
      cakeOwnership: "SHOP",
      advanceCustomerInr: 50,
      advanceAutoInr: 20,
      cans: { can15: { qty: 1, rate: 50 } },
    };
    // gross = 480, advances = 70, cans = 50 -> due = 360
    expect(expectedSettlement(entry)).toBe(480 - 70 - 50);
  });

  it("CUSTOMER direction: due = gross + cans - advances", () => {
    const entry: JobWorkEntryLike = {
      seedKg: 45,
      cakeOwnership: "CUSTOMER",
      advanceCustomerInr: 100,
      cans: { can5old: { qty: 1, rate: 20 } },
    };
    // gross = 450, cans = 20, advance = 100 -> due = 370
    expect(expectedSettlement(entry)).toBe(450 + 20 - 100);
  });

  it("expectedSettlementWithRate applies a ₹/kg override instead of the standard rate", () => {
    const entry: JobWorkEntryLike = { seedKg: 100, cakeOwnership: "SHOP" };
    expect(expectedSettlementWithRate(entry, 7)).toBe(700);
    expect(expectedSettlement(entry)).toBe(600); // standard ₹6/kg
  });

  it("zero advances/cans reduce to the gross amount", () => {
    const entry: JobWorkEntryLike = { seedKg: 10, cakeOwnership: "SHOP" };
    expect(expectedSettlement(entry)).toBe(STANDARD_RATE.SHOP * 10);
  });
});

describe("defaultPaySplit", () => {
  it("SHOP direction: 50/50 of gross, each side's own advance netted from their half, cans only from customer's half", () => {
    const entry: JobWorkEntryLike = {
      seedKg: 80, // gross = 480, half = 240
      cakeOwnership: "SHOP",
      advanceCustomerInr: 50,
      advanceAutoInr: 20,
      cans: { can15: { qty: 1, rate: 50 } }, // 50
    };
    const split = defaultPaySplit(entry);
    expect(split.customer).toBe(240 - 50 - 50); // 140
    expect(split.auto).toBe(240 - 20); // 220
    // Sum of split should equal expectedSettlement's due amount.
    expect(split.customer + split.auto).toBe(expectedSettlement(entry));
  });

  it("SHOP direction with no advances/cans splits evenly", () => {
    const entry: JobWorkEntryLike = { seedKg: 100, cakeOwnership: "SHOP" };
    const split = defaultPaySplit(entry);
    expect(split.customer).toBe(300);
    expect(split.auto).toBe(300);
  });

  it("CUSTOMER direction: single amount on the customer side, auto is zero", () => {
    const entry: JobWorkEntryLike = {
      seedKg: 45,
      cakeOwnership: "CUSTOMER",
      advanceCustomerInr: 100,
    };
    const split = defaultPaySplit(entry);
    expect(split.auto).toBe(0);
    expect(split.customer).toBe(expectedSettlement(entry));
  });

  it("respects a rate override in the split", () => {
    const entry: JobWorkEntryLike = { seedKg: 100, cakeOwnership: "SHOP" };
    const split = defaultPaySplit(entry, 8); // gross = 800, half = 400
    expect(split.customer).toBe(400);
    expect(split.auto).toBe(400);
  });
});

describe("cashGapFlag / computeSystemCash", () => {
  const baseInputs = {
    cashInOpening: 5000,
    cashInSales: 18000,
    cashInOther: 0,
    cashOutGrn: 480,
    cashOutExpenses: 1200,
    cashOutSalary: 0,
    cashOutUpi: 2000,
    cashOutDraw: 0,
    cashOutOther: 0,
  };

  it("computes system cash as total in minus total out", () => {
    expect(computeSystemCash(baseInputs)).toBe(5000 + 18000 - (480 + 1200 + 2000));
  });

  it("does not flag a gap under ₹300", () => {
    const systemCash = computeSystemCash(baseInputs);
    const result = cashGapFlag(baseInputs, systemCash - 299);
    expect(result.flagged).toBe(false);
  });

  it("flags a gap of exactly ₹300", () => {
    const systemCash = computeSystemCash(baseInputs);
    const result = cashGapFlag(baseInputs, systemCash - CASH_GAP_THRESHOLD_INR);
    expect(result.flagged).toBe(true);
    expect(result.diff).toBe(CASH_GAP_THRESHOLD_INR);
  });

  it("flags a negative gap (counter cash higher than system cash) of ₹300+", () => {
    const systemCash = computeSystemCash(baseInputs);
    const result = cashGapFlag(baseInputs, systemCash + 500);
    expect(result.flagged).toBe(true);
    expect(result.diff).toBe(-500);
  });

  it("matches counter cash exactly with zero diff", () => {
    const systemCash = computeSystemCash(baseInputs);
    const result = cashGapFlag(baseInputs, systemCash);
    expect(result.diff).toBe(0);
    expect(result.flagged).toBe(false);
  });
});

describe("stock tally — computeProductTally", () => {
  const sfConfig = STOCK_PRODUCTS.find((p) => p.key === "sf")!;
  const k2Config = STOCK_PRODUCTS.find((p) => p.key === "k2")!;

  it("computes Sale = yesterday - today, Gap = sale - reportSale for a hasReportSale product", () => {
    const result = computeProductTally(sfConfig, 100, 18, 120, "auto");
    expect(result.sale).toBe(20); // 120 - 100
    expect(result.gap).toBe(2); // 20 - 18
  });

  it("computes Diff = today - yesterday for K2 (no reportSale)", () => {
    const result = computeProductTally(k2Config, 45, undefined, 40, "auto");
    expect(result.diff).toBe(5);
    expect(result.sale).toBeUndefined();
    expect(result.gap).toBeUndefined();
  });

  it("returns null sale/gap when yesterday is unknown", () => {
    const result = computeProductTally(sfConfig, 100, 18, null, "none");
    expect(result.sale).toBeNull();
    expect(result.gap).toBeNull();
  });

  it("returns null gap when reportSale wasn't entered but sale is known", () => {
    const result = computeProductTally(sfConfig, 100, undefined, 120, "auto");
    expect(result.sale).toBe(20);
    expect(result.gap).toBeNull();
  });
});

describe("getYesterdayStock", () => {
  const t = (isoOffsetDays: number) => {
    const d = new Date("2026-09-15T12:00:00.000Z");
    d.setDate(d.getDate() + isoOffsetDays);
    return d;
  };

  it("finds the most recent prior entry with a value for this product", () => {
    const prior = [
      { createdAt: t(-3), stock: { sf: { today: 80 } } },
      { createdAt: t(-2), stock: { sf: { today: 95 } } },
      { createdAt: t(-1), stock: { sf: { today: 110 } } },
    ];
    const result = getYesterdayStock(prior, "sf", t(0));
    expect(result.value).toBe(110);
    expect(result.source).toBe("auto");
  });

  it("skips entries that didn't record a value for this product", () => {
    const prior = [
      { createdAt: t(-2), stock: { sf: { today: 95 } } },
      { createdAt: t(-1), stock: {} }, // no sf recorded on this count
    ];
    const result = getYesterdayStock(prior, "sf", t(0));
    expect(result.value).toBe(95);
  });

  it("only looks strictly before the given timestamp (never a later entry)", () => {
    const prior = [
      { createdAt: t(-1), stock: { sf: { today: 90 } } },
      { createdAt: t(1), stock: { sf: { today: 999 } } }, // "future" relative to t(0)
    ];
    const result = getYesterdayStock(prior, "sf", t(0));
    expect(result.value).toBe(90);
  });

  it("an explicit override always wins over the auto-lookup", () => {
    const prior = [{ createdAt: t(-1), stock: { sf: { today: 90 } } }];
    const result = getYesterdayStock(prior, "sf", t(0), 500);
    expect(result.value).toBe(500);
    expect(result.source).toBe("override");
  });

  it("returns none when there is no prior entry at all", () => {
    const result = getYesterdayStock([], "sf", t(0));
    expect(result.value).toBeNull();
    expect(result.source).toBe("none");
  });
});

describe("KHALI_SPLIT sanity", () => {
  it("oil + khali percentages sum to 100", () => {
    expect(KHALI_SPLIT.oilPct + KHALI_SPLIT.khaliPct).toBe(100);
  });
});
