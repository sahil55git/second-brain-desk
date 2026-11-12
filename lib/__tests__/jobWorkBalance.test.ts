import { describe, expect, it } from "vitest";
import { dayBalance, daysMissingOutput, khaliStock, seedKgOn, uncollected, unsettled } from "@/lib/jobWorkBalance";

// 2026-11-10 10:00 India = 04:30 UTC. 23:30 India on the 10th = 18:00 UTC.
const at = (iso: string) => iso;
const intake = (createdAt: string, extra: Partial<{ settled: boolean; oilCollectedAt: string | null; seedKg: number; cakeOwnership: string }> = {}) => ({
  createdAt,
  settled: false,
  oilCollectedAt: null as string | null,
  seedKg: 100,
  cakeOwnership: "SHOP",
  ...extra,
});

describe("dayBalance", () => {
  it("is fine at exactly 2%", () => {
    const b = dayBalance(1000, 220, 760); // out 980, loss 20 = 2.00%
    expect(b.lossKg).toBe(20);
    expect(b.lossPct).toBe(2);
    expect(b.flag).toBe(false);
  });
  it("flags a loss above 2%", () => {
    const b = dayBalance(1000, 200, 770); // loss 30 = 3%
    expect(b.flag).toBe(true);
    expect(b.outKg).toBe(970);
  });
  it("flags more coming out than went in", () => {
    const b = dayBalance(1000, 300, 760); // out 1060, -6%
    expect(b.lossPct).toBe(-6);
    expect(b.flag).toBe(true);
  });
  it("does not flag when no seed came in", () => {
    expect(dayBalance(0, 0, 0).flag).toBe(false);
    expect(dayBalance(0, 5, 5).lossPct).toBe(0);
  });
  it("treats blanks as zero", () => {
    expect(dayBalance(100, NaN as unknown as number, 98).outKg).toBe(98);
  });
});

describe("uncollected / unsettled", () => {
  const today = "2026-11-13";
  it("only counts earlier days, not today", () => {
    const rows = [intake(at("2026-11-12T05:00:00Z")), intake(at("2026-11-13T05:00:00Z"))];
    expect(uncollected(rows, today)).toHaveLength(1);
    expect(unsettled(rows, today)).toHaveLength(1);
  });
  it("skips collected and settled rows", () => {
    const rows = [
      intake(at("2026-11-12T05:00:00Z"), { oilCollectedAt: "2026-11-12T09:00:00Z" }),
      intake(at("2026-11-12T05:00:00Z"), { settled: true }),
    ];
    expect(uncollected(rows, today)).toHaveLength(1);
    expect(unsettled(rows, today)).toHaveLength(1);
  });
  it("ignores intakes from before oil tracking started", () => {
    const rows = [intake(at("2026-10-01T05:00:00Z"))];
    expect(uncollected(rows, today)).toHaveLength(0);
    expect(uncollected(rows, today, "2026-01-01")).toHaveLength(1);
  });
  it("uses the India date: 11:30 pm on the 12th is still the 12th", () => {
    // 18:00 UTC on the 12th is 23:30 India on the 12th; 19:00 UTC is 00:30 on the 13th.
    expect(uncollected([intake(at("2026-11-12T18:00:00Z"))], "2026-11-13")).toHaveLength(1);
    expect(uncollected([intake(at("2026-11-12T19:00:00Z"))], "2026-11-13")).toHaveLength(0);
  });
});

describe("seedKgOn and daysMissingOutput", () => {
  const rows = [
    intake(at("2026-11-12T05:00:00Z"), { seedKg: 400 }),
    intake(at("2026-11-12T08:00:00Z"), { seedKg: 600 }),
    intake(at("2026-11-13T05:00:00Z"), { seedKg: 50 }),
  ];
  it("adds the seed for one India day", () => {
    expect(seedKgOn(rows, "2026-11-12")).toBe(1000);
  });
  it("lists earlier days with seed but no output", () => {
    expect(daysMissingOutput(rows, [], "2026-11-14")).toEqual(["2026-11-12", "2026-11-13"]);
    expect(daysMissingOutput(rows, [{ date: "2026-11-12" }], "2026-11-14")).toEqual(["2026-11-13"]);
  });
  it("never lists today, and skips days before tracking began", () => {
    expect(daysMissingOutput(rows, [], "2026-11-13")).toEqual(["2026-11-12"]);
    expect(daysMissingOutput([intake(at("2026-09-01T05:00:00Z"))], [], "2026-11-14")).toEqual([]);
  });
});

describe("khaliStock", () => {
  const row = (createdAt: string, seedKg: number, cakeOwnership: string) => intake(createdAt, { seedKg, cakeOwnership });
  it("keeps the 78% estimate for a day with no output", () => {
    const k = khaliStock([row("2026-11-12T05:00:00Z", 1000, "SHOP")], []);
    expect(k).toEqual({ measuredKg: 0, estimateKg: 780, totalKg: 780 });
  });
  it("uses the measured cake when the day has an output", () => {
    const k = khaliStock([row("2026-11-12T05:00:00Z", 1000, "SHOP")], [{ date: "2026-11-12", cakeKg: 760 }]);
    expect(k).toEqual({ measuredKg: 760, estimateKg: 0, totalKg: 760 });
  });
  it("gives the shop only its share of a mixed day", () => {
    const k = khaliStock(
      [row("2026-11-12T05:00:00Z", 600, "SHOP"), row("2026-11-12T06:00:00Z", 400, "CUSTOMER")],
      [{ date: "2026-11-12", cakeKg: 750 }]
    );
    expect(k.measuredKg).toBe(450); // 750 x 600/1000
  });
  it("mixes measured and estimated days, and gives zero for customer-only days", () => {
    const k = khaliStock(
      [row("2026-11-11T05:00:00Z", 500, "SHOP"), row("2026-11-12T05:00:00Z", 1000, "SHOP"), row("2026-11-13T05:00:00Z", 300, "CUSTOMER")],
      [{ date: "2026-11-12", cakeKg: 760 }]
    );
    expect(k).toEqual({ measuredKg: 760, estimateKg: 390, totalKg: 1150 });
  });
});
