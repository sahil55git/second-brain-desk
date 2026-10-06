import { describe, expect, it } from "vitest";
import { balancesAsOf, cakeSold, crushTotals, expectedFor, gapOf, isGapFlagged, isLow, jobWorkExpected, packReceived, tankKg, gapMessage } from "../tallyDesks";

const D = (s: string) => new Date(`${s}T10:00:00+05:30`);
const now = D("2026-10-06").getTime();

describe("job-work customer stock", () => {
  const intakes = [
    { customer: "Ravi", seedKg: 100, settled: false, createdAt: D("2026-10-01") },
    { customer: "ravi ", seedKg: 50, settled: false, createdAt: D("2026-10-03") },
    { customer: "Maruti", seedKg: 80, settled: true, settledAt: D("2026-10-04"), createdAt: D("2026-10-02") },
  ];
  it("sums open challans per customer (names merged, settled ignored)", () => {
    const r = jobWorkExpected(intakes, now, now);
    expect(r).toHaveLength(1);
    expect(r[0].expected).toBe(150);
    expect(r[0].note).toContain("2 open challans");
  });
  it("as of an earlier day, a later-settled challan was still open", () => {
    const r = jobWorkExpected(intakes, D("2026-10-03").getTime() + 86400000 / 2, now);
    expect(r.map((x) => [x.label, x.expected])).toEqual([["Ravi", 150], ["Maruti", 80]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });
});

describe("gap flags", () => {
  it("quantities use 2% (min 0.5 kg)", () => {
    expect(isGapFlagged("SEED", 1000, 985)).toBe(false); // 15kg < 20kg
    expect(isGapFlagged("SEED", 1000, 970)).toBe(true);
    expect(isGapFlagged("JOBWORK", 10, 9.7)).toBe(false);
    expect(isGapFlagged("JOBWORK", 10, 9)).toBe(true);
  });
  it("money and pieces flag on any real difference", () => {
    expect(isGapFlagged("UDHAR", 5000, 4999.5)).toBe(false);
    expect(isGapFlagged("UDHAR", 5000, 4500)).toBe(true);
    expect(isGapFlagged("PACK", 100, 99)).toBe(true);
  });
  it("no expected figure = no flag; messages say what the gap means", () => {
    expect(isGapFlagged("SEED", null, 5)).toBe(false);
    expect(gapOf(null, 5)).toBeNull();
    expect(gapMessage("JOBWORK", 12)).toMatch(/UNRECORDED/);
    expect(gapMessage("JOBWORK", -12)).toMatch(/ITC-04/);
  });
});

describe("flow desks", () => {
  it("expected = prev + auto in + received − auto out − used; first count is a baseline", () => {
    const def = { expected: null, prev: 500, autoIn: 0, autoOut: 120 };
    expect(expectedFor("flow", def, { received: 300, used: 10 })).toBe(670);
    expect(expectedFor("flow", { ...def, prev: null }, {})).toBeNull();
  });
  it("crush totals, cake sold, packaging received are windowed by date", () => {
    const rows = [
      { date: "2026-10-04", kind: "FRESH_CRUSH", item: "groundnut", qty: null, unit: null, amountInr: 0, paymentMode: "CASH", partyName: null, details: { seedKg: 100, cakeKg: 60 } },
      { date: "2026-10-05", kind: "FRESH_CRUSH", item: "groundnut", qty: null, unit: null, amountInr: 0, paymentMode: "CASH", partyName: null, details: { seedKg: 50, cakeKg: 30 } },
      { date: "2026-10-05", kind: "SALE", item: "cake", qty: 40, unit: "kg", amountInr: 0, paymentMode: "CASH", partyName: null },
      { date: "2026-10-05", kind: "PURCHASE", item: "tins", qty: 200, unit: "pcs", amountInr: 0, paymentMode: "CASH", partyName: null },
    ];
    expect(crushTotals(rows, "2026-10-04", "2026-10-06")).toEqual({ seed: { groundnut: 50 }, cake: 30 });
    expect(cakeSold(rows, null, "2026-10-06")).toBe(40);
    expect(packReceived(rows, "2026-10-04", "2026-10-06")).toEqual({ tins: 200 });
  });
  it("reorder level", () => {
    expect(isLow(40, 50)).toBe(true);
    expect(isLow(60, 50)).toBe(false);
    expect(isLow(5, null)).toBe(false);
  });
});

describe("udhar & tank", () => {
  it("customer udhar = credit sales − received; supplier = credit purchases − payments (not salary)", () => {
    const base = { item: null, qty: null, unit: null, details: null };
    const rows = [
      { ...base, date: "2026-10-01", kind: "SALE", amountInr: 3000, paymentMode: "CREDIT", partyName: "Ravi" },
      { ...base, date: "2026-10-02", kind: "UDHAAR_IN", amountInr: 1000, paymentMode: "CASH", partyName: "Ravi" },
      { ...base, date: "2026-10-02", kind: "PURCHASE", amountInr: 8000, paymentMode: "CREDIT", partyName: "Seed Co" },
      { ...base, date: "2026-10-03", kind: "PAYMENT", item: "supplier", amountInr: 3000, paymentMode: "CASH", partyName: "Seed Co" },
      { ...base, date: "2026-10-03", kind: "PAYMENT", item: "salary", amountInr: 9000, paymentMode: "CASH", partyName: "Seed Co" },
      { ...base, date: "2026-10-09", kind: "SALE", amountInr: 999, paymentMode: "CREDIT", partyName: "Ravi" },
    ] as never[];
    const r = balancesAsOf(rows, "2026-10-06");
    expect(r.map((x) => [x.group, x.label, x.expected])).toEqual([["customer", "Ravi", 2000], ["supplier", "Seed Co", 5000]]);
  });
  it("tank kg from dip × kg/cm or typed kg", () => {
    expect(tankKg({ dip: 120, kgPerCm: 8.5 })).toBe(1020);
    expect(tankKg({ counted: 900, dip: 120, kgPerCm: 8.5 })).toBe(900);
    expect(tankKg({})).toBeNull();
  });
});
