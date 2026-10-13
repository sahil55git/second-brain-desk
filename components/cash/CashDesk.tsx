"use client";

// Cash tally desk (/cash) — count the counter cash note by note in its own
// window. Expected cash is computed on the SERVER from the day's entries (same
// maths + ₹300 rule as the Quick Register and Daily Closing desk); saving goes
// through /api/register/tally, so every screen sees the same record.
import { useCallback, useEffect, useState } from "react";
import { DENOMINATIONS, businessDate, denominationTotal } from "@/lib/register";
import { useLauncher } from "@/components/launcher/LauncherProvider";
import { EXTRA_LINES, EXTRA_META, MEMO_LINES, MEMO_META, type AppLine, type ExtraLine, type ExtraTotals, type MemoLine, type MemoRow } from "@/lib/memoTotals";
import { buildChecklist, cashSummary, countedTotal, logAmount, logWhat, type LogRow } from "@/lib/cashReport";
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
  upi: Partial<Record<"UPI_GPAY" | "UPI_PHONEPE", { amountInr: number; enteredByName?: string | null; updatedAt?: string }>>;
  scale: ScaleSaved | null;
  handovers: Partial<Record<Session, Handover>>;
  sessions: Record<Session, Saved | null>;
  extras: ExtraTotals;
  extraRows: { line: ExtraLine; amountInr: number; enteredByName?: string | null; updatedAt?: string }[];
  extrasTyped: boolean;
  memoDelta: number;
  memoLines: { line: MemoLine; delta: number }[];
  log: LogRow[];
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
  const [upiTyped, setUpiTyped] = useState<{ UPI_GPAY: string; UPI_PHONEPE: string }>({ UPI_GPAY: "", UPI_PHONEPE: "" });
  const [extraTyped, setExtraTyped] = useState<Record<ExtraLine, string>>({ OPENING: "", OTHER_IN: "", OWNER_DRAW: "" });
  const [direct, setDirect] = useState("");
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
    setUpiTyped({ UPI_GPAY: "", UPI_PHONEPE: "" });
    setExtraTyped({ OPENING: "", OTHER_IN: "", OWNER_DRAW: "" });
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
    setDirect(d.direct ? String(d.direct) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, session, savedId]);

  const nums = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), int(counts[String(d)])]));
  const notesTotal = denominationTotal(nums, parseFloat(coins) || 0);
  const { counted, usingDirect } = countedTotal(direct, notesTotal);
  const appOnly = api?.systemCash ?? 0;
  const sys = api?.adjustedCash ?? appOnly;
  const usingMemo = !!api && (api.memo.length > 0 || api.extrasTyped) && Math.abs(sys - appOnly) >= 0.01;
  const diff = counted - sys; // + extra, − short
  const big = Math.abs(sys - counted) >= 300;
  const saved = api?.sessions[session] || null;
  const notes = DENOMINATIONS.reduce((a, d) => a + nums[String(d)], 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/register/tally", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session, coins: parseFloat(coins) || 0, denoms: nums, useMemo: true, ...(usingDirect ? { directInr: counted } : {}) }) });
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
  const upiToSave = (["UPI_GPAY", "UPI_PHONEPE"] as const).filter((k) => upiTyped[k].trim() !== "");
  async function saveUpi() {
    if (!upiToSave.length) return;
    const ok = await post({ upi: upiToSave.map((k) => ({ line: k, amountInr: fnum(upiTyped[k]) })) }, "UPI totals saved in this tally only. Counter cash and the register are not changed.");
    if (ok) setUpiTyped({ UPI_GPAY: "", UPI_PHONEPE: "" });
  }
  async function clearUpi(k: "UPI_GPAY" | "UPI_PHONEPE") {
    const r = await fetch(`/api/register/memo?date=${date}&line=${k}`, { method: "DELETE" });
    if (r.ok) load();
    else setErr((await r.json().catch(() => ({}))).error || "Could not remove");
  }
  const extrasToSave = EXTRA_LINES.filter((k) => extraTyped[k].trim() !== "");
  async function saveExtras() {
    if (!extrasToSave.length) return;
    const ok = await post({ extras: extrasToSave.map((k) => ({ line: k, amountInr: fnum(extraTyped[k]) })) }, "Saved in this tally only. Expected cash updated, the register is not changed.");
    if (ok) setExtraTyped({ OPENING: "", OTHER_IN: "", OWNER_DRAW: "" });
  }
  async function clearExtra(k: ExtraLine) {
    const r = await fetch(`/api/register/memo?date=${date}&line=${k}`, { method: "DELETE" });
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
  const summary = api && bk ? cashSummary(bk, api.extras, api.memoLines) : null;
  const appUpi = api ? { gpay: api.app.SALE.upi + api.app.UDHAAR.upi, phonepe: api.app.SALE.phonepe + api.app.UDHAAR.phonepe } : { gpay: 0, phonepe: 0 };
  const checks = api
    ? buildChecklist({ app: api.app, memo: api.memo, upi: api.upi, extras: api.extras, appUpi, counted, scaleKept: !!api.scale, handoverSaved: !!api.handovers?.[session] })
    : [];
  const missing = checks.filter((c) => c.status === "miss").length;
  const upiGpay = api?.upi?.UPI_GPAY ? api.upi.UPI_GPAY.amountInr : appUpi.gpay;
  const upiPhonepe = api?.upi?.UPI_PHONEPE ? api.upi.UPI_PHONEPE.amountInr : appUpi.phonepe;
  const logTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

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
        <div className="hub-kpi b"><div className="l">Cash in counter</div><div className="v">{rs(sys)}</div><div className="s">{usingMemo ? <>uses memo sheet totals · app entries alone: <b>{rs(appOnly)}</b></> : <>opening {rs(api?.opening ?? 0)} + today&apos;s movement</>}</div></div>
        <div className="hub-kpi"><div className="l">Cash counted now</div><div className="v">{rs(counted)}</div><div className="s">{usingDirect ? "typed total" : <>{notes} notes{parseFloat(coins) ? ` + ${rs(parseFloat(coins))} coins` : ""}</>}</div></div>
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
              {([["UPI_GPAY", "📱 Shop GPay", api.app.SALE.upi + api.app.UDHAAR.upi], ["UPI_PHONEPE", "🟣 Owner PhonePe", api.app.SALE.phonepe + api.app.UDHAAR.phonepe]] as const).map(([k, label, inApp]) => {
                const saved = api.upi?.[k];
                const typed = upiTyped[k].trim() !== "";
                const total = typed ? fnum(upiTyped[k]) : saved ? saved.amountInr : null;
                const gap = total === null ? null : Math.max(0, Math.round((total - inApp) * 100) / 100);
                return (
                  <div key={k} className="csh-upi-r">
                    <div><span>{label}</span><b>{rs(inApp)} <small>in app</small></b></div>
                    <input type="number" inputMode="decimal" min={0} placeholder={saved ? String(saved.amountInr) : "Total from the app ₹"} aria-label={`${label} total from the app`} value={upiTyped[k]} onChange={(e) => setUpiTyped({ ...upiTyped, [k]: e.target.value })} />
                    {gap !== null && (
                      <div className={`csh-upi-n ${gap > 0 ? "warn" : "ok"}`}>
                        {gap > 0 ? `${rs(gap)} not in app yet` : "✓ all in app"}
                        {saved && !typed ? <> · saved {rs(saved.amountInr)}{saved.enteredByName ? ` by ${saved.enteredByName}` : ""} <button type="button" className="hub-btn sm" title="Remove" onClick={() => clearUpi(k)}>✕</button></> : null}
                      </div>
                    )}
                  </div>
                );
              })}
              <button className="hub-btn" style={{ background: upiToSave.length ? "var(--h-acc)" : undefined, color: upiToSave.length ? "#fff" : undefined }} disabled={busy || !upiToSave.length} onClick={saveUpi}>
                {upiToSave.length ? "Save UPI totals for this tally" : "Type a UPI total to save"}
              </button>
              <div className="hub-m">Type the day&apos;s total from the GPay / PhonePe app. It is kept in this tally only. UPI is not counter cash, so it does not change the count above or the register.</div>
            </div>
          ) : (
            <div className="hub-empty">Loading…</div>
          )}
        </section>
      </div>

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>✍️ Cash counted — {LABEL[session]}</h3>
          <div className="hr stk-row">
            <button className="hub-btn sm" onClick={() => { setCounts({}); setCoins(""); setDirect(""); }}>Clear</button>
            <button className="hub-btn sm" onClick={load}>↻ Refresh expected</button>
          </div>
        </div>
        <div className="csh-direct">
          <label>
            <b>Total cash counted</b>
            <input type="number" inputMode="decimal" min={0} placeholder="₹ type the total" aria-label="Total cash counted" value={direct} onChange={(e) => setDirect(e.target.value)} />
          </label>
          <div className="hub-m">{usingDirect ? "Using the total you typed. The notes below are ignored. Clear it to count by notes." : "Type the total here to skip the notes, or count by notes below (optional)."}</div>
        </div>
        <div className="hub-m" style={{ marginTop: 8, fontWeight: 800 }}>Or count by notes (optional)</div>
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


      {/* ---- cash in & out, and entered vs missing ---- */}
      <div className="csh-two csh-io">
        <section className="hub-card">
          <div className="hub-card-head"><h3>🧮 Cash in &amp; out — how the cash in counter is made</h3></div>
          {summary && api ? (
            <>
              <div className="csh-typed">
                {EXTRA_LINES.map((k) => {
                  const sv = api.extraRows.find((x) => x.line === k);
                  const label = k === "OPENING" ? "🌅 Opening cash" : k === "OTHER_IN" ? "➕ Cash in (other, not scale sales)" : "🧔 Owner withdraw";
                  return (
                    <label key={k}>
                      <span>{label}{k === "OPENING" && !sv ? <small> · last closing {rs(api.buckets.cashInOpening)}</small> : null}{k === "OWNER_DRAW" && api.buckets.cashOutDraw > 0 ? <small> · app already has {rs(api.buckets.cashOutDraw)} owner draw / pigmee. Type only extra.</small> : null}</span>
                      <input type="number" inputMode="decimal" min={0} placeholder={sv ? String(sv.amountInr) : "₹"} aria-label={EXTRA_META[k].en} value={extraTyped[k]} onChange={(e) => setExtraTyped({ ...extraTyped, [k]: e.target.value })} />
                      {sv && extraTyped[k] === "" ? (
                        <em>saved {rs(sv.amountInr)}{sv.enteredByName ? ` by ${sv.enteredByName}` : ""}{sv.updatedAt ? ` · ${hm(sv.updatedAt)}` : ""} <button type="button" className="hub-btn sm" title="Remove" onClick={() => clearExtra(k)}>✕</button></em>
                      ) : null}
                    </label>
                  );
                })}
                <button className="hub-btn" style={{ background: extrasToSave.length ? "var(--h-acc)" : undefined, color: extrasToSave.length ? "#fff" : undefined }} disabled={busy || !extrasToSave.length} onClick={saveExtras}>
                  {extrasToSave.length ? "Save for this tally" : "Type a figure to save"}
                </button>
              </div>
              <div className="csh-cols">
                <div>
                  <h4>＋ CASH IN</h4>
                  {summary.inRows.map((r) => <div key={r.label}><span>{r.label}</span><b>{rs(r.amount)}</b></div>)}
                  <div className="tot in"><span>Total cash in</span><b>{rs(summary.totalIn)}</b></div>
                </div>
                <div>
                  <h4>－ CASH OUT</h4>
                  {summary.outRows.map((r) => <div key={r.label}><span>{r.label}</span><b>{rs(r.amount)}</b></div>)}
                  <div className="tot out"><span>Total cash out</span><b>{rs(summary.totalOut)}</b></div>
                </div>
              </div>
              <div className="csh-exp"><span>Cash that should be in the counter</span><b>{rs(summary.expected)}</b></div>
              <div className="csh-exp upi"><span>📱 UPI payment received <small>(not in the counter)</small></span><b>{rs(upiGpay + upiPhonepe)}</b></div>
              <div className="hub-m">GPay {rs(upiGpay)} + PhonePe {rs(upiPhonepe)}{api.upi?.UPI_GPAY || api.upi?.UPI_PHONEPE ? " (typed app totals)" : " (from app entries)"}. Typed figures stay in this tally only. The register is not changed.</div>
            </>
          ) : (
            <div className="hub-empty">Loading…</div>
          )}
        </section>
        <section className="hub-card">
          <div className="hub-card-head"><h3>✅ Entered vs missing</h3><span className={`csh-miss ${missing ? "warn" : "ok"}`}>{missing ? `${missing} to do` : "all done"}</span></div>
          <div className="csh-checks">
            {checks.map((c) => (
              <div key={c.key} className={`csh-ck ${c.status}`}>
                <b aria-hidden>{c.status === "ok" ? "✓" : c.status === "miss" ? "✗" : "–"}</b>
                <span>{c.label}</span>
                <em>{c.note}</em>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- day totals from the cash memo sheet ---- */}
      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📋 Day totals from the cash memo sheet</h3>
          <div className="hr stk-row">
            <label className="hub-btn sm" style={{ cursor: "pointer", background: "var(--h-acc)", color: "#fff" }} title="Opens the camera on a phone">
              📷 Scan scale report
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { readScale(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="hub-btn sm" style={{ cursor: "pointer" }} title="Pick one or more saved photos">
              🖼️ Choose photos
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { readScale(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        <div className="hub-m">
          Entries were written on paper? Type the sheet&apos;s <b>total amount</b> for each line. These totals <b>stay in this Cash tally only</b>. The register, stock, sales, reports, GST and party balances are not changed. Paper sales do not appear in the day&apos;s sales report until they are entered in the app.
        </div>
        {scanBusy && <div className="hub-banner">{scanBusy}</div>}
        <div className="csh-memo">
          <div className="csh-memo-h"><span>LINE</span><span>IN APP NOW</span><span>MEMO TOTAL ₹</span></div>
          {MEMO_LINES.map((l) => {
            const m = MEMO_META[l];
            const a = api?.app[l];
            const saved = memoOf(l);
            const d = drafts[l];
            const typed = d && d.amt.trim() !== "";
            return (
              <div key={l} className={`csh-memo-r${typed ? " typing" : ""}`}>
                <b>{m.icon} {m.en}</b>
                <span>{a ? rs(a.amount) : "—"}{saved ? <em> · 📋 {rs(saved.amountInr)}</em> : null}</span>
                <span className="csh-in">
                  <input type="number" inputMode="decimal" min={0} placeholder={saved ? String(saved.amountInr) : "₹"} aria-label={`${m.en} memo total`} value={d?.amt ?? ""} onChange={(e) => setDraft(l, { amt: e.target.value, source: d?.source === "scale-scan" ? "scale-scan" : "typed" })} />
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
          <span className="hub-m">Sales on the sheet include GPay / PhonePe, so the UPI totals you type above are taken off the Sales cash. Other lines count as cash. Lines without a saved total use the app&apos;s own cash.</span>
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

      {/* ---- full cash tally report (prints cleanly) ---- */}
      <section className="hub-card csh-report" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>📄 Cash tally report — {date} · {LABEL[session]}</h3>
          <div className="hr stk-row"><button className="hub-btn sm" onClick={() => window.print()}>🖨️ Print / save PDF</button></div>
        </div>
        {api && summary ? (
          <>
            <div className="csh-rhead">
              <div><span>Cash in counter</span><b>{rs(sys)}</b><small>{usingMemo ? "uses memo sheet / typed figures" : "from app entries"}</small></div>
              <div><span>Cash counted</span><b>{counted > 0 ? rs(counted) : "—"}</b><small>{counted <= 0 ? "count not done yet" : usingDirect ? "typed total" : "added from notes"}</small></div>
              <div className={counted > 0 && big ? "bad" : ""}><span>Gap</span><b>{counted <= 0 ? "—" : Math.abs(diff) < 1 ? "✓ matches" : `${diff < 0 ? "short" : "extra"} ${rs(Math.abs(diff))}`}</b><small>₹300 or more is flagged</small></div>
              <div><span>UPI received</span><b>{rs(upiGpay + upiPhonepe)}</b><small>not in the counter</small></div>
            </div>
            <div className="csh-rgrid">
              <div>
                <h4>1 · How the counter cash is made</h4>
                {summary.inRows.map((r) => <div key={r.label} className="r"><span>＋ {r.label}</span><b>{rs(r.amount)}</b></div>)}
                <div className="r tot"><span>Total cash in</span><b>{rs(summary.totalIn)}</b></div>
                {summary.outRows.map((r) => <div key={r.label} className="r"><span>－ {r.label}</span><b>{rs(r.amount)}</b></div>)}
                <div className="r tot"><span>Total cash out</span><b>{rs(summary.totalOut)}</b></div>
                <div className="r tot big"><span>Cash that should be in the counter</span><b>{rs(summary.expected)}</b></div>
              </div>
              <div>
                <h4>2 · Cash counted</h4>
                {usingDirect ? (
                  <div className="r"><span>Total typed directly (notes not used)</span><b>{rs(counted)}</b></div>
                ) : (
                  <>
                    {DENOMINATIONS.filter((d) => nums[String(d)] > 0).map((d) => <div key={d} className="r"><span>₹{d} × {nums[String(d)]}</span><b>{rs(d * nums[String(d)])}</b></div>)}
                    {parseFloat(coins) > 0 && <div className="r"><span>Coins</span><b>{rs(parseFloat(coins))}</b></div>}
                    <div className="r tot"><span>Total cash counted</span><b>{rs(counted)}</b></div>
                  </>
                )}
                <h4 style={{ marginTop: 10 }}>3 · UPI, scale and handover</h4>
                <div className="r"><span>📱 Shop GPay</span><b>{rs(upiGpay)}</b></div>
                <div className="r"><span>🟣 Owner PhonePe</span><b>{rs(upiPhonepe)}</b></div>
                <div className="r"><span>⚖️ Scale report</span><b>{api.scale ? `${api.scale.totalKg ?? "?"} kg · ${api.scale.totalInr != null ? rs(api.scale.totalInr) : "?"}` : "not scanned"}</b></div>
                {stockCards.filter((c) => c.kg != null).map((c) => <div key={c.key} className="r"><span>Stock · {c.name}</span><b>{c.kg!.toLocaleString("en-IN")} kg{c.low ? " · LOW" : ""}</b></div>)}
                <div className="r"><span>Counted by → handed to</span><b>{api.handovers?.[session] ? `${api.handovers[session]!.countedBy} → ${api.handovers[session]!.handedTo}` : "not saved"}</b></div>
                <div className="r"><span>Entries still missing</span><b>{missing ? `${missing} to do` : "none"}</b></div>
              </div>
              <div>
                <h4>4 · Entry log — every entry with date, time and who</h4>
                <div className="hub-m">Kept for good. Changes and removals are added to this list, never erased.</div>
                {api.log.length === 0 ? <div className="hub-empty">Nothing typed in this tally yet.</div> : api.log.slice(0, 40).map((l) => (
                  <div key={l.id} className="r log"><span><small>{logTime(l.createdAt)}</small> {logWhat(l)} <small>· {l.enteredByName || "—"}</small></span><b>{logAmount(l)}</b></div>
                ))}
              </div>
            </div>
            <div className="hub-m">Informational report. Memo sheet and typed totals stay inside the Cash tally. They never change the register, stock, GST or party reports.</div>
          </>
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
            <div className="hub-m">The report does not say cash or UPI. If some sales were GPay or PhonePe, type those totals in the UPI box. Cans are counted in pieces and left out of the kg.</div>
            <button className="hub-btn" style={{ background: "var(--h-g)", color: "#fff" }} disabled={busy || (!scanOut.report.lines.length && scanOut.report.totalInr == null)} onClick={useScale}>✓ Use these numbers</button>
          </div>
        </div>
      )}
    </div>
  );
}
