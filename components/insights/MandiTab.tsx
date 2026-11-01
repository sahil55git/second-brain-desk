"use client";

// 🌾 Insights → Mandi: today's APMC seed prices (data.gov.in Agmarknet) with a buy / wait hint,
// plus your own local rates.
import { useCallback, useEffect, useState } from "react";
import { COMMODITIES, type MandiRow, type MandiSignal } from "@/lib/mandi";

interface Data { rows: MandiRow[]; signals: MandiSignal[]; updatedAt: string | null; lastError?: string | null; keySet: boolean }
const kg = (q: number | null | undefined) => (q == null ? "–" : `₹${(q / 100).toFixed(1)}`);
const dmy = (d: string) => d.split("-").reverse().join("-");

export default function MandiTab() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [own, setOwn] = useState({ commodity: "Groundnut", rate: "", market: "" });
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/mandi").then((r) => r.json()).then((j) => setD(j.data || null)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const refresh = async () => {
    setBusy(true);
    const r = await fetch("/api/mandi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: true }) }).then((x) => x.json()).catch(() => ({}));
    setMsg(r.data ? (r.data.error ? `Feed: ${r.data.error}` : `${r.data.added} prices fetched ✓`) : r.error || "Could not fetch.");
    setBusy(false);
    void load();
  };
  const addOwn = async () => {
    const perQtl = Number(own.rate) * 100;
    const r = await fetch("/api/mandi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: own.commodity, modalQtl: perQtl, market: own.market }) });
    setMsg(r.ok ? "Your rate saved ✓" : "Could not save");
    setOwn({ ...own, rate: "" });
    void load();
  };
  return (
    <>
      <div className="ins-range">
        <button className="hub-btn primary sm" disabled={busy} onClick={() => void refresh()}>{busy ? "Fetching…" : "↻ Get today's prices"}</button>
        <span className="hub-m small">{d?.updatedAt ? `Updated ${new Date(d.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not fetched yet"} · Karnataka, Maharashtra, Telangana APMCs · fetched every morning</span>
        {msg && <span className="hub-m">{msg}</span>}
      </div>
      {d && !d.keySet && <div className="hub-banner">For the full feed, add a free <b>DATA_GOV_API_KEY</b> in Vercel (data.gov.in → sign up → My account → API key). Until then only a few sample rows come.</div>}
      {d?.signals.filter((s) => s.signal === "buy").map((s) => <div key={s.commodity} className="hub-banner ins-good">🟢 {s.say}</div>)}
      <div className="ins-cards">
        {(d?.signals || []).map((s) => {
          const max = Math.max(...s.series.map((p) => p.modal)), min = Math.min(...s.series.map((p) => p.modal));
          const pts = s.series.map((p, i) => `${s.series.length > 1 ? (i / (s.series.length - 1)) * 200 : 100},${38 - ((p.modal - min) / Math.max(1, max - min)) * 34}`).join(" ");
          return (
            <div key={s.commodity} className={`hub-card ins-run ${s.signal === "buy" ? "ok" : s.signal === "wait" ? "low" : ""}`}>
              <div className="ins-run-h"><b>{s.commodity}</b><span className={`ins-chip ${s.signal === "buy" ? "ok" : s.signal === "wait" ? "low" : ""}`}>{s.signal === "buy" ? "Buy" : s.signal === "wait" ? "Wait" : "Steady"}</span></div>
              <div className="ins-run-v">{kg(s.latest)}<small>/kg · ₹{s.latest}/qtl</small></div>
              <svg viewBox="0 0 200 40" className="ins-spark" preserveAspectRatio="none" style={{ width: "100%", height: 40 }}><polyline points={pts} /></svg>
              <small className="hub-m">{dmy(s.latestDate)} · {s.markets} market{s.markets === 1 ? "" : "s"}{s.change7Pct != null ? ` · 7 days ${s.change7Pct > 0 ? "+" : ""}${s.change7Pct}%` : ""}{s.avg30 ? ` · 30-day avg ${kg(s.avg30)}` : ""}</small>
              <p className="ins-say">{s.say}</p>
              <button className="hub-btn sm" onClick={() => setOpen(open === s.commodity ? null : s.commodity)}>{open === s.commodity ? "Hide markets" : "Markets"}</button>
              {open === s.commodity && (
                <div className="ins-tbl"><table><tbody>
                  {(d?.rows || []).filter((r) => r.commodity === s.commodity && r.date === s.latestDate).sort((a, b) => a.modalQtl - b.modalQtl).map((r, i) => (
                    <tr key={i}><td>{r.market}<div className="hub-m small">{r.district} {r.state} · {r.variety}</div></td><td className="r">₹{r.modalQtl}/qtl<div className="hub-m small">{r.minQtl}–{r.maxQtl}</div></td></tr>
                  ))}
                </tbody></table></div>
              )}
            </div>
          );
        })}
      </div>
      {d && !d.signals.length && <p className="hub-m">No prices yet — tap “Get today&apos;s prices”, or add your own rate below.</p>}
      <section className="hub-card">
        <h3>Add a rate you heard (local trader / Bidar APMC)</h3>
        <div className="ins-row">
          <label>Seed <select value={own.commodity} onChange={(e) => setOwn({ ...own, commodity: e.target.value })}>{COMMODITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>₹ per kg <input type="number" inputMode="decimal" value={own.rate} onChange={(e) => setOwn({ ...own, rate: e.target.value })} /></label>
          <label>From <input value={own.market} placeholder="Bidar APMC" onChange={(e) => setOwn({ ...own, market: e.target.value })} /></label>
          <button className="hub-btn primary" disabled={!(Number(own.rate) > 0)} onClick={() => void addOwn()}>Save rate</button>
        </div>
      </section>
      <p className="hub-m small">Source: Agmarknet daily prices on data.gov.in (₹ per quintal; shown per kg). “Buy” = 3%+ below its 30-day average; “Wait” = up 3%+ this week. A guide only.</p>
    </>
  );
}
