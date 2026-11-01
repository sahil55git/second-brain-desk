// Report files the bot sends (PDF / Excel): the same tables as the Reports hub's download
// buttons, built from the same numbers. Pure apart from the file makers in lib/exporters.
import {
  cashReport, dayBook, expenseReport, jobWorkReport, presetSpan, purchaseReport, salesReport, stockReport, udhaarReport,
  type BizData, type DateSpan,
} from "@/lib/bizReports";
import type { ExportTable } from "@/lib/exporters";
import type { ReportWhat, Span } from "@/lib/bot/parse";
import { dmy } from "@/lib/bot/format";

const M = (key: string, label: string, sum = true) => ({ key, label, num: true, money: true, sum });
const N = (key: string, label: string, sum = true) => ({ key, label, num: true, sum });
const T = (key: string, label: string) => ({ key, label });

export function spanFor(span: Span, nowMs = Date.now()): DateSpan {
  return presetSpan(span === "week" ? "7d" : span, nowMs);
}

export const spanName = (s: DateSpan) => (s.from === s.to ? dmy(s.from) : `${dmy(s.from)} to ${dmy(s.to)}`);

export const WHAT_NAME: Record<ReportWhat, string> = {
  day: "Day book", sales: "Sales", expenses: "Expenses", udhaar: "Udhaar", stock: "Stock", cash: "Cash", jobwork: "Job-work", purchase: "Purchases",
};

/** Owner-only reports; staff get none of these. */
export function reportTables(d: BizData, what: ReportWhat, s: DateSpan, nowMs = Date.now()): ExportTable[] {
  switch (what) {
    case "sales": {
      const r = salesReport(d, s);
      return [
        { title: "Sales by item", cols: [T("key", "Item"), N("qty", "Qty", false), T("unit", "Unit"), N("count", "Entries"), M("amount", "Amount")], rows: r.byItem },
        { title: "Sales by customer", cols: [T("key", "Customer"), N("count", "Entries"), M("amount", "Amount")], rows: r.byParty },
        { title: "All sales", cols: [T("date", "Date"), T("source", "Source"), T("ref", "Ref"), T("party", "Party"), T("item", "Item"), T("qty", "Qty"), T("mode", "Mode"), M("amount", "Amount")], rows: r.rows },
      ];
    }
    case "purchase": {
      const r = purchaseReport(d, s);
      return [
        { title: "Purchases by supplier", cols: [T("key", "Supplier"), N("count", "Entries"), M("amount", "Amount")], rows: r.bySupplier },
        { title: "All purchases", cols: [T("date", "Date"), T("source", "Source"), T("ref", "Bill"), T("party", "Supplier"), T("item", "Item"), T("qty", "Qty"), T("mode", "Mode"), M("amount", "Amount")], rows: r.rows },
      ];
    }
    case "expenses": {
      const r = expenseReport(d, s);
      return [
        { title: "Expenses by category", cols: [T("key", "Category"), N("count", "Entries"), M("amount", "Amount")], rows: r.byCategory },
        { title: "All expenses", cols: [T("date", "Date"), T("source", "Source"), T("item", "Category"), T("party", "Paid to"), T("mode", "Mode"), M("amount", "Amount")], rows: r.rows },
      ];
    }
    case "udhaar": {
      const r = udhaarReport(d, s.to);
      return [
        { title: "Udhaar by person", cols: [T("name", "Name"), M("given", "Given"), M("received", "Received"), M("balance", "Balance"), T("last", "Last activity")], rows: r.rows.filter((x) => Math.abs(x.balance) >= 1) },
        { title: "Credit invoices", cols: [T("date", "Date"), T("invoiceNo", "Invoice"), T("party", "Party"), M("amount", "Amount"), M("paidInr", "Paid"), M("openInr", "Open"), T("status", "Status")], rows: r.creditInvoices },
      ];
    }
    case "stock": {
      const r = stockReport(d, s.to);
      return [{ title: "Book stock", cols: [T("name", "Item"), T("unit", "Unit"), N("opening", "Opening", false), N("inQty", "In", false), N("outQty", "Out", false), N("book", "Book stock", false), N("reorderLevel", "Reorder at", false)], rows: r.items }];
    }
    case "cash": {
      const r = cashReport(d, s);
      return [
        {
          title: "Cash totals",
          cols: [T("k", "Measure"), M("v", "Amount", false)],
          rows: [
            { k: "Cash in", v: r.cashIn }, { k: "Cash out", v: r.cashOut }, { k: "Net cash", v: r.cashIn - r.cashOut },
            { k: "UPI in", v: r.upiIn }, { k: "UPI out", v: r.upiOut }, { k: "Udhaar given", v: r.creditGiven },
            { k: "Pigmee", v: r.pigmee }, { k: "Owner took", v: r.ownerDraw },
          ],
        },
        { title: "Cash counts", cols: [T("date", "Date"), T("session", "Count"), M("system", "System", false), M("counter", "Counted", false), M("diff", "Short(+)/Extra(-)", false)], rows: r.counts },
      ];
    }
    case "jobwork": {
      const r = jobWorkReport(d, s, nowMs);
      return [{ title: "Job-work unsettled", cols: [T("customer", "Customer"), T("date", "Intake"), N("ageDays", "Age days", false), N("seedKg", "Seed kg"), T("cake", "Cake"), M("due", "Due")], rows: r.outstanding }];
    }
    default: {
      const b = dayBook(d, s);
      const sa = salesReport(d, s);
      const ex = expenseReport(d, s);
      const c = cashReport(d, s);
      return [
        {
          title: "Key numbers",
          cols: [T("k", "Measure"), M("v", "Value", false)],
          rows: [
            { k: "Sales", v: sa.total }, { k: "Expenses", v: ex.total }, { k: "Cash in", v: c.cashIn }, { k: "Cash out", v: c.cashOut },
            { k: "UPI in", v: c.upiIn }, { k: "Udhaar given", v: c.creditGiven }, { k: "Money in (day book)", v: b.totalIn }, { k: "Money out (day book)", v: b.totalOut },
          ],
        },
        { title: "Day book", cols: [T("date", "Date"), T("source", "Source"), T("type", "Type"), T("party", "Party"), T("detail", "Detail"), T("mode", "Mode"), M("in", "In"), M("out", "Out")], rows: b.rows },
      ];
    }
  }
}

export function reportFileName(what: ReportWhat, s: DateSpan, ext: "pdf" | "xlsx") {
  return `Mahadev-${WHAT_NAME[what].replace(/\W+/g, "-")}-${spanName(s).replace(/ to /, "_to_")}.${ext}`;
}
