// Business-wide reports (the /reports hub). Pure functions over the same
// DTOs the desks already use, so every number here is reproducible and
// unit-tested in lib/__tests__/bizReports.test.ts.
//
// Sources and how they are combined:
//  - Sales      = GST sales invoices (Sales desk) + Quick Register counter
//                 sales (SALE) + fresh crush sales (FRESH_CRUSH).
//  - Purchase   = purchase bills (Purchase desk) + Quick Register PURCHASE.
//  - Expenses   = Expense desk + Quick Register EXPENSE and PAYMENT.
//  - Job-work, manufacturing, daily closing: their own tables, with the
//    existing calculation modules (lib/calculations.ts, mfgCalculations.ts).
// The Quick Register and the GST desks are separate books: the register is
// the counter cash book; the accountant may later also raise an invoice for
// the same sale. Reports therefore always show the two sources side by side
// as well as combined, so a double entry is visible rather than hidden.

import type {
  DailyClosingDTO,
  ExpenseDTO,
  ItemDTO,
  JobWorkIntakeDTO,
  MfgBatchDTO,
  PurchaseBillDTO,
  SalesInvoiceDTO,
} from "./types";
import {
  CASH_GAP_THRESHOLD_INR,
  KHALI_SPLIT,
  STANDARD_RATE,
  STOCK_GAP_CHIP_THRESHOLD_KG,
  STOCK_PRODUCTS,
  expectedSettlementWithRate,
} from "./calculations";
import { computeBarrelYield } from "./mfgCalculations";
import { JOBWORK_OVERDUE_DAYS } from "./reports";
import {
  KIND_SIDE,
  businessDate,
  freshCrushStats,
  freshCrushTotals,
  normalizeFreshCrush,
  type Mode,
  type RegisterKind,
} from "./register";

export interface RegisterRow {
  id: string;
  date: string;
  kind: RegisterKind;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  amountInr: number;
  paymentMode: Mode;
  partyName: string | null;
  notes: string | null;
  details?: unknown;
  createdAt: string;
}

export interface BizData {
  sales: SalesInvoiceDTO[];
  purchases: PurchaseBillDTO[];
  expenses: ExpenseDTO[];
  register: RegisterRow[];
  jobWork: JobWorkIntakeDTO[];
  mfg: MfgBatchDTO[];
  closings: DailyClosingDTO[];
  items: ItemDTO[];
}

export interface DateSpan {
  from: string; // YYYY-MM-DD inclusive (IST business date)
  to: string; // YYYY-MM-DD inclusive
}

export const inSpan = (date: string, s: DateSpan) => date >= s.from && date <= s.to;
const createdDate = (iso: string) => businessDate(iso);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** All dates from..to inclusive (for daily series). */
export function daysIn(s: DateSpan): string[] {
  const out: string[] = [];
  const start = new Date(`${s.from}T00:00:00Z`).getTime();
  const end = new Date(`${s.to}T00:00:00Z`).getTime();
  for (let t = start; t <= end && out.length < 400; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function presetSpan(preset: "today" | "yesterday" | "7d" | "month" | "lastMonth" | "30d", nowMs = Date.now()): DateSpan {
  const today = businessDate(nowMs);
  const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shift(today, -1), to: shift(today, -1) };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "30d":
      return { from: shift(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lastMonth": {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = shift(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
  }
}

type Bucket = { amount: number; qty: number; count: number; unit?: string };
function add(map: Record<string, Bucket>, key: string, amount: number, qty = 0, unit?: string) {
  const b = (map[key] ||= { amount: 0, qty: 0, count: 0, unit });
  b.amount += amount;
  b.qty += qty;
  b.count += 1;
  if (unit && !b.unit) b.unit = unit;
}
export function topN(map: Record<string, Bucket>, n = 10) {
  return Object.entries(map)
    .map(([key, b]) => ({ key, ...b, amount: r2(b.amount), qty: r2(b.qty) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}
function seriesFrom(days: string[], map: Record<string, number>) {
  return days.map((d) => ({ date: d, value: r2(map[d] || 0) }));
}

const REGISTER_ITEM_LABEL: Record<string, string> = {
  sunflower: "Sunflower oil",
  karadi: "Karadi oil",
  groundnut: "Groundnut oil",
  ekatva: "Ekatva",
  cake: "Oil cake (khali)",
  seed: "Seed",
  oil: "Oil",
  tins: "Tins / cans",
  labels: "Labels / packing",
  diesel: "Diesel",
  tea: "Tea / food",
  power: "Electricity",
  transport: "Transport",
  repair: "Repair",
  salary: "Salary",
  supplier: "Supplier payment",
  mustard: "Mustard",
};
export function registerItemName(e: Pick<RegisterRow, "kind" | "item" | "itemLabel">): string {
  if (e.kind === "FRESH_CRUSH") return `${REGISTER_ITEM_LABEL[e.item || ""]?.replace(/ oil$/, "") || e.itemLabel || e.item || "Seed"} oil (fresh crush)`;
  if (!e.item) {
    const plain: Partial<Record<RegisterKind, string>> = {
      SALE: "Total sale (scale slip)",
      UDHAAR_IN: "Udhaar received",
      PIGMEE: "Pigmee deposit",
      OWNER_DRAW: "Owner withdrawal",
    };
    return plain[e.kind] || "Other";
  }
  return REGISTER_ITEM_LABEL[e.item] || e.itemLabel || e.item.replace(/^c_/, "").replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export function salesReport(d: BizData, s: DateSpan) {
  const days = daysIn(s);
  const inv = d.sales.filter((x) => inSpan(x.date, s));
  const reg = d.register.filter((x) => (x.kind === "SALE" || x.kind === "FRESH_CRUSH") && inSpan(x.date, s));
  const byItem: Record<string, Bucket> = {};
  const byParty: Record<string, Bucket> = {};
  const byMode: Record<string, number> = {};
  const perDay: Record<string, number> = {};
  let invoiceTotal = 0,
    invoiceTax = 0,
    invoiceTaxable = 0,
    counterTotal = 0,
    freshCrush = 0;
  for (const x of inv) {
    invoiceTotal += x.totalInr;
    invoiceTax += x.cgstInr + x.sgstInr + x.igstInr;
    invoiceTaxable += x.subtotalInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.totalInr;
    byMode[x.paymentMode] = (byMode[x.paymentMode] || 0) + x.totalInr;
    add(byParty, x.party?.name || "—", x.totalInr);
    for (const l of x.lineItems || []) add(byItem, l.name, l.lineTotalInr, l.qty, l.unit);
  }
  for (const x of reg) {
    counterTotal += x.amountInr;
    if (x.kind === "FRESH_CRUSH") freshCrush += x.amountInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.amountInr;
    byMode[x.paymentMode] = (byMode[x.paymentMode] || 0) + x.amountInr;
    add(byParty, x.partyName || "Counter customer", x.amountInr);
    add(byItem, registerItemName(x), x.amountInr, x.qty || 0, x.unit || undefined);
  }
  return {
    total: r2(invoiceTotal + counterTotal),
    invoiceTotal: r2(invoiceTotal),
    invoiceTaxable: r2(invoiceTaxable),
    invoiceTax: r2(invoiceTax),
    invoiceCount: inv.length,
    counterTotal: r2(counterTotal),
    counterCount: reg.length,
    freshCrush: r2(freshCrush),
    byMode,
    byItem: topN(byItem, 15),
    byParty: topN(byParty, 10),
    series: seriesFrom(days, perDay),
    rows: [
      ...inv.map((x) => ({ date: x.date, source: "Invoice", ref: x.invoiceNo, party: x.party?.name || "", item: (x.lineItems || []).map((l) => l.name).join("; "), qty: "", mode: x.paymentMode, amount: x.totalInr })),
      ...reg.map((x) => ({ date: x.date, source: x.kind === "FRESH_CRUSH" ? "Fresh crush" : "Counter", ref: "", party: x.partyName || "", item: registerItemName(x), qty: x.qty ? `${x.qty} ${x.unit || ""}` : "", mode: x.paymentMode, amount: x.amountInr })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------
export function purchaseReport(d: BizData, s: DateSpan) {
  const days = daysIn(s);
  const bills = d.purchases.filter((x) => inSpan(x.date, s));
  const reg = d.register.filter((x) => x.kind === "PURCHASE" && inSpan(x.date, s));
  const byItem: Record<string, Bucket> = {};
  const bySupplier: Record<string, Bucket> = {};
  const byMode: Record<string, number> = {};
  const perDay: Record<string, number> = {};
  let billTotal = 0,
    billTax = 0,
    counterTotal = 0,
    onCredit = 0;
  for (const x of bills) {
    billTotal += x.totalInr;
    billTax += x.cgstInr + x.sgstInr + x.igstInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.totalInr;
    byMode[x.paymentMode] = (byMode[x.paymentMode] || 0) + x.totalInr;
    if (x.paymentMode === "CREDIT") onCredit += x.totalInr;
    add(bySupplier, x.party?.name || "—", x.totalInr);
    for (const l of x.lineItems || []) add(byItem, l.name, l.lineTotalInr, l.qty, l.unit);
  }
  for (const x of reg) {
    counterTotal += x.amountInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.amountInr;
    byMode[x.paymentMode] = (byMode[x.paymentMode] || 0) + x.amountInr;
    if (x.paymentMode === "CREDIT") onCredit += x.amountInr;
    add(bySupplier, x.partyName || "—", x.amountInr);
    add(byItem, registerItemName(x), x.amountInr, x.qty || 0, x.unit || undefined);
  }
  return {
    total: r2(billTotal + counterTotal),
    billTotal: r2(billTotal),
    billTax: r2(billTax),
    billCount: bills.length,
    counterTotal: r2(counterTotal),
    counterCount: reg.length,
    onCredit: r2(onCredit),
    byMode,
    byItem: topN(byItem, 15),
    bySupplier: topN(bySupplier, 10),
    series: seriesFrom(days, perDay),
    rows: [
      ...bills.map((x) => ({ date: x.date, source: "Bill", ref: x.billNo, party: x.party?.name || "", item: (x.lineItems || []).map((l) => l.name).join("; "), qty: "", mode: x.paymentMode, amount: x.totalInr })),
      ...reg.map((x) => ({ date: x.date, source: "Counter", ref: "", party: x.partyName || "", item: registerItemName(x), qty: x.qty ? `${x.qty} ${x.unit || ""}` : "", mode: x.paymentMode, amount: x.amountInr })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

// ---------------------------------------------------------------------------
// Expenses (incl. salary / supplier payments made at the counter)
// ---------------------------------------------------------------------------
export function expenseReport(d: BizData, s: DateSpan) {
  const days = daysIn(s);
  const ex = d.expenses.filter((x) => inSpan(x.date, s));
  const reg = d.register.filter((x) => (x.kind === "EXPENSE" || x.kind === "PAYMENT") && inSpan(x.date, s));
  const byCategory: Record<string, Bucket> = {};
  const perDay: Record<string, number> = {};
  let deskTotal = 0,
    counterTotal = 0,
    salary = 0,
    supplierPayments = 0;
  for (const x of ex) {
    deskTotal += x.amountInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.amountInr;
    add(byCategory, x.category || "Other", x.amountInr);
  }
  for (const x of reg) {
    counterTotal += x.amountInr;
    perDay[x.date] = (perDay[x.date] || 0) + x.amountInr;
    if (x.kind === "PAYMENT" && x.item === "salary") salary += x.amountInr;
    if (x.kind === "PAYMENT" && x.item === "supplier") supplierPayments += x.amountInr;
    add(byCategory, registerItemName(x), x.amountInr);
  }
  return {
    total: r2(deskTotal + counterTotal),
    deskTotal: r2(deskTotal),
    counterTotal: r2(counterTotal),
    salary: r2(salary),
    supplierPayments: r2(supplierPayments),
    byCategory: topN(byCategory, 20),
    series: seriesFrom(days, perDay),
    rows: [
      ...ex.map((x) => ({ date: x.date, source: "Expense desk", party: x.party?.name || "", item: x.category, mode: x.paymentMode, amount: x.amountInr })),
      ...reg.map((x) => ({ date: x.date, source: x.kind === "PAYMENT" ? "Counter payment" : "Counter expense", party: x.partyName || "", item: registerItemName(x), mode: x.paymentMode, amount: x.amountInr })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

// ---------------------------------------------------------------------------
// Job-work
// ---------------------------------------------------------------------------
export function jobWorkReport(d: BizData, s: DateSpan, nowMs = Date.now()) {
  const days = daysIn(s);
  const inRange = d.jobWork.filter((j) => inSpan(createdDate(j.createdAt), s));
  const perDay: Record<string, number> = {};
  const byCustomer: Record<string, Bucket> = {};
  let seedKg = 0,
    shopSeedKg = 0,
    customerSeedKg = 0,
    settledAmount = 0;
  for (const j of inRange) {
    const day = createdDate(j.createdAt);
    perDay[day] = (perDay[day] || 0) + j.seedKg;
    seedKg += j.seedKg;
    if (j.cakeOwnership === "SHOP") shopSeedKg += j.seedKg;
    else customerSeedKg += j.seedKg;
    add(byCustomer, j.customer, j.settled ? j.settlementAmountInr || 0 : 0, j.seedKg);
  }
  for (const j of d.jobWork) {
    if (j.settled && j.settledAt && inSpan(createdDate(j.settledAt), s)) settledAmount += j.settlementAmountInr || 0;
  }
  // Outstanding is always "as of now", across all dates.
  const outstanding = d.jobWork
    .filter((j) => !j.settled)
    .map((j) => ({
      id: j.id,
      customer: j.customer,
      date: createdDate(j.createdAt),
      seedKg: j.seedKg,
      cake: j.cakeOwnership,
      due: r2(expectedSettlementWithRate(j, STANDARD_RATE[j.cakeOwnership])),
      ageDays: Math.floor((nowMs - new Date(j.createdAt).getTime()) / 86400000),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);
  return {
    intakes: inRange.length,
    seedKg: r2(seedKg),
    shopSeedKg: r2(shopSeedKg),
    customerSeedKg: r2(customerSeedKg),
    khaliFromRangeKg: r2((shopSeedKg * KHALI_SPLIT.khaliPct) / 100),
    khaliStockKg: r2(
      (d.jobWork.filter((j) => j.cakeOwnership === "SHOP").reduce((a, j) => a + j.seedKg, 0) * KHALI_SPLIT.khaliPct) / 100
    ),
    settledAmount: r2(settledAmount),
    outstanding,
    shopOwes: r2(outstanding.filter((o) => o.cake === "SHOP").reduce((a, o) => a + o.due, 0)),
    customersOwe: r2(outstanding.filter((o) => o.cake === "CUSTOMER").reduce((a, o) => a + o.due, 0)),
    overdue: outstanding.filter((o) => o.ageDays >= JOBWORK_OVERDUE_DAYS).length,
    byCustomer: Object.entries(byCustomer)
      .map(([key, b]) => ({ key, seedKg: r2(b.qty), count: b.count, settled: r2(b.amount) }))
      .sort((a, b) => b.seedKg - a.seedKg)
      .slice(0, 10),
    series: seriesFrom(days, perDay),
  };
}

// ---------------------------------------------------------------------------
// Manufacturing (barrels) + fresh crush
// ---------------------------------------------------------------------------
export function mfgReport(d: BizData, s: DateSpan) {
  const days = daysIn(s);
  const batches = d.mfg.filter((b) => inSpan(b.date.slice(0, 10), s));
  const byProduct: Record<string, { seedKg: number; oilKg: number; batches: number; complete: number; flagged: number }> = {};
  const perDay: Record<string, number> = {};
  const rows = batches.map((b) => {
    const y = computeBarrelYield({
      suppliers: (b.suppliers || []).map((x) => ({ name: x.name, seedKg: x.seedKg })),
      step1Kg: b.step1Kg,
      step2Kg: b.step2Kg,
      step3Kg: b.step3Kg,
      step4Kg: b.step4Kg,
      refOilPct: b.refOilPct,
      moisturePct: b.moisturePct,
      systemOilKgOverride: b.systemOilKgOverride,
    });
    const flagged = y.complete && (y.massBalanceFlagged || y.shortExtraFlagged || y.cakeFlagged || y.yieldPoor);
    const p = (byProduct[b.productItem] ||= { seedKg: 0, oilKg: 0, batches: 0, complete: 0, flagged: 0 });
    p.seedKg += y.totalSeedKg;
    p.oilKg += y.actualOilKg || 0;
    p.batches += 1;
    if (y.complete) p.complete += 1;
    if (flagged) p.flagged += 1;
    const day = b.date.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + (y.actualOilKg || 0);
    return {
      id: b.id,
      date: day,
      barrel: b.barrel,
      product: b.productItem,
      seedKg: r2(y.totalSeedKg),
      oilKg: y.actualOilKg === null ? null : r2(y.actualOilKg),
      efficiencyPct: y.extractionEfficiencyPct === null ? null : r2(y.extractionEfficiencyPct),
      band: y.yieldBand,
      complete: y.complete,
      flagged,
    };
  });
  const fresh = freshCrushTotals(d.register.filter((x) => inSpan(x.date, s)));
  const freshRows = d.register
    .filter((x) => x.kind === "FRESH_CRUSH" && inSpan(x.date, s))
    .map((x) => {
      const dd = normalizeFreshCrush(x.details);
      const st = dd ? freshCrushStats(dd) : null;
      return {
        id: x.id,
        date: x.date,
        seed: registerItemName(x),
        seedKg: dd?.seedKg ?? 0,
        oilKg: dd?.oilKg ?? 0,
        soldQty: x.qty ? `${x.qty} ${x.unit || ""}` : "",
        extraKg: dd?.extraKg ?? 0,
        extraTo: dd?.extraTo || "",
        cakeKg: dd?.cakeKg ?? 0,
        yieldPct: st ? r2(st.yieldPct) : 0,
        lossFlag: !!st?.lossFlag,
        amount: x.amountInr,
      };
    });
  for (const f of freshRows) perDay[f.date] = (perDay[f.date] || 0) + f.oilKg;
  const totalOil = Object.values(byProduct).reduce((a, p) => a + p.oilKg, 0) + freshRows.reduce((a, f) => a + f.oilKg, 0);
  return {
    batches: batches.length,
    settling: rows.filter((r) => !r.complete).length,
    flagged: rows.filter((r) => r.flagged).length,
    totalOilKg: r2(totalOil),
    byProduct: Object.entries(byProduct).map(([key, p]) => ({
      key,
      ...p,
      seedKg: r2(p.seedKg),
      oilKg: r2(p.oilKg),
      yieldPct: p.seedKg ? r2((p.oilKg / p.seedKg) * 100) : 0,
    })),
    rows,
    fresh,
    freshRows,
    series: seriesFrom(days, perDay),
  };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
/**
 * Book stock per Item master entry = opening stock + purchase-bill qty −
 * sales-invoice qty, using only invoice/bill lines linked to the item.
 * Quick Register entries are free-text counter items (not linked to the
 * Item master), so they are listed separately and never silently mixed in.
 */
export function stockReport(d: BizData, asOf: string) {
  const items = d.items
    .filter((i) => i.active)
    .map((i) => {
      let inQty = 0,
        outQty = 0;
      for (const b of d.purchases) if (b.date <= asOf) for (const l of b.lineItems || []) if (l.itemId === i.id) inQty += l.qty;
      for (const x of d.sales) if (x.date <= asOf) for (const l of x.lineItems || []) if (l.itemId === i.id) outQty += l.qty;
      const book = i.openingStockQty + inQty - outQty;
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        opening: r2(i.openingStockQty),
        inQty: r2(inQty),
        outQty: r2(outQty),
        book: r2(book),
        reorderLevel: i.reorderLevelQty,
        low: i.reorderLevelQty !== null && i.reorderLevelQty !== undefined && book <= i.reorderLevelQty,
      };
    })
    .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));

  // Physical oil stock from the most recent Daily Closing count on/before asOf.
  const latest = d.closings
    .filter((c) => c.date <= asOf && c.stock && Object.keys(c.stock).length)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))[0];
  const physical = latest
    ? Object.entries(latest.stock || {}).map(([product, v]) => ({
        product,
        today: v.today ?? null,
        yesterday: v.yesterday ?? null,
        gap: v.gap ?? v.diff ?? null,
      }))
    : [];

  // Counter (register) quantities, all time up to asOf, by item and unit.
  const counter: Record<string, { inQty: number; outQty: number; unit: string }> = {};
  for (const e of d.register) {
    if (e.date > asOf || !e.qty) continue;
    if (e.kind !== "SALE" && e.kind !== "PURCHASE" && e.kind !== "FRESH_CRUSH") continue;
    const key = `${registerItemName(e)}|${e.unit || "kg"}`;
    const c = (counter[key] ||= { inQty: 0, outQty: 0, unit: e.unit || "kg" });
    if (e.kind === "PURCHASE") c.inQty += e.qty;
    else c.outQty += e.qty;
  }
  const fresh = freshCrushTotals(d.register.filter((e) => e.date <= asOf));
  return {
    items,
    lowCount: items.filter((i) => i.low).length,
    physical,
    physicalDate: latest?.date || null,
    counter: Object.entries(counter).map(([k, v]) => ({ item: k.split("|")[0], unit: v.unit, inQty: r2(v.inQty), outQty: r2(v.outQty) })),
    khaliJobWorkKg: jobWorkReport(d, { from: "0000-01-01", to: asOf }).khaliStockKg,
    freshSeedUsed: Object.entries(fresh.bySeed).map(([seed, x]) => ({ seed, seedKg: r2(x.seedKg), oilKg: r2(x.oilKg), toTankKg: r2(x.extraKg), cakeKg: r2(x.cakeKg) })),
    toTank: fresh.extraByTank,
  };
}

// ---------------------------------------------------------------------------
// Cash (counts + counter movements)
// ---------------------------------------------------------------------------
export function cashReport(d: BizData, s: DateSpan) {
  // Stock-only rows (Quick Register stock tally before a cash count) carry no cash.
  const counts = d.closings
    .filter((c) => inSpan(c.date, s) && (c as { source?: string | null }).source !== "register-stock")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const reg = d.register.filter((x) => inSpan(x.date, s));
  let cashIn = 0,
    cashOut = 0,
    upiIn = 0,
    upiOut = 0,
    creditGiven = 0,
    pigmee = 0,
    ownerDraw = 0;
  for (const e of reg) {
    const side = KIND_SIDE[e.kind];
    if (e.kind === "PIGMEE") pigmee += e.amountInr;
    else if (e.kind === "OWNER_DRAW") ownerDraw += e.amountInr;
    else if (e.paymentMode === "CASH") {
      if (side === "in") cashIn += e.amountInr;
      else cashOut += e.amountInr;
    } else if (e.paymentMode === "CREDIT") {
      if (side === "in") creditGiven += e.amountInr;
    } else if (side === "in") upiIn += e.amountInr;
    else upiOut += e.amountInr;
  }
  return {
    cashIn: r2(cashIn),
    cashOut: r2(cashOut),
    upiIn: r2(upiIn),
    upiOut: r2(upiOut),
    creditGiven: r2(creditGiven),
    pigmee: r2(pigmee),
    ownerDraw: r2(ownerDraw),
    counts: counts.map((c) => ({
      id: c.id,
      date: c.date,
      session: c.session,
      system: c.systemCashInr,
      counter: c.counterCashInr,
      diff: c.cashDiffInr,
      mismatch: c.cashMismatch,
    })),
    mismatches: counts.filter((c) => c.cashMismatch).length,
    threshold: CASH_GAP_THRESHOLD_INR,
  };
}

// ---------------------------------------------------------------------------
// Udhaar (credit) — register credit sales vs. udhaar collected, by name.
// ---------------------------------------------------------------------------
export function udhaarReport(d: BizData, asOf: string) {
  const by: Record<string, { given: number; received: number; last: string }> = {};
  for (const e of d.register) {
    if (e.date > asOf) continue;
    const name = (e.partyName || "").trim();
    if (e.paymentMode === "CREDIT" && (e.kind === "SALE" || e.kind === "FRESH_CRUSH")) {
      const p = (by[name || "(no name)"] ||= { given: 0, received: 0, last: e.date });
      p.given += e.amountInr;
      if (e.date > p.last) p.last = e.date;
    }
    if (e.kind === "UDHAAR_IN") {
      const p = (by[name || "(no name)"] ||= { given: 0, received: 0, last: e.date });
      p.received += e.amountInr;
      if (e.date > p.last) p.last = e.date;
    }
  }
  const rows = Object.entries(by)
    .map(([name, p]) => ({ name, given: r2(p.given), received: r2(p.received), balance: r2(p.given - p.received), last: p.last }))
    .sort((a, b) => b.balance - a.balance);
  return {
    rows,
    outstanding: r2(rows.reduce((a, r) => a + Math.max(0, r.balance), 0)),
    // Credit sales recorded as GST invoices (Sales desk) — receipt of these is
    // not tracked in the app yet, so they are listed, not netted.
    creditInvoices: d.sales
      .filter((x) => x.paymentMode === "CREDIT" && x.date <= asOf)
      .map((x) => ({ date: x.date, invoiceNo: x.invoiceNo, party: x.party?.name || "", amount: x.totalInr })),
  };
}

// ---------------------------------------------------------------------------
// Day book — every money movement in the span, newest first.
// ---------------------------------------------------------------------------
export function dayBook(d: BizData, s: DateSpan) {
  const rows: { at: string; date: string; source: string; type: string; party: string; detail: string; mode: string; in: number; out: number }[] = [];
  for (const e of d.register.filter((x) => inSpan(x.date, s))) {
    const side = KIND_SIDE[e.kind];
    rows.push({
      at: e.createdAt,
      date: e.date,
      source: "Quick Register",
      type: e.kind,
      party: e.partyName || "",
      detail: [registerItemName(e), e.qty ? `${e.qty} ${e.unit || ""}` : "", e.notes || ""].filter(Boolean).join(" · "),
      mode: e.paymentMode,
      in: side === "in" ? e.amountInr : 0,
      out: side === "in" ? 0 : e.amountInr,
    });
  }
  for (const x of d.sales.filter((y) => inSpan(y.date, s)))
    rows.push({ at: x.createdAt, date: x.date, source: "Sales desk", type: "INVOICE", party: x.party?.name || "", detail: x.invoiceNo, mode: x.paymentMode, in: x.totalInr, out: 0 });
  for (const x of d.purchases.filter((y) => inSpan(y.date, s)))
    rows.push({ at: x.createdAt, date: x.date, source: "Purchase desk", type: "BILL", party: x.party?.name || "", detail: x.billNo, mode: x.paymentMode, in: 0, out: x.totalInr });
  for (const x of d.expenses.filter((y) => inSpan(y.date, s)))
    rows.push({ at: x.createdAt, date: x.date, source: "Expense desk", type: "EXPENSE", party: x.party?.name || "", detail: x.category, mode: x.paymentMode, in: 0, out: x.amountInr });
  for (const j of d.jobWork) {
    const intakeDay = createdDate(j.createdAt);
    const adv = (j.advanceCustomerInr || 0) + (j.advanceAutoInr || 0);
    if (adv && inSpan(intakeDay, s))
      rows.push({ at: j.createdAt, date: intakeDay, source: "Job-work", type: "ADVANCE", party: j.customer, detail: `${j.seedKg} kg intake`, mode: "CASH", in: j.cakeOwnership === "CUSTOMER" ? adv : 0, out: j.cakeOwnership === "SHOP" ? adv : 0 });
    if (j.settled && j.settledAt && inSpan(createdDate(j.settledAt), s)) {
      const amt = j.settlementAmountInr || 0;
      rows.push({ at: j.settledAt, date: createdDate(j.settledAt), source: "Job-work", type: "SETTLEMENT", party: j.customer, detail: `${j.seedKg} kg`, mode: "CASH", in: j.cakeOwnership === "CUSTOMER" ? amt : 0, out: j.cakeOwnership === "SHOP" ? amt : 0 });
    }
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { rows, totalIn: r2(rows.reduce((a, r) => a + r.in, 0)), totalOut: r2(rows.reduce((a, r) => a + r.out, 0)) };
}

// ---------------------------------------------------------------------------
// Dashboard attention list — deterministic, specific, no AI.
// ---------------------------------------------------------------------------
export interface Attention {
  id: string;
  severity: "critical" | "caution" | "info";
  area: string;
  message: string;
}
export function attentionList(d: BizData, today: string, nowMs = Date.now()): Attention[] {
  const out: Attention[] = [];
  const jw = jobWorkReport(d, { from: today, to: today }, nowMs);
  for (const o of jw.outstanding.filter((x) => x.ageDays >= JOBWORK_OVERDUE_DAYS))
    out.push({ id: `jw-${o.id}`, severity: "critical", area: "Job-work", message: `${o.customer} — unsettled ${o.ageDays}d, ₹${o.due} due (${o.seedKg} kg on ${o.date})` });
  const m = mfgReport(d, { from: "0000-01-01", to: today });
  for (const r of m.rows.filter((x) => x.flagged)) out.push({ id: `mfg-${r.id}`, severity: "critical", area: "Manufacturing", message: `Barrel ${r.barrel} (${r.product}, ${r.date}) flagged — check yield / mass balance` });
  for (const f of m.freshRows.filter((x) => x.lossFlag && x.date >= today))
    out.push({ id: `fc-${f.id}`, severity: "caution", area: "Fresh crush", message: `${f.seed} on ${f.date}: loss over 2% (seed ${f.seedKg} kg, oil ${f.oilKg} kg, cake ${f.cakeKg} kg)` });
  for (const c of d.closings.filter((x) => x.date === today && x.cashMismatch))
    out.push({ id: `cash-${c.id}`, severity: "critical", area: "Cash", message: `${c.session === "AFTERNOON" ? "Tally 1" : "Tally 2"} today: ₹${Math.abs(c.cashDiffInr)} ${c.cashDiffInr > 0 ? "short" : "extra"} (≥ ₹${CASH_GAP_THRESHOLD_INR})` });
  const st = stockReport(d, today);
  for (const i of st.items.filter((x) => x.low)) out.push({ id: `stk-${i.id}`, severity: "caution", area: "Stock", message: `${i.name}: ${i.book} ${i.unit} in book stock — at/below reorder level ${i.reorderLevel}` });
  const tally = stockTallyReport(d, { from: "0000-01-01", to: today });
  if (tally.latest)
    for (const r of tally.latest.rows.filter((x) => x.flagged))
      out.push({ id: `tally-${r.product}`, severity: "caution", area: "Stock tally", message: `${r.product}: gap ${r.gap} kg (${tally.latest.session}, ${tally.latest.date}) — recount or check the scale report` });
  const u = udhaarReport(d, today);
  for (const r of u.rows.filter((x) => x.balance > 0).slice(0, 5)) out.push({ id: `ud-${r.name}`, severity: "info", area: "Udhaar", message: `${r.name} owes ₹${r.balance} (last ${r.last})` });
  const order = { critical: 0, caution: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function toCsvRows(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const head = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(","), ...rows.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Physical stock tally (Daily Closing desk / Quick Register stock tally)
// ---------------------------------------------------------------------------
type StockCell = { today?: number | null; yesterday?: number | null; sale?: number | null; reportSale?: number | null; gap?: number | null; diff?: number | null };
const productLabel = (k: string) => STOCK_PRODUCTS.find((p) => p.key === k)?.label || k;

export function stockTallyReport(d: BizData, s: DateSpan) {
  const withStock = d.closings
    .filter((c) => c.stock && Object.keys(c.stock).length)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const rows = withStock
    .filter((c) => inSpan(c.date, s))
    .flatMap((c) =>
      Object.entries(c.stock as Record<string, StockCell>).map(([key, v]) => {
        const gap = v.gap ?? v.diff ?? null;
        return {
          date: c.date,
          session: c.session === "AFTERNOON" ? "Tally 1" : "Tally 2",
          product: productLabel(key),
          yesterday: v.yesterday ?? null,
          today: v.today ?? null,
          sale: v.sale ?? null,
          reportSale: v.reportSale ?? null,
          gap: gap === null ? null : r2(gap),
          flagged: gap !== null && Math.abs(gap) >= STOCK_GAP_CHIP_THRESHOLD_KG,
        };
      })
    );
  const latest = withStock.find((c) => c.date <= s.to) || null;
  const latestRows = latest
    ? STOCK_PRODUCTS.map((p) => {
        const v = (latest.stock as Record<string, StockCell>)[p.key];
        const gap = v ? v.gap ?? v.diff ?? null : null;
        return {
          product: p.label,
          today: v?.today ?? null,
          yesterday: v?.yesterday ?? null,
          sale: v?.sale ?? null,
          reportSale: v?.reportSale ?? null,
          gap: gap === null ? null : r2(gap),
          flagged: gap !== null && Math.abs(gap) >= STOCK_GAP_CHIP_THRESHOLD_KG,
        };
      })
    : [];
  return {
    rows,
    flaggedCount: rows.filter((r) => r.flagged).length,
    latest: latest ? { date: latest.date, session: latest.session === "AFTERNOON" ? "Tally 1" : "Tally 2", rows: latestRows } : null,
    threshold: STOCK_GAP_CHIP_THRESHOLD_KG,
  };
}
