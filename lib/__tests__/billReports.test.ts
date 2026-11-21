import { describe, expect, it } from "vitest";
import { cancelledBills, customerWise, dayWise, discountBills, discountOf, heldBills, hourWise, itemWise, pendingBills, presetRange, staffWise, totals, udhaarDue } from "../billReports";
import type { SavedBill } from "../counterRecords";

const mk = (o: Partial<SavedBill> & { no: string }): SavedBill => ({
  key: o.no, ids: [o.no], firstId: o.no, date: "2026-11-21", createdAt: "2026-11-21T06:30:00.000Z", party: null, by: "Ravi", notes: null, custNote: "",
  total: 100, modes: { CASH: 100 }, lines: [{ item: "karadi", label: "Karadi", qty: 0.5, unit: "kg", rate: 200, amount: 100 }],
  track: { handover: "GIVEN" } as SavedBill["track"], ...o,
});

describe("bill reports", () => {
  const bills = [
    mk({ no: "1", total: 100 }),
    mk({ no: "2", total: 270, date: "2026-11-20", by: "Anil", party: "Suresh", modes: { CREDIT: 270 }, notes: "Item discount ₹10 · Discount ₹20", lines: [{ item: "sun", label: "Sunflower", qty: 1.5, unit: "kg", rate: 200, amount: 270 }] }),
    mk({ no: "3", total: 80, modes: { CASH: 80 }, track: { handover: "HELD", payPending: true, cashWait: true } as SavedBill["track"], createdAt: "2026-11-21T04:00:00.000Z" }),
  ];
  it("parses item and bill discount from the notes", () => {
    expect(discountOf({ notes: "Item discount ₹10 · Discount ₹20" })).toEqual({ item: 10, bill: 20, total: 30 });
    expect(discountOf({ notes: "Discount ₹5" })).toEqual({ item: 0, bill: 5, total: 5 });
    expect(discountOf({ notes: "Item discount ₹7" })).toEqual({ item: 7, bill: 0, total: 7 });
    expect(discountOf({ notes: null }).total).toBe(0);
  });
  it("totals: sales, avg, pending, held", () => {
    const t = totals(bills);
    expect(t.bills).toBe(3);
    expect(t.sales).toBe(450);
    expect(t.discount).toBe(30);
    expect(t.pending).toBe(350); // udhaar 270 + pay-pending 80
    expect(t.held).toBe(1);
    expect(t.modes.PENDING).toBe(80);
  });
  it("day-wise is newest first", () => {
    expect(dayWise(bills).map((d) => [d.date, d.bills, d.total])).toEqual([["2026-11-21", 2, 180], ["2026-11-20", 1, 270]]);
  });
  it("item-wise: biggest first with share", () => {
    const r = itemWise(bills);
    expect(r[0].label).toBe("Sunflower");
    expect(r.find((x) => x.label === "Karadi")!.bills).toBe(2);
    expect(Math.round(r.reduce((a, x) => a + x.share, 0))).toBe(100);
  });
  it("discount, pending, held, udhaar lists", () => {
    expect(discountBills(bills).map((d) => d.bill.no)).toEqual(["2"]);
    const now = new Date("2026-11-21T08:00:00.000Z").getTime();
    expect(pendingBills(bills, now).map((p) => p.bill.no)).toEqual(["3", "2"]);
    expect(heldBills(bills, now)[0].blocked).toBe(80);
    expect(udhaarDue(bills)).toEqual([{ name: "Suresh", bills: 1, due: 270 }]);
  });
  it("staff, customers, hours", () => {
    expect(staffWise(bills).map((s) => s.name)).toEqual(["Anil", "Ravi"]);
    expect(customerWise(bills).find((c) => c.name === "Walk-in")!.bills).toBe(2);
    expect(hourWise(bills).map((h) => h.hour)).toEqual([9, 12]); // 04:00Z = 9:30 IST, 06:30Z = 12:00 IST
  });
  it("cancelled bills from the activity log, edits kept apart", () => {
    const rows = [
      { id: "a", at: "2026-11-21T07:00:00Z", by: "Ravi", action: "DELETE", entity: "RegisterEntry", summary: "SALE Rs 1,204.5 Suresh of 2026-11-21 — Counter bill #41: wrong item" },
      { id: "b", at: "2026-11-21T07:05:00Z", by: "Ravi", action: "DELETE", entity: "RegisterEntry", summary: "SALE Rs 90 of 2026-11-21 — Counter bill #42: edited at the counter, replaced by bill #43" },
      { id: "c", at: "2026-11-21T07:06:00Z", by: "Ravi", action: "DELETE", entity: "RegisterEntry", summary: "EXPENSE Rs 50 of 2026-11-21" },
      { id: "d", at: "2026-11-21T07:07:00Z", by: "Ravi", action: "CREATE", entity: "RegisterEntry", summary: "SALE Rs 10" },
    ];
    const c = cancelledBills(rows);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ bill: "41", amount: 1204.5, party: "Suresh", reason: "wrong item", edited: false });
    expect(c[1].edited).toBe(true);
  });
  it("date presets", () => {
    expect(presetRange("yesterday", "2026-11-21")).toEqual({ from: "2026-11-20", to: "2026-11-20" });
    expect(presetRange("7d", "2026-11-21")).toEqual({ from: "2026-11-15", to: "2026-11-21" });
    expect(presetRange("month", "2026-11-21")).toEqual({ from: "2026-11-01", to: "2026-11-21" });
    expect(presetRange("lastMonth", "2026-11-21")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("lastMonth", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
