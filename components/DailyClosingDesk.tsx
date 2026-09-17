"use client";

import React, { useMemo, useState } from "react";
import type { DailyClosingDTO } from "@/lib/types";
import {
  cashGapFlag,
  computeProductTally,
  getYesterdayStock,
  STOCK_PRODUCTS,
  type CashInputs,
} from "@/lib/calculations";

function inr(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type StockFormRow = { today: string; reportSale: string; yesterdayOverride: string };

function emptyStockForm(): Record<string, StockFormRow> {
  const out: Record<string, StockFormRow> = {};
  STOCK_PRODUCTS.forEach((p) => (out[p.key] = { today: "", reportSale: "", yesterdayOverride: "" }));
  return out;
}

export default function DailyClosingDesk({
  initialEntries,
  dbConnected,
}: {
  initialEntries: DailyClosingDTO[];
  dbConnected: boolean;
}) {
  const [entries, setEntries] = useState<DailyClosingDTO[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<"AFTERNOON" | "NIGHT">("AFTERNOON");
  const [cash, setCash] = useState({
    cashInOpening: "",
    cashInSales: "",
    cashInOther: "",
    cashOutGrn: "",
    cashOutExpenses: "",
    cashOutSalary: "",
    cashOutUpi: "",
    cashOutDraw: "",
    cashOutOther: "",
  });
  const [counterCashInr, setCounterCashInr] = useState("");
  const [showYesterdayBox, setShowYesterdayBox] = useState(false);
  const [stockForm, setStockForm] = useState<Record<string, StockFormRow>>(emptyStockForm());

  const [editRowId, setEditRowId] = useState<string | null>(null);

  async function refetch() {
    try {
      const res = await fetch("/api/daily-closing");
      const json = await res.json();
      if (res.ok) setEntries(json.data);
    } catch {
      // ignore
    }
  }

  const cashNums: CashInputs = useMemo(
    () => ({
      cashInOpening: parseFloat(cash.cashInOpening) || 0,
      cashInSales: parseFloat(cash.cashInSales) || 0,
      cashInOther: parseFloat(cash.cashInOther) || 0,
      cashOutGrn: parseFloat(cash.cashOutGrn) || 0,
      cashOutExpenses: parseFloat(cash.cashOutExpenses) || 0,
      cashOutSalary: parseFloat(cash.cashOutSalary) || 0,
      cashOutUpi: parseFloat(cash.cashOutUpi) || 0,
      cashOutDraw: parseFloat(cash.cashOutDraw) || 0,
      cashOutOther: parseFloat(cash.cashOutOther) || 0,
    }),
    [cash]
  );

  const counterCashNum = parseFloat(counterCashInr) || 0;
  const gapPreview = cashGapFlag(cashNums, counterCashNum);

  // Client-side "yesterday" lookups for the live preview, mirroring
  // getYesterdayStock()'s server-side logic against already-loaded entries.
  const priorEntriesForPreview = useMemo(
    () =>
      entries.map((e) => ({
        createdAt: e.createdAt,
        stock: (e.stock as Record<string, { today?: number | null }>) || {},
      })),
    [entries]
  );

  const stockPreview = useMemo(() => {
    const now = new Date();
    return STOCK_PRODUCTS.map((config) => {
      const row = stockForm[config.key];
      const today = row.today === "" ? undefined : parseFloat(row.today);
      const reportSale = row.reportSale === "" ? undefined : parseFloat(row.reportSale);
      const override = row.yesterdayOverride === "" ? undefined : parseFloat(row.yesterdayOverride);
      const { value: yesterday, source } = getYesterdayStock(
        priorEntriesForPreview,
        config.key,
        now,
        override
      );
      const computed = computeProductTally(config, today, reportSale, yesterday, source);
      return { config, computed };
    });
  }, [stockForm, priorEntriesForPreview]);

  async function submitClosing(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const stockInput: Record<string, { today?: number; reportSale?: number; yesterdayOverride?: number }> = {};
      STOCK_PRODUCTS.forEach((p) => {
        const row = stockForm[p.key];
        if (row.today === "" && row.reportSale === "" && row.yesterdayOverride === "") return;
        stockInput[p.key] = {
          today: row.today === "" ? undefined : parseFloat(row.today),
          reportSale: row.reportSale === "" ? undefined : parseFloat(row.reportSale),
          yesterdayOverride: row.yesterdayOverride === "" ? undefined : parseFloat(row.yesterdayOverride),
        };
      });

      const res = await fetch("/api/daily-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          session,
          ...cash,
          cashInOpening: cashNums.cashInOpening,
          cashInSales: cashNums.cashInSales,
          cashInOther: cashNums.cashInOther,
          cashOutGrn: cashNums.cashOutGrn,
          cashOutExpenses: cashNums.cashOutExpenses,
          cashOutSalary: cashNums.cashOutSalary,
          cashOutUpi: cashNums.cashOutUpi,
          cashOutDraw: cashNums.cashOutDraw,
          cashOutOther: cashNums.cashOutOther,
          counterCashInr: counterCashNum,
          stockInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save closing count");
      } else {
        setEntries((prev) => [json.data, ...prev]);
        setCash({
          cashInOpening: "",
          cashInSales: "",
          cashInOther: "",
          cashOutGrn: "",
          cashOutExpenses: "",
          cashOutSalary: "",
          cashOutUpi: "",
          cashOutDraw: "",
          cashOutOther: "",
        });
        setCounterCashInr("");
        setStockForm(emptyStockForm());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save closing count");
    } finally {
      setLoading(false);
      refetch();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Form panel */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-semibold mb-3">New closing count</h2>
        <form onSubmit={submitClosing} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block mb-1 opacity-70">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-70">Session</label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value as "AFTERNOON" | "NIGHT")}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
              >
                <option value="AFTERNOON">Afternoon shift-change</option>
                <option value="NIGHT">9 PM closing</option>
              </select>
            </div>
          </div>

          <details
            open={showYesterdayBox}
            onToggle={(e) => setShowYesterdayBox((e.target as HTMLDetailsElement).open)}
            className="rounded border border-black/10 dark:border-white/10 p-2"
          >
            <summary className="cursor-pointer opacity-70 text-xs">
              Yesterday&apos;s closing (optional — only if not already auto-filled)
            </summary>
            <p className="text-xs opacity-60 mt-2">
              Typing an opening-cash figure below mirrors straight into Opening cash. Per-product
              &quot;yesterday&quot; overrides are entered next to each stock field below.
            </p>
          </details>

          <div className="font-medium mt-2">Cash in</div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput label="Opening" value={cash.cashInOpening} onChange={(v) => setCash((s) => ({ ...s, cashInOpening: v }))} />
            <LabeledInput label="Sales" value={cash.cashInSales} onChange={(v) => setCash((s) => ({ ...s, cashInSales: v }))} />
            <LabeledInput label="Other" value={cash.cashInOther} onChange={(v) => setCash((s) => ({ ...s, cashInOther: v }))} />
          </div>

          <div className="font-medium mt-2">Cash out</div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput label="Grn (job-work)" value={cash.cashOutGrn} onChange={(v) => setCash((s) => ({ ...s, cashOutGrn: v }))} />
            <LabeledInput label="Expenses" value={cash.cashOutExpenses} onChange={(v) => setCash((s) => ({ ...s, cashOutExpenses: v }))} />
            <LabeledInput label="Salary" value={cash.cashOutSalary} onChange={(v) => setCash((s) => ({ ...s, cashOutSalary: v }))} />
            <LabeledInput label="UPI" value={cash.cashOutUpi} onChange={(v) => setCash((s) => ({ ...s, cashOutUpi: v }))} />
            <LabeledInput label="Draw" value={cash.cashOutDraw} onChange={(v) => setCash((s) => ({ ...s, cashOutDraw: v }))} />
            <LabeledInput label="Other" value={cash.cashOutOther} onChange={(v) => setCash((s) => ({ ...s, cashOutOther: v }))} />
          </div>

          <div>
            <label className="block mb-1 opacity-70">Physical count — Counter cash (₹)</label>
            <input
              type="number"
              value={counterCashInr}
              onChange={(e) => setCounterCashInr(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5"
            />
          </div>

          <div
            className={`rounded px-3 py-2 text-xs ${
              gapPreview.flagged
                ? "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300"
                : "bg-black/5 dark:bg-white/5"
            }`}
          >
            System cash: <strong>{inr(gapPreview.systemCash)}</strong> · Diff:{" "}
            <strong>{inr(gapPreview.diff)}</strong>
            {gapPreview.flagged && (
              <div className="mt-1 font-semibold">
                ⚠ Mismatch ≥ ₹300 —{" "}
                {session === "AFTERNOON"
                  ? "escalate to Sahil now."
                  : "recorded now; the accountant's next-day pass will catch this."}
              </div>
            )}
          </div>

          <div className="font-medium mt-2">Oil-stock tally</div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {stockPreview.map(({ config, computed }) => (
              <div key={config.key} className="rounded border border-black/10 dark:border-white/10 p-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{config.label}</span>
                  <span className="opacity-60">
                    Yesterday: {computed.yesterday ?? "—"}
                    {computed.yesterdaySource === "override" && " (manual)"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="Today"
                    value={stockForm[config.key].today}
                    onChange={(e) =>
                      setStockForm((s) => ({ ...s, [config.key]: { ...s[config.key], today: e.target.value } }))
                    }
                    className="w-20 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-xs"
                  />
                  {config.hasReportSale && (
                    <input
                      placeholder="Report sale"
                      value={stockForm[config.key].reportSale}
                      onChange={(e) =>
                        setStockForm((s) => ({
                          ...s,
                          [config.key]: { ...s[config.key], reportSale: e.target.value },
                        }))
                      }
                      className="w-24 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-xs"
                    />
                  )}
                  {showYesterdayBox && (
                    <input
                      placeholder="Yesterday override"
                      value={stockForm[config.key].yesterdayOverride}
                      onChange={(e) =>
                        setStockForm((s) => ({
                          ...s,
                          [config.key]: { ...s[config.key], yesterdayOverride: e.target.value },
                        }))
                      }
                      className="w-28 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-xs"
                    />
                  )}
                  <div className="text-xs opacity-70 flex items-center">
                    {config.hasReportSale ? (
                      <>
                        Sale {computed.sale ?? "—"} · Gap{" "}
                        <span className={computed.gap && Math.abs(computed.gap) >= 0.5 ? "text-amber-600 font-semibold" : ""}>
                          {" "}
                          {computed.gap ?? "—"}
                        </span>
                      </>
                    ) : (
                      <>Diff {computed.diff ?? "—"}</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && <div className="text-red-600 text-xs">{error}</div>}
          {!dbConnected && (
            <div className="text-amber-700 dark:text-amber-400 text-xs">
              Database not connected — this will fail to save until DATABASE_URL is set.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-amber-600 text-white py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Saving…" : "Log closing count"}
          </button>
        </form>
      </div>

      {/* Ledger panel */}
      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5 text-left">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Session</th>
              <th className="p-2">System cash</th>
              <th className="p-2">Counter cash</th>
              <th className="p-2">Diff</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center opacity-60">
                  No closing counts yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <React.Fragment key={entry.id}>
                <tr className="border-t border-black/5 dark:border-white/5 align-top">
                  <td className="p-2 whitespace-nowrap">{fmtTime(entry.createdAt)}</td>
                  <td className="p-2">{entry.session === "AFTERNOON" ? "Afternoon" : "9 PM"}</td>
                  <td className="p-2">{inr(entry.systemCashInr)}</td>
                  <td className="p-2">{inr(entry.counterCashInr)}</td>
                  <td className="p-2">
                    <span
                      className={
                        entry.cashMismatch ? "text-red-600 font-semibold" : "opacity-80"
                      }
                    >
                      {inr(entry.cashDiffInr)}
                    </span>
                  </td>
                  <td className="p-2">
                    {entry.stock &&
                      Object.entries(entry.stock).map(([key, v]) => {
                        const gap = v.gap ?? v.diff ?? 0;
                        const ok = Math.abs(gap) < 0.5;
                        return (
                          <span
                            key={key}
                            className={`inline-block mr-1 mb-1 px-1.5 py-0.5 rounded text-[10px] ${
                              ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {key}:{ok ? "✓" : gap}
                          </span>
                        );
                      })}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => setEditRowId(editRowId === entry.id ? null : entry.id)}
                      className="underline opacity-80"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
                {editRowId === entry.id && (
                  <EditClosingRow
                    entry={entry}
                    onSaved={(updated) => {
                      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                      setEditRowId(null);
                    }}
                    onCancel={() => setEditRowId(null)}
                  />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block mb-1 opacity-70 text-xs">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
      />
    </div>
  );
}

function EditClosingRow({
  entry,
  onSaved,
  onCancel,
}: {
  entry: DailyClosingDTO;
  onSaved: (updated: DailyClosingDTO) => void;
  onCancel: () => void;
}) {
  const [counterCashInr, setCounterCashInr] = useState(String(entry.counterCashInr));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-closing/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterCashInr: parseFloat(counterCashInr) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save edit");
      } else {
        onSaved(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className="bg-black/5 dark:bg-white/5">
      <td colSpan={7} className="p-3">
        <div className="flex items-end gap-3 text-xs">
          <div>
            <label className="block mb-1 opacity-70">Counter cash (₹)</label>
            <input
              value={counterCashInr}
              onChange={(e) => setCounterCashInr(e.target.value)}
              className="w-28 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1"
            />
          </div>
          {error && <div className="text-red-600">{error}</div>}
          <button
            onClick={save}
            disabled={loading}
            className="rounded bg-amber-600 text-white px-3 py-1.5 font-medium disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={onCancel} className="underline opacity-70">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
