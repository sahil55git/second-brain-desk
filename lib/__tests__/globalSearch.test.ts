import { describe, expect, it } from "vitest";
import { matchesQuery, searchAll, type SearchData } from "../globalSearch";

const data: SearchData = {
  parties: [
    { id: "p1", type: "CUSTOMER", name: "Ramesh Stores", phone: "9876500001", email: null, gstin: "29ABCDE1234F1Z5", address: null, state: "Karnataka", openingBalanceInr: 0, notes: null, active: true, createdAt: "", updatedAt: "" },
    { id: "p2", type: "SUPPLIER", name: "Karadi Traders", phone: null, email: null, gstin: null, address: null, state: null, openingBalanceInr: 1500, notes: null, active: false, createdAt: "", updatedAt: "" },
  ],
  sales: [
    { id: "s1", invoiceNo: "1041", date: "2026-10-11T10:00:00.000Z", partyId: "p1", totalInr: 8400, subtotalInr: 8000, cgstInr: 200, sgstInr: 200, igstInr: 0, paymentMode: "CREDIT" } as never,
  ],
  items: [
    { id: "i1", name: "Sunflower Oil 5 L", sku: "SF-5", unit: "pouch", hsnCode: null, gstRatePct: 5, barcode: "8901234", openingStockQty: 0, reorderLevelQty: 20, notes: null, active: true, createdAt: "", updatedAt: "" },
  ],
  jobWork: [
    { id: "j1", customer: "Walk-in Ravi", vehicleNo: "KA-01-AB-1234", seedKg: 640, settled: false, notes: null } as never,
  ],
};

describe("global search", () => {
  it("empty query returns nothing", () => {
    expect(searchAll("   ", data)).toEqual([]);
  });
  it("every token must match somewhere (multi-word)", () => {
    expect(matchesQuery("ramesh stores", ["Ramesh Stores"])).toBe(true);
    expect(matchesQuery("ramesh karadi", ["Ramesh Stores"])).toBe(false);
  });
  it("finds parties by name, phone or GSTIN; inactive parties are hidden", () => {
    expect(searchAll("9876500001", data).map((h) => h.title)).toEqual(["Ramesh Stores"]);
    expect(searchAll("29abcde", data)[0].desk).toBe("parties");
    expect(searchAll("karadi", data)).toEqual([]);
  });
  it("finds bills by number or party name, with desk routing", () => {
    const hit = searchAll("1041", data).find((h) => h.kind === "Bill");
    expect(hit?.desk).toBe("sales");
    expect(hit?.title).toContain("Ramesh Stores");
    expect(searchAll("ramesh", data).some((h) => h.kind === "Bill")).toBe(true);
  });
  it("finds items by sku or barcode and job-work by vehicle", () => {
    expect(searchAll("SF-5", data).find((h) => h.kind === "Item")?.desk).toBe("inventory");
    expect(searchAll("ka-01", data).find((h) => h.kind === "Job-work")).toBeTruthy();
  });
  it("caps results per kind", () => {
    expect(searchAll("a", data, 1).length).toBeLessThanOrEqual(4);
  });
});
