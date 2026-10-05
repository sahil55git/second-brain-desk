import { describe, expect, it } from "vitest";
import {
  attentionList,
  cashReport,
  dayBook,
  daysIn,
  expenseReport,
  jobWorkReport,
  presetSpan,
  purchaseReport,
  salesReport,
  stockReport,
  toCsvRows,
  udhaarReport,
  type BizData,
  type RegisterRow,
} from "../bizReports";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-10-04",
  kind: "SALE",
  item: null,
  itemLabel: null,
  qty: null,
  unit: null,
  rateInr: null,
  amountInr: 0,
  paymentMode: "CASH",
  partyName: null,
  notes: null,
  createdAt: "2026-10-04T06:00:00.000Z",
  ...o,
});

const base = (): BizData => ({
  sales: [
    {
      id: "s1", invoiceNo: "INV-1", date: "2026-10-03", partyId: "p1", partyStateSnapshot: null, businessStateSnapshot: null,
      interState: false, subtotalInr: 1000, cgstInr: 25, sgstInr: 25, igstInr: 0, totalInr: 1050, paymentMode: "CREDIT", notes: null,
      party: { id: "p1", name: "Hotel A" },
      lineItems: [{ id: "l1", invoiceId: "s1", itemId: "i1", name: "Groundnut oil 15kg", hsnCode: null, qty: 2, unit: "tin", rateInr: 500, gstRatePct: 5, lineSubtotalInr: 1000, lineTaxInr: 50, lineTotalInr: 1050 }],
      createdAt: "2026-10-03T06:00:00.000Z", updatedAt: "",
    },
  ],
  purchases: [
    {
      id: "b1", billNo: "B-9", date: "2026-10-02", partyId: "p2", partyStateSnapshot: null, businessStateSnapshot: null,
      interState: false, subtotalInr: 5000, cgstInr: 0, sgstInr: 0, igstInr: 0, totalInr: 5000, paymentMode: "CREDIT", notes: null,
      party: { id: "p2", name: "Seed Co" },
      lineItems: [{ id: "pl1", billId: "b1", itemId: "i1", name: "Groundnut oil 15kg", hsnCode: null, qty: 10, unit: "tin", rateInr: 500, gstRatePct: 0, lineSubtotalInr: 5000, lineTaxInr: 0, lineTotalInr: 5000 }],
      createdAt: "2026-10-02T06:00:00.000Z", updatedAt: "",
    } as never,
  ],
  expenses: [{ id: "e1", date: "2026-10-04", category: "Electricity", amountInr: 800, partyId: null, paymentMode: "UPI", notes: null, createdAt: "2026-10-04T05:00:00.000Z", updatedAt: "" }],
  register: [
    reg({ kind: "SALE", item: "karadi", qty: 10, unit: "kg", amountInr: 2500, partyName: "Suresh", paymentMode: "CREDIT" }),
    reg({ kind: "UDHAAR_IN", amountInr: 1000, partyName: "Suresh" }),
    reg({ kind: "FRESH_CRUSH", item: "groundnut", qty: 14, unit: "kg", amountInr: 2660, details: { seedKg: 50, oilKg: 16, extraKg: 2, extraTo: "GN tank", cakeKg: 33.6 } }),
    reg({ kind: "PURCHASE", item: "tins", qty: 50, unit: "pcs", amountInr: 2100 }),
    reg({ kind: "EXPENSE", item: "diesel", amountInr: 500 }),
    reg({ kind: "PAYMENT", item: "salary", amountInr: 2000 }),
    reg({ kind: "PIGMEE", amountInr: 1000 }),
  ],
  jobWork: [
    { id: "j1", customer: "Ramesh", vehicleNo: null, seedKg: 100, cakeOwnership: "SHOP", advanceCustomerInr: 50, advanceAutoInr: 0, cans: { can15: { qty: 1, rate: 50 } }, notes: null, settled: false, settlementCustomerInr: null, settlementAutoInr: null, settlementRatePerKg: null, settlementAmountInr: null, settledAt: null, createdAt: "2026-09-25T06:00:00.000Z", updatedAt: "" },
    { id: "j2", customer: "Karnali", vehicleNo: null, seedKg: 50, cakeOwnership: "CUSTOMER", advanceCustomerInr: 0, advanceAutoInr: 0, cans: null, notes: null, settled: true, settlementCustomerInr: 500, settlementAutoInr: 0, settlementRatePerKg: 10, settlementAmountInr: 500, settledAt: "2026-10-04T07:00:00.000Z", createdAt: "2026-10-04T05:00:00.000Z", updatedAt: "" },
  ],
  mfg: [],
  closings: [
    { id: "c1", date: "2026-10-04", session: "AFTERNOON", cashInOpening: 0, cashInSales: 0, cashInOther: 0, cashOutGrn: 0, cashOutExpenses: 0, cashOutSalary: 0, cashOutUpi: 0, cashOutDraw: 0, cashOutOther: 0, counterCashInr: 1000, systemCashInr: 1400, cashDiffInr: 400, cashMismatch: true, stock: null, createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "" },
  ],
  items: [{ id: "i1", name: "Groundnut oil 15kg", sku: null, unit: "tin", hsnCode: null, gstRatePct: 5, barcode: null, openingStockQty: 1, reorderLevelQty: 10, notes: null, active: true, createdAt: "", updatedAt: "" }],
});

const SPAN = { from: "2026-10-01", to: "2026-10-04" };
const NOW = Date.parse("2026-10-04T10:00:00.000Z");

describe("spans", () => {
  it("presets use the IST business day", () => {
    expect(presetSpan("today", NOW)).toEqual({ from: "2026-10-04", to: "2026-10-04" });
    expect(presetSpan("7d", NOW)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presetSpan("lastMonth", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(daysIn(SPAN)).toHaveLength(4);
  });
});

describe("sales / purchase / expenses combine desks + counter, side by side", () => {
  it("sales", () => {
    const s = salesReport(base(), SPAN);
    expect(s.invoiceTotal).toBe(1050);
    expect(s.invoiceTax).toBe(50);
    expect(s.counterTotal).toBe(5160); // 2500 + 2660 fresh crush
    expect(s.freshCrush).toBe(2660);
    expect(s.total).toBe(6210);
    expect(s.byMode.CREDIT).toBe(1050 + 2500);
    expect(s.series.find((x) => x.date === "2026-10-04")?.value).toBe(5160);
  });
  it("purchase", () => {
    const p = purchaseReport(base(), SPAN);
    expect(p.total).toBe(7100);
    expect(p.onCredit).toBe(5000);
  });
  it("expenses incl. salary paid at the counter", () => {
    const e = expenseReport(base(), SPAN);
    expect(e.total).toBe(3300);
    expect(e.salary).toBe(2000);
  });
});

describe("job-work uses lib/calculations unchanged", () => {
  it("outstanding, overdue, settled in range", () => {
    const j = jobWorkReport(base(), SPAN, NOW);
    expect(j.outstanding[0]).toMatchObject({ customer: "Ramesh", due: 500, ageDays: 9 }); // 600 − 50 − 50
    expect(j.shopOwes).toBe(500);
    expect(j.overdue).toBe(1);
    expect(j.settledAmount).toBe(500);
    expect(j.khaliStockKg).toBe(78);
  });
});

describe("stock", () => {
  it("book stock = opening + bills − invoices (linked items only)", () => {
    const st = stockReport(base(), "2026-10-04");
    expect(st.items[0]).toMatchObject({ opening: 1, inQty: 10, outQty: 2, book: 9, low: true });
    expect(st.counter.find((c) => c.item.startsWith("Karadi"))?.outQty).toBe(10);
    expect(st.toTank).toEqual({ "GN tank": 2 });
  });
});

describe("cash, udhaar, day book, attention", () => {
  it("cash", () => {
    const c = cashReport(base(), SPAN);
    expect(c.cashIn).toBe(1000 + 2660); // udhaar collected + fresh crush (cash)
    expect(c.creditGiven).toBe(2500);
    expect(c.mismatches).toBe(1);
  });
  it("udhaar balance per name", () => {
    const u = udhaarReport(base(), "2026-10-04");
    expect(u.rows[0]).toMatchObject({ name: "Suresh", given: 2500, received: 1000, balance: 1500 });
    expect(u.creditInvoices).toHaveLength(1);
  });
  it("day book includes job-work cash with the right direction", () => {
    const db = dayBook(base(), SPAN);
    const settle = db.rows.find((r) => r.type === "SETTLEMENT");
    expect(settle).toMatchObject({ party: "Karnali", in: 500, out: 0 });
    expect(db.rows.some((r) => r.source === "Sales desk")).toBe(true);
  });
  it("attention: overdue job-work, cash ≥ ₹300, low stock, udhaar", () => {
    const a = attentionList(base(), "2026-10-04", NOW);
    expect(a.map((x) => x.area)).toEqual(expect.arrayContaining(["Job-work", "Cash", "Stock", "Udhaar"]));
    expect(a[0].severity).toBe("critical");
  });
  it("csv", () => {
    expect(toCsvRows([{ a: "x,y", b: 1 }])).toBe('a,b\n"x,y",1');
  });
});
