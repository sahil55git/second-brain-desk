import { describe, expect, it } from "vitest";
import { counterStep } from "../counterGuide";

describe("counter guide", () => {
  it("empty bill, scale on: put the item on the scale", () => expect(counterStep({ lines: 0, kg: 0, scaleOn: true })).toBe("weigh"));
  it("empty bill, no scale: tap an item", () => expect(counterStep({ lines: 0, kg: 0, scaleOn: false })).toBe("pick"));
  it("a weight is waiting: tap the item", () => expect(counterStep({ lines: 0, kg: 2.45, scaleOn: true })).toBe("pick"));
  it("items on the bill, scale empty: save", () => expect(counterStep({ lines: 2, kg: 0, scaleOn: true })).toBe("save"));
  it("another weight after an item: pick again", () => expect(counterStep({ lines: 1, kg: 1, scaleOn: true })).toBe("pick"));
});

import { billGuide } from "../counterGuide";
describe("billGuide", () => {
  it("money first, then the goods, then nothing", () => {
    expect(billGuide({ moneyDue: true, held: true })).toBe("money");
    expect(billGuide({ moneyDue: false, held: true })).toBe("goods");
    expect(billGuide({ moneyDue: false, held: false })).toBeNull();
  });
});

describe("pay step", () => {
  it("items on the bill and no payment tapped yet: pay comes before save", () => {
    expect(counterStep({ lines: 1, kg: 0, scaleOn: true, payChosen: false })).toBe("pay");
    expect(counterStep({ lines: 1, kg: 0, scaleOn: true, payChosen: true })).toBe("save");
    expect(counterStep({ lines: 1, kg: 0, scaleOn: true })).toBe("save");
    expect(counterStep({ lines: 1, kg: 2, scaleOn: true, payChosen: false })).toBe("pick");
  });
});
