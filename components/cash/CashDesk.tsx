"use client";

// Cash tally desk (/cash) — count the counter cash note by note in its own
// window. Expected cash is computed on the SERVER from the day's entries (same
// maths + ₹300 rule as the Quick Register and Daily Closing desk); saving goes
// through /api/register/tally, so every screen sees the same record.
import { useCallback, useEffect, useState } from "react";
import { DENOMINATIONS, businessDate, denominationTotal } from "@/lib/register";
import { useLauncher } from "@/components/launcher/LauncherProvider";
import { MEMO_LINES, MEMO_META, notInApp, type AppLine, type MemoLine, type MemoRow } from "@/lib/memoTotals";
import { TANKS, fillPct, tankFigures, tankStatus } from "@/lib/stockTanks";
import { mergeScaleReports, soldByStockKey, type ScaleLine, type ScaleReport } from "@/lib/scaleReport";
import { preparePhoto } from "@/lib/proofClient";

type Session = "AFTERNOON" | "NIGHT";
interface Saved {
  id: string;
  createdAt: string;
  counted: number;
  system: number;
  diff: number; // system - counted (positive = short)
  mismatch: boolean;
  denoms: Record<string, number> | null;
}
interface MemoView extends MemoRow {
  updatedAt?: string;
}
interface ScaleSaved {
  totalKg: number | null;
  totalInr: number | null;
  taxInr: number | null;
  lines: ScaleLine[];
  enteredByName?: string | null;
  updatedAt?: string;
}
interface Handover {
  countedBy: string;
  handedTo: string;
  enteredByName?: string | null;
  updatedAt?: string;
}
interface CashApi {
  opening: number;
  buckets: Record<string, number>;
  systemCash: number; // from the app's own entries only
  adjustedCash: number; // after saved memo-sheet totals
  app: Record<MemoLine, AppLine>;
  memo: MemoView[];
  scale: ScaleSaved | null;
  handovers: Partial<Record<Session, Handover>>;
  sessions: Record<Session, Saved | null>;
}
interface StockApiLite {
  sessions: Record<Session, { stock?: Record<string, { today?: number | null }> } | null>;
}
type Draft = { amt: string; cash: string; qty: string; unit: string; source: "typed" | "scale-scan" | "paper-scan" };
const ENTRY_TILES: [string, string, string][] = [
  ["sale", "💰", "Sale"],
  ["purchase", "🛒", "Purchase"],
  ["expense", "🧾", "Expense"],
  ["udhaar", "🙌", "Udhaar in"],
  ["payment", "💸", "Payment out"],
  ["jobwork", "🌾", "Job-work"],
  ["pigmee", "🏦", "Pigmee"],
  ["draw", "🧔", "Owner draw"],
];
const UNITS = ["kg", "ltr", "bags", "pcs", ""];
const fnum = (v: string | undefined) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const LABEL: Record<Session, string> = { AFTERNOON: "Tally 1 · midday", NIGHT: "Tally 2 · closing" };
const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const dayMinus = (n: number) => businessDate(Date.now() - n * 86400000);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const int = (v: string | undefined) => parseInt(v || "", 10) || 0;

export default function CashDesk({ initialDate, initialSession }: { initialDate?: string; initialSession?: Session }) {
  const today = businessDate(Date.now());
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [session, setSession] = useState<Session>(initialSession || (hour >= 16 ? "NIGHT" : "AFTERNOON"));
  const [api, setApi] = useState<CashApi | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const backDated = date < today;
  const { openPop, embedded } = useLauncher();
  const [stockApi, setStockApi] = useState<StockApiLite | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<MemoLine, Draft>>>({});
  const [hand, setHand] = useState({ countedBy: "", handedTo: "" });
  const [scanBusy, setScanBusy] = useState<string | null>(null);
  const [scanOut, setScanOut] = useState<{ kind: "scale"; report: ScaleReport; warnings: string[]; net: boolean; aiError?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/register/cash?date=${date}&session=${session}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setApi(j.data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load cash");
    }
  }, [date, session]);
  useEffect(() => {
    load();
  }, [load]);

  const loadStock = useCallback(async () => {
    try {
      const r = await fetch(`/api/register/stock?date=${date}`);
      const j = await r.json();
      if (r.ok) setStockApi(j.data);
    } catch {}
  }, [date]);
  useEffect(() => {
    loadStock();
  }, [loadStock]);
  // When an entry window (pop) is closed, the numbers on this page refresh.
  useEffect(() => {
    const again = () => {
      load();
      loadStock();
    };
    window.addEventListener("ql-pop-closed", again);
    return () => window.removeEventListener("ql-pop-closed", again);
  }, [load, loadStock]);
  useEffect(() => {
    setDrafts({});
  }, [date]);
  const handKey = `${api?.handovers?.[session]?.updatedAt ?? ""}|${session}|${date}`;
  useEffect(() => {
    const h = api?.handovers?.[session];
    setHand({ countedBy: h?.countedBy || "", handedTo: h?.handedTo || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey]);

  // Pre-fill from what is already saved for this session — only when the
  // day/session/saved count changes, never on a plain refresh (keeps typing).
  const savedId = api?.sessions[session]?.id ?? "";
  useEffect(() => {
    const s = api?.sessions[session];
    const d = (s?.denoms || {}) as Record<string, number>;
    setCounts(Object.fromEntries(DENOMINATIONS.filter((x) => d[String(x)]).map((x) => [String(x), String(d[String(x)])])));
    setCoins(d.coins ? String(d.coins) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, session, savedId]);

  const nums = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), int(counts[String(d)])]));
  const counted = denominationTotal(nums, parseFloat(coins) || 0);
  const appOnly = api?.systemCash ?? 0;
  const sys = api?.adjustedCash ?? appOnly;
  const usingMemo = !!api && api.memo.length > 0 && Math.abs(sys - appOnly) >= 0.01;
  const diff = counted - sys; // + extra, − short
  const big = Math.abs(sys - counted) >= 300;
  const saved = api?.sessions[session] || null;
  const notes = DENOMINATIONS.reduce((a, d) => a + nums[String(d)], 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/register/tally", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session, coins: parseFloat(coins) || 0, denoms: nums, useMemo: true }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const d: number = j.data.cashDiffInr; // system - counted
      setMsg(`Saved ✓ ${LABEL[session]} — ${Math.abs(d) < 1 ? "cash matches" : d > 0 ? `short ${rs(d)}` : `extra ${rs(-d)}`}${j.data.cashMismatch ? " — ⚠️ over ₹300, please check" : ""}`);
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(false);
  }

  const memoOf = (l: MemoLine) => api?.memo.find((m) => m.line === l);
  const setDraft = (l: MemoLine, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [l]: { amt: "", cash: "", qty: "", unit: MEMO_META[l].unit, source: "typed", ...(d[l] || {}), ...patch } }));
  const draftLines = MEMO_LINES.filter((l) => drafts[l] && fnum(drafts[l]!.amt) > 0);

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/register/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, ...body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(okText);
      setErr(null);
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveMemo() {
    if (!draftLines.length) return;
    const lines = draftLines.map((l) => {
      const d = drafts[l]!;
      return { line: l, amountInr: fnum(d.amt), cashInr: d.cash.trim() === "" ? "" : fnum(d.cash), qty: d.qty.trim() === "" ? null : fnum(d.qty), unit: d.unit || null, source: d.source };
    });
    const ok = await post({ lines }, `Saved ${lines.length} memo total${lines.length > 1 ? "s" : ""} in this tally only. The register, stock, sales and reports are not changed.`);
    if (ok) setDrafts({});
  }
  async function clearMemo(l: MemoLine) {
    const r = await fetch(`/api/register/memo?date=${date}&line=${l}`, { method: "DELETE" });
    if (r.ok) load();
    else setErr((await r.json().catch(() => ({}))).error || "Could not remove");
  }
  async function saveHandover() {
    await post({ handover: { session, countedBy: hand.countedBy, handedTo: hand.handedTo } }, "Handover saved ✓");
  }

  // ---- scale report: photo -> numbers -> person checks -> fills Sales row ----
  async function readScale(files: FileList | null) {
    if (!files || !files.length) return;
    setScanBusy("Reading the report…");
    setErr(null);
    try {
      const parts: ScaleReport[] = [];
      let aiError: string | undefined;
      for (const f of Array.from(files).slice(0, 3)) {
        const dataUrl = await preparePhoto(f);
        const r = await fetch("/api/register/scale-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (j.aiError) aiError = j.aiError;
        parts.push(j.report as ScaleReport);
      }
      const report = mergeScaleReports(parts);
      const { scaleWarnings } = await import("@/lib/scaleReport");
      setScanOut({ kind: "scale", report, warnings: scaleWarnings(report), net: false, aiError });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the report");
    } finally {
      setScanBusy(null);
    }
  }
  async function useScale() {
    if (!scanOut) return;
    const { report, net } = scanOut;
    const gross = report.totalInr ?? report.lines.reduce((a, l) => a + l.amountInr, 0);
    const amt = net && report.taxInr ? gross - report.taxInr : gross;
    const kg = report.totalKg ?? report.lines.reduce((a, l) => a + l.kg, 0);
    setDraft("SALE", { amt: String(Math.round(amt * 100) / 100), qty: String(kg), unit: "kg", cash: "", source: "scale-scan" });
    // The report itself is kept so the stock cards can show "scale sold today".
    const ok = await post({ scale: { totalKg: report.totalKg, totalInr: report.totalInr, taxInr: report.taxInr, lines: report.lines } }, "Scale report kept. Sales row filled: check it, then press Save.");
    if (ok) setScanOut(null);
  }

  const bk = api?.buckets;
  const inRows: [string, number][] = bk ? [["Opening", bk.cashInOpening], ["Sales (cash)", bk.cashInSales], ["Other in (udhar received)", bk.cashInOther]] : [];
  const outRows: [string, number][] = bk
    ? [["Job-work payouts", bk.cashOutGrn], ["Expenses / purchases", bk.cashOutExpenses + bk.cashOutOther], ["Salary", bk.cashOutSalary], ["UPI out", bk.cashOutUpi], ["Owner draw / pigmee", bk.cashOutDraw]]
    : [];

  const sold = api?.scale ? soldByStockKey({ reportDate: null, totalKg: null, totalInr: null, taxInr: null, lines: api.scale.lines }) : {};
  const stockCards = (() => {
    const s1 = stockApi?.sessions?.AFTERNOON?.stock;
    const s2 = stockApi?.sessions?.NIGHT?.stock;
    const fig = (src: typeof s1) => Object.fromEntries(TANKS.flatMap((t) => [t.key, ...(t.also || []).map((a) => a.key)]).map((k) => [k, { now: typeof src?.[k]?.today === "number" ? (src![k]!.today as number) : null }]));
    const f1 = fig(s1);
    const f2 = fig(s2);
    return TANKS.map((tk) => {
      const a = tankFigures(tk, f1 as never).now;
      const b = tankFigures(tk, f2 as never).now;
      const kg = b ?? a;
      const st = tankStatus(kg, tk.capKg);
      const change = a != null && b != null ? Math.round((b - a) * 10) / 10 : null;
      const keys = [tk.key, ...(tk.also || []).map((x) => x.key)];
      const soldKg = keys.reduce((n, k) => n + (sold[k] || 0), 0);
      return {
        key: tk.key,
        name: tk.name.replace(" tank", ""),
        kg,
        pct: fillPct(kg, tk.capKg),
        low: st === "low",
        note: st === "low" ? "LOW" : tk.also?.length ? `+ ${tk.also.map((x) => x.label).join(", ")}` : kg == null ? "" : `${fillPct(kg, tk.capKg)}%`,
        sub: kg == null ? "count it in the Stock tally" : change == null ? (b == null ? "midday count" : "closing count") : change === 0 ? "no change since midday" : `${change < 0 ? "▼" : "▲"} ${Math.abs(change)} kg since midday`,
        sold: soldKg ? Math.round(soldKg * 1000) / 1000 : null,
      };
    });
  })();

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>💵 Cash tally</h1>
          <div className="hub-m">Count the counter cash note by note — compared with what the register says should be there.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href={`/stock?date=${date}&session=${session}`}>📦 Stock tally</a>
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
          {(Object.keys(LABEL) as Session[]).map((s) => (
            <button key={s} className={session === s ? "on" : ""} onClick={() => setSession(s)}>
              {s === "AFTERNOON" ? "🌤️" : "🌙"} {LABEL[s]}
            </button>
          ))}
        </div>
        {(["AFTERNOON", "NIGHT"] as Session[]).map((s) => (
          <span key={s} className={`stk-saved ${api?.sessions[s] ? "ok" : ""}`}>
            T{s === "AFTERNOON" ? 1 : 2} {api?.sessions[s] ? `saved ${hm(api.sessions[s]!.createdAt)}` : "not done"}
          </span>
        ))}
      </div>

      {backDated && (
        <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>
          🕘 Late entry — you are counting cash for <b>{date}</b>. Expected cash is worked out from that day&apos;s entries.
        </div>
      )}
      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="hub-kpis">
        <div className="hub-kpi b"><div className="l">Should be in counter</div><div className="v">{rs(sys)}</div><div className="s">{usingMemo ? <>uses memo sheet totals · app entries alone: <b>{rs(appOnly)}</b></> : <>opening {rs(api?.opening ?? 0)} + today&apos;s movement</>}</div></div>
        <div className="hub-kpi"><div className="l">Counted now</div><div className="v">{rs(counted)}</div><div className="s">{notes} notes{parseFloat(coins) ? ` + ${rs(parseFloat(coins))} coins` : ""}</div></div>
        <div className={`hub-kpi ${counted <= 0 ? "" : big ? "r" : "g"}`}>
          <div className="l">Gap</div>
          <div className="v">{counted <= 0 ? "—" : Math.abs(diff) < 1 ? "✓ matches" : `${diff < 0 ? "short" : "extra"} ${rs(Math.abs(diff))}`}</div>
          <div className="s">₹300 or more is flagged</div>
        </div>
      </div>


      {/* ---- make an entry here + UPI today ---- */}
      <div className="csh-two">
        <section className="hub-card">
          <div className="hub-card-head"><h3>➕ Make an entry here</h3></div>
          <div className="csh-tiles">
            {ENTRY_TILES.map(([key, icon, label]) => (
              <button key={key} className="csh-tile" onClick={() => (embedded ? (window.location.href = `/register?open=${key}`) : openPop({ title: label, url: `/register?open=${key}&embed=1`, kind: "Function" }))}>
                <span className="i" aria-hidden>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="hub-m">Each button opens the normal form in a window on top of this page. Save, close it, and the cash here updates. In the form choose Cash, 📱 Shop GPay, 🟣 Owner PhonePe or Udhaar. Only Cash changes the counter cash.</div>
        </section>
        <section className="hub-card">
          <div className="hub-card-head"><h3>📱 UPI today</h3></div>
          {api ? (
            <div className="csh-upi">
              <div><span>📱 Shop GPay</span><b>{rs(api.app.SALE.upi + api.app.UDHAAR.upi)}</b></div>
              <div><span>🟣 Owner PhonePe</span><b>{rs(api.app.SALE.phonepe + api.app.UDHAAR.phonepe)}</b></div>
              <div className="hub-m">Money received by UPI from sales and udhaar. It is not counter cash, so it does not change the count above.</div>
            </div>
          ) : (
            <div className="hub-empty">Loading…</div>
          )}
        </section>
      </div>

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>✍️ Count notes — {LABEL[session]}</h3>
          <div className="hr stk-row">
            <button className="hub-btn sm" onClick={() => { setCounts({}); setCoins(""); }}>Clear</button>
            <button className="hub-btn sm" onClick={load}>↻ Refresh expected</button>
          </div>
        </div>
        <div className="csh-grid">
          {DENOMINATIONS.map((d) => {
            const n = int(counts[String(d)]);
            return (
              <div className="csh-card" key={d}>
                <div className="d">₹{d}</div>
                <input id={`n-${d}`} type="number" inputMode="numeric" min={0} aria-label={`Number of ₹${d} notes`} value={counts[String(d)] || ""} onChange={(e) => setCounts({ ...counts, [String(d)]: e.target.value })} />
                <div className="step">
                  <button className="hub-btn sm" type="button" onClick={() => setCounts({ ...counts, [String(d)]: String(Math.max(0, n - 1)) })}>−1</button>
                  <button className="hub-btn sm" type="button" onClick={() => setCounts({ ...counts, [String(d)]: String(n + 1) })}>+1</button>
                </div>
                <div className="t">= {rs(n * d)}</div>
              </div>
            );
          })}
          <div className="csh-card">
            <div className="d">Coins ₹</div>
            <input type="number" inputMode="numeric" min={0} aria-label="Coins total" value={coins} onChange={(e) => setCoins(e.target.value)} />
            <div className="t">total value</div>
          </div>
        </div>
        <div className="stk-sticky">
          <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} onClick={save} disabled={busy || counted <= 0}>
            {busy ? "Saving…" : `✓ Save ${LABEL[session]}`}
          </button>
          <span className={`csh-verdict ${counted > 0 ? (big ? "bad" : "ok") : ""}`}>
            {counted > 0 ? (Math.abs(diff) < 1 ? "✓ cash matches" : `${diff < 0 ? "⚠️ short" : "extra"} ${rs(Math.abs(diff))}`) : ""}
          </span>
          <span className="hub-m">{saved ? `last saved ${hm(saved.createdAt)} (${rs(saved.counted)}) — saving again adds a new count` : "not saved yet"}</span>
        </div>
      </section>


      {/* ---- day totals from the cash memo sheet ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📋 Day totals from the cash memo sheet</h3>
          <div className="hr stk-row">
            <label className="hub-btn sm" style={{ cursor: "pointer" }}>
              ⚖️ From scale report
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { readScale(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        <div className="hub-m">
          Entries were written on paper? Type the sheet&apos;s <b>total amount</b> and <b>total quantity</b> for each line. These totals <b>stay in this Cash tally only</b>. The register, stock, sales, reports, GST and party balances are not changed. Paper sales do not appear in the day&apos;s sales report until they are entered in the app.
        </div>
        {scanBusy && <div className="hub-banner">{scanBusy}</div>}
        <div className="csh-memo">
          <div className="csh-memo-h"><span>LINE</span><span>IN APP NOW</span><span>MEMO TOTAL ₹</span><span>QTY</span><span>OF WHICH CASH ₹</span><span>NOT IN APP YET</span></div>
          {MEMO_LINES.map((l) => {
            const m = MEMO_META[l];
            const a = api?.app[l];
            const saved = memoOf(l);
            const d = drafts[l];
            const typed = d && d.amt.trim() !== "";
            const memoAmt = typed ? fnum(d!.amt) : saved ? saved.amountInr : null;
            const gap = memoAmt !== null && a ? notInApp(memoAmt, a) : null;
            return (
              <div key={l} className={`csh-memo-r${typed ? " typing" : ""}`}>
                <b>{m.icon} {m.en}</b>
                <span>{a ? rs(a.amount) : "—"}{saved ? <em> · 📋 {rs(saved.amountInr)}</em> : null}</span>
                <input type="number" inputMode="decimal" min={0} placeholder={saved ? String(saved.amountInr) : "₹"} aria-label={`${m.en} memo total`} value={d?.amt ?? ""} onChange={(e) => setDraft(l, { amt: e.target.value, source: d?.source === "scale-scan" ? "scale-scan" : "typed" })} />
                <span className="csh-qty">
                  <input type="number" inputMode="decimal" min={0} placeholder={saved?.qty != null ? String(saved.qty) : "qty"} aria-label={`${m.en} quantity`} value={d?.qty ?? ""} onChange={(e) => setDraft(l, { qty: e.target.value })} />
                  {m.unit !== "" && (
                    <button type="button" className="hub-btn sm" onClick={() => setDraft(l, { unit: UNITS[(UNITS.indexOf(d?.unit ?? m.unit) + 1) % 4] })}>{d?.unit ?? saved?.unit ?? m.unit}</button>
                  )}
                </span>
                <input type="number" inputMode="decimal" min={0} placeholder={typed ? "all cash" : saved ? String(saved.cashInr) : "₹"} aria-label={`${m.en} of which cash`} value={d?.cash ?? ""} onChange={(e) => setDraft(l, { cash: e.target.value })} />
                <span className={`csh-gap ${gap === null ? "" : gap > 0 ? "warn" : "ok"}`}>
                  {gap === null ? "—" : gap > 0 ? rs(gap) : "✓ all in app"}
                  {saved && !typed ? <button type="button" className="hub-btn sm" title="Remove this memo total" onClick={() => clearMemo(l)}>✕</button> : null}
                </span>
                {saved && (
                  <span className="csh-by">typed by {saved.enteredByName || "—"}{saved.updatedAt ? ` · ${hm(saved.updatedAt)}` : ""}{saved.source === "scale-scan" ? " · ⚖️ from scale report" : ""}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="stk-sticky">
          <button className="hub-btn" style={{ background: draftLines.length ? "var(--h-acc)" : undefined, color: draftLines.length ? "#fff" : undefined }} disabled={busy || !draftLines.length} onClick={saveMemo}>
            {draftLines.length ? "Save for this tally" : "Type a memo total to save"}
          </button>
          <span className="hub-m">Expected cash uses the memo cash for lines with a saved total, and the app&apos;s own cash for the rest.</span>
        </div>
      </section>

      {/* ---- stock tally as simple cards ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📦 Stock right now</h3>
          <div className="hr stk-row">
            <button className="hub-btn sm" onClick={() => (embedded ? (window.location.href = `/stock?date=${date}&session=${session}`) : openPop({ title: "Stock tally", url: `/stock?date=${date}&session=${session}&embed=1`, kind: "App" }))}>Count stock now</button>
            <a className="hub-btn sm" href={`/stock?date=${date}&session=${session}`}>Open full stock tally</a>
            <button className="hub-btn sm" title="Opens the stock tally, which can read a photo of the stock sheet" onClick={() => (embedded ? (window.location.href = `/stock?date=${date}&session=${session}`) : openPop({ title: "Scan stock sheet", url: `/stock?date=${date}&session=${session}&embed=1`, kind: "App" }))}>📸 Scan stock sheet</button>
          </div>
        </div>
        <div className="csh-stock">
          {stockCards.map((c) => (
            <div key={c.key} className={`csh-sc${c.low ? " low" : ""}`}>
              <div className="top"><b>{c.name}</b><span>{c.note}</span></div>
              <div className="kg">{c.kg == null ? "not counted" : c.kg.toLocaleString("en-IN")}{c.kg != null && <small> kg</small>}</div>
              <div className="bar"><i style={{ width: `${c.pct}%` }} /></div>
              <div className="sub">{c.sub}</div>
              {c.sold != null && <div className="sold">⚖️ scale sold today {c.sold.toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg</div>}
            </div>
          ))}
        </div>
        {api?.scale && <div className="hub-m">Scale report kept for {date} ({api.scale.totalKg ?? "?"} kg, {api.scale.totalInr != null ? rs(api.scale.totalInr) : "?"}), read by {api.scale.enteredByName || "—"}. Gold Drop is counted with Sunflower (one tank).</div>}
      </section>

      {/* ---- shift handover ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head"><h3>🤝 Shift handover — {LABEL[session]}</h3></div>
        <div className="csh-hand">
          <label>Counted by<input value={hand.countedBy} onChange={(e) => setHand({ ...hand, countedBy: e.target.value })} placeholder="name" /></label>
          <span aria-hidden>→</span>
          <label>Handed to<input value={hand.handedTo} onChange={(e) => setHand({ ...hand, handedTo: e.target.value })} placeholder="name" /></label>
          <button className="hub-btn" disabled={busy || !hand.countedBy.trim() || !hand.handedTo.trim()} onClick={saveHandover}>Save handover</button>
        </div>
        {api?.handovers?.[session] && <div className="hub-m">Saved: {api.handovers[session]!.countedBy} → {api.handovers[session]!.handedTo}{api.handovers[session]!.updatedAt ? ` at ${hm(api.handovers[session]!.updatedAt!)}` : ""}.</div>}
      </section>

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>🧮 How the expected cash is made</h3>
        </div>
        {bk ? (
          <div className="csh-sys">
            {inRows.map(([k, v]) => <div key={k}><span>＋ {k}</span><b>{rs(v)}</b></div>)}
            {outRows.map(([k, v]) => <div key={k}><span>－ {k}</span><b>{rs(v)}</b></div>)}
            <div><span><b>{usingMemo ? "= From the app's own entries" : "= Should be in counter"}</b></span><b>{rs(appOnly)}</b></div>
            {usingMemo && <div><span>± Memo sheet totals replace the app cash for their lines</span><b>{sys - appOnly >= 0 ? "+" : "−"}{rs(Math.abs(sys - appOnly))}</b></div>}
            {usingMemo && <div><span><b>= Should be in counter</b></span><b>{rs(sys)}</b></div>}
          </div>
        ) : (
          <div className="hub-empty">Loading…</div>
        )}
      </section>

      {scanOut && (
        <div className="csh-modal" role="dialog" aria-label="Scale report">
          <div className="csh-modal-card">
            <div className="hub-card-head"><h3>⚖️ Scale PLU report</h3><button className="hub-btn sm" onClick={() => setScanOut(null)}>✕</button></div>
            <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>Read from the photo. Check each number, then press Use. The Sales row is only filled, not saved.</div>
            {scanOut.aiError && <div className="hub-banner">{scanOut.aiError}</div>}
            {scanOut.warnings.map((w) => <div key={w} className="hub-banner">⚠️ {w}</div>)}
            <div className="csh-sl">
              {[["Total weight", scanOut.report.totalKg != null ? `${scanOut.report.totalKg} kg` : "—"], ["Total price", scanOut.report.totalInr != null ? rs(scanOut.report.totalInr) : "—"], ["Tax", scanOut.report.taxInr != null ? rs(scanOut.report.taxInr) : "—"]].map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
              {scanOut.report.lines.map((l, i) => (
                <div key={i}><span>{l.name}{l.key ? "" : " (not oil kg)"}</span><b>{l.pcs && !l.kg ? `${l.pcs} pcs` : `${l.kg} kg`} · {rs(l.amountInr)}</b></div>
              ))}
            </div>
            <div className="csh-choice">
              <b>Amount for the Sales row</b>
              <button className={!scanOut.net ? "on" : ""} onClick={() => setScanOut({ ...scanOut, net: false })}>Total price {scanOut.report.totalInr != null ? rs(scanOut.report.totalInr) : ""}</button>
              {scanOut.report.taxInr != null && scanOut.report.totalInr != null && (
                <button className={scanOut.net ? "on" : ""} onClick={() => setScanOut({ ...scanOut, net: true })}>Without tax {rs(scanOut.report.totalInr - scanOut.report.taxInr)}</button>
              )}
            </div>
            <div className="hub-m">The report does not say cash or UPI. After filling, type &quot;of which cash&quot; if some sales were GPay or udhaar. Cans are counted in pieces and left out of the kg.</div>
            <button className="hub-btn" style={{ background: "var(--h-g)", color: "#fff" }} disabled={busy || (!scanOut.report.lines.length && scanOut.report.totalInr == null)} onClick={useScale}>✓ Use these numbers</button>
          </div>
        </div>
      )}
    </div>
  );
}
