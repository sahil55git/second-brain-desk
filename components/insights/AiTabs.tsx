"use client";

// 🧑‍💼 Insights → AI CFO report and 🔄 Tally / Vyapar export.
import { useEffect, useState } from "react";
import { DEFAULT_LEDGERS, type TallyLedgers } from "@/lib/tally";

const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function CfoTab() {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<{ report: string | null; pack: string; error?: string } | null>(null);
  const [showPack, setShowPack] = useState(false);
  const run = async () => {
    setBusy(true);
    const j = await fetch("/api/cfo", { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Network problem." }));
    setR({ report: j.data?.report || null, pack: j.data?.pack || "", error: j.error });
    setBusy(false);
  };
  return (
    <>
      <div className="ins-row"><button className="hub-btn primary" disabled={busy} onClick={() => void run()}>{busy ? "Writing the report…" : "🧑‍💼 Write this month's CFO report"}</button><span className="hub-m small">Also sent to Telegram / Discord on the 1st of every month for the month before.</span></div>
      {r?.error && !r.report && <div className="hub-banner">{r.error}</div>}
      {r?.report && <section className="hub-card ins-wk" style={{ whiteSpace: "pre-wrap" }}>{r.report}</section>}
      {r?.pack && <><button className="hub-btn sm" onClick={() => setShowPack(!showPack)}>{showPack ? "Hide" : "Show"} the numbers it used</button>{showPack && <pre className="hub-card" style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 400, overflow: "auto" }}>{r.pack}</pre>}</>}
      <p className="hub-m small">Margins, cash risk, leaks and three actions — written from your own numbers. Guidance only, not professional tax advice.</p>
    </>
  );
}

export function TallyTab({ today }: { today: string }) {
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [L, setL] = useState<TallyLedgers>(DEFAULT_LEDGERS);
  const [check, setCheck] = useState<{ vouchers: number; unbalanced: string[]; byType: Record<string, number> } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch("/api/settings/app?key=backup").then((r) => r.json()).then((j) => j.data?.tally && setL((x) => ({ ...x, ...j.data.tally }))).catch(() => {}); }, []);
  const saveL = async () => {
    const cur = await fetch("/api/settings/app?key=backup").then((r) => r.json()).catch(() => ({}));
    const r = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "backup", data: { ...(cur.data || {}), tally: L } }) });
    setMsg(r.ok ? "Ledger names saved ✓" : "Could not save");
  };
  const doCheck = async () => setCheck((await fetch(`/api/tally?from=${from}&to=${to}&check=1`).then((r) => r.json()).catch(() => ({}))).data || null);
  const lf = (k: keyof TallyLedgers, label: string) => <label>{label} <input value={L[k] || ""} onChange={(e) => setL({ ...L, [k]: e.target.value })} /></label>;
  return (
    <>
      <section className="hub-card">
        <h3>🔄 Tally Prime</h3>
        <div className="ins-row">
          <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="hub-btn sm" onClick={() => { setFrom(`${shift(`${today.slice(0, 8)}01`, -1).slice(0, 8)}01`); setTo(shift(`${today.slice(0, 8)}01`, -1)); }}>Last month</button>
          <button className="hub-btn" onClick={() => void doCheck()}>Check</button>
          <a className="hub-btn primary" href={`/api/tally?from=${from}&to=${to}`}>⬇ Tally XML</a>
        </div>
        {check && <p className={check.unbalanced.length ? "bad" : "hub-m"}>{check.vouchers} vouchers ({Object.entries(check.byType).map(([k, v]) => `${v} ${k}`).join(", ")}){check.unbalanced.length ? ` · not balanced: ${check.unbalanced.slice(0, 5).join(", ")}` : " · all balanced ✓"}</p>}
        <p className="hub-m small">In Tally: Gateway → Import → Vouchers → choose this file. Make sure the ledgers below exist in Tally (party ledgers are made with the customer / supplier name).</p>
      </section>
      <section className="hub-card">
        <h3>Ledger names in your Tally</h3>
        <div className="ins-row">{lf("company", "Company")}{lf("sales", "Sales")}{lf("purchase", "Purchase")}{lf("cash", "Cash")}{lf("bank", "Bank / UPI")}{lf("cgst", "CGST")}{lf("sgst", "SGST")}{lf("igst", "IGST")}{lf("expenses", "Expenses")}{lf("salary", "Salary")}</div>
        <div className="ins-row"><button className="hub-btn primary" onClick={() => void saveL()}>Save names</button>{msg && <span className="hub-m">{msg}</span>}</div>
      </section>
      <section className="hub-card">
        <h3>📗 Vyapar</h3>
        <p className="hub-m">Bring Vyapar data in: Settings → 📥 Import / Export (Vyapar Excel / day book). Send to Vyapar: download the sales and purchase Excel from <a href="/reports">Reports</a> and import it in Vyapar → Utilities → Import Items / Parties.</p>
      </section>
      <p className="hub-m small">An accounting helper only — check the books with your CA before filing.</p>
    </>
  );
}
