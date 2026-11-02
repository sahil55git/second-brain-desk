import { describe, expect, it } from "vitest";
import { catalog, menuText, orderSummary, parseOrder, priceOrder } from "../waOrder";
import type { RateCards } from "../money";

const cards: RateCards = { lists: [{ key: "retail", name: "Retail", rates: { "groundnut oil": 190, "mustard oil": 170, "ekatva 1l": 160 } }], parties: {}, defaultList: "retail" };
const items = catalog(cards);

describe("WhatsApp orders", () => {
  it("reads several lines", () => {
    const o = parseOrder("5 L mustard, 2 kg groundnut oil and 3 ekatva", items);
    expect(o.lines).toEqual([
      { item: "mustard oil", qty: 5, unit: "ltr" },
      { item: "groundnut oil", qty: 2, unit: "kg" },
      { item: "ekatva 1l", qty: 3, unit: "kg" },
    ]);
    expect(o.unknown).toEqual([]);
  });
  it("reads Hindi", () => {
    expect(parseOrder("दो लीटर सरसों तेल", items).lines).toEqual([{ item: "mustard oil", qty: 2, unit: "ltr" }]);
  });
  it("keeps what it cannot read", () => {
    expect(parseOrder("hello, 2 kg rice", items).unknown).toEqual(["hello", "2 kg rice"]);
  });
  it("prices from the rate card", () => {
    const p = priceOrder([{ item: "mustard oil", qty: 5, unit: "ltr" }], cards, null);
    expect(p.total).toBe(850);
    expect(orderSummary(p.lines, p.total)).toContain("Mustard Oil — 5 ltr × ₹170 = ₹850");
    expect(menuText(cards, null)).toContain("Groundnut Oil: ₹190");
  });
});
