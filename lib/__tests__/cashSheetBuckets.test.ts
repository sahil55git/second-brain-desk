import { describe, expect, it } from "vitest";
import { systemCash, toClosingBuckets, type CashEvent, type RegisterEntryLike } from "../register";

const e = (kind: RegisterEntryLike["kind"], amountInr: number, paymentMode: RegisterEntryLike["paymentMode"] = "CASH"): RegisterEntryLike =>
  ({ kind, amountInr, paymentMode, createdAt: "2026-11-07T08:00:00Z" }) as RegisterEntryLike;

describe("cash sheet · line totals", () => {
  it("lines add up to the drawer cash the register already shows", () => {
    const entries = [e("SALE", 1000), e("SALE", 500, "UPI"), e("UDHAAR_IN", 200), e("PURCHASE", 300), e("EXPENSE", 50), e("PAYMENT", 120), e("OWNER_DRAW", 100)];
    const jw: CashEvent[] = [{ at: 1, amount: -60 } as CashEvent, { at: 2, amount: 40 } as CashEvent];
    const b = toClosingBuckets(400, entries, jw);
    const lines = b.cashInOpening + b.cashInSales + b.cashInOther - (b.cashOutGrn + b.cashOutExpenses + b.cashOutSalary + b.cashOutDraw + b.cashOutOther + b.cashOutUpi);
    expect(lines).toBe(systemCash(400, entries, jw));
    expect(b.cashInSales).toBe(1000); // the UPI sale is not drawer cash
  });
});
