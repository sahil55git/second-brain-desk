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
import { addLine, billKg, billSum, changeDue, lineAmount, r2, r3, registerBody, updateLine, type BillAdjust, type CounterLine, type CounterPay } from "@/lib/counterBill";
import type { HoldData } from "@/lib/counterHold";

type Lang = "en" | "kn";
type PadTarget = { kind: "received" | "tare" | "discount" } | { kind: "qty" | "rate"; line: number };
const lineOf = (p: PadTarget) => ("line" in p ? p.line : -1);

interface Settings {
  showTare: boolean;
  showGross: boolean;
  upiQr: boolean;
  roundOff: boolean;
  discount: boolean;
  beep: boolean;
}
const DEFAULTS: Settings = { showTare: true, showGross: false, upiQr: true, roundOff: false, discount: true, beep: true };
const SETTING_TEXT: Record<keyof Settings, [string, string]> = {
  showTare: ["Show tare weight on bill and print", "ಬಿಲ್‌ನಲ್ಲಿ ಟೇರ್ ತೂಕ ತೋರಿಸು"],
  showGross: ["Show gross weight on bill and print", "ಬಿಲ್‌ನಲ್ಲಿ ಒಟ್ಟು (ಗ್ರಾಸ್) ತೂಕ ತೋರಿಸು"],
  upiQr: ["UPI pay QR on UPI / udhaar bills", "UPI / ಉದ್ರಿ ಬಿಲ್‌ನಲ್ಲಿ UPI QR"],
  roundOff: ["Round the bill to the nearest rupee", "ಬಿಲ್ ಅನ್ನು ಹತ್ತಿರದ ರೂಪಾಯಿಗೆ ಸುತ್ತು"],
  discount: ["Allow discount", "ರಿಯಾಯಿತಿ ಅನುಮತಿಸು"],
  beep: ["Beep when an item is added", "ವಸ್ತು ಸೇರಿಸಿದಾಗ ಬೀಪ್"],
};

interface Hold {
  id: string;
  label: string;
  total: number;
  data: HoldData;
  heldBy: string | null;
  openedBy: string | null;
  openedAt: string | null;
  createdAt: string;
}

function beepNow() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1500;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
    o.onended = () => void ctx.close();
  } catch {
    /* no sound */
  }
}
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

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
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [showSettings, setShowSettings] = useState(false);
  const [adjust, setAdjust] = useState<{ discount: number; pct: boolean }>({ discount: 0, pct: false });
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [device, setDevice] = useState("");
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
    setSettings({ ...DEFAULTS, ...read<Partial<Settings>>("counterSettings", {}) });
    let d = read<string>("counterDevice", "");
    if (!d) {
      d = `dev-${Math.random().toString(36).slice(2, 8)}`;
      write("counterDevice", d);
    }
    setDevice(d);
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

  // held bills are shared by every device: refresh the list every few seconds
  const loadHolds = useCallback(async () => {
    try {
      const r = await fetch("/api/register/counter-holds", { cache: "no-store" });
      if (r.ok) setHolds(((await r.json()).data || []) as Hold[]);
    } catch {
      /* offline: keep the last list */
    }
  }, []);
  useEffect(() => {
    void loadHolds();
    const t2 = setInterval(() => void loadHolds(), 8000);
    return () => clearInterval(t2);
  }, [loadHolds]);

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

  const setSetting = (k: keyof Settings, v: boolean) => {
    const next = { ...settings, [k]: v };
    setSettings(next);
    write("counterSettings", next);
  };
  const billAdjust: BillAdjust = { discount: settings.discount ? adjust.discount : 0, pct: adjust.pct, roundOff: settings.roundOff };
  const sum = billSum(lines, billAdjust);
  const total = sum.net;
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
      if (settings.beep) beepNow();
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
    else if (pad.kind === "tare") {
      if (Number.isFinite(n) || text === "") bt.setTare(Number.isFinite(n) ? n : 0);
    } else if (pad.kind === "discount") setAdjust((a) => ({ ...a, discount: Number.isFinite(n) ? n : 0 }));
    else if ("line" in pad) {
      const p = pad;
      if (Number.isFinite(n)) setLines((ls) => updateLine(ls, p.line, { [p.kind]: n }));
      else if (text === "") setLines((ls) => updateLine(ls, p.line, { [p.kind]: 0 }));
    }
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
    if (holdId) {
      // a held bill goes back to the held list unchanged
      void fetch(`/api/register/counter-holds/${holdId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ release: true }) }).finally(() => void loadHolds());
      return reset();
    }
    if (lines.length && !window.confirm(lang === "kn" ? "ಈ ಬಿಲ್ ಅಳಿಸಬೇಕೆ?" : "Clear this bill?")) return;
    reset();
  };
  const reset = () => {
    setLines([]);
    setParty("");
    setShowParty(false);
    setReceived("");
    setPay("CASH");
    setAdjust({ discount: 0, pct: false });
    setHoldId(null);
    openPad({ kind: "received" }, "");
  };

  // ---- held bills
  const holdData = (): HoldData => ({ lines, pay, party: party.trim(), adjust: billAdjust });
  const holdBill = async (): Promise<boolean> => {
    if (!lines.length) return true;
    try {
      const res = await fetch(holdId ? `/api/register/counter-holds/${holdId}` : "/api/register/counter-holds", {
        method: holdId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: holdData() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: j.error || "Could not hold the bill." });
        return false;
      }
      setMsg({ ok: true, text: lang === "kn" ? `ಬಿಲ್ ಹಿಡಿದಿಡಲಾಗಿದೆ · ${rupees(total)}` : `Bill held · ${rupees(total)}` });
      reset();
      void loadHolds();
      return true;
    } catch {
      setMsg({ ok: false, text: lang === "kn" ? "ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ — ಬಿಲ್ ಹಿಡಿಯಲು ಆಗಲಿಲ್ಲ" : "No internet: could not hold the bill." });
      return false;
    }
  };
  const openHold = async (h: Hold) => {
    if (h.id === holdId) return setShowHolds(false);
    if (lines.length && !(await holdBill())) return;
    const claim = async (force: boolean) =>
      fetch(`/api/register/counter-holds/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: true, device, force }) });
    let res = await claim(false);
    if (res.status === 409) {
      if (!window.confirm(lang === "kn" ? "ಈ ಬಿಲ್ ಇನ್ನೊಂದು ಸಾಧನದಲ್ಲಿ ತೆರೆದಿದೆ. ಇಲ್ಲಿ ತೆಗೆದುಕೊಳ್ಳಬೇಕೆ?" : "This bill is open on another device. Take it over here?")) return;
      res = await claim(true);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error || "Could not open the held bill." });
      void loadHolds();
      return;
    }
    const d = h.data;
    setLines(d.lines || []);
    setPay(d.pay || "CASH");
    setParty(d.party || "");
    setShowParty(!!d.party);
    setAdjust({ discount: d.adjust?.discount || 0, pct: !!d.adjust?.pct });
    setReceived("");
    setHoldId(h.id);
    setShowHolds(false);
    openPad({ kind: "received" }, "");
  };
  const dropHold = async (h: Hold) => {
    if (!window.confirm(lang === "kn" ? `"${h.label}" ಬಿಲ್ ಅಳಿಸಬೇಕೆ?` : `Delete held bill "${h.label}"?`)) return;
    await fetch(`/api/register/counter-holds/${h.id}`, { method: "DELETE" }).catch(() => {});
    if (h.id === holdId) reset();
    void loadHolds();
  };

  /** "2.050 − tare 0.250 = 1.800 kg × ₹260" when the settings say so */
  const lineDetail = (l: CounterLine) => {
    const q = `${l.qty.toFixed(l.unit === "kg" ? 3 : 0)} ${l.unit}`;
    const parts: string[] = [];
    if (settings.showGross && l.grossKg) parts.push(`Gross ${l.grossKg.toFixed(3)}`);
    if (settings.showTare && l.tareKg) parts.push(`Tare ${l.tareKg.toFixed(3)}`);
    return `${parts.length ? `${parts.join(" · ")} · Net ` : ""}${q} × ₹${l.rate}`;
  };

  const save = async (print: boolean) => {
    setMsg(null);
    const bad = lines.findIndex((l) => !(l.qty > 0) || !(l.rate > 0));
    if (bad >= 0) {
      openPad({ kind: !(lines[bad].qty > 0) ? "qty" : "rate", line: bad }, "");
      return setMsg({ ok: false, text: lang === "kn" ? `ಸಾಲು ${bad + 1}: ತೂಕ ಮತ್ತು ದರ ಬೇಕು` : `Line ${bad + 1} needs a weight and a rate.` });
    }
    const r = registerBody(lines, pay, { date, party, adjust: billAdjust });
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
        rows: lines.map((l) => ({ name: l.label, detail: lineDetail(l), amount: rupees(lineAmount(l)) })),
        totals: [
          ...(billKg(lines) > 0 && lines.length > 1 ? [{ label: "Net weight", value: `${billKg(lines).toFixed(3)} kg` }] : []),
          ...(sum.discount || sum.roundOff ? [{ label: "Subtotal", value: rupees(sum.gross) }] : []),
          ...(sum.discount ? [{ label: adjust.pct ? `Discount ${adjust.discount}%` : "Discount", value: `−${rupees(sum.discount)}` }] : []),
          ...(sum.roundOff ? [{ label: "Round-off", value: `${sum.roundOff > 0 ? "+" : "−"}${rupees(Math.abs(sum.roundOff))}` }] : []),
          { label: "TOTAL", value: rupees(total), strong: true },
          ...(change != null && change >= 0 ? [{ label: "Received", value: rupees(recvN) }, { label: "Change", value: rupees(change) }] : []),
        ],
        notes: [
          `Mode: ${pay === "CREDIT" ? "Udhaar" : pay === "UPI" ? "UPI" : "Cash"}`,
          ...(pay !== "CASH" && vpa && settings.upiQr ? [`Scan to pay ${rupees(total)} by UPI · ${vpa}`] : []),
        ],
        // UPI and udhaar bills carry a QR for the exact amount, with the bill number and items in the payment note
        qr: pay !== "CASH" && settings.upiQr ? upiFor(total, billNote(lines, id ? id.slice(-6).toUpperCase() : undefined)) : undefined,
      };
      if (holdId) void fetch(`/api/register/counter-holds/${holdId}`, { method: "DELETE" }).finally(() => void loadHolds());
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
      : pad.kind === "tare"
        ? lang === "kn" ? "ಟೇರ್ ತೂಕ kg (ಡಬ್ಬಿ)" : "Tare weight kg (container)"
        : pad.kind === "discount"
          ? lang === "kn" ? `ರಿಯಾಯಿತಿ ${adjust.pct ? "%" : "₹"}` : `Discount ${adjust.pct ? "%" : "₹"}`
          : `${lines[lineOf(pad)]?.label ?? ""} · ${pad.kind === "qty" ? (lang === "kn" ? "ತೂಕ kg" : "Weight kg") : lang === "kn" ? "ದರ ₹" : "Rate ₹"}`;

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
        <button type="button" className={`ctr-held${holds.length ? " has" : ""}`} onClick={() => { setShowHolds((v) => !v); void loadHolds(); }}>
          🅿️ {lang === "kn" ? "ಹಿಡಿದ ಬಿಲ್" : "Held"} <b>{holds.length}</b>
        </button>
        <button type="button" className="ctr-lang" onClick={() => setShowSettings((v) => !v)} aria-label="Settings">⚙️</button>
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
        <div className={`ctr-tarewin${bt.tareKg > 0 ? " on" : ""}`}>
          <small>{lang === "kn" ? "ಟೇರ್" : "Tare"} (kg)</small>
          <b>{bt.tareKg > 0 ? bt.tareKg.toFixed(3) : "0.000"}</b>
          <small className="nm">{bt.container || (bt.tareKg > 0 ? (lang === "kn" ? "ಕೈಯಲ್ಲಿ" : "manual") : lang === "kn" ? "ಇಲ್ಲ" : "none")}</small>
        </div>
        <div className="ctr-tare">
          {isBt ? (
            <>
              <button type="button" className="big" disabled={!bt.live || bt.live.grossKg <= 0} onClick={() => bt.live && bt.setTare(bt.live.grossKg)} title="Put the empty container on the scale, then press">
                ⚖️ {t("tare", lang)}
              </button>
              <button type="button" onClick={() => openPad({ kind: "tare" }, "")}>⌨️ {lang === "kn" ? "ಟೈಪ್" : "Type"}</button>
              {bt.tareKg > 0 && <button type="button" onClick={() => bt.setTare(0)}>{t("clearTare", lang)}</button>}
              {bt.containers.map((c) => (
                <button type="button" key={c.name} className={bt.container === c.name ? "on" : ""} onClick={() => bt.pickContainer(bt.container === c.name ? null : c.name)}>
                  {c.name} <small>{c.kg.toFixed(3)}</small>
                </button>
              ))}
            </>
          ) : (
            <small className="ctr-hint">{lang === "kn" ? "ಟೇರ್ ಬ್ಲೂಟೂತ್ ತಕ್ಕಡಿಯೊಂದಿಗೆ" : "Tare works with the Bluetooth scale on this device."}</small>
          )}
        </div>
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
              <li key={i} className={lineOf(pad) === i ? "sel" : ""}>
                <span className="n">{i + 1}</span>
                <span className="nm">
                  {l.label}
                  {l.source !== "steady" && <em>{l.source === "typed" ? t("typed", lang) : t("movingTag", lang)}</em>}
                </span>
                <button type="button" className={`q${pad.kind === "qty" && lineOf(pad) === i ? " on" : ""}`} onClick={() => openPad({ kind: "qty", line: i }, "")}>
                  {l.qty > 0 ? l.qty.toFixed(3) : "—"} kg
                </button>
                <button type="button" className={`r${pad.kind === "rate" && lineOf(pad) === i ? " on" : ""}${l.rate > 0 ? "" : " need"}`} onClick={() => openPad({ kind: "rate", line: i }, "")}>
                  {l.rate > 0 ? `₹${l.rate}` : t("noRate", lang)}
                </button>
                <b className="a">{rupees(lineAmount(l))}</b>
                <button type="button" className="del" onClick={() => removeLine(i)} aria-label="Remove">✕</button>
              </li>
            ))}
          </ol>

          {(sum.discount > 0 || sum.roundOff !== 0) && (
            <div className="ctr-sub">
              <span>{lang === "kn" ? "ಉಪ ಮೊತ್ತ" : "Subtotal"} {rupees(sum.gross)}</span>
              {sum.discount > 0 && <span>− {lang === "kn" ? "ರಿಯಾಯಿತಿ" : "Discount"} {rupees(sum.discount)}</span>}
              {sum.roundOff !== 0 && <span>{lang === "kn" ? "ಸುತ್ತು" : "Round-off"} {sum.roundOff > 0 ? "+" : "−"}{rupees(Math.abs(sum.roundOff))}</span>}
            </div>
          )}
          <div className="ctr-tot">
            <span>
              {holdId && <em className="ctr-heldtag">🅿️ {lang === "kn" ? "ಹಿಡಿದ ಬಿಲ್" : "Held bill"}</em>}
              {lines.length} {lang === "kn" ? "ಸಾಲು" : "item(s)"} · {billKg(lines).toFixed(3)} kg
            </span>
            <b>{rupees(total)}</b>
          </div>
          {settings.discount && lines.length > 0 && (
            <div className="ctr-disc">
              <button type="button" className={pad.kind === "discount" ? "on" : ""} onClick={() => openPad({ kind: "discount" }, "")}>
                🏷️ {lang === "kn" ? "ರಿಯಾಯಿತಿ" : "Discount"} {adjust.discount > 0 ? `${adjust.pct ? `${adjust.discount}%` : rupees(adjust.discount)}` : ""}
              </button>
              <button type="button" className={adjust.pct ? "on" : ""} onClick={() => setAdjust((a) => ({ ...a, pct: !a.pct }))}>{adjust.pct ? "%" : "₹"}</button>
              {adjust.discount > 0 && <button type="button" onClick={() => setAdjust({ discount: 0, pct: false })}>✕</button>}
            </div>
          )}

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
            <button type="button" className="clr" onClick={clearBill} disabled={busy || !lines.length}>{holdId ? (lang === "kn" ? "ಮುಚ್ಚು" : "Close") : t("clear", lang)}</button>
            <button type="button" className="hold" onClick={() => void holdBill()} disabled={busy || !lines.length}>🅿️ {lang === "kn" ? "ಹಿಡಿ" : "Hold"}</button>
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

      {showHolds && (
        <div className="ctr-drawer" role="dialog" aria-label="Held bills" onClick={() => setShowHolds(false)}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>🅿️ {lang === "kn" ? "ಹಿಡಿದ ಬಿಲ್‌ಗಳು" : "Held bills"} ({holds.length})</b>
              <button type="button" onClick={() => setShowHolds(false)} aria-label="Close">✕</button>
            </div>
            {!holds.length && <p className="ctr-empty">{lang === "kn" ? "ಯಾವುದೇ ಹಿಡಿದ ಬಿಲ್ ಇಲ್ಲ." : "No held bills. Press Hold to park a bill and serve the next customer."}</p>}
            <ul className="ctr-holds">
              {holds.map((h) => {
                const elsewhere = !!h.openedBy && h.openedBy !== device && !!h.openedAt && Date.now() - new Date(h.openedAt).getTime() < 10 * 60 * 1000;
                return (
                  <li key={h.id} className={h.id === holdId ? "here" : ""}>
                    <button type="button" className="open" onClick={() => void openHold(h)}>
                      <b>{h.label}</b>
                      <span>{(h.data?.lines || []).map((l) => `${l.label} ${l.qty.toFixed(3)}`).join(", ")}</span>
                      <small>
                        {ago(h.createdAt)}{h.heldBy ? ` · ${h.heldBy}` : ""}
                        {h.id === holdId ? (lang === "kn" ? " · ಇಲ್ಲಿ ತೆರೆದಿದೆ" : " · open here") : elsewhere ? (lang === "kn" ? " · ಬೇರೆ ಸಾಧನದಲ್ಲಿ ತೆರೆದಿದೆ" : " · open on another device") : ""}
                      </small>
                    </button>
                    <b className="amt">{rupees(h.total)}</b>
                    <button type="button" className="del" onClick={() => void dropHold(h)} aria-label="Delete held bill">🗑️</button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="ctr-drawer" role="dialog" aria-label="Counter settings" onClick={() => setShowSettings(false)}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>⚙️ {lang === "kn" ? "ಕೌಂಟರ್ ಸೆಟ್ಟಿಂಗ್ಸ್" : "Counter settings"}</b>
              <button type="button" onClick={() => setShowSettings(false)} aria-label="Close">✕</button>
            </div>
            <label className="ctr-set">
              <input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); write("counterAutoPrint", e.target.checked); }} />
              <span>{lang === "kn" ? "ಉಳಿಸಿದ ತಕ್ಷಣ ಮುದ್ರಿಸು" : "Print the receipt as soon as the bill is saved"}</span>
            </label>
            {(Object.keys(SETTING_TEXT) as (keyof Settings)[]).map((k) => (
              <label key={k} className="ctr-set">
                <input type="checkbox" checked={settings[k]} onChange={(e) => setSetting(k, e.target.checked)} />
                <span>{SETTING_TEXT[k][lang === "kn" ? 1 : 0]}</span>
              </label>
            ))}
            <p className="ctr-hint">{lang === "kn" ? "ಈ ಸೆಟ್ಟಿಂಗ್ಸ್ ಈ ಸಾಧನಕ್ಕೆ ಮಾತ್ರ." : "These settings are for this device. UPI ID: Settings → Shop."}</p>
          </div>
        </div>
      )}

      {rcpt && <ReceiptSheet doc={rcpt.doc} autoPrint={rcpt.auto} onClose={() => setRcpt(null)} />}
    </div>
  );
}
