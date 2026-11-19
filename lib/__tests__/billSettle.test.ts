import { describe, expect, it } from "vitest";
import { planSettle } from "../billSettle";

const rows = [
  { id: "a", amountInr: 260, paymentMode: "CASH", line: 1 },
  { id: "b", amountInr: 400, paymentMode: "CASH", line: 2 },
  { id: "c", amountInr: 120, paymentMode: "CASH", line: 3 },
];
describe("planSettle", () => {
  it("one mode changes every row and adds none", () => {
    const r = planSettle(rows, [{ mode: "UPI", amount: 780 }]);
    expect(r.ok && r.items.map((x) => [x.id, x.paymentMode, x.amountInr])).toEqual([["a", "UPI", 260], ["b", "UPI", 400], ["c", "UPI", 120]]);
  });
  it("a split adds rows and keeps the total", () => {
    const r = planSettle(rows, [{ mode: "CASH", amount: 500 }, { mode: "UPI", amount: 280 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.reduce((a, x) => a + x.amountInr, 0)).toBe(780);
    expect(r.items.filter((x) => x.id === null).every((x) => ["a", "b", "c"].includes(x.copyOf))).toBe(true);
    expect(r.items.map((x) => x.i)).toEqual(r.items.map((_, i) => i + 1));
    expect(r.items.filter((x) => x.id).length).toBe(3);
  });
  it("refuses parts that do not add up, repeats, unknown modes and bills that are already settled", () => {
    expect(planSettle(rows, [{ mode: "CASH", amount: 700 }]).ok).toBe(false);
    expect(planSettle(rows, [{ mode: "CASH", amount: 400 }, { mode: "CASH", amount: 380 }]).ok).toBe(false);
    expect(planSettle(rows, [{ mode: "CARD", amount: 780 }]).ok).toBe(false);
    expect(planSettle([{ id: "x", amountInr: 100, paymentMode: "UPI" }], [{ mode: "CASH", amount: 100 }]).ok).toBe(false);
  });
  it("a single-row bill can be split into two rows", () => {
    const r = planSettle([{ id: "z", amountInr: 1000, paymentMode: "CASH" }], [{ mode: "CASH", amount: 300 }, { mode: "CREDIT", amount: 700 }]);
    expect(r.ok && r.items.map((x) => [x.id, x.paymentMode, x.amountInr])).toEqual([["z", "CASH", 300], [null, "CREDIT", 700]]);
  });
});
