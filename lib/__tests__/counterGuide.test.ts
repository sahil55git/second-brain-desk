import { describe, expect, it } from "vitest";
import { counterStep } from "../counterGuide";

describe("counter guide", () => {
  it("empty bill, scale on: put the item on the scale", () => expect(counterStep({ lines: 0, kg: 0, scaleOn: true })).toBe("weigh"));
  it("empty bill, no scale: tap an item", () => expect(counterStep({ lines: 0, kg: 0, scaleOn: false })).toBe("pick"));
  it("a weight is waiting: tap the item", () => expect(counterStep({ lines: 0, kg: 2.45, scaleOn: true })).toBe("pick"));
  it("items on the bill, scale empty: save", () => expect(counterStep({ lines: 2, kg: 0, scaleOn: true })).toBe("save"));
  it("another weight after an item: pick again", () => expect(counterStep({ lines: 1, kg: 1, scaleOn: true })).toBe("pick"));
});
