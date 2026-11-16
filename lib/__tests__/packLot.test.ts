import { describe, expect, it } from "vitest";
import { lotPrefix, nextLot, packRuns } from "@/lib/packLot";

describe("lot numbers", () => {
  it("takes three letters from the product name", () => {
    expect(lotPrefix("Karadi 1L")).toBe("KAR");
    expect(lotPrefix("ekatva 500 ml")).toBe("EKA");
    expect(lotPrefix("5L")).toBe("L");
    expect(lotPrefix("123")).toBe("LOT");
  });
  it("numbers lots per product and day, starting at 1", () => {
    expect(nextLot("Karadi 1L", "2026-11-13", [])).toBe("KAR-261113-1");
    expect(nextLot("Karadi 1L", "2026-11-13", ["KAR-261113-1", "KAR-261113-2", null, undefined])).toBe("KAR-261113-3");
  });
  it("does not count other days or other products", () => {
    expect(nextLot("Karadi 1L", "2026-11-13", ["KAR-261112-7", "EKA-261113-4"])).toBe("KAR-261113-1");
  });
  it("never reuses a number, even when an earlier lot was removed or is out of order", () => {
    expect(nextLot("Karadi 1L", "2026-11-13", ["KAR-261113-5", "KAR-261113-2", "KAR-261113-x"])).toBe("KAR-261113-6");
  });
});

describe("packRuns", () => {
  it("lists runs newest first with oil per unit, and tolerates old runs without a lot", () => {
    const rows = packRuns([
      { id: "a", date: "2026-11-01", data: { sku: "Karadi 1L", units: 40 } },
      { id: "b", date: "2026-11-13", data: { sku: "Karadi 1L", units: 50, lot: "KAR-261113-1", oilKg: 45.5, fromTank: "K2 tank" } },
      { id: "c", date: "2026-11-13", data: { sku: " ", units: "x", oilKg: -1, lot: "" } },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows[1]).toEqual({ id: "b", date: "2026-11-13", sku: "Karadi 1L", units: 50, lot: "KAR-261113-1", oilKg: 45.5, fromTank: "K2 tank", kgPerUnit: 0.91 });
    expect(rows[2]).toMatchObject({ lot: null, oilKg: null, fromTank: null, kgPerUnit: null });
    expect(rows[0]).toMatchObject({ sku: "", units: 0, lot: null, oilKg: null });
  });
});
