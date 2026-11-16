"use client";

// Manufacturing → "Khali (oil cake) sold" (owner only): the sale log for a date range with
// totals. The sales themselves are entered in the Quick Register (Sale → Oil cake).
import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/components/AccessProvider";
import { businessDate } from "@/lib/register";
import type { KhaliSummary } from "@/lib/khaliSales";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const box = "rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1";

export default function KhaliSalesPanel() {
  const { ready, isOwner } = useAccess();
  const [to, setTo] = useState(() => businessDate(Date.now()));
  const [from, setFrom] = useState(() => businessDate(Date.now() - 89 * 86400000));
  const [data, setData] = useState<KhaliSummary | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/khali-sales?from=${from}&to=${to}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load.");
      setData(j.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [from, to]);
  useEffect(() => {
    if (ready && isOwner) void load();
  }, [ready, isOwner, load]);

  if (!ready || !isOwner) return null;

  const csv = () => {
    if (!data) return;
    const rows = [["Date", "Buyer", "Kg", "Rate", "Amount", "Paid by", "Note"], ...data.rows.map((r) => [r.date, r.partyName || "", r.unit === "kg" && r.qty ? r.qty : "", r.rateInr ?? "", r.amountInr, r.paymentMode, r.notes || ""])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `khali-sales-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="mt-6 rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>Khali (oil cake) sold</strong>
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={box} aria-label="From" />
        <span>to</span>
        <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={box} aria-label="To" />
        {!!data?.rows.length && <button className={box} onClick={csv}>⬇ CSV</button>}
        <span className="flex-1" />
        <a href="/register" className="underline text-xs">Add a sale: Quick Register → Sale → Oil cake</a>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Sold <strong>{data.kg.toLocaleString("en-IN")} kg</strong></span>
            <span>Money <strong>{inr(data.amountInr)}</strong></span>
            <span>Average rate <strong>{data.avgRateInr === null ? "–" : `${inr(data.avgRateInr)}/kg`}</strong></span>
            {data.creditInr > 0 && <span className="text-amber-700 dark:text-amber-300">On credit {inr(data.creditInr)}</span>}
          </div>
          {data.withoutKg > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{data.withoutKg} sale(s) were saved without a weight in kg, so they are not in the kg total or the average rate.</p>}
          {!data.rows.length && <p className="text-sm opacity-70">No khali sale in these dates.</p>}
          {!!data.rows.length && (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs opacity-60"><tr><th className="py-1">Date</th><th>Buyer</th><th className="text-right">Kg</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th className="pl-3">Paid by</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-t border-black/5 dark:border-white/10">
                      <td className="py-1 tabular-nums">{r.date}</td>
                      <td>{r.partyName || <span className="opacity-50">not named</span>}</td>
                      <td className="text-right tabular-nums">{r.unit === "kg" && r.qty ? r.qty.toLocaleString("en-IN") : "–"}</td>
                      <td className="text-right tabular-nums">{r.rateInr ? inr(r.rateInr) : "–"}</td>
                      <td className="text-right tabular-nums font-semibold">{inr(r.amountInr)}</td>
                      <td className="pl-3 text-xs">{r.paymentMode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.byBuyer.length > 1 && <p className="text-xs opacity-80">By buyer: {data.byBuyer.map((b) => `${b.name} ${b.kg.toLocaleString("en-IN")} kg, ${inr(b.amountInr)}`).join(" · ")}</p>}
        </>
      )}
    </section>
  );
}
