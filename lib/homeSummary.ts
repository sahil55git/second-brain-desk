// Home dashboard figures (the "Sold today" desk from the design boards).
// Pure: takes the same BizData the Reports hub loads and returns only the
// numbers the Home screen shows, so every figure matches Reports exactly.
import { businessDate } from "./register";
import {
  type BizData,
  cashReport,
  dayBook,
  expenseReport,
  jobWorkReport,
  mfgReport,
  salesReport,
  stockReport,
  udhaarReport,
} from "./bizReports";

const shift = (d: string, days: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Hour of day (0-23) in India for an ISO timestamp. */
export function istHour(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return -1;
  return new Date(t + 5.5 * 3600000).getUTCHours();
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface HomeSummary {
  today: string;
  soldToday: number;
  soldLastWeekSameDay: number;
  /** % change vs the same weekday last week; null when last week had no sales. */
  changePct: number | null;
  /** Sales per hour from 8 am to 9 pm (counter entries + bills, by the time they were saved). */
  byHour: { hour: number; label: string; value: number }[];
  peakHour: number | null;
  /** Last 7 days of sales, oldest first; the last one is today. */
  week: { date: string; label: string; counter: number; bills: number; total: number }[];
  cashInToday: number;
  cashOutToday: number;
  upiInToday: number;
  /** Latest cash count today (system vs counted), if any. */
  lastCount: { counter: number; system: number; diff: number; mismatch: boolean } | null;
  udhaarOutstanding: number;
  udhaarCustomers: number;
  spentToday: number;
  jobWork: { waiting: number; waitingKg: number; overdue: number; newToday: number; settledToday: number; settledTodayInr: number; list: { id: string; customer: string; seedKg: number; ageDays: number; due: number }[] };
  /** Oil out of seed over the last 7 days of barrels (null when no finished barrel). */
  yield7d: number | null;
  barrelsSettling: number;
  stock: { name: string; unit: string; qty: number; low: boolean; share: number }[];
  monthSales: number;
  monthPurchases: number;
  monthExpenses: number;
  recent: { at: string; type: string; party: string; detail: string; mode: string; amount: number; side: "in" | "out" }[];
}

export function homeSummary(d: BizData, nowMs = Date.now()): HomeSummary {
  const today = businessDate(nowMs);
  const span = { from: today, to: today };
  const sales = salesReport(d, span);
  const lastWeek = salesReport(d, { from: shift(today, -7), to: shift(today, -7) });
  const changePct = lastWeek.total > 0 ? r2(((sales.total - lastWeek.total) / lastWeek.total) * 100) : null;

  // Sales by hour: counter sale / fresh crush entries + bills saved today.
  const hours: Record<number, number> = {};
  for (const e of d.register) {
    if (e.date !== today || (e.kind !== "SALE" && e.kind !== "FRESH_CRUSH")) continue;
    const h = istHour(e.createdAt);
    hours[h] = (hours[h] || 0) + e.amountInr;
  }
  for (const x of d.sales) {
    if (x.date !== today) continue;
    const h = istHour(x.createdAt);
    hours[h] = (hours[h] || 0) + x.totalInr;
  }
  const byHour = [] as HomeSummary["byHour"];
  for (let h = 8; h <= 21; h++) {
    const label = h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`;
    // Early-morning or late-night sales fold into the first / last bar.
    const extra = h === 8 ? Object.entries(hours).filter(([k]) => +k >= 0 && +k < 8).reduce((a, [, v]) => a + v, 0) : h === 21 ? Object.entries(hours).filter(([k]) => +k > 21).reduce((a, [, v]) => a + v, 0) : 0;
    byHour.push({ hour: h, label, value: r2((hours[h] || 0) + extra) });
  }
  const peak = byHour.reduce((best, b) => (b.value > (best?.value ?? 0) ? b : best), null as HomeSummary["byHour"][number] | null);

  const week = [] as HomeSummary["week"];
  for (let i = 6; i >= 0; i--) {
    const day = shift(today, -i);
    const r = salesReport(d, { from: day, to: day });
    week.push({ date: day, label: WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()], counter: r.counterTotal, bills: r.invoiceTotal, total: r.total });
  }

  const cash = cashReport(d, span);
  const last = cash.counts[0];
  const ud = udhaarReport(d, today);
  const owing = ud.rows.filter((r) => r.balance > 0);
  const jw = jobWorkReport(d, span, nowMs);
  const mfg = mfgReport(d, { from: shift(today, -6), to: today });
  const seed = mfg.byProduct.reduce((a, p) => a + p.seedKg, 0);
  const oil = mfg.byProduct.reduce((a, p) => a + p.oilKg, 0);
  const st = stockReport(d, today);
  const stockItems = st.items.filter((i) => i.book > 0).sort((a, b) => b.book - a.book);
  const stockTotal = stockItems.reduce((a, i) => a + i.book, 0);
  const lowFirst = [...stockItems.slice(0, 5), ...st.items.filter((i) => i.low && !stockItems.slice(0, 5).includes(i))].slice(0, 6);
  const month = { from: `${today.slice(0, 7)}-01`, to: today };
  const monthPurch = d.purchases.filter((p) => p.date >= month.from && p.date <= month.to).reduce((a, p) => a + p.totalInr, 0)
    + d.register.filter((e) => e.kind === "PURCHASE" && e.date >= month.from && e.date <= month.to).reduce((a, e) => a + e.amountInr, 0);
  const book = dayBook(d, span);

  return {
    today,
    soldToday: sales.total,
    soldLastWeekSameDay: lastWeek.total,
    changePct,
    byHour,
    peakHour: peak && peak.value > 0 ? peak.hour : null,
    week,
    cashInToday: cash.cashIn,
    cashOutToday: cash.cashOut,
    upiInToday: cash.upiIn,
    lastCount: last ? { counter: last.counter, system: last.system, diff: last.diff, mismatch: last.mismatch } : null,
    udhaarOutstanding: ud.outstanding,
    udhaarCustomers: owing.length,
    spentToday: expenseReport(d, span).total,
    jobWork: {
      waiting: jw.outstanding.length,
      waitingKg: r2(jw.outstanding.reduce((a, o) => a + o.seedKg, 0)),
      overdue: jw.overdue,
      newToday: jw.intakes,
      settledToday: d.jobWork.filter((j) => j.settled && j.settledAt && businessDate(j.settledAt) === today).length,
      settledTodayInr: jw.settledAmount,
      list: jw.outstanding
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 4)
        .map((o) => ({ id: o.id, customer: o.customer, seedKg: o.seedKg, ageDays: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${o.date}T00:00:00Z`)) / 86400000)), due: o.due })),
    },
    yield7d: seed > 0 && oil > 0 ? r2((oil / seed) * 100) : null,
    barrelsSettling: mfg.settling,
    stock: lowFirst.map((i) => ({ name: i.name, unit: i.unit, qty: i.book, low: i.low, share: stockTotal > 0 ? r2((Math.max(0, i.book) / stockTotal) * 100) : 0 })),
    monthSales: salesReport(d, month).total,
    monthPurchases: r2(monthPurch),
    monthExpenses: expenseReport(d, month).total,
    recent: book.rows.slice(0, 6).map((r) => ({ at: r.at, type: r.type, party: r.party, detail: r.detail, mode: r.mode, amount: r.in || r.out, side: r.in ? "in" : "out" })),
  };
}
