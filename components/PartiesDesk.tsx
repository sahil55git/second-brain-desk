"use client";

// Unified customer/supplier master (erp-architecture-plan.md, Phase 1).
// Simple form + table — not plugged into the widget/column customization
// system used by the older desks, since a master-data screen doesn't have
// the same "stat widgets + ledger" shape.
import PrintButton from "@/components/print/PrintButton";
import { useEffect, useMemo, useState } from "react";
import type { PartyDTO, PartyType } from "@/lib/types";
import HoverCard from "./HoverCard";
import type { SearchDesk } from "@/lib/globalSearch";
import { businessDate } from "@/lib/register";

interface UdhaarView {
  rows: { name: string; balance: number }[];
  creditInvoices: { id: string; invoiceNo: string; date: string; party: string; openInr: number; status: string }[];
}

const TYPE_LABEL: Record<PartyType, string> = {
  CUSTOMER: "Customer",
  SUPPLIER: "Supplier",
  BOTH: "Both",
};

export default function PartiesDesk({
  initialParties,
  dbConnected,
  onNavigate,
}: {
  initialParties: PartyDTO[];
  dbConnected: boolean;
  onNavigate?: (desk: SearchDesk) => void;
}) {
  const [parties, setParties] = useState<PartyDTO[]>(initialParties);
  const [filter, setFilter] = useState<"ALL" | PartyType>("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [udhaar, setUdhaar] = useState<UdhaarView | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payBill, setPayBill] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<"CASH" | "UPI">("CASH");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const today = useMemo(() => businessDate(Date.now()), []);

  async function loadUdhaar() {
    try {
      const res = await fetch("/api/udhaar");
      const json = await res.json();
      if (res.ok && json.data) setUdhaar({ rows: json.data.rows, creditInvoices: json.data.creditInvoices });
    } catch {
      /* balances are optional on this screen; the table still works without them */
    }
  }
  useEffect(() => {
    loadUdhaar();
  }, []);

  const balanceFor = (name: string) => udhaar?.rows.find((r) => r.name === name)?.balance ?? 0;
  const openBillsFor = (name: string) => (udhaar?.creditInvoices || []).filter((c) => c.party === name && c.status !== "paid");

  function startPayment(name: string) {
    setPayFor(name);
    setPayBill("");
    setPayAmount(String(Math.max(0, balanceFor(name))));
    setPayError(null);
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setPaySaving(true);
    setPayError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "UDHAAR_IN",
          date: today,
          amountInr: Number(payAmount),
          partyName: payFor,
          paymentMode: payMode,
          ...(payBill ? { invoiceId: payBill } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPayError(json.error || "Could not save the receipt.");
        return;
      }
      setPayFor(null);
      await loadUdhaar();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not save the receipt.");
    } finally {
      setPaySaving(false);
    }
  }

  const [form, setForm] = useState({
    type: "CUSTOMER" as PartyType,
    name: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    state: "",
    openingBalanceInr: "",
    notes: "",
  });

  const visible = useMemo(() => {
    return parties
      .filter((p) => p.active)
      .filter((p) => filter === "ALL" || p.type === filter)
      .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [parties, filter, search]);

  function resetForm() {
    setForm({
      type: "CUSTOMER",
      name: "",
      phone: "",
      email: "",
      gstin: "",
      address: "",
      state: "",
      openingBalanceInr: "",
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
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          openingBalanceInr: Number(form.openingBalanceInr) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save party.");
        return;
      }
      setParties((prev) => [json.data, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save party.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    const res = await fetch(`/api/parties/${id}`, { method: "DELETE" });
    if (res.ok) {
      setParties((prev) => prev.map((p) => (p.id === id ? { ...p, active: false } : p)));
    }
  }

  return (
    <div className="space-y-4">
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — Parties won&apos;t save yet.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-1.5 text-sm flex-1 min-w-[160px]"
        />
        {(["ALL", "CUSTOMER", "SUPPLIER", "BOTH"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded text-sm ${
              filter === t ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-black/5 dark:bg-white/5"
            }`}
          >
            {t === "ALL" ? "All" : TYPE_LABEL[t]}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm font-medium"
        >
          {showForm ? "Cancel" : "+ Add party"}
        </button>
      </div>

      {payFor && (
        <form onSubmit={submitPayment} className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Record payment · {payFor}</strong>
            <button type="button" onClick={() => setPayFor(null)} className="text-xs underline">Cancel</button>
          </div>
          <p className="text-xs opacity-70">Udhaar balance ₹{balanceFor(payFor).toLocaleString("en-IN")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <label className="text-xs space-y-1">
              <span className="opacity-60">Against bill</span>
              <select
                value={payBill}
                onChange={(e) => {
                  setPayBill(e.target.value);
                  const b = openBillsFor(payFor).find((x) => x.id === e.target.value);
                  if (b) setPayAmount(String(b.openInr));
                }}
                className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="">Oldest open bill first</option>
                {openBillsFor(payFor).map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.invoiceNo} · {b.date} · open ₹{b.openInr.toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="opacity-60">Amount ₹</span>
              <input type="number" min={0} step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs space-y-1">
              <span className="opacity-60">Received by</span>
              <select value={payMode} onChange={(e) => setPayMode(e.target.value as "CASH" | "UPI")} className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm">
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={paySaving} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50">
                {paySaving ? "Saving…" : "Save receipt"}
              </button>
            </div>
          </div>
          {payError && <p className="text-xs text-red-700 dark:text-red-300">{payError}</p>}
        </form>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border border-black/10 dark:border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <label className="text-sm space-y-1">
            <span className="opacity-70">Type</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as PartyType })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            >
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="BOTH">Both</option>
            </select>
          </label>
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
            <span className="opacity-70">Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Email</span>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">GSTIN</span>
            <input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">State</span>
            <input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="e.g. Maharashtra"
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="opacity-70">Address</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="opacity-70">Opening balance (₹, +ve = they owe you)</span>
            <input
              type="number"
              value={form.openingBalanceInr}
              onChange={(e) => setForm({ ...form, openingBalanceInr: e.target.value })}
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
              {saving ? "Saving…" : "Save party"}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end -mb-2"><PrintButton area="#pa-parties" label="🖨️ Print party list" className="rounded border border-black/20 dark:border-white/20 px-3 py-1 text-sm" /></div>
      <div id="pa-parties" className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60 border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">GSTIN</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2 text-right">Opening bal.</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center opacity-50">
                  No parties yet.
                </td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2 font-medium">
                  <HoverCard
                    trigger={<button type="button" className="text-left font-medium underline decoration-dotted underline-offset-4">{p.name}</button>}
                  >
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs opacity-70">{TYPE_LABEL[p.type]}{p.state ? ` · ${p.state}` : ""}</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li>Phone: {p.phone || "—"}</li>
                      <li>Email: {p.email || "—"}</li>
                      <li>GSTIN: {p.gstin || "—"}</li>
                      <li>Opening balance: ₹{p.openingBalanceInr.toLocaleString("en-IN")}</li>
                      {p.notes && <li>Note: {p.notes}</li>}
                    </ul>
                    <div className="mt-3 border-t border-black/10 dark:border-white/10 pt-2 text-xs space-y-1">
                      <div>
                        Udhaar balance: <strong className={balanceFor(p.name) > 0 ? "text-[var(--accent-ink)]" : ""}>₹{balanceFor(p.name).toLocaleString("en-IN")}</strong>
                      </div>
                      {openBillsFor(p.name).slice(0, 3).map((b) => (
                        <div key={b.id} className="opacity-80">#{b.invoiceNo} · {b.date} · open ₹{b.openInr.toLocaleString("en-IN")}</div>
                      ))}
                      {balanceFor(p.name) > 0 && (
                        <button type="button" onClick={() => startPayment(p.name)} className="mt-1 underline">Record payment</button>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      {onNavigate && (
                        <button type="button" onClick={() => onNavigate("sales")} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast)]">
                          New bill
                        </button>
                      )}
                      <button type="button" onClick={() => archive(p.id)} className="rounded-lg border border-black/15 dark:border-white/20 px-3 py-1.5 text-xs">
                        Archive
                      </button>
                    </div>
                  </HoverCard>
                </td>
                <td className="px-3 py-2">{TYPE_LABEL[p.type]}</td>
                <td className="px-3 py-2">{p.phone || "—"}</td>
                <td className="px-3 py-2">{p.gstin || "—"}</td>
                <td className="px-3 py-2">{p.state || "—"}</td>
                <td className="px-3 py-2 text-right">₹{p.openingBalanceInr.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => archive(p.id)} className="text-xs opacity-60 hover:opacity-100">
                    Archive
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
