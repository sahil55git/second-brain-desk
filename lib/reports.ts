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

// --- Needs-attention triage (deterministic, no AI) --------------------
//
// Ported from the original artifact's Version 23 "Needs attention today"
// panel: a plain-JS pass over the same three logs, no invented tolerances
// beyond what's already established elsewhere (₹300 cash-mismatch flag
// from lib/calculations.ts, 0.5kg stock-gap and 2% mass-balance/oil-cake
// thresholds from lib/mfgCalculations.ts). The one number that isn't
// pinned down anywhere else is how many days an unsettled job-work intake
// has to sit before it counts as overdue — the original plan doc flagged
// its own 3-day default as a Claude guess never confirmed with Sahil.
// Kept here, still unconfirmed, so it's a single named constant to
// revisit rather than a magic number buried in the flagging logic.
export const JOBWORK_OVERDUE_DAYS = 3;

export type TriageSeverity = "critical" | "caution" | "info";
export type TriageDesk = "jobwork" | "closing" | "mfg";

export interface TriageItem {
  id: string;
  severity: TriageSeverity;
  desk: TriageDesk;
  message: string;
}

const SEVERITY_ORDER: Record<TriageSeverity, number> = { critical: 0, caution: 1, info: 2 };

function todayLocalStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function buildTriageItems(data: ReportData): TriageItem[] {
  const items: TriageItem[] = [];
  const now = Date.now();

  // Job-work: unsettled past JOBWORK_OVERDUE_DAYS — name the customer,
  // the age, and the amount due so this reads as a specific risk, not a
  // vague count (per the project's own compliance-flagging discipline).
  for (const e of data.jobWork) {
    if (e.settled) continue;
    const ageDays = Math.floor((now - new Date(e.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays >= JOBWORK_OVERDUE_DAYS) {
      const due = expectedSettlementWithRate(e, STANDARD_RATE[e.cakeOwnership]);
      items.push({
        id: `jw-${e.id}`,
        severity: "critical",
        desk: "jobwork",
        message: `${e.customer} — unsettled ${ageDays}d (₹${due.toFixed(0)} due, ${e.seedKg}kg seed intake on ${e.createdAt.slice(0, 10)})`,
      });
    }
  }

  // Manufacturing: a complete batch that trips mass-balance / short-extra
  // / oil-cake / poor-yield is critical (it's exactly the "unrecorded
  // stock or unbilled batch"-shaped risk the project asks to flag
  // clearly); a batch still settling is informational, not a risk.
  for (const b of data.mfg) {
    const y = computeBarrelYield({
      suppliers: (b.suppliers || []).map((s) => ({ name: s.name, seedKg: s.seedKg })),
      step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg,
      refOilPct: b.refOilPct, moisturePct: b.moisturePct,
      systemOilKgOverride: b.systemOilKgOverride,
    });
    if (y.complete && (y.massBalanceFlagged || y.shortExtraFlagged || y.cakeFlagged || y.yieldPoor)) {
      const flags = [
        y.massBalanceFlagged && "mass-balance",
        y.shortExtraFlagged && "short/extra",
        y.cakeFlagged && "oil-cake",
        y.yieldPoor && "poor-yield",
      ].filter(Boolean).join(", ");
      items.push({
        id: `mfg-${b.id}`,
        severity: "critical",
        desk: "mfg",
        message: `Barrel ${b.barrel} (${b.productItem}, ${b.date.slice(0, 10)}) flagged: ${flags}`,
      });
    } else if (!y.complete) {
      items.push({
        id: `mfg-${b.id}`,
        severity: "info",
        desk: "mfg",
        message: `Barrel ${b.barrel} (${b.productItem}) still settling`,
      });
    }
  }

  // Daily Closing: a cash mismatch is already the ₹300-threshold flag
  // computed at save time (lib/calculations.ts) — scoped to today, since
  // yesterday's escalated mismatch was (per the SOP) already handled on
  // the spot. Stock gaps are scoped to only the single most recent
  // closing (the current stock position), not every historical gap.
  const today = todayLocalStr();
  for (const c of data.closing) {
    if (c.cashMismatch && c.date === today) {
      items.push({
        id: `cl-cash-${c.id}`,
        severity: "critical",
        desk: "closing",
        message: `${c.date} ${c.session === "AFTERNOON" ? "Afternoon" : "9 PM"} count — cash diff ₹${c.cashDiffInr} (≥₹300 mismatch)`,
      });
    }
  }
  const latestClosing = data.closing.reduce<DailyClosingDTO | null>((latest, c) => {
    if (!latest) return c;
    return new Date(c.createdAt).getTime() > new Date(latest.createdAt).getTime() ? c : latest;
  }, null);
  if (latestClosing?.stock) {
    for (const [product, v] of Object.entries(latestClosing.stock)) {
      const gap = v.gap ?? v.diff ?? 0;
      if (Math.abs(gap) >= 0.5) {
        items.push({
          id: `cl-stock-${latestClosing.id}-${product}`,
          severity: "caution",
          desk: "closing",
          message: `${latestClosing.date} — ${product} stock gap ${gap.toFixed(1)}kg`,
        });
      }
    }
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
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
