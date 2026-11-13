"use client";

// Quick Register → entries waiting for the owner's OK (money out above the staff limit, and
// owner draws entered by staff). The owner approves or refuses here and sets the limit;
// staff see what is still waiting. Shows nothing when there is nothing to show.
import { useCallback, useEffect, useState } from "react";

interface Row {
  id: string;
  date: string;
  kind: string;
  item: string | null;
  itemLabel: string | null;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  notes: string | null;
  createdByName: string | null;
  details: { approvalNote?: string; approvalBy?: string } | null;
}
const KIND: Record<string, string> = { EXPENSE: "Expense", PAYMENT: "Payment", OWNER_DRAW: "Owner draw" };
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const box = "rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1";

export default function PendingApprovals() {
  const [pending, setPending] = useState<Row[]>([]);
  const [rejected, setRejected] = useState<Row[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editLimit, setEditLimit] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/register/approvals");
      if (!res.ok) return; // older database, or signed out: stay silent on the register screen
      const j = await res.json();
      setPending(j.pending || []);
      setRejected(j.rejected || []);
      setLimit(j.limitInr);
      setIsOwner(!!j.isOwner);
    } catch {
      /* offline: the register itself already says so */
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const decide = async (row: Row, decision: "approve" | "reject") => {
    let reason = "";
    if (decision === "reject") {
      const r = window.prompt(`Refuse ${KIND[row.kind] || row.kind} ${inr(row.amountInr)}? The entry stays in the register, marked as refused. Reason (optional):`, "");
      if (r === null) return;
      reason = r;
    }
    setBusy(row.id);
    setError("");
    try {
      const res = await fetch(`/api/register/${row.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  };
  const saveLimit = async () => {
    const n = Number(editLimit);
    if (!Number.isFinite(n) || n < 0) return setError("Enter the limit in rupees.");
    const res = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "approvals", data: { staffExpenseLimitInr: n } }) });
    if (!res.ok) return setError("Could not save the limit.");
    setEditLimit(null);
    await load();
  };

  if (!pending.length && !rejected.length && !isOwner) return null;
  if (!pending.length && !rejected.length && isOwner && editLimit === null) {
    return (
      <div className="mx-auto max-w-3xl px-3 pt-2 text-xs opacity-60">
        Staff can pay up to {limit === null ? "…" : inr(limit)} per entry without your OK. <button className="underline" onClick={() => setEditLimit(String(limit ?? 2000))}>Change</button>
      </div>
    );
  }

  const line = (r: Row) => `${r.date} · ${KIND[r.kind] || r.kind}${r.itemLabel || r.item ? ` (${r.itemLabel || r.item})` : ""}${r.partyName ? ` · ${r.partyName}` : ""} · ${r.paymentMode} · by ${r.createdByName || "staff"}`;

  return (
    <section className="mx-auto max-w-3xl px-3 pt-3">
      <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <strong>{pending.length ? `${pending.length} entr${pending.length === 1 ? "y" : "ies"} waiting for the owner's OK` : "Owner's OK"}</strong>
          <span className="text-xs opacity-70">Staff limit {limit === null ? "…" : inr(limit)} per entry; every owner draw needs an OK.</span>
          {isOwner && editLimit === null && <button className="text-xs underline" onClick={() => setEditLimit(String(limit ?? 2000))}>Change limit</button>}
        </div>
        {isOwner && editLimit !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min="0" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className={`${box} w-28`} aria-label="Staff limit in rupees" />
            <button className={box} onClick={saveLimit}>Save limit</button>
            <button className={box} onClick={() => setEditLimit(null)}>Cancel</button>
          </div>
        )}
        {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
        {pending.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t border-black/10 dark:border-white/10 pt-2">
            <strong className="tabular-nums">{inr(r.amountInr)}</strong>
            <span className="flex-1 min-w-[12rem]">{line(r)}{r.notes ? ` · ${r.notes}` : ""}</span>
            {isOwner ? (
              <>
                <button disabled={busy === r.id} onClick={() => decide(r, "approve")} className="rounded px-3 py-1 bg-emerald-600 text-white disabled:opacity-50">OK</button>
                <button disabled={busy === r.id} onClick={() => decide(r, "reject")} className="rounded px-3 py-1 border border-red-600 text-red-700 dark:text-red-300 disabled:opacity-50">Refuse</button>
              </>
            ) : (
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">Waiting</span>
            )}
          </div>
        ))}
        {!!rejected.length && (
          <div className="border-t border-black/10 dark:border-white/10 pt-2 text-xs">
            <strong className="text-red-700 dark:text-red-300">Refused by the owner (still in the register and in the cash):</strong>
            {rejected.map((r) => (
              <div key={r.id}>{inr(r.amountInr)} · {line(r)}{r.details?.approvalNote ? ` · reason: ${r.details.approvalNote}` : ""}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
