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
