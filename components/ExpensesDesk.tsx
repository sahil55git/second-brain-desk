"use client";

// Expense recording (erp-architecture-plan.md, Phase 2). Simple dated
// category/amount log, optionally linked to a party (transporter, landlord).
import PrintButton from "@/components/print/PrintButton";
import { useMemo, useState } from "react";
import type { ExpenseDTO, PartyDTO, PaymentMode } from "@/lib/types";
import AiTerminal, { type FillMeta } from "@/components/AiTerminal";
import ChecksList from "@/components/smart/ChecksList";
import { expenseChecks, matchParty } from "@/lib/smartEntry";
import { uploadProof } from "@/lib/proofClient";

const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "BANK", "CREDIT", "OTHER"];

// Common edible-oil-shop expense buckets as quick suggestions (free text still allowed).
const CATEGORY_SUGGESTIONS = [
  "Electricity",
  "Transport / freight",
  "Salary / wages",
  "Packing material",
  "Rent",
  "Repairs / maintenance",
  "Fuel",
  "Misc",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesDesk({
  initialExpenses,
  parties,
  dbConnected,
}: {
  initialExpenses: ExpenseDTO[];
  parties: PartyDTO[];
  dbConnected: boolean;
}) {
  const [expenses, setExpenses] = useState<ExpenseDTO[]>(initialExpenses);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [amountInr, setAmountInr] = useState("");
  const [partyId, setPartyId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [notes, setNotes] = useState("");

  const activeParties = useMemo(() => parties.filter((p) => p.active), [parties]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [smartMsg, setSmartMsg] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const checks = useMemo(
    () => expenseChecks({ date, category, amountInr: Number(amountInr) || 0 }, { expenses, today: todayISO() }),
    [date, category, amountInr, expenses]
  );

  /** AI terminal → form (never saves). */
  function handleAiFill(f: Record<string, unknown>, meta: FillMeta) {
    const msgs: string[] = [];
    if (typeof f.date === "string") setDate(f.date);
    if (typeof f.category === "string") setCategory(f.category);
    if (typeof f.amountInr === "number") setAmountInr(String(f.amountInr));
    if (typeof f.paymentMode === "string" && PAYMENT_MODES.includes(f.paymentMode as PaymentMode)) setPaymentMode(f.paymentMode as PaymentMode);
    if (typeof f.partyName === "string") {
      const m = matchParty(f.partyName, null, activeParties);
      if (m) setPartyId(m.party.id);
      else msgs.push(`Paid to "${f.partyName}" — not in Parties; noted in Notes.`);
    }
    const extra = [typeof f.partyName === "string" ? `Paid to ${f.partyName}` : "", typeof f.billNo === "string" ? `Receipt ${f.billNo}` : "", typeof f.notes === "string" ? f.notes : ""].filter(Boolean).join(" · ");
    if (extra) setNotes((n) => (n ? `${n} · ${extra}` : extra));
    if (meta.photoDataUrl) setPhoto(meta.photoDataUrl);
    setSmartMsg(msgs.join(" ") || null);
  }

  const total = useMemo(
    () => expenses.reduce((s, e) => s + e.amountInr, 0),
    [expenses]
  );

  function resetForm() {
    setPhoto(null);
    setSmartMsg(null);
    setDate(todayISO());
    setCategory("");
    setAmountInr("");
    setPartyId("");
    setPaymentMode("CASH");
    setNotes("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!category.trim()) return setError("Enter a category.");
    const amt = Number(amountInr);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a positive amount.");
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          category: category.trim(),
          amountInr: amt,
          partyId: partyId || null,
          paymentMode,
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error || "Failed to save expense.");
      setExpenses((prev) => [json.data, ...prev]);
      setSavedNote(null);
      if (photo) {
        const party = activeParties.find((p) => p.id === partyId)?.name ?? null;
        uploadProof({ kind: "RECEIPT", dataUrl: photo, capturedAt: new Date().toISOString() }, { date, partyName: party, amountInr: amt, notes: `Expense: ${category.trim()}` })
          .then(() => setSavedNote("Expense saved with its receipt photo."))
          .catch((er) => setSavedNote(`Expense saved, but the photo was not filed: ${er instanceof Error ? er.message : "error"}.`));
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — expenses won&apos;t save yet.
        </div>
      )}

      {savedNote && <div className="rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs">{savedNote}</div>}
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {expenses.length} expense{expenses.length === 1 ? "" : "s"} · total ₹{total.toFixed(2)}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm font-medium"
        >
          {showForm ? "Cancel" : "+ New expense"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border border-black/10 dark:border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div className="sm:col-span-2">
            <AiTerminal
              desk="expense"
              onFill={handleAiFill}
              title="AI Terminal — photograph the receipt, speak, or ask"
              defaultOpen
              ask={{ desk: "expense", form: () => `Date: ${date}; Category: ${category || "?"}; Amount: ₹${amountInr || "?"}; Payment: ${paymentMode}; Notes: ${notes || "-"}` }}
            />
            {smartMsg && <div className="rounded border border-sky-300 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs">{smartMsg}</div>}
            {photo && (
              <div className="flex items-center gap-2 text-xs opacity-80 mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Receipt photo" className="h-12 rounded border border-black/10" /> Receipt photo will be filed when you save.
                <button type="button" className="underline" onClick={() => setPhoto(null)}>remove</button>
              </div>
            )}
          </div>
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
            <span className="opacity-70">Category *</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="expense-cats"
              placeholder="e.g. Electricity"
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
            <datalist id="expense-cats">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Amount ₹ *</span>
            <input
              type="number"
              value={amountInr}
              onChange={(e) => setAmountInr(e.target.value)}
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
          <label className="text-sm space-y-1">
            <span className="opacity-70">Party (optional)</span>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            >
              <option value="">— none —</option>
              {activeParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>

          <div className="sm:col-span-2">
            <ChecksList checks={checks} />
          </div>
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
              {saving ? "Saving…" : checks.some((c) => c.level === "alert") ? "Save expense anyway" : "Save expense"}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end gap-2 -mb-2"><PrintButton area="#pa-expenses" label="🖨️ Print expenses" className="rounded border border-black/20 dark:border-white/20 px-3 py-1 text-sm" /></div>
      <div id="pa-expenses" className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center opacity-50">
                  No expenses yet.
                </td>
              </tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2">{e.date}</td>
                <td className="px-3 py-2 font-medium">{e.category}</td>
                <td className="px-3 py-2">{e.party?.name || "—"}</td>
                <td className="px-3 py-2 text-xs">{e.paymentMode}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{e.amountInr.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => del(e.id)} className="text-xs opacity-50 hover:opacity-100">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
