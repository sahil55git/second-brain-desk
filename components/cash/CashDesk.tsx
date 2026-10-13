"use client";

// Cash tally desk (/cash). ONE cash tally sheet: for every line (opening, sales, udhaar,
// other cash in, purchase, expense, job-work, salary, owner withdraw) it shows what the app
// holds, what the paper memo sheet says, and the figure the tally USES. A typed figure
// replaces the app's figure for that line — never added on top — so nothing is counted twice.
// The server works the same sheet out (lib/cashSheet.ts); saving a count stores that expected cash.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DENOMINATIONS, businessDate, denominationTotal } from "@/lib/register";
import { useLauncher } from "@/components/launcher/LauncherProvider";
import { SHEET_LINES, SHEET_META, buildSheet, type AppLineCash, type Sheet, type SheetLine, type TypedLine } from "@/lib/cashSheet";
import { buildChecklist, countedTotal, logAmount, logWhat, type LogRow } from "@/lib/cashReport";
import { TANKS, fillPct, tankFigures, tankStatus } from "@/lib/stockTanks";
import { mergeScaleReports, soldByStockKey, type ScaleLine, type ScaleReport } from "@/lib/scaleReport";
import { preparePhoto } from "@/lib/proofClient";

type Session = "AFTERNOON" | "NIGHT";
type UpiKey = "UPI_GPAY" | "UPI_PHONEPE";
interface Saved {
  id: string;
  createdAt: string;
  counted: number;
  system: number;
  diff: number; // system - counted (positive = short)
  mismatch: boolean;
  denoms: Record<string, number> | null;
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
  systemCash: number; // from the app's own entries only
  adjustedCash: number; // what the sheet says should be in the drawer
  sheet: Sheet;
  sheetApp: Record<SheetLine, AppLineCash>;
  appUpi: { gpay: number; phonepe: number };
  upi: Partial<Record<UpiKey, { amountInr: number; enteredByName?: string | null; updatedAt?: string }>>;
  scale: ScaleSaved | null;
  handovers: Partial<Record<Session, Handover>>;
  sessions: Record<Session, Saved | null>;
  log: LogRow[];
}
interface StockApiLite {
  sessions: Record<Session, { stock?: Record<string, { today?: number | null }> } | null>;
}
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
const MEMO_DB_LINES = new Set(["SALE", "PURCHASE", "EXPENSE", "JOBWORK", "UDHAAR", "SALARY"]);
const fnum = (v: string | undefined) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const LABEL: Record<Session, string> = { AFTERNOON: "Tally 1 · midday", NIGHT: "Tally 2 · closing" };
const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const dayMinus = (n: number) => businessDate(Date.now() - n * 86400000);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const logTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const int = (v: string | undefined) => parseInt(v || "", 10) || 0;
const EMPTY_TYPED = (): Record<SheetLine | UpiKey, string> => ({ OPENING: "", SALE: "", UDHAAR: "", OTHER_IN: "", PURCHASE: "", EXPENSE: "", JOBWORK: "", SALARY: "", OWNER_DRAW: "", UPI_GPAY: "", UPI_PHONEPE: "" });

export default function CashDesk({ initialDate, initialSession }: { initialDate?: string; initialSession?: Session }) {
  const today = businessDate(Date.now());
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [session, setSession] = useState<Session>(initialSession || (hour >= 16 ? "NIGHT" : "AFTERNOON"));
  const [api, setApi] = useState<CashApi | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [direct, setDirect] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const backDated = date < today;
  const { openPop, embedded } = useLauncher();
  const [stockApi, setStockApi] = useState<StockApiLite | null>(null);
  const [typed, setTyped] = useState(EMPTY_TYPED);
  const [saleFromScale, setSaleFromScale] = useState(false);
  const [hand, setHand] = useState({ countedBy: "", handedTo: "" });
  const [showTiles, setShowTiles] = useState(false);
  const [scanBusy, setScanBusy] = useState<string | null>(null);
  const [scanOut, setScanOut] = useState<{ report: ScaleReport; warnings: string[]; net: boolean; aiError?: string } | null>(null);

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
  // When an entry window (pop) closes, the numbers here refresh.
  useEffect(() => {
    const again = () => {
      load();
      loadStock();
    };
    window.addEventListener("ql-pop-closed", again);
    return () => window.removeEventListener("ql-pop-closed", again);
  }, [load, loadStock]);
  useEffect(() => {
    setTyped(EMPTY_TYPED());
    setSaleFromScale(false);
  }, [date]);
  const handKey = `${api?.handovers?.[session]?.updatedAt ?? ""}|${session}|${date}`;
  useEffect(() => {
    const h = api?.handovers?.[session];
    setHand({ countedBy: h?.countedBy || "", handedTo: h?.handedTo || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey]);
  // Pre-fill the count from what is saved for this session — only when the day / session / saved count changes.
  const savedId = api?.sessions[session]?.id ?? "";
  useEffect(() => {
    const s = api?.sessions[session];
    const d = (s?.denoms || {}) as Record<string, number>;
    setCounts(Object.fromEntries(DENOMINATIONS.filter((x) => d[String(x)]).map((x) => [String(x), String(d[String(x)])])));
    setCoins(d.coins ? String(d.coins) : "");
    setDirect(d.direct ? String(d.direct) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, session, savedId]);

  // ---- the sheet: saved values from the server, plus whatever is typed and not saved yet ----
  const pending = (Object.keys(typed) as (SheetLine | UpiKey)[]).filter((k) => typed[k].trim() !== "");
  const live: Sheet | null = useMemo(() => {
    if (!api) return null;
    const t: Partial<Record<SheetLine, TypedLine>> = {};
    for (const r of api.sheet.rows) if (r.memo !== null) t[r.line] = { amountInr: r.memo, enteredByName: r.by, updatedAt: r.at };
    for (const l of SHEET_LINES) if (typed[l].trim() !== "") t[l] = { amountInr: fnum(typed[l]) };
    const g = typed.UPI_GPAY.trim() !== "" ? fnum(typed.UPI_GPAY) : api.upi.UPI_GPAY?.amountInr ?? null;
    const p = typed.UPI_PHONEPE.trim() !== "" ? fnum(typed.UPI_PHONEPE) : api.upi.UPI_PHONEPE?.amountInr ?? null;
    return buildSheet(api.sheetApp, t, { gpay: g, phonepe: p }, api.appUpi);
  }, [api, typed]);
  const sys = live ? live.expected : 0;
  const savedSheet = api?.sheet;

  const nums = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), int(counts[String(d)])]));
  const notesTotal = denominationTotal(nums, parseFloat(coins) || 0);
  const { counted, usingDirect } = countedTotal(direct, notesTotal);
  const diff = counted - sys; // + extra, − short
  const big = Math.abs(diff) >= 300;
  const saved = api?.sessions[session] || null;
  const notes = DENOMINATIONS.reduce((a, d) => a + nums[String(d)], 0);

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
  async function saveSheet() {
    if (!pending.length) return;
    const lines = pending.filter((k) => MEMO_DB_LINES.has(k)).map((k) => ({ line: k, amountInr: fnum(typed[k]), cashInr: "", source: k === "SALE" && saleFromScale ? "scale-scan" : "typed" }));
    const extras = pending.filter((k) => k === "OPENING" || k === "OTHER_IN" || k === "OWNER_DRAW").map((k) => ({ line: k, amountInr: fnum(typed[k]) }));
    const upi = pending.filter((k) => k === "UPI_GPAY" || k === "UPI_PHONEPE").map((k) => ({ line: k, amountInr: fnum(typed[k]) }));
    const ok = await post({ lines, extras, upi }, `Saved ${pending.length} figure${pending.length > 1 ? "s" : ""} in the cash tally. The register, stock, GST and party reports are not changed.`);
    if (ok) {
      setTyped(EMPTY_TYPED());
      setSaleFromScale(false);
    }
  }
  async function clearLine(k: SheetLine | UpiKey) {
    const r = await fetch(`/api/register/memo?date=${date}&line=${k}`, { method: "DELETE" });
    if (r.ok) load();
    else setErr((await r.json().catch(() => ({}))).error || "Could not remove");
  }
  async function saveCount() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/register/tally", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session, coins: parseFloat(coins) || 0, denoms: nums, useMemo: true, ...(usingDirect ? { directInr: counted } : {}) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const d: number = j.data.cashDiffInr; // system - counted
      setMsg(`Count saved ✓ ${LABEL[session]} — ${Math.abs(d) < 1 ? "cash matches" : d > 0 ? `short ${rs(d)}` : `extra ${rs(-d)}`}${j.data.cashMismatch ? " — ⚠️ ₹300 or more, please check" : ""}`);
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(false);
  }
  function newCount() {
    setCounts({});
    setCoins("");
    setDirect("");
    setMsg("New count started. The earlier count stays in the entry log. Save when done.");
    document.getElementById("csh-count")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function saveHandover() {
    await post({ handover: { session, countedBy: hand.countedBy, handedTo: hand.handedTo } }, "Handover saved ✓");
  }

  // ---- scale report: photo -> numbers -> person checks -> fills the Sales line ----
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
      setScanOut({ report, warnings: scaleWarnings(report), net: false, aiError });
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
    setTyped((t) => ({ ...t, SALE: String(Math.round(amt * 100) / 100) }));
    setSaleFromScale(true);
    const ok = await post({ scale: { totalKg: report.totalKg, totalInr: report.totalInr, taxInr: report.taxInr, lines: report.lines } }, "Scale report kept. Sales filled from it: check it, then press Save.");
    if (ok) setScanOut(null);
  }

  const checks = api && savedSheet ? buildChecklist({ sheet: savedSheet, appUpi: api.appUpi, counted, scaleKept: !!api.scale, handoverSaved: !!api.handovers?.[session] }) : [];
  const missing = checks.filter((c) => c.status === "miss").length;
  const countsToday = (api?.log || []).filter((l) => l.line === "COUNT");

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

  const openEntry = (key: string, label: string) => (embedded ? (window.location.href = `/register?open=${key}`) : openPop({ title: label, url: `/register?open=${key}&embed=1`, kind: "Function" }));
  const usedNote = (r: Sheet["rows"][number]) =>
    r.memo === null ? (r.line === "OPENING" ? "last closing" : "from the app") : r.line === "SALE" && r.upiOff > 0 ? `${rs(r.memo)} − UPI ${rs(r.upiOff)}` : "memo sheet";
  const reportRows = (s: Sheet, dir: "in" | "out") => s.rows.filter((r) => r.dir === dir);

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>💵 Cash tally</h1>
          <div className="hub-m">One sheet: what came in, what went out, what should be in the drawer, and what you counted.</div>
        </div>
        <nav className="hub-links">
          <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} onClick={() => setShowTiles((v) => !v)}>➕ New entry</button>
          <button className="hub-btn" onClick={newCount}>🔄 New count</button>
          <a className="hub-btn" href={`/stock?date=${date}&session=${session}`}>📦 Stock tally</a>
          <a className="hub-btn" href="/tallies">🧮 All tallies</a>
          <a className="hub-btn" href="/register">📒 Quick Register</a>
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

      {showTiles && (
        <section className="hub-card" style={{ marginTop: 10 }}>
          <div className="hub-card-head"><h3>➕ New entry</h3><button className="hub-btn sm" onClick={() => setShowTiles(false)}>✕</button></div>
          <div className="csh-tiles">
            {ENTRY_TILES.map(([key, icon, label]) => (
              <button key={key} className="csh-tile" onClick={() => openEntry(key, label)}>
                <span className="i" aria-hidden>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="hub-m">Opens the normal form in a window. Save and close it: the sheet below updates. Only Cash changes the drawer.</div>
        </section>
      )}

      {backDated && <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>🕘 Late entry — you are working on <b>{date}</b>.</div>}
      {err && <div className="hub-banner">{err}</div>}
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)" }}>{msg}</div>}

      <div className="hub-kpis">
        <div className="hub-kpi b"><div className="l">Cash should be in drawer</div><div className="v">{rs(sys)}</div><div className="s">{pending.length ? "includes figures not saved yet" : live?.anyTyped ? "from the cash tally sheet" : "from the app's entries"}</div></div>
        <div className="hub-kpi"><div className="l">Cash counted now</div><div className="v">{rs(counted)}</div><div className="s">{usingDirect ? "typed total" : <>{notes} notes{parseFloat(coins) ? ` + ${rs(parseFloat(coins))} coins` : ""}</>}</div></div>
        <div className={`hub-kpi ${counted <= 0 ? "" : big ? "r" : "g"}`}>
          <div className="l">Gap</div>
          <div className="v">{counted <= 0 ? "—" : Math.abs(diff) < 1 ? "✓ matches" : `${diff < 0 ? "short" : "extra"} ${rs(Math.abs(diff))}`}</div>
          <div className="s">₹300 or more is flagged</div>
        </div>
      </div>

      {/* ---- 1. the cash tally sheet ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📋 Cash tally sheet — type the memo sheet totals</h3>
          <div className="hr stk-row">
            <label className="hub-btn sm" style={{ cursor: "pointer" }} title="Opens the camera on a phone">
              📷 Scan scale report
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { readScale(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="hub-btn sm" style={{ cursor: "pointer" }}>
              🖼️ Choose photos
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { readScale(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        <div className="hub-m">
          Leave a line empty to use the app&apos;s figure. A typed figure <b>replaces</b> the app&apos;s figure for that line (never added on top). Typed figures stay in the cash tally only. The register, stock, GST and party reports are not changed.
        </div>
        {scanBusy && <div className="hub-banner">{scanBusy}</div>}
        {live && api ? (
          <div className="csh-sheet">
            <div className="csh-sh h"><span>LINE</span><span>IN APP</span><span>MEMO SHEET ₹</span><span>USED IN TALLY</span></div>
            {(["in", "out"] as const).map((dir) => (
              <div key={dir} className="csh-grp">
                <div className={`csh-sec ${dir}`}>{dir === "in" ? "＋ CASH IN" : "－ CASH OUT"}</div>
                {live.rows.filter((r) => r.dir === dir).map((r) => {
                  const m = SHEET_META[r.line];
                  const sv = savedSheet?.rows.find((x) => x.line === r.line);
                  const isTyped = typed[r.line].trim() !== "";
                  return (
                    <div key={r.line} className={`csh-sh${isTyped ? " typing" : ""}`}>
                      <span className="nm"><b>{m.icon} {m.en}</b><small>{m.hint}</small></span>
                      <span className="app">{rs(r.app)}</span>
                      <span className="csh-in">
                        <input type="number" inputMode="decimal" min={0} placeholder={sv?.memo != null ? String(sv.memo) : "₹"} aria-label={`${m.en} from the memo sheet`} value={typed[r.line]} onChange={(e) => setTyped({ ...typed, [r.line]: e.target.value })} />
                        {sv?.memo != null && !isTyped ? <button type="button" className="hub-btn sm" title="Remove — use the app's figure" onClick={() => clearLine(r.line)}>✕</button> : null}
                      </span>
                      <span className="used"><b>{rs(r.used)}</b><small>{usedNote(r)}</small></span>
                      {sv?.memo != null && <span className="csh-by">typed by {sv.by || "—"}{sv.at ? ` · ${hm(sv.at)}` : ""}</span>}
                    </div>
                  );
                })}
                <div className={`csh-sh tot ${dir}`}><span>{dir === "in" ? "Total cash in" : "Total cash out"}</span><span /><span /><span className="used"><b>{rs(dir === "in" ? live.totalIn : live.totalOut)}</b></span></div>
              </div>
            ))}
            <div className="csh-exp"><span>Cash that should be in the drawer <small>(total in − total out)</small></span><b>{rs(live.expected)}</b></div>

            <div className="csh-sec upi">📱 UPI — not in the drawer (type the day&apos;s total from the app)</div>
            {([["UPI_GPAY", "📱 Shop GPay", api.appUpi.gpay, live.upi.gpay], ["UPI_PHONEPE", "🟣 Owner PhonePe", api.appUpi.phonepe, live.upi.phonepe]] as const).map(([k, label, inApp, val]) => {
              const sv = api.upi[k];
              const isTyped = typed[k].trim() !== "";
              return (
                <div key={k} className={`csh-sh${isTyped ? " typing" : ""}`}>
                  <span className="nm"><b>{label}</b><small>taken off cash Sales</small></span>
                  <span className="app">{rs(inApp)}</span>
                  <span className="csh-in">
                    <input type="number" inputMode="decimal" min={0} placeholder={sv ? String(sv.amountInr) : "₹ app total"} aria-label={`${label} total from the app`} value={typed[k]} onChange={(e) => setTyped({ ...typed, [k]: e.target.value })} />
                    {sv && !isTyped ? <button type="button" className="hub-btn sm" title="Remove" onClick={() => clearLine(k)}>✕</button> : null}
                  </span>
                  <span className="used"><b>{rs(val)}</b><small>{sv || isTyped ? "app total" : "from app entries"}</small></span>
                </div>
              );
            })}
            <div className="csh-exp upi"><span>UPI received today</span><b>{rs(live.upi.total)}</b></div>
          </div>
        ) : (
          <div className="hub-empty">Loading…</div>
        )}
        <div className="stk-sticky">
          <button className="hub-btn" style={{ background: pending.length ? "var(--h-acc)" : undefined, color: pending.length ? "#fff" : undefined }} disabled={busy || !pending.length} onClick={saveSheet}>
            {pending.length ? `✓ Save ${pending.length} figure${pending.length > 1 ? "s" : ""}` : "Type a figure to save"}
          </button>
          {pending.length > 0 && <button className="hub-btn sm" onClick={() => { setTyped(EMPTY_TYPED()); setSaleFromScale(false); }}>Undo typing</button>}
          <span className="hub-m">Sales on the memo sheet include GPay / PhonePe, so the UPI totals are taken off the cash Sales.</span>
        </div>
      </section>

      {/* ---- 2. count the cash + entered vs missing ---- */}
      <div className="csh-two csh-io" style={{ marginTop: 12 }}>
        <section className="hub-card" id="csh-count">
          <div className="hub-card-head">
            <h3>✍️ Cash counted — {LABEL[session]}</h3>
            <div className="hr stk-row">
              <button className="hub-btn sm" onClick={newCount}>🔄 New count</button>
            </div>
          </div>
          <div className="csh-direct">
            <label>
              <b>Total cash counted</b>
              <input type="number" inputMode="decimal" min={0} placeholder="₹ type the total" aria-label="Total cash counted" value={direct} onChange={(e) => setDirect(e.target.value)} />
            </label>
            <div className="hub-m">{usingDirect ? "Using the total you typed. The notes below are ignored. Clear it to count by notes." : "Type the total here, or count by notes below."}</div>
          </div>
          <div className="hub-m" style={{ marginTop: 8, fontWeight: 800 }}>Or count by notes</div>
          <div className="csh-grid">
            {DENOMINATIONS.map((d) => {
              const n = int(counts[String(d)]);
              return (
                <div className="csh-card" key={d}>
                  <div className="d">₹{d}</div>
                  <input type="number" inputMode="numeric" min={0} aria-label={`Number of ₹${d} notes`} value={counts[String(d)] || ""} onChange={(e) => setCounts({ ...counts, [String(d)]: e.target.value })} />
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
            <button className="hub-btn" style={{ background: "var(--h-acc)", color: "#fff" }} onClick={saveCount} disabled={busy || counted <= 0}>
              {busy ? "Saving…" : `✓ Save count · ${LABEL[session]}`}
            </button>
            <span className={`csh-verdict ${counted > 0 ? (big ? "bad" : "ok") : ""}`}>
              {counted > 0 ? (Math.abs(diff) < 1 ? "✓ cash matches" : `${diff < 0 ? "⚠️ short" : "extra"} ${rs(Math.abs(diff))}`) : ""}
            </span>
            <span className="hub-m">{saved ? `last saved ${hm(saved.createdAt)} (${rs(saved.counted)})` : "not saved yet"}</span>
          </div>
          {countsToday.length > 0 && (
            <div className="csh-counts">
              <b>Counts saved on {date}</b>
              {countsToday.map((c) => <div key={c.id}><span>{logTime(c.createdAt)} · {logWhat(c)} · {c.enteredByName || "—"}</span><b>{c.amountInr != null ? rs(c.amountInr) : "—"}</b></div>)}
            </div>
          )}
        </section>
        <section className="hub-card">
          <div className="hub-card-head"><h3>✅ Tally checklist</h3><span className={`csh-miss ${missing ? "warn" : "ok"}`}>{missing ? `${missing} to do` : "all done"}</span></div>
          <div className="csh-checks">
            {checks.map((c) => (
              <div key={c.key} className={`csh-ck ${c.status}`}>
                <b aria-hidden>{c.status === "ok" ? "✓" : c.status === "miss" ? "✗" : "–"}</b>
                <span>{c.label}</span>
                <em>{c.note}</em>
              </div>
            ))}
          </div>
          <div className="hub-m">Shows what is still needed to tally the drawer. Lines with nothing are taken as ₹0.</div>
        </section>
      </div>

      {/* ---- 3. stock + handover ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📦 Stock right now</h3>
          <div className="hr stk-row">
            <button className="hub-btn sm" onClick={() => (embedded ? (window.location.href = `/stock?date=${date}&session=${session}`) : openPop({ title: "Stock tally", url: `/stock?date=${date}&session=${session}&embed=1`, kind: "App" }))}>Count stock now</button>
            <a className="hub-btn sm" href={`/stock?date=${date}&session=${session}`}>Open full stock tally</a>
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
        {api?.scale && <div className="hub-m">Scale report kept for {date} ({api.scale.totalKg ?? "?"} kg, {api.scale.totalInr != null ? rs(api.scale.totalInr) : "?"}), read by {api.scale.enteredByName || "—"}. Gold Drop is counted with Sunflower.</div>}
      </section>

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

      {/* ---- 4. report (saved figures only; prints cleanly) ---- */}
      <section className="hub-card csh-report" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📄 Cash tally report — {date} · {LABEL[session]}</h3>
          <div className="hr stk-row"><button className="hub-btn sm" onClick={() => window.print()}>🖨️ Print / save PDF</button></div>
        </div>
        {api && savedSheet ? (
          <>
            {pending.length > 0 && <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>{pending.length} typed figure{pending.length > 1 ? "s are" : " is"} not saved yet. The report shows saved figures only.</div>}
            <div className="csh-rhead">
              <div><span>Cash should be in drawer</span><b>{rs(savedSheet.expected)}</b><small>{savedSheet.anyTyped ? "from the cash tally sheet" : "from the app's entries"}</small></div>
              <div><span>Cash counted</span><b>{saved ? rs(saved.counted) : "—"}</b><small>{saved ? `saved ${hm(saved.createdAt)}` : "count not saved yet"}</small></div>
              <div className={saved && Math.abs(saved.counted - savedSheet.expected) >= 300 ? "bad" : ""}>
                <span>Gap</span>
                <b>{!saved ? "—" : Math.abs(saved.counted - savedSheet.expected) < 1 ? "✓ matches" : `${saved.counted < savedSheet.expected ? "short" : "extra"} ${rs(Math.abs(saved.counted - savedSheet.expected))}`}</b>
                <small>₹300 or more is flagged</small>
              </div>
              <div><span>UPI received</span><b>{rs(savedSheet.upi.total)}</b><small>not in the drawer</small></div>
            </div>
            <div className="csh-rgrid">
              <div>
                <h4>1 · How the drawer cash is made</h4>
                {(["in", "out"] as const).map((dir) => (
                  <div key={dir}>
                    {reportRows(savedSheet, dir).map((r) => (
                      <div key={r.line} className="rr"><span>{dir === "in" ? "＋" : "－"} {SHEET_META[r.line].en} <small>· {usedNote(r)}</small></span><b>{rs(r.used)}</b></div>
                    ))}
                    <div className="rr tot"><span>{dir === "in" ? "Total cash in" : "Total cash out"}</span><b>{rs(dir === "in" ? savedSheet.totalIn : savedSheet.totalOut)}</b></div>
                  </div>
                ))}
                <div className="rr tot big"><span>Cash that should be in the drawer</span><b>{rs(savedSheet.expected)}</b></div>
              </div>
              <div>
                <h4>2 · Cash counted</h4>
                {!saved ? (
                  <div className="rr"><span>Not saved yet</span><b>—</b></div>
                ) : saved.denoms && (saved.denoms as Record<string, number>).direct ? (
                  <div className="rr"><span>Total typed directly</span><b>{rs(saved.counted)}</b></div>
                ) : (
                  <>
                    {DENOMINATIONS.filter((d) => (saved.denoms as Record<string, number> | null)?.[String(d)]).map((d) => {
                      const n = (saved.denoms as Record<string, number>)[String(d)];
                      return <div key={d} className="rr"><span>₹{d} × {n}</span><b>{rs(d * n)}</b></div>;
                    })}
                    {(saved.denoms as Record<string, number> | null)?.coins ? <div className="rr"><span>Coins</span><b>{rs((saved.denoms as Record<string, number>).coins)}</b></div> : null}
                    <div className="rr tot"><span>Total cash counted</span><b>{rs(saved.counted)}</b></div>
                  </>
                )}
                <h4 style={{ marginTop: 10 }}>3 · UPI, scale and handover</h4>
                <div className="rr"><span>📱 Shop GPay</span><b>{rs(savedSheet.upi.gpay)}</b></div>
                <div className="rr"><span>🟣 Owner PhonePe</span><b>{rs(savedSheet.upi.phonepe)}</b></div>
                <div className="rr"><span>⚖️ Scale report</span><b>{api.scale ? `${api.scale.totalKg ?? "?"} kg · ${api.scale.totalInr != null ? rs(api.scale.totalInr) : "?"}` : "not scanned"}</b></div>
                {stockCards.filter((c) => c.kg != null).map((c) => <div key={c.key} className="rr"><span>Stock · {c.name}</span><b>{c.kg!.toLocaleString("en-IN")} kg{c.low ? " · LOW" : ""}</b></div>)}
                <div className="rr"><span>Counted by → handed to</span><b>{api.handovers?.[session] ? `${api.handovers[session]!.countedBy} → ${api.handovers[session]!.handedTo}` : "not saved"}</b></div>
                <div className="rr"><span>Entries still missing</span><b>{missing ? `${missing} to do` : "none"}</b></div>
              </div>
              <div>
                <h4>4 · Entry log — date, time and who</h4>
                <div className="hub-m">Kept for good. Changes and removals are added, never erased.</div>
                {api.log.length === 0 ? <div className="hub-empty">Nothing typed in this tally yet.</div> : api.log.slice(0, 40).map((l) => (
                  <div key={l.id} className="rr log"><span><small>{logTime(l.createdAt)}</small> {logWhat(l)} <small>· {l.enteredByName || "—"}</small></span><b>{logAmount(l)}</b></div>
                ))}
              </div>
            </div>
            <div className="hub-m">Informational report. Typed figures stay inside the cash tally. They never change the register, stock, GST or party reports.</div>
          </>
        ) : (
          <div className="hub-empty">Loading…</div>
        )}
      </section>

      {scanOut && (
        <div className="csh-modal" role="dialog" aria-label="Scale report">
          <div className="csh-modal-card">
            <div className="hub-card-head"><h3>⚖️ Scale PLU report</h3><button className="hub-btn sm" onClick={() => setScanOut(null)}>✕</button></div>
            <div className="hub-banner" style={{ borderColor: "var(--h-acc)" }}>Read from the photo. Check each number, then press Use. Sales is only filled, not saved.</div>
            {scanOut.aiError && <div className="hub-banner">{scanOut.aiError}</div>}
            {scanOut.warnings.map((w) => <div key={w} className="hub-banner">⚠️ {w}</div>)}
            <div className="csh-sl">
              {[["Total weight", scanOut.report.totalKg != null ? `${scanOut.report.totalKg} kg` : "—"], ["Total price", scanOut.report.totalInr != null ? rs(scanOut.report.totalInr) : "—"], ["Tax", scanOut.report.taxInr != null ? rs(scanOut.report.taxInr) : "—"]].map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
              {scanOut.report.lines.map((l, i) => (
                <div key={i}><span>{l.name}{l.key ? "" : " (not oil kg)"}</span><b>{l.pcs && !l.kg ? `${l.pcs} pcs` : `${l.kg} kg`} · {rs(l.amountInr)}</b></div>
              ))}
            </div>
            <div className="csh-choice">
              <b>Amount for Sales</b>
              <button className={!scanOut.net ? "on" : ""} onClick={() => setScanOut({ ...scanOut, net: false })}>Total price {scanOut.report.totalInr != null ? rs(scanOut.report.totalInr) : ""}</button>
              {scanOut.report.taxInr != null && scanOut.report.totalInr != null && (
                <button className={scanOut.net ? "on" : ""} onClick={() => setScanOut({ ...scanOut, net: true })}>Without tax {rs(scanOut.report.totalInr - scanOut.report.taxInr)}</button>
              )}
            </div>
            <div className="hub-m">The report does not say cash or UPI. Type the GPay / PhonePe totals in the UPI rows; they are taken off the cash Sales.</div>
            <button className="hub-btn" style={{ background: "var(--h-g)", color: "#fff" }} disabled={busy || (!scanOut.report.lines.length && scanOut.report.totalInr == null)} onClick={useScale}>✓ Use these numbers</button>
          </div>
        </div>
      )}
    </div>
  );
}
