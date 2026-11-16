import { describe, expect, it } from "vitest";
import { canClaim, parseHold, HOLD_CLAIM_MS } from "../counterHold";

describe("held counter bills", () => {
  it("cleans a held bill and works out its total", () => {
    const r = parseHold({ lines: [{ item: "karadi", label: "Karadi", qty: 1.8, unit: "kg", rate: 260, source: "steady", tareKg: 0.25, grossKg: 2.05 }], pay: "UPI", party: " Ramesh ", adjust: { discount: 8 } });
    if (!r.ok) throw new Error(r.error);
    expect(r.total).toBe(460);
    expect(r.label).toBe("Ramesh");
    expect(r.data.lines[0]).toMatchObject({ tareKg: 0.25, grossKg: 2.05, source: "steady" });
  });
  it("labels a walk-in and refuses junk", () => {
    const r = parseHold({ lines: [{ item: "karadi", qty: 1, rate: 260 }, { item: "cake", qty: 2, rate: 42 }] });
    expect(r.ok && r.label).toBe("Walk-in · 2 items");
    expect(parseHold({ lines: [] }).ok).toBe(false);
    expect(parseHold({ lines: [{ item: "x", qty: "a", rate: 1 }] }).ok).toBe(false);
  });
  it("lets only one device work on a hold until it goes quiet", () => {
    const now = Date.now();
    expect(canClaim({ openedBy: null, openedAt: null }, "tab1", now)).toBe(true);
    expect(canClaim({ openedBy: "tab1", openedAt: new Date(now) }, "tab1", now)).toBe(true);
    expect(canClaim({ openedBy: "tab1", openedAt: new Date(now) }, "phone", now)).toBe(false);
    expect(canClaim({ openedBy: "tab1", openedAt: new Date(now - HOLD_CLAIM_MS - 1) }, "phone", now)).toBe(true);
  });
});
