import { describe, expect, it } from "vitest";
import { planRefund, refundAmount, remainingQty, type RefundSourceLine } from "../refunds";

const lines: RefundSourceLine[] = [
  { id: "a", name: "Ekatva 5 L", unit: "pouch", qty: 4, returnedQty: 1, lineTotalInr: 693 },
  { id: "b", name: "Rice Bran 1 L", unit: "pouch", qty: 10, returnedQty: 0, lineTotalInr: 1890 },
];

describe("refunds", () => {
  it("remaining quantity subtracts earlier returns", () => {
    expect(remainingQty(lines[0])).toBe(3);
    expect(remainingQty({ qty: 2, returnedQty: 5 })).toBe(0);
  });
  it("amount is pro-rated on the line total, GST included", () => {
    expect(refundAmount(lines[1], 4)).toBe(756);
    expect(refundAmount(lines[0], 3)).toBe(519.75);
  });
  it("a valid request returns a plan and total", () => {
    const r = planRefund({ reason: "Damaged", lines: [{ lineId: "a", qty: 2 }, { lineId: "b", qty: 1 }] }, lines);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalInr).toBe(346.5 + 189);
      expect(r.plan.map((p) => p.qty)).toEqual([2, 1]);
    }
  });
  it("refuses more than was sold, a missing reason, or no lines", () => {
    expect(planRefund({ reason: "Damaged", lines: [{ lineId: "a", qty: 4 }] }, lines)).toMatchObject({ ok: false });
    expect(planRefund({ reason: "Bad reason", lines: [{ lineId: "a", qty: 1 }] }, lines)).toMatchObject({ ok: false });
    expect(planRefund({ reason: "Other", lines: [] }, lines)).toMatchObject({ ok: false });
    expect(planRefund({ reason: "Other", lines: [{ lineId: "zzz", qty: 1 }] }, lines)).toMatchObject({ ok: false });
  });
});
