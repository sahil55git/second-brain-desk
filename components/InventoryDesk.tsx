"use client";

// Inventory / SKU master (erp-architecture-plan.md, Phase 1).
import PrintButton from "@/components/print/PrintButton";
import { useMemo, useState } from "react";
import type { ItemDTO } from "@/lib/types";
import { useScale } from "./ScaleProvider";
import KaradiTankRegister from "./KaradiTankRegister";
import CodeScan from "@/components/smart/CodeScan";
import HoverCard from "./HoverCard";
import { findItemByCode, nextItemCode } from "@/lib/smartEntry";
import StockAdjustPanel from "./StockAdjustPanel";

export default function InventoryDesk({
  initialItems,
  dbConnected,
  onNavigate,
}: {
  initialItems: ItemDTO[];
  dbConnected: boolean;
  onNavigate?: (desk: "sales" | "purchase") => void;
}) {
  const [items, setItems] = useState<ItemDTO[]>(initialItems);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { readings, connected: scaleConnected } = useScale();

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    unit: "kg",
    hsnCode: "",
    gstRatePct: "",
    openingStockQty: "",
    reorderLevelQty: "",
    notes: "",
  });
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  /** Give an item the next shop code (MT000001…) so it can carry a barcode + QR label. */
  async function assignCode(id: string) {
    setCodeMsg(null);
    const code = nextItemCode(items);
    const res = await fetch(`/api/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barcode: code }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setCodeMsg(j.error || "Could not save the code.");
    setItems((prev) => prev.map((i) => (i.id === id ? j.data : i)));
  }

  const visible = useMemo(() => {
    return items
      .filter((i) => i.active)
      .filter((i) => {
        const q = search.trim().toLowerCase();
        return !q || i.name.toLowerCase().includes(q) || (i.barcode || "").toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q);
      });
  }, [items, search]);

  function resetForm() {
    setForm({
      name: "",
      sku: "",
      barcode: "",
      unit: "kg",
      hsnCode: "",
      gstRatePct: "",
      openingStockQty: "",
      reorderLevelQty: "",
      notes: "",
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gstRatePct: form.gstRatePct === "" ? null : Number(form.gstRatePct),
          openingStockQty: Number(form.openingStockQty) || 0,
          reorderLevelQty: form.reorderLevelQty === "" ? null : Number(form.reorderLevelQty),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save item.");
        return;
      }
      setItems((prev) => [json.data, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, active: false } : i)));
    }
  }

  return (
    <div className="space-y-4">
      <StockAdjustPanel items={initialItems} />
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — Inventory won&apos;t save yet.
        </div>
      )}

      <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold">Live physical tank stock</h2>
          <span className={`h-2 w-2 rounded-full ${scaleConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-xs opacity-55">{scaleConnected ? "bridge connected" : "bridge offline"}</span>
        </div>
        {Object.keys(readings).length === 0 ? (
          <p className="text-sm opacity-55">No tank reading received. Start the local scale bridge and select the indicator in Live Scales.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(readings).map((r) => (
              <div key={r.scale_source} className="rounded-lg bg-black/5 dark:bg-white/5 p-3">
                <div className="text-xs font-mono opacity-55">{r.scale_source}</div>
                <div className="text-3xl font-bold tabular-nums">{r.weight.toFixed(2)} <span className="text-sm font-normal">{r.unit || "kg"}</span></div>
                <div className="text-[10px] opacity-50">Live indicator value — not accounting stock</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <KaradiTankRegister />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-1.5 text-sm flex-1 min-w-[160px]"
        />
        <div className="flex-1" />
        <a href="/labels" target="_blank" rel="noreferrer" className="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm">
          🏷️ Print item labels
        </a>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm font-medium"
        >
          {showForm ? "Cancel" : "+ Add item"}
        </button>
      </div>

      <div className="space-y-1">
        <CodeScan
          placeholder="Scan a pack to find its item…"
          onCode={(c) => {
            const it = findItemByCode(c, items);
            setFound(it ? it.id : null);
            setCodeMsg(it ? `Found: ${it.name}` : `No item has code ${c}. Add it to an item with “Barcode / QR code”, or scan it from a Sales / Purchase form to link it.`);
            if (it) setSearch(it.name);
          }}
        />
        {codeMsg && <div className="text-xs opacity-80">{codeMsg}</div>}
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border border-black/10 dark:border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <label className="text-sm space-y-1">
            <span className="opacity-70">Name *</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">SKU / code</span>
            <input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Barcode / QR code</span>
            <div className="flex gap-2">
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="scan the pack, or generate"
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              />
              <button type="button" onClick={() => setForm({ ...form, barcode: nextItemCode(items) })} className="rounded border border-black/20 dark:border-white/20 px-2 text-xs whitespace-nowrap">
                Generate
              </button>
            </div>
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Unit</span>
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="kg / ltr / pcs"
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">HSN code</span>
            <input
              value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">GST rate % (blank = use default)</span>
            <input
              type="number"
              value={form.gstRatePct}
              onChange={(e) => setForm({ ...form, gstRatePct: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Opening stock qty</span>
            <input
              type="number"
              value={form.openingStockQty}
              onChange={(e) => setForm({ ...form, openingStockQty: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Reorder level</span>
            <input
              type="number"
              value={form.reorderLevelQty}
              onChange={(e) => setForm({ ...form, reorderLevelQty: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="opacity-70">Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>

          {error && (
            <div className="sm:col-span-2 rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save item"}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end gap-2 -mb-2"><PrintButton area="#pa-items" label="🖨️ Print item list" className="rounded border border-black/20 dark:border-white/20 px-3 py-1 text-sm" /></div>
      <div id="pa-items" className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Barcode</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">HSN</th>
              <th className="px-3 py-2 text-right">GST %</th>
              <th className="px-3 py-2 text-right">Opening stock</th>
              <th className="px-3 py-2 text-right">Reorder at</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center opacity-50">
                  No items yet.
                </td>
              </tr>
            )}
            {visible.map((i) => {
              const low = i.reorderLevelQty !== null && i.openingStockQty <= i.reorderLevelQty;
              return (
                <tr key={i.id} className={`border-b border-black/5 dark:border-white/5 ${found === i.id ? "bg-[var(--accent)]/10" : ""}`}>
                  <td className="px-3 py-2 font-medium">
                    <HoverCard
                      trigger={<button type="button" className="text-left font-medium underline decoration-dotted underline-offset-4">{i.name}</button>}
                    >
                      <p className="font-semibold">{i.name}</p>
                      <p className="text-xs opacity-70">{i.sku || "no SKU"} · unit {i.unit}</p>
                      <ul className="mt-2 space-y-1 text-xs">
                        <li>HSN: {i.hsnCode || "—"} · GST {i.gstRatePct ?? "—"}%</li>
                        <li>Opening stock: {i.openingStockQty} {i.unit}</li>
                        <li>Reorder at: {i.reorderLevelQty ?? "not set"}</li>
                        {i.barcode && <li>Barcode: {i.barcode}</li>}
                      </ul>
                      <div className="mt-3 flex gap-2">
                        {onNavigate && (
                          <button type="button" onClick={() => onNavigate("sales")} className="rounded-lg border border-black/15 dark:border-white/20 px-3 py-1.5 text-xs">Sell</button>
                        )}
                        {onNavigate && (
                          <button type="button" onClick={() => onNavigate("purchase")} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)]">Reorder</button>
                        )}
                        <button type="button" onClick={() => archive(i.id)} className="rounded-lg border border-black/15 dark:border-white/20 px-3 py-1.5 text-xs">Archive</button>
                      </div>
                    </HoverCard>
                  </td>
                  <td className="px-3 py-2">{i.sku || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {i.barcode ? (
                      <a href={`/labels?items=${i.id}`} target="_blank" rel="noreferrer" className="underline decoration-dotted" title="Print labels">
                        {i.barcode} 🏷️
                      </a>
                    ) : (
                      <button type="button" onClick={() => assignCode(i.id)} className="underline opacity-70">
                        + code
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">{i.unit}</td>
                  <td className="px-3 py-2">{i.hsnCode || "—"}</td>
                  <td className="px-3 py-2 text-right">{i.gstRatePct ?? "—"}</td>
                  <td className={`px-3 py-2 text-right ${low ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                    {i.openingStockQty}
                  </td>
                  <td className="px-3 py-2 text-right">{i.reorderLevelQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => archive(i.id)} className="text-xs opacity-60 hover:opacity-100">
                      Archive
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
