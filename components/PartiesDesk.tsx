"use client";

// Unified customer/supplier master (erp-architecture-plan.md, Phase 1).
// Simple form + table — not plugged into the widget/column customization
// system used by the older desks, since a master-data screen doesn't have
// the same "stat widgets + ledger" shape.
import { useMemo, useState } from "react";
import type { PartyDTO, PartyType } from "@/lib/types";

const TYPE_LABEL: Record<PartyType, string> = {
  CUSTOMER: "Customer",
  SUPPLIER: "Supplier",
  BOTH: "Both",
};

export default function PartiesDesk({
  initialParties,
  dbConnected,
}: {
  initialParties: PartyDTO[];
  dbConnected: boolean;
}) {
  const [parties, setParties] = useState<PartyDTO[]>(initialParties);
  const [filter, setFilter] = useState<"ALL" | PartyType>("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-x-auto">
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
                <td className="px-3 py-2 font-medium">{p.name}</td>
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
