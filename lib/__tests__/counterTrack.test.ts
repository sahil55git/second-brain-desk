import { describe, expect, it } from "vitest";
import { isTracked, defaultHandover, handoverOf, needsAttention, payStatus, trackOf, upiLine } from "../counterTrack";

describe("counter bill tracking", () => {
  it("cash bill is paid and nothing is held", () => {
    expect(payStatus({ CASH: 500 }, {})).toMatchObject({ state: "PAID", due: 0 });
    expect(needsAttention({ CASH: 500 }, {})).toBe(false);
    expect(defaultHandover({ CASH: 500 })).toBe("GIVEN");
  });
  it("UPI waits until it is checked, then is paid", () => {
    expect(payStatus({ UPI: 300 }, {})).toMatchObject({ state: "PENDING", due: 300, upiDue: 300 });
    expect(payStatus({ UPI: 300 }, { upiOk: { at: "t", by: "x" } })).toMatchObject({ state: "PAID", due: 0 });
    expect(defaultHandover({ UPI: 300 })).toBe("HELD");
  });
  it("udhaar is unpaid until collected", () => {
    expect(payStatus({ CREDIT: 800 }, {})).toMatchObject({ state: "UNPAID", due: 800, creditDue: 800 });
    expect(payStatus({ CREDIT: 800 }, { paidLater: { at: "t", by: "x", mode: "CASH", amount: 800 } }).state).toBe("PAID");
    expect(defaultHandover({ CREDIT: 800 })).toBe("GIVEN");
  });
  it("split bills are partly paid, and the due amount is only the open part", () => {
    expect(payStatus({ CASH: 200, CREDIT: 300 }, {})).toMatchObject({ state: "PARTLY", due: 300 });
    expect(payStatus({ CASH: 100, UPI: 400 }, {})).toMatchObject({ state: "PENDING", due: 400 });
    expect(payStatus({ UPI: 100, CREDIT: 400 }, { upiOk: { at: "t", by: "x" } })).toMatchObject({ state: "PARTLY", due: 400 });
  });
  it("held goods or open money needs attention; old bills count as given", () => {
    expect(handoverOf({})).toBe("GIVEN");
    expect(needsAttention({ CASH: 100 }, { handover: "HELD" })).toBe(true);
    expect(needsAttention({ UPI: 100 }, { handover: "GIVEN" })).toBe(true);
    expect(needsAttention({ UPI: 100 }, { handover: "GIVEN", upiOk: { at: "t", by: "x" } })).toBe(false);
  });
  it("old bills without a mark are not tracked", () => {
    expect(isTracked({})).toBe(false);
    expect(isTracked({ handover: "GIVEN" })).toBe(true);
  });
  it("ignores broken saved data", () => {
    expect(trackOf(null)).toEqual({});
    expect(trackOf({ track: "x" })).toEqual({});
    expect(trackOf({ track: { handover: "MAYBE", paidLater: { at: "t", amount: "abc" } } })).toEqual({});
    expect(trackOf({ track: { handover: "HELD", upiOk: { at: "t", by: "Ravi" } } })).toEqual({ handover: "HELD", upiOk: { at: "t", by: "Ravi" } });
  });
});

describe("UPI payment details on a bill", () => {
  it("are read back from what was saved, and junk is dropped", () => {
    const t = trackOf({ track: { handover: "HELD", upiOk: { at: "2026-11-18T05:00:00Z", by: "Ravi · auto", ref: " 432198765432 ", payer: "Anil", amount: 500, pkg: "com.phonepe.app", evId: "n1", evAt: 1763000000000, extra: 1 } } });
    expect(t.upiOk).toEqual({ at: "2026-11-18T05:00:00Z", by: "Ravi · auto", ref: "432198765432", payer: "Anil", amount: 500, pkg: "com.phonepe.app", evId: "n1", evAt: 1763000000000 });
    expect(trackOf({ track: { upiOk: { at: "x", by: "me", amount: -4, ref: 5, evAt: "no" } } }).upiOk).toEqual({ at: "x", by: "me" });
  });
  it("one line for the bill list and the register", () => {
    expect(upiLine({ at: "x", by: "y", amount: 500, payer: "Anil", ref: "432198765432" })).toBe("UPI ₹500 · Anil · Ref 432198765432");
    expect(upiLine({ at: "x", by: "y", amount: 260.5 })).toBe("UPI ₹260.50");
    expect(upiLine({ at: "x", by: "y" })).toBe("");
    expect(upiLine(undefined)).toBe("");
  });
});
