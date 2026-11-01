import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { amountInWords, belowCard, budgetRows, cashForecast, ewayJson, ewayNeeded, ewayProblems, hsnSummary, profitLoss, rateFor, stateCode, upiPay, validVpa, type EwayInput, type RateCards } from "../money";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "SALE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[]): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [] });

describe("amountInWords", () => {
  it("uses lakh and crore", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(105)).toBe("Rupees One Hundred Five Only");
    expect(amountInWords(12345.5)).toBe("Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only");
    expect(amountInWords(2550000)).toBe("Rupees Twenty Five Lakh Fifty Thousand Only");
    expect(amountInWords(31000000)).toBe("Rupees Three Crore Ten Lakh Only");
  });
});

describe("hsnSummary", () => {
  it("groups by HSN and rate, splits CGST/SGST", () => {
    const rows = hsnSummary([{ hsnCode: "1514", gstRatePct: 5, lineSubtotalInr: 1000 }, { hsnCode: "1514", gstRatePct: 5, lineSubtotalInr: 1000, discountPct: 10 }], false);
    expect(rows).toEqual([{ hsn: "1514", rate: 5, taxable: 1900, cgst: 47.5, sgst: 47.5, igst: 0, tax: 95 }]);
    expect(hsnSummary([{ hsnCode: "1512", gstRatePct: 5, lineSubtotalInr: 200 }], true)[0].igst).toBe(10);
  });
});

describe("upi + states", () => {
  it("builds a UPI link and checks a VPA", () => {
    expect(upiPay("shop@okaxis", "Mahadev", 1050, "INV-1")).toContain("pa=shop%40okaxis");
    expect(upiPay("shop@okaxis", "Mahadev", 1050, "INV-1")).toContain("am=1050.00");
    expect(validVpa("shop@okaxis")).toBe(true);
    expect(validVpa("shop")).toBe(false);
  });
  it("finds state codes", () => {
    expect(stateCode("Karnataka")).toBe(29);
    expect(stateCode("KA")).toBe(29);
    expect(stateCode("36ABCDE1234F1Z5")).toBe(36);
    expect(stateCode("")).toBeNull();
  });
});

describe("e-way bill", () => {
  const x: EwayInput = {
    invoice: { invoiceNo: "INV-9", date: "2026-11-01", interState: false, subtotalInr: 60000, cgstInr: 1500, sgstInr: 1500, igstInr: 0, totalInr: 63000, lineItems: [{ name: "Groundnut oil", hsnCode: "1508", qty: 400, unit: "kg", gstRatePct: 5, lineSubtotalInr: 60000 }] },
    seller: { gstin: "29ABCDE1234F1Z5", businessName: "Mahadev Traders", address: "Main Rd, Bidar 585401", state: "Karnataka" },
    buyer: { gstin: null, name: "Hotel Sai", address: "Humnabad 585330", state: "Karnataka" },
    transport: { vehicleNo: "KA 38 A 1234", distanceKm: 52 },
  };
  it("is needed over ₹50,000", () => { expect(ewayNeeded(63000)).toBe(true); expect(ewayNeeded(50000)).toBe(false); });
  it("builds the JSON", () => {
    expect(ewayProblems(x)).toEqual([]);
    const j = ewayJson(x).billLists[0];
    expect(j.docDate).toBe("01/11/2026");
    expect(j.vehicleNo).toBe("KA38A1234");
    expect(j.toGstin).toBe("URP");
    expect(j.fromPincode).toBe(585401);
    expect(j.itemList[0]).toMatchObject({ hsnCode: 1508, qtyUnit: "KGS", cgstRate: 2.5, igstRate: 0 });
  });
  it("lists what is missing", () => {
    expect(ewayProblems({ ...x, buyer: { ...x.buyer, address: "Humnabad" }, transport: { vehicleNo: "xx", distanceKm: 0 } }).length).toBe(3);
  });
});

describe("rate cards", () => {
  const cards: RateCards = { lists: [{ key: "retail", name: "Retail", rates: { "groundnut oil": 190 } }, { key: "hotel", name: "Hotel", rates: { "groundnut oil": 180 } }], parties: { "hotel sai": "hotel" }, partyRates: { "ravi": { "groundnut oil": 175 } }, defaultList: "retail" };
  it("picks party rate, then list, then default", () => {
    expect(rateFor(cards, "Ravi", "Groundnut Oil")).toEqual({ rate: 175, from: "party rate" });
    expect(rateFor(cards, "Hotel Sai", "groundnut oil")).toEqual({ rate: 180, from: "Hotel" });
    expect(rateFor(cards, "walk-in", "groundnut oil")).toEqual({ rate: 190, from: "Retail" });
    expect(rateFor(cards, "x", "mustard oil")).toBeNull();
  });
  it("warns below the card", () => {
    expect(belowCard(cards, "", "groundnut oil", 185)).toContain("below the Retail rate");
    expect(belowCard(cards, "", "groundnut oil", 190)).toBeNull();
  });
});

describe("profit, forecast, budgets", () => {
  const d = data([
    reg({ kind: "SALE", amountInr: 10000 }),
    reg({ kind: "PURCHASE", amountInr: 6000 }),
    reg({ kind: "EXPENSE", item: "diesel", amountInr: 1500 }),
    reg({ kind: "PAYMENT", item: "supplier", amountInr: 3000 }),
  ]);
  it("P&L leaves supplier payments out of expenses", () => {
    const p = profitLoss(d, { from: "2026-11-01", to: "2026-11-01" });
    expect(p).toMatchObject({ sales: 10000, purchases: 6000, gross: 4000, expenses: 1500, net: 2500, marginPct: 25 });
  });
  it("projects cash and finds the low point", () => {
    const f = cashForecast(d, { openingInr: 1000, today: "2026-11-01", days: 10, lookback: 1, fixed: [{ name: "Rent", amountInr: 50000, day: 5 }] });
    expect(f.series.length).toBe(11);
    expect(f.firstNegative).toBe("2026-11-04");
    expect(f.series[5].inr).toBe(1000 - 2500 - 50000);
    expect(f.low.inr).toBeLessThan(0);
  });
  it("budgets show pace", () => {
    const rows = budgetRows({ Diesel: 3000, "Tea / food": 1000 }, data([reg({ kind: "EXPENSE", item: "diesel", amountInr: 1500, date: "2026-11-10" })]), "2026-11-10");
    expect(rows[0]).toMatchObject({ name: "Diesel", spent: 1500, pct: 50, level: "watch" });
    expect(rows[1].level).toBe("ok");
  });
});
