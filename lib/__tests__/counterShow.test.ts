import { describe, expect, it } from "vitest";
import { parseShow, SHOW_ALL, SHOW_KEYS, SHOW_SIMPLE } from "../counterShow";

describe("counter buttons shown", () => {
  it("everything shows by default and for broken data", () => {
    expect(parseShow(null)).toEqual(SHOW_ALL);
    expect(parseShow("x")).toEqual(SHOW_ALL);
    expect(SHOW_KEYS.every((k) => parseShow({})[k])).toBe(true);
  });
  it("only an explicit false hides a button", () => {
    const s = parseShow({ byAmount: false, tare: 0, totalBox: "no", plu: false });
    expect(s.byAmount).toBe(false);
    expect(s.plu).toBe(false);
    expect(s.tare).toBe(true);
    expect(s.totalBox).toBe(true);
  });
  it("the simple screen hides the extras but keeps weighing and billing", () => {
    expect(SHOW_SIMPLE.byAmount).toBe(false);
    expect(SHOW_SIMPLE.totalBox).toBe(false);
    expect(SHOW_SIMPLE.readWeight).toBe(true);
    expect(SHOW_SIMPLE.bills).toBe(true);
    expect(parseShow(SHOW_SIMPLE)).toEqual(SHOW_SIMPLE);
  });
});
