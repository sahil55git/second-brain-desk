import { describe, expect, it } from "vitest";
import { ensurePayOption, parseShow, SHOW_ALL, SHOW_KEYS, SHOW_SIMPLE } from "../counterShow";

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
  it("at least one of Cash / UPI / Udhaar always stays", () => {
    const none = parseShow({ payCash: false, payUpi: false, payCredit: false });
    expect(none.payCash).toBe(true);
    const two = parseShow({ payCash: false, payUpi: false });
    expect(two.payCredit).toBe(true);
    expect(two.payCash).toBe(false);
    expect(ensurePayOption({ ...SHOW_ALL, payCash: false, payUpi: false, payCredit: false }).payCash).toBe(true);
  });
  it("the simple screen hides split and discount but keeps the pay choices", () => {
    expect(SHOW_SIMPLE.paySplit).toBe(false);
    expect(SHOW_SIMPLE.discount).toBe(false);
    expect(SHOW_SIMPLE.payCash && SHOW_SIMPLE.payUpi && SHOW_SIMPLE.payCredit).toBe(true);
  });
});

describe("header items can be hidden", () => {
  it("scale status, Set up scale, Items and the Desk link are separate switches", () => {
    for (const k of ["scaleStatus", "scaleSetup", "itemsBtn", "deskLink"] as const) {
      expect(SHOW_KEYS).toContain(k);
      expect(parseShow({ [k]: false })[k]).toBe(false);
      expect(parseShow({})[k]).toBe(true);
    }
  });
  it("the simple screen hides them", () => {
    expect(SHOW_SIMPLE.scaleStatus || SHOW_SIMPLE.scaleSetup || SHOW_SIMPLE.itemsBtn || SHOW_SIMPLE.deskLink).toBe(false);
  });
});
