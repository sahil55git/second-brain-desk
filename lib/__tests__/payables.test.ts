import { describe, expect, it } from "vitest";
import { daysBetween, payables, payStatus, type PayBill, type PayPayment } from "@/lib/payables";
import { khaliSummary, type KhaliEntry } from "@/lib/khaliSales";

const parties = [{ id: "p1", name: "Basava Traders" }, { id: "p2", name: "Raju Seeds" }];
const bill = (id: string, date: string, amountInr: number, partyId: string | null = "p1", partyName: string | null = null, source: "bill" | "register" = "bill"): PayBill => ({ id, source, ref: id, date, amountInr, partyId, partyName });
const pay = (id: string, date: string, amountInr: number, partyId: string | null = "p1", partyName: string | null = null): PayPayment => ({ id, date, amountInr, partyId, partyName });
const TODAY = "2026-11-30";

describe("days and status", () => {
  it("counts whole days between business dates", () => {
    expect(daysBetween("2026-11-20", "2026-11-30")).toBe(10);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-12-05", "2026-11-30")).toBe(0);
    expect(daysBetween("bad", "2026-11-30")).toBe(0);
  });
  it("up to 10 days fine, 11 to 20 due, past 20 late", () => {
    expect([0, 10, 11, 20, 21, 90].map(payStatus)).toEqual(["ok", "ok", "due", "due", "late", "late"]);
  });
});

describe("payables", () => {
  it("owes the credit purchases minus the supplier payments", () => {
    const s = payables([bill("b1", "2026-11-25", 50000), bill("b2", "2026-11-28", 30000)], [pay("x1", "2026-11-29", 20000)], parties, TODAY);
    expect(s.suppliers).toHaveLength(1);
    expect(s.suppliers[0]).toMatchObject({ name: "Basava Traders", billedInr: 80000, paidInr: 20000, owedInr: 60000, advanceInr: 0, lastPaymentDate: "2026-11-29" });
    expect(s.totalOwedInr).toBe(60000);
  });
  it("sets payments against the oldest purchase first", () => {
    const s = payables([bill("new", "2026-11-28", 30000), bill("old", "2026-11-01", 50000)], [pay("x1", "2026-11-10", 50000), pay("x2", "2026-11-29", 10000)], parties, TODAY);
    expect(s.suppliers[0].openBills.map((b) => [b.id, b.remainingInr, b.daysOld, b.status])).toEqual([["new", 20000, 2, "ok"]]);
    expect(s.suppliers[0].status).toBe("ok");
  });
  it("takes the supplier's status from the oldest purchase still unpaid", () => {
    const s = payables([bill("a", "2026-11-05", 1000), bill("b", "2026-11-15", 1000), bill("c", "2026-11-29", 1000)], [], parties, TODAY);
    expect(s.suppliers[0]).toMatchObject({ oldestDays: 25, status: "late" });
    expect(s.lateInr).toBe(1000);
    expect(s.dueInr).toBe(1000);
    expect(s.totalOwedInr).toBe(3000);
  });
  it("a part-paid old purchase is still late for what remains", () => {
    const s = payables([bill("a", "2026-11-01", 1000)], [pay("x", "2026-11-02", 400)], parties, TODAY);
    expect(s.suppliers[0].openBills[0]).toMatchObject({ remainingInr: 600, status: "late" });
    expect(s.lateInr).toBe(600);
  });
  it("joins bills and register entries for the same supplier, picked or typed", () => {
    const s = payables(
      [bill("b1", "2026-11-20", 1000, "p2"), bill("r1", "2026-11-21", 500, null, "  raju   SEEDS ", "register")],
      [pay("x1", "2026-11-22", 300, null, "Raju Seeds")],
      parties,
      TODAY
    );
    expect(s.suppliers).toHaveLength(1);
    expect(s.suppliers[0]).toMatchObject({ partyId: "p2", name: "Raju Seeds", billedInr: 1500, paidInr: 300, owedInr: 1200 });
  });
  it("keeps a supplier who is not in Parties, by the typed name", () => {
    const s = payables([bill("r1", "2026-11-21", 500, null, "Village Trader", "register")], [pay("x", "2026-11-22", 100, null, "village trader")], parties, TODAY);
    expect(s.suppliers[0]).toMatchObject({ key: "name:village trader", partyId: null, name: "Village Trader", owedInr: 400 });
  });
  it("shows money paid ahead as an advance, never as a negative debt", () => {
    const s = payables([bill("b1", "2026-11-20", 1000)], [pay("x1", "2026-11-21", 1500)], parties, TODAY);
    expect(s.suppliers[0]).toMatchObject({ owedInr: 0, advanceInr: 500, openBills: [], status: "ok" });
    expect(s.totalOwedInr).toBe(0);
  });
  it("reports supplier payments with no name instead of guessing whose they are", () => {
    const s = payables([bill("b1", "2026-11-20", 1000)], [pay("x1", "2026-11-21", 700, null, null), pay("x2", "2026-11-21", 50, null, "  ")], parties, TODAY);
    expect(s.unassignedPaidInr).toBe(750);
    expect(s.suppliers[0].owedInr).toBe(1000);
  });
  it("ignores zero and negative amounts and handles paise without drift", () => {
    const s = payables([bill("a", "2026-11-20", 0.1), bill("b", "2026-11-20", 0.2), bill("z", "2026-11-20", 0), bill("n", "2026-11-20", -5)], [pay("x", "2026-11-21", 0.3), pay("y", "2026-11-21", -100)], parties, TODAY);
    expect(s.suppliers[0]).toMatchObject({ billedInr: 0.3, paidInr: 0.3, owedInr: 0, openBills: [] });
  });
  it("lists the most overdue supplier first and paid-up ones last", () => {
    const s = payables([bill("a", "2026-11-28", 9000, "p1"), bill("b", "2026-11-02", 100, "p2"), bill("c", "2026-11-01", 50, null, "Paid Up")], [pay("x", "2026-11-03", 50, null, "Paid Up")], parties, TODAY);
    expect(s.suppliers.map((x) => x.name)).toEqual(["Raju Seeds", "Basava Traders", "Paid Up"]);
  });
  it("is empty when nothing was bought on credit", () => {
    expect(payables([], [], parties, TODAY)).toEqual({ suppliers: [], totalOwedInr: 0, lateInr: 0, dueInr: 0, unassignedPaidInr: 0 });
  });
});

describe("khaliSummary", () => {
  const e = (id: string, date: string, qty: number | null, amountInr: number, partyName: string | null = "Feed Mill", paymentMode = "CASH", unit: string | null = "kg"): KhaliEntry => ({ id, date, qty, unit, rateInr: null, amountInr, paymentMode, partyName, notes: null });
  it("totals kg and money and works out the average rate", () => {
    const s = khaliSummary([e("a", "2026-11-01", 1000, 32000), e("b", "2026-11-15", 500, 17000, "feed mill")]);
    expect(s).toMatchObject({ kg: 1500, amountInr: 49000, avgRateInr: 32.67, withoutKg: 0, creditInr: 0 });
    expect(s.byBuyer).toEqual([{ name: "feed mill", kg: 1500, amountInr: 49000 }]); // one buyer, latest spelling
    expect(s.rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("leaves a sale with no weight out of kg and rate, but counts its money", () => {
    const s = khaliSummary([e("a", "2026-11-01", 1000, 30000), e("b", "2026-11-02", null, 5000), e("c", "2026-11-03", 20, 9000, "Feed Mill", "CASH", "bags")]);
    expect(s).toMatchObject({ kg: 1000, amountInr: 44000, avgRateInr: 30, withoutKg: 2 });
  });
  it("shows what was sold on credit and names an unnamed buyer", () => {
    const s = khaliSummary([e("a", "2026-11-01", 100, 3000, null, "CREDIT")]);
    expect(s.creditInr).toBe(3000);
    expect(s.byBuyer[0].name).toBe("Buyer not named");
  });
  it("is empty for no sales", () => {
    expect(khaliSummary([])).toMatchObject({ rows: [], kg: 0, amountInr: 0, avgRateInr: null });
  });
});
