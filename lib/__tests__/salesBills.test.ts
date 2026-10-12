import { describe, expect, it } from "vitest";
import { billTotals, filterBills, groupBills, hourBuckets, istHour, type SaleRow } from "../salesBills";

const row = (o: Partial<SaleRow> & { id: string }): SaleRow => ({
  kind: "SALE", amountInr: 100, paymentMode: "CASH", createdAt: "2026-10-12T05:00:00Z", ...o,
});
const name = (r: SaleRow) => r.item || "item";

describe("salesBills", () => {
  it("computes IST hour", () => {
    expect(istHour("2026-10-12T05:00:00Z")).toBe(10);
    expect(istHour("2026-10-12T18:40:00Z")).toBe(0);
  });
  it("joins split rows into one bill with paid + pending", () => {
    const sp = (i: number) => ({ split: { id: "s1", i, n: 2 } });
    const bills = groupBills([
      row({ id: "a", amountInr: 300, paymentMode: "CASH", partyName: "Ravi", item: "sunflower", qty: 5, unit: "kg", details: sp(1) }),
      row({ id: "b", amountInr: 200, paymentMode: "CREDIT", partyName: "Ravi", item: "sunflower", details: sp(2) }),
    ], name);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ total: 500, paid: 300, pending: 200, status: "part", party: "Ravi" });
    expect(bills[0].items).toHaveLength(1);
    expect(bills[0].items[0].qty).toBe(5);
  });
  it("keeps multi-item bill lines apart", () => {
    const d = (line: number) => ({ split: { id: "bl_1", i: 1, n: 1 }, bill: { line, lines: 2 } });
    const bills = groupBills([
      row({ id: "a", amountInr: 100, item: "x", details: d(1) }),
      row({ id: "b", amountInr: 50, item: "y", details: d(2) }),
    ], name);
    expect(bills[0].items.map((i) => i.name)).toEqual(["x", "y"]);
    expect(bills[0].status).toBe("paid");
  });
  it("ignores non-sales, flags full udhaar, filters by hour and status", () => {
    const bills = groupBills([
      row({ id: "a", kind: "EXPENSE" }),
      row({ id: "b", paymentMode: "CREDIT", partyName: "Sita" }),
      row({ id: "c", createdAt: "2026-10-12T08:00:00Z" }),
    ], name);
    expect(bills).toHaveLength(2);
    expect(filterBills(bills, "udhaar", null).map((b) => b.id)).toEqual(["b"]);
    expect(filterBills(bills, "paid", 13).map((b) => b.id)).toEqual(["c"]);
    expect(hourBuckets(bills)[10]).toBe(100);
    expect(billTotals(bills)).toEqual({ count: 2, total: 200, pending: 100 });
  });
});
