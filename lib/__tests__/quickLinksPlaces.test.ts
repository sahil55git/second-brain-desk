import { describe, it, expect } from "vitest";
import { QUICK_LINKS, REGISTER_OPEN_KEYS, visibleLinks } from "../quickLinks";
import { PLACES, newPlaces, placeAddress } from "../bidarPlaces";
import { dueNote, monthStats, nextStep, suggestNextBarrel, type BatchLite } from "../mfgQuick";

describe("quick links", () => {
  it("has unique ids and hrefs starting with /", () => {
    expect(new Set(QUICK_LINKS.map((l) => l.id)).size).toBe(QUICK_LINKS.length);
    for (const l of QUICK_LINKS) expect(l.href.startsWith("/")).toBe(true);
  });
  it("register links use known open keys", () => {
    for (const l of QUICK_LINKS) {
      const m = /^\/register\?open=(\w+)$/.exec(l.href);
      if (m) expect(REGISTER_OPEN_KEYS as readonly string[]).toContain(m[1]);
    }
  });
  it("hides owner-only tiles from staff", () => {
    expect(visibleLinks(false).some((l) => l.ownerOnly)).toBe(false);
    expect(visibleLinks(true).length).toBeGreaterThan(visibleLinks(false).length);
  });
});

describe("bidar places", () => {
  it("has no case-insensitive duplicates", () => {
    const k = PLACES.map((p) => p.name.trim().toLowerCase());
    expect(new Set(k).size).toBe(k.length);
    expect(PLACES.length).toBeGreaterThan(100);
  });
  it("newPlaces skips existing names regardless of case/space", () => {
    const all = newPlaces(["city", "village", "town"], []);
    const some = newPlaces(["city", "village", "town"], [` ${PLACES[0].name.toUpperCase()} `]);
    expect(some.length).toBe(all.length - 1);
    expect(newPlaces(["town"], []).every((p) => p.group === "town")).toBe(true);
    expect(placeAddress(PLACES[0])).toContain("Karnataka");
  });
});

describe("mfg quick helpers", () => {
  const b = (o: Partial<BatchLite>): BatchLite => ({ date: "2026-10-01", suppliers: [{ name: "x", seedKg: 100 }], step1Kg: null, step2Kg: null, step3Kg: null, step4Kg: null, ...o } as BatchLite);
  it("finds next step", () => {
    expect(nextStep(b({}))).toBe(1);
    expect(nextStep(b({ step1Kg: 10 }))).toBe(2);
    expect(nextStep(b({ step1Kg: 10, step2Kg: 5, step3Kg: 3, step4Kg: 1 }))).toBeNull();
  });
  it("flags skim late after 2 days", () => {
    expect(dueNote(b({ step1Kg: 10 }), "2026-10-04")?.late).toBe(true);
    expect(dueNote(b({ step1Kg: 10 }), "2026-10-01")?.late).toBe(false);
  });
  it("suggests next barrel label", () => {
    expect(suggestNextBarrel("A12")).toBe("A13");
    expect(suggestNextBarrel("Barrel 7")).toBe("Barrel 8");
    expect(suggestNextBarrel(undefined)).toBe("");
  });
  it("month stats count only that month", () => {
    const s = monthStats([b({ date: "2026-09-30" }), b({ date: "2026-10-02" })], "2026-10");
    expect(s.barrels).toBe(1);
  });
});
