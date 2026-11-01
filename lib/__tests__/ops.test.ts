import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { anomalies, demandForecast, machineReport, poProgress, seedSplit, supplierScores, weeklyReview, type PurchaseOrderLite } from "../ops";

const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "SALE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[], extra: Partial<BizData> = {}): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [], ...extra });

describe("purchase orders", () => {
  const po: PurchaseOrderLite = { id: "p1", no: "PO-1", date: "2026-10-20", supplier: "Ravi Traders", dueDate: "2026-10-25", status: "open", lines: [{ item: "Seed", qty: 1000, unit: "kg", rate: 60 }] };
  it("fills from register purchases of that supplier after the order date", () => {
    const d = data([
      reg({ kind: "PURCHASE", item: "seed", partyName: "Ravi traders", qty: 600, rateInr: 61, amountInr: 36600, date: "2026-10-22" }),
      reg({ kind: "PURCHASE", item: "seed", partyName: "Ravi traders", qty: 500, rateInr: 59, amountInr: 29500, date: "2026-10-27" }),
      reg({ kind: "PURCHASE", item: "seed", partyName: "Other", qty: 999, date: "2026-10-22" }),
      reg({ kind: "PURCHASE", item: "seed", partyName: "Ravi traders", qty: 999, date: "2026-10-01" }),
    ]);
    const [p] = poProgress([po], d, "2026-11-01");
    expect(p.lines[0].got).toBe(1000);
    expect(p.status).toBe("done");
    expect(p.lateDays).toBe(2);
    expect(p.lines[0].avgRate).toBe(60.2);
    const s = supplierScores(d, [p], "2026-11-01");
    expect(s.find((x) => x.supplier === "ravi traders")?.onTimePct).toBe(0);
  });
  it("is open, part or late", () => {
    expect(poProgress([po], data([]), "2026-10-24")[0].status).toBe("open");
    expect(poProgress([po], data([]), "2026-10-28")[0].status).toBe("late");
    expect(poProgress([{ ...po, status: "cancelled" }], data([]), "2026-10-28")[0].status).toBe("cancelled");
  });
});

describe("machines", () => {
  const d = data([], { mfg: [{ id: "b1", mill: "Expeller 1", barrel: "A1", productItem: "Karadi oil", date: "2026-10-30", suppliers: [{ name: "Ravi", seedKg: 1000 }], step1Kg: 300, step2Kg: 100, step3Kg: 150, step4Kg: 40, refOilPct: 30, moisturePct: 1.5, systemOilKgOverride: null } as unknown as BizData["mfg"][number]] });
  it("adds up yield, sediment, power and service hours", () => {
    const rows = machineReport(d, [
      { date: "2026-10-01", machine: "expeller 1", hours: null, powerUnits: null, downtimeMin: null, kind: "service", note: null },
      { date: "2026-10-30", machine: "Expeller 1", hours: 260, powerUnits: 500, downtimeMin: 90, kind: "run", note: null },
    ], "2026-10-01", { oilRate: 150 });
    const r = rows[0];
    expect(r.machine).toBe("Expeller 1");
    expect(r.unitsPerQtl).toBe(50);
    expect(r.downtimeHrs).toBe(1.5);
    expect(r.serviceDue).toBe(true);
    expect(r.sedimentKg).toBe(40);
    expect(r.sedimentLossInr).toBe(1800);
    const split = seedSplit(r)!;
    expect(split.oil + split.sediment + split.cake + split.loss).toBeCloseTo(100, 0);
  });
});

describe("forecast", () => {
  it("projects next 4 weeks and adds festival lift", () => {
    const rows: RegisterRow[] = [];
    for (let i = 0; i < 56; i++) {
      const date = new Date(Date.parse("2026-10-31T00:00:00Z") - i * 86400000).toISOString().slice(0, 10);
      rows.push(reg({ kind: "SALE", item: "groundnut", qty: 10, date }));
    }
    const [f] = demandForecast(data(rows), "2026-10-31");
    expect(f.avg4).toBe(70);
    expect(f.next[0].festival).toBe("Diwali");
    expect(f.next[0].kg).toBeGreaterThan(f.next[2].kg);
  });
});

describe("anomalies + weekly", () => {
  it("flags a low rate, a back-dated entry and an edit", () => {
    const hist = Array.from({ length: 6 }, (_, i) => reg({ kind: "SALE", item: "groundnut", rateInr: 190, qty: 1, amountInr: 190, date: `2026-10-${String(10 + i).padStart(2, "0")}` }));
    const d = data([
      ...hist,
      reg({ kind: "SALE", item: "groundnut", rateInr: 150, qty: 10, amountInr: 1500, partyName: "Raju", date: "2026-11-01" }),
      reg({ kind: "EXPENSE", amountInr: 5000, date: "2026-10-30", createdAt: "2026-11-01T06:00:00.000Z" }),
      reg({ kind: "SALE", amountInr: 3000, date: "2026-11-01", details: { edits: [{}] } }),
    ]);
    const a = anomalies(d, "2026-11-01");
    expect(a[0]).toMatchObject({ level: "red", area: "Low rate" });
    expect(a.some((x) => x.area === "Back-dated")).toBe(true);
    expect(a.some((x) => x.area === "Edited")).toBe(true);
  });
  it("writes a weekly review", () => {
    const d = data([reg({ kind: "SALE", amountInr: 5000, date: "2026-10-28" }), reg({ kind: "SALE", amountInr: 2000, date: "2026-10-20" })]);
    const w = weeklyReview(d, "2026-11-01");
    expect(w.start).toBe("2026-10-25");
    expect(w.text).toContain("Sales ₹5,000 ▲ 150%");
  });
});
