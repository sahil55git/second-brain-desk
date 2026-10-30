import { describe, expect, it } from "vitest";
import { balanceOf, earnedForDays, ledgerCsv, payrollNet, recentMonths, validateEntry, validateReason, withRunning } from "../employeeLedger";

describe("employee ledger rules", () => {
  it("balance = earned − paid; negative is an advance", () => {
    expect(balanceOf([{ creditInr: 15000, debitInr: 0 }, { creditInr: 0, debitInr: 5000 }])).toBe(10000);
    expect(balanceOf([{ creditInr: 0, debitInr: 3000 }])).toBe(-3000);
  });
  it("running balance starts from the opening", () => {
    const r = withRunning([{ creditInr: 1000, debitInr: 0 }, { creditInr: 0, debitInr: 400 }], 200);
    expect(r.map((x) => x.balanceInr)).toEqual([1200, 800]);
  });
  it("salary is monthly ÷ 30 per day present", () => {
    expect(earnedForDays(15000, 30)).toBe(15000);
    expect(earnedForDays(15000, 15)).toBe(7500);
    expect(earnedForDays(15000, -4)).toBe(0);
  });
  it("month-end takes the advance off", () => {
    expect(payrollNet(15000, -4000)).toEqual({ net: 11000, advanceRecovered: 4000, carryForward: 0 });
    expect(payrollNet(15000, 0).net).toBe(15000);
  });
  it("an advance bigger than the month's salary carries forward", () => {
    expect(payrollNet(5000, -8000)).toEqual({ net: 0, advanceRecovered: 5000, carryForward: -3000 });
  });
  it("entry validation: side, mode and limits", () => {
    const adv = validateEntry({ type: "ADV", amountInr: 2000, mode: "UPI" });
    expect(adv).toMatchObject({ ok: true, debitInr: 2000, creditInr: 0, mode: "UPI" });
    const bonus = validateEntry({ type: "BONUS", amountInr: 500 });
    expect(bonus).toMatchObject({ ok: true, creditInr: 500, debitInr: 0, mode: null });
    expect(validateEntry({ type: "ADV", amountInr: 0 }).ok).toBe(false);
    expect(validateEntry({ type: "ADV", amountInr: 99_999_999 }).ok).toBe(false);
    expect(validateEntry({ type: "NOPE", amountInr: 5 }).ok).toBe(false);
    expect(validateEntry({ type: "ADV", amountInr: 5, date: "31/10" }).ok).toBe(false);
  });
  it("a change needs a reason", () => {
    expect(validateReason("  ").ok).toBe(false);
    expect(validateReason("typo").ok).toBe(true);
  });
  it("recent months run back across a year end", () => {
    expect(recentMonths("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
  it("csv escapes commas and quotes", () => {
    const c = ledgerCsv("Ram", "2026-10", 0, [{ date: "2026-10-05", type: "ADV", mode: "CASH", note: 'Diwali, "advance"', creditInr: 0, debitInr: 2000, balanceInr: -2000 }]);
    expect(c).toContain('"Diwali, ""advance"""');
  });
});
