import { describe, expect, it } from "vitest";
import { CLASSIC_LOOK, DEFAULT_LOOK, THEME_PRESETS, clampLook, contrastRatio, deriveSurface, fontHref, mixHex, parseThemeCode, themeCode } from "../appearance";
import { migrateLook } from "../customize";

describe("glass looks", () => {
  it("the default is Neon glass, and every glass preset carries its skin", () => {
    expect(DEFAULT_LOOK.skin).toBe("neon");
    expect(DEFAULT_LOOK.preset).toBe("neon-glass");
    for (const k of ["neon-glass", "warm-frost", "soft-light"]) expect(THEME_PRESETS.find((p) => p.key === k)?.look?.skin).toBeTruthy();
    expect(clampLook({ skin: "sparkly" }).skin).toBe("none");
  });
  it("a device on the untouched original look moves to Neon glass, keeping its text size", () => {
    const m = migrateLook({ look: { ...CLASSIC_LOOK, textScale: 1.2 } });
    expect(m.skin).toBe("neon");
    expect(m.custom).toEqual(DEFAULT_LOOK.custom);
    expect(m.textScale).toBe(1.2);
  });
  it("a device where someone chose a theme keeps it, and nothing changes after version 2", () => {
    expect(migrateLook({ look: { ...CLASSIC_LOOK, preset: "midnight" } }).skin).toBe("none");
    expect(migrateLook({ look: { ...CLASSIC_LOOK }, lookV: 2 }).skin).toBe("none");
    expect(migrateLook(null).skin).toBe("neon"); // brand-new device
  });
});

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
