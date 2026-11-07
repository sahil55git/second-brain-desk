import { describe, expect, it } from "vitest";
import { EMPTY_MORE, normalizeMore, safeHref } from "../cashMore";

describe("cash sheet · own cards", () => {
  it("accepts app pages and https only", () => {
    expect(safeHref("/reports")).toBe(true);
    expect(safeHref("https://example.com/x")).toBe(true);
    expect(safeHref("//evil.com")).toBe(false);
    expect(safeHref("javascript:alert(1)")).toBe(false);
    expect(safeHref("http://example.com")).toBe(false);
    expect(safeHref("")).toBe(false);
  });
  it("falls back to the default for junk", () => {
    expect(normalizeMore(null)).toEqual(EMPTY_MORE);
    expect(normalizeMore("x")).toEqual(EMPTY_MORE);
    expect(normalizeMore({ hidden: 5, custom: "no" })).toEqual({ hidden: [], custom: [], collapsed: false });
  });
  it("drops cards with an unsafe link and keeps the rest", () => {
    const m = normalizeMore({
      hidden: ["w-calc", 3, "q-sale"],
      collapsed: true,
      custom: [
        { id: "a", icon: "", title: "Reports", href: "/reports" },
        { id: "b", icon: "x", title: "Bad", href: "javascript:alert(1)" },
        { id: "c", title: "no id href" },
      ],
    });
    expect(m.hidden).toEqual(["w-calc", "q-sale"]);
    expect(m.collapsed).toBe(true);
    expect(m.custom).toEqual([{ id: "a", icon: "🔗", title: "Reports", href: "/reports" }]);
  });
});
