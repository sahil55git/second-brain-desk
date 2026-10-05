import { describe, expect, it } from "vitest";
import { THEME_PRESETS, clampLook, contrastRatio, deriveSurface, fontHref, mixHex, parseThemeCode, themeCode } from "../appearance";

describe("appearance", () => {
  it("theme codes round-trip (Linear-style)", () => {
    const t = { bg: "#0f0f10", fg: "#eeeff1", card: "#151516", accent: "#d25e65" };
    expect(parseThemeCode(themeCode(t))).toEqual(t);
    expect(parseThemeCode("0f0f10, eeeff1, d25e65")?.accent).toBe("#d25e65"); // 3 colours: card derived
    expect(parseThemeCode("not a theme")).toBeNull();
  });
  it("derived surfaces: dark detection, borders and soft text between bg and fg", () => {
    const d = deriveSurface("#0f0f10", "#eeeff1");
    expect(d.isDark).toBe(true);
    expect(deriveSurface("#ffffff", "#222222").isDark).toBe(false);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(deriveSurface("#000000", "#ffffff", null, true).soft).toBe("#ffffff"); // high contrast: soft = text
  });
  it("every preset is readable (WCAG AA 4.5:1 for text)", () => {
    for (const p of THEME_PRESETS) if (p.colors) expect(contrastRatio(p.colors.bg, p.colors.fg)).toBeGreaterThanOrEqual(4.5);
  });
  it("clampLook keeps values in safe ranges and drops junk", () => {
    const l = clampLook({ textScale: 9, radius: -1, panelOpacity: 0.1, font: "comic", density: "huge", custom: { bg: "x" } });
    expect(l.textScale).toBe(1.4);
    expect(l.radius).toBe(0);
    expect(l.panelOpacity).toBe(0.5);
    expect(l.font).toBe("default");
    expect(l.density).toBe("comfortable");
    expect(l.custom).toBeNull();
  });
  it("only web fonts trigger a download", () => {
    expect(fontHref("system")).toBeNull();
    expect(fontHref("kannada")).toContain("Noto+Sans+Kannada");
  });
});
