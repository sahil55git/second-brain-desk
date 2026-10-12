import { describe, expect, it } from "vitest";
import { mergeScaleReports, normalizeScaleReport, parseReportDate, productKey, scaleWarnings, soldByStockKey } from "../scaleReport";

const sample = {
  reportDate: "12/10/26",
  totalWeightKg: 681.775,
  totalPriceInr: 139857.03,
  taxInr: 6657.11,
  products: [
    { name: "Karadi oil", weightKg: 100.945, amountInr: 26030.48 },
    { name: "Sunflower", weightKg: 304.15, amountInr: 58312.07 },
    { name: "Golddrop", weightKg: 185.41, amountInr: 35623.03 },
    { name: "Soyabean", weightKg: 71.025, amountInr: 11999.05 },
    { name: "Groundnut", weightKg: 6.25, amountInr: 1500 },
    { name: "Coconut", weightKg: 6.32, amountInr: 3412.8 },
    { name: "Tea Powder", weightKg: 7.055, amountInr: 2539.8 },
    { name: "Til Oil", weightKg: 0.255, amountInr: 73.95 },
    { name: "Mustard Oil", weightKg: 0.365, amountInr: 105.85 },
    { name: "5 kg Can", pieces: 5, amountInr: 200 },
    { name: "2 ltr Can", pieces: 3, amountInr: 60 },
  ],
};

describe("scale report", () => {
  it("maps product names to stock keys; cans are left out", () => {
    expect(productKey("Karadi oil")).toBe("karadi1");
    expect(productKey("Golddrop")).toBe("golddrop");
    expect(productKey("Tea Powder")).toBe("teapowder");
    expect(productKey("Til Oil")).toBe("til");
    expect(productKey("5 kg Can")).toBeNull();
  });
  it("reads dates", () => {
    expect(parseReportDate("12/10/26")).toBe("2026-10-12");
    expect(parseReportDate("2026-10-12 10:49")).toBe("2026-10-12");
    expect(parseReportDate("garbage")).toBeNull();
  });
  it("normalizes the real report and its lines add up to the printed totals", () => {
    const r = normalizeScaleReport(sample);
    expect(r.lines).toHaveLength(11);
    expect(r.totalKg).toBe(681.775);
    expect(scaleWarnings(r)).toEqual([]);
  });
  it("warns when a line is missing", () => {
    const r = normalizeScaleReport({ ...sample, products: sample.products.slice(0, 5) });
    expect(scaleWarnings(r).length).toBeGreaterThan(0);
  });
  it("sold per stock key", () => {
    const s = soldByStockKey(normalizeScaleReport(sample));
    expect(s.sf).toBe(304.15);
    expect(s.golddrop).toBe(185.41);
    expect(s.karadi1).toBe(100.945);
  });
  it("merges two photos once per product", () => {
    const a = normalizeScaleReport({ products: sample.products.slice(0, 6) });
    const b = normalizeScaleReport({ ...sample, products: sample.products.slice(4) });
    const m = mergeScaleReports([a, b]);
    expect(m.lines).toHaveLength(11);
    expect(m.totalInr).toBe(139857.03);
  });
  it("never invents numbers", () => {
    const r = normalizeScaleReport({ totalPriceInr: "abc", products: [{ name: "Sunflower", weightKg: null, amountInr: null }, "x"] });
    expect(r.totalInr).toBeNull();
    expect(r.lines).toHaveLength(0);
  });
});
