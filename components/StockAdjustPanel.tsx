"use client";

// Stock corrections on the Inventory desk. Every correction is a new entry with
// the book quantity at that moment, the count, the change, and a reason. Undo adds
// an opposite entry; nothing is edited.

import { useEffect, useState } from "react";
import { ADJUST_REASONS, reasonLabel, type AdjustReason } from "@/lib/stockAdjust";
import type { ItemDTO } from "@/lib/types";

interface Entry {
  id: string;
  itemId: string;
  date: string;
  bookQty: number;
  actualQty: number;
  qtyDelta: number;
  reason: AdjustReason;
  note: string | null;
  reversesId: string | null;
  item?: { name: string; unit: string };
}

export default function StockAdjustPanel({ items }: { items: ItemDTO[] }) {
  const [itemId, setItemId] = useState("");
  const [book, setBook] = useState<number | null>(null);
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState<string>("COUNT_DIFFERENCE");
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unit = items.find((i) => i.id === itemId)?.unit || "";

  const loadEntries = () =>
    fetch(`/api/stock-adjustments${itemId ? `?itemId=${itemId}` : ""}`)
      .then((r) => r.json())
      .then((j) => setEntries(j.data ?? []))
      .catch(() => setEntries([]));

  useEffect(() => {
    setBook(null);
    setActual("");
    if (!itemId) return;
    fetch(`/api/stock-adjustments?itemId=${itemId}&book=1`)
      .then((r) => r.json())
      .then((j) => setBook(j.data?.book ?? null))
      .catch(() => setBook(null));
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const countedNow = actual.trim() !== "" && book !== null ? Number(actual) - book : null;

  async function save() {
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, actualQty: actual, reason, note }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the correction.");
      setMsg("Correction saved as a new entry.");
      setActual("");
      setNote("");
      const b = await fetch(`/api/stock-adjustments?itemId=${itemId}&book=1`).then((x) => x.json());
      setBook(b.data?.book ?? null);
      loadEntries();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save the correction.");
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    setMsg(null);
    const r = await fetch(`/api/stock-adjustments/${id}/reverse`, { method: "POST" });
    const j = await r.json();
    setMsg(r.ok ? "Undone — added as a new reversing entry." : j.error || "Could not undo.");
    if (itemId) {
      const b = await fetch(`/api/stock-adjustments?itemId=${itemId}&book=1`).then((x) => x.json());
      setBook(b.data?.book ?? null);
    }
    loadEntries();
  }

  const undone = new Set(entries.filter((e) => e.reversesId).map((e) => e.reversesId as string));
  const inp = "rounded border px-2 py-1 text-sm w-full";

  return (
    <section className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Stock corrections</h2>
      <p className="text-xs opacity-70">Each correction is its own entry. Undo adds a reversing entry; nothing is overwritten.</p>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="opacity-70">Item</span>
          <select className={inp} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Choose…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <div className="block">
          <span className="opacity-70">Book now</span>
          <div className="mt-1 font-semibold">{book === null ? "—" : `${book} ${unit}`}</div>
        </div>
        <label className="block">
          <span className="opacity-70">Counted</span>
          <input className={inp} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} disabled={!itemId} />
        </label>
      </div>

      {itemId && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="opacity-70">Reason</span>
            <select className={inp} value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUST_REASONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.en}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="opacity-70">Note {reason === "OTHER" ? "(required)" : "(optional)"}</span>
            <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || !itemId || actual.trim() === ""} onClick={save} className="rounded bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-contrast)] disabled:opacity-50">
              Save correction
            </button>
            {countedNow !== null && (
              <span className="text-sm">
                Change: <strong>{countedNow > 0 ? "+" : ""}{Math.round(countedNow * 1000) / 1000} {unit}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {msg && <p className="text-sm">{msg}</p>}

      {itemId && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70">
              <tr>
                <th className="py-1">Date</th>
                <th>Reason</th>
                <th className="text-right">Book</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Change</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const canUndo = !e.reversesId && e.reason !== "REVERSAL" && !undone.has(e.id);
                return (
                  <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1">{e.date}</td>
                    <td>{reasonLabel(e.reason)}</td>
                    <td className="text-right">{e.bookQty}</td>
                    <td className="text-right">{e.actualQty}</td>
                    <td className="text-right">{e.qtyDelta > 0 ? "+" : ""}{e.qtyDelta}</td>
                    <td>{e.note || ""}</td>
                    <td className="text-right">
                      {canUndo && (
                        <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => undo(e.id)}>
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center opacity-60">No corrections for this item yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
