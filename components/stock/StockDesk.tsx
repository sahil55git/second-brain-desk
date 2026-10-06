"use client";

// Stock tally desk (/stock) — the daily physical stock count in its own
// window. Maths is NOT re-implemented: it calls computeProductTally() from
// lib/calculations.ts (the same function the Daily Closing desk and the Quick
// Register use) and flags gaps with the same 0.5 kg rule. Saves through
// /api/register/stock, which stores on the day's DailyClosing row, so the
// Daily Closing desk and Reports see exactly the same record.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STOCK_PRODUCTS, computeProductTally, type StockProductComputed } from "@/lib/calculations";
import { businessDate } from "@/lib/register";
import { STOCK_KN, csvToTable, isFlagged, parseTallyRows, tallyGap } from "@/lib/stockTally";
import { download, excelBlob, type ExportTable } from "@/lib/exporters";

type Session = "AFTERNOON" | "NIGHT";
interface SavedSession {
  id: string;
  createdAt: string;
  stock: Record<string, StockProductComputed & { today?: number | null }>;
}
interface StockApi {
  yesterday: Record<Session, Record<string, number | null>>;
  sessions: Record<Session, SavedSession | null>;
}
type Vals = Record<string, { today: string; reportSale: string }>;

const SESSION_LABEL: Record<Session, string> = { AFTERNOON: "Tally 1 · midday", NIGHT: "Tally 2 · closing" };
const dayMinus = (n: number) => businessDate(Date.now() - n * 86400000);
const num = (v: string | undefined) => (v === undefined || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(r2(v)));
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function StockDesk({ initialDate, initialSession }: { initialDate?: string; initialSession?: Session }) {
  const [date, setDate] = useState(() => (initialDate && initialDate <= businessDate(Date.now()) ? initialDate : businessDate(Date.now())));
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [session, setSession] = useState<Session>(initialSession || (hour >= 16 ? "NIGHT" : "AFTERNOON"));
  const today = businessDate(Date.now());
  const backDated = date < today;
  const [view, setView] = useState<"cards" | "guided">("cards");
  const [api, setApi] = useState<StockApi | null>(null);
  const [vals, setVals] = useState<Vals>({});
  const [yOver, setYOver] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/register/stock?date=${date}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setApi(j.data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load stock");
    }
  }, [date]);
  useEffect(() => {
    load();
  }, [load]);

  // Pre-fill the form with what is already saved for the chosen session.
  useEffect(() => {
    if (!api) return;
    const saved = api.sessions[session]?.stock;
    setVals(
      saved
        ? Object.fromEntries(
            Object.entries(saved).map(([k, v]) => [k, { today: v.today == null ? "" : String(v.today), reportSale: v.reportSale == null ? "" : String(v.reportSale) }])
          )
        : {}
    );
    setYOver({});
    setStep(0);
  }, [api, session]);

  const rows = useMemo(() => {
    const y = api?.yesterday[session] || {};
    return STOCK_PRODUCTS.map((p) => {
      const v = vals[p.key] || { today: "", reportSale: "" };
      const ov = num(yOver[p.key]);
      const yesterday = ov !== null ? ov : y[p.key] ?? null;
      const c = computeProductTally(p, num(v.today), num(v.reportSale), yesterday, ov !== null ? "override" : "auto");
      return { p, v, c, flagged: isFlagged(c), kn: STOCK_KN[p.key] || "" };
    });
  }, [api, session, vals, yOver]);

  const counted = rows.filter((r) => r.c.today !== null).length;
  const flagged = rows.filter((r) => r.flagged).length;
  const totalNow = r2(rows.reduce((a, r) => a + (r.c.today ?? 0), 0));
  const totalSale = r2(rows.reduce((a, r) => a + (r.c.sale ?? 0), 0));
  const totalReport = r2(rows.reduce((a, r) => a + (r.c.reportSale ?? 0), 0));

  const setVal = (k: string, field: "today" | "reportSale", value: string) =>
    setVals((cur) => ({ ...cur, [k]: { today: cur[k]?.today ?? "", reportSale: cur[k]?.reportSale ?? "", [field]: value } }));

  async function save() {
    if (!counted) return setErr("Enter at least one product's count.");
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const stock = Object.fromEntries(
        rows
          .filter((r) => r.c.today !== null)
          .map((r) => [r.p.key, { today: num(r.v.today), reportSale: num(r.v.reportSale), yesterdayOverride: num(yOver[r.p.key]) }])
      );
      const res = await fetch("/api/register/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session, stock }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg(`Saved ✓ ${SESSION_LABEL[session]}${j.data.flagged ? ` — ⚠️ ${j.data.flagged} gap${j.data.flagged === 1 ? "" : "s"} to check` : " — no gaps"}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  }

  async function importFile(f: File) {
    try {
      let table: unknown[][];
      if (/\.(csv|txt)$/i.test(f.name)) table = csvToTable(await f.text());
      else {
        const { readSheet } = await import("read-excel-file/universal");
        table = (await readSheet(f)) as unknown[][];
      }
      const r = parseTallyRows(table);
      if (!r.matched) throw new Error("No matching products found in that file.");
      setVals((cur) => {
        const next = { ...cur };
        for (const [k, v] of Object.entries(r.input)) next[k] = { today: v.today == null ? "" : String(v.today), reportSale: v.reportSale == null ? "" : String(v.reportSale) };
        return next;
      });
      setMsg(`Imported ${r.matched} product${r.matched === 1 ? "" : "s"}${r.skipped.length ? ` · skipped: ${r.skipped.join(", ")}` : ""} — check, then Save.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the file");
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  function template() {
    const csv = ["Product,Today (counted),Report sale", ...STOCK_PRODUCTS.map((p) => `${p.label},,`)].join("\n");
    download("stock-tally-sheet.csv", new Blob(["﻿" + csv], { type: "text/csv" }));
  }

  // ---- today's present stock (what is SAVED for the day) -----------------
  const t1 = api?.sessions.AFTERNOON?.stock;
  const t2 = api?.sessions.NIGHT?.stock;
  const openingTotal = r2(STOCK_PRODUCTS.reduce((a, p) => a + (t2?.[p.key]?.today ?? 0), 0));
  const present = STOCK_PRODUCTS.map((p) => {
    const a = t1?.[p.key];
    const b = t2?.[p.key];
    const latest = b?.today != null ? b : a?.today != null ? a : null;
    return { p, kn: STOCK_KN[p.key] || "", yesterday: (a?.yesterday ?? b?.yesterday) ?? null, t1: a?.today ?? null, t2: b?.today ?? null, now: latest?.today ?? null, sale: latest?.sale ?? null, report: latest?.reportSale ?? null, gap: latest ? tallyGap(latest) : null, flag: latest ? isFlagged(latest) : false, diff: latest?.diff ?? null };
  });
  const presentTotal = r2(present.reduce((a, r) => a + (r.now ?? 0), 0));
  const presentCounted = present.filter((r) => r.now !== null).length;

  async function exportPresent() {
    const t: ExportTable = {
      title: `Stock ${date}`,
      cols: [
        { key: "p", label: "Product" },
        { key: "y", label: "Yesterday closing (kg)", num: true, sum: true },
        { key: "t1", label: "Tally 1 midday (kg)", num: true },
        { key: "t2", label: "Tally 2 closing (kg)", num: true },
        { key: "now", label: "Present stock (kg)", num: true, sum: true },
        { key: "sale", label: "System sale (kg)", num: true, sum: true },
        { key: "report", label: "Scale report sale (kg)", num: true, sum: true },
        { key: "gap", label: "Gap (kg)", num: true },
      ],
      rows: present.map((r) => ({ p: r.p.label, y: r.yesterday, t1: r.t1, t2: r.t2, now: r.now, sale: r.sale, report: r.report, gap: r.gap ?? r.diff })),
    };
    download(`stock-tally_${date}.xlsx`, await excelBlob([t]));
  }

  const savedA = api?.sessions.AFTERNOON;
  const savedN = api?.sessions.NIGHT;

  // ---- one product's entry card -----------------------------------------
  const card = (r: (typeof rows)[number], big = false) => {
    const { p, v, c, flagged: f, kn } = r;
    const state = c.today === null ? "todo" : f ? "bad" : "ok";
    const gap = c.gap ?? c.diff ?? null;
    return (
      <div key={p.key} className={`stk-card ${state}`}>
        <div className="stk-head">
          <div className="stk-name">
            {p.label}
            {kn && <small>{kn}</small>}
          </div>
          <span className={`stk-chip ${state === "todo" ? "" : state}`}>{c.today === null ? "not counted" : f ? `⚠ gap ${fmt(gap)} kg` : "✓ ok"}</span>
        </div>
        <div>
          <label className="stk-lab" htmlFor={`c-${p.key}`}>
            Counted now — present stock (kg)
          </label>
          <input
            id={`c-${p.key}`}
            className="stk-big"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={v.today}
            autoFocus={big}
            onChange={(e) => setVal(p.key, "today", e.target.value)}
            onKeyDown={(e) => big && e.key === "Enter" && setStep((s) => Math.min(rows.length - 1, s + 1))}
          />
        </div>
        <div className="stk-two">
          <div>
            <label className="stk-lab">Yesterday closing (kg)</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              placeholder={fmt((api?.yesterday[session] || {})[p.key])}
              value={yOver[p.key] ?? ""}
              onChange={(e) => setYOver((cur) => ({ ...cur, [p.key]: e.target.value }))}
              title="Leave empty to use the last saved count. Type a number to override."
            />
          </div>
          {p.hasReportSale ? (
            <div>
              <label className="stk-lab">Scale report sale (kg)</label>
              <input type="number" inputMode="decimal" min={0} step="0.1" value={v.reportSale} onChange={(e) => setVal(p.key, "reportSale", e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="stk-lab">Scale report</label>
              <div className="hub-m" style={{ padding: "8px 0" }}>not used for this product</div>
            </div>
          )}
        </div>
        <div className="stk-facts">
          <div>
            Yesterday<b>{fmt(c.yesterday)}</b>
          </div>
          <div>
            {p.hasReportSale ? "System sale" : "Change"}
            <b>{fmt(p.hasReportSale ? c.sale : c.diff)}</b>
          </div>
          <div>
            {p.hasReportSale ? "Gap" : "—"}
            <b className={f ? "r" : c.today !== null && p.hasReportSale ? "g" : ""}>{p.hasReportSale ? fmt(c.gap) : "—"}</b>
          </div>
        </div>
        <div className="stk-row">
          {c.yesterday !== null && (
            <button className="hub-btn sm" type="button" onClick={() => setVal(p.key, "today", String(c.yesterday))}>
              = same as yesterday
            </button>
          )}
          {v.today !== "" && (
            <button className="hub-btn sm" type="button" onClick={() => setVals((cur) => ({ ...cur, [p.key]: { today: "", reportSale: "" } }))}>
              ✕ clear
            </button>
          )}
        </div>
      </div>
    );
  };

  const cur = rows[step];

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>📦 Stock tally</h1>
          <div className="hub-m">Daily physical count of oil stock — compared with the system and the scale report.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/reports?tab=stock">📊 Stock reports</a>
          <a className="hub-btn" href="/tallies">🧮 All tallies</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>

      <div className="stk-bar">
        <div className="stk-seg" role="tablist" aria-label="Day">
          <button className={date === today ? "on" : ""} onClick={() => setDate(today)}>Today</button>
          <button className={date === dayMinus(1) ? "on" : ""} onClick={() => setDate(dayMinus(1))}>Yesterday</button>
        </div>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        <div className="stk-seg" role="tablist">
          {(Object.keys(SESSION_LABEL) as Session[]).map((s) => (
            <button key={s} className={session === s ? "on" : ""} onClick={() => setSession(s)}>
              {s === "AFTERNOON" ? "🌤️" : "🌙"} {SESSION_LABEL[s]}
            </button>
          ))}
        </div>
        <span className={`stk-saved ${savedA ? "ok" : ""}`}>T1 {savedA ? `saved ${hm(savedA.createdAt)}` : "not done"}</span>
        <span className={`stk-saved ${savedN ? "ok" : ""}`}>T2 {savedN ? `saved ${hm(savedN.createdAt)}` : "not done"}</span>
      </div>

      {backDated && (
        <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>
          🕘 Late entry — you are tallying <b>{date}</b>, not today. It is saved against that day and carries into the next day&apos;s opening stock.
        </div>
      )}
      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="hub-kpis">
        <div className="hub-kpi b">
          <div className="l">Counted ({SESSION_LABEL[session]})</div>
          <div className="v">
            {counted}/{STOCK_PRODUCTS.length}
          </div>
        </div>
        <div className={`hub-kpi ${flagged ? "r" : "g"}`}>
          <div className="l">Gaps to check</div>
          <div className="v">{flagged}</div>
          <div className="s">0.5 kg or more</div>
        </div>
        <div className="hub-kpi">
          <div className="l">Total stock counted</div>
          <div className="v">{totalNow} kg</div>
        </div>
        <div className="hub-kpi">
          <div className="l">System sale · scale report</div>
          <div className="v">
            {totalSale} · {totalReport} kg
          </div>
        </div>
      </div>

      <section className="hub-card">
        <div className="hub-card-head">
          <h3>✍️ {backDated ? `Enter count for ${date}` : "Enter today's count"} · {session === "NIGHT" ? "full closing stock" : "midday check"}</h3>
          <div className="hr stk-row">
            <div className="stk-seg">
              <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>▦ Cards</button>
              <button className={view === "guided" ? "on" : ""} onClick={() => setView("guided")}>➡ Guided</button>
            </div>
            <label className="hub-btn sm" style={{ cursor: "pointer" }}>
              📤 Import Excel/CSV
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <button className="hub-btn sm" onClick={template}>
              📄 Template
            </button>
          </div>
        </div>

        {view === "cards" ? (
          <div className="stk-grid">{rows.map((r) => card(r))}</div>
        ) : (
          <div className="stk-guided">
            <div className="hub-m" style={{ textAlign: "center" }}>
              Product {step + 1} of {rows.length} — press Enter for the next one
            </div>
            <div className="stk-dots">
              {rows.map((r, i) => (
                <button key={r.p.key} aria-label={r.p.label} className={`${i === step ? "cur" : ""} ${r.flagged ? "gap" : r.c.today !== null ? "done" : ""}`} onClick={() => setStep(i)} />
              ))}
            </div>
            {cur && card(cur, true)}
            <div className="stk-row" style={{ justifyContent: "space-between", marginTop: 8 }}>
              <button className="hub-btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                ← Back
              </button>
              <button className="hub-btn primary" disabled={step >= rows.length - 1} onClick={() => setStep((s) => Math.min(rows.length - 1, s + 1))}>
                Next →
              </button>
            </div>
          </div>
        )}

        <div className="stk-sticky">
          <button className="hub-btn primary" onClick={save} disabled={busy || !api}>
            {busy ? "Saving…" : `✓ Save ${SESSION_LABEL[session]}`}
          </button>
          <span className="hub-m">
            {counted}/{STOCK_PRODUCTS.length} counted{flagged ? ` · ⚠️ ${flagged} gap${flagged === 1 ? "" : "s"}` : counted ? " · no gaps" : ""} · saving again for the same session replaces it.
          </span>
        </div>
      </section>

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>🌅 Opening stock for {date === today ? "tomorrow" : "the next day"}</h3>
          <div className="hr stk-row">
            <span className="hub-m">
              {t2 ? <>from the closing count of {date} · <b>{openingTotal} kg</b></> : <>Not available — tally <b>closing</b> for {date} first.</>}
            </span>
            {!t2 && (
              <button className="hub-btn sm" onClick={() => { setSession("NIGHT"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                🌙 Do closing tally
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>🧾 Present stock — {date}</h3>
          <div className="hr stk-row">
            <span className="hub-m">
              {presentCounted}/{STOCK_PRODUCTS.length} counted · <b>{presentTotal} kg</b> in shop
            </span>
            <button className="hub-btn sm" onClick={exportPresent} disabled={!presentCounted}>
              ⬇ Excel
            </button>
          </div>
        </div>
        {presentCounted ? (
          <div className="hub-tablewrap">
            <table className="hub-table stk-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Yesterday</th>
                  <th className="num">Tally 1</th>
                  <th className="num">Tally 2</th>
                  <th className="num">Present stock</th>
                  <th className="num">System sale</th>
                  <th className="num">Scale report</th>
                  <th className="num">Gap</th>
                </tr>
              </thead>
              <tbody>
                {present.map((r) => (
                  <tr key={r.p.key} className={r.flag ? "flag" : ""}>
                    <td>
                      <b>{r.p.label}</b>
                      {r.kn && <div className="hub-m small">{r.kn}</div>}
                    </td>
                    <td className="num">{fmt(r.yesterday)}</td>
                    <td className="num">{fmt(r.t1)}</td>
                    <td className="num">{fmt(r.t2)}</td>
                    <td className="num">
                      <b>{fmt(r.now)}</b>
                    </td>
                    <td className="num">{fmt(r.p.hasReportSale ? r.sale : r.diff)}</td>
                    <td className="num">{r.p.hasReportSale ? fmt(r.report) : "—"}</td>
                    <td className="num">{r.now === null ? "—" : r.p.hasReportSale ? <b className={r.flag ? "r" : "g"}>{fmt(r.gap)}</b> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hub-empty">Nothing saved for {date} yet — enter the count above and press Save.</div>
        )}
      </section>
    </div>
  );
}
