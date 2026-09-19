"use client";

// Business profile + GST settings singleton (erp-architecture-plan.md,
// Phase 1). Owner-only — the tab itself is hidden from Staff in
// DeskTabs.tsx, and app/api/settings/route.ts refuses non-Owner sessions
// server-side regardless (a client hide is never the real boundary).
import { useState } from "react";
import type { BusinessSettingsDTO } from "@/lib/types";

export default function SettingsDesk({
  initialSettings,
  dbConnected,
}: {
  initialSettings: BusinessSettingsDTO | null;
  dbConnected: boolean;
}) {
  const [form, setForm] = useState({
    businessName: initialSettings?.businessName || "",
    gstin: initialSettings?.gstin || "",
    address: initialSettings?.address || "",
    state: initialSettings?.state || "",
    phone: initialSettings?.phone || "",
    email: initialSettings?.email || "",
    defaultGstRatePct: String(initialSettings?.defaultGstRatePct ?? 5),
    invoicePrefix: initialSettings?.invoicePrefix || "INV-",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          defaultGstRatePct: Number(form.defaultGstRatePct) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save settings.");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {!dbConnected && (
        <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Database not connected — settings won&apos;t save yet.
        </div>
      )}

      <form
        onSubmit={submit}
        className="rounded-xl border border-black/10 dark:border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <h2 className="sm:col-span-2 font-semibold">Business profile</h2>

        <label className="text-sm space-y-1 sm:col-span-2">
          <span className="opacity-70">Business name</span>
          <input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
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
          <span className="opacity-70">Home state</span>
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            placeholder="Used to determine CGST+SGST vs IGST"
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

        <h2 className="sm:col-span-2 font-semibold mt-2">GST — Regular dealer</h2>
        <label className="text-sm space-y-1">
          <span className="opacity-70">Default GST rate %</span>
          <input
            type="number"
            value={form.defaultGstRatePct}
            onChange={(e) => setForm({ ...form, defaultGstRatePct: e.target.value })}
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="opacity-70">Invoice number prefix</span>
          <input
            value={form.invoicePrefix}
            onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
            className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>
        {initialSettings && (
          <p className="text-xs opacity-50 sm:col-span-2">
            Last invoice number used: {initialSettings.invoiceCounter} (Sales, Phase 2, increments this)
          </p>
        )}

        {error && (
          <div className="sm:col-span-2 rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">
            {error}
          </div>
        )}
        {savedAt && (
          <div className="sm:col-span-2 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
            Saved at {savedAt}.
          </div>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
