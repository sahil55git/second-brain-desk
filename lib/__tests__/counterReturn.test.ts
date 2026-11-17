import { describe, expect, it } from "vitest";
import { defaultRefundMode, refundFor, returnBody, returnables, returnedByBill } from "../counterReturn";
import type { SaleRow, SavedBill } from "../counterRecords";

const bill: SavedBill = {
  key: "k", ids: ["a"], firstId: "a", no: "12", date: "2026-11-17", createdAt: "2026-11-17T05:00:00Z", party: null, by: null, notes: null,
  total: 700, modes: { CASH: 700 }, track: {},
  lines: [
    { item: "karadi", label: "Karadi", qty: 2, unit: "kg", rate: 260, amount: 500 },
    { item: "karadi", label: "Karadi", qty: 1, unit: "kg", rate: 260, amount: 200 }, // discounted: 3 kg for ₹700 → ₹233.33/kg
  ],
};
const ret = (item: string, qty: number | null, amountInr: number): SaleRow => ({ id: "r", date: "d", kind: "SALE_RETURN", item, itemLabel: null, qty, unit: "kg", rateInr: null, amountInr, paymentMode: "CASH", partyName: null, notes: null, createdByName: null, createdAt: "", details: { returnOf: 12 } });

describe("counter returns", () => {
  it("joins the same item and refunds what was really paid, pro-rata", () => {
    const [k] = returnables(bill);
    expect(k.soldQty).toBe(3);
    expect(k.soldNet).toBe(700);
    expect(refundFor(k, 1)).toBe(233.33);
  });
  it("the last of an item gets the exact rest, so refunds never exceed the bill", () => {
    const prior = returnedByBill([ret("karadi", 1, 233.33), ret("karadi", 1, 233.33)]).get("12");
    const [k] = returnables(bill, prior);
    expect(k.leftQty).toBe(1);
    expect(refundFor(k, 1)).toBe(233.34);
    expect(refundFor(k, 5)).toBe(233.34);
  });
  it("builds a one-line return as a single row and many lines as a bill", () => {
    const items = returnables(bill);
    const r = returnBody(bill, items, { karadi: 1 }, { date: "2026-11-17", mode: "CASH", reason: "leaking tin" });
    if ("err" in r) throw new Error(r.err);
    expect(r.body).toMatchObject({ kind: "SALE_RETURN", amountInr: 233.33, qty: 1, returnOf: 12, paymentMode: "CASH" });
    expect(r.body.lines).toBeUndefined();
    expect(r.body.notes).toBe("Return of bill #12 · leaking tin");
  });
  it("refuses udhaar without a name, more than is left, and an empty pick", () => {
    const items = returnables(bill);
    expect("err" in returnBody(bill, items, { karadi: 1 }, { date: "d", mode: "CREDIT" })).toBe(true);
    expect("err" in returnBody(bill, items, { karadi: 4 }, { date: "d", mode: "CASH" })).toBe(true);
    expect("err" in returnBody(bill, items, {}, { date: "d", mode: "CASH" })).toBe(true);
  });
  it("refunds the way the bill was paid", () => {
    expect(defaultRefundMode({ ...bill, modes: { UPI: 500, CASH: 200 } })).toBe("UPI");
    expect(defaultRefundMode({ ...bill, modes: { CREDIT: 700 } })).toBe("CREDIT");
    expect(defaultRefundMode(bill)).toBe("CASH");
  });
});
