import { describe, expect, it } from "vitest";
import { dayTotals, entryCashEffect, systemCash, toClosingBuckets, type RegisterEntryLike } from "../register";

const e = (kind: RegisterEntryLike["kind"], amountInr: number, paymentMode: RegisterEntryLike["paymentMode"]) =>
  ({ id: kind + amountInr + paymentMode, date: "2026-11-17", kind, amountInr, paymentMode, createdAt: "2026-11-17T06:00:00Z", details: null }) as unknown as RegisterEntryLike;

describe("sale return in the cash book", () => {
  it("a cash refund takes cash out of the drawer; UPI and udhaar refunds do not", () => {
    expect(entryCashEffect(e("SALE_RETURN", 200, "CASH"))).toBe(-200);
    expect(entryCashEffect(e("SALE_RETURN", 200, "UPI"))).toBe(0);
    expect(entryCashEffect(e("SALE_RETURN", 200, "CREDIT"))).toBe(0);
  });
  it("day totals: udhaar return cuts credit given, not credit taken", () => {
    const t = dayTotals([e("SALE", 1000, "CREDIT"), e("SALE_RETURN", 300, "CREDIT")]);
    expect(t.creditGiven).toBe(700);
    expect(t.creditTaken).toBe(0);
  });
  it("Daily Closing buckets: sales cash is net of cash refunds and still adds up to system cash", () => {
    const rows = [e("SALE", 1000, "CASH"), e("SALE_RETURN", 250, "CASH"), e("SALE_RETURN", 100, "UPI")];
    const b = toClosingBuckets(500, rows, []);
    expect(b.cashInSales).toBe(750);
    const sum = b.cashInOpening + b.cashInSales + b.cashInOther - b.cashOutGrn - b.cashOutExpenses - b.cashOutSalary - b.cashOutUpi - b.cashOutDraw - b.cashOutOther;
    expect(sum).toBe(systemCash(500, rows, []));
  });
});
