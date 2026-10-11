import { describe, expect, it } from "vitest";
import { addScannedItem, applyFilledLines, blankLine, formSummary } from "@/lib/smartLines";

const items = [
  { id: "i1", name: "Refined Sunflower Oil", unit: "kg", hsnCode: "151211", gstRatePct: 5 },
  { id: "i2", name: "Karadi Oil 1L Pouch", unit: "pcs", hsnCode: "151219", gstRatePct: 5, barcode: "MT000004" },
];

describe("AI lines into the form", () => {
  it("replaces an empty form, matches items to the master and fills HSN / GST from it", () => {
    const r = applyFilledLines([blankLine()], [{ name: "REFINED SUNFLOWER", hsnCode: "", qty: 2190, unit: "kg", rateInr: 156, gstRatePct: null }, { name: "Plastic cans", hsnCode: "", qty: 10, unit: "pcs", rateInr: 40, gstRatePct: 18 }], items);
    expect(r.lines).toEqual([
      { itemId: "i1", name: "Refined Sunflower Oil", hsnCode: "151211", qty: "2190", unit: "kg", rateInr: "156", gstRatePct: "5" },
      { itemId: "", name: "Plastic cans", hsnCode: "", qty: "10", unit: "pcs", rateInr: "40", gstRatePct: "18" },
    ]);
    expect(r.matched).toEqual(["REFINED SUNFLOWER → Refined Sunflower Oil"]);
    expect(r.unmatched).toEqual(["Plastic cans"]);
  });
  it("adds below lines already typed", () => {
    const typed = { ...blankLine(), name: "Groundnut", qty: "5" };
    const r = applyFilledLines([typed], [{ name: "Refined Sunflower Oil", hsnCode: "", qty: 15, unit: "kg", rateInr: 178, gstRatePct: 5 }], items);
    expect(r.lines.map((l) => l.name)).toEqual(["Groundnut", "Refined Sunflower Oil"]);
  });
});

describe("scanned items", () => {
  it("counts packs up on the same line", () => {
    let r = addScannedItem([blankLine()], items[1]);
    expect(r).toMatchObject({ index: 0, lines: [{ itemId: "i2", qty: "1", unit: "pcs" }] });
    r = addScannedItem(r.lines, items[1]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].qty).toBe("2");
  });
  it("puts a loose item on a new line with the steady scale weight", () => {
    const r = addScannedItem([{ ...blankLine(), itemId: "i2", name: "Karadi Oil 1L Pouch", qty: "2" }], items[0], { weightKg: 14.956 });
    expect(r.index).toBe(1);
    expect(r.lines[1]).toMatchObject({ itemId: "i1", qty: "14.96", gstRatePct: "5" });
  });
});

it("summarises the form for the AI", () => {
  const s = formSummary({ Supplier: "Pawan", "Bill no.": "SIV-649", Empty: "" }, [{ ...blankLine(), name: "Sunflower", qty: "10", rateInr: "156" }, blankLine()], ["Bill total: ₹1638"]);
  expect(s).toBe("Supplier: Pawan; Bill no.: SIV-649\nLines:\n  1. Sunflower 10 kg @ ₹156\nBill total: ₹1638");
});
