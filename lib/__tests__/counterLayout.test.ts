import { describe, expect, it } from "vitest";
import { layoutShow, LAYOUTS, parseLayout, pickLayout } from "../counterLayout";
import { SHOW_ALL } from "../counterShow";

describe("counter layouts", () => {
  it("parses the saved setting, anything odd is standard", () => {
    expect(parseLayout({ layout: "steps" })).toBe("steps");
    expect(parseLayout("big")).toBe("big");
    expect(parseLayout({ layout: "weird" })).toBe("standard");
    expect(parseLayout(null)).toBe("standard");
  });
  it("this device's choice wins, otherwise the owner's choice for all staff", () => {
    expect(pickLayout({ layout: "simple" }, "shop")).toBe("simple");
    expect(pickLayout({ layout: "simple" }, null)).toBe("simple");
    expect(pickLayout({ layout: "simple" }, "big")).toBe("big");
    expect(pickLayout(null, "")).toBe("standard");
  });
  it("standard keeps the device's own buttons untouched", () => {
    expect(layoutShow("standard", SHOW_ALL)).toBe(SHOW_ALL);
  });
  it("simple and steps hide the header items and extras", () => {
    for (const l of ["simple", "steps"] as const) {
      const s = layoutShow(l, SHOW_ALL);
      expect(s.scaleStatus || s.scaleSetup || s.itemsBtn || s.deskLink || s.byAmount || s.plu).toBe(false);
      expect(s.payCash).toBe(true);
    }
  });
  it("big hides the setup items but keeps the weight and pay controls", () => {
    const s = layoutShow("big", SHOW_ALL);
    expect(s.scaleSetup || s.itemsBtn || s.deskLink).toBe(false);
    expect(s.scaleStatus && s.readWeight && s.payCash).toBe(true);
  });
  it("a layout never turns a hidden button back on", () => {
    expect(layoutShow("big", { ...SHOW_ALL, bills: false }).bills).toBe(false);
    expect(LAYOUTS.length).toBe(5);
  });
});

import { parseTabletOpts } from "../counterLayout";
describe("tablet layout", () => {
  it("is a valid layout and keeps every button", () => {
    expect(parseLayout("tablet")).toBe("tablet");
    expect(layoutShow("tablet", { ...SHOW_ALL, bills: false }).bills).toBe(false);
    expect(layoutShow("tablet", SHOW_ALL)).toEqual(SHOW_ALL);
  });
  it("reads the hide options safely", () => {
    expect(parseTabletOpts(null)).toEqual({ hideRead: false, hideTotal: false, hideOil: false });
    expect(parseTabletOpts({ hideRead: true, hideOil: "yes" })).toEqual({ hideRead: true, hideTotal: false, hideOil: false });
  });
});
