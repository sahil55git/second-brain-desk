import { describe, expect, it } from "vitest";
import { DEFAULT_WIN, hideWin, moveWin, normalizeWin, showWin, toggleMin } from "../workspaceWin";

describe("workspace windows", () => {
  it("moves a window up and down, skipping hidden ones", () => {
    let s = moveWin(DEFAULT_WIN, "work", -1);
    expect(s.order.slice(0, 2)).toEqual(["work", "form"]);
    s = moveWin(s, "work", -1); // already first
    expect(s.order[0]).toBe("work");
    s = hideWin(DEFAULT_WIN, "work");
    s = moveWin(s, "jobwork", -1); // swaps with form (work is hidden)
    expect(s.order.filter((x) => x !== "work").slice(0, 2)).toEqual(["jobwork", "form"]);
  });
  it("minimises, hides and restores", () => {
    let s = toggleMin(DEFAULT_WIN, "entries");
    expect(s.min).toEqual(["entries"]);
    s = hideWin(s, "entries");
    expect(s.hid).toEqual(["entries"]);
    s = showWin(s, "entries");
    expect(s.hid).toEqual([]);
    expect(s.min).toEqual([]);
  });
  it("normalizes saved junk", () => {
    const s = normalizeWin({ order: ["entries", "bogus", "entries"], min: ["work", 5], hid: "x" });
    expect(s.order).toEqual(["entries", "form", "work", "jobwork"]);
    expect(s.min).toEqual(["work"]);
    expect(s.hid).toEqual([]);
    expect(normalizeWin(null)).toEqual(DEFAULT_WIN);
  });
});
