"use client";

// Refund (credit note) for a sales bill. Pick the items and quantities coming
// back, a reason and an optional note. The panel shows the money and the stock
// effect before saving. Saving records the refund and adds the stock back;
// there is no owner approval step in this version.
import { useMemo, useState } from "react";
import type { SalesInvoiceDTO, SalesLineItemDTO } from "@/lib/types";
import { REFUND_REASONS, refundAmount, remainingQty, type RefundReason } from "@/lib/refunds";

export default function RefundPanel({
  invoice,
  onDone,
  onClose,
}: {
  invoice: SalesInvoiceDTO;
  onDone: (lineItems: SalesLineItemDTO[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<RefundReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = invoice.lineItems.map((l) => ({ line: l, left: remainingQty({ qty: l.qty, returnedQty: l.returnedQty ?? 0 }) }));
  const returnable = rows.filter((r) => r.left > 0);

  const impact = useMemo(() => {
    let total = 0;
    const items: { id: string; name: string; unit: string; qty: number; amount: number }[] = [];
    for (const { line } of rows) {
      const qty = picked[line.id] ?? 0;
      if (qty <= 0) continue;
      const amount = refundAmount({ qty: line.qty, lineTotalInr: line.lineTotalInr }, qty);
      total += amount;
      items.push({ id: line.id, name: line.name, unit: line.unit, qty, amount });
    }
    return { total: Math.round(total * 100) / 100, items };
  }, [picked, rows]);

  function toggle(l: SalesLineItemDTO, left: number, on: boolean) {
    setPicked((p) => {
      const next = { ...p };
      if (on) next[l.id] = left;
      else delete next[l.id];
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!reason) return setError("Choose a reason.");
    if (impact.items.length === 0) return setError("Select at least one item to return.");
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${invoice.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          note,
          lines: impact.items.map((i) => ({ lineId: i.id, qty: i.qty })),
        }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error || "Could not record the refund.");
      onDone(json.data.lineItems as SalesLineItemDTO[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the refund.");
    } finally {
      setSaving(false);
    }
  }

  const isCredit = invoice.paymentMode === "CREDIT";

  return (
    <section aria-label="Refund" className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Refund · #{invoice.invoiceNo}</h3>
          <p className="text-xs opacity-70">
            {invoice.party?.name || "Walk-in"} · {invoice.date} · sold for ₹{invoice.totalInr.toFixed(2)} ({invoice.paymentMode.toLowerCase()})
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs rounded border border-black/20 dark:border-white/20 px-2 py-1">
          Close
        </button>
      </div>

      {returnable.length === 0 ? (
        <p className="text-sm opacity-70">Everything on this bill has already been returned.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs opacity-60">
              <tr>
                <th className="py-1 pr-2">Return</th>
                <th className="py-1 pr-2">Item</th>
                <th className="py-1 pr-2 text-right">Sold</th>
                <th className="py-1 pr-2 text-right">Left to return</th>
                <th className="py-1 pr-2 text-right">Refund ₹</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, left }) => {
                const on = (picked[line.id] ?? 0) > 0;
                const refund = on ? refundAmount({ qty: line.qty, lineTotalInr: line.lineTotalInr }, picked[line.id]) : 0;
                return (
                  <tr key={line.id} className={`border-t border-black/10 dark:border-white/10 ${left === 0 ? "opacity-40" : ""}`}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Return ${line.name}`}
                        disabled={left === 0}
                        checked={on}
                        onChange={(e) => toggle(line, left, e.target.checked)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      {line.name}
                      <div className="text-[11px] opacity-60">Stock back in: {on ? picked[line.id] : 0} {line.unit}</div>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{line.qty} {line.unit}</td>
                    <td className="py-2 pr-2 text-right">
                      {on ? (
                        <input
                          type="number"
                          min={0}
                          max={left}
                          step="any"
                          aria-label={`Quantity to return of ${line.name}`}
                          value={picked[line.id]}
                          onChange={(e) => {
                            const v = Math.min(left, Math.max(0, Number(e.target.value) || 0));
                            setPicked((p) => ({ ...p, [line.id]: v }));
                          }}
                          className="w-24 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-right"
                        />
                      ) : (
                        <span className="tabular-nums">{left} {line.unit}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{on ? `₹${refund.toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs opacity-60 mb-1">Reason</legend>
        <div className="flex flex-wrap gap-2">
          {REFUND_REASONS.map((r) => (
            <label key={r} className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${reason === r ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]" : "border-black/20 dark:border-white/20"}`}>
              <input type="radio" name={`reason-${invoice.id}`} value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-xs space-y-1">
        <span className="opacity-60">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm" />
      </label>

      <div className="rounded-lg bg-black/5 dark:bg-white/5 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span>Refund total</span><strong className="tabular-nums">₹{impact.total.toFixed(2)}</strong></div>
        <div className="text-xs opacity-70">
          {isCredit
            ? "This bill was on credit. The refund is recorded here, but udhaar balances do not net it off yet, so reduce the party's udhaar in the Parties tab."
            : `Cash or UPI to return to the customer: ₹${impact.total.toFixed(2)} (${invoice.paymentMode.toLowerCase()}).`}
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 px-3 py-2 text-xs text-red-800 dark:text-red-300">{error}</div>}

      <button
        type="button"
        onClick={save}
        disabled={saving || returnable.length === 0}
        className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Record refund"}
      </button>
    </section>
  );
}
