"use client";

// A scanned code that matches no item: link it to an item once, and every later
// scan of the same pack finds it (saved as the item's barcode).
import { useState } from "react";
import type { ItemDTO } from "@/lib/types";

export default function UnknownCode({ code, items, onLinked, onClose }: { code: string; items: ItemDTO[]; onLinked: (item: ItemDTO) => void; onClose: () => void }) {
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const link = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barcode: code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(/unique/i.test(String(j.error)) ? "That code is already on another item." : j.error || "Could not save the code.");
      onLinked(j.data as ItemDTO);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the code.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs space-y-1.5">
      <div>
        Code <b className="font-mono">{code}</b> is not on any item yet. Which item is it? It will be remembered.
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded border border-black/20 bg-transparent px-2 py-1">
          <option value="">— pick the item —</option>
          {items.filter((i) => i.active).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.barcode ? ` (has ${i.barcode})` : ""}
            </option>
          ))}
        </select>
        <button type="button" disabled={!itemId || busy} onClick={link} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-2.5 py-1 font-medium disabled:opacity-50">
          {busy ? "Saving…" : "Remember this code"}
        </button>
        <button type="button" onClick={onClose} className="underline opacity-70">
          Skip
        </button>
      </div>
      {err && <div className="text-red-700">{err}</div>}
    </div>
  );
}
