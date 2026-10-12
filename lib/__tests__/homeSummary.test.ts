import { describe, expect, it } from "vitest";
import { homeSummary, istHour } from "../homeSummary";
import type { BizData } from "../bizReports";

const NOW = Date.parse("2026-10-12T13:30:00Z"); // 7 pm IST, Monday
const reg = (date: string, hourIst: number, amountInr: number, kind = "SALE", paymentMode = "CASH") => ({
  id: `${date}-${hourIst}-${amountInr}`,
  date,
  kind,
  item: "sunflower",
  itemLabel: null,
  qty: 5,
  unit: "kg",
  rateInr: null,
  amountInr,
  paymentMode,
  partyName: "Ramesh",
  notes: null,
  createdAt: new Date(Date.parse(`${date}T00:00:00Z`) + hourIst * 3600000 - 5.5 * 3600000).toISOString(),
});
const base = (register: ReturnType<typeof reg>[]): BizData =>
  ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [], refunds: [], adjustments: [] }) as unknown as BizData;

describe("homeSummary", () => {
  it("reads the hour in India time", () => {
    expect(istHour("2026-10-12T12:30:00Z")).toBe(18);
  });

  it("totals today's sales, compares with the same weekday last week, and finds the peak hour", () => {
    const s = homeSummary(
      base([reg("2026-10-12", 10, 1000), reg("2026-10-12", 18, 3000), reg("2026-10-12", 18, 1000, "SALE", "UPI"), reg("2026-10-05", 11, 4000), reg("2026-10-12", 12, 500, "EXPENSE")]),
      NOW
    );
    expect(s.soldToday).toBe(5000);
    expect(s.soldLastWeekSameDay).toBe(4000);
    expect(s.changePct).toBe(25);
    expect(s.peakHour).toBe(18);
    expect(s.byHour.find((b) => b.hour === 18)?.value).toBe(4000);
    expect(s.cashInToday).toBe(4000);
    expect(s.upiInToday).toBe(1000);
    expect(s.spentToday).toBe(500);
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toMatchObject({ date: "2026-10-12", label: "Mon", total: 5000 });
  });

  it("has no % change when last week had no sales", () => {
    expect(homeSummary(base([reg("2026-10-12", 10, 1000)]), NOW).changePct).toBeNull();
  });

  it("lists job-work waiting newest first, aged by business date", () => {
    const jw = (id: string, created: string, settled = false) => ({ id, customer: id, vehicleNo: null, seedKg: 100, cakeOwnership: "SHOP", advanceCustomerInr: 0, advanceAutoInr: 0, cans: null, notes: null, settled, settlementCustomerInr: null, settlementAutoInr: null, settlementRatePerKg: null, settlementAmountInr: null, settledAt: null, createdAt: created, updatedAt: created });
    const d = { ...base([]), jobWork: [jw("old", "2026-10-09T05:00:00Z"), jw("new", "2026-10-12T04:00:00Z"), jw("done", "2026-10-10T05:00:00Z", true)] } as unknown as BizData;
    const s = homeSummary(d, NOW);
    expect(s.jobWork.waiting).toBe(2);
    expect(s.jobWork.waitingKg).toBe(200);
    expect(s.jobWork.list.map((j) => [j.customer, j.ageDays])).toEqual([["new", 0], ["old", 3]]);
  });
});
