"use client";

// Tally hub (/tallies) — six count desks in one window. All maths comes from
// lib/tallyDesks.ts (the same functions the API uses to store the result);
// expected figures are fetched from /api/tallies, computed on the server from
// the books. Saving again for the same desk + day replaces that day's count.
import { useCallback, useEffect, useMemo, useState } from "react";
import { businessDate } from "@/lib/register";
import { download, excelBlob, type ExportTable } from "@/lib/exporters";
import { DESKS, deskMeta, expectedFor, gapMessage, gapOf, isGapFlagged, isLow, tankKg, type DeskId, type RowDef, type RowInput } from "@/lib/tallyDesks";

interface Saved { savedAt: string; by: string; rows: Record<string, RowInput & { label?: string; expected?: number | null; gap?: number | null; flagged?: boolean }> }
interface DeskApi { rows: RowDef[]; priorDate: string | null; saved: Saved | null }
type Vals = Record<string, { counted: string; received: string; used: string; min: string; dip: string; kgPerCm: string }>;

const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : unit === "₹" ? "₹" + Math.round(v).toLocaleString("en-IN") : `${r2(v)}${unit ? " " + unit : ""}`);
const n = (v: string | undefined) => (v === undefined || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const dayMinus = (k: number) => businessDate(Date.now() - k * 86400000);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const empty = { counted: "", received: "", used: "", min: "", dip: "", kgPerCm: "" };
const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default function TalliesDesk({ initialDate, initialDesk }: { initialDate?: string; initialDesk?: DeskId }) {
  const today = businessDate(Date.now());
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [desk, setDesk] = useState<DeskId>(initialDesk || "JOBWORK");
  const [api, setApi] = useState<DeskApi | null>(null);
  const [status, setStatus] = useState<Record<string, { savedAt: string; flagged: number }>>({});
  const [vals, setVals] = useState<Vals>({});
  const [extra, setExtra] = useState<RowDef[]>([]);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<"customer" | "supplier">("customer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meta = deskMeta(desk)!;
  const backDated = date < today;

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/tallies?date=${date}`);
      const j = await r.json();
      if (r.ok) setStatus(j.data.status || {});
    } catch {
      /* status strip is optional */
    }
  }, [date]);
  const load = useCallback(async () => {
    setApi(null);
    try {
      const r = await fetch(`/api/tallies?desk=${desk}&date=${date}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const d: DeskApi = j.data;
      setApi(d);
      setErr(null);
      // prefill from what is saved for this desk + day; carry reorder levels / kg-per-cm
      const v: Vals = {};
      const custom: RowDef[] = [];
      for (const def of d.rows) v[def.key] = { ...empty, min: s(def.min), kgPerCm: s(def.kgPerCm) };
      for (const [key, sr] of Object.entries(d.saved?.rows || {})) {
        v[key] = { counted: s(sr.counted), received: s(sr.received), used: s(sr.used), min: s(sr.min), dip: s(sr.dip), kgPerCm: s(sr.kgPerCm) };
        if (sr.custom && !d.rows.find((x) => x.key === key)) custom.push({ key, label: sr.label || key, unit: sr.unit || meta.unit, group: sr.group, custom: true, expected: null, prev: null, autoIn: 0, autoOut: 0 });
      }
      setVals(v);
      setExtra(custom);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    }
  }, [desk, date, meta.unit]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const defs: RowDef[] = useMemo(() => [...(api?.rows || []), ...extra.filter((e) => !(api?.rows || []).some((r) => r.key === e.key))], [api, extra]);

  const view = defs.map((def) => {
    const v = vals[def.key] || empty;
    const inp: RowInput = { counted: n(v.counted), received: n(v.received), used: n(v.used), min: n(v.min), dip: n(v.dip), kgPerCm: n(v.kgPerCm) };
    const counted = desk === "TANK" ? tankKg(inp) : inp.counted ?? null;
    const expected = expectedFor(meta.mode, def, { ...inp, counted });
    const gap = gapOf(expected, counted);
    const flag = isGapFlagged(desk, expected, counted);
    const low = desk === "PACK" && isLow(counted, inp.min);
    return { def, v, inp, counted, expected, gap, flag, low };
  });
  const done = view.filter((r) => r.counted !== null).length;
  const flagged = view.filter((r) => r.flag).length;
  const lows = view.filter((r) => r.low).length;
  const totCounted = r2(view.reduce((a, r) => a + (r.counted ?? 0), 0));
  const totExpected = r2(view.reduce((a, r) => a + (r.expected ?? 0), 0));

  const set = (key: string, field: keyof Vals[string], value: string) =>
    setVals((cur) => ({ ...cur, [key]: { ...(cur[key] || empty), [field]: value } }));

  function addRow() {
    const label = newName.trim();
    if (!label) return;
    const key = `x:${label.toLowerCase().replace(/[^\w ]+/g, "").slice(0, 40)}`;
    if (!defs.some((d) => d.key === key || d.label.toLowerCase() === label.toLowerCase())) setExtra((cur) => [...cur, { key, label, unit: meta.unit, group: desk === "UDHAR" ? newGroup : undefined, custom: true, expected: null, prev: null, autoIn: 0, autoOut: 0 }]);
    setNewName("");
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const rows: Record<string, unknown> = {};
      for (const r of view) {
        rows[r.def.key] = { counted: r.inp.counted, received: r.inp.received, used: r.inp.used, min: r.inp.min, dip: r.inp.dip, kgPerCm: r.inp.kgPerCm, ...(r.def.custom ? { label: r.def.label, unit: r.def.unit, group: r.def.group, custom: true } : {}) };
      }
      const res = await fetch("/api/tallies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk, date, rows }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg(`Saved ✓ ${meta.title} — ${j.data.counted} counted${j.data.flagged ? ` · ⚠️ ${j.data.flagged} gap${j.data.flagged === 1 ? "" : "s"} to check` : " · no gaps"}`);
      setErr(null);
      await Promise.all([load(), loadStatus()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(false);
  }

  async function exportXlsx() {
    const t: ExportTable = {
      title: meta.title.slice(0, 28),
      cols: [
        { key: "n", label: "Item" }, { key: "g", label: "Group" },
        { key: "e", label: `Expected (${meta.unit})`, num: true, sum: true },
        { key: "c", label: `Counted (${meta.unit})`, num: true, sum: true },
        { key: "d", label: "Gap", num: true },
        { key: "f", label: "Flag" },
      ],
      rows: view.filter((r) => r.counted !== null).map((r) => ({ n: r.def.label, g: r.def.group || "", e: r.expected, c: r.counted, d: r.gap, f: r.flag ? "CHECK" : r.low ? "LOW" : "" })),
    };
    download(`${desk.toLowerCase()}-tally_${date}.xlsx`, await excelBlob([t]));
  }

  const card = (r: (typeof view)[number]) => {
    const { def, v } = r;
    const state = r.counted === null ? "" : r.flag ? "bad" : r.low ? "low" : "ok";
    const u = def.unit;
    return (
      <div key={def.key} className={`tly-card ${state}`}>
        <div className="stk-head">
          <div>
            <div className="tly-nm">{def.label}</div>
            {def.note && <div className="tly-note">{def.note}</div>}
          </div>
          <span className={`stk-chip ${state === "bad" ? "bad" : state === "ok" ? "ok" : ""}`}>
            {r.counted === null ? "not counted" : r.flag ? "⚠ check" : r.low ? "LOW" : "ok"}
          </span>
        </div>

        {meta.mode === "flow" ? (
          <div className="tly-facts">
            <div>Last count<b>{f(def.prev)}</b></div>
            <div>In<b>{f(r2(def.autoIn + (r.inp.received || 0)))}</b></div>
            <div>Used<b>{f(r2(def.autoOut + (r.inp.used || 0)))}</b></div>
            <div>Expected<b>{f(r.expected)}</b></div>
          </div>
        ) : (
          <div className="tly-facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>{desk === "UDHAR" ? "Register says" : desk === "TANK" ? "Book stock" : "Challans show"}<b>{f(r.expected, u)}</b></div>
            <div>Gap<b className={r.flag ? "r" : r.gap !== null ? "g" : ""}>{r.gap === null ? "—" : (r.gap > 0 ? "+" : "") + f(r.gap, u)}</b></div>
          </div>
        )}

        {desk === "TANK" ? (
          <div className="tly-in">
            <div><label>Dip (cm)</label><input type="number" inputMode="decimal" value={v.dip} onChange={(e) => { set(def.key, "dip", e.target.value); set(def.key, "counted", ""); }} /></div>
            <div><label>kg per cm</label><input type="number" inputMode="decimal" value={v.kgPerCm} onChange={(e) => set(def.key, "kgPerCm", e.target.value)} /></div>
            <div><label>or kg directly</label><input type="number" inputMode="decimal" value={v.counted} onChange={(e) => set(def.key, "counted", e.target.value)} /></div>
          </div>
        ) : (
          <div className={`tly-in ${meta.mode === "flow" ? (desk === "PACK" ? "" : "") : "one"}`}>
            <div>
              <label>Counted now ({u})</label>
              <input className="big" id={`t-${def.key}`} type="number" inputMode="decimal" value={v.counted} onChange={(e) => set(def.key, "counted", e.target.value)} />
            </div>
            {meta.mode === "flow" && (
              <>
                <div><label>+ Received</label><input type="number" inputMode="decimal" value={v.received} onChange={(e) => set(def.key, "received", e.target.value)} /></div>
                <div><label>− Used / sold</label><input type="number" inputMode="decimal" value={v.used} onChange={(e) => set(def.key, "used", e.target.value)} /></div>
              </>
            )}
          </div>
        )}
        {meta.mode === "flow" && def.prev === null && <div className="tly-note">First count for this item — it becomes the starting point; gaps show from the next count.</div>}
        {desk === "TANK" && r.counted !== null && <div className="tly-note">Counted = <b>{f(r.counted, "kg")}</b></div>}
        {desk === "PACK" && (
          <div className="tly-in one"><div><label>Reorder level (alert at or below)</label><input type="number" inputMode="numeric" value={v.min} onChange={(e) => set(def.key, "min", e.target.value)} /></div></div>
        )}
        {r.flag && <div className="tly-msg">{gapMessage(desk, r.gap)}</div>}
        {r.low && <div className="tly-msg" style={{ color: "#b97400" }}>Stock is at or below the reorder level — order more.</div>}
      </div>
    );
  };

  const groups = desk === "UDHAR" ? ([["customer", "👥 Customers who owe you"], ["supplier", "🚚 Suppliers you owe"]] as const) : null;

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🧮 Tally hub</h1>
          <div className="hub-m">Count it, compare it with the books, see the gap — for customer stock, seed, cake, packaging, balances and tanks.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href={`/stock?date=${date}`}>📦 Oil stock</a>
          <a className="hub-btn" href={`/cash?date=${date}`}>💵 Cash</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>

      <div className="stk-bar">
        <div className="stk-seg" role="tablist" aria-label="Day">
          <button className={date === today ? "on" : ""} onClick={() => setDate(today)}>Today</button>
          <button className={date === dayMinus(1) ? "on" : ""} onClick={() => setDate(dayMinus(1))}>Yesterday</button>
        </div>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
      </div>

      <div className="tly-tabs" role="tablist">
        {DESKS.map((d) => {
          const st = status[d.id];
          return (
            <button key={d.id} role="tab" aria-selected={desk === d.id} className={`tly-tab ${desk === d.id ? "on" : ""} ${st ? "done" : ""} ${st?.flagged ? "bad" : ""}`} onClick={() => { setMsg(null); setDesk(d.id); }}>
              {d.icon} {d.title}
              <small>{st ? (st.flagged ? `⚠ ${st.flagged} gap${st.flagged === 1 ? "" : "s"} · ${hm(st.savedAt)}` : `✓ saved ${hm(st.savedAt)}`) : "not done"}</small>
            </button>
          );
        })}
      </div>

      {backDated && (
        <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>🕘 Late entry — you are counting for <b>{date}</b>, not today. Expected figures are worked out as of that day.</div>
      )}
      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="hub-kpis">
        <div className="hub-kpi b"><div className="l">Counted</div><div className="v">{done}/{defs.length}</div></div>
        <div className={`hub-kpi ${flagged ? "r" : "g"}`}><div className="l">Gaps to check</div><div className="v">{flagged}</div>{desk === "PACK" && lows > 0 && <div className="s">{lows} low on stock</div>}</div>
        <div className="hub-kpi"><div className="l">Total counted</div><div className="v">{f(totCounted, meta.unit)}</div></div>
        {meta.mode === "direct" && <div className="hub-kpi"><div className="l">Total per books</div><div className="v">{f(totExpected, meta.unit)}</div></div>}
      </div>

      <section className="hub-card">
        <div className="hub-card-head">
          <h3>{meta.icon} {meta.title}</h3>
          <div className="hr stk-row">
            <button className="hub-btn sm" onClick={exportXlsx} disabled={!done}>⬇ Excel</button>
            <button className="hub-btn sm" onClick={load}>↻ Refresh</button>
          </div>
        </div>
        <p className="tly-hint">{meta.hint}{api?.priorDate && meta.mode === "flow" ? ` Last count: ${api.priorDate}.` : ""}</p>

        {!api && !err ? (
          <div className="hub-empty">Loading…</div>
        ) : defs.length === 0 && !meta.canAdd ? (
          <div className="hub-empty">Nothing to count.</div>
        ) : groups ? (
          groups.map(([g, title]) => {
            const list = view.filter((r) => (r.def.group || "customer") === g);
            return (
              <div key={g}>
                <div className="tly-sec">{title}</div>
                {list.length ? <div className="tly-grid">{list.map(card)}</div> : <div className="hub-empty">None on the books. Add a party below if one confirms a balance.</div>}
              </div>
            );
          })
        ) : view.length ? (
          <div className="tly-grid">{view.map(card)}</div>
        ) : (
          <div className="hub-empty">{desk === "JOBWORK" ? "No open job-work challans — if customer seed is lying in the shop anyway, add the customer below (that is unrecorded stock)." : "Nothing here yet — add a row below."}</div>
        )}

        {meta.canAdd && (
          <div className="tly-add">
            <input type="text" placeholder={desk === "JOBWORK" ? "Add customer name…" : desk === "UDHAR" ? "Add party name…" : desk === "TANK" ? "Add tank name…" : "Add item…"} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRow()} />
            {desk === "UDHAR" && (
              <div className="stk-seg">
                <button className={newGroup === "customer" ? "on" : ""} onClick={() => setNewGroup("customer")}>Customer</button>
                <button className={newGroup === "supplier" ? "on" : ""} onClick={() => setNewGroup("supplier")}>Supplier</button>
              </div>
            )}
            <button className="hub-btn sm" onClick={addRow} disabled={!newName.trim()}>＋ Add</button>
          </div>
        )}

        <div className="stk-sticky">
          <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} onClick={save} disabled={busy || !done}>
            {busy ? "Saving…" : `✓ Save ${meta.title}`}
          </button>
          <span className="hub-m">
            {done}/{defs.length} counted{flagged ? ` · ⚠️ ${flagged} gap${flagged === 1 ? "" : "s"}` : done ? " · no gaps" : ""}
            {api?.saved ? ` · last saved ${hm(api.saved.savedAt)} by ${api.saved.by || "—"} — saving again replaces it` : ""}
          </span>
        </div>
      </section>
    </div>
  );
}
