"use client";

// Manufacturing quick desk (/mfg) — each barrel is a card with its four steps;
// type the next step's kg and tap Save (date + time are stamped for you). The
// yield maths is NOT re-implemented: it is computeBarrelYield() from
// lib/mfgCalculations.ts, the same function the full Manufacturing desk uses,
// and everything saves through /api/manufacturing so both screens agree.
import { useCallback, useEffect, useMemo, useState } from "react";
import { businessDate } from "@/lib/register";
import { OIL_TYPES, YIELD_BAND_LABELS, computeBarrelYield } from "@/lib/mfgCalculations";
import { STEP_LABELS, dueNote, monthStats, nextStep, suggestNextBarrel, toInput, type BatchLite } from "@/lib/mfgQuick";
import type { MfgBatchDTO } from "@/lib/types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const kg = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${r1(v)} kg`);
const num = (v: string | undefined) => (v === undefined || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const nowIst = () => ({ date: businessDate(Date.now()), time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) });
const STEPS = [1, 2, 3, 4] as const;
type StepNo = (typeof STEPS)[number];
const KEYS: Record<StepNo, "step1Kg" | "step2Kg" | "step3Kg" | "step4Kg"> = { 1: "step1Kg", 2: "step2Kg", 3: "step3Kg", 4: "step4Kg" };

const lite = (b: MfgBatchDTO): BatchLite => ({ ...b, refOilPct: b.refOilPct });

export default function MfgQuick() {
  const today = businessDate(Date.now());
  const [batches, setBatches] = useState<MfgBatchDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // new-barrel form
  const [barrel, setBarrel] = useState("");
  const [oil, setOil] = useState<string>("Karadi oil");
  const [mill, setMill] = useState("");
  const [s1, setS1] = useState({ name: "", kg: "" });
  const [s2, setS2] = useState({ name: "", kg: "" });
  const [two, setTwo] = useState(false);
  const [crude, setCrude] = useState("");
  const [bdate, setBdate] = useState(today);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/manufacturing");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBatches(j.data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load barrels");
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setShowNew(true);
  }, []);
  useEffect(() => {
    if (batches && !barrel) setBarrel(suggestNextBarrel(batches[0]?.barrel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches]);

  const rows = useMemo(
    () => (batches || []).map((b) => ({ b, y: computeBarrelYield(toInput(lite(b))), next: nextStep(b), due: dueNote(lite(b), today) })),
    [batches, today]
  );
  const open = rows.filter((r) => !r.y.complete);
  const done = rows.filter((r) => r.y.complete);
  const stats = useMemo(() => monthStats((batches || []).map(lite), today.slice(0, 7)), [batches, today]);
  const mills = useMemo(() => Array.from(new Set((batches || []).map((b) => b.mill).filter(Boolean) as string[])).slice(0, 8), [batches]);
  const suppliers = useMemo(() => Array.from(new Set((batches || []).flatMap((b) => b.suppliers.map((s) => s.name)).filter(Boolean))).slice(0, 40), [batches]);

  async function create() {
    const sup = [s1, ...(two ? [s2] : [])].map((s) => ({ name: s.name.trim(), seedKg: num(s.kg) || 0 })).filter((s) => s.name || s.seedKg > 0);
    if (!barrel.trim()) return setErr("Give the barrel a label (e.g. A12).");
    if (!sup.some((s) => s.seedKg > 0)) return setErr("Enter the seed weight (kg) and who it came from.");
    setBusy("new");
    setErr(null);
    try {
      const body: Record<string, unknown> = { barrel: barrel.trim(), productItem: oil, mill: mill.trim() || null, date: bdate, suppliers: sup };
      if (num(crude) !== null) body.step1Kg = num(crude);
      const r = await fetch("/api/manufacturing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Barrel ${barrel.trim()} started ✓`);
      setS1({ name: "", kg: "" }); setS2({ name: "", kg: "" }); setTwo(false); setCrude(""); setMill(""); setBarrel("");
      setShowNew(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(null);
  }

  async function saveSteps(b: MfgBatchDTO) {
    const v = inputs[b.id] || {};
    const body: Record<string, unknown> = {};
    const t = nowIst();
    for (const s of STEPS) {
      if (v[`s${s}`] === undefined) continue;
      const n = num(v[`s${s}`]);
      if (n === (b[KEYS[s]] ?? null)) continue;
      body[KEYS[s]] = n;
      // steps 2-4 get today's date + time stamped when first entered
      if (s > 1 && n !== null && !(b as unknown as Record<string, string | null>)[`step${s}Date`]) {
        body[`step${s}Date`] = t.date;
        body[`step${s}Time`] = t.time;
      }
    }
    if (!Object.keys(body).length) return setMsg("Nothing changed.");
    setBusy(b.id);
    setErr(null);
    try {
      const r = await fetch(`/api/manufacturing/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setInputs((cur) => ({ ...cur, [b.id]: {} }));
      setMsg(`Barrel ${b.barrel} saved ✓`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(null);
  }

  const card = (r: (typeof rows)[number]) => {
    const { b, y, next, due } = r;
    const v = inputs[b.id] || {};
    const editing = !y.complete || edit[b.id];
    const flags: string[] = [];
    if (y.massBalanceFlagged) flags.push(`Unaccounted loss ${y.unaccountedLossPct != null ? r1(y.unaccountedLossPct) + "%" : ""} (over 2%) — check`);
    if (y.shortExtraFlagged) flags.push(`${(y.shortExtraOilKg ?? 0) < 0 ? "Short" : "Extra"} oil ${kg(Math.abs(y.shortExtraOilKg ?? 0))} vs expected`);
    if (y.cakeFlagged) flags.push(`Cake gap ${kg(y.cakeGapKg)}`);
    const totalSeed = y.totalSeedKg;
    const state = y.complete ? (flags.length || y.yieldPoor ? "bad" : "ok") : "";
    return (
      <div key={b.id} className={`tly-card ${state}`}>
        <div className="stk-head">
          <div>
            <div className="tly-nm">🛢️ Barrel {b.barrel} · {b.productItem}</div>
            <div className="tly-note">
              {b.date}{b.mill ? ` · ${b.mill}` : ""} · {b.suppliers.map((s) => `${s.name || "?"} ${kg(s.seedKg)}`).join(" + ")} = <b>{kg(totalSeed)}</b> seed
            </div>
          </div>
          <span className={`stk-chip ${y.complete ? (state === "bad" ? "bad" : "ok") : ""}`}>
            {y.complete ? (y.yieldBand ? YIELD_BAND_LABELS[y.yieldBand] : "done") : next ? `step ${next} next` : "open"}
          </span>
        </div>

        {!y.complete && due && <div className={`mq-due ${due.late ? "late" : ""}`}>{due.late ? "⏰ " : "➡ "}{due.text}</div>}

        <div className="mq-steps">
          {STEPS.map((s) => {
            const val = b[KEYS[s]];
            const stamp = s > 1 ? (b as unknown as Record<string, string | null>)[`step${s}Date`] : null;
            const time = s > 1 ? (b as unknown as Record<string, string | null>)[`step${s}Time`] : null;
            return (
              <div key={s} className={`mq-step ${val != null ? "done" : next === s ? "next" : ""}`}>
                <div className="n">{STEP_LABELS[s].en}</div>
                <div className="h">{STEP_LABELS[s].hint}</div>
                {editing ? (
                  <input type="number" inputMode="decimal" aria-label={`${b.barrel} step ${s} kg`} placeholder={val != null ? String(val) : "kg"} value={v[`s${s}`] ?? (val != null ? String(val) : "")} onChange={(e) => setInputs((cur) => ({ ...cur, [b.id]: { ...(cur[b.id] || {}), [`s${s}`]: e.target.value } }))} />
                ) : (
                  <div className="v">{kg(val)}</div>
                )}
                <div className="w">{stamp ? `${stamp}${time ? " " + time : ""}` : " "}</div>
              </div>
            );
          })}
        </div>

        {(y.actualOilKg != null || y.extractionEfficiencyPct != null) && (
          <div className="mq-metrics">
            <div>Oil (2+3)<b>{kg(y.actualOilKg)}</b></div>
            <div>Efficiency<b>{y.extractionEfficiencyPct != null ? `${r1(y.extractionEfficiencyPct)}%` : "—"}</b></div>
            <div>Expected oil<b>{kg(y.systemOilKg)}</b></div>
            <div>Loss<b>{y.unaccountedLossPct != null ? `${r1(y.unaccountedLossPct)}%` : "—"}</b></div>
          </div>
        )}
        {flags.map((f) => <div key={f} className="mq-flag">⚠ {f}</div>)}

        <div className="stk-row">
          {editing && <button className="hub-btn sm" style={{ background: "var(--h-acc)", color: "#fff" }} disabled={busy === b.id} onClick={() => saveSteps(b)}>{busy === b.id ? "Saving…" : "✓ Save steps"}</button>}
          {y.complete && <button className="hub-btn sm" onClick={() => setEdit((cur) => ({ ...cur, [b.id]: !cur[b.id] }))}>{edit[b.id] ? "Close" : "✏️ Edit steps"}</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🏭 Manufacturing</h1>
          <div className="hub-m">Karadi / safflower barrels — start a barrel, enter each step, see the yield.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/go">🔗 Quick links</a>
          <a className="hub-btn" href="/tallies">🧮 Tallies</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>

      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="hub-kpis">
        <div className="hub-kpi b"><div className="l">Open barrels</div><div className="v">{open.length}</div><div className="s">waiting for a step</div></div>
        <div className="hub-kpi"><div className="l">This month</div><div className="v">{stats.barrels}</div><div className="s">{stats.done} finished</div></div>
        <div className="hub-kpi"><div className="l">Seed · Oil (month)</div><div className="v">{stats.seedKg} · {stats.oilKg}</div><div className="s">kg</div></div>
        <div className={`hub-kpi ${stats.flagged ? "r" : "g"}`}><div className="l">Efficiency (finished)</div><div className="v">{stats.efficiencyPct != null ? `${stats.efficiencyPct}%` : "—"}</div><div className="s">{stats.flagged ? `⚠ ${stats.flagged} to check` : "no flags"}</div></div>
      </div>

      <section className="hub-card">
        <div className="hub-card-head">
          <h3>➕ Start a new barrel</h3>
          <div className="hr stk-row"><button className="hub-btn sm" onClick={() => setShowNew(!showNew)}>{showNew ? "Close" : "Open form"}</button></div>
        </div>
        {showNew && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="mq-oil">
              {OIL_TYPES.map((o) => <button key={o} className={oil === o ? "on" : ""} onClick={() => setOil(o)}>{o}</button>)}
            </div>
            <div className="mq-form">
              <div><label>Barrel label</label><input id="mq-barrel" value={barrel} onChange={(e) => setBarrel(e.target.value)} placeholder="A12" /></div>
              <div><label>Date</label><input type="date" value={bdate} max={today} onChange={(e) => e.target.value && setBdate(e.target.value)} /></div>
              <div><label>Mill (optional)</label><input list="mq-mills" value={mill} onChange={(e) => setMill(e.target.value)} /><datalist id="mq-mills">{mills.map((m) => <option key={m} value={m} />)}</datalist></div>
              <div><label>① Crude oil pumped (kg, if known)</label><input type="number" inputMode="decimal" value={crude} onChange={(e) => setCrude(e.target.value)} /></div>
            </div>
            <div className="mq-form">
              <div><label>Seed from — name</label><div className="mq-sup"><input list="mq-sups" value={s1.name} onChange={(e) => setS1({ ...s1, name: e.target.value })} placeholder="Supplier / village" /><input type="number" inputMode="decimal" aria-label="Seed kg" placeholder="kg" value={s1.kg} onChange={(e) => setS1({ ...s1, kg: e.target.value })} /></div></div>
              {two ? (
                <div><label>Second supplier</label><div className="mq-sup"><input list="mq-sups" value={s2.name} onChange={(e) => setS2({ ...s2, name: e.target.value })} /><input type="number" inputMode="decimal" aria-label="Second seed kg" placeholder="kg" value={s2.kg} onChange={(e) => setS2({ ...s2, kg: e.target.value })} /></div></div>
              ) : (
                <div><button className="hub-btn sm" onClick={() => setTwo(true)}>＋ second supplier</button></div>
              )}
              <datalist id="mq-sups">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div><button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} disabled={busy === "new"} onClick={create}>{busy === "new" ? "Saving…" : "✓ Start barrel"}</button></div>
          </div>
        )}
      </section>

      <div className="tly-sec">🟠 Open barrels ({open.length})</div>
      {!batches && !err ? <div className="hub-empty">Loading…</div> : open.length ? <div className="tly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>{open.map(card)}</div> : <div className="hub-empty">No open barrels. Start one above.</div>}

      <div className="tly-sec" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>✅ Finished barrels ({done.length})</span>
        {done.length > 0 && <button className="hub-btn sm" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"}</button>}
      </div>
      {showDone && <div className="tly-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>{done.slice(0, 12).map(card)}</div>}
    </div>
  );
}
