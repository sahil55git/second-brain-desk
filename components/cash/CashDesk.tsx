"use client";

// Cash tally desk (/cash) — count the counter cash note by note in its own
// window. Expected cash is computed on the SERVER from the day's entries (same
// maths + ₹300 rule as the Quick Register and Daily Closing desk); saving goes
// through /api/register/tally, so every screen sees the same record.
import { useCallback, useEffect, useState } from "react";
import { DENOMINATIONS, businessDate, denominationTotal } from "@/lib/register";

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
interface CashApi {
  opening: number;
  buckets: Record<string, number>;
  systemCash: number;
  sessions: Record<Session, Saved | null>;
}

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
  const sys = api?.systemCash ?? 0;
  const diff = counted - sys; // + extra, − short
  const big = Math.abs(sys - counted) >= 300;
  const saved = api?.sessions[session] || null;
  const notes = DENOMINATIONS.reduce((a, d) => a + nums[String(d)], 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/register/tally", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, session, coins: parseFloat(coins) || 0, denoms: nums }) });
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

  const bk = api?.buckets;
  const inRows: [string, number][] = bk ? [["Opening", bk.cashInOpening], ["Sales (cash)", bk.cashInSales], ["Other in (udhar received)", bk.cashInOther]] : [];
  const outRows: [string, number][] = bk
    ? [["Job-work payouts", bk.cashOutGrn], ["Expenses / purchases", bk.cashOutExpenses + bk.cashOutOther], ["Salary", bk.cashOutSalary], ["UPI out", bk.cashOutUpi], ["Owner draw / pigmee", bk.cashOutDraw]]
    : [];

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
        <div className="hub-kpi b"><div className="l">Should be in counter</div><div className="v">{rs(sys)}</div><div className="s">opening {rs(api?.opening ?? 0)} + today&apos;s movement</div></div>
        <div className="hub-kpi"><div className="l">Counted now</div><div className="v">{rs(counted)}</div><div className="s">{notes} notes{parseFloat(coins) ? ` + ${rs(parseFloat(coins))} coins` : ""}</div></div>
        <div className={`hub-kpi ${counted <= 0 ? "" : big ? "r" : "g"}`}>
          <div className="l">Gap</div>
          <div className="v">{counted <= 0 ? "—" : Math.abs(diff) < 1 ? "✓ matches" : `${diff < 0 ? "short" : "extra"} ${rs(Math.abs(diff))}`}</div>
          <div className="s">₹300 or more is flagged</div>
        </div>
      </div>

      <section className="hub-card">
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

      <section className="hub-card" style={{ marginTop: 12 }}>
        <div className="hub-card-head">
          <h3>🧮 How the expected cash is made</h3>
        </div>
        {bk ? (
          <div className="csh-sys">
            {inRows.map(([k, v]) => <div key={k}><span>＋ {k}</span><b>{rs(v)}</b></div>)}
            {outRows.map(([k, v]) => <div key={k}><span>－ {k}</span><b>{rs(v)}</b></div>)}
            <div><span><b>= Should be in counter</b></span><b>{rs(sys)}</b></div>
          </div>
        ) : (
          <div className="hub-empty">Loading…</div>
        )}
      </section>
    </div>
  );
}
