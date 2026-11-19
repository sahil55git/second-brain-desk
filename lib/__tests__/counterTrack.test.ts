import { describe, expect, it } from "vitest";
import { isTracked, defaultHandover, handoverOf, needsAttention, oilBlockedAmount, payStatus, trackOf, upiLine } from "../counterTrack";

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

import { heldNeed, heldQueue, waitText } from "../counterTrack";
describe("hold bill for cash and the held queue", () => {
  it("cash is held only when the shop works that way", () => {
    expect(defaultHandover({ CASH: 500 })).toBe("GIVEN");
    expect(defaultHandover({ CASH: 500 }, true)).toBe("HELD");
    expect(defaultHandover({ CREDIT: 500 }, true)).toBe("GIVEN");
    expect(defaultHandover({ UPI: 500 })).toBe("HELD");
  });
  it("cash is due only on a bill that waits for it, until the counter confirms", () => {
    expect(payStatus({ CASH: 500 }, {}).state).toBe("PAID");
    const w = payStatus({ CASH: 500 }, { handover: "HELD", cashWait: true });
    expect(w).toMatchObject({ state: "PENDING", due: 500, cashDue: 500 });
    expect(payStatus({ CASH: 500 }, { handover: "HELD", cashWait: true, cashOk: { at: "x", by: "y" } }).state).toBe("PAID");
    expect(payStatus({ CASH: 200, UPI: 300 }, { handover: "HELD", cashWait: true })).toMatchObject({ due: 500, cashDue: 200, upiDue: 300 });
  });
  it("trackOf keeps cashWait and cashOk", () => {
    expect(trackOf({ track: { handover: "HELD", cashWait: true, cashOk: { at: "t", by: "Ravi" } } })).toEqual({ handover: "HELD", cashWait: true, cashOk: { at: "t", by: "Ravi" } });
    expect(trackOf({ track: { cashWait: "yes" } })).toEqual({});
  });
  it("what a held bill waits for", () => {
    expect(heldNeed({ CASH: 500 }, { handover: "HELD", cashWait: true })).toBe("CASH");
    expect(heldNeed({ UPI: 500 }, { handover: "HELD" })).toBe("UPI");
    expect(heldNeed({ CASH: 100, UPI: 400 }, { handover: "HELD", cashWait: true })).toBe("CASH+UPI");
    expect(heldNeed({ CASH: 500 }, { handover: "HELD", cashWait: true, cashOk: { at: "x", by: "y" } })).toBe("READY");
    expect(heldNeed({ CREDIT: 500 }, { handover: "HELD" })).toBe("READY");
  });
  it("queue: only held bills, waiting-for-money first, oldest first", () => {
    const b = (id: string, at: string, modes: Record<string, number>, track: object) => ({ id, createdAt: at, modes, track: track as never });
    const q = heldQueue([
      b("given", "2026-11-18T05:00:00Z", { CASH: 1 }, { handover: "GIVEN" }),
      b("ready", "2026-11-18T05:01:00Z", { UPI: 50 }, { handover: "HELD", upiOk: { at: "x", by: "y" } }),
      b("new", "2026-11-18T05:20:00Z", { CASH: 80 }, { handover: "HELD", cashWait: true }),
      b("old", "2026-11-18T05:10:00Z", { UPI: 90 }, { handover: "HELD" }),
      b("untracked", "2026-11-18T05:02:00Z", { CASH: 5 }, {}),
    ]);
    expect(q.map((x) => x.id)).toEqual(["old", "new", "ready"]);
  });
  it("wait text", () => {
    expect(waitText(20_000)).toBe("just now");
    expect(waitText(5 * 60_000)).toBe("5 min");
    expect(waitText(80 * 60_000)).toBe("1 h 20 min");
    expect(waitText(120 * 60_000)).toBe("2 h");
  });

  it("keeps the oil in until cash or UPI is received (udhaar does not block)", () => {
    expect(oilBlockedAmount({ CASH: 260 }, { handover: "HELD", cashWait: true })).toBe(260);
    expect(oilBlockedAmount({ CASH: 260 }, { handover: "HELD", cashWait: true, cashOk: { at: "t", by: "x" } })).toBe(0);
    expect(oilBlockedAmount({ CASH: 260 }, { handover: "HELD", cashWait: true, payPending: true })).toBe(260);
    expect(oilBlockedAmount({ UPI: 191 }, { handover: "HELD" })).toBe(191);
    expect(oilBlockedAmount({ UPI: 191 }, { handover: "HELD", upiOk: { at: "t", by: "x" } })).toBe(0);
    expect(oilBlockedAmount({ CASH: 100, UPI: 50 }, { handover: "HELD", cashWait: true, cashOk: { at: "t", by: "x" } })).toBe(50);
    expect(oilBlockedAmount({ CREDIT: 400 }, { handover: "HELD" })).toBe(0);
    expect(oilBlockedAmount({ CASH: 500 }, { handover: "HELD" })).toBe(0);
  });
});
