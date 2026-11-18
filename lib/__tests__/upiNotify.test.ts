import { describe, expect, it } from "vitest";
import { matchUpi, parseUpi } from "../upiNotify";

describe("parseUpi", () => {
  it("reads money received", () => {
    expect(parseUpi("PhonePe", "₹500 received from Ravi Kumar")).toEqual({ amount: 500, payer: "Ravi Kumar" });
    expect(parseUpi("Payment received", "Rs. 1,250.50 received from SURESH on UPI")).toEqual({ amount: 1250.5, payer: "SURESH" });
    expect(parseUpi("Google Pay", "Anil paid you ₹260")).toEqual({ amount: 260, payer: "Anil" });
    expect(parseUpi("₹75 credited", "Amount credited to your account")?.amount).toBe(75);
  });
  it("ignores money going out, requests and other text", () => {
    expect(parseUpi("You paid ₹300", "to Mahesh Store")).toBeNull();
    expect(parseUpi("PhonePe", "₹500 sent to Ravi")).toBeNull();
    expect(parseUpi("Payment request", "Ravi requested ₹500")).toBeNull();
    expect(parseUpi("Cashback", "You received a scratch card")).toBeNull();
    expect(parseUpi("Hello", "")).toBeNull();
  });
});

const at = 1_000_000_000_000;
describe("matchUpi", () => {
  const bill = (key: string, due: number, t = at) => ({ key, at: t, due });
  const ev = (id: string, amount: number, t = at + 60_000) => ({ id, at: t, amount, payer: "" });
  it("matches one payment to one bill", () => {
    expect(matchUpi([ev("e1", 500)], [bill("b1", 500)], new Set())).toEqual([{ eventId: "e1", billKey: "b1" }]);
  });
  it("accepts a payment a few minutes before the bill was saved, not long before", () => {
    expect(matchUpi([ev("e1", 500, at - 5 * 60_000)], [bill("b1", 500)], new Set())).toHaveLength(1);
    expect(matchUpi([ev("e1", 500, at - 30 * 60_000)], [bill("b1", 500)], new Set())).toHaveLength(0);
    expect(matchUpi([ev("e1", 500, at + 3 * 3600_000)], [bill("b1", 500)], new Set())).toHaveLength(0);
  });
  it("does not guess when two bills or two payments fit", () => {
    expect(matchUpi([ev("e1", 500)], [bill("b1", 500), bill("b2", 500)], new Set())).toEqual([]);
    expect(matchUpi([ev("e1", 500), ev("e2", 500)], [bill("b1", 500)], new Set())).toEqual([]);
  });
  it("different amounts match separately, and used payments are skipped", () => {
    expect(matchUpi([ev("e1", 500), ev("e2", 300)], [bill("b1", 500), bill("b2", 300)], new Set())).toHaveLength(2);
    expect(matchUpi([ev("e1", 500)], [bill("b1", 500)], new Set(["e1"]))).toEqual([]);
    expect(matchUpi([ev("e1", 499)], [bill("b1", 500)], new Set())).toEqual([]);
  });
});

import { billNoOf, planUpi, refOf, sameName, samePayment, type PendingBill, type UpiEvent } from "../upiNotify";

describe("reference and bill number in the notification", () => {
  it("reads a UTR / transaction id when the notification shows one", () => {
    expect(parseUpi("Payment received", "₹500 received from Ravi. UPI Ref No: 432198765432")?.ref).toBe("432198765432");
    expect(parseUpi("Paytm", "Received Rs.260 from Anil. Txn ID T2411181234567890")?.ref).toBe("T2411181234567890");
    expect(refOf("UTR 123456789012")).toBe("123456789012");
    expect(refOf("Reference number received")).toBeUndefined(); // no digit: not an id
    expect(parseUpi("PhonePe", "₹500 received from Ravi Kumar")?.ref).toBeUndefined();
  });
  it("reads the bill number typed in the payment note", () => {
    expect(billNoOf("Bill 12 · Oil")).toBe(12);
    expect(billNoOf("bill no. 345")).toBe(345);
    expect(billNoOf("Bill #7")).toBe(7);
    expect(billNoOf("billing office")).toBeUndefined();
    expect(parseUpi("PhonePe", "₹500 received from Ravi. Note: Bill 12")?.billNo).toBe(12);
  });
});

describe("names and repeated notifications", () => {
  it("matches the payer to the customer loosely", () => {
    expect(sameName("Anil Kumar", "anil")).toBe(true);
    expect(sameName("ANIL", "Anil Shetty")).toBe(true);
    expect(sameName("Ravi", "Anil")).toBe(false);
    expect(sameName("", "Anil")).toBe(false);
    expect(sameName("Anil", null)).toBe(false);
  });
  it("one payment shown twice counts once", () => {
    const a = { amount: 500, payer: "Anil", at: 1000 };
    expect(samePayment(a, { ...a, at: 40_000 })).toBe(true);
    expect(samePayment(a, { ...a, at: 400_000 })).toBe(false);
    expect(samePayment({ ...a, ref: "R1" }, { ...a, ref: "R2", at: 1500 })).toBe(false);
    expect(samePayment({ ...a, ref: "R1" }, { ...a, ref: "R1", at: 9_000_000 })).toBe(true);
  });
});

describe("planUpi: same amount on several bills", () => {
  const t0 = 1_000_000_000_000;
  const bill = (key: string, no: string, min: number, party?: string): PendingBill => ({ key, no, at: t0 + min * 60_000, due: 500, party: party ?? null });
  const pay = (id: string, min: number, extra: Partial<UpiEvent> = {}): UpiEvent => ({ id, at: t0 + min * 60_000, amount: 500, payer: "Someone", ...extra });

  it("one bill with that amount: matched by itself", () => {
    const p = planUpi([pay("e1", 5)], [bill("b1", "12", 0)], new Set());
    expect(p.auto).toEqual([{ eventId: "e1", billKey: "b1", how: "only bill" }]);
    expect(p.ask).toEqual([]);
  });
  it("two bills with the same amount: never guessed, the person is asked (oldest first)", () => {
    const p = planUpi([pay("e1", 10)], [bill("b2", "13", 6), bill("b1", "12", 0)], new Set());
    expect(p.auto).toEqual([]);
    expect(p.ask).toEqual([{ eventId: "e1", billKeys: ["b1", "b2"] }]);
  });
  it("the bill number in the note picks the right bill", () => {
    const p = planUpi([pay("e1", 10, { billNo: 13 })], [bill("b1", "12", 0), bill("b2", "13", 6)], new Set());
    expect(p.auto).toEqual([{ eventId: "e1", billKey: "b2", how: "bill no" }]);
  });
  it("the payer's name picks the bill when only one customer name fits", () => {
    const p = planUpi([pay("e1", 10, { payer: "Anil Kumar" })], [bill("b1", "12", 0, "Ramesh"), bill("b2", "13", 6, "Anil")], new Set());
    expect(p.auto).toEqual([{ eventId: "e1", billKey: "b2", how: "name" }]);
    // two bills for the same customer: still asked
    const q = planUpi([pay("e1", 10, { payer: "Anil" })], [bill("b1", "12", 0, "Anil"), bill("b2", "13", 6, "Anil")], new Set());
    expect(q.auto).toEqual([]);
    expect(q.ask[0].billKeys).toEqual(["b1", "b2"]);
  });
  it("two bills, two payments: a certain one is taken and the other bill is no longer a choice", () => {
    const p = planUpi([pay("e1", 10, { billNo: 12 }), pay("e2", 11)], [bill("b1", "12", 0), bill("b2", "13", 6)], new Set());
    expect(p.auto.map((a) => a.billKey)).toEqual(["b1", "b2"]);
    expect(p.ask).toEqual([]);
  });
  it("a payment already used is ignored; one outside the time window is ignored", () => {
    expect(planUpi([pay("e1", 5)], [bill("b1", "12", 0)], new Set(["e1"])).auto).toEqual([]);
    expect(planUpi([pay("e1", 200)], [bill("b1", "12", 0)], new Set()).auto).toEqual([]);
    expect(planUpi([pay("e1", -30)], [bill("b1", "12", 0)], new Set()).ask).toEqual([]);
  });
  it("two payments of the same amount for one bill are left for the person", () => {
    const p = planUpi([pay("e1", 5), pay("e2", 6)], [bill("b1", "12", 0)], new Set());
    expect(p.auto).toEqual([]);
    expect(p.ask).toEqual([]);
  });
});
