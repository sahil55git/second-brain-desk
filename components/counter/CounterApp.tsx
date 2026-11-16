"use client";

// Weigh & Bill counter (/register/counter): a full-screen till for selling by weight.
// Put the item on the scale → tap the item → (repeat) → Save & Print.
// The bill is saved as ONE register SALE with its lines (lib/counterBill.ts), through the same
// /api/register call as the Quick Register (offline queue included), so cash, udhaar, stock and
// Daily Closing need nothing new. The scale is the one already set up on this device (Live Scales).
import "./counter.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useScale } from "@/components/ScaleProvider";
import ReceiptSheet, { useShop } from "@/components/print/ReceiptSheet";
import QrCode from "@/components/barrels/QrCode";
import { upiPay, validVpa } from "@/lib/money";
import { api, type DayBundle } from "@/components/register/forms/shared";
import { businessDate, itemsFor, rateKey, type CatalogItem } from "@/lib/register";
import { receiptTime, rupees, type ReceiptDoc } from "@/lib/receipt";
import { addLine, billKg, billTotal, changeDue, lineAmount, r2, r3, registerBody, updateLine, type CounterLine, type CounterPay } from "@/lib/counterBill";

type Lang = "en" | "kn";
type PadTarget = { kind: "received" } | { kind: "qty" | "rate"; line: number };

const T = {
  title: ["Weigh & Bill", "ತೂಕ & ಬಿಲ್"],
  weight: ["Weight", "ತೂಕ"],
  steady: ["STEADY", "ಸ್ಥಿರ"],
  moving: ["MOVING", "ಅಲುಗಾಡುತ್ತಿದೆ"],
  noScale: ["No scale reading", "ತಕ್ಕಡಿ ಓದು ಇಲ್ಲ"],
  tare: ["Tare", "ಟೇರ್"],
  clearTare: ["Clear tare", "ಟೇರ್ ತೆಗೆ"],
  noContainer: ["No container", "ಡಬ್ಬಿ ಇಲ್ಲ"],
  search: ["Search item…", "ಹುಡುಕಿ…"],
  bill: ["Bill", "ಬಿಲ್"],
  empty: ["Put the item on the scale, then tap it.", "ವಸ್ತುವನ್ನು ತಕ್ಕಡಿಯಲ್ಲಿ ಇಟ್ಟು ಒತ್ತಿ."],
  total: ["Total", "ಒಟ್ಟು"],
  cash: ["Cash", "ನಗದು"],
  upi: ["UPI", "UPI"],
  udhaar: ["Udhaar", "ಉದ್ರಿ"],
  customer: ["Customer name / mobile", "ಗ್ರಾಹಕರ ಹೆಸರು / ಮೊಬೈಲ್"],
  received: ["Received", "ಪಡೆದದ್ದು"],
  change: ["Change", "ಚಿಲ್ಲರೆ"],
  due: ["Still due", "ಬಾಕಿ"],
  save: ["Save & Print", "ಉಳಿಸಿ & ಮುದ್ರಿಸಿ"],
  saveOnly: ["Save", "ಉಳಿಸಿ"],
  clear: ["Clear", "ಅಳಿಸಿ"],
  previous: ["Previous bill", "ಹಿಂದಿನ ಬಿಲ್"],
  reprint: ["Re-print", "ಮತ್ತೆ ಮುದ್ರಿಸಿ"],
  autoPrint: ["Print after save", "ಉಳಿಸಿದ ಮೇಲೆ ಮುದ್ರಿಸು"],
  noRate: ["no rate", "ದರ ಇಲ್ಲ"],
  typed: ["typed", "ಟೈಪ್"],
  movingTag: ["moving", "ಅಲುಗಾಟ"],
  setScale: ["Set up scale", "ತಕ್ಕಡಿ ಹೊಂದಿಸಿ"],
  back: ["Desk", "ಡೆಸ್ಕ್"],
  saved: ["Saved", "ಉಳಿಸಲಾಗಿದೆ"],
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l === "kn" ? 1 : 0];

const read = <V,>(k: string, d: V): V => {
  try {
    const v = window.localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as V);
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: setting lasts for this visit */
  }
};

export default function CounterApp() {
  const { connected, selectedReading: reading, bt } = useScale();
  const [lang, setLang] = useState<Lang>("en");
  const [day, setDay] = useState<DayBundle | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [lines, setLines] = useState<CounterLine[]>([]);
  const [pay, setPay] = useState<CounterPay>("CASH");
  const [party, setParty] = useState("");
  const [showParty, setShowParty] = useState(false);
  const [received, setReceived] = useState("");
  const [pad, setPad] = useState<PadTarget>({ kind: "received" });
  const [padText, setPadText] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [prev, setPrev] = useState<{ doc: ReceiptDoc; total: number; received: number | null } | null>(null);
  const [rcpt, setRcpt] = useState<{ doc: ReceiptDoc; auto: boolean } | null>(null);
  const [, tick] = useState(0);
  const shop = useShop();
  const [vpa, setVpa] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/settings/app?key=shop")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setVpa(validVpa(j?.data?.upi) ? String(j.data.upi).trim() : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLang(read<Lang>("counterLang", "en"));
    setAutoPrint(read<boolean>("counterAutoPrint", true));
    const t1 = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t1);
  }, []);

  const date = businessDate(Date.now());
  const load = useCallback(async () => {
    try {
      const r = await api<{ data: DayBundle }>(`/api/register?date=${date}`);
      setDay(r.data);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load items and rates.");
    }
  }, [date]);
  useEffect(() => {
    void load();
  }, [load]);

  // keep the tablet awake while the counter is open
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    void get();
    const vis = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      void lock?.release().catch(() => {});
    };
  }, []);

  // ---- the scale
  const fresh = !!reading && Date.now() - reading.receivedAt < 10_000;
  const kg = fresh && reading ? r3(reading.unit === "g" ? reading.weight / 1000 : reading.weight) : 0;
  const steady = fresh && reading?.stable !== false;
  const usable = fresh && kg > 0 && (steady || !!reading?.trusted);
  const isBt = !!bt.source && reading?.scale_source === bt.source;

  // ---- items and rates (the register's SALE catalogue + its saved rates)
  const items: CatalogItem[] = useMemo(() => (day ? itemsFor("SALE", day.config).filter((i) => i.key !== "other") : []), [day]);
  const rateOf = (key: string) => (day ? day.config.rates[rateKey("SALE", key)] ?? 0 : 0);
  const shown = items.filter((i) => !q.trim() || `${i.en} ${i.kn}`.toLowerCase().includes(q.trim().toLowerCase()));
  const label = (i: CatalogItem) => (lang === "kn" ? i.kn : i.en);

  const total = billTotal(lines);
  /** UPI link for the exact bill amount (amount + bill note filled in on the customer's phone) */
  const upiFor = (amount: number, note: string) => (vpa && amount > 0 ? upiPay(vpa, shop.name || "Mahadev Traders", amount, note) : undefined);
  const billNote = (ls: CounterLine[], no?: string) =>
    [no ? `Bill ${no}` : "Bill", ls.map((l) => `${l.label} ${l.qty.toFixed(3)}kg`).join(", ")].join(" · ");
  const recvN = parseFloat(received) || 0;
  const change = pay === "CASH" && recvN > 0 ? changeDue(total, recvN) : null;

  const tapItem = (i: CatalogItem) => {
    setMsg(null);
    const rate = rateOf(i.key);
    const base = { item: i.key, label: i.en, unit: "kg", rate };
    if (usable) {
      const live = isBt ? bt.live : null;
      const next = addLine(lines, { ...base, qty: kg, source: steady ? "steady" : "moving", ...(live && bt.tareKg > 0 ? { grossKg: live.grossKg, tareKg: bt.tareKg } : {}) });
      setLines(next);
      if (!(rate > 0)) openPad({ kind: "rate", line: next.length - 1 }, "");
    } else {
      // no reading: add the line and type the weight on the pad
      const next = [...lines, { ...base, qty: 0, source: "typed" as const }];
      setLines(next);
      openPad({ kind: "qty", line: next.length - 1 }, "");
    }
  };

  const openPad = (p: PadTarget, text: string) => {
    setPad(p);
    setPadText(text);
  };
  const applyPad = (text: string) => {
    setPadText(text);
    const n = parseFloat(text);
    if (pad.kind === "received") setReceived(text);
    else if (Number.isFinite(n)) setLines((ls) => updateLine(ls, pad.line, { [pad.kind]: n }));
    else if (text === "") setLines((ls) => updateLine(ls, pad.line, { [pad.kind]: 0 }));
  };
  const key = (k: string) => {
    if (k === "⌫") return applyPad(padText.slice(0, -1));
    if (k === "C") return applyPad("");
    if (k === "." && padText.includes(".")) return;
    applyPad(padText + k);
  };
  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, j) => j !== i));
    openPad({ kind: "received" }, received);
  };
  const clearBill = () => {
    if (lines.length && !window.confirm(lang === "kn" ? "ಈ ಬಿಲ್ ಅಳಿಸಬೇಕೆ?" : "Clear this bill?")) return;
    reset();
  };
  const reset = () => {
    setLines([]);
    setParty("");
    setShowParty(false);
    setReceived("");
    setPay("CASH");
    openPad({ kind: "received" }, "");
  };

  const save = async (print: boolean) => {
    setMsg(null);
    const bad = lines.findIndex((l) => !(l.qty > 0) || !(l.rate > 0));
    if (bad >= 0) {
      openPad({ kind: !(lines[bad].qty > 0) ? "qty" : "rate", line: bad }, "");
      return setMsg({ ok: false, text: lang === "kn" ? `ಸಾಲು ${bad + 1}: ತೂಕ ಮತ್ತು ದರ ಬೇಕು` : `Line ${bad + 1} needs a weight and a rate.` });
    }
    const r = registerBody(lines, pay, { date, party });
    if ("err" in r) return setMsg({ ok: false, text: r.err });
    setBusy(true);
    try {
      const res = await api<{ data?: { id?: string; queued?: boolean } }>("/api/register", { method: "POST", body: JSON.stringify(r.body) });
      const id = res?.data?.id;
      const doc: ReceiptDoc = {
        title: "RECEIPT",
        no: id ? id.slice(-6).toUpperCase() : undefined,
        when: receiptTime(Date.now()),
        party: party.trim() || undefined,
        rows: lines.map((l) => ({ name: l.label, detail: `${l.qty.toFixed(l.unit === "kg" ? 3 : 0)} ${l.unit} × ₹${l.rate}`, amount: rupees(lineAmount(l)) })),
        totals: [
          ...(billKg(lines) > 0 && lines.length > 1 ? [{ label: "Weight", value: `${billKg(lines).toFixed(3)} kg` }] : []),
          { label: "TOTAL", value: rupees(total), strong: true },
          ...(change != null && change >= 0 ? [{ label: "Received", value: rupees(recvN) }, { label: "Change", value: rupees(change) }] : []),
        ],
        notes: [
          `Mode: ${pay === "CREDIT" ? "Udhaar" : pay === "UPI" ? "UPI" : "Cash"}`,
          ...(pay !== "CASH" && vpa ? [`Scan to pay ${rupees(total)} by UPI · ${vpa}`] : []),
        ],
        // UPI and udhaar bills carry a QR for the exact amount, with the bill number and items in the payment note
        qr: pay !== "CASH" ? upiFor(total, billNote(lines, id ? id.slice(-6).toUpperCase() : undefined)) : undefined,
      };
      setPrev({ doc, total, received: pay === "CASH" && recvN > 0 ? recvN : null });
      if (print) setRcpt({ doc, auto: true });
      setMsg({ ok: true, text: `${t("saved", lang)} · ${rupees(total)}${res?.data?.queued ? (lang === "kn" ? " · ಇಂಟರ್ನೆಟ್ ಬಂದಾಗ ಕಳುಹಿಸಲಾಗುವುದು" : " · no internet: kept on this tablet, sent when back online") : ""}` });
      reset();
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const padLabel =
    pad.kind === "received"
      ? t("received", lang)
      : `${lines[pad.line]?.label ?? ""} · ${pad.kind === "qty" ? (lang === "kn" ? "ತೂಕ kg" : "Weight kg") : lang === "kn" ? "ದರ ₹" : "Rate ₹"}`;

  return (
    <div className="ctr" lang={lang === "kn" ? "kn" : "en"}>
      {/* ---------- top bar ---------- */}
      <header className="ctr-top">
        <Link href="/register/pos" className="ctr-back">← {t("back", lang)}</Link>
        <b className="ctr-title">⚖️ {t("title", lang)}</b>
        <span className={`ctr-chip ${connected ? (fresh ? "ok" : "mid") : "bad"}`}>
          {connected ? (bt.config?.name || reading?.scale_source || "Scale") : t("noScale", lang)}
        </span>
        {!connected && <Link href="/?desk=scales" className="ctr-link">{t("setScale", lang)}</Link>}
        <span className="ctr-sp" />
        <label className="ctr-tog">
          <input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); write("counterAutoPrint", e.target.checked); }} /> 🖨️ {t("autoPrint", lang)}
        </label>
        <button type="button" className="ctr-lang" onClick={() => { const l = lang === "en" ? "kn" : "en"; setLang(l); write("counterLang", l); }}>
          {lang === "en" ? "ಕನ್ನಡ" : "English"}
        </button>
      </header>

      {/* ---------- weight strip ---------- */}
      <section className="ctr-weigh">
        <div className="ctr-state">
          <small>{lang === "kn" ? "ಸ್ಥಿತಿ" : "State"}</small>
          <b className={!fresh ? "bad" : steady ? "ok" : "mid"}>{!fresh ? "—" : steady ? t("steady", lang) : t("moving", lang)}</b>
          {isBt && bt.tareKg > 0 && <small className="ctr-net">net · {bt.container || t("tare", lang)} {bt.tareKg.toFixed(3)}</small>}
        </div>
        <div className="ctr-lcd" aria-live="polite">
          <small>{t("weight", lang)} (kg)</small>
          <span>{fresh ? kg.toFixed(3) : "0.000"}</span>
        </div>
        <div className="ctr-lcd small">
          <small>{t("total", lang)} ₹</small>
          <span>{total.toFixed(2)}</span>
        </div>
        {isBt && (
          <div className="ctr-tare">
            <button type="button" disabled={!bt.live || bt.live.grossKg <= 0} onClick={() => bt.live && bt.setTare(bt.live.grossKg)}>{t("tare", lang)}</button>
            {bt.tareKg > 0 && <button type="button" onClick={() => bt.setTare(0)}>{t("clearTare", lang)}</button>}
            {bt.containers.map((c) => (
              <button type="button" key={c.name} className={bt.container === c.name ? "on" : ""} onClick={() => bt.pickContainer(bt.container === c.name ? null : c.name)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <main className="ctr-main">
        {/* ---------- bill ---------- */}
        <section className="ctr-bill" aria-label={t("bill", lang)}>
          {prev && !lines.length && (
            <div className="ctr-prev">
              <div>
                <b>{t("previous", lang)}</b> {prev.doc.no && <span>#{prev.doc.no}</span>}
                <div>{rupees(prev.total)}{prev.received != null ? ` · ${t("received", lang)} ${rupees(prev.received)} · ${t("change", lang)} ${rupees(prev.received - prev.total)}` : ""}</div>
              </div>
              <button type="button" onClick={() => setRcpt({ doc: prev.doc, auto: true })}>🖨️ {t("reprint", lang)}</button>
              <button type="button" className="x" onClick={() => setPrev(null)} aria-label="Close">✕</button>
            </div>
          )}
          <ol className="ctr-lines">
            {!lines.length && <li className="ctr-empty">{t("empty", lang)}</li>}
            {lines.map((l, i) => (
              <li key={i} className={pad.kind !== "received" && pad.line === i ? "sel" : ""}>
                <span className="n">{i + 1}</span>
                <span className="nm">
                  {l.label}
                  {l.source !== "steady" && <em>{l.source === "typed" ? t("typed", lang) : t("movingTag", lang)}</em>}
                </span>
                <button type="button" className={`q${pad.kind === "qty" && pad.line === i ? " on" : ""}`} onClick={() => openPad({ kind: "qty", line: i }, "")}>
                  {l.qty > 0 ? l.qty.toFixed(3) : "—"} kg
                </button>
                <button type="button" className={`r${pad.kind === "rate" && pad.line === i ? " on" : ""}${l.rate > 0 ? "" : " need"}`} onClick={() => openPad({ kind: "rate", line: i }, "")}>
                  {l.rate > 0 ? `₹${l.rate}` : t("noRate", lang)}
                </button>
                <b className="a">{rupees(lineAmount(l))}</b>
                <button type="button" className="del" onClick={() => removeLine(i)} aria-label="Remove">✕</button>
              </li>
            ))}
          </ol>

          <div className="ctr-tot">
            <span>{lines.length} {lang === "kn" ? "ಸಾಲು" : "item(s)"} · {billKg(lines).toFixed(3)} kg</span>
            <b>{rupees(total)}</b>
          </div>

          <div className="ctr-pay" role="radiogroup">
            {(["CASH", "UPI", "CREDIT"] as CounterPay[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pay === p} className={pay === p ? "on" : ""} onClick={() => setPay(p)}>
                {p === "CASH" ? `💵 ${t("cash", lang)}` : p === "UPI" ? `📱 ${t("upi", lang)}` : `📒 ${t("udhaar", lang)}`}
              </button>
            ))}
          </div>
          {pay === "UPI" && total > 0 && (
            <div className="ctr-upi">
              {vpa ? (
                <>
                  <QrCode value={upiFor(total, billNote(lines)) || ""} moduleSize={4} />
                  <div>
                    <b>{rupees(total)}</b>
                    <small>{lang === "kn" ? "ಗ್ರಾಹಕರು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ ಪಾವತಿಸಲಿ — ಮೊತ್ತ ತಾನಾಗಿ ತುಂಬುತ್ತದೆ" : "Customer scans: the exact amount fills in by itself"}</small>
                    <small>{vpa}</small>
                  </div>
                </>
              ) : (
                <small>{lang === "kn" ? "UPI QR ಗೆ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ UPI ID ಸೇರಿಸಿ" : "Add the shop's UPI ID in Settings → Shop to show a pay QR here."}</small>
              )}
            </div>
          )}
          {(pay === "CREDIT" || showParty) && (
            <input className="ctr-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder={t("customer", lang)} list="ctr-parties" />
          )}
          {pay !== "CREDIT" && !showParty && (
            <button type="button" className="ctr-addparty" onClick={() => setShowParty(true)}>＋ {t("customer", lang)}</button>
          )}
          <datalist id="ctr-parties">{(day?.allParties || []).slice(0, 300).map((p) => <option key={p} value={p} />)}</datalist>

          <div className="ctr-padwrap">
            <div className="ctr-padhead">
              <span>{padLabel}</span>
              <b>{pad.kind === "received" ? received || "0" : padText || "…"}</b>
              {change != null && pad.kind === "received" && (
                <em className={change >= 0 ? "ok" : "bad"}>{change >= 0 ? `${t("change", lang)} ${rupees(change)}` : `${t("due", lang)} ${rupees(-change)}`}</em>
              )}
            </div>
            <div className="ctr-pad">
              {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"].map((k) => (
                <button key={k} type="button" onClick={() => key(k)}>{k}</button>
              ))}
            </div>
            {pad.kind !== "received" && (
              <button type="button" className="ctr-padok" onClick={() => openPad({ kind: "received" }, received)}>✓ OK</button>
            )}
          </div>

          {msg && <p className={`ctr-msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</p>}
          {loadErr && <p className="ctr-msg bad">{loadErr}</p>}

          <div className="ctr-act">
            <button type="button" className="clr" onClick={clearBill} disabled={busy || !lines.length}>{t("clear", lang)}</button>
            {!autoPrint && <button type="button" className="sv" onClick={() => void save(false)} disabled={busy || !lines.length}>{t("saveOnly", lang)}</button>}
            <button type="button" className="go" onClick={() => void save(autoPrint)} disabled={busy || !lines.length}>
              {busy ? "…" : autoPrint ? `🖨️ ${t("save", lang)}` : `🖨️ ${t("save", lang)}`}
              <small>{rupees(total)}</small>
            </button>
          </div>
        </section>

        {/* ---------- item keys ---------- */}
        <section className="ctr-items">
          <input className="ctr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${t("search", lang)}`} />
          <div className="ctr-grid">
            {shown.map((i) => {
              const rate = rateOf(i.key);
              return (
                <button key={i.key} type="button" className={`ctr-key${usable ? " ready" : ""}`} onClick={() => tapItem(i)}>
                  <span className="ic" aria-hidden>{i.icon}</span>
                  <b>{label(i)}</b>
                  <small>{rate > 0 ? `₹${rate}/kg` : t("noRate", lang)}</small>
                  {usable && rate > 0 && <em>{rupees(r2(kg * rate))}</em>}
                </button>
              );
            })}
            {!day && !loadErr && <p className="ctr-empty">…</p>}
          </div>
        </section>
      </main>

      {rcpt && <ReceiptSheet doc={rcpt.doc} autoPrint={rcpt.auto} onClose={() => setRcpt(null)} />}
    </div>
  );
}
