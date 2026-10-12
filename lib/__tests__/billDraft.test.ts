import { describe, expect, it } from "vitest";
import { clampDiscount, holdLabel, parseHeldDraft } from "../billDraft";

describe("held bill drafts", () => {
  it("clamps discounts into 0–100", () => {
    expect(clampDiscount(250)).toBe(100);
    expect(clampDiscount(-3)).toBe(0);
    expect(clampDiscount("abc")).toBe(0);
    expect(clampDiscount("7.5")).toBe(7.5);
  });
  it("rejects drafts with no lines or a non-object body", () => {
    expect(parseHeldDraft(null)).toBeNull();
    expect(parseHeldDraft({ lines: [] })).toBeNull();
  });
  it("keeps a clean draft and falls back to CASH for unknown payment modes", () => {
    const d = parseHeldDraft({
      partyId: "p1",
      date: "2026-10-12",
      paymentMode: "BITCOIN",
      notes: "call before delivery",
      lines: [{ name: "Ekatva 5 L", qty: "2", rateInr: "165", discountPct: 999 }],
    });
    expect(d?.paymentMode).toBe("CASH");
    expect(d?.lines[0].discountPct).toBe("100");
    expect(d?.lines[0].unit).toBe("kg");
  });
  it("labels walk-in bills when no party is chosen", () => {
    expect(holdLabel("")).toBe("Walk-in customer");
    expect(holdLabel("Ramesh Stores")).toBe("Ramesh Stores");
  });
});
