import { describe, expect, it } from "vitest";
import { allowed, defaultItems, findPlu, nextPlu, parseCounterConfig, registerItem } from "../counterConfig";

const cat = [
  { key: "sunflower", icon: "🌻", en: "Sunflower", kn: "ಸೂರ್ಯಕಾಂತಿ" },
  { key: "karadi", icon: "🟠", en: "Karadi", kn: "ಕರಡಿ" },
  { key: "other", icon: "➕", en: "Other", kn: "ಇತರೆ" },
];

describe("counter set-up", () => {
  it("starts from the register's sale items numbered 1, 2 …", () => {
    expect(defaultItems(cat).map((i) => [i.plu, i.key, i.kn])).toEqual([[1, "sunflower", "ಸೂರ್ಯಕಾಂತಿ"], [2, "karadi", "ಕರಡಿ"]]);
    expect(parseCounterConfig(null, cat).items).toHaveLength(2);
  });
  it("cleans stored items: unique PLU and key, new items, units, rates", () => {
    const c = parseCounterConfig(
      {
        items: [
          { key: "karadi", plu: 5, en: "Karadi", kn: "ಕರಡಿ", rate: 260 },
          { key: "karadi", plu: 6, en: "Karadi again" },
          { plu: 5, en: "Til oil", kn: "ಎಳ್ಳೆಣ್ಣೆ", unit: "L", rate: "320" },
          { en: "" },
        ],
        staffLocks: ["rate", "rate", "nonsense", "udhaar"],
      },
      cat
    );
    expect(c.items.map((i) => [i.plu, i.key, i.unit, i.rate])).toEqual([[1, "new:til oil", "L", 320], [5, "karadi", "kg", 260]]);
    expect(c.staffLocks).toEqual(["rate", "udhaar"]);
    expect(findPlu(c.items, 5)?.en).toBe("Karadi");
    expect(nextPlu([1, 2, 5])).toBe(3);
  });
  it("locks only staff, and sends new items as Other with their name", () => {
    const c = parseCounterConfig({ items: [{ key: "karadi", plu: 1, en: "Karadi" }], staffLocks: ["discount"] }, cat);
    expect(allowed(c, false, "discount")).toBe(false);
    expect(allowed(c, true, "discount")).toBe(true);
    expect(allowed(c, false, "rate")).toBe(true);
    expect(registerItem({ key: "new:til oil", en: "Til oil" })).toEqual({ item: "other", label: "Til oil" });
    expect(registerItem({ key: "karadi", en: "Karadi" })).toEqual({ item: "karadi", label: "Karadi" });
  });
});
