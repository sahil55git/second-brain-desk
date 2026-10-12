import { describe, expect, it } from "vitest";
import { cashReport, dayBook, salesReport, udhaarReport, type BizData, type RefundRecord } from "../bizReports";

const refund: RefundRecord = { id: "r1", invoiceId: "s1", invoiceNo: "INV-0042", date: "2026-10-11", partyName: "Ramesh Stores", paymentMode: "CREDIT", amount: 165, reason: "Damaged" };
const data = (over: Partial<BizData> = {}): BizData => ({
  sales: [
    { id: "s1", invoiceNo: "INV-0042", date: "2026-10-10", partyId: "p1", party: { id: "p1", name: "Ramesh Stores" }, totalInr: 8400, subtotalInr: 8000, cgstInr: 200, sgstInr: 200, igstInr: 0, paymentMode: "CREDIT", lineItems: [] } as never,
  ],
  purchases: [], expenses: [], register: [], jobWork: [], mfg: [], closings: [], items: [],
  refunds: [refund],
  ...over,
});
const span = { from: "2026-10-01", to: "2026-10-31" };

describe("refunds in reports", () => {
  it("sales total is net of refunds, and the refund is dated when recorded", () => {
    const r = salesReport(data(), span);
    expect(r.grossTotal).toBe(8400);
    expect(r.refundTotal).toBe(165);
    expect(r.total).toBe(8235);
    expect(r.refundCount).toBe(1);
    expect(r.rows.some((x) => x.source === "Refund" && x.amount === -165)).toBe(true);
  });
  it("day book shows the refund as money out on its own day", () => {
    const b = dayBook(data(), span);
    const row = b.rows.find((x) => x.type === "REFUND");
    expect(row?.out).toBe(165);
    expect(row?.date).toBe("2026-10-11");
    expect(b.totalOut).toBe(165);
  });
  it("credit invoices show refunds and the net owed", () => {
    const u = udhaarReport(data(), "2026-10-31");
    expect(u.creditInvoices[0]).toMatchObject({ amount: 8400, refundedInr: 165, netInr: 8235 });
  });
  it("a refund dated after the as-of date does not reduce that day's balance", () => {
    const u = udhaarReport(data(), "2026-10-10");
    expect(u.creditInvoices[0].refundedInr).toBe(0);
  });
});

describe("udhaar includes unpaid credit sales", () => {
  it("a credit invoice adds to the party balance, net of its refund", () => {
    const u = udhaarReport(data(), "2026-10-31");
    const row = u.rows.find((r) => r.name === "Ramesh Stores");
    expect(row).toMatchObject({ given: 8400, refunds: 165, balance: 8235 });
    expect(u.outstanding).toBe(8235);
  });
  it("a receipt recorded against the party reduces the balance", () => {
    const d = data({
      register: [{ id: "u1", date: "2026-10-12", kind: "UDHAAR_IN", partyName: "Ramesh Stores", amountInr: 3000, paymentMode: "CASH" } as never],
    });
    const u = udhaarReport(d, "2026-10-31");
    expect(u.rows.find((r) => r.name === "Ramesh Stores")?.balance).toBe(5235);
  });
  it("cash and UPI invoices do not count toward udhaar", () => {
    const d = data({
      sales: [{ id: "s2", invoiceNo: "INV-0043", date: "2026-10-10", partyId: "p2", party: { id: "p2", name: "Walk-in" }, totalInr: 500, paymentMode: "CASH", lineItems: [] } as never],
      refunds: [],
    });
    expect(udhaarReport(d, "2026-10-31").rows.some((r) => r.name === "Walk-in")).toBe(false);
  });
});

describe("invoice payment matching (oldest bill first)", () => {
  const twoBills = (receipt: number) =>
    data({
      sales: [
        { id: "old", invoiceNo: "INV-0001", date: "2026-10-01", partyId: "p1", party: { id: "p1", name: "Ramesh Stores" }, totalInr: 1000, paymentMode: "CREDIT", lineItems: [] } as never,
        { id: "new", invoiceNo: "INV-0002", date: "2026-10-05", partyId: "p1", party: { id: "p1", name: "Ramesh Stores" }, totalInr: 2000, paymentMode: "CREDIT", lineItems: [] } as never,
      ],
      refunds: [],
      register: receipt ? [{ id: "u2", date: "2026-10-08", kind: "UDHAAR_IN", partyName: "Ramesh Stores", amountInr: receipt, paymentMode: "CASH" } as never] : [],
    });
  const status = (d: BizData) => udhaarReport(d, "2026-10-31").creditInvoices;

  it("a receipt clears the oldest bill first, then part-pays the next", () => {
    const c = status(twoBills(1500));
    expect(c[0]).toMatchObject({ invoiceNo: "INV-0001", paidInr: 1000, openInr: 0, status: "paid" });
    expect(c[1]).toMatchObject({ invoiceNo: "INV-0002", paidInr: 500, openInr: 1500, status: "part" });
  });
  it("no receipts leaves every bill open", () => {
    expect(status(twoBills(0)).map((c) => c.status)).toEqual(["open", "open"]);
  });
  it("refunds reduce the bill before receipts are applied", () => {
    const d = twoBills(900);
    d.refunds = [{ id: "r9", invoiceId: "old", invoiceNo: "INV-0001", date: "2026-10-09", partyName: "Ramesh Stores", paymentMode: "CREDIT", amount: 400, reason: "Damaged" }];
    const c = status(d);
    expect(c[0]).toMatchObject({ netInr: 600, paidInr: 600, status: "paid" });
    expect(c[1]).toMatchObject({ paidInr: 300, status: "part" });
  });
});

describe("receipts tied to a bill, and refunds in cash", () => {
  const two = (receipts: { amountInr: number; details?: unknown }[]) =>
    data({
      sales: [
        { id: "old", invoiceNo: "INV-0001", date: "2026-10-01", partyId: "p1", party: { id: "p1", name: "Ramesh Stores" }, totalInr: 1000, paymentMode: "CREDIT", lineItems: [] } as never,
        { id: "new", invoiceNo: "INV-0002", date: "2026-10-05", partyId: "p1", party: { id: "p1", name: "Ramesh Stores" }, totalInr: 2000, paymentMode: "CREDIT", lineItems: [] } as never,
      ],
      refunds: [],
      register: receipts.map((r, i) => ({ id: `u${i}`, date: "2026-10-08", kind: "UDHAAR_IN", partyName: "Ramesh Stores", paymentMode: "CASH", ...r }) as never),
    });
  const byNo = (d: BizData) => Object.fromEntries(udhaarReport(d, "2026-10-31").creditInvoices.map((c) => [c.invoiceNo, c]));

  it("a receipt tied to a bill pays that bill, not the oldest one", () => {
    const c = byNo(two([{ amountInr: 500, details: { invoiceId: "new" } }]));
    expect(c["INV-0002"]).toMatchObject({ paidInr: 500, openInr: 1500 });
    expect(c["INV-0001"]).toMatchObject({ paidInr: 0, openInr: 1000 });
  });
  it("untied receipts still go to the oldest open bill after tied ones", () => {
    const c = byNo(two([{ amountInr: 1500, details: { invoiceId: "new" } }, { amountInr: 800 }]));
    expect(c["INV-0002"]).toMatchObject({ paidInr: 1500, openInr: 500 });
    expect(c["INV-0001"]).toMatchObject({ paidInr: 800, openInr: 200 });
  });
  it("a cash refund is money out in the cash report; a credit refund is not", () => {
    const d = data({ refunds: [{ ...refund, id: "rc", paymentMode: "CASH", amount: 100 }, { ...refund, id: "rd", paymentMode: "CREDIT", amount: 50 }] });
    const c = cashReport(d, span);
    expect(c.cashOut).toBe(100);
  });
});
