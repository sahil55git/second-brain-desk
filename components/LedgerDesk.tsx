"use client";

// One register for everything: Quick Register money entries, udhaar, purchases,
// expenses, job-work, refunds and manufacturing batches, in one list.
// Data comes from the Owner-only reports hub, so Staff never see it.

import PrintButton from "@/components/print/PrintButton";
import { useEffect, useMemo, useState } from "react";
import { unifiedLedger, type LedgerRow } from "@/lib/ledger";
import { businessDate } from "@/lib/register";
import type { BizData } from "@/lib/bizReports";

function shiftDay(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function LedgerDesk() {
  const today = useMemo(() => businessDate(Date.now()), []);
  const [from, setFrom] = useState(() => shiftDay(today, -30));
  const [to, setTo] = useState(today);
  const [source, setSource] = useState<string>("All");
  const [data, setData] = useState<BizData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/reports/hub?from=${from}&to=${to}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: BizData; error?: string };
        if (!r.ok || !j.data) throw new Error(j.error || "Could not load the ledger.");
        return j.data;
      })
      .then((j) => live && setData(j))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [from, to]);

  const ledger = useMemo(() => (data ? unifiedLedger(data, { from, to }) : null), [data, from, to]);
  const rows: LedgerRow[] = useMemo(
    () => (ledger ? ledger.rows.filter((r) => source === "All" || r.source === source) : []),
    [ledger, source]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)} className="ml-2 rounded border px-2 py-1">
            <option>All</option>
            {ledger?.sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ledger && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>Money in: <strong>{inr(ledger.totalIn)}</strong></span>
          <span>Money out: <strong>{inr(ledger.totalOut)}</strong></span>
          <span>Entries: <strong>{ledger.rows.length}</strong></span>
        </div>
      )}

      <div className="flex justify-end gap-2 -mb-2"><PrintButton area="#pa-ledger" label="🖨️ Print ledger" className="rounded border border-black/20 dark:border-white/20 px-3 py-1 text-sm" /></div>
      <div id="pa-ledger" className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="text-left opacity-70">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2 text-right">In</th>
              <th className="px-3 py-2 text-right">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-black/5 dark:border-white/5">
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2">{r.source}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.party}</td>
                <td className="px-3 py-2">{r.detail}</td>
                <td className="px-3 py-2">{r.mode}</td>
                <td className="px-3 py-2 text-right">{r.in ? inr(r.in) : ""}</td>
                <td className="px-3 py-2 text-right">{r.out ? inr(r.out) : ""}</td>
              </tr>
            ))}
            {ledger && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center opacity-60">No entries in this range.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
