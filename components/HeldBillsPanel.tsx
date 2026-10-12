"use client";

// Held bills at the counter. A bill on hold keeps its lines and customer; it
// does NOT reserve stock. Bills held over two hours are flagged so they are
// not forgotten. Resume loads the draft back into the form and removes it
// from the list; Discard removes it without saving anything.
import { useEffect, useState } from "react";
import { parseHeldDraft, type HeldDraft } from "@/lib/billDraft";

interface HeldRow {
  id: string;
  label: string;
  heldBy: string | null;
  createdAt: string;
  draft: unknown;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function ago(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export default function HeldBillsPanel({
  refreshKey,
  canResume,
  onResume,
}: {
  refreshKey: number;
  canResume: boolean;
  onResume: (draft: HeldDraft) => void;
}) {
  const [rows, setRows] = useState<HeldRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/held-bills")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setRows(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load held bills.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function discard(id: string) {
    setError(null);
    const res = await fetch(`/api/held-bills/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not discard that bill.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function resume(row: HeldRow) {
    const draft = parseHeldDraft(row.draft);
    if (!draft) {
      setError("This held bill is damaged and cannot be resumed.");
      return;
    }
    onResume(draft);
    await discard(row.id);
  }

  if (rows.length === 0 && !error) return null;

  return (
    <section aria-label="Held bills" className="rounded-xl border border-dashed border-black/20 dark:border-white/20 p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <strong>Held bills</strong>
        <span className="opacity-60 text-xs">{rows.length} on hold</span>
      </div>
      {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      {rows.map((row) => {
        const old = nowMs - new Date(row.createdAt).getTime() > TWO_HOURS_MS;
        const lines = (row.draft as { lines?: unknown[] })?.lines?.length ?? 0;
        return (
          <div key={row.id} className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 border ${old ? "border-[var(--accent)]" : "border-black/10 dark:border-white/10"}`}>
            <div className="flex-1 min-w-[10rem]">
              <div className="font-semibold text-sm">{row.label}</div>
              <div className="text-xs opacity-70">
                {lines} {lines === 1 ? "line" : "lines"} · held {ago(row.createdAt, nowMs)}
                {row.heldBy ? ` by ${row.heldBy}` : ""}
                {old ? " · over 2 hours" : ""}
              </div>
            </div>
            <button
              type="button"
              disabled={!canResume}
              title={canResume ? "Load this bill into the form" : "Hold or clear the bill on screen first"}
              onClick={() => resume(row)}
              className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              Resume
            </button>
            <button type="button" onClick={() => discard(row.id)} className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-xs">
              Discard
            </button>
          </div>
        );
      })}
    </section>
  );
}
