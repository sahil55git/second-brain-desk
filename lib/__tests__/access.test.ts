import { describe, expect, it } from "vitest";
import { BUILTIN_PROFILES, OWNER_PERMS, canFn, canPage, effectivePerms, kindToFn, normalizePerms, pagesForPath, pathAllowed, visibleEntries } from "../access";

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
  it("hides other users' entries and rates", () => {
    const rows = [{ id: 1, createdByName: "Ravi", rateInr: 168 }, { id: 2, createdByName: "Manjula", rateInr: 214 }];
    const p = by("counter");
    expect(visibleEntries(rows, p, "ravi")).toEqual([{ id: 1, createdByName: "Ravi", rateInr: null }]);
    expect(visibleEntries(rows, by("manager"), "ravi")).toHaveLength(2);
    expect(visibleEntries(rows, by("manager"), "ravi")[0].rateInr).toBe(168);
  });
});
