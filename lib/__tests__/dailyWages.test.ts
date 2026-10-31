import { describe, expect, it } from "vitest";
import { cleanDays, dailyMonth, daysText, validateEntry, validateWages, wageAmount } from "../employeeLedger";

describe("daily wages", () => {
  it("days are counted in half days", () => {
    expect(cleanDays(1)).toBe(1);
    expect(cleanDays("0.5")).toBe(0.5);
    expect(cleanDays(1.3)).toBe(1.5);
    expect(cleanDays(0)).toBeNull();
    expect(cleanDays(40)).toBeNull();
    expect(daysText(1)).toBe("1 day");
    expect(daysText(0.5)).toBe("½ day");
    expect(daysText(2.5)).toBe("2½ days");
    expect(wageAmount(1.5, 600)).toBe(900);
  });

  it("checks one day's wages: absent people are left out, a missing wage is refused", () => {
    const v = validateWages({ date: "2026-10-30", rows: [{ employeeId: "a", days: 1, rateInr: 600, paidNow: true }, { employeeId: "b", days: 0, rateInr: 500 }, { employeeId: "c", days: 0.5, rateInr: "550", mode: "UPI" }] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rows.map((r) => [r.employeeId, r.amountInr, r.paidNow, r.mode])).toEqual([["a", 600, true, "CASH"], ["c", 275, false, "UPI"]]);
    expect(validateWages({ date: "2026-10-30", rows: [{ employeeId: "a", days: 1, rateInr: 0 }] }).ok).toBe(false);
    expect(validateWages({ date: "bad", rows: [{ employeeId: "a", days: 1, rateInr: 600 }] }).ok).toBe(false);
    expect(validateWages({ date: "2026-10-30", rows: [{ employeeId: "b", days: 0, rateInr: 600 }] }).ok).toBe(false);
  });

  it("the same person twice in one save counts once", () => {
    const v = validateWages({ date: "2026-10-30", rows: [{ employeeId: "a", days: 1, rateInr: 600 }, { employeeId: "a", days: 1, rateInr: 600 }] });
    expect(v.ok && v.rows.length).toBe(1);
  });

  it("a wage line is earned money (credit) and can be typed by hand too", () => {
    const v = validateEntry({ type: "WAGE", amountInr: 600 });
    expect(v).toMatchObject({ ok: true, creditInr: 600, debitInr: 0, mode: null });
  });

  it("adds up a month of wage days", () => {
    const lines = [
      { type: "WAGE", month: "2026-10", days: 1, creditInr: 600 },
      { type: "WAGE", month: "2026-10", days: 0.5, creditInr: 300 },
      { type: "PAY", month: "2026-10", days: null, creditInr: 0 },
      { type: "WAGE", month: "2026-09", days: 1, creditInr: 600 },
    ];
    expect(dailyMonth(lines, "2026-10")).toEqual({ days: 1.5, earnedInr: 900 });
  });
});
