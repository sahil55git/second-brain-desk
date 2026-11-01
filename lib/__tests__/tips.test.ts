import { describe, expect, it } from "vitest";
import { tips } from "@/lib/tips";

describe("smart tips", () => {
  it("puts the urgent things first, five at most", () => {
    const t = tips({
      runout: [
        { key: "karadi", name: "Karadi", stockKg: 300, stockDate: "2026-11-01", perDay: 50, daysLeft: 6, level: "low", lastBuy: { date: "2026-11-01", party: "Syed Noor", rate: 72, qty: 1, unit: "kg", amount: 1, seed: true } },
        { key: "sf", name: "Sunflower", stockKg: 0, stockDate: "2026-11-01", perDay: 10, daysLeft: 0, level: "out", lastBuy: null },
      ],
      udhaar: [{ name: "Ramesh", balance: 900, days: 45 }, { name: "New", balance: 100, days: 2 }],
      barrels: { toWeighFull: 6, waitingLong: 1, oldestDays: 9 },
      cashCounted: false,
      hourIst: 20,
      jobWorkOverdue: 2,
      tasksDue: [{ text: "Pay Digwal" }],
    });
    expect(t).toHaveLength(5);
    expect(t[0].text).toBe("Sunflower is out");
    expect(t.map((x) => x.icon)).toEqual(["⛔", "📌", "💵", "📦", "🛢️"]);
    expect(t[3].text).toBe("Karadi: 6 days left · last from Syed Noor ₹72");
  });
});
