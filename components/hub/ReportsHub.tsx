"use client";

// Reports & Dashboard hub (/reports). Owner only. Every figure comes from
// the pure functions in lib/bizReports.ts over data loaded from
// /api/reports/hub, so tabs, ranges and CSV downloads need no extra calls.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attentionList,
  cashReport,
  dayBook,
  expenseReport,
  jobWorkReport,
  mfgReport,
  presetSpan,
  purchaseReport,
  salesReport,
  stockReport,
  toCsvRows,
  udhaarReport,
  type BizData,
  type DateSpan,
} from "@/lib/bizReports";
import { businessDate } from "@/lib/register";
import { stockTallyReport } from "@/lib/bizReports";
import { blobToBase64, download as downloadBlob, excelBlob, nativeShare, pdfBlob, shareLink, type ExportTable } from "@/lib/exporters";
import { CASH_GAP_THRESHOLD_INR } from "@/lib/calculations";
import { JOBWORK_OVERDUE_DAYS } from "@/lib/reports";
import {
  DEFAULT_HUB_PREFS,
  DEFAULT_SIZES,
  HUB_PREFS_KEY,
  SIZE_SPAN,
  WIDGETS,
  loadHubPrefs,
  saveHubPrefs,
  type HubPrefs,
  type Preset,
  type WidgetId,
  type WidgetSize,
} from "@/lib/hubPrefs";

const rs = (n: number | null | undefined) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const kgs = (n: number | null | undefined) => `${(Math.round((Number(n) || 0) * 10) / 10).toLocaleString("en-IN")} kg`;
const today = () => businessDate(Date.now());

type Tab = "dashboard" | "sales" | "purchase" | "expenses" | "jobwork" | "mfg" | "stock" | "cash" | "udhaar" | "daybook";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "📈" },
  { key: "sales", label: "Sales", icon: "💰" },
  { key: "purchase", label: "Purchase", icon: "🛒" },
  { key: "expenses", label: "Expenses", icon: "🧾" },
  { key: "jobwork", label: "Job-Work", icon: "⚙️" },
  { key: "mfg", label: "Manufacturing", icon: "🛢️" },
  { key: "stock", label: "Stock", icon: "📦" },
  { key: "cash", label: "Cash", icon: "💵" },
  { key: "udhaar", label: "Udhaar", icon: "📒" },
  { key: "daybook", label: "Day book", icon: "📚" },
];
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "g" | "r" | "o" | "b" }) {
  return (
    <div className={`hub-kpi ${tone || ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

function Bars({ series, money = true, height = 140 }: { series: { date: string; value: number }[]; money?: boolean; height?: number }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  const w = Math.max(series.length * 22, 200);
  const bw = Math.max(6, Math.min(26, w / Math.max(1, series.length) - 4));
  return (
    <div className="hub-chart" role="img" aria-label="Daily chart">
      <svg viewBox={`0 0 ${w} ${height + 24}`} preserveAspectRatio="none" width="100%" height={height + 24}>
        {series.map((s, i) => {
          const h = (s.value / max) * height;
          const x = i * (w / series.length) + 2;
          return (
            <g key={s.date}>
              <rect x={x} y={height - h} width={bw} height={Math.max(h, s.value ? 1 : 0)} rx={3} className="bar">
                <title>{`${s.date}: ${money ? rs(s.value) : kgs(s.value)}`}</title>
              </rect>
              {(series.length <= 14 || i % Math.ceil(series.length / 10) === 0) && (
                <text x={x + bw / 2} y={height + 16} textAnchor="middle" className="lbl">
                  {s.date.slice(8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="hub-chart-max">max {money ? rs(max) : kgs(max)}</div>
    </div>
  );
}

function Table({
  cols,
  rows,
  empty = "Nothing in this period",
  sum,
}: {
  cols: { key: string; label: string; num?: boolean; fmt?: (v: unknown, r: Record<string, unknown>) => React.ReactNode }[];
  rows: Record<string, unknown>[];
  empty?: string;
  sum?: string[]; // columns to total in a footer row
}) {
  const totals =
    sum && rows.length
      ? Object.fromEntries(sum.map((k) => [k, Math.round(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) * 100) / 100]))
      : null;
  return (
    <div className="hub-tablewrap">
      <table className="hub-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.num ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.num ? "num" : ""}>
                    {c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} className="hub-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {cols.map((c, i) => (
                <td key={c.key} className={c.num ? "num" : ""}>
                  {i === 0 ? <b>Total ({rows.length})</b> : c.key in totals ? <b>{c.fmt ? c.fmt(totals[c.key], {}) : String(totals[c.key])}</b> : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Card({ title, right, children, id }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="hub-card" id={id}>
      <div className="hub-card-head">
        <h3>{title}</h3>
        {right && <div className="hr">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function download(name: string, text: string) {
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const CsvBtn = ({ name, rows }: { name: string; rows: Record<string, unknown>[] }) => (
  <button className="hub-btn" disabled={!rows.length} onClick={() => download(name, toCsvRows(rows))}>
    ⬇ CSV
  </button>
);
const money = (v: unknown) => rs(v as number);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function ReportsHub() {
  // Start from defaults (same on server and client), then read this device's prefs.
  const [prefs, setPrefs] = useState<HubPrefs>(DEFAULT_HUB_PREFS);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [preset, setPreset] = useState<Preset | "custom">(DEFAULT_HUB_PREFS.defaultRange);
  const [custom, setCustom] = useState<DateSpan>(() => presetSpan("7d"));
  const [data, setData] = useState<BizData | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterNow, setCounterNow] = useState<number | null>(null);
  const [editWidgets, setEditWidgets] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [overId, setOverId] = useState<WidgetId | null>(null);
  // Pointer-based drag (works with mouse, touch screens and pens — HTML5
  // drag-and-drop doesn't work on phones/tablets).
  const startDrag = (e: React.PointerEvent, id: WidgetId) => {
    if ((e.target as HTMLElement).closest("button,input,select,a")) return;
    e.preventDefault();
    setDragId(id);
    let over: WidgetId | null = null;
    const move = (ev: PointerEvent) => {
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-wid]");
      over = (el?.dataset.wid as WidgetId) || null;
      setOverId(over);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragId(null);
      setOverId(null);
      if (over && over !== id) {
        const target = over;
        updatePrefs((p) => {
          const list = p.widgets.filter((w) => w !== id);
          list.splice(list.indexOf(target), 0, id);
          return { ...p, widgets: list };
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    const p = loadHubPrefs();
    setPrefs(p);
    setPreset(p.defaultRange);
    const want = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (want && TABS.some((x) => x.key === want)) setTab(want);
  }, []);
  const updatePrefs = (fn: (p: HubPrefs) => HubPrefs) =>
    setPrefs((p) => {
      const n = fn(p);
      saveHubPrefs(n);
      return n;
    });

  const span: DateSpan = preset === "custom" ? custom : presetSpan(preset);
  const t = today();
  const dash30 = presetSpan("30d");
  const fetchFrom = span.from < dash30.from ? span.from : dash30.from;
  const fetchTo = span.to > t ? span.to : t;

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        fetch(`/api/reports/hub?from=${fetchFrom}&to=${fetchTo}`).then(async (x) => {
          const j = await x.json();
          if (!x.ok) throw new Error(j.error || `HTTP ${x.status}`);
          return j;
        }),
        fetch(`/api/register?date=${t}`)
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      setData(r.data);
      setLoadedAt(r.loadedAt);
      setCounterNow(c?.data?.systemCashNow ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [fetchFrom, fetchTo, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: refresh on an interval while the page is visible.
  useEffect(() => {
    if (!prefs.refreshSec) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, prefs.refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [prefs.refreshSec, load]);

  const R = useMemo(() => {
    if (!data) return null;
    return {
      sales: salesReport(data, span),
      purchase: purchaseReport(data, span),
      expenses: expenseReport(data, span),
      jobwork: jobWorkReport(data, span),
      mfg: mfgReport(data, span),
      stock: stockReport(data, span.to),
      cash: cashReport(data, span),
      udhaar: udhaarReport(data, span.to),
      daybook: dayBook(data, span),
      // dashboard (fixed windows)
      dToday: salesReport(data, { from: t, to: t }),
      dExpToday: expenseReport(data, { from: t, to: t }),
      d7: salesReport(data, presetSpan("7d")),
      dExp7: expenseReport(data, presetSpan("7d")),
      dJw: jobWorkReport(data, { from: t, to: t }),
      dMfg7: mfgReport(data, presetSpan("7d")),
      dMfgToday: mfgReport(data, { from: t, to: t }),
      dStock: stockReport(data, t),
      dUdhaar: udhaarReport(data, t),
      dCash: cashReport(data, { from: t, to: t }),
      dBook: dayBook(data, { from: t, to: t }),
      attention: attentionList(data, t),
      tally: stockTallyReport(data, span),
      dTally: stockTallyReport(data, { from: t, to: t }),
      mSales: salesReport(data, presetSpan("month")),
      mExp: expenseReport(data, presetSpan("month")),
      mPur: purchaseReport(data, presetSpan("month")),
      mCash: cashReport(data, presetSpan("month")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, span.from, span.to, t]);

  const label = `${span.from}${span.to !== span.from ? ` → ${span.to}` : ""}`;

  // ------------------------- exports & sharing ---------------------------
  const [busy, setBusy] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [integr, setIntegr] = useState<{ discord: boolean; telegram: boolean; webhook: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/share")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setIntegr(j?.data ?? null))
      .catch(() => setIntegr(null));
  }, []);
  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote(null), 3500);
  };
  const M = (key: string, label: string, sum = true) => ({ key, label, num: true, money: true, sum });
  const N = (key: string, label: string, sum = true) => ({ key, label, num: true, sum });
  const T = (key: string, label: string) => ({ key, label });
  const tabLabel = TABS.find((x) => x.key === tab)?.label || "Report";

  const exportTables = (which: Tab): ExportTable[] => {
    if (!R) return [];
    switch (which) {
      case "dashboard":
        return [
          {
            title: "Key numbers today",
            cols: [T("k", "Measure"), M("v", "Value", false)],
            rows: [
              { k: "Sales today", v: R.dToday.total },
              { k: "Should be in counter", v: counterNow ?? 0 },
              { k: "Expenses today", v: R.dExpToday.total },
              { k: "Fresh crush today", v: R.dToday.freshCrush },
              { k: "Job-work: shop owes", v: R.dJw.shopOwes },
              { k: "Job-work: customers owe", v: R.dJw.customersOwe },
              { k: "Udhaar outstanding", v: R.dUdhaar.outstanding },
            ],
          },
          { title: "Needs attention", cols: [T("area", "Area"), T("message", "Detail")], rows: R.attention as unknown as Record<string, unknown>[] },
          { title: "Today's transactions", cols: [T("source", "Source"), T("type", "Type"), T("party", "Party"), T("detail", "Detail"), T("mode", "Mode"), M("in", "In"), M("out", "Out")], rows: R.dBook.rows },
        ];
      case "sales":
        return [
          { title: "Sales by item", cols: [T("key", "Item"), N("qty", "Qty", false), T("unit", "Unit"), N("count", "Entries"), M("amount", "Amount")], rows: R.sales.byItem },
          { title: "Sales by customer", cols: [T("key", "Customer"), N("count", "Entries"), M("amount", "Amount")], rows: R.sales.byParty },
          { title: "All sales", cols: [T("date", "Date"), T("source", "Source"), T("ref", "Ref"), T("party", "Party"), T("item", "Item"), T("qty", "Qty"), T("mode", "Mode"), M("amount", "Amount")], rows: R.sales.rows },
        ];
      case "purchase":
        return [
          { title: "Purchases by item", cols: [T("key", "Item"), N("qty", "Qty", false), T("unit", "Unit"), M("amount", "Amount")], rows: R.purchase.byItem },
          { title: "Purchases by supplier", cols: [T("key", "Supplier"), N("count", "Entries"), M("amount", "Amount")], rows: R.purchase.bySupplier },
          { title: "All purchases", cols: [T("date", "Date"), T("source", "Source"), T("ref", "Bill"), T("party", "Supplier"), T("item", "Item"), T("qty", "Qty"), T("mode", "Mode"), M("amount", "Amount")], rows: R.purchase.rows },
        ];
      case "expenses":
        return [
          { title: "Expenses by category", cols: [T("key", "Category"), N("count", "Entries"), M("amount", "Amount")], rows: R.expenses.byCategory },
          { title: "All expenses", cols: [T("date", "Date"), T("source", "Source"), T("item", "Category"), T("party", "Paid to"), T("mode", "Mode"), M("amount", "Amount")], rows: R.expenses.rows },
        ];
      case "jobwork":
        return [
          { title: "Job-work unsettled", cols: [T("customer", "Customer"), T("date", "Intake"), N("ageDays", "Age days", false), N("seedKg", "Seed kg"), T("cake", "Cake"), M("due", "Due")], rows: R.jobwork.outstanding },
          { title: "Top customers", cols: [T("key", "Customer"), N("count", "Intakes"), N("seedKg", "Seed kg"), M("settled", "Settled")], rows: R.jobwork.byCustomer },
        ];
      case "mfg":
        return [
          { title: "Barrels", cols: [T("date", "Date"), T("barrel", "Barrel"), T("product", "Product"), N("seedKg", "Seed kg"), N("oilKg", "Oil kg"), N("efficiencyPct", "Eff %", false), T("band", "Band"), T("flagged", "Flagged")], rows: R.mfg.rows },
          { title: "Fresh crush", cols: [T("date", "Date"), T("seed", "Oil"), N("seedKg", "Seed kg"), N("oilKg", "Oil kg"), N("yieldPct", "Yield %", false), T("soldQty", "Sold"), N("extraKg", "To tank kg"), T("extraTo", "Tank / barrel"), N("cakeKg", "Cake kg"), M("amount", "Amount")], rows: R.mfg.freshRows },
        ];
      case "stock":
        return [
          { title: "Book stock", cols: [T("name", "Item"), T("unit", "Unit"), N("opening", "Opening", false), N("inQty", "In", false), N("outQty", "Out", false), N("book", "Book stock", false), N("reorderLevel", "Reorder at", false)], rows: R.stock.items },
          { title: `Latest stock tally ${R.tally.latest ? `(${R.tally.latest.date} ${R.tally.latest.session})` : ""}`, cols: [T("product", "Product"), N("yesterday", "Yesterday", false), N("today", "Today", false), N("sale", "Sale", false), N("reportSale", "Report sale", false), N("gap", "Gap", false), T("flagged", "Check")], rows: R.tally.latest?.rows || [] },
          { title: "Stock tally history", cols: [T("date", "Date"), T("session", "Count"), T("product", "Product"), N("yesterday", "Yesterday", false), N("today", "Today", false), N("sale", "Sale", false), N("reportSale", "Report sale", false), N("gap", "Gap", false), T("flagged", "Check")], rows: R.tally.rows },
        ];
      case "cash":
        return [
          {
            title: "Cash totals",
            cols: [T("k", "Measure"), M("v", "Amount", false)],
            rows: [
              { k: "Cash in", v: R.cash.cashIn },
              { k: "Cash out", v: R.cash.cashOut },
              { k: "Net cash (in - out)", v: R.cash.cashIn - R.cash.cashOut },
              { k: "UPI in", v: R.cash.upiIn },
              { k: "UPI out", v: R.cash.upiOut },
              { k: "Udhaar given", v: R.cash.creditGiven },
              { k: "Pigmee", v: R.cash.pigmee },
              { k: "Sahil took", v: R.cash.ownerDraw },
            ],
          },
          { title: "Cash counts", cols: [T("date", "Date"), T("session", "Count"), M("system", "System", false), M("counter", "Counted", false), M("diff", "Short(+)/Extra(-)", false)], rows: R.cash.counts },
        ];
      case "udhaar":
        return [
          { title: "Udhaar by person", cols: [T("name", "Name"), M("given", "Given"), M("received", "Received"), M("balance", "Balance"), T("last", "Last activity")], rows: R.udhaar.rows },
          { title: "Credit invoices", cols: [T("date", "Date"), T("invoiceNo", "Invoice"), T("party", "Party"), M("amount", "Amount")], rows: R.udhaar.creditInvoices },
        ];
      default:
        return [{ title: "Day book", cols: [T("date", "Date"), T("source", "Source"), T("type", "Type"), T("party", "Party"), T("detail", "Detail"), T("mode", "Mode"), M("in", "In"), M("out", "Out")], rows: R.daybook.rows }];
    }
  };

  const summaryText = (): string => {
    if (!R) return "";
    const L = [`*Mahadev Traders — ${tabLabel}* (${tab === "dashboard" ? t : label})`];
    if (tab === "dashboard") {
      L.push(`Sales today: ${rs(R.dToday.total)} | Expenses: ${rs(R.dExpToday.total)}`);
      L.push(`Should be in counter: ${counterNow === null ? "-" : rs(counterNow)}`);
      L.push(`Job-work: shop owes ${rs(R.dJw.shopOwes)}, ${R.dJw.outstanding.length} unsettled`);
      L.push(`Udhaar outstanding: ${rs(R.dUdhaar.outstanding)}`);
      if (R.attention.length) L.push("", "⚠️ Needs attention:", ...R.attention.slice(0, 8).map((a) => `• ${a.area}: ${a.message}`));
    } else if (tab === "cash") {
      L.push(`Cash in ${rs(R.cash.cashIn)} | Cash out ${rs(R.cash.cashOut)} | Net ${rs(R.cash.cashIn - R.cash.cashOut)}`, `UPI ${rs(R.cash.upiIn)} / ${rs(R.cash.upiOut)} | Udhaar given ${rs(R.cash.creditGiven)}`);
    } else if (tab === "sales") L.push(`Total sales ${rs(R.sales.total)} (invoices ${rs(R.sales.invoiceTotal)}, counter ${rs(R.sales.counterTotal)}, fresh crush ${rs(R.sales.freshCrush)})`);
    else if (tab === "purchase") L.push(`Total purchases ${rs(R.purchase.total)} | on udhaar ${rs(R.purchase.onCredit)}`);
    else if (tab === "expenses") L.push(`Total expenses ${rs(R.expenses.total)} | salary ${rs(R.expenses.salary)}`);
    else if (tab === "daybook") L.push(`Money in ${rs(R.daybook.totalIn)} | Money out ${rs(R.daybook.totalOut)} | Net ${rs(R.daybook.totalIn - R.daybook.totalOut)} | ${R.daybook.rows.length} transactions`);
    else if (tab === "stock" && R.tally.latest)
      L.push(`Stock tally ${R.tally.latest.date} ${R.tally.latest.session}: ${R.tally.latest.rows.filter((r) => r.flagged).length} gap(s) ≥ ${R.tally.threshold} kg`, ...R.tally.latest.rows.filter((r) => r.flagged).map((r) => `• ${r.product}: gap ${r.gap} kg`));
    else if (tab === "jobwork") L.push(`Shop owes ${rs(R.jobwork.shopOwes)} | customers owe ${rs(R.jobwork.customersOwe)} | ${R.jobwork.overdue} overdue`);
    else if (tab === "udhaar") L.push(`Outstanding udhaar ${rs(R.udhaar.outstanding)}`, ...R.udhaar.rows.filter((r) => r.balance > 0).slice(0, 10).map((r) => `• ${r.name}: ${rs(r.balance)}`));
    else if (tab === "mfg") L.push(`Oil produced ${kgs(R.mfg.totalOilKg)} | barrels ${R.mfg.batches} | fresh crush ${R.mfg.fresh.count}`);
    return L.join("\n");
  };
  const fileBase = () => `mahadev_${tab}_${tab === "dashboard" ? t : label.replace(/ → /, "_to_")}`;
  const doExcel = async (all = false) => {
    setBusy("excel");
    try {
      const tables = all ? TABS.flatMap((x) => exportTables(x.key).map((tb) => ({ ...tb, title: `${x.label} - ${tb.title}` }))) : exportTables(tab);
      downloadBlob(`${all ? `mahadev_all-reports_${label.replace(/ → /, "_to_")}` : fileBase()}.xlsx`, await excelBlob(tables));
    } catch (e) {
      flash(e instanceof Error ? e.message : "Excel export failed");
    }
    setBusy(null);
  };
  const makePdf = () => pdfBlob(`Mahadev Traders - ${tabLabel}`, `${tab === "dashboard" ? t : label} - generated ${new Date().toLocaleString("en-IN")}`, exportTables(tab));
  const doPdf = async () => {
    setBusy("pdf");
    try {
      downloadBlob(`${fileBase()}.pdf`, await makePdf());
    } catch (e) {
      flash(e instanceof Error ? e.message : "PDF export failed");
    }
    setBusy(null);
  };
  const sendServer = async (channel: "discord" | "telegram" | "webhook") => {
    setBusy(channel);
    try {
      const pdf = channel === "webhook" ? null : await makePdf();
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          text: summaryText(),
          fileName: `${fileBase()}.pdf`,
          fileBase64: pdf ? await blobToBase64(pdf) : undefined,
          report: channel === "webhook" ? { tab, span, tables: exportTables(tab) } : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      flash(res.ok ? `Sent to ${channel} ✓` : j.error || "Send failed");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Send failed");
    }
    setBusy(null);
    setShareOpen(false);
  };

  // ---------------------------- widgets ----------------------------------
  const widget = (id: WidgetId): React.ReactNode => {
    if (!R) return null;
    switch (id) {
      case "kpis":
        return (
          <div className="hub-kpis">
            <Kpi label="Sales today" value={rs(R.dToday.total)} sub={`${R.dToday.counterCount} counter · ${R.dToday.invoiceCount} invoices`} tone="g" />
            <Kpi label="Should be in counter" value={counterNow === null ? "—" : rs(counterNow)} sub="Quick Register, live" tone="b" />
            <Kpi label="Expenses today" value={rs(R.dExpToday.total)} sub={R.dExpToday.salary ? `incl. salary ${rs(R.dExpToday.salary)}` : undefined} tone="r" />
            <Kpi label="Fresh crush today" value={rs(R.dToday.freshCrush)} sub={`${R.dMfgToday.fresh.count} crushing(s)`} tone="g" />
            <Kpi label="Job-work: shop owes" value={rs(R.dJw.shopOwes)} sub={`${R.dJw.outstanding.length} unsettled · ${R.dJw.overdue} overdue`} tone="o" />
            <Kpi label="Job-work: customers owe" value={rs(R.dJw.customersOwe)} tone="o" />
            <Kpi label="Udhaar outstanding" value={rs(R.dUdhaar.outstanding)} sub={`${R.dUdhaar.rows.filter((r) => r.balance > 0).length} people`} tone="o" />
            <Kpi label="Khali (job-work) stock" value={kgs(R.dJw.khaliStockKg)} />
            <Kpi label="Oil produced (7 days)" value={kgs(R.dMfg7.totalOilKg)} sub={`${R.dMfg7.batches} barrels · ${R.dMfg7.fresh.count} fresh crush`} />
            <Kpi label="Low stock items" value={String(R.dStock.lowCount)} tone={R.dStock.lowCount ? "r" : undefined} />
          </div>
        );
      case "monthTotals":
        return (
          <Card title={`🧮 Totals — this month (${presetSpan("month").from.slice(0, 7)})`}>
            <div className="hub-kpis" style={{ marginBottom: 0 }}>
              <Kpi label="Total sales" value={rs(R.mSales.total)} sub={`${R.mSales.invoiceCount} invoices · ${R.mSales.counterCount} counter`} tone="g" />
              <Kpi label="Total purchases" value={rs(R.mPur.total)} tone="r" />
              <Kpi label="Total expenses" value={rs(R.mExp.total)} sub={R.mExp.salary ? `incl. salary ${rs(R.mExp.salary)}` : undefined} tone="r" />
              <Kpi label="Total cash in" value={rs(R.mCash.cashIn)} tone="g" />
              <Kpi label="Total cash out" value={rs(R.mCash.cashOut)} tone="r" />
              <Kpi label="Net cash (in − out)" value={rs(R.mCash.cashIn - R.mCash.cashOut)} tone={R.mCash.cashIn - R.mCash.cashOut >= 0 ? "g" : "r"} />
              <Kpi label="UPI in / out" value={`${rs(R.mCash.upiIn)} / ${rs(R.mCash.upiOut)}`} />
              <Kpi label="Pigmee + Sahil took" value={rs(R.mCash.pigmee + R.mCash.ownerDraw)} tone="o" />
            </div>
          </Card>
        );
      case "stockTally":
        return (
          <Card
            title="📦 Stock tally — physical vs system"
            right={<span className="hub-m">{R.dTally.latest ? `${R.dTally.latest.date} · ${R.dTally.latest.session}` : "not counted today"}</span>}
          >
            {R.dTally.latest ? (
              <Table
                cols={[
                  { key: "product", label: "Product" },
                  { key: "yesterday", label: "Yesterday", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                  { key: "today", label: "Counted", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                  { key: "sale", label: "Sale", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                  { key: "reportSale", label: "Scale report", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                  { key: "gap", label: "Gap kg", num: true, fmt: (v, r) => (v === null ? "—" : <b className={r.flagged ? "r" : "g"}>{String(v)}</b>) },
                ]}
                rows={R.dTally.latest.rows.filter((r) => r.today !== null)}
              />
            ) : (
              <div className="hub-empty">No stock counted today — Quick Register → 📦 Stock tally</div>
            )}
          </Card>
        );
      case "attention":
        return (
          <Card title="⚠️ Needs attention" right={<span className="hub-m">{R.attention.length}</span>}>
            {R.attention.length ? (
              <ul className="hub-att">
                {R.attention.map((a) => (
                  <li key={a.id} className={a.severity}>
                    <b>{a.area}</b> — {a.message}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hub-empty">All clear ✓</div>
            )}
            <div className="hub-m small">
              Rules: job-work unsettled ≥ {JOBWORK_OVERDUE_DAYS} days · cash count off by ≥ ₹{CASH_GAP_THRESHOLD_INR} · barrel / fresh crush
              loss over 2% · book stock at or below reorder level.
            </div>
          </Card>
        );
      case "sales7":
        return (
          <Card title="💰 Sales — last 7 days" right={<b>{rs(R.d7.total)}</b>}>
            <Bars series={R.d7.series} />
          </Card>
        );
      case "expenses7":
        return (
          <Card title="🧾 Expenses — last 7 days" right={<b>{rs(R.dExp7.total)}</b>}>
            <Bars series={R.dExp7.series} />
          </Card>
        );
      case "oil7":
        return (
          <Card title="🛢️ Oil produced — last 7 days" right={<b>{kgs(R.dMfg7.totalOilKg)}</b>}>
            <Bars series={R.dMfg7.series} money={false} />
          </Card>
        );
      case "cashToday":
        return (
          <Card title="💵 Cash today">
            <div className="hub-rows">
              <div><span>Cash in</span><b className="g">{rs(R.dCash.cashIn)}</b></div>
              <div><span>Cash out</span><b className="r">{rs(R.dCash.cashOut)}</b></div>
              <div><span>UPI in / out</span><b>{rs(R.dCash.upiIn)} / {rs(R.dCash.upiOut)}</b></div>
              <div><span>Udhaar given</span><b>{rs(R.dCash.creditGiven)}</b></div>
              <div><span>Pigmee + Sahil took</span><b className="o">{rs(R.dCash.pigmee + R.dCash.ownerDraw)}</b></div>
              {R.dCash.counts.map((c) => (
                <div key={c.id}>
                  <span>{c.session === "AFTERNOON" ? "Tally 1" : "Tally 2"} counted</span>
                  <b className={c.mismatch ? "r" : "g"}>
                    {rs(c.counter)} {Math.abs(c.diff) >= 1 ? `(${c.diff > 0 ? "short" : "extra"} ${rs(Math.abs(c.diff))})` : "✓"}
                  </b>
                </div>
              ))}
            </div>
          </Card>
        );
      case "topItems":
        return (
          <Card title="🏷️ Top selling items — 7 days">
            <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.d7.byItem.slice(0, 8)} sum={["amount"]} />
          </Card>
        );
      case "recent":
        return (
          <Card title="📚 Today's transactions" right={<span className="hub-m">{R.dBook.rows.length}</span>}>
            <Table
              cols={[
                { key: "at", label: "Time", fmt: (v) => new Date(String(v)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) },
                { key: "type", label: "Type" },
                { key: "party", label: "Party" },
                { key: "detail", label: "Detail" },
                { key: "in", label: "In", num: true, fmt: (v) => ((v as number) ? rs(v as number) : "") },
                { key: "out", label: "Out", num: true, fmt: (v) => ((v as number) ? rs(v as number) : "") },
              ]}
              rows={R.dBook.rows.slice(0, 12)} sum={["in", "out"]} />
          </Card>
        );
    }
  };

  const visibleWidgets = prefs.widgets.filter((w) => !prefs.hidden.includes(w));
  const moveWidget = (id: WidgetId, dir: -1 | 1) =>
    updatePrefs((p) => {
      const list = [...p.widgets];
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, widgets: list };
    });

  // ---------------------------- render -----------------------------------
  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>📊 Reports &amp; Dashboard</h1>
          <div className="hub-m">
            {loadedAt ? (
              <>
                <span className={`hub-live${prefs.refreshSec ? " on" : ""}`} /> {prefs.refreshSec ? "Live" : "Updated"}{" "}
                {new Date(loadedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })}
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/stock">📦 Stock tally</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
          <a className="hub-btn" href="/settings">⚙️ Settings</a>
          <a className="hub-btn" href="/appearance">🎨 Appearance</a>
          <button className="hub-btn" onClick={load}>⟳ Refresh</button>
          <button className="hub-btn" onClick={() => window.print()}>🖨️ Print</button>
        </nav>
      </header>

      {error && <div className="hub-banner">{error}</div>}

      <div className="hub-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? "on" : ""} onClick={() => setTab(x.key)}>
            {x.icon} {x.label}
          </button>
        ))}
      </div>

      {tab !== "dashboard" && (
        <div className="hub-range">
          {PRESETS.map((p) => (
            <button key={p.key} className={preset === p.key ? "on" : ""} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
          <button className={preset === "custom" ? "on" : ""} onClick={() => setPreset("custom")}>
            Custom
          </button>
          {preset === "custom" && (
            <span className="hub-custom">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
              →
              <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
            </span>
          )}
          <span className="hub-m">{label}</span>
        </div>
      )}

      <div className="hub-export" aria-label="Download and share">
        <button className="hub-btn" disabled={!R || !!busy} onClick={() => doExcel(false)}>
          {busy === "excel" ? "Preparing…" : "⬇ Excel"}
        </button>
        <button className="hub-btn" disabled={!R || !!busy} onClick={doPdf}>
          {busy === "pdf" ? "Preparing…" : "⬇ PDF"}
        </button>
        <button className="hub-btn" disabled={!R || !!busy} onClick={() => doExcel(true)} title="Every tab for this period in one Excel workbook">
          ⬇ All reports (Excel)
        </button>
        <span className="hub-share">
          <button className="hub-btn primary" disabled={!R} onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen}>
            📤 Share ▾
          </button>
          {shareOpen && (
            <div className="hub-share-menu" role="menu">
              <a role="menuitem" href={shareLink("whatsapp", summaryText())} target="_blank" rel="noreferrer">🟢 WhatsApp</a>
              <a role="menuitem" href={shareLink("telegram", summaryText())} target="_blank" rel="noreferrer">✈️ Telegram</a>
              <a role="menuitem" href={shareLink("email", summaryText(), `Mahadev Traders — ${tabLabel} (${label})`)}>✉️ Email</a>
              <button
                role="menuitem"
                onClick={async () => {
                  setBusy("native");
                  const pdf = await makePdf().catch(() => null);
                  const r = await nativeShare(summaryText(), pdf ? { blob: pdf, name: `${fileBase()}.pdf` } : undefined);
                  if (r === "unsupported") flash("This browser has no share sheet — use WhatsApp / Email, or download the PDF.");
                  setBusy(null);
                  setShareOpen(false);
                }}
              >
                📱 Phone share (with PDF)
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  navigator.clipboard?.writeText(summaryText()).then(() => flash("Summary copied ✓"), () => flash("Could not copy"));
                  setShareOpen(false);
                }}
              >
                📋 Copy summary text
              </button>
              <div className="sep">Send automatically (set up in Settings → Integrations)</div>
              {(["discord", "telegram", "webhook"] as const).map((c) => (
                <button key={c} role="menuitem" disabled={!integr?.[c] || !!busy} onClick={() => sendServer(c)} title={integr?.[c] ? "" : "Not set up yet"}>
                  {c === "discord" ? "🎮 Discord channel" : c === "telegram" ? "🤖 Telegram bot" : "🔗 Webhook (Zapier / other software)"}
                  {busy === c ? " — sending…" : integr?.[c] ? "" : " (not set up)"}
                </button>
              ))}
            </div>
          )}
        </span>
        {note && <span className="hub-m">{note}</span>}
      </div>

      {!R ? (
        <div className="hub-empty">{error ? "" : "Loading…"}</div>
      ) : tab === "dashboard" ? (
        <>
          <div className="hub-dash-tools">
            <button className="hub-btn" onClick={() => setEditWidgets((v) => !v)}>
              {editWidgets ? "✓ Done" : "🧩 Arrange widgets"}
            </button>
            <span className="hub-m">
              Auto-refresh:{" "}
              <select value={prefs.refreshSec} onChange={(e) => updatePrefs((p) => ({ ...p, refreshSec: Number(e.target.value) }))}>
                <option value={0}>off</option>
                <option value={30}>30 s</option>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
              </select>
            </span>
          </div>
          {editWidgets && (
            <div className="hub-card">
              <div className="hub-wlist">
                {prefs.widgets.map((id) => {
                  const w = WIDGETS.find((x) => x.id === id)!;
                  const hidden = prefs.hidden.includes(id);
                  return (
                    <div key={id} className={`hub-wrow${hidden ? " off" : ""}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() =>
                            updatePrefs((p) => ({ ...p, hidden: hidden ? p.hidden.filter((h) => h !== id) : [...p.hidden, id] }))
                          }
                        />{" "}
                        {w.label}
                      </label>
                      <span>
                        <button className="hub-btn sm" onClick={() => moveWidget(id, -1)} aria-label="Move up">▲</button>
                        <button className="hub-btn sm" onClick={() => moveWidget(id, 1)} aria-label="Move down">▼</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {editWidgets && (
            <div className="hub-note">Drag a widget to move it. Use S · M · L · XL · Full on each widget to change its width.</div>
          )}
          <div className="hub-dash g12">
            {visibleWidgets.map((id) => {
              const size: WidgetSize = prefs.sizes[id] || DEFAULT_SIZES[id];
              return (
                <div
                  key={id}
                  className={`hub-w hub-w-${id}${editWidgets ? " arranging" : ""}${overId === id && dragId !== id ? " drag-over" : ""}${dragId === id ? " dragging" : ""}`}
                  style={{ ["--span" as string]: SIZE_SPAN[size] } as React.CSSProperties}
                  data-wid={id}
                  onPointerDown={(e) => editWidgets && startDrag(e, id)}
                >
                  {editWidgets && (
                    <div className="hub-wbar" aria-label="Widget size">
                      {(["s", "m", "l", "xl", "full"] as WidgetSize[]).map((sz) => (
                        <button
                          key={sz}
                          className={size === sz ? "on" : ""}
                          onClick={() => updatePrefs((p) => ({ ...p, sizes: { ...p.sizes, [id]: sz } }))}
                          title={`Width: ${sz.toUpperCase()}`}
                        >
                          {sz === "full" ? "Full" : sz.toUpperCase()}
                        </button>
                      ))}
                      <button title="Hide" onClick={() => updatePrefs((p) => ({ ...p, hidden: [...p.hidden, id] }))}>
                        ✕
                      </button>
                    </div>
                  )}
                  {widget(id)}
                </div>
              );
            })}
          </div>
        </>
      ) : tab === "sales" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Total sales" value={rs(R.sales.total)} tone="g" />
            <Kpi label="GST invoices" value={rs(R.sales.invoiceTotal)} sub={`${R.sales.invoiceCount} invoices · tax ${rs(R.sales.invoiceTax)}`} />
            <Kpi label="Counter (Quick Register)" value={rs(R.sales.counterTotal)} sub={`${R.sales.counterCount} entries`} />
            <Kpi label="Fresh crush" value={rs(R.sales.freshCrush)} />
            {Object.entries(R.sales.byMode).map(([m, v]) => (
              <Kpi key={m} label={`Paid by ${m}`} value={rs(v)} />
            ))}
          </div>
          <div className="hub-note">
            Invoices (Sales desk) and counter entries (Quick Register) are separate books, shown together. If the accountant also raises an
            invoice for a counter sale, that sale appears in both.
          </div>
          <Card title="Daily sales">
            <Bars series={R.sales.series} />
          </Card>
          <div className="hub-grid2">
            <Card title="By item" right={<CsvBtn name={`sales-by-item_${label}.csv`} rows={R.sales.byItem} />}>
              <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "unit", label: "Unit" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.byItem} sum={["amount"]} />
            </Card>
            <Card title="By customer" right={<CsvBtn name={`sales-by-customer_${label}.csv`} rows={R.sales.byParty} />}>
              <Table cols={[{ key: "key", label: "Customer" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.byParty} sum={["amount"]} />
            </Card>
          </div>
          <Card title="All sales" right={<CsvBtn name={`sales_${label}.csv`} rows={R.sales.rows} />}>
            <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "ref", label: "Ref" }, { key: "party", label: "Party" }, { key: "item", label: "Item" }, { key: "qty", label: "Qty" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.rows} sum={["amount"]} />
          </Card>
        </>
      ) : tab === "purchase" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Total purchases" value={rs(R.purchase.total)} tone="r" />
            <Kpi label="Purchase bills" value={rs(R.purchase.billTotal)} sub={`${R.purchase.billCount} bills · tax ${rs(R.purchase.billTax)}`} />
            <Kpi label="Counter purchases" value={rs(R.purchase.counterTotal)} sub={`${R.purchase.counterCount} entries`} />
            <Kpi label="On credit (udhaar)" value={rs(R.purchase.onCredit)} tone="o" />
          </div>
          <Card title="Daily purchases">
            <Bars series={R.purchase.series} />
          </Card>
          <div className="hub-grid2">
            <Card title="By item" right={<CsvBtn name={`purchase-by-item_${label}.csv`} rows={R.purchase.byItem} />}>
              <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "unit", label: "Unit" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.byItem} sum={["amount"]} />
            </Card>
            <Card title="By supplier" right={<CsvBtn name={`purchase-by-supplier_${label}.csv`} rows={R.purchase.bySupplier} />}>
              <Table cols={[{ key: "key", label: "Supplier" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.bySupplier} sum={["amount"]} />
            </Card>
          </div>
          <Card title="All purchases" right={<CsvBtn name={`purchases_${label}.csv`} rows={R.purchase.rows} />}>
            <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "ref", label: "Bill" }, { key: "party", label: "Supplier" }, { key: "item", label: "Item" }, { key: "qty", label: "Qty" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.rows} sum={["amount"]} />
          </Card>
        </>
      ) : tab === "expenses" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Total expenses" value={rs(R.expenses.total)} tone="r" />
            <Kpi label="Expense desk" value={rs(R.expenses.deskTotal)} />
            <Kpi label="Counter expenses & payments" value={rs(R.expenses.counterTotal)} />
            <Kpi label="Salary" value={rs(R.expenses.salary)} />
            <Kpi label="Supplier payments" value={rs(R.expenses.supplierPayments)} />
          </div>
          <Card title="Daily expenses">
            <Bars series={R.expenses.series} />
          </Card>
          <div className="hub-grid2">
            <Card title="By category" right={<CsvBtn name={`expenses-by-category_${label}.csv`} rows={R.expenses.byCategory} />}>
              <Table cols={[{ key: "key", label: "Category" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.expenses.byCategory} sum={["amount"]} />
            </Card>
            <Card title="All expenses" right={<CsvBtn name={`expenses_${label}.csv`} rows={R.expenses.rows} />}>
              <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "item", label: "Category" }, { key: "party", label: "Paid to" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.expenses.rows} sum={["amount"]} />
            </Card>
          </div>
        </>
      ) : tab === "jobwork" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Intakes in period" value={String(R.jobwork.intakes)} sub={kgs(R.jobwork.seedKg) + " seed"} />
            <Kpi label="Shop keeps cake" value={kgs(R.jobwork.shopSeedKg)} sub={`≈ ${kgs(R.jobwork.khaliFromRangeKg)} khali`} />
            <Kpi label="Customer keeps cake" value={kgs(R.jobwork.customerSeedKg)} />
            <Kpi label="Settled in period" value={rs(R.jobwork.settledAmount)} />
            <Kpi label="Shop owes (now)" value={rs(R.jobwork.shopOwes)} tone="o" />
            <Kpi label="Customers owe (now)" value={rs(R.jobwork.customersOwe)} tone="o" />
            <Kpi label={`Overdue ≥ ${JOBWORK_OVERDUE_DAYS} days`} value={String(R.jobwork.overdue)} tone={R.jobwork.overdue ? "r" : undefined} />
            <Kpi label="Khali stock (all job-work)" value={kgs(R.jobwork.khaliStockKg)} />
          </div>
          <Card title="Seed received per day (kg)">
            <Bars series={R.jobwork.series} money={false} />
          </Card>
          <div className="hub-grid2">
            <Card title="Unsettled (as of now)" right={<CsvBtn name="jobwork-unsettled.csv" rows={R.jobwork.outstanding} />}>
              <Table
                cols={[
                  { key: "customer", label: "Customer" },
                  { key: "date", label: "Intake" },
                  { key: "ageDays", label: "Age (days)", num: true, fmt: (v) => <b className={(v as number) >= JOBWORK_OVERDUE_DAYS ? "r" : ""}>{String(v)}</b> },
                  { key: "seedKg", label: "Seed kg", num: true },
                  { key: "cake", label: "Cake", fmt: (v) => (v === "SHOP" ? "Shop" : "Customer") },
                  { key: "due", label: "Due", num: true, fmt: money },
                ]}
                rows={R.jobwork.outstanding}
                empty="Everything settled ✓" sum={["due", "seedKg"]} />
            </Card>
            <Card title="Top customers (seed kg)">
              <Table cols={[{ key: "key", label: "Customer" }, { key: "count", label: "Intakes", num: true }, { key: "seedKg", label: "Seed kg", num: true }, { key: "settled", label: "Settled", num: true, fmt: money }]} rows={R.jobwork.byCustomer} sum={["seedKg", "settled"]} />
            </Card>
          </div>
        </>
      ) : tab === "mfg" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Oil produced" value={kgs(R.mfg.totalOilKg)} sub="barrels + fresh crush" tone="g" />
            <Kpi label="Barrels started" value={String(R.mfg.batches)} sub={`${R.mfg.settling} still settling`} />
            <Kpi label="Barrels flagged" value={String(R.mfg.flagged)} tone={R.mfg.flagged ? "r" : undefined} />
            <Kpi label="Fresh crush" value={String(R.mfg.fresh.count)} sub={rs(R.mfg.fresh.amount)} />
            <Kpi label="Fresh crush > 2% loss" value={String(R.mfg.fresh.flagged)} tone={R.mfg.fresh.flagged ? "r" : undefined} />
          </div>
          <Card title="Oil produced per day (kg)">
            <Bars series={R.mfg.series} money={false} />
          </Card>
          <Card title="By product (barrels)">
            <Table cols={[{ key: "key", label: "Product" }, { key: "batches", label: "Barrels", num: true }, { key: "complete", label: "Complete", num: true }, { key: "flagged", label: "Flagged", num: true }, { key: "seedKg", label: "Seed kg", num: true }, { key: "oilKg", label: "Oil kg", num: true }, { key: "yieldPct", label: "Yield %", num: true }]} rows={R.mfg.byProduct} sum={["seedKg", "oilKg"]} />
          </Card>
          <Card title="Barrels" right={<CsvBtn name={`barrels_${label}.csv`} rows={R.mfg.rows} />}>
            <Table
              cols={[
                { key: "date", label: "Date" },
                { key: "barrel", label: "Barrel" },
                { key: "product", label: "Product" },
                { key: "seedKg", label: "Seed kg", num: true },
                { key: "oilKg", label: "Oil kg", num: true, fmt: (v) => (v === null ? "settling" : String(v)) },
                { key: "efficiencyPct", label: "Eff. %", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                { key: "band", label: "Band", fmt: (v) => String(v ?? "—") },
                { key: "flagged", label: "Flag", fmt: (v) => (v ? <b className="r">⚠ flagged</b> : "") },
              ]}
              rows={R.mfg.rows} sum={["seedKg", "oilKg"]} />
          </Card>
          <Card title="🫗 Fresh crush (our seed)" right={<CsvBtn name={`fresh-crush_${label}.csv`} rows={R.mfg.freshRows} />}>
            <Table
              cols={[
                { key: "date", label: "Date" },
                { key: "seed", label: "Oil" },
                { key: "seedKg", label: "Seed kg", num: true },
                { key: "oilKg", label: "Oil kg", num: true },
                { key: "yieldPct", label: "Yield %", num: true },
                { key: "soldQty", label: "Sold" },
                { key: "extraKg", label: "To tank kg", num: true },
                { key: "extraTo", label: "Tank / barrel" },
                { key: "cakeKg", label: "Cake kg", num: true },
                { key: "lossFlag", label: "Loss", fmt: (v) => (v ? <b className="r">⚠ &gt;2%</b> : "ok") },
                { key: "amount", label: "Amount", num: true, fmt: money },
              ]}
              rows={R.mfg.freshRows} sum={["amount", "seedKg", "oilKg", "extraKg", "cakeKg"]} />
          </Card>
        </>
      ) : tab === "stock" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Items in master" value={String(R.stock.items.length)} />
            <Kpi label="At / below reorder level" value={String(R.stock.lowCount)} tone={R.stock.lowCount ? "r" : undefined} />
            <Kpi label="Khali (job-work)" value={kgs(R.stock.khaliJobWorkKg)} />
            <Kpi label="Last physical oil count" value={R.stock.physicalDate || "—"} sub="Daily Closing desk" />
          </div>
          <div className="hub-note">
            Book stock = opening + purchase bills − sales invoices, for items linked to the Item master, as of {span.to}. Quick Register
            entries are counter records (not linked to the master), listed separately so nothing is double-counted.
          </div>
          <Card
            title={`📦 Stock tally ${R.tally.latest ? `— ${R.tally.latest.date} · ${R.tally.latest.session}` : ""}`}
            right={<span className="hub-m">gap flag ≥ {R.tally.threshold} kg</span>}
          >
            <Table
              cols={[
                { key: "product", label: "Product" },
                { key: "yesterday", label: "Yesterday", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                { key: "today", label: "Counted", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                { key: "sale", label: "Sale (yday − today)", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                { key: "reportSale", label: "Scale report sale", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                { key: "gap", label: "Gap kg", num: true, fmt: (v, r) => (v === null ? "—" : <b className={r.flagged ? "r" : "g"}>{String(v)}</b>) },
              ]}
              rows={R.tally.latest?.rows || []}
              empty="No physical stock count yet — Quick Register → 📦 Stock tally, or the Daily Closing desk"
            />
          </Card>
          <Card title={`Stock tally history (${label})`} right={<span className="hub-m">{R.tally.flaggedCount} flagged</span>}>
            <Table
              cols={[
                { key: "date", label: "Date" },
                { key: "session", label: "Count" },
                { key: "product", label: "Product" },
                { key: "today", label: "Counted", num: true, fmt: (v) => (v === null ? "—" : String(v)) },
                { key: "sale", label: "Sale", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                { key: "reportSale", label: "Report", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
                { key: "gap", label: "Gap", num: true, fmt: (v, r) => (v === null ? "—" : <b className={r.flagged ? "r" : ""}>{String(v)}</b>) },
              ]}
              rows={R.tally.rows}
            />
          </Card>
          <Card title="Book stock (Item master)" right={<CsvBtn name={`stock_${span.to}.csv`} rows={R.stock.items} />}>
            <Table
              cols={[
                { key: "name", label: "Item" },
                { key: "unit", label: "Unit" },
                { key: "opening", label: "Opening", num: true },
                { key: "inQty", label: "In (bills)", num: true },
                { key: "outQty", label: "Out (invoices)", num: true },
                { key: "book", label: "Book stock", num: true, fmt: (v, r) => <b className={r.low ? "r" : ""}>{String(v)}</b> },
                { key: "reorderLevel", label: "Reorder at", num: true, fmt: (v) => (v === null || v === undefined ? "—" : String(v)) },
              ]}
              rows={R.stock.items}
              empty="No items in the Item master yet (Inventory desk)"
            />
          </Card>
          <div className="hub-grid2">
            <Card title={`Physical oil stock (Daily Closing ${R.stock.physicalDate || "—"})`}>
              <Table cols={[{ key: "product", label: "Product" }, { key: "today", label: "Today", num: true }, { key: "yesterday", label: "Yesterday", num: true }, { key: "gap", label: "Gap", num: true }]} rows={R.stock.physical} empty="No stock tally entered yet" />
            </Card>
            <Card title="Counter quantities (Quick Register, all time)">
              <Table cols={[{ key: "item", label: "Item" }, { key: "unit", label: "Unit" }, { key: "inQty", label: "Bought", num: true }, { key: "outQty", label: "Sold", num: true }]} rows={R.stock.counter} />
            </Card>
            <Card title="Fresh crush — seed used & oil made (all time)">
              <Table cols={[{ key: "seed", label: "Seed" }, { key: "seedKg", label: "Seed kg", num: true }, { key: "oilKg", label: "Oil kg", num: true }, { key: "toTankKg", label: "To tank kg", num: true }, { key: "cakeKg", label: "Cake kg", num: true }]} rows={R.stock.freshSeedUsed} sum={["seedKg", "oilKg", "cakeKg", "toTankKg"]} />
            </Card>
            <Card title="Fresh-crush oil moved to tanks / barrels">
              <Table cols={[{ key: "tank", label: "Tank / barrel" }, { key: "kg", label: "kg", num: true }]} rows={Object.entries(R.stock.toTank).map(([tank, kg]) => ({ tank, kg }))} />
            </Card>
          </div>
        </>
      ) : tab === "cash" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Cash in" value={rs(R.cash.cashIn)} tone="g" />
            <Kpi label="Cash out" value={rs(R.cash.cashOut)} tone="r" />
            <Kpi label="Net cash (in − out)" value={rs(R.cash.cashIn - R.cash.cashOut)} tone={R.cash.cashIn - R.cash.cashOut >= 0 ? "g" : "r"} />
            <Kpi label="UPI in / out" value={`${rs(R.cash.upiIn)} / ${rs(R.cash.upiOut)}`} />
            <Kpi label="Udhaar given" value={rs(R.cash.creditGiven)} tone="o" />
            <Kpi label="Pigmee" value={rs(R.cash.pigmee)} />
            <Kpi label="Sahil took" value={rs(R.cash.ownerDraw)} />
            <Kpi label={`Counts off by ≥ ₹${R.cash.threshold}`} value={String(R.cash.mismatches)} tone={R.cash.mismatches ? "r" : undefined} />
          </div>
          <div className="hub-note">Counter movements from the Quick Register. Job-work advances and settlements are in the Day book.</div>
          <Card title="Cash counts (Daily Closing / Quick Register tallies)" right={<CsvBtn name={`cash-counts_${label}.csv`} rows={R.cash.counts} />}>
            <Table
              cols={[
                { key: "date", label: "Date" },
                { key: "session", label: "Count", fmt: (v) => (v === "AFTERNOON" ? "Tally 1 (midday)" : "Tally 2 (closing)") },
                { key: "system", label: "System", num: true, fmt: money },
                { key: "counter", label: "Counted", num: true, fmt: money },
                { key: "diff", label: "Difference", num: true, fmt: (v, r) => <b className={r.mismatch ? "r" : ""}>{(v as number) > 0 ? `short ${rs(v as number)}` : (v as number) < 0 ? `extra ${rs(-(v as number))}` : "✓"}</b> },
              ]}
              rows={R.cash.counts}
            />
          </Card>
        </>
      ) : tab === "udhaar" ? (
        <>
          <div className="hub-kpis">
            <Kpi label="Outstanding udhaar" value={rs(R.udhaar.outstanding)} tone="o" sub={`as of ${span.to}`} />
            <Kpi label="People owing" value={String(R.udhaar.rows.filter((r) => r.balance > 0).length)} />
            <Kpi label="Credit GST invoices" value={String(R.udhaar.creditInvoices.length)} sub="receipt not tracked yet" />
          </div>
          <div className="hub-note">From the Quick Register: udhaar sales minus &ldquo;Udhaar received&rdquo;, matched by the name typed. Use the same spelling each time.</div>
          <Card title="Udhaar by person" right={<CsvBtn name={`udhaar_${span.to}.csv`} rows={R.udhaar.rows} />}>
            <Table cols={[{ key: "name", label: "Name" }, { key: "given", label: "Udhaar given", num: true, fmt: money }, { key: "received", label: "Received", num: true, fmt: money }, { key: "balance", label: "Balance", num: true, fmt: (v) => <b className={(v as number) > 0 ? "o" : "g"}>{rs(v as number)}</b> }, { key: "last", label: "Last activity" }]} rows={R.udhaar.rows} empty="No udhaar recorded" sum={["given", "received", "balance"]} />
          </Card>
          <Card title="Credit invoices (Sales desk)">
            <Table cols={[{ key: "date", label: "Date" }, { key: "invoiceNo", label: "Invoice" }, { key: "party", label: "Party" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.udhaar.creditInvoices} empty="None" sum={["amount"]} />
          </Card>
        </>
      ) : (
        <>
          <div className="hub-kpis">
            <Kpi label="Money in" value={rs(R.daybook.totalIn)} tone="g" />
            <Kpi label="Money out" value={rs(R.daybook.totalOut)} tone="r" />
            <Kpi label="Net (in − out)" value={rs(R.daybook.totalIn - R.daybook.totalOut)} tone={R.daybook.totalIn - R.daybook.totalOut >= 0 ? "g" : "r"} />
            <Kpi label="Transactions" value={String(R.daybook.rows.length)} />
          </div>
          <div className="hub-note">
            In / Out are transaction values, including udhaar (credit) and UPI. For the money actually in the counter, see the Cash tab.
          </div>
          <Card title="Day book — every transaction, newest first" right={<CsvBtn name={`daybook_${label}.csv`} rows={R.daybook.rows} />}>
            <Table
              cols={[
                { key: "date", label: "Date" },
                { key: "at", label: "Time", fmt: (v) => new Date(String(v)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) },
                { key: "source", label: "Source" },
                { key: "type", label: "Type" },
                { key: "party", label: "Party" },
                { key: "detail", label: "Detail" },
                { key: "mode", label: "Mode" },
                { key: "in", label: "In", num: true, fmt: (v) => ((v as number) ? rs(v as number) : "") },
                { key: "out", label: "Out", num: true, fmt: (v) => ((v as number) ? rs(v as number) : "") },
              ]}
              rows={R.daybook.rows} sum={["in", "out"]} />
          </Card>
        </>
      )}
      <footer className="hub-m small hub-foot">
        Informational report — not a substitute for the accountant&apos;s Vyapar books or GST/ITC-04 filings. Preferences saved on this device
        ({HUB_PREFS_KEY}).
      </footer>
    </div>
  );
}
