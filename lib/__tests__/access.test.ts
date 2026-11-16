import { describe, expect, it } from "vitest";
import { BUILTIN_PROFILES, OWNER_PERMS, canFn, canPage, effectivePerms, kindToFn, normalizePerms, pagesForPath, pathAllowed, visibleEntries, billsFor, withoutCostRates } from "../access";

const by = (id: string) => BUILTIN_PROFILES.find((p) => p.id === id)!.perms;

describe("access", () => {
  it("has the four profiles with sensible defaults", () => {
    expect(BUILTIN_PROFILES.map((p) => p.id)).toEqual(["owner", "manager", "counter", "godown"]);
    expect(canFn(by("counter"), "sale")).toBe(true);
    expect(canFn(by("counter"), "purchase")).toBe(false);
    expect(canPage(by("counter"), "stock")).toBe(false);
    expect(canPage(by("manager"), "reports")).toBe(false);
    expect(canFn(by("godown"), "stock")).toBe(true);
    expect(by("counter").hide.totals).toBe(true);
    expect(by("manager").hide.totals).toBe(false);
  });
  it("owner is never locked out and settings stay owner-only", () => {
    expect(effectivePerms(true, by("godown"))).toEqual(OWNER_PERMS);
    const p = effectivePerms(false, normalizePerms({ pg: { settings: true } }, OWNER_PERMS));
    expect(p.pg.settings).toBe(false);
  });
  it("normalizePerms keeps booleans only and fills the rest from the base", () => {
    const p = normalizePerms({ fn: { sale: false, purchase: "yes" }, bogus: { x: true } }, by("manager"));
    expect(p.fn.sale).toBe(false);
    expect(p.fn.purchase).toBe(true);
    expect(p.pg.reports).toBe(false);
    expect(Object.keys(p)).toEqual(["pg", "fn", "win", "hide"]);
  });
  it("maps entry kinds to functions", () => {
    expect(kindToFn("SALE")).toBe("sale");
    expect(kindToFn("FRESH_CRUSH")).toBe("sale");
    expect(kindToFn("OWNER_DRAW")).toBe("draw");
    expect(kindToFn("UDHAAR_IN")).toBe("udhaar");
  });
  it("maps pages and their APIs", () => {
    expect(pagesForPath("/stock")).toEqual(["stock"]);
    expect(pagesForPath("/api/sales/abc/refund")).toEqual(["sales", "register"]);
    expect(pagesForPath("/api/register/stock")).toEqual(["register", "stock"]);
    expect(pagesForPath("/api/register")).toEqual(["register"]);
    expect(pagesForPath("/api/label-templates")).toEqual(["mfg", "stock"]);
    expect(pagesForPath("/barrels/fleet/designer")).toEqual(["mfg", "stock"]);
    expect(pagesForPath("/api/appearance")).toBeNull();
    expect(pagesForPath("/")).toBeNull();
    expect(pathAllowed(by("counter"), "/api/parties")).toBe(true);
    expect(pathAllowed(by("counter"), "/api/reports/hub")).toBe(false);
    expect(pathAllowed(by("counter"), "/sales")).toBe(true);
    expect(pathAllowed(by("godown"), "/api/register/stock")).toBe(true);
    expect(pathAllowed(by("godown"), "/api/sales")).toBe(true);
    expect(pathAllowed(by("godown"), "/api/parties")).toBe(true);
    expect(pathAllowed(by("godown"), "/sales")).toBe(false);
  });
  it("hides other users' entries, and buying rates but not selling rates", () => {
    const rows = [{ id: 1, kind: "SALE", createdByName: "Ravi", rateInr: 168 }, { id: 2, kind: "SALE", createdByName: "Manjula", rateInr: 214 }, { id: 3, kind: "PURCHASE", createdByName: "Ravi", rateInr: 140 }];
    const p = by("counter");
    expect(visibleEntries(rows, p, "ravi")).toEqual([{ id: 1, kind: "SALE", createdByName: "Ravi", rateInr: 168 }, { id: 3, kind: "PURCHASE", createdByName: "Ravi", rateInr: null }]);
    expect(visibleEntries(rows, by("manager"), "ravi")[2].rateInr).toBe(140);
    expect(visibleEntries(rows, by("manager"), "ravi")).toHaveLength(3);
    expect(visibleEntries(rows, by("manager"), "ravi")[0].rateInr).toBe(168);
  });
  it("with costs hidden: no remembered buying rates and no supplier bills, selling rates kept", () => {
    const rates = { "SALE:sunflower": 168, "PURCHASE:sunflower": 140, "FRESH_CRUSH:karadi:kg": 300, "PURCHASE:_": 5 };
    expect(withoutCostRates(rates, by("counter"))).toEqual({ "SALE:sunflower": 168, "FRESH_CRUSH:karadi:kg": 300 });
    expect(withoutCostRates(rates, by("manager"))).toEqual(rates);
    expect(withoutCostRates(rates, OWNER_PERMS)).toEqual(rates);
    expect(withoutCostRates(null, by("counter"))).toEqual({});
    const bills = [{ id: "b1", billNo: "A-1", date: "2026-11-01", partyId: "p1", subtotalInr: 1000, cgstInr: 25, sgstInr: 25, igstInr: 0, totalInr: 1050, notes: "paid 1050", lineItems: [{ itemId: "i1", name: "Seed", qty: 40, unit: "kg", rateInr: 25, gstRatePct: 5, lineSubtotalInr: 1000, lineTaxInr: 50, lineTotalInr: 1050 }] }];
    const hidden = billsFor(bills, by("counter"));
    expect(hidden).toEqual([{ id: "b1", billNo: "A-1", date: "2026-11-01", partyId: "p1", subtotalInr: 0, cgstInr: 0, sgstInr: 0, igstInr: 0, totalInr: 0, notes: null, costHidden: true, lineItems: [{ itemId: "i1", name: "Seed", qty: 40, unit: "kg", rateInr: 0, gstRatePct: 5, lineSubtotalInr: 0, lineTaxInr: 0, lineTotalInr: 0 }] }]);
    expect(JSON.stringify(hidden)).not.toMatch(/1050|1000|"rateInr":25/); // quantities stay, no rupee figure survives
    expect(bills[0].totalInr).toBe(1050); // the original is untouched
    expect(billsFor(bills, by("godown"))[0]).toMatchObject({ costHidden: true, totalInr: 0 });
    expect(billsFor(bills, by("manager"))).toBe(bills);
    expect(billsFor(bills, OWNER_PERMS)).toBe(bills);
  });
});
