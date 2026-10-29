import { describe, expect, it } from "vitest";
import { billReceipt, cleanReceipt, entryReceipt, receiptName, rupees } from "../receipt";

describe("receipts", () => {
  it("formats rupees the Indian way", () => {
    expect(rupees(123456)).toBe("₹1,23,456");
    expect(rupees(12.5)).toBe("₹12.50");
    expect(rupees(null)).toBe("₹0");
  });
  it("builds a bill with GST lines only when there is tax", () => {
    const plain = billReceipt({ no: "INV-0042", party: "Ravi", lines: [{ name: "Karadi oil", qty: 2, unit: "kg", rateInr: 260, totalInr: 520 }], subtotalInr: 520, totalInr: 520, paymentMode: "UPI" });
    expect(plain.totals).toEqual([{ label: "TOTAL", value: "₹520", strong: true }]);
    expect(plain.rows[0]).toEqual({ name: "Karadi oil", detail: "2 kg × ₹260", amount: "₹520" });
    expect(plain.notes).toEqual(["Paid by: UPI"]);
    const gst = billReceipt({ lines: [], subtotalInr: 1000, cgstInr: 25, sgstInr: 25, totalInr: 1050 });
    expect(gst.totals?.map((t) => t.label)).toEqual(["Subtotal", "CGST + SGST", "TOTAL"]);
  });
  it("builds an entry receipt", () => {
    const r = entryReceipt({ title: "RECEIPT", id: "cmabc123xyz", amountInr: 1500, mode: "CREDIT", party: "Shankar" });
    expect(r.no).toBe("123XYZ");
    expect(r.notes).toEqual(["Mode: Udhaar (credit)"]);
  });
  it("cleans and caps what it prints, and names the job", () => {
    const c = cleanReceipt({ title: "  ", rows: [{ name: "" }, { name: " a  b " }], notes: ["", "x"] });
    expect(c.title).toBe("RECEIPT");
    expect(c.rows).toEqual([{ name: "a b", detail: undefined, amount: undefined }]);
    expect(c.notes).toEqual(["x"]);
    expect(receiptName({ title: "BILL", no: "INV/0042" })).toBe("BILL-INV-0042");
  });
});
