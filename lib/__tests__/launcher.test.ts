import { describe, expect, it } from "vitest";
import { addItem, cleanLink, cleanPath, cleanTarget, DEFAULT_ITEMS, moveItem, normalizePrefs, removeItem, resolveOpening, updateItem } from "../launcher";

describe("launcher helpers", () => {
  it("falls back to defaults when nothing is saved", () => {
    const p = normalizePrefs(null);
    expect(p.items.length).toBe(DEFAULT_ITEMS.length);
    expect(p.gest).toEqual({ hover: "peek", right: "menu", long: "peek", triple: "full" });
  });

  it("cleans web links and refuses scripts", () => {
    expect(cleanLink("gst.gov.in")).toBe("https://gst.gov.in/");
    expect(cleanLink("javascript:alert(1)")).toBe("");
    expect(cleanLink("localhost")).toBe("");
    expect(cleanLink("")).toBe("");
  });

  it("only allows in-app paths for apps", () => {
    expect(cleanPath("stock")).toBe("/stock");
    expect(cleanPath("//evil.com")).toBe("");
    expect(cleanPath("/a b")).toBe("");
  });

  it("only accepts known register functions", () => {
    expect(cleanTarget("Function", "SALE")).toBe("sale");
    expect(cleanTarget("Function", "rm-rf")).toBe("");
  });

  it("drops broken saved items, duplicates and bad gestures", () => {
    const p = normalizePrefs({
      items: [
        { id: "a", label: "Ok", kind: "App", target: "/stock" },
        { id: "a", label: "Dup", kind: "App", target: "/stock" },
        { id: "b", label: "", kind: "App", target: "/x" },
        { id: "c", label: "Bad", kind: "Link", target: "javascript:1" },
      ],
      gest: { hover: "menu", right: "pop", long: "nope" },
      fabSide: "left",
    });
    expect(p.items.map((i) => i.id)).toEqual(["a"]);
    expect(p.gest.hover).toBe("peek"); // hover can't be a menu
    expect(p.gest.right).toBe("pop");
    expect(p.gest.long).toBe("peek");
    expect(p.fabSide).toBe("left");
  });

  it("adds, edits, moves and removes items", () => {
    const base = normalizePrefs(null);
    const bad = addItem(base, { kind: "Link", label: "X", target: "nope" }, "n1");
    expect(bad.error).toBeTruthy();
    const ok = addItem(base, { kind: "Link", label: "Vendor", target: "example.com" }, "n1");
    expect(ok.error).toBeUndefined();
    expect(ok.prefs.items.at(-1)?.target).toBe("https://example.com/");
    const off = updateItem(ok.prefs, "n1", { fab: false });
    expect(off.items.at(-1)?.fab).toBe(false);
    const moved = moveItem(off, "n1", -1);
    expect(moved.items.at(-2)?.id).toBe("n1");
    expect(removeItem(moved, "n1").items.some((i) => i.id === "n1")).toBe(false);
  });

  it("works out what an item opens", () => {
    expect(resolveOpening({ kind: "Function", target: "sale" }, "pop")).toEqual({ mode: "embed", url: "/register?open=sale&embed=1" });
    expect(resolveOpening({ kind: "App", target: "/?desk=parties" }, "pop")).toEqual({ mode: "embed", url: "/?desk=parties&embed=1" });
    expect(resolveOpening({ kind: "App", target: "/stock" }, "tab")).toEqual({ mode: "external", url: "/stock" });
    expect(resolveOpening({ kind: "Link", target: "https://x.com/" }, "pop").mode).toBe("embed");
    expect(resolveOpening({ kind: "Link", target: "https://x.com/" }, "tab").mode).toBe("external");
  });
});
