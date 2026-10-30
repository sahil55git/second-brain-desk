import { describe, expect, it } from "vitest";
import type { BizData } from "../bizReports";
import { unifiedLedger } from "../ledger";

const span = { from: "2026-10-01", to: "2026-10-31" };
const base = (over: Partial<BizData> = {}): BizData => ({
  sales: [], purchases: [], expenses: [], jobWork: [], closings: [], items: [], mfg: [], refunds: [],
  register: [
    { id: "r1", date: "2026-10-11", kind: "SALE", item: "sunflower", itemLabel: null, qty: 2, unit: "l", rateInr: 165, amountInr: 330, paymentMode: "CASH", partyName: "Ravi", createdAt: "2026-10-11T09:00:00Z" } as never,
    { id: "r2", date: "2026-10-12", kind: "EXPENSE", item: "diesel", itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 500, paymentMode: "CASH", partyName: null, createdAt: "2026-10-12T08:00:00Z" } as never,
  ],
  ...over,
});

describe("unified ledger", () => {
  it("combines register money rows and sorts newest first", () => {
    const l = unifiedLedger(base(), span);
    expect(l.rows[0].date).toBe("2026-10-12"); // newest first
    expect(l.rows[1].date).toBe("2026-10-11");
    expect(l.totalIn).toBe(330);
    expect(l.totalOut).toBe(500);
  });
  it("manufacturing batches appear in the same list with no money", () => {
    const d = base({
      mfg: [{ id: "b1", barrel: "A1", productItem: "Karadi oil", mill: "Mill 2", date: "2026-10-10T00:00:00.000Z" } as never],
    });
    const l = unifiedLedger(d, span);
    const batch = l.rows.find((r) => r.source === "Manufacturing");
    expect(batch).toMatchObject({ type: "BATCH", detail: "Barrel A1 · Karadi oil", in: 0, out: 0 });
    expect(l.sources).toContain("Manufacturing");
    expect(l.totalIn).toBe(330);
  });
  it("entries outside the span are left out", () => {
    const l = unifiedLedger(base({ register: [{ id: "old", date: "2025-01-01", kind: "SALE", amountInr: 999, paymentMode: "CASH", createdAt: "2025-01-01T00:00:00Z" } as never] }), span);
    expect(l.totalIn).toBe(0);
  });
});

describe("ledger with a batch that has no date", () => {
  it("skips it instead of crashing", () => {
    const d = { sales: [], purchases: [], expenses: [], register: [], jobWork: [], closings: [], items: [], mfg: [{ id: "x", date: null, barrel: "1", productItem: "Karadi", mill: null }] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(unifiedLedger(d as any, { from: "2026-10-01", to: "2026-10-30" }).rows).toEqual([]);
  });
});
