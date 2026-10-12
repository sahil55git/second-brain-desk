import { describe, expect, it } from "vitest";
import { dayBook, salesReport, udhaarReport, type BizData, type RefundRecord } from "../bizReports";

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
