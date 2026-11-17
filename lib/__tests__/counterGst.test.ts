import { describe, expect, it } from "vitest";
import { gstSplit, taxInvoiceDoc, validGstin } from "../counterGst";

describe("counter GST (tax-inclusive)", () => {
  it("takes 5% out of a price that already includes it", () => {
    const g = gstSplit([{ name: "Karadi", hsn: "1512", pct: 5, amount: 525 }], false);
    expect(g.taxable).toBe(500);
    expect(g.tax).toBe(25);
    expect(g.byRate).toEqual([{ pct: 5, taxable: 500, cgst: 12.5, sgst: 12.5, igst: 0 }]);
    expect(g.total).toBe(525);
  });
  it("taxable + tax always equals what the customer pays, and CGST + SGST equals the tax", () => {
    const g = gstSplit([{ name: "A", hsn: "", pct: 5, amount: 468 }, { name: "B", hsn: "", pct: 5, amount: 67.6 }, { name: "C", hsn: "", pct: 0, amount: 100 }], false);
    expect(g.total).toBe(635.6);
    expect(g.byRate.find((r) => r.pct === 0)).toMatchObject({ taxable: 100, cgst: 0, sgst: 0 });
    const five = g.byRate.find((r) => r.pct === 5)!;
    expect(Math.round((five.cgst + five.sgst) * 100) / 100).toBe(g.tax);
  });
  it("interstate puts it all in IGST", () => {
    const g = gstSplit([{ name: "A", hsn: "1512", pct: 5, amount: 105 }], true);
    expect(g.byRate[0]).toMatchObject({ igst: 5, cgst: 0, sgst: 0, taxable: 100 });
  });
  it("checks a GSTIN's shape", () => {
    expect(validGstin("29ABCDE1234F1Z5")).toBe(true);
    expect(validGstin("29ABCDE1234F1")).toBe(false);
  });
  it("prints CGST and SGST per rate on the tax invoice, and a total that matches the bill", () => {
    const d = taxInvoiceDoc({ no: "7", when: "x", gstin: "29abcde1234f1z5", igst: false, lines: [{ name: "Karadi", hsn: "1512", pct: 5, amount: 525, detail: "2 kg × ₹262.5" }] });
    expect(d.title).toBe("TAX INVOICE");
    expect(d.party).toBe("GSTIN 29ABCDE1234F1Z5");
    expect(d.totals?.map((t) => `${t.label} ${t.value}`)).toEqual(["Taxable value ₹500", "CGST 2.5% ₹12.50", "SGST 2.5% ₹12.50", "TOTAL ₹525"]);
    expect(d.rows[0].detail).toBe("HSN 1512 · GST 5% · 2 kg × ₹262.5");
  });
});
