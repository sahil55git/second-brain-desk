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
import { CASH_GAP_THRESHOLD_INR } from "@/lib/calculations";
import { JOBWORK_OVERDUE_DAYS } from "@/lib/reports";
import { DEFAULT_HUB_PREFS, HUB_PREFS_KEY, WIDGETS, loadHubPrefs, saveHubPrefs, type HubPrefs, type Preset, type WidgetId } from "@/lib/hubPrefs";

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

function Table({ cols, rows, empty = "Nothing in this period" }: { cols: { key: string; label: string; num?: boolean; fmt?: (v: unknown, r: Record<string, unknown>) => React.ReactNode }[]; rows: Record<string, unknown>[]; empty?: string }) {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, span.from, span.to, t]);

  const label = `${span.from}${span.to !== span.from ? ` → ${span.to}` : ""}`;

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
            <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.d7.byItem.slice(0, 8)} />
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
              rows={R.dBook.rows.slice(0, 12)}
            />
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
          <a className="hub-btn" href="/">🗂️ Full desk</a>
          <a className="hub-btn" href="/settings">⚙️ Settings</a>
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
          <div className="hub-dash">
            {visibleWidgets.map((id) => (
              <div key={id} className={`hub-w hub-w-${id}`}>
                {widget(id)}
              </div>
            ))}
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
              <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "unit", label: "Unit" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.byItem} />
            </Card>
            <Card title="By customer" right={<CsvBtn name={`sales-by-customer_${label}.csv`} rows={R.sales.byParty} />}>
              <Table cols={[{ key: "key", label: "Customer" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.byParty} />
            </Card>
          </div>
          <Card title="All sales" right={<CsvBtn name={`sales_${label}.csv`} rows={R.sales.rows} />}>
            <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "ref", label: "Ref" }, { key: "party", label: "Party" }, { key: "item", label: "Item" }, { key: "qty", label: "Qty" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.sales.rows} />
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
              <Table cols={[{ key: "key", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "unit", label: "Unit" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.byItem} />
            </Card>
            <Card title="By supplier" right={<CsvBtn name={`purchase-by-supplier_${label}.csv`} rows={R.purchase.bySupplier} />}>
              <Table cols={[{ key: "key", label: "Supplier" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.bySupplier} />
            </Card>
          </div>
          <Card title="All purchases" right={<CsvBtn name={`purchases_${label}.csv`} rows={R.purchase.rows} />}>
            <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "ref", label: "Bill" }, { key: "party", label: "Supplier" }, { key: "item", label: "Item" }, { key: "qty", label: "Qty" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.purchase.rows} />
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
              <Table cols={[{ key: "key", label: "Category" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.expenses.byCategory} />
            </Card>
            <Card title="All expenses" right={<CsvBtn name={`expenses_${label}.csv`} rows={R.expenses.rows} />}>
              <Table cols={[{ key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "item", label: "Category" }, { key: "party", label: "Paid to" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.expenses.rows} />
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
                empty="Everything settled ✓"
              />
            </Card>
            <Card title="Top customers (seed kg)">
              <Table cols={[{ key: "key", label: "Customer" }, { key: "count", label: "Intakes", num: true }, { key: "seedKg", label: "Seed kg", num: true }, { key: "settled", label: "Settled", num: true, fmt: money }]} rows={R.jobwork.byCustomer} />
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
            <Table cols={[{ key: "key", label: "Product" }, { key: "batches", label: "Barrels", num: true }, { key: "complete", label: "Complete", num: true }, { key: "flagged", label: "Flagged", num: true }, { key: "seedKg", label: "Seed kg", num: true }, { key: "oilKg", label: "Oil kg", num: true }, { key: "yieldPct", label: "Yield %", num: true }]} rows={R.mfg.byProduct} />
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
              rows={R.mfg.rows}
            />
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
              rows={R.mfg.freshRows}
            />
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
              <Table cols={[{ key: "seed", label: "Seed" }, { key: "seedKg", label: "Seed kg", num: true }, { key: "oilKg", label: "Oil kg", num: true }, { key: "toTankKg", label: "To tank kg", num: true }, { key: "cakeKg", label: "Cake kg", num: true }]} rows={R.stock.freshSeedUsed} />
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
            <Table cols={[{ key: "name", label: "Name" }, { key: "given", label: "Udhaar given", num: true, fmt: money }, { key: "received", label: "Received", num: true, fmt: money }, { key: "balance", label: "Balance", num: true, fmt: (v) => <b className={(v as number) > 0 ? "o" : "g"}>{rs(v as number)}</b> }, { key: "last", label: "Last activity" }]} rows={R.udhaar.rows} empty="No udhaar recorded" />
          </Card>
          <Card title="Credit invoices (Sales desk)">
            <Table cols={[{ key: "date", label: "Date" }, { key: "invoiceNo", label: "Invoice" }, { key: "party", label: "Party" }, { key: "amount", label: "Amount", num: true, fmt: money }]} rows={R.udhaar.creditInvoices} empty="None" />
          </Card>
        </>
      ) : (
        <>
          <div className="hub-kpis">
            <Kpi label="Money in" value={rs(R.daybook.totalIn)} tone="g" />
            <Kpi label="Money out" value={rs(R.daybook.totalOut)} tone="r" />
            <Kpi label="Transactions" value={String(R.daybook.rows.length)} />
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
              rows={R.daybook.rows}
            />
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
