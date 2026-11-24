"use client";

// Cashier desk: for the person who takes the money (manager) on a separate device. Held bills wait here;
// type what the customer gave, see the change, one tap records the cash and releases the goods.
// Same data and permissions as the counter; nothing is stored on this device except the language and print choice.
import DeskVoice from "./DeskVoice";
import { voiceCashDue, type DeskCommand } from "@/lib/deskVoice";
import { onAccent, parseTheme } from "@/lib/counterTheme";
import OilIcon, { BookIcon, CashIn, CashOut, CoinIcon, HourglassIcon, OilOut, PauseIcon, PhoneIcon, PrinterIcon, TickIcon } from "./OilIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReceiptSheet, { useShop } from "@/components/print/ReceiptSheet";
import PrinterChip from "@/components/print/PrinterChip";
import BillReports from "./BillReports";
import UnprintedSlips from "@/components/print/UnprintedSlips";
import { changeFor, noteChips } from "@/lib/cashDesk";
import { billMatches, billsSummary, groupBills, type SaleRow, type SavedBill } from "@/lib/counterRecords";
import { daySummaryDoc } from "@/lib/counterShare";
import { handoverOf, heldNeed, heldQueue, isTracked, keptList, oilBlockedAmount, payStatus, waitText } from "@/lib/counterTrack";
import { billName, qtyText, oilKgText } from "@/lib/counterName";
import { receiptTime, rupees, type ReceiptDoc } from "@/lib/receipt";
import { businessDate } from "@/lib/register";
import ReceivePayment, { type RecvDraft } from "./ReceivePayment";
import BillDetails from "./BillDetails";
import "./cashier.css";

type Tab = "queue" | "kept" | "parked" | "bills" | "report";
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
  const [detFor, setDetFor] = useState<SavedBill | null>(null);
  const [showLines, setShowLines] = useState(false);
  // "Take money & hold": what was typed for a bill stays on this tablet until the customer is finished
  const [holds, setHolds] = useState<Record<string, RecvDraft>>({});
  useEffect(() => { try { setHolds(JSON.parse(localStorage.getItem("counterRecvHold") || "{}") || {}); } catch { /* none */ } }, []);
  const putHold = (key: string, d: RecvDraft | null) => setHolds((h) => {
    const n = { ...h };
    if (d) n[key] = d; else delete n[key];
    try { localStorage.setItem("counterRecvHold", JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const [beep, setBeep] = useState(true);
  const seenQ = useRef<Set<string> | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [, setTick] = useState(0);
  const shop = useShop();
  // select many bills and finish them together (money received / give oil)
  const [selMode, setSelMode] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [bulk, setBulk] = useState<null | "money" | "oil" | "both">(null);
  const [bulkPay, setBulkPay] = useState<"CASH" | "UPI">("CASH");
  const [bulkBusy, setBulkBusy] = useState(false);
  // reports: any date range, loaded on demand
  const [rBills, setRBills] = useState<SavedBill[]>([]);
  const [rFrom, setRFrom] = useState("");
  const [rTo, setRTo] = useState("");
  const [rRet, setRRet] = useState(0);
  const [rErr, setRErr] = useState("");
  const today = businessDate(Date.now());

  useEffect(() => {
    try {
      setKn(localStorage.getItem("counterLang") === '"kn"');
      setAutoPrint(localStorage.getItem("cashierAutoPrint") === "true");
      setBeep(localStorage.getItem("cashierBeep") !== "false");
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
      const fresh = groupBills(j.data as SaleRow[], (item, label) => label || item || "Item");
      setBills(fresh);
      if (b.ok) setParked(((await b.json()).data || []) as ParkedBill[]);
      setErr("");
      return fresh;
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

  const loadReport = useCallback(async (f: string, t: string) => {
    setRFrom(f); setRTo(t); setRErr("");
    try {
      const res = await fetch(`/api/register/range?from=${f}&to=${t}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load bills.");
      setRBills(groupBills(j.data as SaleRow[], (item, label) => label || item || "Item"));
      setRRet(Math.round((j.data as SaleRow[]).filter((r) => r.kind === "SALE_RETURN").reduce((s, r) => s + r.amountInr, 0) * 100) / 100);
    } catch (e) {
      setRErr(e instanceof Error ? e.message : "Could not load bills.");
    }
  }, []);

  const dueOf = (b: SavedBill) => {
    if (!isTracked(b.track)) return 0;
    if (b.track.payPending) return b.total;
    const ps = payStatus(b.modes, b.track);
    return ps.cashDue + ps.upiDue;
  };
  const oilHeldOf = (b: SavedBill) => isTracked(b.track) && handoverOf(b.track) === "HELD";
  const oilReadyOf = (b: SavedBill) => oilHeldOf(b) && !b.track.payPending && oilBlockedAmount(b.modes, b.track) <= 0;
  const picked = bills.filter((b) => pick.includes(b.key));
  const pickedDue = picked.reduce((s, b) => s + dueOf(b), 0);
  const toPay = bills.filter((b) => dueOf(b) > 0);
  const toPayTotal = r2(toPay.reduce((s, b) => s + dueOf(b), 0));
  const togglePick = (key: string) => setPick((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));
  const endSelect = () => { setSelMode(false); setPick([]); };

  async function voiceCommand(cmd: DeskCommand) {
    if (cmd.action !== "all" && cmd.action !== "cash") return k("Use Weigh & Bill for returns, cancellations and discounts.", "ವಾಪಸ್, ರದ್ದು ಮತ್ತು ರಿಯಾಯಿತಿಗೆ ತೂಕ ಮತ್ತು ಬಿಲ್ ಬಳಸಿ.");
    const fresh = await load();
    if (!fresh) return k("Could not load today's bills.", "ಇಂದಿನ ಬಿಲ್‌ಗಳು ಸಿಗಲಿಲ್ಲ.");
    let selection = fresh.filter(b => dueOf(b) > 0);
    if (cmd.action === "cash") {
      const matches = fresh.filter(b => b.no === cmd.no);
      if (matches.length !== 1) return k("No unique bill with that number today.", "ಇಂದು ಆ ಸಂಖ್ಯೆಯ ಬಿಲ್ ಸಿಗಲಿಲ್ಲ.");
      const bill = matches[0];
      if (!voiceCashDue(bill)) return k("No cash due on this bill.", "ಈ ಬಿಲ್‌ನಲ್ಲಿ ನಗದು ಬಾಕಿ ಇಲ್ಲ.");
      if (!bill.track.payPending) { open(bill); return; }
      selection = [bill];
    }
    if (!selection.length) return k("No payments pending today.", "ಇಂದು ಹಣ ಬಾಕಿ ಇಲ್ಲ.");
    setTab("bills"); setQ(""); setSelMode(true); setPick(selection.map(b => b.key)); setBulkPay("CASH"); setBulk("money");
  }

  const runBulk = async (what: "money" | "oil" | "both") => {
    setBulkBusy(true);
    setMsg(null);
    let done = 0;
    const skipped: string[] = [];
    const failed: string[] = [];
    for (const b of picked) {
      try {
        const post = async (action: string, extra: Record<string, unknown> = {}) => {
          const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: b.ids, action, ...extra }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || "failed");
        };
        const ps = isTracked(b.track) ? payStatus(b.modes, b.track) : null;
        let did = false;
        if (what !== "oil" && ps && dueOf(b) > 0) {
          if (b.track.payPending) await post("settle", { parts: [{ mode: bulkPay, amount: b.total }], upiConfirmed: bulkPay === "UPI", release: what === "both" });
          else { if (ps.cashDue > 0) await post("cashOk"); if (ps.upiDue > 0) await post("upiOk"); }
          did = true;
          putHold(b.key, null);
        }
        if (what !== "money" && oilHeldOf(b) && !(what === "both" && b.track.payPending)) {
          if (what === "oil" && !oilReadyOf(b)) { skipped.push(`#${b.no}`); continue; }
          await post("handover", { value: "GIVEN" });
          did = true;
        }
        if (did) done++; else skipped.push(`#${b.no}`);
      } catch { failed.push(`#${b.no}`); }
    }
    await load();
    setBulkBusy(false);
    setBulk(null);
    setPick(failed.length ? picked.filter((b) => failed.includes(`#${b.no}`)).map((b) => b.key) : []);
    if (!failed.length) setSelMode(false);
    setMsg({ ok: failed.length === 0, text: `${done} ${k("bill(s) done", "ಬಿಲ್ ಮುಗಿದಿದೆ")}${skipped.length ? ` · ${k("nothing to do for", "ಮಾಡಲು ಏನಿಲ್ಲ")} ${skipped.join(", ")}` : ""}${failed.length ? ` · ${k("failed", "ವಿಫಲ")}: ${failed.join(", ")}` : ""}` });
  };

  const queue = useMemo(() => heldQueue(bills), [bills]);
  const kept = useMemo(() => keptList(bills), [bills]);
  // a short beep + buzz when a new bill reaches the queue (the cashier is often looking elsewhere)
  useEffect(() => {
    const now = new Set(queue.map((b) => b.key));
    const prev = seenQ.current;
    seenQ.current = now;
    if (!prev || !beep) return;
    if (!Array.from(now).some((x) => !prev.has(x))) return;
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.25);
      setTimeout(() => void ctx.close(), 400);
    } catch { /* blocked until the first tap */ }
  }, [queue, beep]);
  const waiting = queue.filter((b) => heldNeed(b.modes, b.track) !== "READY").length;
  const sum = useMemo(() => billsSummary(bills), [bills]);
  const bill = bills.find((b) => b.key === sel) || null;

  const tap = (b: SavedBill) => (selMode ? togglePick(b.key) : open(b));
  const open = (b: SavedBill) => { setSel(b.key); setGiven(holds[b.key]?.given || ""); setArmed(null); setMsg(null); };
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

  async function act(b: SavedBill, action: "handover" | "upiOk" | "cashOk" | "keep", extra: Record<string, unknown>, done: string, cashGiven?: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: b.ids, action, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not update the bill.");
      setMsg({ ok: true, text: done });
      putHold(b.key, null);
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
    if (bill.track.payPending) {
      return (
        <ReceivePayment
          no={bill.no}
          total={bill.total}
          party={bill.party}
          items={bill.lines.map((l) => l.label).join(", ")}
          k={k}
          onClose={close}
          draft={holds[bill.key]}
          onHold={(d) => { putHold(bill.key, d); close(); setMsg({ ok: true, text: `#${bill.no} · ⏸ ${k("money taken – on hold. Finish it from the Queue.", "ಹಣ ತೆಗೆದುಕೊಂಡಿದೆ – ಹಿಡಿದಿದೆ. ಸಾಲಿನಿಂದ ಮುಗಿಸಿ.")}` }); }}
          onSubmit={async (a) => {
            try {
              const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: bill.ids, action: "settle", ...a }) });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) return (j.error as string) || "Could not record the payment.";
              const cashPart = a.parts.find((p) => p.mode === "CASH")?.amount || 0;
              const ch = a.given && cashPart ? changeFor(cashPart, a.given).change : 0;
              putHold(bill.key, null);
              setMsg({ ok: true, text: `#${bill.no} · ${k("payment recorded", "ಪಾವತಿ ದಾಖಲಾಗಿದೆ")}${ch > 0 ? ` · ${k("return", "ಹಿಂತಿರುಗಿಸಿ")} ${rupees(ch)}` : ""} · ${k("oil given", "ಎಣ್ಣೆ ಬಿಡುಗಡೆ")}` });
              close();
              await load();
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not record the payment.";
            }
          }}
        />
      );
    }
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
          <button type="button" className="cd-items" onClick={() => setShowLines((v) => !v)} aria-expanded={showLines}>
            <span>{bill.lines.length} {k("items", "ವಸ್ತು")} · {bill.lines.map((l) => l.label).join(", ")}</span>
            <b>{showLines ? "▴" : "▾"}</b>
          </button>
          {showLines && (
            <ul className="cd-lines">
              {bill.lines.map((l, i) => <li key={i}><span><b>{l.label}</b>{qtyText(l.qty, l.unit) ? <em>{qtyText(l.qty, l.unit)}</em> : null}</span><b>{rupees(l.amount)}</b></li>)}
            </ul>
          )}

          {/* one card: what to receive | what to give back */}
          <div className={`cd-money${ps.cashDue > 0 ? "" : " one"}`}>
            <div className="in"><small>{ps.cashDue > 0 ? <><CashIn size={0.6} /> {k("Cash in", "ನಗದು ಬರಬೇಕು")}</> : k("Bill total", "ಬಿಲ್ ಒಟ್ಟು")}</small><b>{rupees(ps.cashDue > 0 ? ps.cashDue : bill.total)}</b></div>
            {ps.cashDue > 0 && (
              <div className={`out${g > 0 ? (short > 0 ? " bad" : change > 0 ? " flash" : " ok") : ""}`}>
                <small>{g > 0 && short > 0 ? k("Short by", "ಕಡಿಮೆ") : <><CashOut size={0.6} /> {k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")}</>}</small>
                <b>{g > 0 ? rupees(short > 0 ? short : change) : "—"}</b>
              </div>
            )}
          </div>
          {ps.cashDue > 0 && (
            <div className="cd-gave">
              <label>{k("Customer gave", "ಗ್ರಾಹಕರು ಕೊಟ್ಟದ್ದು")} ₹
                <input className={!g ? "cd-next" : ""} inputMode="decimal" value={given} onChange={(e) => { setGiven(e.target.value.replace(/[^\d.]/g, "")); setMsg(null); }} placeholder="0" autoFocus />
              </label>
              <div className="chips">
                {noteChips(ps.cashDue).map((n) => <button key={n} type="button" onClick={() => setGiven(String(n))}>{n === Math.ceil(ps.cashDue) ? k("Exact", "ಸರಿಯಾಗಿ") : `₹${n}`}</button>)}
              </div>
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

          {ps.cashDue === 0 && !upiLeft && !held && <p className="cd-ok"><TickIcon size={24} /> <CashIn size={0.73} /> {k("Cash in", "ನಗದು ಬಂತು")} · <OilIcon size={22} /> {k("Oil out", "ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ")}</p>}
          {msg && !msg.ok && <p className="cd-err">{msg.text}</p>}

          <div className="cd-acts">
            {ps.cashDue > 0 && <button type="button" className={`go${g > 0 && short === 0 ? " cd-next" : ""}`} disabled={busy} onClick={onCash}><CashIn size={0.8} /> {upiLeft ? k("Cash in", "ನಗದು ಬಂತು") : k("Cash in – oil out", "ನಗದು ಬಂತು – ಎಣ್ಣೆ ಕೊಡಿ")} – {rupees(ps.cashDue)}</button>}
            {ps.cashDue > 0 && <button type="button" className="hold" disabled={busy} onClick={() => {
              if (!g) return setMsg({ ok: false, text: k("Type how much the customer gave.", "ಗ್ರಾಹಕರು ಎಷ್ಟು ಕೊಟ್ಟರು ಎಂದು ಬರೆಯಿರಿ.") });
              putHold(bill.key, { mode: "CASH", given, sp: { CASH: "", UPI: "", CREDIT: "" }, name: "", upiGot: false });
              close();
              setMsg({ ok: true, text: `#${bill.no} · ⏸ ${k("money taken – on hold. Finish it from the Queue.", "ಹಣ ತೆಗೆದುಕೊಂಡಿದೆ – ಹಿಡಿದಿದೆ. ಸಾಲಿನಿಂದ ಮುಗಿಸಿ.")}` });
            }}>⏸ {k("Hold", "ಹಿಡಿಯಿರಿ")}</button>}
            {ps.cashDue > 0 && <button type="button" className="keep" disabled={busy} onClick={() => { if (!g) return setMsg({ ok: false, text: k("Type how much the customer gave.", "ಗ್ರಾಹಕರು ಎಷ್ಟು ಕೊಟ್ಟರು ಎಂದು ಬರೆಯಿರಿ.") }); if (short > 0) return setMsg({ ok: false, text: k(`₹${short} short. Ask for the rest.`, `₹${short} ಕಡಿಮೆ ಇದೆ. ಉಳಿದದ್ದು ಕೇಳಿ.`) }); void act(bill, "cashOk", { given: g, release: false, keepOil: !upiLeft }, `#${bill.no} · ${k("cash received · oil kept in shop", "ನಗದು ಬಂತು · ಎಣ್ಣೆ ಅಂಗಡಿಯಲ್ಲಿ ಇದೆ")}${change > 0 ? ` · ${k("return", "ಹಿಂತಿರುಗಿಸಿ")} ${rupees(change)}` : ""}`, g); }}>🏪 {k("Cash in · keep oil", "ನಗದು ಬಂತು · ಎಣ್ಣೆ ಇಡಿ")}</button>}
            {ps.cashDue === 0 && held && need === "READY" && !bill.track.keep && <button type="button" className="keep" disabled={busy} onClick={() => void act(bill, "keep", { value: "ON" }, `#${bill.no} · ${k("oil kept in shop", "ಎಣ್ಣೆ ಅಂಗಡಿಯಲ್ಲಿ ಇದೆ")}`)}>🏪 {k("Keep oil in shop", "ಎಣ್ಣೆ ಅಂಗಡಿಯಲ್ಲಿ ಇಡಿ")}</button>}
            {bill.track.keep && <p className="cd-kept">🏪 {k("Kept in shop since", "ಅಂಗಡಿಯಲ್ಲಿ ಇಟ್ಟಿದ್ದು")} {timeOf(bill.track.keep.at)}</p>}
            {ps.cashDue === 0 && held && need === "READY" && <button type="button" className="go cd-next" disabled={busy} onClick={() => void act(bill, "handover", { value: "GIVEN" }, `#${bill.no} · ${k("oil given", "ಎಣ್ಣೆ ಬಿಡುಗಡೆ")}`)}><OilOut kg={oilKgText(bill.lines)} size={0.7} /></button>}
            
            <button type="button" className="ghost" onClick={() => setDetFor(bill)}>👤 {k("Customer / note", "ಗ್ರಾಹಕ / ಟಿಪ್ಪಣಿ")}</button>
            <button type="button" className="ghost" onClick={() => setRcpt(slip(bill, g > 0 && short === 0 ? g : undefined))}><PrinterIcon size={24} /> {k("Receipt", "ರಸೀದಿ")}</button>
          </div>
        </div>
      </div>
    );
  })();

  const state = (b: SavedBill) => {
    if (!isTracked(b.track)) return { cls: "paid", text: <><TickIcon size={18} /> {k("Paid", "ಪಾವತಿ")}</> };
    const ps = payStatus(b.modes, b.track);
    if (b.track.payPending) return { cls: "wait", text: <>💰 {k("Receive payment", "ಹಣ ಪಡೆಯಿರಿ")}</> };
    if (handoverOf(b.track) === "HELD" && b.track.keep) return { cls: "ready", text: <>🏪 {k("Kept in shop", "ಅಂಗಡಿಯಲ್ಲಿ ಇದೆ")}</> };
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
    if (t.go) { st["--go"] = t.go; st["--on-go"] = onAccent(t.go); }
    return st as React.CSSProperties;
  }, []);
  
  const selBar = (list: SavedBill[]) => (
    <div className="cd-selzone">
      {!selMode ? (
        <div className="cd-selrow">
          {toPay.length > 0 && <button type="button" className="payall" onClick={() => { setSelMode(true); setPick(toPay.map((b) => b.key)); setBulk("money"); }}><CashIn size={0.6} /> {k("All pending paid", "ಎಲ್ಲಾ ಬಾಕಿ ಬಂತು")} ({toPay.length} · {rupees(toPayTotal)})</button>}
          <button type="button" onClick={() => setSelMode(true)}>☑ {k("Select many", "ಹಲವು ಆಯ್ಕೆ")}</button>
        </div>
      ) : (
        <>
          <div className="cd-selrow">
            <button type="button" onClick={() => setPick(list.map((b) => b.key))}>{k("All", "ಎಲ್ಲಾ")}</button>
            <button type="button" onClick={() => setPick(list.filter((b) => dueOf(b) > 0).map((b) => b.key))}>⏳ {k("Pending only", "ಬಾಕಿ ಮಾತ್ರ")}</button>
            <button type="button" onClick={() => setPick(list.filter(oilHeldOf).map((b) => b.key))}>🔒 {k("Oil held only", "ಹಿಡಿದಿದ್ದು ಮಾತ್ರ")}</button>
            <button type="button" onClick={endSelect}>✕ {k("Cancel", "ರದ್ದು")}</button>
          </div>
          <div className="cd-selact">
            <span><b>{pick.length}</b> {k("selected", "ಆಯ್ಕೆ")}{pickedDue > 0 ? ` · ${rupees(pickedDue)} ${k("due", "ಬಾಕಿ")}` : ""}</span>
            <button type="button" disabled={!pick.length || !picked.some((b) => dueOf(b) > 0)} onClick={() => setBulk("money")}><CashIn size={0.6} /> {k("Money received", "ಹಣ ಬಂತು")}</button>
            <button type="button" disabled={!pick.length || !picked.some(oilReadyOf)} onClick={() => setBulk("oil")}><OilOut size={0.5} /> {k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}</button>
            <button type="button" className={`both${pick.length ? " cd-next" : ""}`} disabled={!pick.length || !picked.some((b) => dueOf(b) > 0 || oilHeldOf(b))} onClick={() => setBulk("both")}>✓ {k("Money + oil", "ಹಣ + ಎಣ್ಣೆ")}</button>
          </div>
        </>
      )}
    </div>
  );
  // what to do next, in plain words, with the matching thing flashing below
  const nextBill = queue.find((b) => heldNeed(b.modes, b.track) === "READY") || queue[0] || null;
  const guide: { icon: React.ReactNode; text: string } | null = (() => {
    if (bulk || sel) return null;
    if (tab !== "queue" && tab !== "bills") return null;
    if (selMode) return pick.length
      ? { icon: <TickIcon size={22} />, text: k("Now tap Money received / Give oil / Money + oil", "ಈಗ ಹಣ ಬಂತು / ಎಣ್ಣೆ ಕೊಡಿ / ಹಣ + ಎಣ್ಣೆ ಒತ್ತಿ") }
      : { icon: "👆", text: k("Tick the bills to finish together", "ಒಟ್ಟಿಗೆ ಮುಗಿಸಲು ಬಿಲ್‌ಗಳನ್ನು ಟಿಕ್ ಮಾಡಿ") };
    if (!nextBill) return { icon: <TickIcon size={22} />, text: k("All done. Nothing waiting.", "ಎಲ್ಲಾ ಮುಗಿದಿದೆ. ಏನೂ ಕಾಯುತ್ತಿಲ್ಲ.") };
    const ps = payStatus(nextBill.modes, nextBill.track);
    const due = ps.cashDue + ps.upiDue;
    return heldNeed(nextBill.modes, nextBill.track) === "READY"
      ? { icon: <OilIcon size={24} />, text: `${k("Tap bill", "ಬಿಲ್ ಒತ್ತಿ")} #${nextBill.no} → ${k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}` }
      : { icon: <CashIn size={0.7} />, text: `${k("Tap bill", "ಬಿಲ್ ಒತ್ತಿ")} #${nextBill.no} → ${k("take", "ಪಡೆಯಿರಿ")} ${rupees(nextBill.track.payPending ? nextBill.total : due)}` };
  })();
  const TABS: [Tab, string, number | null, React.ReactNode][] = [
    ["queue", k("Queue", "ಸಾಲು"), queue.length, <HourglassIcon key="i" size={22} />],
    ["kept", k("Kept", "ಇಟ್ಟಿದ್ದು"), kept.length, <span key="i" aria-hidden>🏪</span>],
    ["parked", k("Parked", "ನಿಲ್ಲಿಸಿದ"), parked.length, <PauseIcon key="i" size={22} />],
    ["bills", k("Bills", "ಬಿಲ್‌ಗಳು"), null, <BookIcon key="i" size={22} />],
    ["report", k("Report", "ವರದಿ"), null, <span key="i" aria-hidden>📊</span>],
  ];

  return (
    <div className="cd" style={txtStyle}>
      <header className="cd-top">
        <a href="/register/counter" className="cd-back" aria-label={k("Back to Weigh & Bill", "ತೂಕ & ಬಿಲ್‌ಗೆ ಹಿಂತಿರುಗಿ")}>← {k("Weigh & Bill", "ತೂಕ & ಬಿಲ್")}</a>
        <b><CoinIcon size={28} /> {k("Cashier desk", "ಕ್ಯಾಷಿಯರ್ ಡೆಸ್ಕ್")}</b>
        <DeskVoice k={k} onCommand={voiceCommand} />
        <PrinterChip shop={shop} k={k} />
        <span className="cd-date"><b>{clockTime}</b> <small>{today}</small></span>
        <button type="button" onClick={() => void load()} aria-label="Refresh">🔄</button>
        <button type="button" onClick={() => { const n = !kn; setKn(n); try { localStorage.setItem("counterLang", JSON.stringify(n ? "kn" : "en")); } catch { /* ignore */ } }}>{kn ? "English" : "ಕನ್ನಡ"}</button>
      </header>
      <UnprintedSlips kn={kn} />
      <nav className="cd-tabs" role="tablist">
        {TABS.map(([t, label, n, ic]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${tab === t ? "on" : ""}${n && t === "queue" && tab !== "queue" ? " cd-ping" : ""}`} onClick={() => { setTab(t); if (t === "report" && !rFrom) void loadReport(today, today); if (t === "parked" || t === "report" || t === "kept") endSelect(); }}>
            {ic}{label}{n ? <b>{n}</b> : null}
          </button>
        ))}
      </nav>
      {guide && <p className="cd-guide" role="status"><span className="gi">{guide.icon}</span><span>{guide.text}</span></p>}
      {err && <p className="cd-err">{err}</p>}
      {msg?.ok && <p className="cd-done" onClick={() => setMsg(null)}>✅ {msg.text}</p>}

      <main className="cd-body">
        {tab === "queue" && (
          <>
            <p className="cd-sub">{queue.length === 0 ? k("Nothing waiting. Oil of every bill has been given.", "ಏನೂ ಕಾಯುತ್ತಿಲ್ಲ. ಎಲ್ಲಾ ಬಿಲ್‌ಗಳ ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ.") : waiting > 0 ? `⏳ ${waiting} ${k("waiting for money", "ಹಣಕ್ಕೆ ಕಾಯುತ್ತಿವೆ")}` : `✅ ${k("All paid — give the oil", "ಎಲ್ಲಾ ಹಣ ಬಂದಿದೆ — ಎಣ್ಣೆ ಕೊಡಿ")}`}</p>
            {(toPay.length > 0 || queue.length > 0 || kept.length > 0) && (
              <div className="cd-strip">
                <div><small>💰 {k("To receive", "ಬರಬೇಕಾದದ್ದು")}</small><b>{rupees(toPayTotal)}</b><em>{toPay.length} {k("bills", "ಬಿಲ್")}</em></div>
                <div><small>🔒 {k("Oil held", "ಎಣ್ಣೆ ಹಿಡಿದಿದೆ")}</small><b>{queue.length}</b><em>{queue.filter((b) => heldNeed(b.modes, b.track) === "READY").length} {k("ready to give", "ಕೊಡಲು ಸಿದ್ಧ")}{kept.length ? ` · 🏪 ${kept.length} ${k("kept", "ಇಟ್ಟಿದ್ದು")}` : ""}</em></div>
              </div>
            )}
            <div className="cd-tools">
            {selBar(queue.filter((b) => billMatches(b, q)))}
            <form className="cd-find" onSubmit={(e) => { e.preventDefault(); const m = queue.filter((b) => billMatches(b, q)); if (m.length === 1) { open(m[0]); setQ(""); } }}>
              <input inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value.replace(/[^\w ]/g, ""))} placeholder={k("Bill number on the slip", "ಸ್ಲಿಪ್‌ನ ಬಿಲ್ ಸಂಖ್ಯೆ")} aria-label={k("Bill number", "ಬಿಲ್ ಸಂಖ್ಯೆ")} />
              <button type="submit">{k("Open", "ತೆರೆಯಿರಿ")}</button>
            </form>
            </div>
            <ul className="cd-list">
              {queue.filter((b) => billMatches(b, q)).map((b) => {
                const ps = payStatus(b.modes, b.track);
                const need = heldNeed(b.modes, b.track);
                const age = Date.now() - new Date(b.createdAt).getTime();
                return (
                  <li key={b.key}>
                    <button type="button" className={`${need === "READY" ? "ready" : age > 15 * 60_000 ? "late" : ""}${selMode && pick.includes(b.key) ? " picked" : ""}${!selMode && nextBill?.key === b.key ? " cd-next" : ""}`} onClick={() => tap(b)}>
                      <span className="r1">{selMode ? <i className="cd-tick">{pick.includes(b.key) ? "✓" : ""}</i> : <i className="cd-st">{need === "READY" ? <OilIcon size={26} /> : <CashIn size={0.8} />}</i>}<b>#{b.no}{` · ${billName(b.party, b.modes)}`}</b><strong>{rupees(b.total)}</strong></span>
                      <span className="r2">{b.lines.map((l) => `${l.label}${qtyText(l.qty, l.unit) ? " " + qtyText(l.qty, l.unit) : ""}`).join(" · ")}</span>
                      <span className="r3">
                        <span>⏱ {waitText(age)}</span>
                        {holds[b.key] && <span className="wait">⏸ {k("money taken – tap to finish", "ಹಣ ತೆಗೆದುಕೊಂಡಿದೆ – ಮುಗಿಸಲು ಒತ್ತಿ")}</span>}
                        {ps.cashDue > 0 && <span className="wait"><CashIn size={0.67} /> {k("Cash in", "ನಗದು ಬರಬೇಕು")} – {rupees(ps.cashDue)} ⏳</span>}
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

        {tab === "kept" && (
          <>
            <p className="cd-sub">{kept.length ? k("Paid. The oil is waiting in the shop for the customer to take.", "ಹಣ ಬಂದಿದೆ. ಎಣ್ಣೆ ಗ್ರಾಹಕರು ತೆಗೆದುಕೊಳ್ಳಲು ಅಂಗಡಿಯಲ್ಲಿ ಇದೆ.") : k("No oil is kept in the shop.", "ಅಂಗಡಿಯಲ್ಲಿ ಇಟ್ಟ ಎಣ್ಣೆ ಇಲ್ಲ.")}</p>
            <ul className="cd-list plain">
              {kept.map((b) => (
                <li key={b.key}>
                  <div className="cd-keptcard">
                    <button type="button" className="cd-keptinfo" onClick={() => open(b)}>
                      <span className="r1"><b>#{b.no}{` · ${billName(b.party, b.modes)}`}</b><strong>{rupees(b.total)}</strong></span>
                      <span className="r2">{b.lines.map((l) => `${l.label}${qtyText(l.qty, l.unit) ? " " + qtyText(l.qty, l.unit) : ""}`).join(" · ")}</span>
                      <span className="r3"><span>🏪 {k("kept", "ಇಟ್ಟಿದ್ದು")} {timeOf(b.track.keep!.at)} · {waitText(Date.now() - new Date(b.track.keep!.at).getTime())}</span></span>
                    </button>
                    <button type="button" className="cd-give cd-next" disabled={busy} onClick={() => void act(b, "handover", { value: "GIVEN" }, `#${b.no} · ${k("oil given", "ಎಣ್ಣೆ ಕೊಟ್ಟಿದೆ")}`)}><OilOut size={0.62} /> {k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}</button>
                  </div>
                </li>
              ))}
              {!kept.length && <li className="empty">{k("Nothing kept.", "ಏನೂ ಇಲ್ಲ.")}</li>}
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
            {selBar(shown)}
            <input className="cd-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={k("Search bill no, name or item", "ಬಿಲ್ ಸಂಖ್ಯೆ, ಹೆಸರು ಅಥವಾ ವಸ್ತು ಹುಡುಕಿ")} />
            <ul className="cd-list">
              {shown.map((b) => {
                const st = state(b);
                return (
                  <li key={b.key}>
                    <button type="button" className={selMode && pick.includes(b.key) ? "picked" : ""} onClick={() => tap(b)}>
                      <span className="r1">{selMode && <i className="cd-tick">{pick.includes(b.key) ? "✓" : ""}</i>}<b>#{b.no}{` · ${billName(b.party, b.modes)}`}</b><strong>{rupees(b.total)}</strong></span>
                      <span className="r3"><span>{timeOf(b.createdAt)} · {Object.keys(b.modes).join(" + ")}</span><span className={st.cls === "paid" ? "okc" : "wait"}>{st.text}</span>{holds[b.key] && <span className="wait">⏸</span>}</span>
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
            <BillReports
              bills={rBills}
              k={k}
              from={rFrom || today}
              to={rTo || today}
              today={today}
              onRange={(f, t) => void loadReport(f, t)}
              returned={rRet}
              modeName={(m) => (m === "CREDIT" ? k("Udhaar", "ಉದ್ರಿ") : m === "UPI" ? "UPI" : m === "CASH" ? k("Cash", "ನಗದು") : m === "PENDING" ? k("To collect", "ಬಾಕಿ") : m)}
              error={rErr}
            />
            <div className="cd-acts">
              <button type="button" className="go" onClick={() => setRcpt(daySummaryDoc({ when: receiptTime(Date.now()), from: today, to: today, count: sum.count, total: sum.total, kg: sum.kg, modes: sum.modes, returned: 0 }))}><PrinterIcon size={24} /> {k("Print day summary", "ದಿನದ ಸಾರಾಂಶ ಮುದ್ರಿಸಿ")}</button>
            </div>
            <label className="cd-set">
              <input type="checkbox" checked={beep} onChange={(e) => { setBeep(e.target.checked); try { localStorage.setItem("cashierBeep", String(e.target.checked)); } catch { /* ignore */ } }} />
              <span>🔔 {k("Beep when a new bill arrives", "ಹೊಸ ಬಿಲ್ ಬಂದಾಗ ಬೀಪ್")}</span>
            </label>
            <label className="cd-set">
              <input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); try { localStorage.setItem("cashierAutoPrint", String(e.target.checked)); } catch { /* ignore */ } }} />
              <span>{k("Print a receipt when cash is received", "ನಗದು ಬಂದಾಗ ರಸೀದಿ ಮುದ್ರಿಸಿ")}</span>
            </label>
          </>
        )}
      </main>
      {bulk && (() => {
        const dueB = picked.filter((b) => dueOf(b) > 0);
        const needMode = bulk !== "oil" && dueB.some((b) => b.track.payPending);
        const oilB = picked.filter(bulk === "oil" ? oilReadyOf : (b) => oilHeldOf(b) || b.track.payPending);
        return (
          <div className="rp-back" role="dialog" aria-label={k("Finish selected bills", "ಆಯ್ದ ಬಿಲ್‌ಗಳನ್ನು ಮುಗಿಸಿ")} onClick={() => !bulkBusy && setBulk(null)}>
            <div className="rp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rp-head">
                <b>{bulk === "money" ? k("Money received", "ಹಣ ಬಂತು") : bulk === "oil" ? k("Give oil to customers", "ಗ್ರಾಹಕರಿಗೆ ಎಣ್ಣೆ ಕೊಡಿ") : k("Money received + give oil", "ಹಣ ಬಂತು + ಎಣ್ಣೆ ಕೊಡಿ")}</b>
                <button type="button" onClick={() => setBulk(null)} aria-label="Close">✕</button>
              </div>
              {bulk === "money" && <p className="rp-bulk-note">{dueB.map(b => "#" + b.no).join(", ")}</p>}
              {bulk !== "oil" && <div className="rp-bulk-sum"><span>{dueB.length} {k("bill(s) with money pending", "ಬಿಲ್‌ಗಳಲ್ಲಿ ಹಣ ಬಾಕಿ")}</span><strong>{rupees(pickedDue)}</strong></div>}
              {needMode && (
                <>
                  <p className="rp-bulk-note">{k("These bills were saved with no payment mode. Received as:", "ಈ ಬಿಲ್‌ಗಳಿಗೆ ಪಾವತಿ ವಿಧಾನ ಇಲ್ಲ. ಪಡೆದದ್ದು:")}</p>
                  <div className="rp-tabs">
                    <button type="button" className={bulkPay === "CASH" ? "on" : ""} onClick={() => setBulkPay("CASH")}>{k("Cash", "ನಗದು")}</button>
                    <button type="button" className={bulkPay === "UPI" ? "on" : ""} onClick={() => setBulkPay("UPI")}>UPI</button>
                  </div>
                </>
              )}
              {bulk !== "money" && <p className="rp-bulk-note">🛢 {k(`Oil will be given on ${oilB.length} bill(s).`, `${oilB.length} ಬಿಲ್‌ಗಳಲ್ಲಿ ಎಣ್ಣೆ ಕೊಡಲಾಗುತ್ತದೆ.`)}</p>}
              {bulk === "money" && <p className="rp-bulk-note">{k("Oil stays held until you give it. Udhaar (credit) parts are not touched.", "ಎಣ್ಣೆ ಕೊಡುವವರೆಗೆ ಹಿಡಿದಿರುತ್ತದೆ. ಉದ್ರಿ ಭಾಗ ಮುಟ್ಟುವುದಿಲ್ಲ.")}</p>}
              <button type="button" className="rp-go" disabled={bulkBusy} onClick={() => void runBulk(bulk)}>
                {bulkBusy ? "…" : <span className="rp-step"><TickIcon /><b>{k("Confirm", "ಖಚಿತ")} · {picked.length} {k("bills", "ಬಿಲ್")}</b></span>}
              </button>
            </div>
          </div>
        );
      })()}
      {sheet}
      {detFor && (
        <BillDetails
          no={detFor.no}
          party={detFor.party}
          note={detFor.custNote}
          locked={(detFor.modes.CREDIT || 0) > 0 && !!detFor.track.paidLater}
          needName={(detFor.modes.CREDIT || 0) > 0}
          k={k}
          onClose={() => setDetFor(null)}
          onSave={async (p, n) => {
            try {
              const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: detFor.ids, action: "details", partyName: p, custNote: n }) });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) return j.error || "Could not update the bill.";
              setDetFor(null);
              await load();
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not update the bill.";
            }
          }}
        />
      )}
      {rcpt && <ReceiptSheet doc={rcpt} onClose={() => setRcpt(null)} />}
    </div>
  );
}
