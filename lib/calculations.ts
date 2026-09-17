// Pure calculation functions ported faithfully from the "Second Brain Desk"
// Claude Artifact (see claude/dashboard-app-plan.md, Versions 11-14 for
// Job-Work, Version 23 for the Daily Closing oil-stock tally).
//
// These are the highest-stakes functions in this codebase (money and
// GST/ITC-04-adjacent), so keep them pure, deterministic and covered by
// tests in lib/__tests__/calculations.test.ts. Do not invent new
// thresholds or rates — every number below is taken directly from the
// plan doc / SOPs.

export type CakeOwnership = "SHOP" | "CUSTOMER";

// Standard per-kg settlement rates (SOP: sop-job-work-crushing.md, Step 6).
// SHOP keeps the cake -> shop pays the customer ₹6/kg (Scenario A).
// CUSTOMER keeps the cake -> customer pays the shop ₹10/kg (Scenario B).
export const STANDARD_RATE: Record<CakeOwnership, number> = {
  SHOP: 6,
  CUSTOMER: 10,
};

// Oil-cake (khali) split used for the Job-Work Khali stock widget
// (plan doc, "Khali (cake) stock widget"): 22% oil / 78% khali.
export const KHALI_SPLIT = { oilPct: 22, khaliPct: 78 };

// Oil can types and prices (plan doc, Version 14).
export const CAN_TYPES = {
  can15: { label: "15 kg can", rate: 50 },
  can5new: { label: "5 kg new can", rate: 40 },
  can5old: { label: "5 kg old can", rate: 20 },
} as const;

export type CanKey = keyof typeof CAN_TYPES;
export type CansInput = Partial<Record<CanKey, { qty: number; rate: number }>>;

export interface JobWorkEntryLike {
  seedKg: number;
  cakeOwnership: CakeOwnership;
  advanceCustomerInr?: number | null;
  advanceAutoInr?: number | null;
  cans?: CansInput | null;
}

/** Total ₹ charged for oil cans taken at intake. */
export function canCharge(cans?: CansInput | null): number {
  if (!cans) return 0;
  return Object.values(cans).reduce((sum, c) => {
    if (!c) return sum;
    return sum + (Number(c.qty) || 0) * (Number(c.rate) || 0);
  }, 0);
}

/**
 * The gross settlement amount before advances/cans, at the standard rate
 * for this entry's cake-ownership direction (or an override rate).
 */
export function grossSettlement(
  entry: JobWorkEntryLike,
  ratePerKg?: number
): number {
  const rate = ratePerKg ?? STANDARD_RATE[entry.cakeOwnership];
  return entry.seedKg * rate;
}

/**
 * expectedSettlement() — the amount actually due at the standard rate.
 *
 * SHOP direction (shop pays customer): due = gross − advances − can charge.
 * CUSTOMER direction (customer pays shop): due = gross + can charge − advances
 * (cans and any shortfall are still owed by the customer to the shop; an
 * advance already paid reduces what's still due).
 */
export function expectedSettlement(entry: JobWorkEntryLike): number {
  return expectedSettlementWithRate(entry, STANDARD_RATE[entry.cakeOwnership]);
}

/**
 * expectedSettlementWithRate() — same as expectedSettlement(), but at an
 * explicit ₹/kg rate override (plan doc, Version 12: "sometimes it's ₹7").
 */
export function expectedSettlementWithRate(
  entry: JobWorkEntryLike,
  ratePerKg: number
): number {
  const gross = grossSettlement(entry, ratePerKg);
  const advanceTotal =
    (entry.advanceCustomerInr || 0) + (entry.advanceAutoInr || 0);
  const cans = canCharge(entry.cans);

  if (entry.cakeOwnership === "SHOP") {
    return gross - advanceTotal - cans;
  }
  // CUSTOMER keeps the cake: customer pays shop.
  return gross + cans - advanceTotal;
}

export interface PaySplit {
  customer: number;
  auto: number;
}

/**
 * defaultPaySplit() — the default customer/auto split shown in the inline
 * Pay row (plan doc, Versions 12-14).
 *
 * Only the SHOP direction (shop pays customer) ever splits between the
 * customer and their auto driver — the CUSTOMER direction (customer pays
 * shop) has no auto-driver payment to split, so it's a single amount on
 * the customer's side.
 *
 * Default split is 50/50 of the gross total, with each side's own advance
 * netted out of their own half, and the can charge deducted only from the
 * customer's half (cans are always the customer's charge, never split
 * with the auto driver — plan doc, Version 14).
 */
export function defaultPaySplit(
  entry: JobWorkEntryLike,
  ratePerKg?: number
): PaySplit {
  const rate = ratePerKg ?? STANDARD_RATE[entry.cakeOwnership];
  const gross = grossSettlement(entry, rate);
  const cans = canCharge(entry.cans);
  const advanceCustomer = entry.advanceCustomerInr || 0;
  const advanceAuto = entry.advanceAutoInr || 0;

  if (entry.cakeOwnership === "CUSTOMER") {
    // Single amount, customer side only.
    const due = expectedSettlementWithRate(entry, rate);
    return { customer: due, auto: 0 };
  }

  const half = gross / 2;
  const customer = half - advanceCustomer - cans;
  const auto = half - advanceAuto;
  return { customer, auto };
}

// ---------------------------------------------------------------------------
// Daily Closing — cash gap flag
// ---------------------------------------------------------------------------

// The ₹300 mismatch threshold (sop-daily-cash-stock-closing.md, Step 4).
export const CASH_GAP_THRESHOLD_INR = 300;

export interface CashGapResult {
  systemCash: number;
  diff: number; // systemCash - counterCash
  flagged: boolean; // |diff| >= ₹300
}

export interface CashInputs {
  cashInOpening: number;
  cashInSales: number;
  cashInOther: number;
  cashOutGrn: number;
  cashOutExpenses: number;
  cashOutSalary: number;
  cashOutUpi: number;
  cashOutDraw: number;
  cashOutOther: number;
}

export function computeSystemCash(inputs: CashInputs): number {
  const totalIn = inputs.cashInOpening + inputs.cashInSales + inputs.cashInOther;
  const totalOut =
    inputs.cashOutGrn +
    inputs.cashOutExpenses +
    inputs.cashOutSalary +
    inputs.cashOutUpi +
    inputs.cashOutDraw +
    inputs.cashOutOther;
  return totalIn - totalOut;
}

/**
 * cashGapFlag() — System Cash vs Counter Cash, and the ₹300 mismatch flag.
 * (sop-daily-cash-stock-closing.md, Step 4.) The afternoon count is
 * escalated to Sahil on the spot when flagged; the 9 PM count is recorded
 * only (the mismatch surfaces the next day via the accountant's pass) —
 * this function just computes the flag either way; the caller decides
 * whether to escalate immediately based on session.
 */
export function cashGapFlag(
  inputs: CashInputs,
  counterCashInr: number
): CashGapResult {
  const systemCash = computeSystemCash(inputs);
  const diff = systemCash - counterCashInr;
  return {
    systemCash,
    diff,
    flagged: Math.abs(diff) >= CASH_GAP_THRESHOLD_INR,
  };
}

// ---------------------------------------------------------------------------
// Daily Closing — 10-product oil-stock tally (plan doc, Version 14 + 23)
// ---------------------------------------------------------------------------

export interface StockProductConfig {
  key: string;
  label: string;
  hasReportSale: boolean; // K2 has no Report-Sale cross-check
}

// The 10 tracked products (plan doc, Version 23). Palm Oil is explicitly
// excluded (discontinued).
export const STOCK_PRODUCTS: StockProductConfig[] = [
  { key: "sf", label: "Sunflower", hasReportSale: true },
  { key: "karadi1", label: "Karadi (tank 1)", hasReportSale: true },
  { key: "k2", label: "K2", hasReportSale: false },
  { key: "groundnut", label: "Groundnut Oil", hasReportSale: true },
  { key: "golddrop", label: "Gold Drop Oil", hasReportSale: true },
  { key: "soyabean", label: "Soyabean Oil", hasReportSale: true },
  { key: "coconut", label: "Coconut Oil", hasReportSale: true },
  { key: "teapowder", label: "Tea Powder", hasReportSale: true },
  { key: "til", label: "Til Oil", hasReportSale: true },
  { key: "mustard", label: "Mustard Oil", hasReportSale: true },
];

export interface StockProductEntry {
  today?: number | null;
  reportSale?: number | null;
}

export interface StockProductComputed {
  today: number | null;
  yesterday: number | null;
  yesterdaySource: "auto" | "override" | "none";
  reportSale?: number | null;
  sale?: number | null; // yesterday - today (products with hasReportSale)
  gap?: number | null; // sale - reportSale
  diff?: number | null; // today - yesterday (K2 only, no reportSale)
}

/**
 * getYesterdayStock() — "most recent prior entry, only if not already
 * filled" lookup (plan doc, Version 14): looks back through prior closing
 * entries (already sorted oldest->newest by the caller, or any order —
 * this function sorts internally) for the most recent one, strictly
 * before `beforeTimestamp`, that actually recorded a Today value for this
 * product. An explicit `override` (Version 18's optional "yesterday's
 * closing" box) always wins over the auto-lookup.
 */
export function getYesterdayStock(
  priorEntries: Array<{ createdAt: string | Date; stock?: Record<string, StockProductEntry> | null }>,
  productKey: string,
  beforeTimestamp: string | Date,
  override?: number | null
): { value: number | null; source: "auto" | "override" | "none" } {
  if (override !== undefined && override !== null && !Number.isNaN(override)) {
    return { value: override, source: "override" };
  }

  const before = new Date(beforeTimestamp).getTime();

  const candidates = priorEntries
    .filter((e) => new Date(e.createdAt).getTime() < before)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  for (const entry of candidates) {
    const val = entry.stock?.[productKey]?.today;
    if (val !== undefined && val !== null && !Number.isNaN(Number(val))) {
      return { value: Number(val), source: "auto" };
    }
  }

  return { value: null, source: "none" };
}

/**
 * computeStockTally() — Sale/Gap (or Diff for K2) for one product on one
 * closing entry. Mirrors computeStockTally() from the artifact.
 */
export function computeProductTally(
  config: StockProductConfig,
  today: number | null | undefined,
  reportSale: number | null | undefined,
  yesterday: number | null,
  yesterdaySource: "auto" | "override" | "none"
): StockProductComputed {
  const todayVal = today ?? null;

  if (!config.hasReportSale) {
    // K2: Diff = Today - Yesterday only, no Sale/Report-Sale/Gap.
    const diff =
      todayVal !== null && yesterday !== null ? todayVal - yesterday : null;
    return { today: todayVal, yesterday, yesterdaySource, diff };
  }

  const sale =
    todayVal !== null && yesterday !== null ? yesterday - todayVal : null;
  const reportSaleVal = reportSale ?? null;
  const gap =
    sale !== null && reportSaleVal !== null ? sale - reportSaleVal : null;

  return {
    today: todayVal,
    yesterday,
    yesterdaySource,
    reportSale: reportSaleVal,
    sale,
    gap,
  };
}

// The gap-chip tolerance used by the ledger's Stock chips / the triage
// panel (plan doc, Version 23: "0.5kg or more").
export const STOCK_GAP_CHIP_THRESHOLD_KG = 0.5;
