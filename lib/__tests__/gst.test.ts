import { describe, it, expect } from "vitest";
import {
  round2,
  gstTreatment,
  computeLine,
  computeTotals,
  formatInvoiceNo,
} from "@/lib/gst";

describe("round2", () => {
  it("rounds to 2 dp", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.005)).toBe(1.01); // the classic binary-float case
  });
  it("handles non-finite", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("gstTreatment", () => {
  it("same state => intra", () => {
    expect(gstTreatment("Maharashtra", "Maharashtra")).toBe("intra");
    expect(gstTreatment("maharashtra", "  MAHARASHTRA ")).toBe("intra");
  });
  it("different state => inter", () => {
    expect(gstTreatment("Maharashtra", "Gujarat")).toBe("inter");
  });
  it("missing either state => intra (safe local default)", () => {
    expect(gstTreatment(null, "Gujarat")).toBe("intra");
    expect(gstTreatment("Maharashtra", "")).toBe("intra");
    expect(gstTreatment(undefined, undefined)).toBe("intra");
  });
});

describe("computeLine", () => {
  it("computes subtotal, tax, total at 5% GST", () => {
    // 10 kg @ ₹100 = ₹1000, 5% GST = ₹50, total ₹1050
    const r = computeLine({ qty: 10, rateInr: 100, gstRatePct: 5 });
    expect(r.lineSubtotalInr).toBe(1000);
    expect(r.lineTaxInr).toBe(50);
    expect(r.lineTotalInr).toBe(1050);
  });
  it("rounds correctly on messy numbers", () => {
    // 3.333 kg @ ₹99.99 = ₹333.27 (333.2667), 5% = ₹16.66
    const r = computeLine({ qty: 3.333, rateInr: 99.99, gstRatePct: 5 });
    expect(r.lineSubtotalInr).toBe(333.27);
    expect(r.lineTaxInr).toBe(16.66);
    expect(r.lineTotalInr).toBe(349.93);
  });
  it("treats bad input as zero", () => {
    const r = computeLine({ qty: NaN, rateInr: 100, gstRatePct: 5 });
    expect(r.lineSubtotalInr).toBe(0);
    expect(r.lineTotalInr).toBe(0);
  });
});

describe("computeTotals — intra-state (CGST + SGST)", () => {
  it("splits tax evenly", () => {
    const t = computeTotals(
      [
        { qty: 10, rateInr: 100, gstRatePct: 5 }, // ₹1000, tax ₹50
        { qty: 5, rateInr: 200, gstRatePct: 5 }, // ₹1000, tax ₹50
      ],
      "intra"
    );
    expect(t.subtotalInr).toBe(2000);
    expect(t.cgstInr).toBe(50);
    expect(t.sgstInr).toBe(50);
    expect(t.igstInr).toBe(0);
    expect(t.totalInr).toBe(2100);
    // Halves must sum exactly to total tax
    expect(round2(t.cgstInr + t.sgstInr)).toBe(100);
  });
  it("hands the odd paisa to CGST so halves sum exactly", () => {
    // single line tax of ₹16.66 -> half is 8.33; 8.33 + 8.33 = 16.66 OK
    // craft an odd total: tax ₹0.05 -> cgst 0.03, sgst 0.02
    const t = computeTotals([{ qty: 1, rateInr: 1, gstRatePct: 5 }], "intra");
    // 1 * 1 = 1, 5% = 0.05
    expect(t.cgstInr + t.sgstInr).toBeCloseTo(0.05, 5);
    expect(round2(t.cgstInr + t.sgstInr)).toBe(0.05);
  });
});

describe("computeTotals — inter-state (IGST)", () => {
  it("puts all tax in IGST", () => {
    const t = computeTotals([{ qty: 10, rateInr: 100, gstRatePct: 18 }], "inter");
    expect(t.subtotalInr).toBe(1000);
    expect(t.igstInr).toBe(180);
    expect(t.cgstInr).toBe(0);
    expect(t.sgstInr).toBe(0);
    expect(t.totalInr).toBe(1180);
  });
});

describe("formatInvoiceNo", () => {
  it("pads to 4 digits", () => {
    expect(formatInvoiceNo("INV-", 1)).toBe("INV-0001");
    expect(formatInvoiceNo("INV-", 42)).toBe("INV-0042");
    expect(formatInvoiceNo("INV-", 12345)).toBe("INV-12345");
  });
  it("defaults prefix when blank", () => {
    expect(formatInvoiceNo("", 7)).toBe("INV-0007");
  });
});
