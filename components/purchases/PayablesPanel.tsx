"use client";

// Purchases → "To pay suppliers" (owner only). Shows who is owed how much and how old the
// oldest unpaid purchase is, and records a payment as a normal Quick Register entry
// (Payment → Supplier), so the day's cash already includes it.
import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/components/AccessProvider";
import { PAY_LATE_DAYS, PAY_OK_DAYS, type PayablesSummary, type PayStatus, type SupplierDue } from "@/lib/payables";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const BADGE: Record<PayStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  due: "bg-amber-100 text-amber-800",
  late: "bg-red-100 text-red-800",
};
const WORD: Record<PayStatus, string> = { ok: "In time", due: "Pay now", late: "Late" };
const MODES = ["CASH", "UPI", "BANK"] as const;
const box = "rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1";

export default function PayablesPanel() {
  const { ready, isOwner } = useAccess();
  const [data, setData] = useState<PayablesSummary | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<SupplierDue | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("CASH");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payables");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load.");
      setData(j.data);
      setToday(j.today);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    if (ready && isOwner) void load();
  }, [ready, isOwner, load]);

  if (!ready || !isOwner) return null;

  const startPay = (s: SupplierDue) => {
    setPayFor(s);
    setAmount(String(s.owedInr));
    setMode("CASH");
    setNote("");
    setError("");
  };
  const savePay = async () => {
    if (!payFor) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter the amount paid.");
    if (amt > payFor.owedInr + 0.005 && !window.confirm(`This is more than the ${inr(payFor.owedInr)} owed. Save it as an advance?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "PAYMENT", item: "supplier", date: today, amountInr: amt, paymentMode: mode, partyName: payFor.name, notes: note.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not save the payment.");
      setPayFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the payment.");
    } finally {
      setSaving(false);
    }
  };

  const owing = data?.suppliers.filter((s) => s.owedInr > 0) ?? [];
  const ahead = data?.suppliers.filter((s) => s.advanceInr > 0) ?? [];

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <strong className="text-sm">To pay suppliers</strong>
        {data && (
          <span className="text-sm">
            Total <strong>{inr(data.totalOwedInr)}</strong>
            {data.lateInr > 0 && <span className="ml-3 text-red-700 dark:text-red-300">Late (over {PAY_LATE_DAYS} days) {inr(data.lateInr)}</span>}
            {data.dueInr > 0 && <span className="ml-3 text-amber-700 dark:text-amber-300">Pay now ({PAY_OK_DAYS + 1}–{PAY_LATE_DAYS} days) {inr(data.dueInr)}</span>}
          </span>
        )}
        <span className="flex-1" />
        <button className={`${box} text-xs`} onClick={() => void load()}>Refresh</button>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {data && !owing.length && <p className="text-sm opacity-70">Nothing is owed. Purchases saved as Credit (here or in the Quick Register) show up in this list.</p>}

      {!!owing.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs opacity-60">
              <tr><th className="py-1">Supplier</th><th className="text-right">Owed</th><th className="pl-3">Oldest unpaid</th><th className="pl-3">Last paid</th><th /></tr>
            </thead>
            <tbody>
              {owing.map((s) => (
                <FragmentRows key={s.key} s={s} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} onPay={() => startPay(s)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payFor && (
        <div className="rounded border border-black/15 dark:border-white/15 p-3 space-y-2 text-sm">
          <div>Pay <strong>{payFor.name}</strong> · owed {inr(payFor.owedInr)}</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${box} w-32`} aria-label="Amount paid" />
            <select value={mode} onChange={(e) => setMode(e.target.value as (typeof MODES)[number])} className={box} aria-label="Paid by">
              {MODES.map((m) => <option key={m} value={m}>{m === "CASH" ? "Cash" : m === "UPI" ? "UPI" : "Bank"}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${box} flex-1 min-w-[10rem]`} />
            <button disabled={saving} onClick={savePay} className="rounded px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-50">{saving ? "Saving…" : "Save payment"}</button>
            <button onClick={() => setPayFor(null)} className={box}>Cancel</button>
          </div>
          <p className="text-xs opacity-70">Saved in today&apos;s Quick Register as Payment → Supplier{mode === "CASH" ? ", so it counts in today's cash out" : ""}. Add the payment proof there.</p>
        </div>
      )}

      {!!ahead.length && <p className="text-xs opacity-80">Paid ahead: {ahead.map((s) => `${s.name} ${inr(s.advanceInr)}`).join(" · ")}</p>}
      {data && data.unassignedPaidInr > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {inr(data.unassignedPaidInr)} of supplier payments in the register have no supplier name, so they are not set against anyone. Add the name on those entries.
        </p>
      )}
      <p className="text-xs opacity-60">Counts purchase bills and register purchases saved as Credit, minus register payments to that supplier. Payments clear the oldest purchase first. Opening balances from before the app are not included.</p>
    </section>
  );
}

function FragmentRows({ s, open, onToggle, onPay }: { s: SupplierDue; open: boolean; onToggle: () => void; onPay: () => void }) {
  return (
    <>
      <tr className="border-t border-black/5 dark:border-white/10">
        <td className="py-1.5">
          <button className="underline decoration-dotted" onClick={onToggle}>{s.name}</button>
          {!s.partyId && <span className="ml-1 text-[10px] opacity-60">(not in Parties)</span>}
        </td>
        <td className="text-right tabular-nums font-semibold">{inr(s.owedInr)}</td>
        <td className="pl-3">
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${BADGE[s.status]}`}>{WORD[s.status]}</span>
          <span className="ml-2 opacity-70">{s.oldestDays} day{s.oldestDays === 1 ? "" : "s"}</span>
        </td>
        <td className="pl-3 opacity-70">{s.lastPaymentDate || "never"}</td>
        <td className="text-right"><button onClick={onPay} className="rounded px-2 py-1 text-xs bg-[var(--accent)] text-[var(--accent-contrast)]">Pay</button></td>
      </tr>
      {open &&
        s.openBills.map((b) => (
          <tr key={b.id} className="text-xs opacity-80">
            <td className="pl-4 py-0.5">{b.date} · {b.source === "bill" ? `Bill ${b.ref}` : `Register: ${b.ref}`}</td>
            <td className="text-right tabular-nums">{inr(b.remainingInr)}{b.remainingInr < b.amountInr ? ` of ${inr(b.amountInr)}` : ""}</td>
            <td className="pl-3"><span className={`rounded px-1.5 py-0.5 text-[10px] ${BADGE[b.status]}`}>{b.daysOld} days</span></td>
            <td /><td />
          </tr>
        ))}
    </>
  );
}
