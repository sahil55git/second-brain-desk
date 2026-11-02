"use client";

// 🛰️ Owner command centre: cash, sales, profit, udhaar, stock days, yield, alerts, staff,
// mandi, machines and settling — on one screen, refreshed every minute. Tap a tile to act.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BizData } from "@/lib/bizReports";
import { cashReport, udhaarReport } from "@/lib/bizReports";
import { businessDate } from "@/lib/register";
import { runOut, yieldLots } from "@/lib/insights";
import { profitLoss } from "@/lib/money";
import { anomalies } from "@/lib/ops";
import { COMMODITIES, mandiSignals, type MandiRow, type MandiSignal } from "@/lib/mandi";
import { maintenanceDue, settlingStatus, type OpsRec } from "@/lib/stockOps";
import { useFeatures } from "@/lib/useFeatures";

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

interface Extra { present: number | null; staff: number | null; mandi: MandiSignal[]; recs: OpsRec[]; logs: { date: string; machine: string; kind: string; hours: number | null; note: string | null }[] }

export default function CommandCentre() {
  const today = businessDate(Date.now());
  const f = useFeatures();
  const [d, setD] = useState<BizData | null>(null);
  const [x, setX] = useState<Extra>({ present: null, staff: null, mandi: [], recs: [], logs: [] });
  const [at, setAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    const j = (u: string) => fetch(u).then((r) => r.json()).catch(() => ({}));
    const [hub, att, mandi, recs, logs] = await Promise.all([
      j(`/api/reports/hub?from=${shift(today, -60)}&to=${today}`), j(`/api/attendance?date=${today}`), j("/api/mandi"),
      j("/api/ops-records?kinds=settle,maint_plan"), j(`/api/machines?from=${shift(today, -120)}`),
    ]);
    if (hub.data) setD(hub.data);
    const staff = Array.isArray(att.data) ? att.data : null;
    setX({ present: staff ? staff.filter((s: { att: { status: string } | null }) => s.att && s.att.status !== "A").length : null, staff: staff ? staff.length : null, mandi: mandi.data ? mandiSignals(mandi.data.rows as MandiRow[], COMMODITIES) : [], recs: recs.data || [], logs: logs.data || [] });
    setAt(new Date());
  }, [today]);
  useEffect(() => { void load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const v = useMemo(() => {
    if (!d) return null;
    const span = { from: today, to: today };
    const c = cashReport(d, span);
    const pl = profitLoss(d, span), month = profitLoss(d, { from: `${today.slice(0, 8)}01`, to: today });
    const lots = yieldLots(d, shift(today, -7));
    const yPct = lots.length ? lots.reduce((a, l) => a + l.oilKg, 0) / Math.max(1, lots.reduce((a, l) => a + l.seedKg, 0)) * 100 : null;
    return { c, pl, month, ud: udhaarReport(d, today), ro: runOut(d, today), yPct, lots: lots.length, watch: anomalies(d, today, { days: 2 }) };
  }, [d, today]);
  const settle = useMemo(() => settlingStatus(x.recs, Date.now()), [x.recs, at]); // eslint-disable-line react-hooks/exhaustive-deps
  const maint = useMemo(() => maintenanceDue(x.recs, x.logs, today).filter((m) => m.pct >= 80), [x.recs, x.logs, today]);

  if (!v) return <div className="hub"><p className="hub-m">Loading the command centre…</p></div>;
  const low = v.ro.filter((r) => r.level === "low" || r.level === "out");
  const Tile = ({ href, icon, label, value, sub, tone }: { href: string; icon: string; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" | "warn" }) => (
    <a href={href} className={`hub-card cc-t ${tone || ""}`}><small>{icon} {label}</small><b>{value}</b>{sub && <span className="hub-m small">{sub}</span>}</a>
  );
  return (
    <div className="hub cc">
      <header className="hub-top">
        <div><h1>🛰️ Command centre</h1><div className="hub-m">Live · {at ? at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : ""} · refreshes every minute</div></div>
        <nav className="hub-links"><button className="hub-btn" onClick={() => void load()}>↻ Refresh</button><a className="hub-btn" href="/insights">📈 Insights</a></nav>
      </header>
      <div className="cc-grid">
        <Tile href="/cash" icon="💵" label="Cash in today" value={rs(v.c.cashIn)} sub={`UPI ${rs(v.c.upiIn)} · out ${rs(v.c.cashOut + v.c.upiOut)}`} />
        <Tile href="/insights#pl" icon="💰" label="Profit today" value={rs(v.pl.net)} sub={`Sales ${rs(v.pl.sales)} · month ${rs(v.month.net)}`} tone={v.pl.net >= 0 ? "good" : "bad"} />
        <Tile href="/insights#udhaar" icon="🙌" label="Udhaar out" value={rs(v.ud.outstanding)} sub={`credit given today ${rs(v.c.creditGiven)}`} tone={v.ud.outstanding > 100000 ? "warn" : undefined} />
        <Tile href="/insights#stock" icon="📦" label="Stock" value={low.length ? `${low.length} low` : "OK"} sub={low.slice(0, 3).map((r) => `${r.name} ${r.daysLeft ?? 0}d`).join(" · ") || "every oil has 7+ days"} tone={low.length ? "bad" : "good"} />
        {f.on("yield") && <Tile href="/insights#yield" icon="🌾" label="Yield (7 days)" value={v.yPct == null ? "–" : `${v.yPct.toFixed(1)}%`} sub={`${v.lots} lots`} />}
        {f.on("attendance") && <Tile href="/attendance" icon="🕘" label="Staff today" value={x.staff == null ? "–" : `${x.present}/${x.staff}`} sub="present" tone={x.staff && x.present != null && x.present < x.staff ? "warn" : undefined} />}
        {f.on("watch") && <Tile href="/insights#watch" icon="👀" label="Unusual (2 days)" value={v.watch.length} sub={v.watch[0]?.text || "nothing unusual"} tone={v.watch.some((w) => w.level === "red") ? "bad" : v.watch.length ? "warn" : "good"} />}
        {f.on("mandi") && <Tile href="/insights#mandi" icon="🌾" label="Mandi" value={x.mandi.filter((m) => m.signal === "buy").length ? `${x.mandi.filter((m) => m.signal === "buy").length} to buy` : "steady"} sub={x.mandi.slice(0, 3).map((m) => `${m.commodity} ₹${(m.latest / 100).toFixed(0)}`).join(" · ") || "no prices yet"} />}
        {f.on("settling") && <Tile href="/settling" icon="⏳" label="Settling" value={settle.filter((s) => s.ready).length ? `${settle.filter((s) => s.ready).length} ready` : settle.length ? `${settle.length} running` : "none"} sub={settle[0] ? `${settle[0].tank}: ${settle[0].ready ? "ready" : `${Math.round(settle[0].leftH)} h`}` : ""} tone={settle.some((s) => s.ready) ? "good" : undefined} />}
        {f.on("maintenance") && <Tile href="/maintenance" icon="🔧" label="Maintenance" value={maint.filter((m) => m.overdue).length ? `${maint.filter((m) => m.overdue).length} overdue` : maint.length ? `${maint.length} due soon` : "OK"} sub={maint[0] ? `${maint[0].machine}: ${maint[0].task}` : ""} tone={maint.some((m) => m.overdue) ? "bad" : maint.length ? "warn" : "good"} />}
      </div>
      {v.watch.length > 0 && <section className="hub-card"><h3>👀 Look at now</h3>{v.watch.slice(0, 6).map((w, i) => <a key={i} href={w.path} className="ins-w hub-card" style={{ margin: "4px 0" }}><span className="ins-chip">{w.level === "red" ? "🔴" : "🟠"} {w.area}</span><span>{w.text}</span></a>)}</section>}
      <style>{`
        .cc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr)); gap: 12px; margin-bottom: 14px; }
        .cc-t { display: grid; gap: 4px; margin: 0 !important; text-decoration: none; color: inherit; border-left: 4px solid var(--h-line) !important; min-height: 110px; }
        .cc-t b { font-size: 28px; font-variant-numeric: tabular-nums; line-height: 1.1; }
        .cc-t.good { border-left-color: var(--h-g) !important; } .cc-t.bad { border-left-color: var(--h-r) !important; } .cc-t.warn { border-left-color: var(--h-o) !important; }
      `}</style>
    </div>
  );
}
