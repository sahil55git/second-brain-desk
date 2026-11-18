"use client";

// Cashier desk: for the person who takes the money (manager) on a separate device. Held bills wait here;
// type what the customer gave, see the change, one tap records the cash and releases the goods.
// Same data and permissions as the counter; nothing is stored on this device except the language and print choice.
import { parseTheme } from "@/lib/counterTheme";
import OilIcon, { BookIcon, CashOut, CoinIcon, OilOut, PayIcon, PhoneIcon, PrinterIcon, TickIcon } from "./OilIcon";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReceiptSheet from "@/components/print/ReceiptSheet";
import { cashReceived, changeFor, noteChips } from "@/lib/cashDesk";
import { billMatches, billsSummary, groupBills, type SaleRow, type SavedBill } from "@/lib/counterRecords";
import { daySummaryDoc } from "@/lib/counterShare";
import { handoverOf, heldNeed, heldQueue, isTracked, payStatus, waitText } from "@/lib/counterTrack";
import { billName, qtyText, oilKgText } from "@/lib/counterName";
import { receiptTime, rupees, type ReceiptDoc } from "@/lib/receipt";
import { businessDate } from "@/lib/register";
import "./cashier.css";

type Tab = "queue" | "parked" | "bills" | "report";
interface ParkedBill { id: string; label: string; total: number; heldBy: string | null; createdAt: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export default function CashierDesk() {
  const [kn, setKn] = useState(false);
  const k = (en: string, ka: string) => (kn ? ka : en);
  const [tab, setTab] = useState<Tab>("queue");
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [parked, setParked] = useState<ParkedBill[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [given, setGiven] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [rcpt, setRcpt] = useState<ReceiptDoc | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [, setTick] = useState(0);
  const today = businessDate(Date.now());

  useEffect(() => {
    try {
      setKn(localStorage.getItem("counterLang") === '"kn"');
      setAutoPrint(localStorage.getItem("cashierAutoPrint") === "true");
    } catch { /* private mode: defaults */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/register/range?from=${today}&to=${today}`, { cache: "no-store" }),
        fetch("/api/register/counter-holds", { cache: "no-store" }),
      ]);
      const j = await a.json();
      if (!a.ok) throw new Error(j.error || "Could not load bills.");
      setBills(groupBills(j.data as SaleRow[], (item, label) => label || item || "Item"));
      if (b.ok) setParked(((await b.json()).data || []) as ParkedBill[]);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load bills.");
    }
  }, [today]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { setTick((n) => n + 1); void load(); }, 10_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const queue = useMemo(() => heldQueue(bills), [bills]);
  const waiting = queue.filter((b) => heldNeed(b.modes, b.track) !== "READY").length;
  const sum = useMemo(() => billsSummary(bills), [bills]);
  const cashIn = useMemo(() => cashReceived(bills), [bills]);
  const bill = bills.find((b) => b.key === sel) || null;

  const open = (b: SavedBill) => { setSel(b.key); setGiven(""); setArmed(null); setMsg(null); };
  const close = () => { setSel(null); setGiven(""); setArmed(null); };

  const slip = (b: SavedBill, cashGiven?: number): ReceiptDoc => {
    const cash = b.modes.CASH || 0;
    const g = cashGiven ?? b.track.cashOk?.given;
    const ch = g && cash ? changeFor(cash, g).change : 0;
    return {
      title: "RECEIPT",
      no: b.no,
      when: receiptTime(b.createdAt),
      party: b.party || undefined,
      rows: b.lines.map((l) => ({ name: l.label, detail: l.qty ? `${l.qty.toFixed(l.unit === "pcs" ? 0 : 3)} ${l.unit || ""} × ₹${l.rate ?? ""}` : undefined, amount: rupees(l.amount) })),
      totals: [
        { label: "TOTAL", value: rupees(b.total), strong: true },
        ...(g ? [{ label: "Cash given", value: rupees(g) }, ...(ch > 0 ? [{ label: "Change", value: rupees(ch) }] : [])] : []),
      ],
      notes: [`Mode: ${Object.keys(b.modes).join(" + ")}`],
    };
  };

  async function act(b: SavedBill, action: "handover" | "upiOk" | "cashOk", extra: Record<string, unknown>, done: string, cashGiven?: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: b.ids, action, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not update the bill.");
      setMsg({ ok: true, text: done });
      close();
      await load();
      if (autoPrint && action === "cashOk") setRcpt(slip(b, cashGiven));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not update the bill." });
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  const sheet = (() => {
    if (!bill) return null;
    const ps = payStatus(bill.modes, bill.track);
    const need = isTracked(bill.track) ? heldNeed(bill.modes, bill.track) : "READY";
    const held = isTracked(bill.track) && handoverOf(bill.track) === "HELD";
    const g = parseFloat(given) || 0;
    const { change, short } = changeFor(ps.cashDue, g);
    const upiLeft = ps.upiDue > 0;
    const onCash = () => {
      if (!g) return setMsg({ ok: false, text: k("Type how much the customer gave.", "ಗ್ರಾಹಕರು ಎಷ್ಟು ಕೊಟ್ಟರು ಎಂದು ಬರೆಯಿರಿ.") });
      if (short > 0) return setMsg({ ok: false, text: k(`₹${short} short. Ask for the rest.`, `₹${short} ಕಡಿಮೆ ಇದೆ. ಉಳಿದದ್ದು ಕೇಳಿ.`) });
      void act(bill, "cashOk", { given: g, release: !upiLeft }, `#${bill.no} · ${k("cash received", "ನಗದು ಬಂದಿದೆ")}${change > 0 ? ` · ${k("return", "ಹಿಂತಿರುಗಿಸಿ")} ${rupees(change)}` : ""}${upiLeft ? "" : ` · ${k("oil given", "ಎಣ್ಣೆ ಬಿಡುಗಡೆ")}`}`, g);
    };
    return (
      <div className="cd-modal" role="dialog" aria-label={k("Take payment", "ಪಾವತಿ ಪಡೆಯಿರಿ")} onClick={() => !busy && close()}>
        <div className="cd-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="cd-head">
            <b>#{bill.no}{` · ${billName(bill.party, bill.modes)}`}</b>
            <button type="button" onClick={close} aria-label="Close">✕</button>
          </div>
          <ul className="cd-lines">
            {bill.lines.map((l, i) => <li key={i}><span><b>{l.label}</b>{qtyText(l.qty, l.unit) ? <em>{qtyText(l.qty, l.unit)}</em> : null}</span><b>{rupees(l.amount)}</b></li>)}
            <li className="tot"><span>{k("Bill total", "ಬಿಲ್ ಒಟ್ಟು")}</span><b>{rupees(bill.total)}</b></li>
          </ul>

          {ps.cashDue > 0 && (
            <div className="cd-cash">
              <div className="due"><CoinIcon size={30} /> {k("Cash in", "ನಗದು ಬರಬೇಕು")} – <b>{rupees(ps.cashDue)}</b></div>
              <label>{k("Customer gave", "ಗ್ರಾಹಕರು ಕೊಟ್ಟದ್ದು")} ₹
                <input className={!g ? "cd-next" : ""} inputMode="decimal" value={given} onChange={(e) => { setGiven(e.target.value.replace(/[^\d.]/g, "")); setMsg(null); }} placeholder="0" autoFocus />
              </label>
              <div className="chips">
                {noteChips(ps.cashDue).map((n) => <button key={n} type="button" onClick={() => setGiven(String(n))}>{n === Math.ceil(ps.cashDue) ? k("Exact", "ಸರಿಯಾಗಿ") : `₹${n}`}</button>)}
              </div>
              {g > 0 && (short > 0
                ? <div className="ret short">{k("Short by", "ಕಡಿಮೆ")} {rupees(short)}</div>
                : <div className="ret">{change > 0 ? <><CashOut size={0.9} /> {k("Cash out", "ನಗದು ಹೊರಗೆ")} – <b>{rupees(change)}</b></> : k("No change to return", "ಚಿಲ್ಲರೆ ಇಲ್ಲ")}</div>)}
            </div>
          )}

          {upiLeft && (
            <div className="cd-upi">
              <span><PhoneIcon size={26} /> {k("UPI in", "UPI ಬರಬೇಕು")} – <b>{rupees(ps.upiDue)}</b></span>
              <button type="button" className={armed === "upi" ? "on" : ""} disabled={busy} onClick={() => (armed === "upi" ? void act(bill, "upiOk", {}, `#${bill.no} · UPI ${k("received", "ಬಂದಿದೆ")}`) : setArmed("upi"))}>
                {armed === "upi" ? k("Tap again: money is in my app", "ಮತ್ತೆ ಒತ್ತಿ: ಹಣ ನನ್ನ ಆ್ಯಪ್‌ನಲ್ಲಿ ಬಂದಿದೆ") : `✓ ${k("UPI in", "UPI ಬಂತು")}`}
              </button>
            </div>
          )}

          {ps.cashDue === 0 && !upiLeft && !held && <p className="cd-ok"><TickIcon size={24} /> <CoinIcon size={22} /> {k("Cash in", "ನಗದು ಬಂತು")} · <OilIcon size={22} /> {k("Oil out", "ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ")}</p>}
          {msg && !msg.ok && <p className="cd-err">{msg.text}</p>}

          <div className="cd-acts">
            {ps.cashDue > 0 && <button type="button" className={`go${g > 0 && short === 0 ? " cd-next" : ""}`} disabled={busy} onClick={onCash}><CoinIcon size={24} /> {upiLeft ? k("Cash in", "ನಗದು ಬಂತು") : k("Cash in – oil out", "ನಗದು ಬಂತು – ಎಣ್ಣೆ ಕೊಡಿ")} – {rupees(ps.cashDue)}</button>}
            {ps.cashDue === 0 && held && need === "READY" && <button type="button" className="go cd-next" disabled={busy} onClick={() => void act(bill, "handover", { value: "GIVEN" }, `#${bill.no} · ${k("oil given", "ಎಣ್ಣೆ ಬಿಡುಗಡೆ")}`)}><OilOut kg={oilKgText(bill.lines)} size={0.7} /></button>}
            {held && need !== "READY" && (
              <button type="button" className={`ghost${armed === "give" ? " on" : ""}`} disabled={busy} onClick={() => (armed === "give" ? void act(bill, "handover", { value: "GIVEN" }, `#${bill.no} · ${k("oil given without payment", "ಹಣವಿಲ್ಲದೆ ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ")}`) : setArmed("give"))}>
                {armed === "give" ? k("Money NOT received — tap again to give anyway", "ಹಣ ಬಂದಿಲ್ಲ — ಆದರೂ ಕೊಡಲು ಮತ್ತೆ ಒತ್ತಿ") : <><OilIcon size={20} /> {k("Give anyway", "ಆದರೂ ಕೊಡಿ")}</>}
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setRcpt(slip(bill, g > 0 && short === 0 ? g : undefined))}><PrinterIcon size={24} /> {k("Receipt", "ರಸೀದಿ")}</button>
          </div>
        </div>
      </div>
    );
  })();

  const state = (b: SavedBill) => {
    if (!isTracked(b.track)) return { cls: "paid", text: <><TickIcon size={18} /> {k("Paid", "ಪಾವತಿ")}</> };
    const ps = payStatus(b.modes, b.track);
    if (handoverOf(b.track) === "HELD") return { cls: ps.state === "PAID" ? "ready" : "wait", text: ps.state === "PAID" ? <><OilIcon size={18} /> {k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}</> : `⏳ ${k("Held", "ಹಿಡಿದಿದೆ")}` };
    if (ps.creditDue > 0) return { cls: "wait", text: <><BookIcon size={18} /> {k("Udhaar", "ಉದ್ರಿ")} – {rupees(ps.creditDue)}</> };
    return { cls: "paid", text: <><TickIcon size={18} /> {k("Paid", "ಪಾವತಿ")}</> };
  };

  const shown = bills.filter((b) => billMatches(b, q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const [clockMs, setClockMs] = useState(0);
  useEffect(() => { setClockMs(Date.now()); const t = setInterval(() => setClockMs(Date.now()), 20_000); return () => clearInterval(t); }, []);
  const clockTime = clockMs ? new Date(clockMs).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase() : "";
const txtStyle = useMemo(() => {
    let t = parseTheme(null);
    try { t = parseTheme(JSON.parse(localStorage.getItem("counterTheme") || "null")); } catch { /* default */ }
    const st: Record<string, string> = {};
    if (t.ink) st["--tx"] = t.ink;
    if (t.soft) st["--mut"] = t.soft;
    return st as React.CSSProperties;
  }, []);
    const TABS: [Tab, string, number | null][] = [
    ["queue", k("Queue", "ಸಾಲು"), queue.length],
    ["parked", k("Parked", "ನಿಲ್ಲಿಸಿದ"), parked.length],
    ["bills", k("Bills", "ಬಿಲ್‌ಗಳು"), null],
    ["report", k("Report", "ವರದಿ"), null],
  ];

  return (
    <div className="cd" style={txtStyle}>
      <header className="cd-top">
        <b><CoinIcon size={28} /> {k("Cashier desk", "ಕ್ಯಾಷಿಯರ್ ಡೆಸ್ಕ್")}</b>
        <span className="cd-date"><b>{clockTime}</b> <small>{today}</small></span>
        <button type="button" onClick={() => void load()} aria-label="Refresh">🔄</button>
        <button type="button" onClick={() => { const n = !kn; setKn(n); try { localStorage.setItem("counterLang", JSON.stringify(n ? "kn" : "en")); } catch { /* ignore */ } }}>{kn ? "English" : "ಕನ್ನಡ"}</button>
      </header>
      <nav className="cd-tabs" role="tablist">
        {TABS.map(([t, label, n]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}{n ? <b>{n}</b> : null}
          </button>
        ))}
      </nav>
      {err && <p className="cd-err">{err}</p>}
      {msg?.ok && <p className="cd-done" onClick={() => setMsg(null)}>✅ {msg.text}</p>}

      <main className="cd-body">
        {tab === "queue" && (
          <>
            <p className="cd-sub">{queue.length === 0 ? k("Nothing waiting. Oil of every bill has been given.", "ಏನೂ ಕಾಯುತ್ತಿಲ್ಲ. ಎಲ್ಲಾ ಬಿಲ್‌ಗಳ ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ.") : waiting > 0 ? `⏳ ${waiting} ${k("waiting for money", "ಹಣಕ್ಕೆ ಕಾಯುತ್ತಿವೆ")}` : `✅ ${k("All paid — give the oil", "ಎಲ್ಲಾ ಹಣ ಬಂದಿದೆ — ಎಣ್ಣೆ ಕೊಡಿ")}`}</p>
            <form className="cd-find" onSubmit={(e) => { e.preventDefault(); const m = queue.filter((b) => billMatches(b, q)); if (m.length === 1) { open(m[0]); setQ(""); } }}>
              <input inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value.replace(/[^\w ]/g, ""))} placeholder={k("Bill number on the slip", "ಸ್ಲಿಪ್‌ನ ಬಿಲ್ ಸಂಖ್ಯೆ")} aria-label={k("Bill number", "ಬಿಲ್ ಸಂಖ್ಯೆ")} />
              <button type="submit">{k("Open", "ತೆರೆಯಿರಿ")}</button>
            </form>
            <ul className="cd-list">
              {queue.filter((b) => billMatches(b, q)).map((b) => {
                const ps = payStatus(b.modes, b.track);
                const need = heldNeed(b.modes, b.track);
                const age = Date.now() - new Date(b.createdAt).getTime();
                return (
                  <li key={b.key}>
                    <button type="button" className={need === "READY" ? "ready" : age > 15 * 60_000 ? "late" : ""} onClick={() => open(b)}>
                      <span className="r1"><b>#{b.no}{` · ${billName(b.party, b.modes)}`}</b><strong>{rupees(b.total)}</strong></span>
                      <span className="r2">{b.lines.map((l) => `${l.label}${qtyText(l.qty, l.unit) ? " " + qtyText(l.qty, l.unit) : ""}`).join(" · ")}</span>
                      <span className="r3">
                        <span>⏱ {waitText(age)}</span>
                        {ps.cashDue > 0 && <span className="wait"><CoinIcon size={20} /> {k("Cash in", "ನಗದು ಬರಬೇಕು")} – {rupees(ps.cashDue)} ⏳</span>}
                        {ps.upiDue > 0 && <span className="wait"><PhoneIcon size={20} /> {k("UPI in", "UPI ಬರಬೇಕು")} – {rupees(ps.upiDue)} ⏳</span>}
                        {need === "READY" && <span className="okc"><OilIcon size={22} /> {k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === "parked" && (
          <>
            <p className="cd-sub">{k("Unfinished bills parked at the counter. Open them on the counter to finish.", "ಕೌಂಟರ್‌ನಲ್ಲಿ ನಿಲ್ಲಿಸಿದ ಅಪೂರ್ಣ ಬಿಲ್‌ಗಳು. ಮುಗಿಸಲು ಕೌಂಟರ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ.")}</p>
            <ul className="cd-list plain">
              {parked.map((p) => <li key={p.id}><div><span className="r1"><b>{p.label}</b><strong>{rupees(p.total)}</strong></span><span className="r2">{p.heldBy || ""} · ⏱ {waitText(Date.now() - new Date(p.createdAt).getTime())}</span></div></li>)}
              {!parked.length && <li className="empty">{k("No parked bills.", "ನಿಲ್ಲಿಸಿದ ಬಿಲ್ ಇಲ್ಲ.")}</li>}
            </ul>
          </>
        )}

        {tab === "bills" && (
          <>
            <input className="cd-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={k("Search bill no, name or item", "ಬಿಲ್ ಸಂಖ್ಯೆ, ಹೆಸರು ಅಥವಾ ವಸ್ತು ಹುಡುಕಿ")} />
            <ul className="cd-list">
              {shown.map((b) => {
                const st = state(b);
                return (
                  <li key={b.key}>
                    <button type="button" onClick={() => open(b)}>
                      <span className="r1"><b>#{b.no}{` · ${billName(b.party, b.modes)}`}</b><strong>{rupees(b.total)}</strong></span>
                      <span className="r3"><span>{timeOf(b.createdAt)} · {Object.keys(b.modes).join(" + ")}</span><span className={st.cls === "paid" ? "okc" : "wait"}>{st.text}</span></span>
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="empty">{k("No bills today.", "ಇಂದು ಬಿಲ್ ಇಲ್ಲ.")}</li>}
            </ul>
          </>
        )}

        {tab === "report" && (
          <>
            <div className="cd-stats">
              <div><small>{k("Bills today", "ಇಂದಿನ ಬಿಲ್")}</small><b>{sum.count}</b></div>
              <div><small>{k("Sales", "ಮಾರಾಟ")}</small><b>{rupees(sum.total)}</b></div>
              <div><small>{k("Cash in", "ಬಂದ ನಗದು")}</small><b>{rupees(cashIn)}</b></div>
              <div><small>{k("Still to receive", "ಬರಬೇಕಾದದ್ದು")}</small><b>{rupees(r2(bills.reduce((a, b) => a + payStatus(b.modes, b.track).cashDue + payStatus(b.modes, b.track).upiDue, 0)))}</b></div>
            </div>
            <ul className="cd-list plain">
              {Object.entries(sum.modes).map(([m, v]) => <li key={m}><div><span className="r1"><b>{m === "CASH" || m === "UPI" || m === "CREDIT" ? <PayIcon mode={m} size={24} /> : null} {m === "CASH" ? k("Cash", "ನಗದು") : m === "CREDIT" ? k("Udhaar", "ಉದ್ರಿ") : m}</b><strong>{rupees(v)}</strong></span></div></li>)}
              <li><div><span className="r1"><b>{k("Weight sold", "ಮಾರಿದ ತೂಕ")}</b><strong>{sum.kg.toFixed(3)} kg</strong></span></div></li>
            </ul>
            <div className="cd-acts">
              <button type="button" className="go" onClick={() => setRcpt(daySummaryDoc({ when: receiptTime(Date.now()), from: today, to: today, count: sum.count, total: sum.total, kg: sum.kg, modes: sum.modes, returned: 0 }))}><PrinterIcon size={24} /> {k("Print day summary", "ದಿನದ ಸಾರಾಂಶ ಮುದ್ರಿಸಿ")}</button>
            </div>
            <label className="cd-set">
              <input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); try { localStorage.setItem("cashierAutoPrint", String(e.target.checked)); } catch { /* ignore */ } }} />
              <span>{k("Print a receipt when cash is received", "ನಗದು ಬಂದಾಗ ರಸೀದಿ ಮುದ್ರಿಸಿ")}</span>
            </label>
          </>
        )}
      </main>
      {sheet}
      {rcpt && <ReceiptSheet doc={rcpt} onClose={() => setRcpt(null)} />}
    </div>
  );
}
