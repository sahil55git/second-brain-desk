import { describe, expect, it } from "vitest";
import type { BizData, RegisterRow } from "../bizReports";
import { barrelDeposits, bomCosts, contractProgress, cycleItems, cycleResults, cylinderKg, dipToKg, godownStacks, maintenanceDue, packingStock, settlingStatus, sparesStock, type OpsRec } from "../stockOps";
import { isOn, offKeys, pathOn, setFeature, tabOn } from "../features";
import { visibleLinks } from "../quickLinks";

const rec = (kind: string, date: string, data: Record<string, unknown>, ref: string | null = null, status = "open"): OpsRec => ({ id: Math.random().toString(36).slice(2, 10), kind, date, ref, data, status });
const reg = (o: Partial<RegisterRow>): RegisterRow => ({ id: Math.random().toString(36).slice(2), date: "2026-11-01", kind: "PURCHASE", item: null, itemLabel: null, qty: null, unit: null, rateInr: null, amountInr: 0, paymentMode: "CASH", partyName: null, notes: null, createdAt: "2026-11-01T06:00:00.000Z", ...o });
const data = (register: RegisterRow[]): BizData => ({ sales: [], purchases: [], expenses: [], register, jobWork: [], mfg: [], closings: [], items: [] });

describe("feature switches", () => {
  it("off hides tabs, links and pages; defaultOff needs on", () => {
    let s = setFeature(null, "mandi", false);
    expect(isOn(s, "mandi")).toBe(false);
    expect(tabOn(s, "mandi")).toBe(false);
    expect(tabOn(s, "yield")).toBe(true);
    s = setFeature(s, "machines", false);
    expect(pathOn(s, "/machines")).toBe(false);
    expect(visibleLinks(true, s).some((l) => l.id === "machines")).toBe(false);
    expect(isOn(s, "driveBackup")).toBe(false);
    expect(isOn(setFeature(s, "driveBackup", true), "driveBackup")).toBe(true);
    expect(offKeys(setFeature(s, "mandi", true))).toEqual(["machines", "driveBackup"]);
  });
});

describe("godown", () => {
  it("tracks bags left, drying loss and FIFO", () => {
    const st = godownStacks([
      rec("godown_in", "2026-09-01", { stack: "A1", seed: "Groundnut", bags: 50, kg: 2500, moisturePct: 9, rate: 70 }, "A1"),
      rec("godown_in", "2026-10-15", { stack: "B2", seed: "Groundnut", bags: 20, kg: 1000, moisturePct: 7 }, "B2"),
      rec("godown_out", "2026-10-20", { stack: "A1", bags: 10, kg: 500 }, "A1"),
      rec("godown_check", "2026-10-30", { stack: "A1", moisturePct: 7 }, "A1"),
    ], "2026-11-01");
    expect(st[0]).toMatchObject({ stack: "A1", bagsLeft: 40, kgLeft: 2000, fifo: true, shrinkKg: 43 });
    expect(st[0].valueInr).toBe(Math.round((2000 - 43) * 70));
    expect(st[1].fifo).toBe(false);
  });
});

describe("contracts", () => {
  it("fills from purchases and gives per-day need", () => {
    const c = contractProgress([rec("contract", "2026-10-01", { supplier: "Ravi", item: "seed", qty: 10000, unit: "kg", rate: 60, from: "2026-10-01", to: "2026-11-11" })], data([reg({ item: "seed", partyName: "Ravi", qty: 4000, rateInr: 60, date: "2026-10-10" })]), "2026-11-01");
    expect(c[0]).toMatchObject({ got: 4000, left: 6000, daysLeft: 10, perDayNeeded: 600, valueLeft: 360000 });
  });
});

describe("packing", () => {
  const recs = [
    rec("pack_item", "2026-10-01", { name: "1L bottle", unit: "pcs", cost: 6, opening: 1000, reorder: 300 }),
    rec("pack_item", "2026-10-01", { name: "Cap", cost: 0.8, opening: 1000, reorder: 200 }),
    rec("pack_bom", "2026-10-01", { sku: "Ekatva 1L", parts: [{ name: "1L bottle", qty: 1 }, { name: "Cap", qty: 1 }, { name: "Label", qty: 1 }] }),
    rec("pack_run", "2026-10-20", { sku: "Ekatva 1L", units: 750 }),
  ];
  it("deducts the BOM and flags low stock", () => {
    const s = packingStock(recs, "2026-11-01");
    expect(s[0]).toMatchObject({ name: "1L bottle", stock: 250, low: true, usedPerDay: 25, daysLeft: 10 });
  });
  it("costs the SKU", () => {
    expect(bomCosts(recs)[0]).toMatchObject({ sku: "Ekatva 1L", cost: 6.8, missing: ["Label"] });
  });
});

describe("maintenance, spares, settling, dip, cycle, deposits", () => {
  it("maintenance by hours", () => {
    const m = maintenanceDue([rec("maint_plan", "2026-10-01", { machine: "Expeller 1", task: "worm shaft", everyHours: 200 })], [
      { date: "2026-10-01", machine: "Expeller 1", kind: "service", hours: null, note: "worm shaft changed" },
      { date: "2026-10-10", machine: "Expeller 1", kind: "run", hours: 150, note: null },
      { date: "2026-10-20", machine: "expeller 1", kind: "run", hours: 70, note: null },
    ], "2026-11-01");
    expect(m[0]).toMatchObject({ hoursSince: 220, overdue: true, pct: 110 });
  });
  it("spares", () => {
    expect(sparesStock([rec("spare", "2026-10-01", { name: "Filter cloth", qty: 10, min: 4 }), rec("spare_move", "2026-10-05", { name: "Filter cloth", qty: -7 })])[0]).toMatchObject({ qty: 3, low: true });
  });
  it("settling", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    const s = settlingStatus([rec("settle", "2026-10-30", { tank: "T1", startAt: "2026-10-30T12:00:00Z", hours: 72 })], now);
    expect(s[0]).toMatchObject({ leftH: 24, ready: false, pct: 67 });
  });
  it("dip chart and cylinder", () => {
    expect(dipToKg([{ cm: 0, kg: 0 }, { cm: 100, kg: 1000 }, { cm: 150, kg: 1600 }], 125)).toBe(1300);
    expect(dipToKg([], 10)).toBeNull();
    expect(cylinderKg({ diameterCm: 100 }, 100)).toBeCloseTo(714.7, 0);
    expect(cylinderKg({ diameterCm: 100, lyingLengthCm: 200 }, 100)).toBeCloseTo(1429.4, 0);
  });
  it("cycle count picks never-counted first", () => {
    const pick = cycleItems(["a", "b", "c", "d"], "2026-11-01", [{ item: "a", date: "2026-10-30" }, { item: "b", date: "2026-10-01" }]);
    expect(pick).toHaveLength(3);
    expect(pick).not.toContain("a");
    expect(cycleResults([rec("cycle_count", "2026-11-01", { item: "x", book: 100, counted: 95 })])[0]).toMatchObject({ diff: -5, pct: -5, flag: true });
  });
  it("deposits", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    const r = barrelDeposits([
      { code: "B1", location: "CUSTOMER", holder: "Hotel Sai", sinceAt: "2026-10-01T00:00:00Z", status: "FULL", product: "groundnut", netKg: 180 },
      { code: "B2", location: "CUSTOMER", holder: "hotel sai", sinceAt: "2026-10-25T00:00:00Z", status: "FULL", product: null, netKg: null },
      { code: "B3", location: "SHOP", holder: null, sinceAt: "2026-10-01T00:00:00Z", status: "EMPTY", product: null, netKg: null },
    ], now, { perBarrelInr: 1500, paid: { "hotel sai": 1500 } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ oldestDays: 31, late: 1, depositDue: 1500 });
  });
});
