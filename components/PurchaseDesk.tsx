"use client";

// Purchase bills (erp-architecture-plan.md, Phase 2). Records supplier bills
// with GST for input-credit tracking. Same line-item builder as Sales, minus
// invoice numbering (the supplier's bill number is entered directly).
import PrintButton from "@/components/print/PrintButton";
import { useEffect, useMemo, useState } from "react";
import type {
  PurchaseBillDTO,
  PartyDTO,
  ItemDTO,
  BusinessSettingsDTO,
  PaymentMode,
} from "@/lib/types";
import { computeTotals, gstTreatment, type GstLineInput } from "@/lib/gst";
import AiTerminal, { type FillMeta } from "@/components/AiTerminal";
import ChecksList from "@/components/smart/ChecksList";
import CodeScan from "@/components/smart/CodeScan";
import ScaleCapture from "@/components/smart/ScaleCapture";
import UnknownCode from "@/components/smart/UnknownCode";
import RateHint from "@/components/smart/RateHint";
import { cleanAiLines, findItemByCode, matchParty, purchaseChecks } from "@/lib/smartEntry";
import { addScannedItem, applyFilledLines, blankLine, formSummary, toLite, type DraftLine } from "@/lib/smartLines";
import { uploadProof } from "@/lib/proofClient";

const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"];

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
  // Purchases made in the Quick Register (seed, oil, tins…) — last 90 days
  const [regBuys, setRegBuys] = useState<RegBuy[] | null>(null);
  useEffect(() => {
    const to = todayISO();
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 89 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/register/range?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((j) => setRegBuys(((j.data || []) as RegBuy[]).filter((e) => e.kind === "PURCHASE").reverse()))
      .catch(() => setRegBuys([]));
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partyId, setPartyId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CREDIT");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  // smart entry
  const [itemList, setItemList] = useState<ItemDTO[]>(items);
  const [activeLine, setActiveLine] = useState(0);
  const [scanned, setScanned] = useState<{ totalInr: number | null; gstin: string | null; partyName: string | null } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [smartMsg, setSmartMsg] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const suppliers = useMemo(
    () => parties.filter((p) => p.active && (p.type === "SUPPLIER" || p.type === "BOTH")),
    [parties]
  );
  // Fall back to all active parties if none are tagged supplier yet.
  const partyOptions = suppliers.length > 0 ? suppliers : parties.filter((p) => p.active);
  const activeItems = useMemo(() => itemList.filter((i) => i.active), [itemList]);
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

  const today = todayISO();
  const checks = useMemo(
    () =>
      purchaseChecks(
        { partyId, partyGstin: selectedParty?.gstin ?? null, billNo, date, lines: toLite(lines), linesTotalInr: preview.totalInr, scanned },
        { bills, today }
      ),
    [partyId, selectedParty?.gstin, billNo, date, lines, preview.totalInr, scanned, bills, today]
  );

  /** AI terminal → form (never saves). */
  function handleAiFill(f: Record<string, unknown>, meta: FillMeta) {
    const notes: string[] = [];
    const pName = typeof f.partyName === "string" ? f.partyName : null;
    const gstin = typeof f.gstin === "string" ? f.gstin : null;
    if (pName || gstin) {
      const m = matchParty(pName, gstin, partyOptions);
      if (m) setPartyId(m.party.id);
      else notes.push(`Supplier on the bill "${pName ?? "?"}"${gstin ? ` (GSTIN ${gstin})` : ""} is not in your Parties list — add it there, then pick it above.`);
    }
    if (typeof f.billNo === "string") setBillNo(f.billNo);
    if (typeof f.date === "string") setDate(f.date);
    if (typeof f.paymentMode === "string" && PAYMENT_MODES.includes(f.paymentMode as PaymentMode)) setPaymentMode(f.paymentMode as PaymentMode);
    const extra = [typeof f.vehicleNo === "string" ? `Vehicle ${f.vehicleNo}` : "", typeof f.notes === "string" ? f.notes : ""].filter(Boolean).join(" · ");
    if (extra) setNotes((n) => (n ? `${n} · ${extra}` : extra));
    const filled = cleanAiLines(f.lines);
    if (filled.length) {
      const r = applyFilledLines(lines, filled, activeItems);
      setLines(r.lines);
      if (r.matched.length) notes.push(`Matched to your items: ${r.matched.join("; ")}.`);
      if (r.unmatched.length) notes.push(`Not in your items (kept as typed): ${r.unmatched.join(", ")}.`);
    }
    setScanned({ totalInr: typeof f.billTotalInr === "number" ? f.billTotalInr : null, gstin, partyName: pName });
    if (meta.photoDataUrl) setPhoto(meta.photoDataUrl);
    setSmartMsg(notes.join(" ") || null);
  }

  function onCode(code: string) {
    setUnknownCode(null);
    const it = findItemByCode(code, activeItems);
    if (!it) return setUnknownCode(code);
    const r = addScannedItem(lines, it);
    setLines(r.lines);
    setActiveLine(r.index);
  }

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
    setScanned(null);
    setPhoto(null);
    setSmartMsg(null);
    setUnknownCode(null);
    setActiveLine(0);
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
      setSavedNote(null);
      if (photo) {
        // Keep the scanned bill as proof (Drive / phone copy, same as other bills).
        const saved = json.data as PurchaseBillDTO;
        uploadProof(
          { kind: "BILL", dataUrl: photo, capturedAt: new Date().toISOString() },
          { date, partyName: selectedParty?.name ?? scanned?.partyName ?? null, amountInr: saved.totalInr, refNo: billNo.trim(), aiFields: scanned, notes: `Purchase bill ${billNo.trim()}` }
        )
          .then(() => setSavedNote(`Bill ${saved.billNo} saved with its photo.`))
          .catch((e) => setSavedNote(`Bill ${saved.billNo} saved, but the photo was not filed: ${e instanceof Error ? e.message : "error"}.`));
      }
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

      {savedNote && <div className="rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs">{savedNote}</div>}
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {bills.length} bill{bills.length === 1 ? "" : "s"}{regBuys && regBuys.length ? ` · ${regBuys.length} from Quick Register` : ""}
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
          <AiTerminal
            desk="purchase"
            onFill={handleAiFill}
            title="AI Terminal — photograph the bill, speak, or ask"
            defaultOpen
            ask={{
              desk: "purchase",
              form: () =>
                formSummary(
                  { Supplier: selectedParty?.name ?? scanned?.partyName, "Supplier GSTIN (master)": selectedParty?.gstin, "GSTIN on bill": scanned?.gstin, "Bill no.": billNo, Date: date, Payment: paymentMode },
                  lines,
                  [`Lines total incl. GST: ₹${preview.totalInr.toFixed(2)}`, scanned?.totalInr != null ? `Total printed on the bill: ₹${scanned.totalInr}` : ""]
                ),
            }}
          />
          {smartMsg && <div className="rounded border border-sky-300 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs">{smartMsg}</div>}
          {photo && (
            <div className="flex items-center gap-2 text-xs opacity-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Bill photo" className="h-12 rounded border border-black/10" /> Bill photo will be filed with this bill when you save.
              <button type="button" className="underline" onClick={() => setPhoto(null)}>remove</button>
            </div>
          )}
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
            <CodeScan onCode={onCode} />
            {unknownCode && (
              <UnknownCode
                code={unknownCode}
                items={activeItems}
                onClose={() => setUnknownCode(null)}
                onLinked={(it) => {
                  setItemList((all) => all.map((x) => (x.id === it.id ? it : x)));
                  setUnknownCode(null);
                  const r = addScannedItem(lines, it);
                  setLines(r.lines);
                  setActiveLine(r.index);
                }}
              />
            )}
            <ScaleCapture label={`Use weight for line ${activeLine + 1}`} onUse={(kg) => setLine(activeLine, { qty: String(kg) })} />
            {lines.map((l, idx) => (
              <div key={idx} onFocus={() => setActiveLine(idx)} className={`grid grid-cols-12 gap-2 items-end rounded p-1 ${activeLine === idx ? "ring-1 ring-[var(--accent)]/60" : ""}`}>
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
                <div className="col-span-12 -mt-1 flex flex-wrap gap-x-3">
                  <RateHint bills={bills} line={l} partyId={partyId} onUse={(r) => setLine(idx, { rateInr: String(r) })} />
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

          <ChecksList checks={checks} okText={partyId && billNo && lines.some((l) => Number(l.qty) > 0) ? "No problems found in this bill." : undefined} />

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
            {saving ? "Saving…" : checks.some((c) => c.level === "alert") ? "Save bill anyway" : "Save bill"}
          </button>
        </form>
      )}

      <div className="flex justify-end gap-2 -mb-2"><PrintButton area="#pa-purchases" label="🖨️ Print purchases" className="rounded border border-black/20 dark:border-white/20 px-3 py-1 text-sm" /></div>
      <div id="pa-purchases" className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
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

      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto mt-4" id="pa-reg-purchases">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10">
          <strong className="text-sm">🛒 Purchases from Quick Register <span className="opacity-60 font-normal">(last 90 days)</span></strong>
          <span className="text-sm tabular-nums font-semibold">₹{(regBuys || []).reduce((a, e) => a + e.amountInr, 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {regBuys === null && <tr><td colSpan={7} className="px-3 py-4 text-center opacity-50">Loading…</td></tr>}
            {regBuys && regBuys.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center opacity-50">No Quick Register purchases.</td></tr>}
            {(regBuys || []).map((e) => (
              <tr key={e.id} className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2 whitespace-nowrap">{e.date.split("-").reverse().join("-")}</td>
                <td className="px-3 py-2">{e.partyName ? <a href={`/?desk=ledger&party=${encodeURIComponent(e.partyName)}`} className="underline decoration-dotted" title="Ledger of this supplier">{e.partyName}</a> : "—"}</td>
                <td className="px-3 py-2">{e.itemLabel || e.item || ""}{e.notes ? <div className="text-xs opacity-60">{e.notes}</div> : null}</td>
                <td className="px-3 py-2 whitespace-nowrap">{e.qty ? `${e.qty} ${e.unit || ""}` : ""}{e.rateInr ? <div className="text-xs opacity-60">@ ₹{e.rateInr}</div> : null}</td>
                <td className="px-3 py-2">{e.paymentMode === "CREDIT" ? "Udhaar" : e.paymentMode === "CASH" ? "Cash" : "UPI/bank"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">₹{e.amountInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right"><a href={`/register?date=${e.date}`} className="text-xs opacity-60 hover:opacity-100">Open / edit</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RegBuy { id: string; date: string; kind: string; item: string | null; itemLabel: string | null; qty: number | null; unit: string | null; rateInr: number | null; amountInr: number; paymentMode: string; partyName: string | null; notes: string | null }

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "opacity-80"}`}>
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}

