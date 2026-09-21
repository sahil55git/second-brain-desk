"use client";

// Vyapar cross-check dashboard (erp-architecture-plan.md). Vyapar is the
// accountant's source-of-truth software; this desk shows a SNAPSHOT of its
// figures (parsed from the .vyb backup) as clean analytical tiles + tables,
// so the numbers can be eyeballed against physical stock on the floor and
// against this app's own entries. Read-only display; Owner pastes a fresh
// snapshot when a newer backup is read.
import { useMemo, useState } from "react";
import type { VyaparSnapshotDTO, VyaparSnapshotPayload } from "@/lib/types";

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
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

  const p: VyaparSnapshotPayload = useMemo(() => snapshot?.payload ?? {}, [snapshot]);

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

  return (
    <div className="space-y-5">
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
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            {showUpload ? "Cancel" : "Update snapshot"}
          </button>
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
              placeholder='{"entity": "...", "asOfDate": "...", "stockValueInr": 4539252, "topItems": [...] }'
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
            <Tile label="Stock value" value={inr(p.stockValueInr)} sub={p.activeItems ? `${num(p.activeItems)} active items` : "as of backup"} />
            <Tile label="Receivable (customers owe)" value={inr(p.receivableInr)} sub="sum of positive balances" />
            <Tile label="Sales — 90 days" value={inr(p.sales90dInr)} sub="gross invoiced" />
            <Tile label="Purchases — 90 days" value={inr(p.purchases90dInr)} sub="gross invoiced" />
          </div>

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
                        <td className="py-1.5 px-2 text-right tabular-nums">{inr(it.stockValueInr)}</td>
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
                        <td className="py-1.5 pl-2 text-right tabular-nums">{inr(b.balanceDueInr)}</td>
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

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <div className="text-[11px] uppercase tracking-wide opacity-50">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-1">{sub}</div>}
    </div>
  );
}
