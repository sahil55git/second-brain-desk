import { describe, expect, it } from "vitest";
import type { BizData } from "@/lib/bizReports";
import { lastPurchase, PRODUCTS, priceFor, productOf, profitRows, reminderRows, reminderText, runOut, supplierYield, waPhone, yieldLots } from "@/lib/insights";

const reg = (o: Record<string, unknown>) => ({ id: Math.random().toString(36), item: null, itemLabel: null, qty: null, unit: null, rateInr: null, paymentMode: "CASH", partyName: null, notes: null, createdAt: `${o.date}T06:00:00Z`, ...o });
const batch = (o: Record<string, unknown>) => ({ id: Math.random().toString(36), mill: null, barrel: "A1", productItem: "Karadi oil", date: "2026-10-10", step1Kg: 120, step2Kg: 30, step3Kg: 70, step4Kg: 380, refOilPct: 22, moisturePct: null, systemOilKgOverride: null, ...o });
const base = (o: Partial<BizData>): BizData => ({ sales: [], purchases: [], expenses: [], register: [], jobWork: [], mfg: [], closings: [], items: [], refunds: [], adjustments: [], ...o }) as unknown as BizData;

describe("products", () => {
  it("knows the oils by their names", () => {
    expect(productOf("Karadi seeds")?.key).toBe("karadi");
    expect(productOf("ಶೇಂಗಾ oil")?.key).toBe("groundnut");
    expect(productOf("tea")).toBeNull();
  });
});

describe("yield", () => {
  it("oil % per lot and per supplier", () => {
    const d = base({
      mfg: [
        batch({ suppliers: [{ name: "Syed Noor", seedKg: 600 }] }),
        batch({ barrel: "A2", suppliers: [{ name: "Ganesh", seedKg: 600 }], step1Kg: 100, step2Kg: 20, step3Kg: 60 }),
      ] as never,
    });
    const lots = yieldLots(d, "2026-10-01");
    expect(lots).toHaveLength(2);
    expect(lots[0].oilPct).toBeGreaterThan(lots[1].oilPct);
    const s = supplierYield(d, "2026-10-01");
    expect(s[0].supplier).toBe("Syed Noor");
    expect(s[0].vsAvg).toBeGreaterThan(0);
    expect(s[1].vsAvg).toBeLessThan(0);
  });
});

describe("stock run-out and last purchase", () => {
  it("days left from the counts, last purchase from the register", () => {
    const closings = [
      { date: "2026-11-01", session: "NIGHT", createdAt: "2026-11-01T15:00:00Z", stock: { karadi1: { today: 300, sale: 50 } } },
      { date: "2026-10-31", session: "NIGHT", createdAt: "2026-10-31T15:00:00Z", stock: { karadi1: { today: 350, sale: 50 } } },
    ];
    const register = [reg({ date: "2026-11-01", kind: "PURCHASE", itemLabel: "Karadi seeds", partyName: "Syed noor", qty: 3830, unit: "kg", rateInr: 72, amountInr: 275760 })];
    const d = base({ closings: closings as never, register: register as never });
    const k = runOut(d, "2026-11-01").find((r) => r.key === "karadi")!;
    expect(k.stockKg).toBe(300);
    expect(k.perDay).toBe(50);
    expect(k.daysLeft).toBe(6);
    expect(k.level).toBe("low");
    expect(k.lastBuy).toMatchObject({ party: "Syed noor", rate: 72, seed: true });
    expect(lastPurchase(d, PRODUCTS.find((p) => p.key === "groundnut")!)).toBeNull();
  });
});

describe("profit", () => {
  it("cost from seed rate and oil %, margin against sales", () => {
    const register = [
      reg({ date: "2026-11-01", kind: "PURCHASE", itemLabel: "Karadi seeds", qty: 1000, unit: "kg", rateInr: 72, amountInr: 72000 }),
      reg({ date: "2026-10-30", kind: "SALE", item: "karadi", qty: 10, unit: "kg", rateInr: 330, amountInr: 3300 }),
    ];
    const rows = profitRows(base({ register: register as never }), "2026-11-01", { karadi: { oilPct: 25, crushPerKg: 8, cakeRate: 20 } });
    const k = rows.find((r) => r.key === "karadi")!;
    // 4 kg seed per kg oil: 288 + 8 − 20 × (4 − 1 − 0.08) = 237.6
    expect(k.costPerKg).toBeCloseTo(237.6, 1);
    expect(k.sell).toBe(330);
    expect(k.marginPerKg).toBeCloseTo(92.4, 1);
    expect(k.profit30).toBe(924);
    expect(priceFor(300, 8)).toBe(327);
  });
});

describe("udhaar reminders", () => {
  it("orders late promises first, finds phones, writes the message", () => {
    const rows = reminderRows(
      [{ name: "Ramesh", balance: 900, last: "2026-10-01" }, { name: "Suresh", balance: 500, last: "2026-10-30" }, { name: "Paid", balance: 0, last: "2026-10-01" }],
      { ramesh: "98450 12345" },
      [{ name: "Suresh", kind: "PROMISE", date: "2026-10-31", amount: 500, note: null, at: "2026-10-30T10:00:00Z" }],
      "2026-11-01",
    );
    expect(rows.map((r) => r.name)).toEqual(["Suresh", "Ramesh"]);
    expect(rows[0].promiseLate).toBe(true);
    expect(rows[1]).toMatchObject({ days: 31, phone: "98450 12345", remindedOn: null });
    expect(waPhone("98450 12345")).toBe("919845012345");
    expect(waPhone("123")).toBeNull();
    const t = reminderText({ name: "Ramesh", balance: 900, shop: "Mahadev Traders", vpa: "shop@ybl", today: "2026-11-01" });
    expect(t).toContain("₹900");
    expect(t).toContain("upi://pay?pa=shop%40ybl");
  });
});
