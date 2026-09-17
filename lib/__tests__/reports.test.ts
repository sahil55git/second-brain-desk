import { describe, expect, it } from "vitest";
import { buildReportCsv, computeSummary, type ReportData } from "../reports";
import type { JobWorkIntakeDTO, DailyClosingDTO, MfgBatchDTO } from "../types";

function jw(over: Partial<JobWorkIntakeDTO>): JobWorkIntakeDTO {
  return {
    id: "j1", customer: "Ramesh", vehicleNo: null, seedKg: 100,
    cakeOwnership: "SHOP", advanceCustomerInr: 0, advanceAutoInr: 0,
    cans: null, notes: null, settled: false, settlementCustomerInr: null,
    settlementAutoInr: null, settlementRatePerKg: null, settlementAmountInr: null,
    settledAt: null, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), ...over,
  };
}
function mfg(over: Partial<MfgBatchDTO>): MfgBatchDTO {
  return {
    id: "m1", mill: null, barrel: "A1", productItem: "Karadi oil",
    date: "2026-09-17", suppliers: [{ name: "A", seedKg: 1000 }],
    step1Kg: 240, step2Kg: 180, step3Kg: 40, step4Kg: 780,
    step2Date: null, step2Time: null, step3Date: null, step3Time: null,
    step4Date: null, step4Time: null, refOilPct: 22, moisturePct: null,
    systemOilKgOverride: null, seedQuality: null, notes: null, yield: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
  };
}
function closing(over: Partial<DailyClosingDTO>): DailyClosingDTO {
  return {
    id: "c1", date: "2026-09-17", session: "AFTERNOON",
    cashInOpening: 0, cashInSales: 0, cashInOther: 0, cashOutGrn: 0,
    cashOutExpenses: 0, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 0,
    cashOutOther: 0, counterCashInr: 0, systemCashInr: 0, cashDiffInr: 0,
    cashMismatch: false, stock: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
  };
}

const data: ReportData = {
  jobWork: [jw({ customer: "Ramesh", settled: false }), jw({ id: "j2", customer: "Sunil, Jr.", settled: true, settlementAmountInr: 600 })],
  mfg: [mfg({}), mfg({ id: "m2", barrel: "B2", step4Kg: 700 })], // second trips mass-balance
  closing: [closing({ cashMismatch: true, cashDiffInr: 500 })],
};

describe("buildReportCsv", () => {
  const csv = buildReportCsv(data, "all");
  it("includes all three section headers", () => {
    expect(csv).toContain("JOB-WORK INTAKES");
    expect(csv).toContain("MANUFACTURING BATCHES");
    expect(csv).toContain("DAILY CLOSING COUNTS");
  });
  it("escapes a cell containing a comma", () => {
    expect(csv).toContain('"Sunil, Jr."');
  });
  it("marks a mass-balance-flagged batch in the flags column", () => {
    expect(csv).toContain("mass-balance");
  });
});

describe("computeSummary", () => {
  const s = computeSummary(data, "all");
  it("counts job-work and unpaid correctly", () => {
    expect(s.jobWorkCount).toBe(2);
    expect(s.jobWorkUnpaid).toBe(1);
  });
  it("computes khali stock across shop-kept intakes (78% of seed)", () => {
    // Two SHOP intakes of 100kg -> 78kg each -> 156kg.
    expect(s.khaliStockKg).toBeCloseTo(156, 6);
  });
  it("flags one mass-balance-failing batch and counts oil produced", () => {
    expect(s.mfgTotal).toBe(2);
    expect(s.mfgFlagged).toBe(1);
    expect(s.oilProducedKg).toBeCloseTo(440, 6); // 220 + 220 actual oil
  });
  it("counts cash mismatches", () => {
    expect(s.cashMismatches).toBe(1);
  });
});
