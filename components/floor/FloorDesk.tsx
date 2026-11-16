"use client";

// 🏭 Shop-floor desk: seed godown, packing material + BOM, tank dipstick, cycle count,
// maintenance + spares, settling timers. One component, one tab per page (/godown, /packing, /dip,
// /count, /maintenance, /settling). Numbers from lib/stockOps.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { businessDate } from "@/lib/register";
import { TANKS } from "@/lib/stockTanks";
import { STOCK_PRODUCTS } from "@/lib/calculations";
import { bomCosts, cycleItems, cycleResults, cylinderKg, dipToKg, godownStacks, maintenanceDue, packingStock, settlingStatus, sparesStock, type OpsRec } from "@/lib/stockOps";
import { nextLot, packRuns } from "@/lib/packLot";
import { FeatureGate } from "@/lib/useFeatures";

export type FloorTab = "godown" | "packing" | "dip" | "count" | "maintenance" | "settling";
const META: Record<FloorTab, { icon: string; title: string; feature: string; kinds: string[]; desc: string }> = {
  godown: { icon: "🏚️", title: "Seed godown", feature: "godown", kinds: ["godown_in", "godown_out", "godown_check"], desc: "Bags in and out by stack, moisture, oldest first" },
  packing: { icon: "🏷️", title: "Packing material", feature: "packing", kinds: ["pack_item", "pack_move", "pack_bom", "pack_run"], desc: "Bottles, caps, labels, tins — stock, BOM and cost per SKU" },
  dip: { icon: "📏", title: "Tank dipstick", feature: "dipstick", kinds: ["dip_chart", "dip_read"], desc: "Dip in cm → kg in the tank" },
  count: { icon: "🔁", title: "Cycle count", feature: "cycleCount", kinds: ["cycle_count", "pack_item", "pack_move", "pack_bom", "pack_run"], desc: "Count 3 things every day instead of a big stocktake" },
  maintenance: { icon: "🔧", title: "Maintenance & spares", feature: "maintenance", kinds: ["maint_plan", "spare", "spare_move"], desc: "When each machine job is due; spare parts in hand" },
  settling: { icon: "⏳", title: "Settling tanks", feature: "settling", kinds: ["settle"], desc: "When a tank is ready to decant" },
};
const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("-") : "–");
const n = (v: string) => (v.trim() === "" ? null : Number(v));

function useRecs(kinds: string[]) {
  const [recs, setRecs] = useState<OpsRec[]>([]);
  const key = kinds.join(",");
  const load = useCallback(() => fetch(`/api/ops-records?kinds=${key}`).then((r) => r.json()).then((j) => setRecs(j.data || [])).catch(() => {}), [key]);
  useEffect(() => { void load(); }, [load]);
  const add = async (kind: string, data: Record<string, unknown>, ref?: string | null, date?: string) => {
    const r = await fetch("/api/ops-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, date: date || businessDate(Date.now()), ref: ref ?? null, data }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) void load();
    return r.ok ? null : j.error || "Could not save.";
  };
  const patch = async (id: string, body: Record<string, unknown>) => { await fetch("/api/ops-records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }); void load(); };
  return { recs, add, patch, load };
}

function Form({ fields, onSave, label = "Save" }: { fields: { k: string; label: string; type?: string; options?: string[]; ph?: string }[]; onSave: (v: Record<string, string>) => Promise<string | null>; label?: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="fl-form">
      {fields.map((f) => (
        <label key={f.k}>{f.label}
          {f.options ? (
            <select value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
          ) : f.type === "area" ? (
            <textarea rows={3} placeholder={f.ph} value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
          ) : (
            <input type={f.type || "text"} inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.ph} value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} list={f.options ? undefined : `dl-${f.k}`} />
          )}
        </label>
      ))}
      <button className="hub-btn primary" onClick={async () => { const e = await onSave(v); setMsg(e || "Saved ✓"); if (!e) setV({}); setTimeout(() => setMsg(null), 2500); }}>{label}</button>
      {msg && <span className="hub-m">{msg}</span>}
    </div>
  );
}

export default function FloorDesk({ tab }: { tab: FloorTab }) {
  const m = META[tab];
  return (
    <FeatureGate k={m.feature}>
      <div className="hub fl">
        <header className="hub-top">
          <div><h1>{m.icon} {m.title}</h1><div className="hub-m">{m.desc}</div></div>
          <nav className="hub-links">{(Object.keys(META) as FloorTab[]).filter((k) => k !== tab).map((k) => <a key={k} className="hub-btn sm" href={`/${k}`}>{META[k].icon} {META[k].title}</a>)}</nav>
        </header>
        {tab === "godown" && <Godown />}
        {tab === "packing" && <Packing />}
        {tab === "dip" && <Dip />}
        {tab === "count" && <Count />}
        {tab === "maintenance" && <Maintenance />}
        {tab === "settling" && <Settling />}
        <style>{`
          .fl-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr)); gap: 8px; align-items: end; }
          .fl-form label { display: grid; gap: 4px; font-size: 13px; }
          .fl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 10px; margin: 10px 0; }
          .fl-card { margin: 0 !important; display: grid; gap: 4px; border-left: 4px solid var(--h-line) !important; }
          .fl-card.warn { border-left-color: var(--h-o) !important; } .fl-card.bad { border-left-color: var(--h-r) !important; } .fl-card.good { border-left-color: var(--h-g) !important; }
          .fl-big { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
          .fl-bar { height: 10px; border-radius: 5px; background: color-mix(in srgb, currentColor 10%, transparent); overflow: hidden; }
          .fl-bar i { display: block; height: 100%; background: var(--h-acc); }
          .fl-tbl { overflow-x: auto; } .fl-tbl table { width: 100%; border-collapse: collapse; font-size: 14px; }
          .fl-tbl td, .fl-tbl th { padding: 6px 8px; border-bottom: 1px solid var(--h-line); text-align: left; } .fl-tbl .r { text-align: right; }
        `}</style>
      </div>
    </FeatureGate>
  );
}

function Godown() {
  const { recs, add } = useRecs(META.godown.kinds);
  const today = businessDate(Date.now());
  const stacks = useMemo(() => godownStacks(recs, today), [recs, today]);
  const names = stacks.map((s) => s.stack);
  const total = stacks.reduce((a, s) => a + s.kgLeft, 0);
  return (
    <>
      <div className="hub-banner">🏚️ {stacks.length} stacks · {Math.round(total).toLocaleString("en-IN")} kg seed in the godown{stacks.some((s) => s.warn) ? ` · ⚠️ ${stacks.filter((s) => s.warn).length} need attention` : ""}</div>
      <div className="fl-cards">
        {stacks.map((s) => (
          <div key={s.stack} className={`hub-card fl-card ${s.warn ? "warn" : s.fifo ? "good" : ""}`}>
            <b>Stack {s.stack} · {s.seed}</b>
            <span className="fl-big">{s.bagsLeft} bags</span>
            <small className="hub-m">{Math.round(s.kgLeft)} kg · in {dmy(s.inDate)} ({s.ageDays} d) · {s.supplier}</small>
            <div className="fl-bar"><i style={{ width: `${Math.max(0, Math.min(100, (s.kgLeft / Math.max(1, s.kgIn)) * 100))}%` }} /></div>
            {s.moistureNow != null && <small>Moisture {s.moistureIn}% → {s.moistureNow}%{s.shrinkKg ? ` · drying loss ≈ ${s.shrinkKg} kg` : ""}</small>}
            {s.valueInr != null && <small className="hub-m">Worth ≈ ₹{s.valueInr.toLocaleString("en-IN")}</small>}
            {s.fifo && <small className="good">✅ Use this one first (oldest {s.seed})</small>}
            {s.warn && <small className="bad">⚠️ {s.warn}</small>}
          </div>
        ))}
      </div>
      <datalist id="dl-stack">{names.map((x) => <option key={x} value={x} />)}</datalist>
      <section className="hub-card"><h3>➕ Bags in</h3>
        <Form fields={[{ k: "stack", label: "Stack / place", ph: "A1" }, { k: "seed", label: "Seed", ph: "Groundnut" }, { k: "supplier", label: "Supplier" }, { k: "bags", label: "Bags", type: "number" }, { k: "kg", label: "Total kg", type: "number" }, { k: "moisturePct", label: "Moisture %", type: "number" }, { k: "rate", label: "₹ / kg", type: "number" }]}
          onSave={(v) => (!v.stack || !n(v.kg || "") ? Promise.resolve("Stack and kg are needed.") : add("godown_in", { ...v, bags: n(v.bags || "") ?? 0, kg: n(v.kg), moisturePct: n(v.moisturePct || ""), rate: n(v.rate || "") }, v.stack))} />
      </section>
      <section className="hub-card"><h3>➖ Bags out (to crushing / sold)</h3>
        <Form fields={[{ k: "stack", label: "Stack" }, { k: "bags", label: "Bags", type: "number" }, { k: "kg", label: "kg", type: "number" }, { k: "to", label: "To", ph: "Expeller 1" }]}
          onSave={(v) => (!v.stack ? Promise.resolve("Which stack?") : add("godown_out", { ...v, bags: n(v.bags || "") ?? 0, kg: n(v.kg || "") ?? 0 }, v.stack))} />
      </section>
      <section className="hub-card"><h3>💧 Moisture check</h3>
        <Form fields={[{ k: "stack", label: "Stack" }, { k: "moisturePct", label: "Moisture %", type: "number" }, { k: "note", label: "Note" }]}
          onSave={(v) => (!v.stack || n(v.moisturePct || "") == null ? Promise.resolve("Stack and moisture needed.") : add("godown_check", { ...v, moisturePct: n(v.moisturePct) }, v.stack))} />
      </section>
    </>
  );
}

function Packing() {
  const { recs, add } = useRecs(META.packing.kinds);
  const today = businessDate(Date.now());
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (session?.user as any)?.role === "OWNER";
  const stock = useMemo(() => packingStock(recs, today), [recs, today]);
  const boms = useMemo(() => bomCosts(recs), [recs]);
  const runs = useMemo(() => packRuns(recs.filter((r) => r.kind === "pack_run")), [recs]);
  return (
    <>
      {stock.filter((s) => s.low).map((s) => <div key={s.name} className="hub-banner">🟠 <b>{s.name}</b> is low: {s.stock} {s.unit} left{s.daysLeft != null ? ` (~${s.daysLeft} days)` : ""} — reorder.</div>)}
      <div className="fl-tbl hub-card"><table>
        <thead><tr><th>Item</th><th className="r">In stock</th><th className="r">Reorder at</th><th className="r">Used / day</th><th className="r">Days left</th><th className="r">Cost</th></tr></thead>
        <tbody>{stock.map((s) => <tr key={s.name}><td><b>{s.name}</b></td><td className={`r ${s.low ? "bad" : ""}`}>{s.stock} {s.unit}</td><td className="r">{s.reorder}</td><td className="r">{s.usedPerDay}</td><td className="r">{s.daysLeft ?? "–"}</td><td className="r">₹{s.cost}</td></tr>)}</tbody>
      </table></div>
      <datalist id="dl-name">{stock.map((s) => <option key={s.name} value={s.name} />)}</datalist>
      <datalist id="dl-sku">{boms.map((b) => <option key={b.sku} value={b.sku} />)}</datalist>
      <section className="hub-card"><h3>📦 Packed today (deducts the BOM, gives a lot number)</h3>
        <Form fields={[{ k: "sku", label: "Product / SKU", ph: "Karadi 1L" }, { k: "units", label: "Units packed", type: "number" }, { k: "oilKg", label: "Oil used (kg)", type: "number" }, { k: "fromTank", label: "Oil taken from", options: TANKS.map((t) => t.name) }]}
          onSave={(v) => (!v.sku || !n(v.units || "") ? Promise.resolve("SKU and units needed.") : add("pack_run", { sku: v.sku, units: n(v.units), lot: nextLot(v.sku, today, runs.map((r) => r.lot)), oilKg: n(v.oilKg || "") ?? null, fromTank: v.fromTank || null }, v.sku))} />
        {runs.length > 0 && (
          <div className="fl-tbl"><table>
            <thead><tr><th>Date</th><th>Lot</th><th>Product</th><th className="r">Units</th><th className="r">Oil kg</th><th>From</th></tr></thead>
            <tbody>{runs.slice(0, 30).map((r) => <tr key={r.id}><td>{r.date}</td><td><b>{r.lot ?? "–"}</b></td><td>{r.sku}</td><td className="r">{r.units}</td><td className="r">{r.oilKg ?? "–"}</td><td>{r.fromTank ?? "–"}</td></tr>)}</tbody>
          </table></div>
        )}
        <small className="hub-m">Write the lot number on the carton or label. It ties each pack to the day, the oil used and the tank it came from.</small>
      </section>
      <section className="hub-card"><h3>🔄 Material in / out</h3>
        <Form fields={[{ k: "name", label: "Item" }, { k: "qty", label: "Qty (+ in, − out)", type: "number" }, { k: "note", label: "Note" }]}
          onSave={(v) => (!v.name || !n(v.qty || "") ? Promise.resolve("Item and qty needed.") : add("pack_move", { name: v.name, qty: n(v.qty), note: v.note || "" }, v.name))} />
      </section>
      <section className="hub-card"><h3>🧾 Cost per unit (BOM)</h3>
        <div className="fl-cards">{boms.map((b) => (
          <div key={b.sku} className="hub-card fl-card"><b>{b.sku}</b><span className="fl-big">₹{b.cost}</span>
            <small className="hub-m">{b.parts.map((p) => `${p.qty}× ${p.name} ₹${p.cost}`).join(" · ")}</small>
            {b.missing.length > 0 && <small className="bad">No cost for: {b.missing.join(", ")}</small>}</div>
        ))}</div>
        {owner && <>
          <h4>New item</h4>
          <Form fields={[{ k: "name", label: "Name", ph: "1L bottle" }, { k: "unit", label: "Unit", ph: "pcs" }, { k: "cost", label: "₹ each", type: "number" }, { k: "opening", label: "Stock now", type: "number" }, { k: "reorder", label: "Reorder at", type: "number" }]}
            onSave={(v) => (!v.name ? Promise.resolve("Name needed.") : add("pack_item", { name: v.name, unit: v.unit || "pcs", cost: n(v.cost || "") ?? 0, opening: n(v.opening || "") ?? 0, reorder: n(v.reorder || "") ?? 0 }, v.name))} />
          <h4>New BOM</h4>
          <Form fields={[{ k: "sku", label: "SKU", ph: "Ekatva 1L" }, { k: "parts", label: "Parts (one per line: qty name)", type: "area", ph: "1 1L bottle\n1 Cap\n1 Label\n0.0833 Carton (12)" }]}
            onSave={(v) => {
              const parts = (v.parts || "").split("\n").map((l) => /^\s*(\d+(?:\.\d+)?)\s+(.+)$/.exec(l)).filter(Boolean).map((x) => ({ qty: Number(x![1]), name: x![2].trim() }));
              return !v.sku || !parts.length ? Promise.resolve("SKU and parts needed.") : add("pack_bom", { sku: v.sku, parts }, v.sku);
            }} />
        </>}
      </section>
    </>
  );
}

function Dip() {
  const { recs, add } = useRecs(META.dip.kinds);
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (session?.user as any)?.role === "OWNER";
  const [tank, setTank] = useState(TANKS[0]?.key || "");
  const [cm, setCm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const charts = useMemo(() => {
    const c: Record<string, { points: { cm: number; kg: number }[]; diameterCm?: number; lyingLengthCm?: number }> = {};
    for (const r of recs) if (r.kind === "dip_chart") c[r.ref || ""] = r.data as { points: { cm: number; kg: number }[] };
    return c;
  }, [recs]);
  const ch = charts[tank];
  const kg = ch && cm ? (ch.points?.length ? dipToKg(ch.points, Number(cm)) : ch.diameterCm ? cylinderKg({ diameterCm: ch.diameterCm, lyingLengthCm: ch.lyingLengthCm }, Number(cm)) : null) : null;
  const t = TANKS.find((x) => x.key === tank);
  const last = [...recs].reverse().filter((r) => r.kind === "dip_read").slice(0, 15);
  return (
    <>
      <section className="hub-card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{TANKS.map((x) => <button key={x.key} className={`hub-btn sm${tank === x.key ? " primary" : ""}`} onClick={() => setTank(x.key)}>{x.name}</button>)}</div>
        <div className="fl-form" style={{ marginTop: 10 }}>
          <label>Dip (cm)<input type="number" inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value)} /></label>
          <div><div className="fl-big">{kg != null ? `${kg} kg` : "–"}</div>{t && kg != null && <small className="hub-m">{Math.round((kg / t.capKg) * 100)}% of {t.capKg} kg</small>}</div>
          <button className="hub-btn primary" disabled={kg == null} onClick={async () => { const e = await add("dip_read", { tank, cm: Number(cm), kg }, tank); setMsg(e || "Saved ✓"); }}>Save reading</button>
          {msg && <span className="hub-m">{msg}</span>}
        </div>
        {!ch && <p className="hub-m">No chart for this tank yet{owner ? " — add one below" : " — ask the owner to add it"}.</p>}
      </section>
      <section className="hub-card"><h3>Recent readings</h3>
        {last.map((r) => <div key={r.id} className="hub-m">{dmy(r.date)} · {TANKS.find((x) => x.key === r.ref)?.name || r.ref}: {String(r.data.cm)} cm → <b>{String(r.data.kg)} kg</b></div>)}
      </section>
      {owner && (
        <section className="hub-card"><h3>Tank chart for {t?.name}</h3>
          <p className="hub-m small">Either calibration points (fill known kg, note the dip), or the tank size for a round tank.</p>
          <Form label="Save chart" fields={[{ k: "points", label: "Points (one per line: cm = kg)", type: "area", ph: "10 = 95\n50 = 480\n100 = 960" }, { k: "diameterCm", label: "…or round tank diameter cm", type: "number" }, { k: "lyingLengthCm", label: "length cm (if lying flat)", type: "number" }]}
            onSave={(v) => {
              const points = (v.points || "").split("\n").map((l) => /^\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/.exec(l)).filter(Boolean).map((x) => ({ cm: Number(x![1]), kg: Number(x![2]) }));
              return !points.length && !n(v.diameterCm || "") ? Promise.resolve("Points or diameter needed.") : add("dip_chart", { points, diameterCm: n(v.diameterCm || ""), lyingLengthCm: n(v.lyingLengthCm || "") }, tank);
            }} />
        </section>
      )}
    </>
  );
}

function Count() {
  const { recs, add } = useRecs(META.count.kinds);
  const today = businessDate(Date.now());
  const [book, setBook] = useState<Record<string, number | null>>({});
  useEffect(() => {
    fetch(`/api/register/stock?date=${today}`).then((r) => r.json()).then((st) => {
      const s = st.data;
      if (!s) return;
      const out: Record<string, number | null> = {};
      for (const p of STOCK_PRODUCTS) {
        const v = s.sessions?.NIGHT?.stock?.[p.key]?.today ?? s.sessions?.AFTERNOON?.stock?.[p.key]?.today ?? s.yesterday?.NIGHT?.[p.key] ?? s.yesterday?.AFTERNOON?.[p.key];
        out[p.label] = typeof v === "number" ? v : null;
      }
      setBook(out);
    }).catch(() => {});
  }, [today]);
  const pack = useMemo(() => packingStock(recs, today), [recs, today]);
  const books = useMemo(() => { const b: Record<string, number | null> = { ...book }; for (const p of pack) if (b[p.name] === undefined) b[p.name] = p.stock; return b; }, [book, pack]);
  const all = Object.keys(books);
  const done = useMemo(() => cycleResults(recs), [recs]);
  const pick = useMemo(() => cycleItems(all, today, done.map((x) => ({ item: x.item, date: x.date }))), [all.join("|"), today, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cnt, setCnt] = useState<Record<string, string>>({});
  const todayDone = done.filter((x) => x.date === today);
  return (
    <>
      <div className="hub-banner">🔁 Today count these {pick.length}: <b>{pick.join(" · ") || "—"}</b>. Everything gets counted in turn — no big stocktake needed.</div>
      <div className="fl-cards">{pick.map((it) => (
        <div key={it} className="hub-card fl-card">
          <b>{it}</b><small className="hub-m">Books say: {books[it] ?? "?"}</small>
          <input type="number" inputMode="decimal" placeholder="Counted" value={cnt[it] ?? ""} onChange={(e) => setCnt({ ...cnt, [it]: e.target.value })} />
          <button className="hub-btn sm primary" disabled={!cnt[it]} onClick={() => void add("cycle_count", { item: it, book: books[it] ?? 0, counted: Number(cnt[it]) }, it)}>Save count</button>
        </div>
      ))}</div>
      <section className="hub-card"><h3>Results {todayDone.length ? `(${todayDone.length} today)` : ""}</h3>
        <div className="fl-tbl"><table><thead><tr><th>Date</th><th>Item</th><th className="r">Books</th><th className="r">Counted</th><th className="r">Diff</th></tr></thead>
          <tbody>{done.slice(0, 40).map((x) => <tr key={x.id}><td>{dmy(x.date)}</td><td>{x.item}</td><td className="r">{x.book}</td><td className="r">{x.counted}</td><td className={`r ${x.flag ? "bad" : ""}`}>{x.diff > 0 ? "+" : ""}{x.diff}{x.pct != null ? ` (${x.pct}%)` : ""}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}

interface MLog { date: string; machine: string; kind: string; hours: number | null; note: string | null }
function Maintenance() {
  const { recs, add } = useRecs(META.maintenance.kinds);
  const today = businessDate(Date.now());
  const [logs, setLogs] = useState<MLog[]>([]);
  useEffect(() => { fetch("/api/machines").then((r) => r.json()).then((j) => setLogs(j.data || [])).catch(() => {}); }, []);
  const due = useMemo(() => maintenanceDue(recs, logs, today), [recs, logs, today]);
  const spares = useMemo(() => sparesStock(recs), [recs]);
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (session?.user as any)?.role === "OWNER";
  return (
    <>
      <div className="fl-cards">{due.map((d) => (
        <div key={`${d.machine}-${d.task}`} className={`hub-card fl-card ${d.overdue ? "bad" : d.pct >= 80 ? "warn" : "good"}`}>
          <b>{d.machine} — {d.task}</b>
          <div className="fl-bar"><i style={{ width: `${Math.min(100, d.pct)}%`, background: d.overdue ? "var(--h-r)" : undefined }} /></div>
          <small>{d.overdue ? "⚠️ Overdue" : `Due in ${d.dueIn}`} · {d.hoursSince} h since {d.lastDone ? dmy(d.lastDone) : "never logged"}</small>
        </div>
      ))}</div>
      <p className="hub-m small">Log a job as done on <a href="/machines">⚙️ Machines</a> → “Service done” with the job name in the note; hours come from the run logs there.</p>
      <section className="hub-card"><h3>🔩 Spare parts</h3>
        <div className="fl-tbl"><table><thead><tr><th>Part</th><th className="r">In hand</th><th className="r">Keep at least</th></tr></thead>
          <tbody>{spares.map((s) => <tr key={s.name}><td>{s.name}</td><td className={`r ${s.low ? "bad" : ""}`}>{s.qty}</td><td className="r">{s.min}</td></tr>)}</tbody></table></div>
        <datalist id="dl-name">{spares.map((s) => <option key={s.name} value={s.name} />)}</datalist>
        <Form fields={[{ k: "name", label: "Part" }, { k: "qty", label: "Qty (+ bought, − used)", type: "number" }, { k: "note", label: "Note" }]} onSave={(v) => (!v.name || !n(v.qty || "") ? Promise.resolve("Part and qty needed.") : add("spare_move", { name: v.name, qty: n(v.qty), note: v.note || "" }, v.name))} />
      </section>
      {owner && (
        <section className="hub-card"><h3>Plan</h3>
          <Form label="Add job" fields={[{ k: "machine", label: "Machine", ph: "Expeller 1" }, { k: "task", label: "Job", ph: "worm shaft" }, { k: "everyHours", label: "Every … hours", type: "number" }, { k: "everyDays", label: "or every … days", type: "number" }]}
            onSave={(v) => (!v.machine || !v.task ? Promise.resolve("Machine and job needed.") : add("maint_plan", { machine: v.machine, task: v.task, everyHours: n(v.everyHours || ""), everyDays: n(v.everyDays || "") }, v.machine))} />
          <Form label="Add spare part" fields={[{ k: "name", label: "Part", ph: "Filter cloth" }, { k: "qty", label: "In hand", type: "number" }, { k: "min", label: "Keep at least", type: "number" }, { k: "cost", label: "₹ each", type: "number" }]}
            onSave={(v) => (!v.name ? Promise.resolve("Part needed.") : add("spare", { name: v.name, qty: n(v.qty || "") ?? 0, min: n(v.min || "") ?? 0, cost: n(v.cost || "") ?? 0 }, v.name))} />
        </section>
      )}
    </>
  );
}

function Settling() {
  const { recs, add, patch } = useRecs(META.settling.kinds);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const list = useMemo(() => settlingStatus(recs, now), [recs, now]);
  const fmt = (h: number) => (h <= 0 ? "Ready ✅" : h < 24 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} m left` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h left`);
  return (
    <>
      <div className="fl-cards">{list.map((s) => (
        <div key={s.id} className={`hub-card fl-card ${s.ready ? "good" : ""}`}>
          <b>{s.tank} · {s.product}{s.kg ? ` · ${s.kg} kg` : ""}</b>
          <span className="fl-big">{fmt(s.leftH)}</span>
          <div className="fl-bar"><i style={{ width: `${s.pct}%` }} /></div>
          <small className="hub-m">Started {new Date(s.startAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })} · ready {new Date(s.readyAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}</small>
          <button className="hub-btn sm" onClick={() => void patch(s.id, { status: "done" })}>✓ Decanted</button>
        </div>
      ))}</div>
      {!list.length && <p className="hub-m">No tank settling now.</p>}
      <section className="hub-card"><h3>Start settling</h3>
        <Form label="Start timer" fields={[{ k: "tank", label: "Tank / barrel", ph: "Settling tank 1" }, { k: "product", label: "Oil", ph: "Karadi" }, { k: "kg", label: "kg", type: "number" }, { k: "hours", label: "Hours to settle", type: "number", ph: "72" }]}
          onSave={(v) => (!v.tank ? Promise.resolve("Which tank?") : add("settle", { tank: v.tank, product: v.product || "", kg: n(v.kg || ""), hours: n(v.hours || "") || 72, startAt: new Date().toISOString() }, v.tank))} />
      </section>
    </>
  );
}
