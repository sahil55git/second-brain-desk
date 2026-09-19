import { describe, expect, it } from "vitest";
import { buildReportCsv, computeSummary, buildTriageItems, JOBWORK_OVERDUE_DAYS, type ReportData } from "../reports";
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

describe("buildTriageItems", () => {
  const oldDate = new Date(Date.now() - (JOBWORK_OVERDUE_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString();
  const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  it("flags an unsettled job-work intake older than the overdue threshold, naming customer and amount due", () => {
    const t = buildTriageItems({
      jobWork: [jw({ id: "j-old", customer: "Overdue Kishan", settled: false, createdAt: oldDate })],
      mfg: [], closing: [],
    });
    const item = t.find((i) => i.id === "jw-j-old");
    expect(item).toBeTruthy();
    expect(item?.severity).toBe("critical");
    expect(item?.message).toContain("Overdue Kishan");
  });

  it("does not flag an unsettled job-work intake still within the overdue threshold", () => {
    const t = buildTriageItems({
      jobWork: [jw({ id: "j-new", settled: false, createdAt: recentDate })],
      mfg: [], closing: [],
    });
    expect(t.find((i) => i.id === "jw-j-new")).toBeUndefined();
  });

  it("does not flag a settled job-work intake even if old", () => {
    const t = buildTriageItems({
      jobWork: [jw({ id: "j-paid", settled: true, createdAt: oldDate })],
      mfg: [], closing: [],
    });
    expect(t.find((i) => i.id === "jw-j-paid")).toBeUndefined();
  });

  it("flags a complete mass-balance-failing batch as critical, and a settling batch as info", () => {
    const t = buildTriageItems({
      jobWork: [],
      mfg: [mfg({ id: "m-flag", step4Kg: 700 }), mfg({ id: "m-settling", step4Kg: null })],
      closing: [],
    });
    const flagged = t.find((i) => i.id === "mfg-m-flag");
    const settling = t.find((i) => i.id === "mfg-m-settling");
    expect(flagged?.severity).toBe("critical");
    expect(flagged?.message).toContain("mass-balance");
    expect(settling?.severity).toBe("info");
  });

  it("flags today's cash mismatch but not a past one", () => {
    const t = buildTriageItems({
      jobWork: [], mfg: [],
      closing: [
        closing({ id: "c-today", cashMismatch: true, cashDiffInr: 500, date: todayStr }),
        closing({ id: "c-past", cashMismatch: true, cashDiffInr: 400, date: "2020-01-01" }),
      ],
    });
    expect(t.find((i) => i.id === "cl-cash-c-today")).toBeTruthy();
    expect(t.find((i) => i.id === "cl-cash-c-past")).toBeUndefined();
  });

  it("flags a stock gap on only the most recent closing", () => {
    const t = buildTriageItems({
      jobWork: [], mfg: [],
      closing: [
        closing({
          id: "c-old", createdAt: new Date(Date.now() - 100000).toISOString(),
          stock: { Mustard: { today: 10, yesterday: 20, yesterdaySource: "auto", gap: 5 } },
        }),
        closing({
          id: "c-latest", createdAt: new Date().toISOString(),
          stock: { Mustard: { today: 10, yesterday: 20, yesterdaySource: "auto", gap: 0.7 } },
        }),
      ],
    });
    expect(t.find((i) => i.id === "cl-stock-c-latest-Mustard")).toBeTruthy();
    expect(t.find((i) => i.id === "cl-stock-c-old-Mustard")).toBeUndefined();
  });

  it("sorts critical items before caution and info", () => {
    const t = buildTriageItems({
      jobWork: [jw({ id: "j-old2", settled: false, createdAt: oldDate })],
      mfg: [mfg({ id: "m-settling2", step4Kg: null })],
      closing: [closing({
        id: "c-gap", createdAt: new Date().toISOString(),
        stock: { Mustard: { today: 10, yesterday: 20, yesterdaySource: "auto", gap: 1 } },
      })],
    });
    const severities = t.map((i) => i.severity);
    const firstCaution = severities.indexOf("caution");
    const firstInfo = severities.indexOf("info");
    const lastCritical = severities.lastIndexOf("critical");
    if (firstCaution !== -1) expect(lastCritical).toBeLessThan(firstCaution);
    if (firstInfo !== -1) expect(lastCritical).toBeLessThan(firstInfo);
  });
});
