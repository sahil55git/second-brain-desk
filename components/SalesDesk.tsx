"use client";

// Sales invoicing (erp-architecture-plan.md, Phase 2). Build a GST invoice
// from Item masters (or free-text lines), see the CGST/SGST vs IGST split
// update live as you type, save it (server allocates the invoice number and
// re-computes GST authoritatively), and print a clean invoice.
import { useEffect, useMemo, useState } from "react";
import type {
  SalesInvoiceDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
  PaymentMode,
} from "@/lib/types";
import { computeTotals, gstTreatment, type GstLineInput } from "@/lib/gst";
import InvoicePrint from "./InvoicePrint";
import { useScale } from "./ScaleProvider";

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

export default function SalesDesk({
  initialInvoices,
  parties,
  items,
  settings,
  dbConnected,
}: {
  initialInvoices: SalesInvoiceDTO[];
  parties: PartyDTO[];
  items: ItemDTO[];
  settings: BusinessSettingsDTO | null;
  dbConnected: boolean;
}) {
  const [invoices, setInvoices] = useState<SalesInvoiceDTO[]>(initialInvoices);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<SalesInvoiceDTO | null>(null);

  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [activeScaleLine, setActiveScaleLine] = useState(0);
  const [scaleAutoFill, setScaleAutoFill] = useState(true);
  const { connected: scaleConnected, selectedReading, selectedScale } = useScale();

  useEffect(() => {
    if (!showForm || !scaleAutoFill || !selectedReading || selectedReading.stable === false) return;
    if (!Number.isFinite(selectedReading.weight) || selectedReading.weight < 0) return;
    const qty = selectedReading.weight.toFixed(2);
    setLines((prev) => prev.map((line, index) => index === activeScaleLine ? { ...line, qty } : line));
  }, [showForm, scaleAutoFill, selectedReading, activeScaleLine]);

  const activeParties = useMemo(() => parties.filter((p) => p.active), [parties]);
  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const defaultGst = settings?.defaultGstRatePct ?? 5;
  const businessState = settings?.state ?? null;

  const selectedParty = activeParties.find((p) => p.id === partyId) || null;
  const treatment = gstTreatment(businessState, selectedParty?.state);

  // Live preview totals (server re-computes authoritatively on save).
  const previewInputs: GstLineInput[] = lines
    .filter((l) => (Number(l.qty) || 0) > 0)
    .map((l) => ({
      qty: Number(l.qty) || 0,
      rateInr: Number(l.rateInr) || 0,
      gstRatePct: l.gstRatePct === "" ? defaultGst : Number(l.gstRatePct) || 0,
    }));
  const preview = computeTotals(previewInputs, treatment);

  function pickItem(idx: number, itemId: string) {
    setActiveScaleLine(idx);
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
    setDate(todayISO());
    setPaymentMode("CASH");
    setNotes("");
    setLines([blankLine()]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partyId) {
      setError("Choose a customer.");
      return;
    }
    const cleanLines = lines.filter((l) => (Number(l.qty) || 0) > 0 && l.name.trim());
    if (cleanLines.length === 0) {
      setError("Add at least one line with a name and quantity.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
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
      if (!res.ok) {
        setError(json.error || "Failed to save invoice.");
        return;
      }
      setInvoices((prev) => [json.data, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
    if (res.ok) setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  const noParties = activeParties.length === 0;

  return (
    <div className="space-y-4">
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — invoices won&apos;t save yet.
        </div>
      )}
      {noParties && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Add a customer in the <strong>Parties</strong> tab first — invoices need a customer.
        </div>
      )}
      {!businessState && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Set your business <strong>home state</strong> in Settings so CGST/SGST vs IGST is chosen
          correctly. Until then invoices default to CGST+SGST (intra-state).
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={noParties}
          className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {showForm ? "Cancel" : "+ New invoice"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm space-y-1">
              <span className="opacity-70">Customer *</span>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
              >
                <option value="">— select —</option>
                {activeParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.state ? ` (${p.state})` : ""}
                  </option>
                ))}
              </select>
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
            {selectedParty?.state && businessState ? (
              <> ({businessState} → {selectedParty.state})</>
            ) : null}
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${scaleConnected && selectedReading ? "bg-emerald-500" : "bg-red-500"}`} />
              <strong>Live scale</strong>
              <span className="font-mono opacity-65">{selectedScale || "not selected"}</span>
              <span className="tabular-nums font-semibold">{selectedReading ? `${selectedReading.weight.toFixed(2)} ${selectedReading.unit || "kg"}` : "No reading"}</span>
              <label className="ml-auto flex items-center gap-1.5">
                <input type="checkbox" checked={scaleAutoFill} onChange={(e) => setScaleAutoFill(e.target.checked)} />
                Auto-fill active item
              </label>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} onFocus={() => setActiveScaleLine(idx)} className={`grid grid-cols-12 gap-2 items-end rounded p-1 ${scaleAutoFill && activeScaleLine === idx ? "ring-1 ring-[var(--accent)]" : ""}`}>
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
                    title="Remove line"
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

          {/* Totals preview */}
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
            {saving ? "Saving…" : "Save invoice"}
          </button>
        </form>
      )}

      {/* Ledger */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">GST</th>
              <th className="px-3 py-2 text-right">Tax</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center opacity-50">
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const tax = inv.interState ? inv.igstInr : inv.cgstInr + inv.sgstInr;
              return (
                <tr key={inv.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="px-3 py-2 font-medium">{inv.invoiceNo}</td>
                  <td className="px-3 py-2">{inv.date}</td>
                  <td className="px-3 py-2">{inv.party?.name || "—"}</td>
                  <td className="px-3 py-2 text-xs">{inv.interState ? "IGST" : "CGST+SGST"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">₹{tax.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ₹{inv.totalInr.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setPrinting(inv)}
                      className="text-xs rounded border border-black/20 dark:border-white/20 px-2 py-1 mr-1"
                    >
                      Print
                    </button>
                    <button onClick={() => del(inv.id)} className="text-xs opacity-50 hover:opacity-100">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {printing && (
        <InvoicePrint
          invoice={printing}
          settings={settings}
          party={activeParties.find((p) => p.id === printing.partyId) || null}
          onClose={() => setPrinting(null)}
        />
      )}
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
