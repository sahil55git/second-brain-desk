// Reports — CSV export, a deterministic (no-AI) summary, and the
// business-data context string the AI endpoint grounds its answers in.
// Pure functions over the DTOs, so they're unit-testable and reused by
// both the Reports desk (client) and /api/ai (server).

import type { JobWorkIntakeDTO, DailyClosingDTO, MfgBatchDTO } from "./types";
import { STANDARD_RATE, expectedSettlementWithRate, KHALI_SPLIT } from "./calculations";
import { computeBarrelYield } from "./mfgCalculations";

export type DateRange = "today" | "week" | "month" | "all";

export interface ReportData {
  jobWork: JobWorkIntakeDTO[];
  closing: DailyClosingDTO[];
  mfg: MfgBatchDTO[];
}

export const RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};

function rangeStart(range: DateRange): number {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.getTime();
  }
  if (range === "week") return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (range === "month") return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export function inRange<T extends { createdAt: string }>(rows: T[], range: DateRange): T[] {
  const start = rangeStart(range);
  if (start === 0) return rows;
  return rows.filter((r) => new Date(r.createdAt).getTime() >= start);
}

// --- CSV --------------------------------------------------------------

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function buildReportCsv(data: ReportData, range: DateRange): string {
  const lines: string[] = [];
  const jw = inRange(data.jobWork, range);
  const cl = inRange(data.closing, range);
  const mf = inRange(data.mfg, range);

  lines.push(`Second Brain Desk — report (${RANGE_LABELS[range]})`);
  lines.push("");

  // Job-Work
  lines.push("JOB-WORK INTAKES");
  lines.push(
    csvRow([
      "Date", "Customer", "Auto/Vehicle", "Seed kg", "Cake", "Due (₹)",
      "Status", "Settlement (₹)", "Notes",
    ])
  );
  for (const e of jw) {
    const due = expectedSettlementWithRate(e, STANDARD_RATE[e.cakeOwnership]);
    lines.push(
      csvRow([
        e.createdAt, e.customer, e.vehicleNo ?? "", e.seedKg,
        e.cakeOwnership === "SHOP" ? "Shop" : "Customer",
        due.toFixed(2),
        e.settled ? "Paid" : "Unpaid",
        e.settlementAmountInr ?? "",
        e.notes ?? "",
      ])
    );
  }
  lines.push("");

  // Manufacturing
  lines.push("MANUFACTURING BATCHES");
  lines.push(
    csvRow([
      "Date", "Barrel", "Item", "Seed kg", "Actual oil kg", "Efficiency %",
      "Oil-cake kg", "Status", "Flags",
    ])
  );
  for (const b of mf) {
    const y = computeBarrelYield({
      suppliers: (b.suppliers || []).map((s) => ({ name: s.name, seedKg: s.seedKg })),
      step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg,
      refOilPct: b.refOilPct, moisturePct: b.moisturePct,
      systemOilKgOverride: b.systemOilKgOverride,
    });
    const flags = [
      y.massBalanceFlagged && "mass-balance",
      y.shortExtraFlagged && "short/extra",
      y.cakeFlagged && "oil-cake",
      y.yieldPoor && "poor-yield",
    ].filter(Boolean).join("; ");
    lines.push(
      csvRow([
        b.date, b.barrel, b.productItem, y.totalSeedKg,
        y.actualOilKg?.toFixed(1) ?? "",
        y.extractionEfficiencyPct?.toFixed(1) ?? "",
        y.actualCakeKg ?? "",
        y.complete ? "Complete" : "Settling",
        flags,
      ])
    );
  }
  lines.push("");

  // Daily Closing
  lines.push("DAILY CLOSING COUNTS");
  lines.push(
    csvRow(["Date", "Session", "System cash", "Counter cash", "Diff", "Mismatch"])
  );
  for (const c of cl) {
    lines.push(
      csvRow([
        c.date, c.session === "AFTERNOON" ? "Afternoon" : "9 PM",
        c.systemCashInr, c.counterCashInr, c.cashDiffInr,
        c.cashMismatch ? "FLAGGED" : "ok",
      ])
    );
  }

  return lines.join("\n");
}

// --- Deterministic summary (no AI) ------------------------------------

export interface SummaryStats {
  range: DateRange;
  jobWorkCount: number;
  jobWorkUnpaid: number;
  jobWorkDueTotal: number;
  khaliStockKg: number;
  mfgTotal: number;
  mfgSettling: number;
  mfgFlagged: number;
  oilProducedKg: number;
  closingCount: number;
  cashMismatches: number;
  stockGaps: number;
}

export function computeSummary(data: ReportData, range: DateRange): SummaryStats {
  const jw = inRange(data.jobWork, range);
  const cl = inRange(data.closing, range);
  const mf = inRange(data.mfg, range);

  const jobWorkUnpaid = jw.filter((e) => !e.settled).length;
  const jobWorkDueTotal = jw
    .filter((e) => !e.settled)
    .reduce((s, e) => s + expectedSettlementWithRate(e, STANDARD_RATE[e.cakeOwnership]), 0);
  // Khali stock is a running total across ALL shop-kept job-work, not
  // range-limited (it's a stock level, not a period flow).
  const khaliStockKg = data.jobWork
    .filter((e) => e.cakeOwnership === "SHOP")
    .reduce((s, e) => s + (e.seedKg * KHALI_SPLIT.khaliPct) / 100, 0);

  let mfgSettling = 0;
  let mfgFlagged = 0;
  let oilProducedKg = 0;
  for (const b of mf) {
    const y = computeBarrelYield({
      suppliers: (b.suppliers || []).map((s) => ({ name: s.name, seedKg: s.seedKg })),
      step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg,
      refOilPct: b.refOilPct, moisturePct: b.moisturePct,
      systemOilKgOverride: b.systemOilKgOverride,
    });
    if (!y.complete) mfgSettling++;
    if (y.complete && (y.massBalanceFlagged || y.shortExtraFlagged || y.cakeFlagged || y.yieldPoor))
      mfgFlagged++;
    if (y.complete) oilProducedKg += y.actualOilKg || 0;
  }

  const cashMismatches = cl.filter((c) => c.cashMismatch).length;
  let stockGaps = 0;
  for (const c of cl) {
    if (!c.stock) continue;
    for (const v of Object.values(c.stock)) {
      const gap = v.gap ?? v.diff ?? 0;
      if (Math.abs(gap) >= 0.5) stockGaps++;
    }
  }

  return {
    range,
    jobWorkCount: jw.length,
    jobWorkUnpaid,
    jobWorkDueTotal,
    khaliStockKg,
    mfgTotal: mf.length,
    mfgSettling,
    mfgFlagged,
    oilProducedKg,
    closingCount: cl.length,
    cashMismatches,
    stockGaps,
  };
}

export function summaryText(data: ReportData, range: DateRange): string {
  const s = computeSummary(data, range);
  const lines = [
    `${RANGE_LABELS[range]} summary`,
    ``,
    `Job-Work: ${s.jobWorkCount} intake(s), ${s.jobWorkUnpaid} unpaid (₹${s.jobWorkDueTotal.toFixed(0)} due). Khali stock ~${s.khaliStockKg.toFixed(0)} kg.`,
    `Manufacturing: ${s.mfgTotal} batch(es), ${s.mfgSettling} still settling, ${s.mfgFlagged} flagged. ~${s.oilProducedKg.toFixed(0)} kg oil produced.`,
    `Daily Closing: ${s.closingCount} count(s), ${s.cashMismatches} cash mismatch(es), ${s.stockGaps} stock gap(s) ≥ 0.5 kg.`,
  ];
  return lines.join("\n");
}

// --- AI context -------------------------------------------------------

// A compact, recency-limited text block describing the business data, so
// the AI answers from real figures. Kept small (last ~15 per log).
export function buildBusinessContext(data: ReportData): string {
  const lines: string[] = [];
  const jw = data.jobWork.slice(0, 15);
  const cl = data.closing.slice(0, 15);
  const mf = data.mfg.slice(0, 15);

  const s = computeSummary(data, "all");
  lines.push("=== KEY FIGURES (all time) ===");
  lines.push(
    `Job-Work: ${data.jobWork.length} intakes, ${s.jobWorkUnpaid} unpaid, ₹${s.jobWorkDueTotal.toFixed(0)} due. Khali stock ~${s.khaliStockKg.toFixed(0)} kg.`
  );
  lines.push(
    `Manufacturing: ${data.mfg.length} batches, ${s.mfgSettling} settling, ${s.mfgFlagged} flagged, ~${s.oilProducedKg.toFixed(0)} kg oil produced.`
  );
  lines.push(
    `Daily Closing: ${data.closing.length} counts, ${s.cashMismatches} cash mismatches, ${s.stockGaps} stock gaps.`
  );

  lines.push("");
  lines.push("=== RECENT JOB-WORK INTAKES ===");
  for (const e of jw) {
    const due = expectedSettlementWithRate(e, STANDARD_RATE[e.cakeOwnership]);
    lines.push(
      `${e.createdAt.slice(0, 10)} ${e.customer} — ${e.seedKg}kg, cake ${e.cakeOwnership}, ${e.settled ? "PAID" : `unpaid (₹${due.toFixed(0)} due)`}`
    );
  }

  lines.push("");
  lines.push("=== RECENT MANUFACTURING BATCHES ===");
  for (const b of mf) {
    const y = computeBarrelYield({
      suppliers: (b.suppliers || []).map((x) => ({ name: x.name, seedKg: x.seedKg })),
      step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg,
      refOilPct: b.refOilPct, moisturePct: b.moisturePct, systemOilKgOverride: b.systemOilKgOverride,
    });
    const flags = [
      y.massBalanceFlagged && "MASS-BALANCE",
      y.shortExtraFlagged && "SHORT/EXTRA",
      y.cakeFlagged && "OIL-CAKE",
      y.yieldPoor && "POOR-YIELD",
    ].filter(Boolean).join(",");
    lines.push(
      `${b.date} barrel ${b.barrel} (${b.productItem}) — ${y.complete ? "complete" : "settling"}, oil ${y.actualOilKg?.toFixed(1) ?? "?"}kg (${y.extractionEfficiencyPct?.toFixed(1) ?? "?"}%)${flags ? ` [${flags}]` : ""}`
    );
  }

  lines.push("");
  lines.push("=== RECENT DAILY CLOSING COUNTS ===");
  for (const c of cl) {
    lines.push(
      `${c.date} ${c.session} — system ₹${c.systemCashInr}, counter ₹${c.counterCashInr}, diff ₹${c.cashDiffInr}${c.cashMismatch ? " [MISMATCH]" : ""}`
    );
  }

  return lines.join("\n");
}
