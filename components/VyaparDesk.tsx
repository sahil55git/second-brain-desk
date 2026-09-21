"use client";

// Vyapar cross-check dashboard (erp-architecture-plan.md). Vyapar is the
// accountant's source-of-truth software; this desk shows a SNAPSHOT of its
// figures (parsed from the .vyb backup) as clean analytical tiles + tables,
// so the numbers can be eyeballed against physical stock on the floor and
// against this app's own entries. Read-only display; Owner pastes a fresh
// snapshot when a newer backup is read.
//
// Two viewer features layered on top:
//  - "Hide figures": blurs every ₹ amount (reveal on hover) so the screen can
//    be shown at the counter without exposing balances. Per-browser only.
//  - "By day": a date picker + daily table over payload.dailySeries, for
//    day-wise sales / credit-notes / purchases / expenses / cash.
import { useEffect, useMemo, useState } from "react";
import type {
  VyaparSnapshotDTO,
  VyaparSnapshotPayload,
  VyaparDailyRow,
} from "@/lib/types";

const DISCREET_KEY = "sbd_vyapar_discreet";

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}
// A money value tagged `.money` so the discreet wrapper can blur it.
function M({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  return <span className={`money ${className}`}>{inr(v)}</span>;
}
// Normalise a date string to a Date for sorting; accepts YYYY-MM-DD or DD-MM-YYYY.
function toSortable(d: string): number {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(d);
  if (iso) return new Date(d).getTime();
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
  return 0;
}
function fmtDate(d: string): string {
  const t = toSortable(d);
  if (!t) return d;
  return new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VyaparDesk({
  initialSnapshot,
  dbConnected,
}: {
  initialSnapshot: VyaparSnapshotDTO | null;
  dbConnected: boolean;
}) {
  const [snapshot, setSnapshot] = useState<VyaparSnapshotDTO | null>(initialSnapshot);
  const [showUpload, setShowUpload] = useState(false);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discreet, setDiscreet] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Restore the discreet preference (per-browser). Wrapped for private-mode.
  useEffect(() => {
    try {
      if (localStorage.getItem(DISCREET_KEY) === "1") setDiscreet(true);
    } catch {
      /* ignore */
    }
  }, []);
  function toggleDiscreet() {
    setDiscreet((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DISCREET_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const p: VyaparSnapshotPayload = useMemo(() => snapshot?.payload ?? {}, [snapshot]);

  const daily: VyaparDailyRow[] = useMemo(() => {
    const rows = Array.isArray(p.dailySeries) ? [...p.dailySeries] : [];
    rows.sort((a, b) => toSortable(b.date) - toSortable(a.date)); // newest first
    return rows;
  }, [p.dailySeries]);

  // Default the picker to the newest day once data is present.
  useEffect(() => {
    if (daily.length > 0 && !daily.some((r) => r.date === selectedDate)) {
      setSelectedDate(daily[0].date);
    }
  }, [daily, selectedDate]);

  const selectedRow = daily.find((r) => r.date === selectedDate) || null;

  async function save() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError("That isn't valid JSON — paste the output of the Vyapar reader.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vyapar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save snapshot.");
        return;
      }
      setSnapshot(json.data);
      setShowUpload(false);
      setRaw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snapshot.");
    } finally {
      setSaving(false);
    }
  }

  const updatedLabel = snapshot
    ? new Date(snapshot.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;

  // When discreet, blur every `.money` descendant; reveal one on hover.
  const discreetWrap = discreet
    ? "[&_.money]:blur-[6px] [&_.money]:select-none [&_.money]:transition-[filter] [&_.money:hover]:blur-none"
    : "";

  const net = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a || 0) - (b || 0);

  return (
    <div className={`space-y-5 ${discreetWrap}`}>
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — the Vyapar snapshot can&apos;t load or save yet.
        </div>
      )}

      {/* Source strip */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold">Vyapar snapshot — cross-check</div>
            <p className="text-xs opacity-60 mt-0.5 max-w-xl">
              A snapshot from Vyapar (the accountant&apos;s software), not a live feed — Vyapar has
              no API. Use these figures to check physical stock on the floor and this app&apos;s own
              entries against what&apos;s in Vyapar as of the last backup.
            </p>
            <div className="text-xs opacity-70 mt-2 space-x-3">
              {p.entity && <span><span className="opacity-50">Entity:</span> {p.entity}</span>}
              {p.backupTakenAt && <span><span className="opacity-50">Backup:</span> {p.backupTakenAt}</span>}
              {p.asOfDate && <span><span className="opacity-50">Figures as of:</span> {p.asOfDate}</span>}
            </div>
            {updatedLabel && (
              <div className="text-[11px] opacity-40 mt-1">Snapshot uploaded {updatedLabel}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDiscreet}
              className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
              title="Blur all amounts so the screen can be shown at the counter"
            >
              {discreet ? "Show figures" : "Hide figures"}
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
            >
              {showUpload ? "Cancel" : "Update snapshot"}
            </button>
          </div>
        </div>

        {showUpload && (
          <div className="mt-4 space-y-2">
            <p className="text-xs opacity-60">
              Paste the JSON from <code className="font-mono">vyapar_reader.py</code> (latest
              backup) and save. It replaces the current snapshot.
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder='{"entity": "...", "asOfDate": "...", "stockValueInr": 4539252, "topItems": [...], "dailySeries": [...] }'
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2 text-xs font-mono"
            />
            {error && (
              <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                {error}
              </div>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save snapshot"}
            </button>
          </div>
        )}
      </div>

      {!snapshot ? (
        <div className="rounded-xl border border-dashed border-black/20 dark:border-white/20 p-8 text-center">
          <p className="text-sm opacity-70">No Vyapar snapshot yet.</p>
          <p className="text-xs opacity-50 mt-1">
            Run the Vyapar reader against the latest backup and paste its JSON via
            &ldquo;Update snapshot&rdquo; above.
          </p>
        </div>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Stock value" value={<M v={p.stockValueInr} />} sub={p.activeItems ? `${num(p.activeItems)} active items` : "as of backup"} />
            <Tile label="Receivable (customers owe)" value={<M v={p.receivableInr} />} sub="sum of positive balances" />
            <Tile label="Sales — 90 days" value={<M v={p.sales90dInr} />} sub="gross invoiced" />
            <Tile label="Purchases — 90 days" value={<M v={p.purchases90dInr} />} sub="gross invoiced" />
          </div>

          {/* By day — date picker + per-day tiles + daily table */}
          {daily.length > 0 && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-sm">By day</h3>
                  <p className="text-xs opacity-50">
                    Pick a date to see that day&apos;s figures. {daily.length} days on file.
                  </p>
                </div>
                <label className="text-sm flex items-center gap-2">
                  <span className="opacity-60 text-xs">Date</span>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-1.5 text-sm"
                  >
                    {daily.map((r) => (
                      <option key={r.date} value={r.date}>
                        {fmtDate(r.date)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedRow && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <DayTile label="Sales" value={<M v={selectedRow.saleInr} />} />
                  <DayTile label="Credit notes" value={<M v={selectedRow.creditNoteInr} />} />
                  <DayTile
                    label="Net sales"
                    value={<M v={net(selectedRow.saleInr, selectedRow.creditNoteInr)} />}
                    warn={(net(selectedRow.saleInr, selectedRow.creditNoteInr) || 0) < 0}
                  />
                  <DayTile label="Purchases" value={<M v={selectedRow.purchaseInr} />} />
                  {selectedRow.expenseInr !== undefined && (
                    <DayTile label="Expenses" value={<M v={selectedRow.expenseInr} />} />
                  )}
                  {(selectedRow.cashInInr !== undefined || selectedRow.cashOutInr !== undefined) && (
                    <DayTile
                      label="Net cash"
                      value={<M v={net(selectedRow.cashInInr, selectedRow.cashOutInr)} />}
                    />
                  )}
                </div>
              )}

              {/* Full daily table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                    <tr>
                      <th className="py-1.5 pr-2">Date</th>
                      <th className="py-1.5 px-2 text-right">Sale</th>
                      <th className="py-1.5 px-2 text-right">Credit note</th>
                      <th className="py-1.5 px-2 text-right">Net sales</th>
                      <th className="py-1.5 px-2 text-right">Purchase</th>
                      {daily.some((r) => r.expenseInr !== undefined) && (
                        <th className="py-1.5 px-2 text-right">Expenses</th>
                      )}
                      {daily.some((r) => r.cashInInr !== undefined || r.cashOutInr !== undefined) && (
                        <th className="py-1.5 pl-2 text-right">Net cash</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((r) => {
                      const ns = net(r.saleInr, r.creditNoteInr) || 0;
                      const isSel = r.date === selectedDate;
                      return (
                        <tr
                          key={r.date}
                          onClick={() => setSelectedDate(r.date)}
                          className={`border-b border-black/5 dark:border-white/5 cursor-pointer ${
                            isSel ? "bg-[var(--accent)]/10" : "hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                        >
                          <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums"><M v={r.saleInr} /></td>
                          <td className="py-1.5 px-2 text-right tabular-nums"><M v={r.creditNoteInr} /></td>
                          <td className={`py-1.5 px-2 text-right tabular-nums ${ns < 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                            <M v={ns} />
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums"><M v={r.purchaseInr} /></td>
                          {daily.some((x) => x.expenseInr !== undefined) && (
                            <td className="py-1.5 px-2 text-right tabular-nums"><M v={r.expenseInr} /></td>
                          )}
                          {daily.some((x) => x.cashInInr !== undefined || x.cashOutInr !== undefined) && (
                            <td className="py-1.5 pl-2 text-right tabular-nums"><M v={net(r.cashInInr, r.cashOutInr)} /></td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Stock to physically verify */}
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
              <h3 className="font-semibold text-sm mb-1">Stock in Vyapar — check against the floor</h3>
              <p className="text-xs opacity-50 mb-3">
                Top items by value. Count the physical stock and confirm it matches the Qty here.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                    <tr>
                      <th className="py-1.5 pr-2">Item</th>
                      <th className="py-1.5 px-2 text-right">Qty</th>
                      <th className="py-1.5 px-2 text-right">Stock value</th>
                      <th className="py-1.5 pl-2 text-right">7d change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.topItems ?? []).length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center opacity-40 text-xs">No item data in this snapshot.</td></tr>
                    )}
                    {(p.topItems ?? []).map((it, i) => (
                      <tr key={i} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-1.5 pr-2">{it.name}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          {num(it.qty)}{it.unit ? ` ${it.unit}` : ""}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums"><M v={it.stockValueInr} /></td>
                        <td className={`py-1.5 pl-2 text-right tabular-nums ${
                          it.change7d && it.change7d < 0 ? "text-red-600 dark:text-red-400" : "opacity-70"
                        }`}>
                          {it.change7d === null || it.change7d === undefined
                            ? "—"
                            : `${it.change7d > 0 ? "+" : ""}${num(it.change7d)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Party balances */}
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
              <h3 className="font-semibold text-sm mb-1">Top customer balances</h3>
              <p className="text-xs opacity-50 mb-3">Who owes the most, per Vyapar.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
                    <tr>
                      <th className="py-1.5 pr-2">Party</th>
                      <th className="py-1.5 pl-2 text-right">Balance due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.topCustomerBalances ?? []).length === 0 && (
                      <tr><td colSpan={2} className="py-4 text-center opacity-40 text-xs">No party data in this snapshot.</td></tr>
                    )}
                    {(p.topCustomerBalances ?? []).map((b, i) => (
                      <tr key={i} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-1.5 pr-2">{b.name}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums"><M v={b.balanceDueInr} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {p.notes && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-medium">Note from the reader: </span>{p.notes}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <div className="text-[11px] uppercase tracking-wide opacity-50">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-1">{sub}</div>}
    </div>
  );
}

function DayTile({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : "border-black/10 dark:border-white/10"}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-50">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
