import { describe, expect, it } from "vitest";
import { entryCashEffect, isPayPendingEntry, systemCash, toClosingBuckets, type RegisterEntryLike } from "../register";

const sale = (amountInr: number, track?: Record<string, unknown>, paymentMode: RegisterEntryLike["paymentMode"] = "CASH"): RegisterEntryLike => ({
  kind: "SALE", amountInr, paymentMode, createdAt: "2026-11-19T10:00:00Z", details: track ? { track } : {},
});

describe("pay at the queue: a printed, unpaid bill is not cash in the drawer", () => {
  it("is recognised only while payPending is set", () => {
    expect(isPayPendingEntry(sale(500, { handover: "HELD", cashWait: true, payPending: true }))).toBe(true);
    expect(isPayPendingEntry(sale(500, { handover: "GIVEN" }))).toBe(false);
    expect(isPayPendingEntry(sale(500))).toBe(false);
    expect(isPayPendingEntry({ details: null })).toBe(false);
  });
  it("adds no cash while pending, the full amount once it is paid", () => {
    expect(entryCashEffect(sale(500, { handover: "HELD", cashWait: true, payPending: true }))).toBe(0);
    // after "Receive payment" (cash): payPending is gone, cashOk is set
    expect(entryCashEffect(sale(500, { handover: "GIVEN", cashWait: true, cashOk: { at: "x", by: "a" } }))).toBe(500);
  });
  it("the drawer total and the closing buckets leave pending bills out", () => {
    const rows = [
      sale(1000, { handover: "GIVEN" }),
      sale(750, { handover: "HELD", cashWait: true, payPending: true }),
      sale(200, { handover: "HELD", payPending: true }, "CASH"),
    ];
    expect(systemCash(100, rows, [])).toBe(1100);
    expect(toClosingBuckets(100, rows, []).cashInSales).toBe(1000);
  });
  it("other kinds and modes are untouched", () => {
    expect(entryCashEffect(sale(300, { handover: "GIVEN" }, "UPI"))).toBe(0);
    expect(entryCashEffect({ kind: "EXPENSE", amountInr: 80, paymentMode: "CASH", createdAt: "2026-11-19T10:00:00Z" })).toBe(-80);
  });
});
