"use client";

// Purchase bills (erp-architecture-plan.md, Phase 2). Records supplier bills
// with GST for input-credit tracking. Same line-item builder as Sales, minus
// invoice numbering (the supplier's bill number is entered directly).
import { useMemo, useState } from "react";
import type {
  PurchaseBillDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
  PaymentMode,
} from "@/lib/types";
import { computeTotals, gstTreatment, type GstLineInput } from "@/lib/gst";

const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"];

interface DraftLine {
  itemId: string;
  name: string;
  hsnCode: string;
  qty: string;
  unit: string;
  rateInr: string;
  gstRatePct: string;
}

function blankLine(): DraftLine {
  return { itemId: "", name: "", hsnCode: "", qty: "", unit: "kg", rateInr: "", gstRatePct: "" };
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseDesk({
  initialBills,
  parties,
  items,
  settings,
  dbConnected,
}: {
  initialBills: PurchaseBillDTO[];
  parties: PartyDTO[];
  items: ItemDTO[];
  settings: BusinessSettingsDTO | null;
  dbConnected: boolean;
}) {
  const [bills, setBills] = useState<PurchaseBillDTO[]>(initialBills);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partyId, setPartyId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CREDIT");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  const suppliers = useMemo(
    () => parties.filter((p) => p.active && (p.type === "SUPPLIER" || p.type === "BOTH")),
    [parties]
  );
  // Fall back to all active parties if none are tagged supplier yet.
  const partyOptions = suppliers.length > 0 ? suppliers : parties.filter((p) => p.active);
  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const defaultGst = settings?.defaultGstRatePct ?? 5;
  const businessState = settings?.state ?? null;

  const selectedParty = partyOptions.find((p) => p.id === partyId) || null;
  const treatment = gstTreatment(businessState, selectedParty?.state);

  const previewInputs: GstLineInput[] = lines
    .filter((l) => (Number(l.qty) || 0) > 0)
    .map((l) => ({
      qty: Number(l.qty) || 0,
      rateInr: Number(l.rateInr) || 0,
      gstRatePct: l.gstRatePct === "" ? defaultGst : Number(l.gstRatePct) || 0,
    }));
  const preview = computeTotals(previewInputs, treatment);

  function pickItem(idx: number, itemId: string) {
    const item = activeItems.find((i) => i.id === itemId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              itemId,
              name: item ? item.name : l.name,
              hsnCode: item?.hsnCode || "",
              unit: item?.unit || l.unit,
              gstRatePct:
                item?.gstRatePct !== null && item?.gstRatePct !== undefined
                  ? String(item.gstRatePct)
                  : l.gstRatePct,
            }
          : l
      )
    );
  }
  function setLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  function resetForm() {
    setPartyId("");
    setBillNo("");
    setDate(todayISO());
    setPaymentMode("CREDIT");
    setNotes("");
    setLines([blankLine()]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partyId) return setError("Choose a supplier.");
    if (!billNo.trim()) return setError("Enter the supplier's bill number.");
    const cleanLines = lines.filter((l) => (Number(l.qty) || 0) > 0 && l.name.trim());
    if (cleanLines.length === 0) return setError("Add at least one line with a name and quantity.");
    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          billNo: billNo.trim(),
          date,
          paymentMode,
          notes,
          lineItems: cleanLines.map((l) => ({
            itemId: l.itemId || null,
            name: l.name.trim(),
            hsnCode: l.hsnCode || null,
            qty: Number(l.qty) || 0,
            unit: l.unit || "kg",
            rateInr: Number(l.rateInr) || 0,
            gstRatePct: l.gstRatePct === "" ? null : Number(l.gstRatePct),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error || "Failed to save bill.");
      setBills((prev) => [json.data, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bill.");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    if (res.ok) setBills((prev) => prev.filter((b) => b.id !== id));
  }

  const noParties = partyOptions.length === 0;

  return (
    <div className="space-y-4">
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — bills won&apos;t save yet.
        </div>
      )}
      {noParties && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Add a supplier in the <strong>Parties</strong> tab first.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {bills.length} bill{bills.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={noParties}
          className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {showForm ? "Cancel" : "+ New bill"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-sm space-y-1">
              <span className="opacity-70">Supplier *</span>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              >
                <option value="">— select —</option>
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.state ? ` (${p.state})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="opacity-70">Bill no. *</span>
              <input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="opacity-70">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="opacity-70">Payment</span>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m === "CREDIT" ? "Credit (unpaid)" : m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-xs opacity-70">
            Tax treatment:{" "}
            <span className="font-medium">
              {treatment === "inter" ? "Inter-state → IGST" : "Intra-state → CGST + SGST"}
            </span>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <label className="col-span-12 sm:col-span-3 text-xs space-y-1">
                  <span className="opacity-60">Item</span>
                  <select
                    value={l.itemId}
                    onChange={(e) => pickItem(idx, e.target.value)}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  >
                    <option value="">Free text…</option>
                    {activeItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-6 sm:col-span-2 text-xs space-y-1">
                  <span className="opacity-60">Name</span>
                  <input
                    value={l.name}
                    onChange={(e) => setLine(idx, { name: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-6 sm:col-span-1 text-xs space-y-1">
                  <span className="opacity-60">HSN</span>
                  <input
                    value={l.hsnCode}
                    onChange={(e) => setLine(idx, { hsnCode: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-4 sm:col-span-1 text-xs space-y-1">
                  <span className="opacity-60">Qty</span>
                  <input
                    type="number"
                    value={l.qty}
                    onChange={(e) => setLine(idx, { qty: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-4 sm:col-span-1 text-xs space-y-1">
                  <span className="opacity-60">Unit</span>
                  <input
                    value={l.unit}
                    onChange={(e) => setLine(idx, { unit: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-4 sm:col-span-1 text-xs space-y-1">
                  <span className="opacity-60">Rate ₹</span>
                  <input
                    type="number"
                    value={l.rateInr}
                    onChange={(e) => setLine(idx, { rateInr: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-4 sm:col-span-1 text-xs space-y-1">
                  <span className="opacity-60">GST %</span>
                  <input
                    type="number"
                    value={l.gstRatePct}
                    placeholder={String(defaultGst)}
                    onChange={(e) => setLine(idx, { gstRatePct: e.target.value })}
                    className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                  />
                </label>
                <div className="col-span-6 sm:col-span-1 text-sm text-right tabular-nums pb-1.5">
                  ₹{((Number(l.qty) || 0) * (Number(l.rateInr) || 0)).toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-1 pb-1">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="text-xs opacity-50 hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="text-xs rounded border border-black/20 dark:border-white/20 px-2.5 py-1"
            >
              + Add line
            </button>
          </div>

          <div className="flex justify-end">
            <div className="w-full sm:w-72 text-sm space-y-1">
              <Row label="Subtotal" value={preview.subtotalInr} />
              {treatment === "inter" ? (
                <Row label="IGST" value={preview.igstInr} />
              ) : (
                <>
                  <Row label="CGST" value={preview.cgstInr} />
                  <Row label="SGST" value={preview.sgstInr} />
                </>
              )}
              <div className="border-t border-black/10 dark:border-white/10 pt-1">
                <Row label="Total" value={preview.totalInr} bold />
              </div>
            </div>
          </div>

          <label className="text-sm space-y-1 block">
            <span className="opacity-70">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save bill"}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Bill #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">GST</th>
              <th className="px-3 py-2 text-right">Tax</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center opacity-50">
                  No bills yet.
                </td>
              </tr>
            )}
            {bills.map((b) => {
              const tax = b.interState ? b.igstInr : b.cgstInr + b.sgstInr;
              return (
                <tr key={b.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="px-3 py-2 font-medium">{b.billNo}</td>
                  <td className="px-3 py-2">{b.date}</td>
                  <td className="px-3 py-2">{b.party?.name || "—"}</td>
                  <td className="px-3 py-2 text-xs">{b.interState ? "IGST" : "CGST+SGST"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">₹{tax.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ₹{b.totalInr.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => del(b.id)} className="text-xs opacity-50 hover:opacity-100">
                      Delete
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

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "opacity-80"}`}>
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}
