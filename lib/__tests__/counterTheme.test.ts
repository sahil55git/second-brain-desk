import { describe, expect, it } from "vitest";
import { accentOf, DEFAULT_THEME, onAccent, parseTheme, themeClass, themeStyle } from "../counterTheme";

describe("counter theme", () => {
  it("bad or empty saved data gives the defaults", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme("x")).toEqual(DEFAULT_THEME);
    expect(parseTheme({ preset: "red", mode: "neon", corner: 5, opacity: "abc", custom: "blue" })).toEqual(DEFAULT_THEME);
  });
  it("keeps valid choices and clamps opacity", () => {
    const t = parseTheme({ preset: "green", mode: "black", opacity: 10, corner: "rd", density: "compact", keySize: "l", backdrop: "tint", lcd: "amber" });
    expect(t).toMatchObject({ preset: "green", mode: "black", opacity: 40, corner: "rd", density: "compact", keySize: "l", backdrop: "tint", lcd: "amber" });
    expect(parseTheme({ opacity: 250 }).opacity).toBe(100);
  });
  it("custom colour is used only when chosen and only if it is a real hex", () => {
    expect(accentOf(parseTheme({ preset: "custom", custom: "#AA22CC" }))).toBe("#aa22cc");
    expect(accentOf(parseTheme({ preset: "custom", custom: "purple" }))).toBe("#1d3557");
    expect(accentOf(parseTheme({ preset: "teal", custom: "#aa22cc" }))).toBe("#237a76");
  });
  it("text on a light accent is dark, on a dark accent is white", () => {
    expect(onAccent("#eab308")).toBe("#1a1a1a");
    expect(onAccent("#1d3557")).toBe("#ffffff");
  });
  it("auto mode leaves the page colours to the device, other modes set them", () => {
    expect(themeStyle(DEFAULT_THEME)["--c-bg"]).toBeUndefined();
    expect(themeStyle({ ...DEFAULT_THEME, mode: "black" })["--c-bg"]).toBe("#000000");
    expect(themeStyle({ ...DEFAULT_THEME, opacity: 70 })["--card-a"]).toBe("70");
  });
  it("item symbols can be switched off", () => {
    expect(parseTheme({}).icons).toBe(true);
    expect(parseTheme({ icons: false }).icons).toBe(false);
    expect(parseTheme({}).pluSize).toBe("m");
    expect(parseTheme({ pluSize: "xl" }).pluSize).toBe("xl");
    expect(parseTheme({ pluSize: "huge" }).pluSize).toBe("m");
    expect(themeClass({ ...DEFAULT_THEME, pluSize: "xl" })).toContain("plu-xl");
    expect(themeClass({ ...DEFAULT_THEME, icons: false })).toBe("d-normal no-ic plu-m hc");
  });
  it("root classes", () => {
    expect(themeClass(DEFAULT_THEME)).toBe("d-normal plu-m hc");
    expect(themeClass({ ...DEFAULT_THEME, density: "roomy", backdrop: "tint" })).toBe("d-roomy tint plu-m hc");
  });
});

describe("glass backdrop", () => {
  it("is a valid background and adds the glass class", () => {
    expect(parseTheme({ backdrop: "glass" }).backdrop).toBe("glass");
    expect(themeClass({ ...DEFAULT_THEME, backdrop: "glass" })).toContain("glass");
    expect(themeClass({ ...DEFAULT_THEME, backdrop: "tint" })).not.toContain("glass");
  });
});

import { mixHex } from "../counterTheme";
describe("text colours", () => {
  it("defaults to automatic colours with strong contrast on", () => {
    const t = parseTheme({});
    expect(t).toMatchObject({ ink: "", soft: "", contrast: true });
    expect(parseTheme({ contrast: false }).contrast).toBe(false);
  });
  it("keeps only real hex text colours", () => {
    expect(parseTheme({ ink: "#FFE08A", soft: "red" })).toMatchObject({ ink: "#ffe08a", soft: "" });
  });
  it("custom text colours win over the mode colours", () => {
    const st = themeStyle({ ...DEFAULT_THEME, mode: "dark", ink: "#ffe08a", soft: "#cccccc" });
    expect(st["--c-ink"]).toBe("#ffe08a");
    expect(st["--c-soft"]).toBe("#cccccc");
  });
  it("strong contrast sets near-white text on dark and near-black on light", () => {
    expect(themeStyle({ ...DEFAULT_THEME, mode: "dark" })["--c-ink"]).toBe("#ffffff");
    expect(themeStyle({ ...DEFAULT_THEME, mode: "light" })["--c-ink"]).toBe("#0b1017");
    expect(themeStyle({ ...DEFAULT_THEME, mode: "dark", contrast: false })["--c-ink"]).toBe("#e7ebf0");
  });
  it("accent text is lightened on dark pages", () => {
    expect(mixHex("#000000", "#ffffff", 50)).toBe("#808080");
    expect(themeStyle({ ...DEFAULT_THEME, mode: "dark" })["--c-acc-text"]).not.toBe(DEFAULT_THEME.custom);
  });
});
