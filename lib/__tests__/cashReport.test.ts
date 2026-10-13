import { describe, expect, it } from "vitest";
import { buildChecklist, cashSummary, countedTotal, logAmount, logWhat } from "../cashReport";
import { extrasDelta, extrasTyped, normalizeExtraLine, withUpiTaken, MEMO_LINES, type AppLine, type MemoLine, type MemoRow } from "../memoTotals";

const blank = (): AppLine => ({ amount: 0, cash: 0, upi: 0, phonepe: 0, credit: 0, qty: 0 });
const app = () => Object.fromEntries(MEMO_LINES.map((l) => [l, blank()])) as Record<MemoLine, AppLine>;
const buckets = { cashInOpening: 1000, cashInSales: 860, cashInOther: 0, cashOutGrn: 0, cashOutExpenses: 100, cashOutOther: 0, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 0 };

describe("extras", () => {
  it("normalizes opening / other in / owner withdraw lines", () => {
    expect(normalizeExtraLine({ line: "OPENING", amountInr: "500.456" })).toEqual({ line: "OPENING", amountInr: 500.46 });
    expect(normalizeExtraLine({ line: "SALE", amountInr: 5 })).toBeNull();
    expect(normalizeExtraLine({ line: "OWNER_DRAW", amountInr: -1 })).toBeNull();
  });
  it("typed opening replaces the app opening, other in adds, withdraw subtracts", () => {
    expect(extrasDelta({ opening: null, otherIn: 0, ownerDraw: 0 }, 1000)).toBe(0);
    expect(extrasDelta({ opening: 1500, otherIn: 200, ownerDraw: 300 }, 1000)).toBe(400);
    expect(extrasTyped({ opening: null, otherIn: 0, ownerDraw: 0 })).toBe(false);
    expect(extrasTyped({ opening: 0, otherIn: 0, ownerDraw: 0 })).toBe(true);
  });
});

describe("withUpiTaken", () => {
  const sale: MemoRow = { line: "SALE", amountInr: 48200, cashInr: 48200, qty: null, unit: null };
  const exp: MemoRow = { line: "EXPENSE", amountInr: 100, cashInr: 100, qty: null, unit: null };
  it("takes typed UPI off the Sales cash only", () => {
    const r = withUpiTaken([sale, exp], 12000);
    expect(r[0].cashInr).toBe(36200);
    expect(r[1].cashInr).toBe(100);
  });
  it("never goes below zero and ignores zero UPI", () => {
    expect(withUpiTaken([sale], 99999)[0].cashInr).toBe(0);
    expect(withUpiTaken([sale], 0)[0].cashInr).toBe(48200);
  });
});

describe("cashSummary", () => {
  it("adds up cash in and out to the expected cash", () => {
    const s = cashSummary(buckets, { opening: null, otherIn: 0, ownerDraw: 0 }, []);
    expect(s.totalIn).toBe(1860);
    expect(s.totalOut).toBe(100);
    expect(s.expected).toBe(1760);
  });
  it("uses typed extras and the memo change", () => {
    const s = cashSummary(buckets, { opening: 2000, otherIn: 300, ownerDraw: 500 }, [{ line: "EXPENSE", delta: -50 }]);
    expect(s.expected).toBe(2000 + 860 + 300 - 100 - 500 - 50);
    expect(cashSummary(buckets, { opening: null, otherIn: 0, ownerDraw: 0 }, [{ line: "SALE", delta: 70 }]).expected).toBe(1830);
  });
});

describe("cashSummary with memo lines (the user's real numbers)", () => {
  it("shows each memo line on its own side and reaches the same expected cash", () => {
    const b = { cashInOpening: 0, cashInSales: 0, cashInOther: 0, cashOutGrn: 0, cashOutExpenses: 0, cashOutOther: 0, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 10900 };
    // memo: Sales 29,201 less UPI 6,438 = 22,763 cash; Expense 560; Job-work 3,438; Salary 200; opening typed 7,036
    const s = cashSummary(b, { opening: 7036, otherIn: 0, ownerDraw: 0 }, [{ line: "SALE", delta: 22763 }, { line: "EXPENSE", delta: -560 }, { line: "JOBWORK", delta: -3438 }, { line: "SALARY", delta: -200 }]);
    expect(s.totalIn).toBe(7036 + 22763);
    expect(s.totalOut).toBe(560 + 3438 + 200 + 10900);
    expect(s.expected).toBe(14701);
    expect(s.outRows.map((r) => r.label)).toContain("Expense (memo sheet)");
  });
});

describe("countedTotal", () => {
  it("a typed total bypasses the notes", () => {
    expect(countedTotal("12,500", 900)).toEqual({ counted: 12500, usingDirect: true });
    expect(countedTotal("", 900)).toEqual({ counted: 900, usingDirect: false });
    expect(countedTotal("abc", 900).usingDirect).toBe(false);
    expect(countedTotal(0, 900).usingDirect).toBe(false);
  });
});

describe("buildChecklist", () => {
  const base = { app: app(), memo: [] as MemoRow[], upi: {}, extras: { opening: null, otherIn: 0, ownerDraw: 0 }, appUpi: { gpay: 4200, phonepe: 0 }, counted: 0, scaleKept: false, handoverSaved: false };
  it("flags what is missing", () => {
    const a = app();
    a.SALE.amount = 6560;
    const memo: MemoRow[] = [{ line: "SALE", amountInr: 48200, cashInr: 48200, qty: null, unit: null }];
    const c = buildChecklist({ ...base, app: a, memo, upi: { UPI_GPAY: { amountInr: 6000 } } });
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by.SALE.status).toBe("miss");
    expect(by.SALE.note).toContain("₹41,640 not entered");
    expect(by.UPI_GPAY.status).toBe("miss");
    expect(by.UPI_PHONEPE.status).toBe("none");
    expect(by.COUNT.status).toBe("miss");
    expect(by.SCALE.status).toBe("miss");
    expect(by.HANDOVER.status).toBe("miss");
    expect(by.PURCHASE.status).toBe("none");
  });
  it("ticks everything once entered", () => {
    const c = buildChecklist({ ...base, counted: 5000, scaleKept: true, handoverSaved: true });
    expect(c.filter((x) => x.status === "miss")).toHaveLength(0);
  });
});

describe("log text", () => {
  it("describes saves, changes and removals", () => {
    expect(logWhat({ line: "SALE", action: "SAVE", session: null })).toBe("Sales memo total");
    expect(logWhat({ line: "OWNER_DRAW", action: "DELETE", session: null })).toBe("Removed Owner withdraw");
    expect(logWhat({ line: "COUNT", action: "SAVE", session: "NIGHT" })).toBe("Cash counted (Tally 2)");
    expect(logAmount({ amountInr: 1200, prevInr: 1000, action: "SAVE" })).toBe("₹1,000 → ₹1,200");
    expect(logAmount({ amountInr: 1200, prevInr: null, action: "SAVE" })).toBe("₹1,200");
    expect(logAmount({ amountInr: null, prevInr: 800, action: "DELETE" })).toBe("was ₹800");
  });
});

describe("server maths end to end (screenshot numbers)", () => {
  it("memo + UPI + typed opening + app owner draw gives 14,701 and a 319 gap against 15,020", async () => {
    const { memoAdjustedCash, extrasDelta } = await import("../memoTotals");
    const a = app();
    const memo: MemoRow[] = [
      { line: "SALE", amountInr: 29201, cashInr: 29201, qty: null, unit: null },
      { line: "EXPENSE", amountInr: 560, cashInr: 560, qty: null, unit: null },
      { line: "JOBWORK", amountInr: 3438, cashInr: 3438, qty: null, unit: null },
      { line: "SALARY", amountInr: 200, cashInr: 200, qty: null, unit: null },
    ];
    const appSystemCash = 0 - 10900; // app opening 0, owner draw 10,900
    const adjusted = memoAdjustedCash(appSystemCash, a, withUpiTaken(memo, 6438)) + extrasDelta({ opening: 7036, otherIn: 0, ownerDraw: 0 }, 0);
    expect(adjusted).toBe(14701);
    expect(15020 - adjusted).toBe(319);
  });
});
