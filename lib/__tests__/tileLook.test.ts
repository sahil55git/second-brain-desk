import { describe, expect, it } from "vitest";
import { cleanLook, DEFAULT_TILE_LOOK, isDefaultLook, textOn, tileColor, withTile } from "../tileLook";

describe("Quick links tile look", () => {
  it("anything odd in storage falls back to the defaults", () => {
    expect(cleanLook(null)).toEqual(DEFAULT_TILE_LOOK);
    const l = cleanLook({ style: "neon", shape: "circle", size: "xl", opacity: 7, oneColor: "red", groupColors: { entry: "#ABCDEF", nope: "#000000", tally: "blue" }, tiles: { sale: { color: "#123456", icon: "  🛒🛒🛒🛒 ", image: "javascript:alert(1)", title: "  Bill  " }, x: {} } });
    expect(l).toMatchObject({ style: "theme", shape: "circle", size: "m", opacity: 1, oneColor: null, groupColors: { entry: "#abcdef" } });
    expect(l.tiles).toEqual({ sale: { color: "#123456", icon: "🛒🛒🛒", title: "Bill" } });
    expect(cleanLook({ opacity: 0.01 }).opacity).toBe(0.15);
  });

  it("a tile's colour: its own, else one colour for all, else its section's", () => {
    let l = cleanLook({ groupColors: { entry: "#111111" } });
    expect(tileColor(l, "sale", "entry")).toBe("#111111");
    expect(tileColor(l, "jw", "jobwork")).toBe("#1d5fa8");
    l = { ...l, oneColor: "#222222" };
    expect(tileColor(l, "sale", "entry")).toBe("#222222");
    l = withTile(l, "sale", { color: "#333333" });
    expect(tileColor(l, "sale", "entry")).toBe("#333333");
  });

  it("clearing every change of a tile removes it", () => {
    let l = withTile(DEFAULT_TILE_LOOK, "sale", { icon: "₹", title: "Bill" });
    expect(l.tiles.sale).toEqual({ icon: "₹", title: "Bill" });
    l = withTile(l, "sale", { icon: null, title: "" });
    expect(l.tiles.sale).toBeUndefined();
    expect(isDefaultLook(l)).toBe(true);
  });

  it("keeps small logos, refuses big or non-picture data", () => {
    const small = "data:image/png;base64," + "A".repeat(100);
    expect(withTile(DEFAULT_TILE_LOOK, "sale", { image: small }).tiles.sale?.image).toBe(small);
    expect(withTile(DEFAULT_TILE_LOOK, "sale", { image: "data:image/png;base64," + "A".repeat(70_000) }).tiles.sale).toBeUndefined();
    expect(withTile(DEFAULT_TILE_LOOK, "sale", { image: "data:text/html;base64,AAAA" }).tiles.sale).toBeUndefined();
  });

  it("picks readable text on a colour", () => {
    expect(textOn("#1e8a4c")).toBe("#ffffff");
    expect(textOn("#ffd54a")).toBe("#111111");
  });
});
