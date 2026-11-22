"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import MillIcon from "@/components/icons/MillIcon";
import { bagEquivalent, readStockCount, type StockCount, type StockMaterial } from "@/lib/mill/millOperations";
import "./millOperations.css";

type Tab = "dashboard" | "reports" | "stock";
type Production = { id: string; date: string; ref: string; seed: number; crushed: boolean; oil: number | null };
type Data = {
  checkedAt: string;
  jobs: (Production & { name: string; khali: number | null })[];
  runs: Production[];
  ownKhali: { id: string; date: string; kg: number }[];
  paid: { id: string; name: string; at: string; method: string; in: number; out: number }[];
  counts: (StockCount & { id: string; date: string; at: string })[];
  khali: { stackKg: number; since: string | null } | null;
};
const day = (at = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const number = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const kg = (n: number) => number(n) + " kg";
const rupees = (n: number) => "₹" + number(n);
const clock = (stamp: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(stamp));
const icon = { seed: "seed", khali: "khali_disc", oil: "oil_drop" };

export default function MillOperations() {
  const today = day();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [custom, setCustom] = useState(false);
  const [range, setRange] = useState({ from: today, to: today });
  const [version, refresh] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("crushing");
  const [showHistory, setShowHistory] = useState(false);
  const [material, setMaterial] = useState<StockMaterial>("seed");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const countId = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch("/api/mill/operations?" + new URLSearchParams(range), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load mill records.");
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [range, version]);

  useEffect(() => {
    if (range.to !== today || tab === "stock") return;
    const timer = window.setInterval(() => refresh(n => n + 1), 60000);
    return () => window.clearInterval(timer);
  }, [range.to, today, tab]);

  async function saveCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const count = readStockCount({
      material, item: fields.get("item"), kg: Number(fields.get("kg")),
      bags: Number(fields.get("bags")), looseKg: fields.get("loose") ? Number(fields.get("loose")) : null,
      kgPerBag: material === "seed" ? 40 : Number(fields.get("basis")),
    });
    if (!count) { setSaveMessage("Check the weight, bag count and loose weight."); return; }
    setSaving(true);
    setSaveMessage("");
    try {
      if (!countId.current) countId.current = crypto.randomUUID();
      const response = await fetch("/api/mill/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, id: countId.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save stock count.");
      countId.current = "";
      form.reset();
      setSaveMessage("Stock count recorded.");
      setRange({ from: today, to: today });
      refresh(n => n + 1);
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Could not confirm the save. Retry the count.");
    } finally {
      setSaving(false);
    }
  }

  const yesterday = day(Date.now() - 86400000);
  const byCrushed = (rows: Production[]) => rows.filter(r => r.crushed).reduce((n, r) => n + r.seed, 0);
  const byOil = (rows: Production[]) => rows.reduce((n, r) => n + (r.oil ?? 0), 0);
  const customerKhali = data?.jobs.reduce((sum, j) => sum + (j.khali ?? 0), 0) ?? 0;
  const millKhali = data?.ownKhali.reduce((sum, k) => sum + k.kg, 0) ?? 0;
  const open = (name: string) => { setDetail(name); setTab("reports"); };
  const counts = data?.counts.filter((count, i, rows) => rows.findIndex(r => r.material === count.material && r.item.toLowerCase() === count.item.toLowerCase()) === i) ?? [];
  const modes = ["CASH", "UPI", "UNKNOWN"];
  const dayTotals = data ? Array.from(new Set([...data.jobs, ...data.runs].map(j => j.date))).sort()
    .map(date => ({ date, kg: byCrushed([...data.jobs, ...data.runs].filter(j => j.date === date)) })) : [];
  const maxCrushed = Math.max(1, ...dayTotals.map(d => d.kg));
  return <main className="mill-operations">
    <Link href="/mill">← Mill Desk</Link>
    <h1>Mill operations</h1>
    <nav aria-label="Mill operations">
      {(["dashboard", "reports", "stock"] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "dashboard" ? "Dashboard" : t === "reports" ? "Reports" : "Stock"}</button>)}
    </nav>
    <nav aria-label="Report dates">
      <button type="button" aria-pressed={!custom && range.from === today} onClick={() => { setCustom(false); setRange({ from: today, to: today }); }}>Today</button>
      <button type="button" aria-pressed={!custom && range.from === yesterday} onClick={() => { setCustom(false); setRange({ from: yesterday, to: yesterday }); }}>Yesterday</button>
      <button type="button" aria-pressed={custom} onClick={() => setCustom(v => !v)}>Custom</button>
      <button type="button" onClick={() => refresh(n => n + 1)}>Refresh</button>
    </nav>
    {custom && <div className="mill-op-grid">
      <label>From<input type="date" max={today} value={range.from} onChange={e => { const from = e.target.value; if (from) setRange({ from, to: from > range.to ? from : range.to }); }} /></label>
      <label>To<input type="date" min={range.from} max={today} value={range.to} onChange={e => { const to = e.target.value; if (to) setRange({ from: to < range.from ? to : range.from, to }); }} /></label>
    </div>}
    {error && <p role="alert">{error}</p>}
    {!error && !data && <p role="status">Loading mill records…</p>}
    {data && <>
      <p className="mill-op-muted">{range.from === range.to ? range.from : range.from + " to " + range.to} · Checked {clock(data.checkedAt)} IST</p>
      {tab === "dashboard" && <div className="mill-op-grid">
        <button className="mill-op-card" onClick={() => open("crushing")}><MillIcon id={icon.seed} /> Seed crushed <strong>{kg(byCrushed(data.jobs) + byCrushed(data.runs))}</strong><small>Customer {kg(byCrushed(data.jobs))} · Own mill {kg(byCrushed(data.runs))}</small></button>
        <button className="mill-op-card" onClick={() => open("oil")}><MillIcon id={icon.oil} /> Oil recorded <strong>{kg(byOil(data.jobs) + byOil(data.runs))}</strong><small>Customer {kg(byOil(data.jobs))} · Own mill {kg(byOil(data.runs))}</small></button>
        <button className="mill-op-card" onClick={() => open("khali")}><MillIcon id={icon.khali} /> Khali recorded <strong>{kg(customerKhali + millKhali)}</strong><small>Customer handovers {kg(customerKhali)} · Own mill {kg(millKhali)}</small></button>
        <button className="mill-op-card" onClick={() => open("payments")}>Cash settled <strong>{rupees(data.paid.filter(p => p.method === "CASH").reduce((s, p) => s + p.out, 0))} paid</strong><small>{rupees(data.paid.filter(p => p.method === "CASH").reduce((s, p) => s + p.in, 0))} received</small></button>
        <button className="mill-op-card" onClick={() => setTab("stock")}>Stock counts<strong>{counts.length} materials or items</strong><small>Weighed kg and physical bags</small></button>
        <section className="mill-op-card">
          <h2>Crushing by intake day</h2>
          <button type="button" onClick={() => { setCustom(true); setRange({ from: day(Date.now() - 6 * 86400000), to: today }); }}>Last 7 days</button>
          {dayTotals.map(d => <button type="button" className="mill-op-trend" key={d.date} onClick={() => { setRange({ from: d.date, to: d.date }); open("crushing"); }}>
            <span>{d.date} · {kg(d.kg)}</span><progress value={d.kg} max={maxCrushed} aria-label={`Crushed on ${d.date}`} />
          </button>)}
        </section>
      </div>}
      {tab === "reports" && <>
        <nav aria-label="Report type">
          {[["crushing", "Crushing"], ["oil", "Oil"], ["khali", "Khali"], ["payments", "Payments"]].map(([key, name]) => <button key={key} aria-pressed={detail === key} onClick={() => setDetail(key)}>{key === "khali" && <MillIcon id={icon.khali} size={20} />}{name}</button>)}
        </nav>
        {detail === "payments" ? <>
          {modes.filter(mode => data.paid.some(p => p.method === mode)).map(mode => <section className="mill-op-card" key={mode}>
            <h2>{mode === "UNKNOWN" ? "Method not recorded" : mode}</h2>
            {data.paid.filter(p => p.method === mode).map(p => <div className="mill-op-row" key={p.id}><span>{p.name}<small>{clock(p.at)}</small></span><b>{rupees(p.out)} paid · {rupees(p.in)} received</b></div>)}
          </section>)}
          {!data.paid.length && <p>No settlements in this period.</p>}
        </> : <>
          <p className="mill-op-muted">Jobs and batches are grouped by intake date. Output figures include recorded weights.</p>
          <section className="mill-op-card"><h2>Customer jobs</h2>
            {data.jobs.map(j => <div className="mill-op-row" key={j.id}><span>{j.ref} · {j.name}<small>{j.date}</small></span><b>{detail === "crushing" ? (j.crushed ? kg(j.seed) : "Waiting") : (detail === "oil" ? j.oil : j.khali) == null ? "Pending weight" : kg((detail === "oil" ? j.oil : j.khali)!)}</b></div>)}
            {!data.jobs.length && <p>No customer jobs.</p>}
          </section>
          <section className="mill-op-card"><h2>Own mill</h2>
            {detail === "khali" ? data.ownKhali.map(k => <div className="mill-op-row" key={k.id}><span>Khali bag · {k.date}</span><b>{kg(k.kg)}</b></div>)
              : data.runs.map(r => <div className="mill-op-row" key={r.id}><span>Run · {r.date}</span><b>{detail === "crushing" ? (r.crushed ? kg(r.seed) : "In progress") : r.oil ? kg(r.oil) : "Pending weight"}
                {detail === "oil" && r.seed > 0 && r.oil !== null && r.oil > 0 && <small>{number(r.oil / r.seed * 100)}% recorded oil yield</small>}
              </b></div>)}
            {!(detail === "khali" ? data.ownKhali : data.runs).length && <p>No own-mill entries.</p>}
          </section>
        </>}
      </>}
      {tab === "stock" && <>
        {data.khali?.since && <p><MillIcon id={icon.khali} size={24} /> Khali ledger · <b>{kg(data.khali.stackKg)}</b></p>}
        <div className="mill-op-grid">{counts.map(c => {
          const eq = c.kgPerBag ? bagEquivalent(c.kg, c.kgPerBag) : null;
          return <section className="mill-op-card" key={c.id}><MillIcon id={icon[c.material]} /> {c.item}<strong>{kg(c.kg)}</strong>
            {c.bags !== null && <small>{c.bags} counted bags{c.looseKg !== null ? " · " + kg(c.looseKg) + " loose" : ""}</small>}
            {eq && <small>{eq.bags} full bag equivalents{eq.remainder ? " + " + kg(eq.remainder) : ""} at {c.kgPerBag} kg per bag</small>}
            <small>Counted {clock(c.at)}</small>
          </section>;
        })}</div>
        {!counts.length && <p>No stock counts recorded for this end date.</p>}
        {!!data.counts.length && <>
          <button type="button" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}>Count history</button>
          {showHistory && <section className="mill-op-card">
            {data.counts.filter(c => c.date >= range.from).map(c => <div className="mill-op-row" key={c.id}><span>{c.item}<small>{clock(c.at)}</small></span><b>{kg(c.kg)}{c.bags !== null ? ` · ${c.bags} bags` : ""}</b></div>)}
          </section>}
        </>}
        <form className="mill-op-card" onSubmit={saveCount}>
          <h2>Record today’s stock count</h2>
          <div className="mill-op-grid">
            <label>Material<select value={material} onChange={e => setMaterial(e.target.value as StockMaterial)}><option value="seed">Seed</option><option value="khali">Khali (oil cake)</option><option value="oil">Oil</option></select></label>
            <label>Item or tank<input name="item" maxLength={80} required placeholder={material === "seed" ? "Karadi seed" : material === "khali" ? "Karadi khali" : "Karadi tank"} /></label>
            <label>Measured net kg<input name="kg" type="number" min="0" step="0.001" required /></label>
            {material !== "oil" && <>
              <label>Counted bags<input name="bags" type="number" min="0" step="1" required /></label>
              <label>Loose kg (optional)<input name="loose" type="number" min="0" step="0.001" /></label>
              <label>Bag standard<select name="basis" key={material}><option value="40">40 kg</option>{material === "khali" && <option value="45">45 kg</option>}</select></label>
            </>}
          </div>
          <button className="mill-op-save" disabled={saving}>{saving ? "Saving…" : "Save stock count"}</button>
          {saveMessage && <p role="status">{saveMessage}</p>}
        </form>
      </>}
    </>}
  </main>;
}
