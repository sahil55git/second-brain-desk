"use client";

// Stock page → "Stock ledger": one line per oil with the count carried forward, the book and
// the gap. The owner picks which figure is the stock: Physical, Book, or Hybrid (per oil).
import { Fragment, useCallback, useEffect, useState } from "react";
import { businessDate } from "@/lib/register";
import type { Basis, Ledger, LedgerDay, LedgerMode, LedgerSettings } from "@/lib/stockLedger";

const kg = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const signed = (n: number) => (n > 0 ? "+" : "") + kg(n);
const box = "rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1";
const MODES: { key: LedgerMode; name: string; says: string }[] = [
  { key: "physical", name: "Physical", says: "The last count, carried forward, is the stock for every oil. The book is only a check." },
  { key: "book", name: "Book", says: "Purchases minus sales since the first count is the stock for every oil. The count is only a check." },
  { key: "hybrid", name: "Hybrid", says: "Oils kept in a tank follow the count; the others follow the book. You can change any single oil below." },
];

export default function StockLedgerPanel() {
  const today = businessDate(Date.now());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<Ledger | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [days, setDays] = useState<LedgerDay[]>([]);
  const [show, setShow] = useState(true);

  const load = useCallback(async (key: string | null = null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/stock-ledger?asOf=${asOf}${key ? `&key=${key}` : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load the stock ledger.");
      setData(j.data);
      setIsOwner(!!j.isOwner);
      setDays(j.days || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the stock ledger.");
    } finally {
      setBusy(false);
    }
  }, [asOf]);
  useEffect(() => {
    setOpenKey(null);
    void load();
  }, [load]);

  const save = async (next: LedgerSettings) => {
    setError("");
    const res = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "stockLedger", data: next }) });
    if (!res.ok) return setError("Could not save. Only the owner can change how stock is worked out.");
    await load(openKey);
  };
  const toggleRow = (key: string) => {
    const next = openKey === key ? null : key;
    setOpenKey(next);
    setDays([]);
    if (next) void load(next);
  };

  const s = data?.settings;
  const mode = MODES.find((m) => m.key === s?.mode);

  return (
    <section className="mx-auto max-w-5xl px-3 pt-3">
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="font-semibold" onClick={() => setShow((v) => !v)}>{show ? "▾" : "▸"} Stock ledger</button>
          {data && <span className="opacity-70">{kg(data.totals.stockKg)} kg in all{data.totals.flagged ? ` · ${data.totals.flagged} gap(s) to check` : ""}</span>}
          <span className="flex-1" />
          <label className="flex items-center gap-1">As of <input type="date" value={asOf} max={today} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={box} /></label>
          <button className={box} onClick={() => void load(openKey)} disabled={busy}>{busy ? "…" : "Refresh"}</button>
        </div>
        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {show && data && s && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="opacity-70">Stock is taken from:</span>
              {MODES.map((m) => (
                <button key={m.key} disabled={!isOwner} onClick={() => save({ ...s, mode: m.key })} className={`rounded px-3 py-1 border ${s.mode === m.key ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent" : "border-black/20 dark:border-white/20"} disabled:opacity-70`}>{m.name}</button>
              ))}
              {isOwner && (
                <label className="ml-2 flex items-center gap-1 text-xs opacity-80">Book starts from the first count on or after
                  <input type="date" value={s.bookStart || ""} max={today} onChange={(e) => save({ ...s, bookStart: e.target.value || null })} className={box} />
                </label>
              )}
            </div>
            <p className="text-xs opacity-70">{mode?.says}{!isOwner ? " Only the owner can change this." : ""}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs opacity-60">
                  <tr><th className="py-1">Oil</th><th className="text-right">Stock kg</th><th className="pl-3">From</th><th className="text-right">Last count</th><th className="text-right">In since</th><th className="text-right">Out since</th><th className="text-right">Carried</th><th className="text-right">Book</th><th className="text-right">Gap</th></tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <Fragment key={r.key}>
                      <tr className="border-t border-black/5 dark:border-white/10">
                        <td className="py-1.5"><button className="underline decoration-dotted text-left" onClick={() => toggleRow(r.key)}>{r.label}</button>{r.approx && <span title="Some entries were in litres, converted at 0.91 kg per litre" className="ml-1 text-xs opacity-60">≈</span>}</td>
                        <td className="text-right tabular-nums font-bold">{kg(r.stockKg)}</td>
                        <td className="pl-3 text-xs">
                          {s.mode === "hybrid" && isOwner ? (
                            <select value={r.basis} onChange={(e) => save({ ...s, perProduct: { ...s.perProduct, ...Object.fromEntries(r.members.map((m) => [m, e.target.value as Basis])) } })} className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1 py-0.5">
                              <option value="physical">Count</option>
                              <option value="book">Book</option>
                            </select>
                          ) : r.basis === "physical" ? "Count" : "Book"}
                        </td>
                        <td className="text-right tabular-nums">{r.counted ? <>{kg(r.counted.kg)} <span className="text-xs opacity-60">{r.counted.date.slice(5)}{r.countAgeDays && r.countAgeDays > 2 ? ` (${r.countAgeDays} days old)` : ""}</span></> : <span className="text-xs text-amber-700 dark:text-amber-300">never counted</span>}</td>
                        <td className="text-right tabular-nums">{r.counted ? kg(r.inSinceKg) : "–"}</td>
                        <td className="text-right tabular-nums">{r.counted ? kg(r.outSinceKg) : "–"}</td>
                        <td className="text-right tabular-nums">{kg(r.carriedKg)}</td>
                        <td className="text-right tabular-nums">{kg(r.bookKg)}</td>
                        <td className={`text-right tabular-nums ${r.flag ? "font-bold text-red-700 dark:text-red-300" : ""}`}>{r.gapKg === null ? "–" : signed(r.gapKg)}{r.flag && r.gapPct !== null ? ` (${signed(r.gapPct)}%)` : ""}</td>
                      </tr>
                      {openKey === r.key && (
                        <tr>
                          <td colSpan={9} className="pb-3 pl-4 text-xs">
                            {r.bookFrom && <div className="opacity-70 py-1">Book: {kg(r.bookFrom.kg)} kg counted on {r.bookFrom.date} + {kg(r.bookInKg)} in − {kg(r.bookOutKg)} out = {kg(r.bookKg)} kg.</div>}
                            {r.flag && r.gapKg !== null && <div className="py-1 text-red-700 dark:text-red-300">{r.gapKg < 0 ? `${kg(-r.gapKg)} kg less oil than the books say: a sale not entered, a spill, or a wrong count.` : `${kg(r.gapKg)} kg more oil than the books say: a purchase or transfer not entered, a sale entered twice, or a wrong count.`}</div>}
                            {!days.length ? <div className="opacity-60">{busy ? "Loading…" : "Nothing recorded in the last 45 days."}</div> : (
                              <table className="w-full max-w-2xl">
                                <thead className="text-left opacity-60"><tr><th>Day</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th className="text-right">Day gap</th><th className="pl-3">From</th></tr></thead>
                                <tbody>
                                  {days.map((d) => (
                                    <tr key={d.date} className="border-t border-black/5 dark:border-white/10">
                                      <td className="tabular-nums py-0.5">{d.date}</td><td className="text-right tabular-nums">{kg(d.inKg)}</td><td className="text-right tabular-nums">{kg(d.outKg)}</td>
                                      <td className="text-right tabular-nums">{kg(d.expectedKg)}</td><td className="text-right tabular-nums">{kg(d.countedKg)}</td>
                                      <td className={`text-right tabular-nums ${d.gapKg !== null && Math.abs(d.gapKg) >= 1 ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>{d.gapKg === null ? "–" : signed(d.gapKg)}</td>
                                      <td className="pl-3 opacity-70">{d.sources.join(", ")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs opacity-60">Carried = last count + in − out since that count. Book = first count + everything in − everything out. Gap = carried − book; red when it is 1 kg or more and over 1 %. Switching the mode changes no record, only which figure is shown as the stock.</p>
            {!!data.notCounted.length && (
              <details className="text-xs">
                <summary className="cursor-pointer text-amber-700 dark:text-amber-300">{data.notCounted.reduce((a, n) => a + n.entries, 0)} entries are not in these figures</summary>
                <div className="pt-1 space-y-0.5">
                  {data.notCounted.slice(0, 40).map((n) => <div key={`${n.why}${n.name}`}>{n.entries} × {n.name}{n.qty ? ` (${kg(n.qty)})` : ""}: {n.why}</div>)}
                  <div className="opacity-70 pt-1">A sale saved as one total has no oil name, so the book cannot take it out of any tank. With many of these, use Physical or Hybrid.</div>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
