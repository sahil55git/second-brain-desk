import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { buyAdvice, shouldYield, weatherNote, whatIf, yoy, type LotObs } from "../intel";
import type { RunOut } from "../insights";
import type { MandiSignal } from "../mandi";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "SALE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[]): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [] });

describe("should-yield", () => {
  const obs: LotObs[] = [
    { supplier: "Ravi", product: "Karadi oil", oilPct: 30, moisturePct: 6, seedKg: 1000, date: "2026-10-01" },
    { supplier: "Ravi", product: "Karadi oil", oilPct: 31, moisturePct: 5, seedKg: 1000, date: "2026-10-05" },
    { supplier: "Mohan", product: "Karadi oil", oilPct: 27, moisturePct: 9, seedKg: 1000, date: "2026-10-06" },
    { supplier: "Mohan", product: "Karadi oil", oilPct: 28, moisturePct: 8, seedKg: 1000, date: "2026-10-07" },
  ];
  it("uses the supplier's own lots and adjusts for moisture", () => {
    const g = shouldYield(obs, { product: "karadi", supplier: "ravi" });
    expect(g.expectedPct).toBe(30.5);
    expect(g.basis).toContain("from ravi");
    const wet = shouldYield(obs, { product: "karadi", moisturePct: 9 });
    const dry = shouldYield(obs, { product: "karadi", moisturePct: 5 });
    expect(wet.expectedPct!).toBeLessThan(dry.expectedPct!);
  });
  it("gives a fair seed price", () => {
    const g = shouldYield(obs, { product: "karadi", supplier: "Ravi", oilRate: 200, cakeRate: 20, crushPerKg: 8 });
    expect(g.fairSeedRate).toBeCloseTo(0.305 * 200 + 0.675 * 20 - 0.305 * 8, 1);
  });
  it("says when there is no history", () => {
    expect(shouldYield([], { product: "mustard" }).expectedPct).toBeNull();
  });
});

describe("buy advisor", () => {
  const ro = (key: string, daysLeft: number | null): RunOut => ({ key, name: key, stockKg: 100, stockDate: null, perDay: 10, daysLeft, lastBuy: null, level: "ok" });
  const m: MandiSignal = { commodity: "Groundnut", latest: 6000, latestDate: "2026-11-01", markets: 3, change7Pct: -4, avg30: 6400, low30: 6000, high30: 6600, signal: "buy", say: "", series: [] };
  it("combines stock, mandi, season and cash", () => {
    const a = buyAdvice([ro("groundnut", 3), ro("mustard", 40)], [m], { month: 11 });
    expect(a[0]).toMatchObject({ key: "groundnut", action: "buy now" });
    expect(a[1].action).toBe("no need");
    const tight = buyAdvice([ro("groundnut", 12)], [m], { month: 11, cashLow: -5000 })[0];
    expect(tight.action).toBe("buy a little");
    expect(tight.reasons.join(" ")).toContain("cash forecast");
  });
});

describe("what-if, weather, yoy", () => {
  const d = data([reg({ kind: "SALE", amountInr: 10000, date: "2026-10-20" }), reg({ kind: "PURCHASE", amountInr: 7000, date: "2026-10-20" }), reg({ kind: "SALE", amountInr: 8000, date: "2025-10-20" })]);
  it("simulates price and cost changes", () => {
    const w = whatIf(d, "2026-11-01", { salesPct: 0, pricePct: 5, costPct: 10, expensePct: 0 });
    expect(w.base.net).toBe(3000);
    expect(w.net).toBe(10500 - 7700);
    expect(w.change).toBe(-200);
  });
  it("weather alert for harvest rain", () => {
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse("2026-10-26T00:00:00Z") + i * 86400000).toISOString().slice(0, 10));
    const w = weatherNote("Rajkot", ["groundnut"], { time: days, precipitation_sum: days.map((t) => (t > "2026-11-01" ? 12 : 0)), temperature_2m_max: days.map(() => 32) }, "2026-11-01", 11);
    expect(w.next7mm).toBe(84);
    expect(w.level).toBe("alert");
  });
  it("compares with last year", () => {
    const y = yoy(d, "2026-11-01");
    const oct = y.months.find((m) => m.month === "2026-10")!;
    expect(oct).toMatchObject({ sales: 10000, lastYear: 8000, changePct: 25 });
    expect(y.fyStart).toBe("2026-04-01");
  });
});
