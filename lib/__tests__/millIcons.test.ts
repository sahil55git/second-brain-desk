import { describe, expect, it } from "vitest";
import { COMBOS, ICONS, ICON_GROUPS, allIconIds, iconRows, millIconSvg, searchIcons } from "../millIcons";
import { cleanOwn } from "../tileLook";

describe("millIcons", () => {
  it("has unique ids and every group is known", () => {
    const ids = allIconIds();
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(ICON_GROUPS.map((g) => g.id));
    for (const i of ICONS) expect(groups.has(i.group)).toBe(true);
  });
  it("every combo's base icon exists and every id renders an svg", () => {
    const base = new Set(ICONS.map((i) => i.id));
    for (const c of COMBOS) expect(base.has(c.base)).toBe(true);
    for (const id of allIconIds()) expect(millIconSvg(id)).toContain("<svg");
  });
  it("unknown id renders nothing", () => expect(millIconSvg("nope")).toBe(""));
  it("uses plain Buy/Sell names", () => {
    const names = COMBOS.map((c) => c.name);
    for (const n of ["Oil buy", "Oil sell", "Seed buy", "Khali buy", "Khali sell"]) expect(names).toContain(n);
  });
  it("searches by English and Kannada name", () => {
    const rows = iconRows();
    expect(searchIcons(rows, "barrel").length).toBeGreaterThan(2);
    expect(searchIcons(rows, "ಎಣ್ಣೆ").length).toBeGreaterThan(0);
  });
  it("tile icons keep library ids but still cut plain text to 3 letters", () => {
    expect(cleanOwn({ icon: "mi:barrel_full" }).icon).toBe("mi:barrel_full");
    expect(cleanOwn({ icon: "abcdef" }).icon).toBe("abc");
    expect(cleanOwn({ icon: "mi:<script>" }).icon).toBe("mi:");
  });
});
