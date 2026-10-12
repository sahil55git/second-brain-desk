import { describe, expect, it } from "vitest";
import { bookQtyFor, deltaFor, reversalFor, validateCorrection, type AdjustRecord } from "../stockAdjust";

const rec = (over: Partial<AdjustRecord>): AdjustRecord => ({
  id: "a1", itemId: "i1", date: "2026-10-12", bookQty: 100, actualQty: 96, qtyDelta: -4,
  reason: "BREAKAGE", note: null, reversesId: null, ...over,
});

describe("stock corrections", () => {
  it("delta is actual minus book, and nothing when they match", () => {
    expect(deltaFor(100, 96)).toBe(-4);
    expect(deltaFor(100, 103.5)).toBe(3.5);
    expect(deltaFor(100, 100)).toBeNull();
    expect(deltaFor(100, -1)).toBeNull();
  });
  it("needs a count, a known reason, and a note for Other", () => {
    expect(validateCorrection({ actualQty: "", reason: "BREAKAGE", note: "" }).ok).toBe(false);
    expect(validateCorrection({ actualQty: 5, reason: "NOPE", note: "" }).ok).toBe(false);
    expect(validateCorrection({ actualQty: 5, reason: "OTHER", note: "  " }).ok).toBe(false);
    const ok = validateCorrection({ actualQty: "5", reason: "OTHER", note: "found in store" });
    expect(ok).toMatchObject({ ok: true, actualQty: 5, note: "found in store" });
  });
  it("book quantity includes all earlier corrections", () => {
    const q = bookQtyFor("i1", { openingStockQty: 50, purchaseQty: 200, soldKeptQty: 120, adjustments: [rec({ qtyDelta: -4 }), rec({ id: "a2", itemId: "i2", qtyDelta: 9 })] });
    expect(q).toBe(126); // 50 + 200 - 120 - 4; the other item's correction is ignored
  });
  it("a reversal undoes a correction once and cannot be undone itself", () => {
    const orig = rec({});
    expect(reversalFor(orig, [orig])).toEqual({ ok: true, qtyDelta: 4 });
    const done = rec({ id: "r1", reason: "REVERSAL", reversesId: "a1", qtyDelta: 4 });
    expect(reversalFor(orig, [orig, done]).ok).toBe(false);
    expect(reversalFor(done, [orig, done]).ok).toBe(false);
  });
});

import { adjustmentReport, stockReport, type BizData } from "../bizReports";

describe("stock corrections in reports", () => {
  const data = (over: Partial<BizData> = {}): BizData =>
    ({
      sales: [], purchases: [], expenses: [], register: [], jobWork: [], mfg: [], closings: [], refunds: [],
      items: [{ id: "i1", name: "Sunflower oil", unit: "ltr", active: true, openingStockQty: 100, reorderLevelQty: null } as never],
      adjustments: [
        rec({ id: "a1", qtyDelta: -4, date: "2026-10-10" }),
        rec({ id: "r1", reason: "REVERSAL", reversesId: "a1", qtyDelta: 4, date: "2026-10-11" }),
        rec({ id: "a2", qtyDelta: -2, reason: "SPILLAGE", date: "2026-10-12" }),
      ],
      ...over,
    }) as BizData;

  it("book moves by corrections and shows them in their own column", () => {
    const row = stockReport(data(), "2026-10-12").items.find((r) => r.id === "i1")!;
    expect(row.adjustQty).toBe(-2); // -4 then reversed +4, then -2
    expect(row.book).toBe(98);
  });
  it("adjustments report lists the span, totals by reason, and counts undo separately", () => {
    const r = adjustmentReport(data(), { from: "2026-10-10", to: "2026-10-12" });
    expect(r.rows).toHaveLength(3);
    expect(r.corrections).toBe(2);
    expect(r.reversals).toBe(1);
    expect(r.byReason.SPILLAGE).toEqual({ count: 1, qty: -2 });
    expect(r.rows[0].item).toBe("Sunflower oil");
  });
});
