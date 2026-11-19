import { describe, expect, it } from "vitest";
import { billMatches, billToLines, billsSummary, groupBills, isBillPending, type SaleRow } from "../counterRecords";

const row = (p: Partial<SaleRow>): SaleRow => ({
  id: "x", date: "2026-11-16", kind: "SALE", item: "karadi", itemLabel: null, qty: null, unit: null, rateInr: null,
  amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdByName: "Ravi", createdAt: "2026-11-16T10:00:00Z", ...p,
});
const lab = (i: string | null, l: string | null) => l || (i === "karadi" ? "Karadi" : i === "sunflower" ? "Sunflower" : i || "?");

describe("counter records", () => {
  it("puts a multi-item split bill back together", () => {
    const rows = [
      row({ id: "aaa111", item: "karadi", qty: 1.8, unit: "kg", rateInr: 260, amountInr: 400, paymentMode: "CASH", details: { split: { id: "bl_1", i: 1, n: 3 }, bill: { line: 1, lines: 2 } } }),
      row({ id: "aaa112", item: "karadi", amountInr: 68, paymentMode: "UPI", details: { split: { id: "bl_1", i: 2, n: 3 }, bill: { line: 1, lines: 2 } } }),
      row({ id: "aaa113", item: "sunflower", qty: 0.95, unit: "kg", rateInr: 165, amountInr: 156.75, paymentMode: "UPI", details: { split: { id: "bl_1", i: 3, n: 3 }, bill: { line: 2, lines: 2 } } }),
      row({ id: "bbb222", item: "karadi", qty: 1, unit: "kg", rateInr: 260, amountInr: 260, createdAt: "2026-11-16T11:00:00Z" }),
      row({ id: "ccc333", kind: "EXPENSE", amountInr: 50 }),
    ];
    const bills = groupBills(rows, lab);
    expect(bills.map((b) => b.no)).toEqual(["BBB222", "AAA111"]);
    const b = bills[1];
    expect(b.ids).toHaveLength(3);
    expect(b.total).toBe(624.75);
    expect(b.modes).toEqual({ CASH: 400, UPI: 224.75 });
    expect(b.lines).toEqual([
      { item: "karadi", label: "Karadi", qty: 1.8, unit: "kg", rate: 260, amount: 468 },
      { item: "sunflower", label: "Sunflower", qty: 0.95, unit: "kg", rate: 165, amount: 156.75 },
    ]);
    expect(billsSummary(bills)).toEqual({ count: 2, total: 884.75, kg: 3.75, modes: { CASH: 660, UPI: 224.75 } });
    expect(billToLines(b)[1]).toMatchObject({ item: "sunflower", qty: 0.95, rate: 165, source: "typed" });
  });
  it("counts bills that are not paid yet as PENDING, not as cash", () => {
    const paid = groupBills([row({ id: "p1", amountInr: 500, details: { billNo: 1, track: { handover: "GIVEN" } } })], lab);
    const open = groupBills([row({ id: "p2", amountInr: 260, details: { billNo: 2, track: { handover: "HELD", cashWait: true, payPending: true } } })], lab);
    expect(isBillPending(paid[0])).toBe(false);
    expect(isBillPending(open[0])).toBe(true);
    expect(billsSummary([...paid, ...open])).toEqual({ count: 2, total: 760, kg: 0, modes: { CASH: 500, PENDING: 260 } });
  });
  it("finds bills by number, name, item or amount", () => {
    const [b] = groupBills([row({ id: "zz9xy1", partyName: "Ramesh", qty: 1, unit: "kg", rateInr: 260, amountInr: 260 })], lab);
    expect(billMatches(b, "9xy1")).toBe(true);
    expect(billMatches(b, "ramesh karadi")).toBe(true);
    expect(billMatches(b, "260")).toBe(true);
    expect(billMatches(b, "sunflower")).toBe(false);
  });
  it("uses the counter's plain bill number when there is one", () => {
    const [b] = groupBills([row({ id: "qq1", amountInr: 10, details: { billNo: 42 } })], lab);
    expect(b.no).toBe("42");
    expect(billMatches(b, "42")).toBe(true);
  });
});
