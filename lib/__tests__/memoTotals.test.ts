import { describe, expect, it } from "vitest";
import { appLines, memoAdjustedCash, normalizeMemoLine, notInApp } from "../memoTotals";

const e = (kind: string, amountInr: number, paymentMode = "CASH", extra: Record<string, unknown> = {}) => ({ kind, amountInr, paymentMode, createdAt: "2026-10-12T05:00:00Z", qty: null, ...extra }) as never;

describe("memo totals", () => {
  const entries = [e("SALE", 860), e("SALE", 4200, "UPI"), e("SALE", 1500, "OTHER", { details: { channel: "OWNER_PHONEPE" } }), e("EXPENSE", 100), e("PIGMEE", 500)];
  it("splits the app's own entries by line and channel", () => {
    const a = appLines(entries, []);
    expect(a.SALE).toMatchObject({ amount: 6560, cash: 860, upi: 4200, phonepe: 1500 });
    expect(a.EXPENSE.cash).toBe(100);
  });
  it("memo cash replaces the app's cash for that line only", () => {
    const a = appLines(entries, []);
    // app system cash: opening 0 + 860 - 100 - 500 pigmee = 260
    const adj = memoAdjustedCash(260, a, [{ line: "SALE", amountInr: 139857, cashInr: 100000, qty: null, unit: null }]);
    expect(adj).toBe(260 + (100000 - 860));
  });
  it("outflow lines subtract", () => {
    const a = appLines(entries, []);
    expect(memoAdjustedCash(260, a, [{ line: "EXPENSE", amountInr: 1850, cashInr: 1850, qty: null, unit: null }])).toBe(260 - (1850 - 100));
  });
  it("job-work payouts count as cash out", () => {
    const a = appLines([], [{ at: 1, amount: -6400, bucket: "jwOut" }]);
    expect(a.JOBWORK.cash).toBe(6400);
  });
  it("not-in-app is never negative", () => {
    expect(notInApp(1000, appLines(entries, []).SALE)).toBe(0);
    expect(notInApp(9000, appLines(entries, []).SALE)).toBe(2440);
  });
  it("cleans posted lines", () => {
    expect(normalizeMemoLine({ line: "SALE", amountInr: 100, cashInr: "" })).toMatchObject({ amountInr: 100, cashInr: 100 });
    expect(normalizeMemoLine({ line: "SALE", amountInr: 100, cashInr: 500 })?.cashInr).toBe(100);
    expect(normalizeMemoLine({ line: "NOPE", amountInr: 1 })).toBeNull();
    expect(normalizeMemoLine({ line: "SALE", amountInr: -5 })).toBeNull();
  });
});
