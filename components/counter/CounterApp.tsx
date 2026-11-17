"use client";

// Weigh & Bill counter (/register/counter): a full-screen till for selling by weight.
// Put the item on the scale → tap the item (or type its PLU) → (repeat) → Save & Print.
// Each bill is ONE register SALE with its lines (lib/counterBill.ts) through /api/register, so cash,
// udhaar, stock and Daily Closing need nothing new. Bills get plain numbers 1, 2, 3 … from the server.
// Item keys, PLU numbers, Kannada names and staff locks are shared by every device (setting "counter").
import "./counter.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScale } from "@/components/ScaleProvider";
import { useAccess } from "@/components/AccessProvider";
import ReceiptSheet, { useShop } from "@/components/print/ReceiptSheet";
import QrCode from "@/components/barrels/QrCode";
import { upiPay, validVpa } from "@/lib/money";
import { api, type DayBundle } from "@/components/register/forms/shared";
import { businessDate, itemsFor, rateKey } from "@/lib/register";
import { receiptTime, rupees, type ReceiptDoc } from "@/lib/receipt";
import {
  addLine, billKg, billSum, cashReturn, lineAmount, lineDisc, lineGross, r2, r3, registerBody, totalDiscPct, updateLine,
  type BillAdjust, type CounterLine, type CounterPay, type SplitParts,
} from "@/lib/counterBill";
import type { HoldData } from "@/lib/counterHold";
import { billText, daySummaryDoc, mobileOf, whatsappLink } from "@/lib/counterShare";
import { DEFAULT_GST_PCT, DEFAULT_HSN, taxInvoiceDoc, validGstin } from "@/lib/counterGst";
import { defaultRefundMode, refundFor, returnBody, returnables, returnedByBill, type RefundMode, type ReturnItem, type ReturnedSoFar } from "@/lib/counterReturn";
import { billMatches, billsSummary, billToLines, groupBills, type SaleRow, type SavedBill } from "@/lib/counterRecords";
import { allowed, findPlu, nextPlu, parseCounterConfig, registerItem, STAFF_LOCKS, type CounterConfig, type CounterItem, type StaffLock } from "@/lib/counterConfig";
import { accentOf, DEFAULT_THEME, parseTheme, PRESETS, themeClass, themeStyle, validHex, type CounterTheme } from "@/lib/counterTheme";
import { defaultHandover, handoverOf, isTracked, payStatus, type Handover } from "@/lib/counterTrack";
import { hashPin, KIOSK_EXTRAS, KIOSK_KEY, readKiosk, type KioskExtra, type KioskState } from "@/lib/counterKiosk";

type Lang = "en" | "kn";
type Chan = "CASH" | "UPI" | "CREDIT";
type PadTarget =
  | { kind: "received" | "tare" | "discount" | "plu" }
  | { kind: "qty" | "rate" | "ldisc"; line: number }
  | { kind: "split"; chan: Chan }
  | { kind: "retqty"; key: string }
  | { kind: "amount" };

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
  showTare: ["Show tare weight on bill and print", "ಬಿಲ್ ಮತ್ತು ಮುದ್ರಣದಲ್ಲಿ ಟೇರ್ ತೂಕ ತೋರಿಸು"],
  showGross: ["Show gross weight on bill and print", "ಬಿಲ್ ಮತ್ತು ಮುದ್ರಣದಲ್ಲಿ ಒಟ್ಟು ತೂಕ ತೋರಿಸು"],
  upiQr: ["UPI pay QR on UPI / udhaar / split bills", "UPI / ಉದ್ರಿ / ಹಂಚಿಕೆ ಬಿಲ್‌ನಲ್ಲಿ UPI QR"],
  roundOff: ["Round the bill to the nearest rupee", "ಬಿಲ್ ಅನ್ನು ಹತ್ತಿರದ ರೂಪಾಯಿಗೆ ಸುತ್ತು"],
  discount: ["Allow discount (bill and item-wise)", "ರಿಯಾಯಿತಿ ಅನುಮತಿಸು (ಬಿಲ್ ಮತ್ತು ವಸ್ತು)"],
  beep: ["Beep when an item is added", "ವಸ್ತು ಸೇರಿಸಿದಾಗ ಬೀಪ್"],
};
const CHAN_TEXT: Record<Chan, [string, string, string]> = {
  CASH: ["Cash", "ನಗದು", "💵"],
  UPI: ["UPI", "UPI", "📱"],
  CREDIT: ["Udhaar", "ಉದ್ರಿ", "📒"],
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

type UiSize = "auto" | "s" | "m" | "l";
const UI_NEXT: Record<UiSize, UiSize> = { auto: "s", s: "m", m: "l", l: "auto" };
/** Auto: phones and tablets show at 100%, a big monitor is zoomed up so the keys stay finger-sized. */
function uiZoom(s: UiSize, vw: number): number {
  if (s === "s") return 0.88;
  if (s === "m") return 1;
  if (s === "l") return 1.18;
  return vw >= 1700 ? 1.25 : vw >= 1400 ? 1.12 : 1;
}
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
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

export default function CounterApp() {
  const { connected, selectedReading: reading, bt } = useScale();
  const { isOwner } = useAccess();
  const shop = useShop();
  const [lang, setLang] = useState<Lang>("en");
  // Screen size: Auto fits the device (phone stacks, tablet splits, big monitors zoom up); the A± button nudges it
  const [uiSize, setUiSize] = useState<UiSize>("auto");
  const [vw, setVw] = useState(1024);
  useEffect(() => {
    setUiSize(read<UiSize>("counterUi", "auto"));
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const zoom = uiZoom(uiSize, vw);
  const [theme, setTheme] = useState<CounterTheme>(DEFAULT_THEME);
  useEffect(() => { setTheme(parseTheme(read<unknown>("counterTheme", null))); }, []);
  const setLook = (p: Partial<CounterTheme>) => setTheme((t) => { const n = { ...t, ...p }; write("counterTheme", n); return n; });
  const k = (en: string, kn: string) => (lang === "kn" ? kn : en);

  const [day, setDay] = useState<DayBundle | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [cfgRaw, setCfgRaw] = useState<unknown>(null);
  const [lines, setLines] = useState<CounterLine[]>([]);
  const [pay, setPay] = useState<CounterPay>("CASH");
  const [split, setSplit] = useState<SplitParts>({});
  const [party, setParty] = useState("");
  const [showParty, setShowParty] = useState(false);
  const [taxInv, setTaxInv] = useState<{ on: boolean; gstin: string; igst: boolean }>({ on: false, gstin: "", igst: false });
  const [received, setReceived] = useState(0);
  const [adjust, setAdjust] = useState<{ discount: number; pct: boolean }>({ discount: 0, pct: false });
  const [pad, setPad] = useState<PadTarget | null>(null);
  const [padText, setPadText] = useState("");
  const [padPct, setPadPct] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [panel, setPanel] = useState<null | "settings" | "items" | "holds" | "bills" | "look">(null);
  const [prev, setPrev] = useState<{ doc: ReceiptDoc; no: string; total: number; back: number } | null>(null);
  const [rcpt, setRcpt] = useState<{ doc: ReceiptDoc; auto: boolean } | null>(null);
  const [vpa, setVpa] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [device, setDevice] = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bTo, setBTo] = useState("");
  const [bQ, setBQ] = useState("");
  const [bills, setBills] = useState<SavedBill[]>([]);
  const [retTotal, setRetTotal] = useState(0);
  const [ret, setRet] = useState<{ bill: SavedBill; items: ReturnItem[]; picks: Record<string, number>; mode: RefundMode; reason: string; busy: boolean; err: string; prior?: ReturnedSoFar } | null>(null);
  const [bErr, setBErr] = useState("");
  const [editing, setEditing] = useState<SavedBill | null>(null);
  const [kiosk, setKiosk] = useState<KioskState | null>(null);
  const [draftItems, setDraftItems] = useState<CounterItem[]>([]);
  const [draftLocks, setDraftLocks] = useState<StaffLock[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    setLang(read<Lang>("counterLang", "en"));
    setAutoPrint(read<boolean>("counterAutoPrint", true));
    setSettings({ ...DEFAULTS, ...read<Partial<Settings>>("counterSettings", {}) });
    setKiosk(readKiosk());
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
  const loadCfg = useCallback(async () => {
    try {
      const r = await fetch("/api/settings/app?key=counter", { cache: "no-store" });
      if (r.ok) setCfgRaw((await r.json()).data ?? null);
    } catch {
      /* offline: defaults */
    }
  }, []);
  useEffect(() => {
    void load();
    void loadCfg();
    fetch("/api/settings/app?key=shop")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setVpa(validVpa(j?.data?.upi) ? String(j.data.upi).trim() : null))
      .catch(() => {});
  }, [load, loadCfg]);

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

  // ---- set-up: item keys (PLU, names, units, rates) and staff locks
  const catalog = useMemo(() => (day ? itemsFor("SALE", day.config) : []), [day]);
  const cfg: CounterConfig = useMemo(() => parseCounterConfig(cfgRaw, catalog), [cfgRaw, catalog]);
  const can = (lock: StaffLock) => allowed(cfg, isOwner, lock);
  const rateOf = (ci: CounterItem) => ci.rate || (day && !ci.key.startsWith("new:") ? day.config.rates[rateKey("SALE", ci.key)] ?? 0 : 0);
  const nameOf = (ci: CounterItem) => (lang === "kn" && ci.kn ? ci.kn : ci.en);
  const tiles = cfg.items.filter((i) => !i.hidden && (!q.trim() || `${i.plu} ${i.en} ${i.kn}`.toLowerCase().includes(q.trim().toLowerCase())));
  const knOf = (l: CounterLine) => cfg.items.find((i) => registerItem(i).item === l.item && (l.item !== "other" || i.en === l.label))?.kn;
  const lineName = (l: CounterLine) => (lang === "kn" ? knOf(l) || l.label : l.label);

  // ---- the scale
  const fresh = !!reading && Date.now() - reading.receivedAt < 10_000;
  const kgLive = fresh && reading ? r3(reading.unit === "g" ? reading.weight / 1000 : reading.weight) : 0;
  // Freeze: hold the shown weight (e.g. while pouring or the scale swings) until it is let go
  const [frozen, setFrozen] = useState<number | null>(null);
  const kg = frozen ?? kgLive;
  const steady = frozen != null || (fresh && reading?.stable !== false);
  const usable = frozen != null || (fresh && kgLive > 0 && (steady || !!reading?.trusted));
  // Sell by amount: "₹100 of oil" → the kg to pour, with a beep when the scale gets there
  const [fill, setFill] = useState<{ amount: number; item?: CounterItem } | null>(null);
  const fillBeeped = useRef(false);
  const isBt = !!bt.source && reading?.scale_source === bt.source;

  // ---- totals
  const setSetting = (key: keyof Settings, v: boolean) => {
    const next = { ...settings, [key]: v };
    setSettings(next);
    write("counterSettings", next);
  };
  const discOn = settings.discount && can("discount");
  const billAdjust: BillAdjust = { discount: discOn ? adjust.discount : 0, pct: adjust.pct, roundOff: settings.roundOff };
  const sum = billSum(lines, billAdjust);
  const total = sum.net;
  const itemDisc = r2(lines.reduce((a, l) => a + lineDisc(l), 0));
  const splitSum = r2((split.CASH || 0) + (split.UPI || 0) + (split.CREDIT || 0));
  const splitLeft = r2(total - splitSum);
  const cashDue = pay === "CASH" ? total : pay === "SPLIT" ? split.CASH || 0 : 0;
  const upiDue = pay === "UPI" ? total : pay === "SPLIT" ? split.UPI || 0 : 0;
  const creditDue = pay === "CREDIT" ? total : pay === "SPLIT" ? split.CREDIT || 0 : 0;
  // goods: given at once for cash; held until the UPI is checked; udhaar customers get the goods (change it if needed)
  const [handPick, setHandPick] = useState<Handover | null>(null);
  const hand: Handover = handPick ?? defaultHandover({ CASH: cashDue, UPI: upiDue, CREDIT: creditDue });
  const back = cashDue > 0 && received > 0 ? cashReturn(cashDue, received) : 0;
  const shortBy = cashDue > 0 && received > 0 && received < cashDue ? r2(cashDue - received) : 0;
  const upiFor = (amount: number, note: string) => (vpa && amount > 0 ? upiPay(vpa, shop.name || "Mahadev Traders", amount, note) : undefined);
  const itemsNote = (ls: CounterLine[]) => ls.map((l) => `${l.label} ${l.qty.toFixed(3)}${l.unit}`).join(", ");

  // ---- adding items
  const addItem = (ci: CounterItem) => {
    setMsg(null);
    const rate = rateOf(ci);
    if (fill && !fill.item) {
      if (ci.unit !== "kg" || !(rate > 0)) return setMsg({ ok: false, text: k("Sell by amount needs an item sold by kg with a rate.", "ಮೊತ್ತದ ಮೇಲೆ ಮಾರಾಟಕ್ಕೆ kg ವಸ್ತು ಮತ್ತು ದರ ಬೇಕು.") });
      fillBeeped.current = false;
      return setFill({ ...fill, item: ci });
    }
    const ri = registerItem(ci);
    const base = { item: ri.item, label: ri.label, unit: ci.unit, rate };
    let next: CounterLine[];
    if (ci.unit === "kg" && usable) {
      const live = isBt ? bt.live : null;
      next = addLine(lines, { ...base, qty: kg, source: steady ? "steady" : "moving", ...(live && bt.tareKg > 0 ? { grossKg: live.grossKg, tareKg: bt.tareKg } : {}) });
    } else if (ci.unit === "kg" && !can("typedWeight")) {
      return setMsg({ ok: false, text: k("Put the item on the scale first (typing a weight is locked).", "ಮೊದಲು ವಸ್ತುವನ್ನು ತಕ್ಕಡಿಯಲ್ಲಿ ಇಡಿ (ತೂಕ ಟೈಪ್ ಮಾಡುವುದು ಲಾಕ್ ಆಗಿದೆ).") });
    } else {
      next = [...lines, { ...base, qty: ci.unit === "pcs" ? 1 : 0, source: "typed" as const }];
    }
    setLines(next);
    setFrozen(null);
    if (settings.beep) beepNow();
    const i = next.length - 1;
    if (!(next[i].qty > 0)) openPad({ kind: "qty", line: i });
    else if (!(rate > 0)) {
      if (can("rate")) openPad({ kind: "rate", line: i });
      else setMsg({ ok: false, text: k(`${ci.en} has no rate. Ask the owner to set it.`, `${nameOf(ci)} ಗೆ ದರ ಇಲ್ಲ. ಮಾಲೀಕರಿಗೆ ತಿಳಿಸಿ.`) });
    }
  };

  const fillRate = fill?.item ? rateOf(fill.item) : 0;
  const fillKg = fill?.item && fillRate > 0 ? r3(fill.amount / fillRate) : 0;
  useEffect(() => {
    if (!fill?.item || !(fillKg > 0) || !fresh) return;
    if (kgLive >= fillKg - 0.0005 && !fillBeeped.current) {
      fillBeeped.current = true;
      beepNow();
    }
    if (kgLive < fillKg - 0.05) fillBeeped.current = false;
  }, [kgLive, fillKg, fill, fresh]);
  const addFill = () => {
    if (!fill?.item || !(fillKg > 0)) return;
    const ci = fill.item;
    const base = { item: registerItem(ci).item, label: registerItem(ci).label, unit: ci.unit, rate: fillRate };
    // within 10 g of the target counts as the target, so the bill is the exact ₹ the customer asked for
    const near = usable && Math.abs(kg - fillKg) <= 0.01;
    const qty = near || !usable ? fillKg : kg;
    const live = isBt ? bt.live : null;
    setLines(addLine(lines, { ...base, qty, source: !usable ? "typed" : steady ? "steady" : "moving", ...(live && bt.tareKg > 0 && !near ? { grossKg: live.grossKg, tareKg: bt.tareKg } : {}) }));
    if (usable && !near) setMsg({ ok: true, text: k(`Weighed ${kg.toFixed(3)} kg, not the ${fillKg.toFixed(3)} kg for ₹${fill.amount}. The bill has the weighed amount.`, `ತೂಕ ${kg.toFixed(3)} kg (ಗುರಿ ${fillKg.toFixed(3)} kg). ಬಿಲ್‌ನಲ್ಲಿ ತೂಗಿದ ಮೊತ್ತ.`) });
    setFill(null);
    setFrozen(null);
    if (settings.beep) beepNow();
  };

  // ---- the pop-up keypad
  const openPad = (p: PadTarget) => {
    setPad(p);
    setPadText("");
    setPadPct(p.kind === "discount" ? adjust.pct : p.kind === "ldisc" ? !!lines[p.line]?.discPct : false);
  };
  const padKey = (key: string) => {
    if (key === "⌫") return setPadText((t) => t.slice(0, -1));
    if (key === "C") return setPadText("");
    if (key === "." && (padText.includes(".") || pad?.kind === "plu")) return;
    setPadText((t) => (t.length < 9 ? t + key : t));
  };
  const padOk = () => {
    if (!pad) return;
    const n = parseFloat(padText);
    const v = Number.isFinite(n) ? n : 0;
    const p = pad;
    setPad(null);
    if (p.kind === "amount") { if (v > 0) { fillBeeped.current = false; setFill({ amount: r2(v) }); } }
    else if (p.kind === "received") setReceived(v);
    else if (p.kind === "tare") bt.setTare(v);
    else if (p.kind === "discount") setAdjust({ discount: v, pct: padPct });
    else if (p.kind === "split") setSplit((s) => ({ ...s, [p.chan]: r2(v) }));
    else if (p.kind === "plu") {
      const ci = findPlu(cfg.items, Math.floor(v));
      if (ci) addItem(ci);
      else setMsg({ ok: false, text: k(`No item with PLU ${Math.floor(v)}.`, `PLU ${Math.floor(v)} ವಸ್ತು ಇಲ್ಲ.`) });
    } else if (p.kind === "retqty") setRet((r) => (r ? { ...r, picks: { ...r.picks, [p.key]: Math.max(0, r3(v)) }, err: "" } : r));
    else if (p.kind === "ldisc") setLines((ls) => updateLine(ls, p.line, { disc: v, discPct: padPct }));
    else if ((p.kind === "qty" || p.kind === "rate") && padText !== "") {
      const field = p.kind;
      setLines((ls) => updateLine(ls, p.line, { [field]: v }));
    }
  };
  const padTitle = (p: PadTarget): string => {
    switch (p.kind) {
      case "amount": return k("Sell by amount: how many ₹ of oil?", "ಮೊತ್ತದ ಮೇಲೆ ಮಾರಾಟ: ಎಷ್ಟು ₹ ಎಣ್ಣೆ?");
      case "received": return k(`Cash received from customer (bill cash ${rupees(cashDue)})`, `ಗ್ರಾಹಕರಿಂದ ಪಡೆದ ನಗದು (ಬಿಲ್ ${rupees(cashDue)})`);
      case "tare": return k("Tare: container weight in kg", "ಟೇರ್: ಡಬ್ಬಿಯ ತೂಕ kg");
      case "discount": return k("Discount on the whole bill", "ಇಡೀ ಬಿಲ್‌ಗೆ ರಿಯಾಯಿತಿ");
      case "plu": return k("Type the item's PLU number", "ವಸ್ತುವಿನ PLU ಸಂಖ್ಯೆ ಟೈಪ್ ಮಾಡಿ");
      case "split": return k(`${CHAN_TEXT[p.chan][0]} part of the bill (left ${rupees(splitLeft)})`, `${CHAN_TEXT[p.chan][1]} ಭಾಗ (ಉಳಿದದ್ದು ${rupees(splitLeft)})`);
      case "qty": return `${lines[p.line] ? lineName(lines[p.line]) : ""} · ${k(`Quantity (${lines[p.line]?.unit || "kg"})`, `ಪ್ರಮಾಣ (${lines[p.line]?.unit || "kg"})`)}`;
      case "rate": return `${lines[p.line] ? lineName(lines[p.line]) : ""} · ${k("Rate ₹", "ದರ ₹")}`;
      case "retqty": return `${ret?.items.find((i) => i.key === p.key)?.label || ""} · ${k("Quantity returned", "ಹಿಂತಿರುಗಿಸಿದ ಪ್ರಮಾಣ")}`;
      case "ldisc": return `${lines[p.line] ? lineName(lines[p.line]) : ""} · ${k("Item discount", "ವಸ್ತು ರಿಯಾಯಿತಿ")}`;
    }
  };

  // ---- bill actions
  const reset = () => {
    setLines([]);
    setParty("");
    setShowParty(false);
    setTaxInv({ on: false, gstin: "", igst: false });
    setReceived(0);
    setHandPick(null);
    setPay("CASH");
    setSplit({});
    setAdjust({ discount: 0, pct: false });
    setHoldId(null);
    setEditing(null);
    setPad(null);
    setFill(null);
    setFrozen(null);
  };
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const clearBill = () => {
    if (holdId) {
      void fetch(`/api/register/counter-holds/${holdId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ release: true }) }).finally(() => void loadHolds());
      return reset();
    }
    if (lines.length && !window.confirm(k("Clear this bill?", "ಈ ಬಿಲ್ ಅಳಿಸಬೇಕೆ?"))) return;
    reset();
  };

  const holdData = (): HoldData => ({ lines, pay, party: party.trim(), adjust: billAdjust, ...(pay === "SPLIT" ? { split } : {}) });
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
        setMsg({ ok: false, text: j.error || k("Could not hold the bill.", "ಬಿಲ್ ಹಿಡಿಯಲು ಆಗಲಿಲ್ಲ.") });
        return false;
      }
      setMsg({ ok: true, text: `${k("Bill held", "ಬಿಲ್ ಹಿಡಿದಿಡಲಾಗಿದೆ")} · ${rupees(total)}` });
      reset();
      void loadHolds();
      return true;
    } catch {
      setMsg({ ok: false, text: k("No internet: could not hold the bill.", "ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ — ಬಿಲ್ ಹಿಡಿಯಲು ಆಗಲಿಲ್ಲ.") });
      return false;
    }
  };
  const openHold = async (h: Hold) => {
    if (h.id === holdId) return setPanel(null);
    if (lines.length && !(await holdBill())) return;
    const claim = (force: boolean) =>
      fetch(`/api/register/counter-holds/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: true, device, force }) });
    let res = await claim(false);
    if (res.status === 409) {
      if (!window.confirm(k("This bill is open on another device. Take it over here?", "ಈ ಬಿಲ್ ಇನ್ನೊಂದು ಸಾಧನದಲ್ಲಿ ತೆರೆದಿದೆ. ಇಲ್ಲಿ ತೆಗೆದುಕೊಳ್ಳಬೇಕೆ?"))) return;
      res = await claim(true);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error || k("Could not open the held bill.", "ಹಿಡಿದ ಬಿಲ್ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ.") });
      void loadHolds();
      return;
    }
    const d = h.data;
    setLines(d.lines || []);
    setPay(d.pay || "CASH");
    setSplit(d.split || {});
    setParty(d.party || "");
    setShowParty(!!d.party);
    setAdjust({ discount: d.adjust?.discount || 0, pct: !!d.adjust?.pct });
    setReceived(0);
    setHoldId(h.id);
    setPanel(null);
  };
  const dropHold = async (h: Hold) => {
    if (!window.confirm(k(`Delete held bill "${h.label}"?`, `"${h.label}" ಹಿಡಿದ ಬಿಲ್ ಅಳಿಸಬೇಕೆ?`))) return;
    await fetch(`/api/register/counter-holds/${h.id}`, { method: "DELETE" }).catch(() => {});
    if (h.id === holdId) reset();
    void loadHolds();
  };

  /** "Tare 1.250 · Net 1.800 kg × ₹260 − ₹10" as the settings say */
  const lineDetail = (l: CounterLine) => {
    const qty = `${l.qty.toFixed(l.unit === "pcs" ? 0 : 3)} ${l.unit}`;
    const parts: string[] = [];
    if (settings.showGross && l.grossKg) parts.push(`Gross ${l.grossKg.toFixed(3)}`);
    if (settings.showTare && l.tareKg) parts.push(`Tare ${l.tareKg.toFixed(3)}`);
    const d = lineDisc(l);
    return `${parts.length ? `${parts.join(" · ")} · Net ` : ""}${qty} × ₹${l.rate}${d > 0 ? ` − ${l.discPct ? `${l.disc}% ` : ""}${rupees(d)}` : ""}`;
  };

  // ---- saved bills
  const labelOf = (item: string | null, lbl: string | null) => lbl || cfg.items.find((i) => i.key === item)?.en || catalog.find((c) => c.key === item)?.en || item || "Item";
  const loadBills = async () => {
    const from = bFrom || date;
    const to = bTo || from;
    setBErr("");
    try {
      const res = await fetch(`/api/register/range?from=${from}&to=${to}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load bills.");
      setBills(groupBills(j.data as SaleRow[], labelOf));
      setRetTotal(Math.round((j.data as SaleRow[]).filter((r) => r.kind === "SALE_RETURN").reduce((a, r) => a + r.amountInr, 0) * 100) / 100);
    } catch (e) {
      setBErr(e instanceof Error ? e.message : "Could not load bills.");
    }
  };
  const cancelBill = async (b: SavedBill, why?: string): Promise<boolean> => {
    if (why === undefined && retTotal > 0) {
      try {
        const rr = await fetch(`/api/register/range?from=${b.date}&to=${date}`, { cache: "no-store" });
        const jj = await rr.json();
        if (rr.ok && returnedByBill(jj.data as SaleRow[]).has(b.no)) {
          setBErr(k(`Bill #${b.no} already has a return. A bill with a return cannot be cancelled.`, `ಬಿಲ್ #${b.no} ಗೆ ರಿಟರ್ನ್ ಇದೆ. ರದ್ದು ಮಾಡಲಾಗದು.`));
          return false;
        }
      } catch { /* the server still guards the money */ }
    }
    const reason = why ?? window.prompt(k(`Reason for cancelling bill #${b.no} (${rupees(b.total)})?`, `ಬಿಲ್ #${b.no} ರದ್ದು ಮಾಡಲು ಕಾರಣ?`));
    if (reason == null) return false;
    if (!reason.trim()) {
      setBErr(k("Write a reason to cancel a bill.", "ಕಾರಣ ಬರೆಯಿರಿ."));
      return false;
    }
    const res = await fetch(`/api/register/${b.firstId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: `Counter bill #${b.no}: ${reason.trim()}` }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBErr(j.error || k("Could not cancel the bill.", "ಬಿಲ್ ರದ್ದು ಮಾಡಲು ಆಗಲಿಲ್ಲ."));
      return false;
    }
    void loadBills();
    void load();
    return true;
  };

  // ---- returns: goods back, money (or udhaar) back
  const openReturn = async (b: SavedBill) => {
    setBErr("");
    let prior: ReturnedSoFar | undefined;
    try {
      const res = await fetch(`/api/register/range?from=${b.date}&to=${date}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not check earlier returns.");
      prior = returnedByBill(j.data as SaleRow[]).get(b.no);
    } catch (e) {
      return setBErr(e instanceof Error ? e.message : "Could not check earlier returns.");
    }
    const items = returnables(b, prior);
    if (!items.some((i) => i.leftAmt > 0)) return setBErr(k(`Bill #${b.no} has nothing left to return.`, `ಬಿಲ್ #${b.no} ನಲ್ಲಿ ಹಿಂತಿರುಗಿಸಲು ಏನೂ ಇಲ್ಲ.`));
    setRet({ bill: b, items, picks: {}, mode: defaultRefundMode(b), reason: "", busy: false, err: "", prior });
  };
  const retPlan = ret ? returnBody(ret.bill, ret.items, ret.picks, { date, mode: ret.mode, reason: ret.reason }) : null;
  const saveReturn = async () => {
    if (!ret || !retPlan) return;
    if ("err" in retPlan) return setRet({ ...ret, err: retPlan.err });
    if (!ret.reason.trim()) return setRet({ ...ret, err: k("Write the reason for the return.", "ಹಿಂತಿರುಗಿಸಲು ಕಾರಣ ಬರೆಯಿರಿ.") });
    setRet({ ...ret, busy: true, err: "" });
    try {
      const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(retPlan.body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save the return.");
      setRet(null);
      setMsg({ ok: true, text: k(`Return saved: ${rupees(retPlan.amount)} ${ret.mode === "CREDIT" ? "off the udhaar" : ret.mode === "UPI" ? "back by UPI" : "cash back"}. Stock updated.`, `ರಿಟರ್ನ್ ಉಳಿದಿದೆ: ${rupees(retPlan.amount)}. ಸ್ಟಾಕ್ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ.`) });
      void loadBills();
      void load();
    } catch (e) {
      setRet((r) => (r ? { ...r, busy: false, err: e instanceof Error ? e.message : "Could not save the return." } : r));
    }
  };

  const save = async (print: boolean) => {
    setMsg(null);
    const bad = lines.findIndex((l) => !(l.qty > 0) || !(l.rate > 0));
    if (bad >= 0) {
      openPad({ kind: !(lines[bad].qty > 0) ? "qty" : "rate", line: bad });
      return setMsg({ ok: false, text: k(`Line ${bad + 1} needs a quantity and a rate.`, `ಸಾಲು ${bad + 1}: ಪ್ರಮಾಣ ಮತ್ತು ದರ ಬೇಕು.`) });
    }
    if ((pay === "CREDIT" || (pay === "SPLIT" && (split.CREDIT || 0) > 0)) && !can("udhaar")) return setMsg({ ok: false, text: k("Udhaar is locked for staff.", "ಉದ್ರಿ ಸಿಬ್ಬಂದಿಗೆ ಲಾಕ್ ಆಗಿದೆ.") });
    if (taxInv.on && taxInv.gstin.trim() && !validGstin(taxInv.gstin)) return setMsg({ ok: false, text: k("The customer's GSTIN does not look right (15 characters). Fix it or clear it.", "ಗ್ರಾಹಕರ GSTIN ಸರಿಯಿಲ್ಲ (15 ಅಕ್ಷರ). ಸರಿಪಡಿಸಿ ಅಥವಾ ಅಳಿಸಿ.") });
    const dpct = totalDiscPct(lines, billAdjust);
    if (!isOwner && dpct > cfg.staffDiscMaxPct + 0.005) {
      return setMsg({ ok: false, text: k(`Staff can give at most ${cfg.staffDiscMaxPct}% discount (this bill has ${dpct}%). Reduce it or ask the owner.`, `ಸಿಬ್ಬಂದಿ ಗರಿಷ್ಠ ${cfg.staffDiscMaxPct}% ರಿಯಾಯಿತಿ ಮಾತ್ರ ಕೊಡಬಹುದು (ಈ ಬಿಲ್‌ನಲ್ಲಿ ${dpct}%). ಕಡಿಮೆ ಮಾಡಿ ಅಥವಾ ಮಾಲೀಕರನ್ನು ಕೇಳಿ.`) });
    }
    const r = registerBody(lines, pay, { date, party, adjust: billAdjust, split, notes: [editing ? `Replaces bill #${editing.no}` : "", taxInv.on ? `GST invoice${taxInv.gstin.trim() ? ` · GSTIN ${taxInv.gstin.trim().toUpperCase()}` : ""}${taxInv.igst ? " · IGST" : ""}` : ""].filter(Boolean).join(" · ") || undefined });
    if ("err" in r) return setMsg({ ok: false, text: r.err });
    (r.body as unknown as Record<string, unknown>).handover = hand;
    setBusy(true);
    try {
      const res = await api<{ data?: { id?: string; queued?: boolean; details?: { billNo?: number } } }>("/api/register", { method: "POST", body: JSON.stringify(r.body) });
      const billNo = res?.data?.details?.billNo;
      const no = billNo ? String(billNo) : k("(saved offline)", "(ಆಫ್‌ಲೈನ್)");
      const modes: [string, number][] =
        pay === "SPLIT" ? (["CASH", "UPI", "CREDIT"] as Chan[]).filter((c) => (split[c] || 0) > 0).map((c) => [CHAN_TEXT[c][0], split[c] || 0]) : [[CHAN_TEXT[pay as Chan][0], total]];
      const plainDoc: ReceiptDoc = {
        title: "RECEIPT",
        no,
        when: receiptTime(Date.now()),
        party: party.trim() || undefined,
        rows: lines.map((l) => ({ name: l.label, detail: lineDetail(l), amount: rupees(lineAmount(l)) })),
        totals: [
          ...(billKg(lines) > 0 && lines.length > 1 ? [{ label: "Net weight", value: `${billKg(lines).toFixed(3)} kg` }] : []),
          ...(itemDisc > 0 ? [{ label: "Item discount", value: `−${rupees(itemDisc)}` }] : []),
          ...(sum.discount || sum.roundOff ? [{ label: "Subtotal", value: rupees(sum.gross) }] : []),
          ...(sum.discount ? [{ label: adjust.pct ? `Discount ${adjust.discount}%` : "Discount", value: `−${rupees(sum.discount)}` }] : []),
          ...(sum.roundOff ? [{ label: "Round-off", value: `${sum.roundOff > 0 ? "+" : "−"}${rupees(Math.abs(sum.roundOff))}` }] : []),
          { label: "TOTAL", value: rupees(total), strong: true },
          ...(modes.length > 1 ? modes.map(([m, v]) => ({ label: m, value: rupees(v) })) : []),
          ...(cashDue > 0 && received > 0 ? [{ label: "Cash received", value: rupees(received) }, ...(back > 0 ? [{ label: "Return to customer", value: rupees(back), strong: true }] : [])] : []),
        ],
        notes: [`Mode: ${modes.map(([m]) => m).join(" + ")}`, ...(upiDue > 0 && vpa && settings.upiQr ? [`Scan to pay ${rupees(upiDue)} by UPI · ${vpa}`] : [])],
        qr: pay !== "CASH" && settings.upiQr ? upiFor(pay === "SPLIT" ? (split.UPI || 0) + (split.CREDIT || 0) : total, `Bill ${no} · ${itemsNote(lines)}`) : undefined,
      };
      // GST tax invoice instead of the plain receipt: same lines and amounts, GST taken out of each price
      const doc: ReceiptDoc = taxInv.on
        ? taxInvoiceDoc({
            no,
            when: receiptTime(Date.now()),
            party: party.trim() || undefined,
            gstin: taxInv.gstin.trim() || undefined,
            igst: taxInv.igst,
            lines: lines.map((l, i) => ({ name: l.label, hsn: gstOf(l.item).hsn, pct: gstOf(l.item).pct, amount: sum.amounts[i], detail: lineDetail(l) })),
            notes: [
              ...(itemDisc > 0 ? [`Item discount −${rupees(itemDisc)}`] : []),
              ...(sum.discount ? [`${adjust.pct ? `Discount ${adjust.discount}%` : "Discount"} −${rupees(sum.discount)}`] : []),
              ...(sum.roundOff ? [`Round-off ${sum.roundOff > 0 ? "+" : "−"}${rupees(Math.abs(sum.roundOff))}`] : []),
              ...(plainDoc.notes || []),
            ],
            after: [
              ...(modes.length > 1 ? modes.map(([m, v]) => ({ label: m, value: rupees(v) })) : []),
              ...(cashDue > 0 && received > 0 ? [{ label: "Cash received", value: rupees(received) }, ...(back > 0 ? [{ label: "Return to customer", value: rupees(back), strong: true }] : [])] : []),
            ],
            qr: plainDoc.qr,
          })
        : plainDoc;
      if (editing) {
        const ok = await cancelBill(editing, `edited at the counter, replaced by bill #${no}`);
        if (!ok) setMsg({ ok: false, text: k(`New bill saved, but old bill #${editing.no} could not be removed. Ask the owner to cancel it.`, `ಹೊಸ ಬಿಲ್ ಉಳಿಸಲಾಗಿದೆ, ಹಳೆಯ ಬಿಲ್ #${editing.no} ಅಳಿಸಲಾಗಲಿಲ್ಲ — ಮಾಲೀಕರಿಗೆ ತಿಳಿಸಿ.`) });
      }
      if (holdId) void fetch(`/api/register/counter-holds/${holdId}`, { method: "DELETE" }).finally(() => void loadHolds());
      setPrev({ doc, no, total, back });
      if (print) setRcpt({ doc, auto: true });
      if (!editing)
        setMsg({
          ok: true,
          text: `${k("Saved", "ಉಳಿಸಲಾಗಿದೆ")} #${no} · ${rupees(total)}${back > 0 ? ` · ${k("return", "ಹಿಂತಿರುಗಿಸಿ")} ${rupees(back)}` : ""}${hand === "HELD" && (upiDue > 0 || creditDue > 0) ? ` · 🔒 ${k("goods held till payment", "ಹಣ ಬರುವವರೆಗೆ ಸರಕು ಹಿಡಿಯಿರಿ")}` : ""}${res?.data?.queued ? k(" · no internet: kept on this tablet", " · ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ: ಈ ಟ್ಯಾಬ್ಲೆಟ್‌ನಲ್ಲಿ ಇಡಲಾಗಿದೆ") : ""}`,
        });
      reset();
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : k("Could not save.", "ಉಳಿಸಲು ಆಗಲಿಲ್ಲ.") });
    } finally {
      setBusy(false);
    }
  };

  const [bFilter, setBFilter] = useState<"all" | "open" | "held">("all");
  const [armed, setArmed] = useState<string | null>(null);
  const openN = bills.filter((b) => isTracked(b.track) && payStatus(b.modes, b.track).state !== "PAID").length;
  const heldN = bills.filter((b) => isTracked(b.track) && handoverOf(b.track) === "HELD").length;
  const shownBills = bills
    .filter((b) => billMatches(b, bQ))
    .filter((b) => bFilter === "all" || (isTracked(b.track) && (bFilter === "open" ? payStatus(b.modes, b.track).state !== "PAID" : handoverOf(b.track) === "HELD")));
  // mark UPI received / collect the udhaar money / give or hold the goods
  const trackAct = async (b: SavedBill, action: "handover" | "upiOk" | "paidLater", extra: Record<string, unknown> = {}) => {
    setBErr("");
    setArmed(null);
    try {
      const res = await fetch("/api/register/bill-track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: b.ids, action, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not update the bill.");
      await loadBills();
    } catch (e) {
      setBErr(e instanceof Error ? e.message : "Could not update the bill.");
    }
  };
  useEffect(() => { if (date) void loadBills(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const bSum = billsSummary(shownBills);
  const modeName = (m: string) => (m === "CREDIT" ? k("Udhaar", "ಉದ್ರಿ") : m === "UPI" ? "UPI" : m === "CASH" ? k("Cash", "ನಗದು") : m);
  /** HSN code and GST % of a counter item (the owner's value, else the shop default). */
  function gstOf(itemKey: string | null): { hsn: string; pct: number } {
    const it = cfg.items.find((i) => i.key === itemKey);
    return { hsn: it?.hsn ?? DEFAULT_HSN[itemKey || ""] ?? "", pct: it?.gst ?? DEFAULT_GST_PCT };
  }
  const billDoc = (b: SavedBill): ReceiptDoc =>
    /GST invoice/.test(b.notes || "")
      ? taxInvoiceDoc({
          no: b.no,
          when: receiptTime(b.createdAt),
          party: b.party || undefined,
          gstin: /GSTIN ([0-9A-Z]{15})/.exec(b.notes || "")?.[1],
          igst: /\bIGST\b/.test(b.notes || ""),
          lines: b.lines.map((l) => ({ name: l.label, hsn: gstOf(l.item).hsn, pct: gstOf(l.item).pct, amount: l.amount, detail: l.qty ? `${l.qty.toFixed(l.unit === "pcs" ? 0 : 3)} ${l.unit || ""} × ₹${l.rate ?? ""}` : undefined })),
          after: Object.keys(b.modes).length > 1 ? Object.entries(b.modes).map(([m, v]) => ({ label: modeName(m), value: rupees(v) })) : [],
          notes: [`Mode: ${Object.keys(b.modes).map(modeName).join(" + ")}`, "Re-print"],
        })
      : plainBillDoc(b);
  const plainBillDoc = (b: SavedBill): ReceiptDoc => ({
    title: "RECEIPT",
    no: b.no,
    when: receiptTime(b.createdAt),
    party: b.party || undefined,
    rows: b.lines.map((l) => ({ name: l.label, detail: l.qty ? `${l.qty.toFixed(l.unit === "pcs" ? 0 : 3)} ${l.unit || ""} × ₹${l.rate ?? ""}` : undefined, amount: rupees(l.amount) })),
    totals: [{ label: "TOTAL", value: rupees(b.total), strong: true }, ...(Object.keys(b.modes).length > 1 ? Object.entries(b.modes).map(([m, v]) => ({ label: modeName(m), value: rupees(v) })) : [])],
    notes: [`Mode: ${Object.keys(b.modes).map(modeName).join(" + ")}`, "Re-print"],
  });
  const shareWhatsapp = (doc: ReceiptDoc, who?: string | null) => window.open(whatsappLink(billText(doc, shop.name || "Mahadev Traders"), mobileOf(who || "")), "_blank");
  const printSummary = () =>
    setRcpt({ doc: daySummaryDoc({ when: receiptTime(Date.now()), from: bFrom || date, to: bTo || bFrom || date, count: bSum.count, total: bSum.total, kg: bSum.kg, modes: Object.fromEntries(Object.entries(bSum.modes).map(([m, v]) => [modeName(m), v])), returned: retTotal }), auto: true });
  const editBill = async (b: SavedBill) => {
    if (lines.length && !(await holdBill())) return;
    setLines(billToLines(b));
    setParty(b.party || "");
    setShowParty(!!b.party);
    const ms = Object.keys(b.modes) as Chan[];
    if (ms.length > 1) {
      setPay("SPLIT");
      setSplit(Object.fromEntries(ms.map((m) => [m, b.modes[m]])) as SplitParts);
    } else setPay(ms[0] === "UPI" || ms[0] === "CREDIT" ? ms[0] : "CASH");
    setEditing(b);
    setPanel(null);
  };
  const exportCsv = () => {
    const out = [["Date", "Time", "Bill", "Customer", "Items", "Kg", "Total", "Modes", "By"]];
    for (const b of shownBills) {
      out.push([
        b.date,
        timeOf(b.createdAt),
        b.no,
        b.party || "",
        b.lines.map((l) => `${l.label} ${l.qty ?? ""}${l.unit ?? ""} @${l.rate ?? ""}`).join("; "),
        b.lines.reduce((a, l) => a + (l.unit === "kg" && l.qty ? l.qty : 0), 0).toFixed(3),
        b.total.toFixed(2),
        Object.entries(b.modes).map(([m, v]) => `${modeName(m)} ${v}`).join(" + "),
        b.by || "",
      ]);
    }
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `counter-bills_${bFrom || date}_${bTo || bFrom || date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // ---- owner set-up: items and staff locks
  const openItems = () => {
    setDraftItems(cfg.items.map((i) => ({ ...i })));
    setDraftLocks(cfg.staffLocks);
    setPanel("items");
  };
  const saveCfg = async (items: CounterItem[], staffLocks: StaffLock[], staffDiscMaxPct: number = cfg.staffDiscMaxPct) => {
    const res = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "counter", data: { items, staffLocks, staffDiscMaxPct } }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: j.error || k("Could not save the set-up.", "ಸೆಟಪ್ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ.") });
      return false;
    }
    await loadCfg();
    return true;
  };
  const patchDraft = (i: number, p: Partial<CounterItem>) => setDraftItems((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

  // ---- counter-only mode (this device)
  const kioskOn = async () => {
    const pin = window.prompt(k("Choose a PIN (4 to 8 digits) to leave counter-only mode later:", "ನಂತರ ಹೊರಬರಲು PIN ಆರಿಸಿ (4 ರಿಂದ 8 ಅಂಕೆ):"));
    if (pin == null) return;
    if (!/^\d{4,8}$/.test(pin)) return setMsg({ ok: false, text: k("The PIN must be 4 to 8 digits.", "PIN 4 ರಿಂದ 8 ಅಂಕೆ ಇರಬೇಕು.") });
    if (window.prompt(k("Type the PIN again:", "PIN ಮತ್ತೆ ಟೈಪ್ ಮಾಡಿ:")) !== pin) return setMsg({ ok: false, text: k("The PINs did not match.", "PIN ಹೊಂದಲಿಲ್ಲ.") });
    const s: KioskState = { on: true, pinHash: await hashPin(pin), allow: kiosk?.allow || [] };
    write(KIOSK_KEY, s);
    setKiosk(s);
  };
  const kioskOff = async () => {
    const pin = window.prompt(k("PIN to leave counter-only mode:", "ಹೊರಬರಲು PIN:"));
    if (pin == null) return;
    if (!kiosk || (await hashPin(pin)) !== kiosk.pinHash) return setMsg({ ok: false, text: k("Wrong PIN.", "ತಪ್ಪು PIN.") });
    const s = { ...kiosk, on: false };
    write(KIOSK_KEY, s);
    setKiosk(s);
  };
  const kioskAllow = (x: KioskExtra, on: boolean) => {
    const cur = kiosk?.allow || [];
    const s: KioskState = { on: !!kiosk?.on, pinHash: kiosk?.pinHash || "", allow: on ? Array.from(new Set([...cur, x])) : cur.filter((a) => a !== x) };
    write(KIOSK_KEY, s);
    setKiosk(s);
  };

  // ======================================================================================
  return (
    <div className={`ctr ${themeClass(theme)}`} lang={lang} style={{ ["--u" as string]: zoom, ...themeStyle(theme) } as React.CSSProperties}>
      {/* ---------- top bar ---------- */}
      <header className="ctr-top">
        {!kiosk?.on && <Link href="/register/pos" className="ctr-back">← {k("Desk", "ಡೆಸ್ಕ್")}</Link>}
        <b className="ctr-title">⚖️ {k("Weigh & Bill", "ತೂಕ & ಬಿಲ್")}</b>
        <span className={`ctr-chip ${connected ? (fresh ? "ok" : "mid") : "bad"}`}>{connected ? bt.config?.name || reading?.scale_source || k("Scale", "ತಕ್ಕಡಿ") : k("No scale", "ತಕ್ಕಡಿ ಇಲ್ಲ")}</span>
        {!connected && !kiosk?.on && <Link href="/?desk=scales" className="ctr-link">{k("Set up scale", "ತಕ್ಕಡಿ ಹೊಂದಿಸಿ")}</Link>}
        <span className="ctr-sp" />
        <button type="button" className={`ctr-tbtn${holds.length ? " has" : ""}`} onClick={() => { setPanel("holds"); void loadHolds(); }}>
          🅿️ {k("Held", "ಹಿಡಿದ")} <b>{holds.length}</b>
        </button>
        <button type="button" className="ctr-tbtn" onClick={() => { setBFilter("all"); setPanel("bills"); void loadBills(); }}>📋 {k("Bills", "ಬಿಲ್‌ಗಳು")}{openN > 0 && <b>{openN}</b>}</button>
        {heldN > 0 && <button type="button" className="ctr-tbtn has" onClick={() => { setBFilter("held"); setPanel("bills"); void loadBills(); }} title={k("Goods held till payment", "ಹಣ ಬರುವವರೆಗೆ ಹಿಡಿದ ಸರಕು")}>🔒 {heldN}</button>}
        <button type="button" className="ctr-tbtn" onClick={() => setPanel("look")} aria-label={k("Colours and layout", "ಬಣ್ಣ ಮತ್ತು ವಿನ್ಯಾಸ")}>🎨</button>
        {can("settings") && <button type="button" className="ctr-tbtn" onClick={() => setPanel("settings")} aria-label={k("Settings", "ಸೆಟ್ಟಿಂಗ್ಸ್")}>⚙️</button>}
        <button type="button" className="ctr-tbtn" onClick={() => { const u = UI_NEXT[uiSize]; setUiSize(u); write("counterUi", u); }} aria-label={k("Screen size", "ಪರದೆ ಗಾತ್ರ")} title={k("Screen size: Auto / Small / Normal / Large", "ಪರದೆ ಗಾತ್ರ: ಸ್ವಯಂ / ಸಣ್ಣ / ಸಾಮಾನ್ಯ / ದೊಡ್ಡ")}>
          A± <small>{uiSize === "auto" ? k("Auto", "ಸ್ವಯಂ") : uiSize === "s" ? k("Small", "ಸಣ್ಣ") : uiSize === "m" ? k("Normal", "ಸಾಮಾನ್ಯ") : k("Large", "ದೊಡ್ಡ")}</small>
        </button>
        <button type="button" className="ctr-tbtn" onClick={() => { const l = lang === "en" ? "kn" : "en"; setLang(l); write("counterLang", l); }}>
          {lang === "en" ? "ಕನ್ನಡ" : "English"}
        </button>
      </header>

      {/* ---------- weight strip ---------- */}
      <section className="ctr-weigh">
        <div className={`ctr-lcd ${frozen != null ? "ok" : !fresh ? "off" : steady ? "ok" : "mid"}`} aria-live="polite">
          <small>{frozen != null ? "📖 " : ""}{k("Weight", "ತೂಕ")} (kg){isBt && bt.tareKg > 0 ? ` · ${k("net", "ನಿವ್ವಳ")}` : ""}</small>
          <span>{fresh || frozen != null ? kg.toFixed(3) : "0.000"}</span>
        </div>
        <div className={`ctr-tarewin${bt.tareKg > 0 ? " on" : ""}`}>
          <small>{k("Tare", "ಟೇರ್")} (kg)</small>
          <b>{bt.tareKg > 0 ? bt.tareKg.toFixed(3) : "0.000"}</b>
          <small className="nm">{bt.container || (bt.tareKg > 0 ? k("manual", "ಕೈಯಿಂದ") : k("none", "ಇಲ್ಲ"))}</small>
        </div>
        <div className="ctr-lcd small">
          <small>{k("Total", "ಒಟ್ಟು")} ₹</small>
          <span>{total.toFixed(2)}</span>
        </div>
        <div className="ctr-tare">
          <button type="button" className={`big${frozen != null ? " on" : ""}`} disabled={frozen == null && !(fresh && kgLive > 0)} onClick={() => setFrozen(frozen != null ? null : kgLive)} title={k("Reads the weight now, even if the scale is still moving. Tap an item to bill it, or tap again to let go.", "ತೂಕ ಚಲಿಸುತ್ತಿದ್ದರೂ ಈಗಲೇ ಓದುತ್ತದೆ. ವಸ್ತು ಒತ್ತಿ ಬಿಲ್ ಮಾಡಿ, ಅಥವಾ ಮತ್ತೆ ಒತ್ತಿ ಬಿಡಿ.")}>
            📖 {frozen != null ? `${k("Let go", "ಬಿಡಿ")} · ${frozen.toFixed(3)}` : k("Read weight", "ತೂಕ ಓದಿ")}
          </button>
          <button type="button" className={fill ? "on" : ""} onClick={() => (fill ? setFill(null) : openPad({ kind: "amount" }))}>
            ₹→kg {fill ? `₹${fill.amount} ✕` : k("By amount", "ಮೊತ್ತದಿಂದ")}
          </button>
          {isBt ? (
            <>
              <button type="button" className="big" disabled={!bt.live || bt.live.grossKg <= 0} onClick={() => bt.live && bt.setTare(bt.live.grossKg)} title={k("Put the empty container on the scale, then press", "ಖಾಲಿ ಡಬ್ಬಿ ಇಟ್ಟು ಒತ್ತಿ")}>
                ⚖️ {k("Tare", "ಟೇರ್")}
              </button>
              {bt.tareKg > 0 && <button type="button" onClick={() => bt.setTare(0)}>{k("Clear tare", "ಟೇರ್ ತೆಗೆ")}</button>}
              {bt.containers.map((c) => (
                <button type="button" key={c.name} className={bt.container === c.name ? "on" : ""} onClick={() => bt.pickContainer(bt.container === c.name ? null : c.name)}>
                  {c.name} <small>{c.kg.toFixed(3)}</small>
                </button>
              ))}
            </>
          ) : (
            <small className="ctr-hint">{k("Tare works with the Bluetooth scale on this device.", "ಟೇರ್ ಈ ಸಾಧನದ ಬ್ಲೂಟೂತ್ ತಕ್ಕಡಿಯೊಂದಿಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.")}</small>
          )}
        </div>
      </section>

      {fill && (
        <div className="ctr-banner ctr-fill">
          {!fill.item ? (
            <span>₹{fill.amount}: {k("tap the item to sell", "ಮಾರಬೇಕಾದ ವಸ್ತು ಒತ್ತಿ")}</span>
          ) : (
            <>
              <span>
                {nameOf(fill.item)} · ₹{fill.amount} @ ₹{fillRate} = <b>{fillKg.toFixed(3)} kg</b> · {k("now", "ಈಗ")} {kg.toFixed(3)} kg
                {usable && kg >= fillKg - 0.0005 ? " ✓" : usable ? ` · ${k("pour", "ಇನ್ನೂ")} ${Math.max(0, r3(fillKg - kg)).toFixed(3)}` : ""}
              </span>
              <button type="button" onClick={addFill}>＋ {k("Add to bill", "ಬಿಲ್‌ಗೆ ಸೇರಿಸಿ")}</button>
            </>
          )}
          <button type="button" onClick={() => setFill(null)} aria-label="Cancel">✕</button>
        </div>
      )}

      <main className="ctr-main">
        {/* ---------- bill ---------- */}
        <section className="ctr-bill" id="ctr-bill" aria-label={k("Bill", "ಬಿಲ್")}>
          {prev && !lines.length && (
            <div className="ctr-prev">
              <div>
                <b>{k("Previous bill", "ಹಿಂದಿನ ಬಿಲ್")} #{prev.no}</b>
                <div>{rupees(prev.total)}{prev.back > 0 ? ` · ${k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")} ${rupees(prev.back)}` : ""}</div>
              </div>
              <button type="button" onClick={() => setRcpt({ doc: prev.doc, auto: true })}>🖨️ {k("Re-print", "ಮತ್ತೆ ಮುದ್ರಿಸಿ")}</button>
              <button type="button" onClick={() => shareWhatsapp(prev.doc, prev.doc.party)}>💬 WhatsApp</button>
              <button type="button" className="x" onClick={() => setPrev(null)} aria-label="Close">✕</button>
            </div>
          )}
          {(editing || holdId) && <div className="ctr-banner">{editing ? `✏️ ${k("Editing bill", "ಬಿಲ್ ತಿದ್ದುಪಡಿ")} #${editing.no}` : `🅿️ ${k("Held bill", "ಹಿಡಿದ ಬಿಲ್")}`}</div>}
          <ol className="ctr-lines">
            {!lines.length && <li className="ctr-empty">{k("Put the item on the scale, then tap it (or type its PLU).", "ವಸ್ತುವನ್ನು ತಕ್ಕಡಿಯಲ್ಲಿ ಇಟ್ಟು ಒತ್ತಿ (ಅಥವಾ PLU ಟೈಪ್ ಮಾಡಿ).")}</li>}
            {lines.map((l, i) => (
              <li key={i}>
                <span className="n">{i + 1}</span>
                <span className="nm">
                  {lineName(l)}
                  {l.source !== "steady" && <em>{l.source === "typed" ? k("typed", "ಟೈಪ್") : k("moving", "ಅಲುಗಾಟ")}</em>}
                  {l.tareKg ? <small>{k("tare", "ಟೇರ್")} {l.tareKg.toFixed(3)}</small> : null}
                </span>
                <button type="button" className="q" onClick={() => (l.unit !== "kg" || can("typedWeight") ? openPad({ kind: "qty", line: i }) : setMsg({ ok: false, text: k("Typing a weight is locked.", "ತೂಕ ಟೈಪ್ ಮಾಡುವುದು ಲಾಕ್ ಆಗಿದೆ.") }))}>
                  {l.qty > 0 ? l.qty.toFixed(l.unit === "pcs" ? 0 : 3) : "—"} {l.unit}
                </button>
                <button type="button" className={`r${l.rate > 0 ? "" : " need"}`} disabled={!can("rate") && l.rate > 0} onClick={() => openPad({ kind: "rate", line: i })}>
                  {l.rate > 0 ? `₹${l.rate}` : k("rate?", "ದರ?")}
                </button>
                {discOn && (
                  <button type="button" className={`d${l.disc ? " on" : ""}`} onClick={() => openPad({ kind: "ldisc", line: i })} aria-label={k("Item discount", "ವಸ್ತು ರಿಯಾಯಿತಿ")}>
                    🏷️{l.disc ? (l.discPct ? `${l.disc}%` : `₹${l.disc}`) : ""}
                  </button>
                )}
                <b className="a">
                  {lineDisc(l) > 0 && <s>{rupees(lineGross(l))}</s>}
                  {rupees(lineAmount(l))}
                </b>
                <button type="button" className="del" onClick={() => removeLine(i)} aria-label={k("Remove", "ತೆಗೆ")}>✕</button>
              </li>
            ))}
          </ol>

          {(sum.discount > 0 || sum.roundOff !== 0 || itemDisc > 0) && (
            <div className="ctr-sub">
              {itemDisc > 0 && <span>{k("Item discount", "ವಸ್ತು ರಿಯಾಯಿತಿ")} −{rupees(itemDisc)}</span>}
              {(sum.discount > 0 || sum.roundOff !== 0) && <span>{k("Subtotal", "ಉಪ ಮೊತ್ತ")} {rupees(sum.gross)}</span>}
              {sum.discount > 0 && <span>{k("Discount", "ರಿಯಾಯಿತಿ")} −{rupees(sum.discount)}</span>}
              {sum.roundOff !== 0 && <span>{k("Round-off", "ಸುತ್ತು")} {sum.roundOff > 0 ? "+" : "−"}{rupees(Math.abs(sum.roundOff))}</span>}
            </div>
          )}
          <div className="ctr-tot">
            <span>{lines.length} {k("item(s)", "ವಸ್ತು")} · {billKg(lines).toFixed(3)} kg</span>
            <b>{rupees(total)}</b>
          </div>
          {discOn && lines.length > 0 && (
            <button type="button" className="ctr-discbtn" onClick={() => openPad({ kind: "discount" })}>
              🏷️ {k("Bill discount", "ಬಿಲ್ ರಿಯಾಯಿತಿ")} {adjust.discount > 0 ? (adjust.pct ? `${adjust.discount}%` : rupees(adjust.discount)) : ""}
            </button>
          )}

          <div className="ctr-pay" role="radiogroup">
            {(["CASH", "UPI", "CREDIT", "SPLIT"] as CounterPay[]).filter((p) => p !== "CREDIT" || can("udhaar")).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pay === p} className={pay === p ? "on" : ""} onClick={() => { setPay(p); setReceived(0); setHandPick(null); }}>
                {p === "SPLIT" ? `➗ ${k("Split", "ಹಂಚಿಕೆ")}` : `${CHAN_TEXT[p as Chan][2]} ${k(CHAN_TEXT[p as Chan][0], CHAN_TEXT[p as Chan][1])}`}
              </button>
            ))}
          </div>

          {pay === "SPLIT" && (
            <div className="ctr-split">
              {(["CASH", "UPI", "CREDIT"] as Chan[]).filter((c) => c !== "CREDIT" || can("udhaar")).map((c) => (
                <div key={c} className="row">
                  <span>{CHAN_TEXT[c][2]} {k(CHAN_TEXT[c][0], CHAN_TEXT[c][1])}</span>
                  <button type="button" className="amt" onClick={() => openPad({ kind: "split", chan: c })}>{rupees(split[c] || 0)}</button>
                  <button type="button" className="rest" disabled={splitLeft <= 0} onClick={() => setSplit((s) => ({ ...s, [c]: r2((s[c] || 0) + splitLeft) }))}>+ {k("rest", "ಉಳಿದದ್ದು")}</button>
                </div>
              ))}
              <p className={splitLeft === 0 ? "ok" : "bad"}>{splitLeft === 0 ? k("Split adds up ✓", "ಹಂಚಿಕೆ ಸರಿ ✓") : `${k("Left to split", "ಹಂಚಲು ಉಳಿದದ್ದು")} ${rupees(splitLeft)}`}</p>
            </div>
          )}

          {cashDue > 0 && (
            <div className="ctr-cash">
              <button type="button" className="recv" onClick={() => openPad({ kind: "received" })}>
                {k("Cash received", "ಪಡೆದ ನಗದು")}: <b>{received > 0 ? rupees(received) : "—"}</b>
              </button>
              {!(received > 0) && <small className="ctr-hint">{k("Not typed = exact amount. Type it only if the customer gives more.", "ಟೈಪ್ ಮಾಡದಿದ್ದರೆ ಸರಿಯಾದ ಮೊತ್ತ. ಹೆಚ್ಚು ಕೊಟ್ಟರೆ ಮಾತ್ರ ಟೈಪ್ ಮಾಡಿ.")}</small>}
              {back > 0 && <div className="ctr-back-cash">{k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")} <b>{rupees(back)}</b></div>}
              {shortBy > 0 && <div className="ctr-short">{k("Still to collect", "ಇನ್ನೂ ಪಡೆಯಬೇಕು")} <b>{rupees(shortBy)}</b></div>}
            </div>
          )}

          {upiDue > 0 && (
            <div className="ctr-upi">
              {vpa ? (
                <>
                  <QrCode value={upiFor(upiDue, `Bill · ${itemsNote(lines)}`) || ""} moduleSize={4} />
                  <div>
                    <b>{rupees(upiDue)}</b>
                    <small>{k("Customer scans: the exact amount fills in by itself", "ಗ್ರಾಹಕರು ಸ್ಕ್ಯಾನ್ ಮಾಡಲಿ — ಮೊತ್ತ ತಾನಾಗಿ ತುಂಬುತ್ತದೆ")}</small>
                    <small>{vpa}</small>
                  </div>
                </>
              ) : (
                <small>{k("Add the shop's UPI ID in Settings → Shop to show a pay QR here.", "UPI QR ಗೆ ಸೆಟ್ಟಿಂಗ್ಸ್ → ಶಾಪ್‌ನಲ್ಲಿ UPI ID ಸೇರಿಸಿ.")}</small>
              )}
            </div>
          )}

          {pay === "CREDIT" || (pay === "SPLIT" && (split.CREDIT || 0) > 0) || showParty ? (
            <input className="ctr-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder={k("Customer name / mobile", "ಗ್ರಾಹಕರ ಹೆಸರು / ಮೊಬೈಲ್")} list="ctr-parties" />
          ) : (
            <button type="button" className="ctr-addparty" onClick={() => setShowParty(true)}>＋ {k("Customer name / mobile", "ಗ್ರಾಹಕರ ಹೆಸರು / ಮೊಬೈಲ್")}</button>
          )}
          {shop.gstin && (
            <div className="ctr-gst">
              <label className="ctr-set">
                <input type="checkbox" checked={taxInv.on} onChange={(e) => setTaxInv({ ...taxInv, on: e.target.checked })} />
                <span>🧾 {k("GST tax invoice", "GST ತೆರಿಗೆ ಇನ್ವಾಯ್ಸ್")}</span>
              </label>
              {taxInv.on && (
                <>
                  <input className="ctr-party" value={taxInv.gstin} onChange={(e) => setTaxInv({ ...taxInv, gstin: e.target.value.toUpperCase().slice(0, 15) })} placeholder={k("Customer GSTIN (optional)", "ಗ್ರಾಹಕರ GSTIN (ಐಚ್ಛಿಕ)")} />
                  <label className="ctr-set">
                    <input type="checkbox" checked={taxInv.igst} onChange={(e) => setTaxInv({ ...taxInv, igst: e.target.checked })} />
                    <span>{k("Other state (IGST)", "ಬೇರೆ ರಾಜ್ಯ (IGST)")}</span>
                  </label>
                </>
              )}
            </div>
          )}
          <datalist id="ctr-parties">{(day?.allParties || []).slice(0, 300).map((p) => <option key={p} value={p} />)}</datalist>

          {msg && <p className={`ctr-msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</p>}
          {loadErr && <p className="ctr-msg bad">{loadErr}</p>}

          {(upiDue > 0 || creditDue > 0) && lines.length > 0 && (
            <div className="ctr-hand" role="radiogroup" aria-label={k("Goods", "ಸರಕು")}>
              <span>📦 {k("Goods", "ಸರಕು")}</span>
              <button type="button" role="radio" aria-checked={hand === "GIVEN"} className={hand === "GIVEN" ? "on" : ""} onClick={() => setHandPick("GIVEN")}>✅ {k("Give now", "ಈಗ ಕೊಡಿ")}</button>
              <button type="button" role="radio" aria-checked={hand === "HELD"} className={hand === "HELD" ? "on hold" : ""} onClick={() => setHandPick("HELD")}>🔒 {k("Hold till paid", "ಹಣ ಬರುವವರೆಗೆ ಹಿಡಿಯಿರಿ")}</button>
            </div>
          )}
          <div className="ctr-act">
            <button type="button" className="clr" onClick={clearBill} disabled={busy || !lines.length}>{holdId ? k("Close", "ಮುಚ್ಚು") : k("Clear", "ಅಳಿಸಿ")}</button>
            <button type="button" className="hold" onClick={() => void holdBill()} disabled={busy || !lines.length}>🅿️ {k("Hold", "ಹಿಡಿ")}</button>
            {!autoPrint && <button type="button" className="sv" onClick={() => void save(false)} disabled={busy || !lines.length}>{k("Save", "ಉಳಿಸಿ")}</button>}
            <button type="button" className="go" onClick={() => void save(autoPrint)} disabled={busy || !lines.length}>
              {busy ? "…" : `🖨️ ${autoPrint ? k("Save & Print", "ಉಳಿಸಿ & ಮುದ್ರಿಸಿ") : k("Save & Print", "ಉಳಿಸಿ & ಮುದ್ರಿಸಿ")}`}
              <small>{rupees(total)}</small>
            </button>
          </div>
        </section>

        {/* ---------- item keys ---------- */}
        <section className="ctr-items">
          <div className="ctr-itemhead">
            <input className="ctr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 ${k("Search item or PLU", "ವಸ್ತು ಅಥವಾ PLU ಹುಡುಕಿ")}`} />
            <button type="button" className="ctr-plu" onClick={() => openPad({ kind: "plu" })}>⌨️ PLU</button>
            {isOwner && <button type="button" className="ctr-plu" onClick={openItems}>✏️ {k("Items", "ವಸ್ತುಗಳು")}</button>}
          </div>
          <div className="ctr-grid">
            {tiles.map((ci) => {
              const rate = rateOf(ci);
              return (
                <button key={ci.key} type="button" className={`ctr-key${usable && ci.unit === "kg" ? " ready" : ""}`} onClick={() => addItem(ci)}>
                  <span className="plu">{ci.plu}</span>
                  <span className="ic" aria-hidden>{ci.icon}</span>
                  <b>{nameOf(ci)}</b>
                  {lang === "kn" ? <small>{ci.en}</small> : ci.kn ? <small>{ci.kn}</small> : null}
                  <small className="rt">{rate > 0 ? `₹${rate}/${ci.unit}` : k("no rate", "ದರ ಇಲ್ಲ")}</small>
                  {usable && ci.unit === "kg" && rate > 0 && <em>{rupees(r2(kg * rate))}</em>}
                </button>
              );
            })}
            {!day && !loadErr && <p className="ctr-empty">…</p>}
          </div>
        </section>
      </main>

      {/* phone only: always-visible total, jumps to the bill and its pay buttons */}
      {lines.length > 0 && (
        <a className="ctr-sticky" href="#ctr-bill">
          <span>{lines.length} {k("item(s)", "ವಸ್ತು")} · {billKg(lines).toFixed(3)} kg</span>
          <b>{rupees(total)}</b>
          <span>{k("Pay", "ಪಾವತಿ")} ↓</span>
        </a>
      )}

      {/* ---------- pop-up keypad ---------- */}
      {ret && (
        <div className="ctr-modal" role="dialog" aria-label="Return items" onClick={() => !ret.busy && setRet(null)}>
          <div className="ctr-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>↩️ {k(`Return from bill #${ret.bill.no}`, `ಬಿಲ್ #${ret.bill.no} ರಿಂದ ರಿಟರ್ನ್`)}</b>
              <button type="button" onClick={() => setRet(null)} aria-label="Close">✕</button>
            </div>
            <ul className="ctr-list">
              {ret.items.map((it) => {
                const q = ret.picks[it.key] || 0;
                return (
                  <li key={it.key}>
                    <div className="open">
                      <b>{it.label}</b>
                      <small>{k("Left to return", "ಹಿಂತಿರುಗಿಸಬಹುದಾದ್ದು")} {it.leftQty} {it.unit || ""} · {rupees(it.leftAmt)}</small>
                    </div>
                    <button type="button" className="ctr-plu" disabled={it.leftQty <= 0} onClick={() => openPad({ kind: "retqty", key: it.key })}>{q > 0 ? `${q} ${it.unit || ""}` : k("Qty", "ಪ್ರಮಾಣ")}</button>
                    <button type="button" disabled={it.leftQty <= 0} onClick={() => setRet({ ...ret, picks: { ...ret.picks, [it.key]: it.leftQty }, err: "" })}>{k("All", "ಎಲ್ಲಾ")}</button>
                    <b className="amt">{q > 0 ? rupees(refundFor(it, q)) : ""}</b>
                  </li>
                );
              })}
            </ul>
            <div className="ctr-bact">
              {(["CASH", "UPI", "CREDIT"] as RefundMode[]).map((m) => (
                <button key={m} type="button" className={ret.mode === m ? "on" : ""} onClick={() => setRet({ ...ret, mode: m, err: "" })}>
                  {m === "CASH" ? k("💵 Cash back", "💵 ನಗದು ಹಿಂದೆ") : m === "UPI" ? k("📲 UPI back", "📲 UPI ಹಿಂದೆ") : k("📒 Cut udhaar", "📒 ಉದ್ರಿ ಕಡಿಮೆ")}
                </button>
              ))}
            </div>
            {ret.mode === "CREDIT" && !ret.bill.party && <p className="ctr-hint">{k("Udhaar needs the customer's name: it is taken from the bill, and this bill has none.", "ಉದ್ರಿಗೆ ಗ್ರಾಹಕರ ಹೆಸರು ಬೇಕು; ಈ ಬಿಲ್‌ನಲ್ಲಿ ಇಲ್ಲ.")}</p>}
            <input className="ctr-search" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value, err: "" })} placeholder={k("Reason (required): leaking tin, wrong item …", "ಕಾರಣ (ಅಗತ್ಯ): ಸೋರಿಕೆ, ತಪ್ಪು ವಸ್ತು …")} />
            {ret.err && <p className="ctr-msg bad">{ret.err}</p>}
            <div className="okrow">
              <button type="button" className="cancel" onClick={() => setRet(null)}>{k("Cancel", "ರದ್ದು")}</button>
              <button type="button" className="ok" disabled={ret.busy || !retPlan || "err" in retPlan} onClick={() => void saveReturn()}>
                ✓ {k("Return", "ರಿಟರ್ನ್")} {retPlan && !("err" in retPlan) ? rupees(retPlan.amount) : ""}
              </button>
            </div>
            <p className="ctr-hint">{k("Stock goes back in, and the cash book, udhaar and Daily Closing follow. The bill itself stays as it was.", "ಸ್ಟಾಕ್ ಮರಳುತ್ತದೆ; ಕ್ಯಾಶ್ ಬುಕ್, ಉದ್ರಿ, ಡೈಲಿ ಕ್ಲೋಸಿಂಗ್ ಅನುಸರಿಸುತ್ತವೆ. ಬಿಲ್ ಹಾಗೇ ಇರುತ್ತದೆ.")}</p>
          </div>
        </div>
      )}

      {pad && (
        <div className="ctr-modal" role="dialog" aria-label={padTitle(pad)} onClick={() => setPad(null)}>
          <div className="ctr-padbox" onClick={(e) => e.stopPropagation()}>
            <p className="ttl">{padTitle(pad)}</p>
            <div className="val">
              {pad.kind === "split" || pad.kind === "received" || pad.kind === "rate" || pad.kind === "amount" ? "₹" : ""}
              {padText || "0"}
              {(pad.kind === "discount" || pad.kind === "ldisc") && (padPct ? " %" : " ₹")}
            </div>
            {(pad.kind === "discount" || pad.kind === "ldisc") && (
              <div className="pct">
                <button type="button" className={!padPct ? "on" : ""} onClick={() => setPadPct(false)}>₹</button>
                <button type="button" className={padPct ? "on" : ""} onClick={() => setPadPct(true)}>%</button>
              </div>
            )}
            <div className="keys">
              {["7", "8", "9", "4", "5", "6", "1", "2", "3", pad.kind === "plu" ? "C" : ".", "0", "⌫"].map((key) => (
                <button key={key} type="button" onClick={() => padKey(key)}>{key}</button>
              ))}
            </div>
            <div className="okrow">
              <button type="button" className="cancel" onClick={() => setPad(null)}>{k("Cancel", "ರದ್ದು")}</button>
              <button type="button" className="ok" onClick={padOk}>✓ OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- held bills ---------- */}
      {panel === "holds" && (
        <div className="ctr-drawer" role="dialog" aria-label="Held bills" onClick={() => setPanel(null)}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>🅿️ {k("Held bills", "ಹಿಡಿದ ಬಿಲ್‌ಗಳು")} ({holds.length})</b>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>
            {!holds.length && <p className="ctr-empty">{k("No held bills. Press Hold to park a bill and serve the next customer.", "ಹಿಡಿದ ಬಿಲ್ ಇಲ್ಲ. ಮುಂದಿನ ಗ್ರಾಹಕರಿಗಾಗಿ ‘ಹಿಡಿ’ ಒತ್ತಿ.")}</p>}
            <ul className="ctr-list">
              {holds.map((h) => {
                const elsewhere = !!h.openedBy && h.openedBy !== device && !!h.openedAt && Date.now() - new Date(h.openedAt).getTime() < 10 * 60 * 1000;
                return (
                  <li key={h.id} className={h.id === holdId ? "here" : ""}>
                    <button type="button" className="open" onClick={() => void openHold(h)}>
                      <b>{h.label}</b>
                      <span>{(h.data?.lines || []).map((l) => `${l.label} ${l.qty.toFixed(3)}`).join(", ")}</span>
                      <small>
                        {ago(h.createdAt)}
                        {h.heldBy ? ` · ${h.heldBy}` : ""}
                        {h.id === holdId ? ` · ${k("open here", "ಇಲ್ಲಿ ತೆರೆದಿದೆ")}` : elsewhere ? ` · ${k("open on another device", "ಬೇರೆ ಸಾಧನದಲ್ಲಿ ತೆರೆದಿದೆ")}` : ""}
                      </small>
                    </button>
                    <b className="amt">{rupees(h.total)}</b>
                    {can("dropHold") && <button type="button" className="del" onClick={() => void dropHold(h)} aria-label="Delete held bill">🗑️</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ---------- saved bills ---------- */}
      {panel === "bills" && (
        <div className="ctr-drawer" role="dialog" aria-label="Bills" onClick={() => setPanel(null)}>
          <div className="ctr-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>📋 {k("Bills", "ಬಿಲ್‌ಗಳು")}</b>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>
            <div className="ctr-bfilter">
              <input type="date" value={bFrom || date} max={date} onChange={(e) => setBFrom(e.target.value)} aria-label={k("From", "ಇಂದ")} />
              <input type="date" value={bTo || bFrom || date} max={date} onChange={(e) => setBTo(e.target.value)} aria-label={k("To", "ವರೆಗೆ")} />
              <button type="button" onClick={() => void loadBills()}>↻ {k("Show", "ತೋರಿಸು")}</button>
              <button type="button" onClick={exportCsv} disabled={!shownBills.length}>⬇ Excel</button>
              <button type="button" onClick={printSummary} disabled={!shownBills.length}>🖨️ {k("Summary", "ಸಾರಾಂಶ")}</button>
            </div>
            <input className="ctr-search" value={bQ} onChange={(e) => setBQ(e.target.value)} placeholder={k("🔍 Bill no, customer, item, amount", "🔍 ಬಿಲ್ ಸಂಖ್ಯೆ, ಹೆಸರು, ವಸ್ತು, ಮೊತ್ತ")} />
            <div className="ctr-seg">
              <button type="button" className={bFilter === "all" ? "on" : ""} onClick={() => setBFilter("all")}>{k("All", "ಎಲ್ಲಾ")}</button>
              <button type="button" className={bFilter === "open" ? "on" : ""} onClick={() => setBFilter("open")}>⏳ {k("Payment pending", "ಹಣ ಬಾಕಿ")} {openN > 0 ? `(${openN})` : ""}</button>
              <button type="button" className={bFilter === "held" ? "on" : ""} onClick={() => setBFilter("held")}>🔒 {k("Goods held", "ಸರಕು ಹಿಡಿದಿದೆ")} {heldN > 0 ? `(${heldN})` : ""}</button>
            </div>
            <div className="ctr-bsum">
              <span>{bSum.count} {k("bills", "ಬಿಲ್")}</span>
              <b>{rupees(bSum.total)}</b>
              <span>{bSum.kg.toFixed(3)} kg</span>
              {Object.entries(bSum.modes).map(([m, v]) => <span key={m}>{modeName(m)} {rupees(v)}</span>)}
              {retTotal > 0 && <span>↩️ {k("Returned", "ಹಿಂತಿರುಗಿಸಿದ್ದು")} −{rupees(retTotal)}</span>}
            </div>
            {bErr && <p className="ctr-msg bad">{bErr}</p>}
            <ul className="ctr-list">
              {shownBills.map((b) => (
                <li key={b.key}>
                  <div className="open">
                    <b>#{b.no} · {b.party || k("Walk-in", "ನಗದು ಗ್ರಾಹಕ")}</b>
                    <span>{b.lines.map((l) => `${l.label}${l.qty ? ` ${l.qty.toFixed(3)}` : ""}`).join(", ")}</span>
                    <small>{b.date} {timeOf(b.createdAt)} · {Object.keys(b.modes).map(modeName).join(" + ")}{b.by ? ` · ${b.by}` : ""}{b.notes ? ` · ${b.notes}` : ""}</small>
                    {isTracked(b.track) && (() => {
                      const ps = payStatus(b.modes, b.track);
                      const ho = handoverOf(b.track);
                      return (
                        <span className="ctr-tags">
                          <span className={`tag ${ps.state.toLowerCase()}`}>
                            {ps.state === "PAID" ? `✅ ${k("Paid", "ಪಾವತಿ")}` : ps.state === "PENDING" ? `⏳ ${k("UPI to check", "UPI ಪರಿಶೀಲಿಸಿ")} ${rupees(ps.due)}` : ps.state === "UNPAID" ? `❌ ${k("Unpaid", "ಪಾವತಿ ಇಲ್ಲ")} ${rupees(ps.due)}` : `◐ ${k("Part paid · due", "ಭಾಗಶಃ · ಬಾಕಿ")} ${rupees(ps.due)}`}
                          </span>
                          <span className={`tag ${ho === "HELD" ? "held" : "given"}`}>{ho === "HELD" ? `🔒 ${k("Goods held", "ಸರಕು ಹಿಡಿದಿದೆ")}` : `📦 ${k("Given", "ಕೊಟ್ಟಿದೆ")}`}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <b className="amt">{rupees(b.total)}</b>
                  <div className="ctr-bact">
                    {isTracked(b.track) && payStatus(b.modes, b.track).upiDue > 0 && (
                      <button type="button" className={armed === `${b.key}:upi` ? "on" : ""} onClick={() => (armed === `${b.key}:upi` ? void trackAct(b, "upiOk") : setArmed(`${b.key}:upi`))}>
                        {armed === `${b.key}:upi` ? k("Tap again: UPI received", "ಮತ್ತೆ ಒತ್ತಿ: UPI ಬಂದಿದೆ") : `✓ ${k("UPI received", "UPI ಬಂದಿದೆ")}`}
                      </button>
                    )}
                    {isTracked(b.track) && payStatus(b.modes, b.track).creditDue > 0 && (["CASH", "UPI"] as const).map((m) => (
                      <button key={m} type="button" className={armed === `${b.key}:${m}` ? "on" : ""} onClick={() => (armed === `${b.key}:${m}` ? void trackAct(b, "paidLater", { mode: m }) : setArmed(`${b.key}:${m}`))}>
                        {armed === `${b.key}:${m}` ? k("Tap again to confirm", "ಖಚಿತಪಡಿಸಲು ಮತ್ತೆ ಒತ್ತಿ") : m === "CASH" ? `💵 ${k("Paid cash", "ನಗದು ಬಂದಿದೆ")}` : `📲 ${k("Paid UPI", "UPI ಬಂದಿದೆ")}`}
                      </button>
                    ))}
                    {isTracked(b.track) && handoverOf(b.track) === "HELD" && <button type="button" onClick={() => void trackAct(b, "handover", { value: "GIVEN" })}>📦 {k("Hand over", "ಕೊಡಿ")}</button>}
                    <button type="button" onClick={() => setRcpt({ doc: billDoc(b), auto: true })} aria-label={k("Re-print", "ಮತ್ತೆ ಮುದ್ರಿಸಿ")}>🖨️</button>
                    <button type="button" onClick={() => shareWhatsapp(billDoc(b), b.party)} aria-label="WhatsApp">💬</button>
                    <button type="button" onClick={() => void openReturn(b)} aria-label={k("Return items", "ವಸ್ತು ಹಿಂತಿರುಗಿಸಿ")}>↩️ {k("Return", "ರಿಟರ್ನ್")}</button>
                    {b.date === date && can("cancel") && <button type="button" onClick={() => void editBill(b)} aria-label={k("Edit", "ತಿದ್ದು")}>✏️</button>}
                    {can("cancel") && <button type="button" onClick={() => void cancelBill(b)}>✕ {k("Cancel", "ರದ್ದು")}</button>}
                  </div>
                </li>
              ))}
              {!shownBills.length && !bErr && <li className="ctr-empty">{k("No bills for these dates.", "ಈ ದಿನಾಂಕಗಳಿಗೆ ಬಿಲ್ ಇಲ್ಲ.")}</li>}
            </ul>
            <p className="ctr-hint">{k("Staff can cancel or edit today's bills only; the owner any day. Every cancel is kept in the Activity log with its reason.", "ಸಿಬ್ಬಂದಿ ಇಂದಿನ ಬಿಲ್ ಮಾತ್ರ ರದ್ದು/ತಿದ್ದುಪಡಿ ಮಾಡಬಹುದು; ಮಾಲೀಕರು ಯಾವುದೇ ದಿನ. ಪ್ರತಿ ರದ್ದು ಕಾರಣದೊಂದಿಗೆ ದಾಖಲಾಗುತ್ತದೆ.")}</p>
          </div>
        </div>
      )}

      {/* ---------- items set-up (owner) ---------- */}
      {panel === "items" && (
        <div className="ctr-drawer" role="dialog" aria-label="Items" onClick={() => setPanel(null)}>
          <div className="ctr-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>✏️ {k("Counter items", "ಕೌಂಟರ್ ವಸ್ತುಗಳು")}</b>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>
            <p className="ctr-hint">{k("PLU is the number staff can type. Rate empty = use the last rate from the register. Hidden items stay in old bills.", "PLU ಸಿಬ್ಬಂದಿ ಟೈಪ್ ಮಾಡುವ ಸಂಖ್ಯೆ. ದರ ಖಾಲಿ = ರಿಜಿಸ್ಟರ್‌ನ ಕೊನೆಯ ದರ.")}</p>
            <div className="ctr-itemtable">
              <div className="hd"><span>PLU</span><span>{k("Icon", "ಚಿಹ್ನೆ")}</span><span>English</span><span>ಕನ್ನಡ</span><span>{k("Unit", "ಘಟಕ")}</span><span>₹</span><span>HSN</span><span>GST%</span><span>{k("Hide", "ಮರೆ")}</span><span /></div>
              {draftItems.map((it, i) => (
                <div key={i} className="rw">
                  <input inputMode="numeric" value={it.plu || ""} onChange={(e) => patchDraft(i, { plu: parseInt(e.target.value, 10) || 0 })} aria-label="PLU" />
                  <input value={it.icon} onChange={(e) => patchDraft(i, { icon: e.target.value })} aria-label={k("Icon", "ಚಿಹ್ನೆ")} />
                  <input value={it.en} onChange={(e) => patchDraft(i, { en: e.target.value })} aria-label="English" />
                  <input value={it.kn} onChange={(e) => patchDraft(i, { kn: e.target.value })} aria-label="ಕನ್ನಡ" />
                  <select value={it.unit} onChange={(e) => patchDraft(i, { unit: e.target.value as CounterItem["unit"] })} aria-label={k("Unit", "ಘಟಕ")}>
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                    <option value="pcs">pcs</option>
                  </select>
                  <input inputMode="decimal" value={it.rate || ""} placeholder="—" onChange={(e) => patchDraft(i, { rate: parseFloat(e.target.value) || 0 })} aria-label="Rate" />
                  <input inputMode="numeric" value={it.hsn ?? DEFAULT_HSN[it.key] ?? ""} placeholder="HSN" onChange={(e) => patchDraft(i, { hsn: e.target.value.replace(/\D/g, "").slice(0, 8) })} aria-label="HSN" />
                  <input inputMode="decimal" value={it.gst ?? DEFAULT_GST_PCT} onChange={(e) => patchDraft(i, { gst: Math.min(28, Math.max(0, parseFloat(e.target.value) || 0)) })} aria-label="GST %" />
                  <input type="checkbox" checked={!!it.hidden} onChange={(e) => patchDraft(i, { hidden: e.target.checked })} aria-label={k("Hide", "ಮರೆಮಾಡು")} />
                  <button type="button" onClick={() => setDraftItems((d) => d.filter((_, j) => j !== i))} aria-label={k("Remove", "ತೆಗೆ")}>🗑️</button>
                </div>
              ))}
            </div>
            <button type="button" className="ctr-plu" onClick={() => setDraftItems((d) => [...d, { key: "", plu: nextPlu(d.map((x) => x.plu)), en: "", kn: "", icon: "🛢️", unit: "kg", rate: 0 }])}>
              ＋ {k("Add item", "ವಸ್ತು ಸೇರಿಸಿ")}
            </button>
            <div className="ctr-act">
              <button type="button" className="clr" onClick={() => setPanel(null)}>{k("Cancel", "ರದ್ದು")}</button>
              <button type="button" className="go" onClick={async () => { if (await saveCfg(draftItems.filter((x) => x.en.trim()), draftLocks)) setPanel(null); }}>
                ✓ {k("Save items", "ವಸ್ತುಗಳನ್ನು ಉಳಿಸಿ")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- look & feel ---------- */}
      {panel === "look" && (
        <div className="ctr-drawer" role="dialog" aria-label="Colours and layout" onClick={() => setPanel(null)}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>🎨 {k("Colours & layout", "ಬಣ್ಣ ಮತ್ತು ವಿನ್ಯಾಸ")}</b>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>
            <p className="ctr-look-note">{k("Saved on this device only; the changes show straight away.", "ಈ ಸಾಧನದಲ್ಲಿ ಮಾತ್ರ ಉಳಿಯುತ್ತದೆ; ತಕ್ಷಣ ಕಾಣುತ್ತದೆ.")}</p>
            <h4>{k("Main colour", "ಮುಖ್ಯ ಬಣ್ಣ")}</h4>
            <div className="ctr-sw">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" title={k(p.en, p.kn)} aria-label={p.en} className={theme.preset === p.id ? "on" : ""} style={{ background: p.hex }} onClick={() => setLook({ preset: p.id })} />
              ))}
              <input type="color" aria-label={k("Pick any colour", "ಯಾವುದೇ ಬಣ್ಣ ಆರಿಸಿ")} value={accentOf(theme)} onChange={(e) => validHex(e.target.value) && setLook({ preset: "custom", custom: e.target.value })} />
            </div>
            <h4>{k("Light or dark", "ಬೆಳಕು / ಕತ್ತಲೆ")}</h4>
            <div className="ctr-seg">
              {([["auto", "Auto", "ಸ್ವಯಂ"], ["light", "Light", "ಬೆಳಕು"], ["dark", "Dark", "ಕತ್ತಲೆ"], ["black", "Black", "ಕಪ್ಪು"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={theme.mode === v ? "on" : ""} onClick={() => setLook({ mode: v })}>{k(en, kn)}</button>
              ))}
            </div>
            <h4>{k("Panel see-through", "ಪ್ಯಾನೆಲ್ ಪಾರದರ್ಶಕತೆ")} · {theme.opacity}%</h4>
            <input className="ctr-range" type="range" min={40} max={100} step={5} value={theme.opacity} onChange={(e) => setLook({ opacity: Number(e.target.value) })} />
            <h4>{k("Background", "ಹಿನ್ನೆಲೆ")}</h4>
            <div className="ctr-seg">
              {([["plain", "Plain", "ಸರಳ"], ["tint", "Colour glow", "ಬಣ್ಣದ ಹೊಳಪು"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={theme.backdrop === v ? "on" : ""} onClick={() => setLook({ backdrop: v })}>{k(en, kn)}</button>
              ))}
            </div>
            <h4>{k("Corners", "ಮೂಲೆಗಳು")}</h4>
            <div className="ctr-seg">
              {([["sq", "Square", "ಚೌಕ"], ["md", "Normal", "ಸಾಮಾನ್ಯ"], ["rd", "Round", "ದುಂಡು"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={theme.corner === v ? "on" : ""} onClick={() => setLook({ corner: v })}>{k(en, kn)}</button>
              ))}
            </div>
            <h4>{k("Spacing", "ಅಂತರ")}</h4>
            <div className="ctr-seg">
              {([["compact", "Compact", "ಬಿಗಿ"], ["normal", "Normal", "ಸಾಮಾನ್ಯ"], ["roomy", "Roomy", "ವಿಶಾಲ"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={theme.density === v ? "on" : ""} onClick={() => setLook({ density: v })}>{k(en, kn)}</button>
              ))}
            </div>
            <h4>{k("Item key size", "ವಸ್ತು ಕೀ ಗಾತ್ರ")}</h4>
            <div className="ctr-seg">
              {([["s", "Small", "ಸಣ್ಣ"], ["m", "Medium", "ಮಧ್ಯಮ"], ["l", "Large", "ದೊಡ್ಡ"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={theme.keySize === v ? "on" : ""} onClick={() => setLook({ keySize: v })}>{k(en, kn)}</button>
              ))}
            </div>
            <h4>{k("Weight display colour", "ತೂಕ ಪರದೆ ಬಣ್ಣ")}</h4>
            <div className="ctr-sw">
              {([["green", "#8ef0a2"], ["amber", "#ffc857"], ["white", "#f5f5f5"], ["cyan", "#7dd3fc"]] as const).map(([v, hex]) => (
                <button key={v} type="button" aria-label={v} className={theme.lcd === v ? "on" : ""} style={{ background: hex }} onClick={() => setLook({ lcd: v })} />
              ))}
            </div>
            <h4>{k("Screen size", "ಪರದೆ ಗಾತ್ರ")}</h4>
            <div className="ctr-seg">
              {([["auto", "Auto", "ಸ್ವಯಂ"], ["s", "Small", "ಸಣ್ಣ"], ["m", "Normal", "ಸಾಮಾನ್ಯ"], ["l", "Large", "ದೊಡ್ಡ"]] as const).map(([v, en, kn]) => (
                <button key={v} type="button" className={uiSize === v ? "on" : ""} onClick={() => { setUiSize(v); write("counterUi", v); }}>{k(en, kn)}</button>
              ))}
            </div>
            <button type="button" className="ctr-tbtn" onClick={() => { setTheme(DEFAULT_THEME); write("counterTheme", DEFAULT_THEME); setUiSize("auto"); write("counterUi", "auto"); }}>↺ {k("Back to the standard look", "ಮೊದಲಿನ ರೂಪಕ್ಕೆ ಮರಳಿ")}</button>
          </div>
        </div>
      )}

      {/* ---------- settings ---------- */}
      {panel === "settings" && (
        <div className="ctr-drawer" role="dialog" aria-label="Counter settings" onClick={() => setPanel(null)}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>⚙️ {k("Counter settings", "ಕೌಂಟರ್ ಸೆಟ್ಟಿಂಗ್ಸ್")}</b>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">✕</button>
            </div>
            <h4>{k("This device", "ಈ ಸಾಧನ")}</h4>
            <label className="ctr-set">
              <input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); write("counterAutoPrint", e.target.checked); }} />
              <span>{k("Print the receipt as soon as the bill is saved", "ಬಿಲ್ ಉಳಿಸಿದ ತಕ್ಷಣ ರಸೀದಿ ಮುದ್ರಿಸು")}</span>
            </label>
            {(Object.keys(SETTING_TEXT) as (keyof Settings)[]).map((key) => (
              <label key={key} className="ctr-set">
                <input type="checkbox" checked={settings[key]} onChange={(e) => setSetting(key, e.target.checked)} />
                <span>{k(SETTING_TEXT[key][0], SETTING_TEXT[key][1])}</span>
              </label>
            ))}

            <h4>{k("Install on another device", "ಬೇರೆ ಸಾಧನದಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್")}</h4>
            <p className="ctr-hint">
              {k(
                "Open this page in Chrome on that device, then menu ⋮ → Install app (or Add to Home screen). It becomes its own “Weigh & Bill” icon that opens only the counter. Then turn on Counter-only mode below on that device.",
                "ಆ ಸಾಧನದ Chrome ನಲ್ಲಿ ಈ ಪುಟ ತೆರೆಯಿರಿ; ಮೆನು ⋮ → Install app (ಅಥವಾ Add to Home screen). “ತೂಕ & ಬಿಲ್” ಎಂಬ ಪ್ರತ್ಯೇಕ ಐಕಾನ್ ಆಗುತ್ತದೆ. ನಂತರ ಆ ಸಾಧನದಲ್ಲಿ ಕೆಳಗಿನ ಕೌಂಟರ್-ಮಾತ್ರ ಮೋಡ್ ಆನ್ ಮಾಡಿ."
              )}
            </p>
            <h4>{k("Counter-only mode (this device)", "ಕೌಂಟರ್-ಮಾತ್ರ ಮೋಡ್ (ಈ ಸಾಧನ)")}</h4>
            <p className="ctr-hint">
              {k(
                "When on, this tablet / phone opens only Weigh & Bill; every other page is closed except the ones ticked below. Leaving needs the PIN.",
                "ಆನ್ ಆದಾಗ ಈ ಸಾಧನದಲ್ಲಿ ತೂಕ & ಬಿಲ್ ಮಾತ್ರ ತೆರೆಯುತ್ತದೆ; ಕೆಳಗೆ ಆರಿಸಿದ ಪುಟಗಳು ಮಾತ್ರ ತೆರೆಯುತ್ತವೆ. ಹೊರಬರಲು PIN ಬೇಕು."
              )}
            </p>
            <button type="button" className={`ctr-kiosk${kiosk?.on ? " on" : ""}`} onClick={() => void (kiosk?.on ? kioskOff() : kioskOn())}>
              {kiosk?.on ? `🔒 ${k("On — tap to leave (PIN)", "ಆನ್ — ಹೊರಬರಲು ಒತ್ತಿ (PIN)")}` : `🔓 ${k("Off — tap to turn on", "ಆಫ್ — ಆನ್ ಮಾಡಲು ಒತ್ತಿ")}`}
            </button>
            {(Object.keys(KIOSK_EXTRAS) as KioskExtra[]).map((x) => (
              <label key={x} className="ctr-set">
                <input type="checkbox" checked={!!kiosk?.allow.includes(x)} disabled={!!kiosk?.on} onChange={(e) => kioskAllow(x, e.target.checked)} />
                <span>{k("Also allow", "ಇದನ್ನೂ ಅನುಮತಿಸು")}: {k(KIOSK_EXTRAS[x].en, KIOSK_EXTRAS[x].kn)}</span>
              </label>
            ))}
            <p className="ctr-hint">
              {k(
                "Home-screen tile: after updating the Mahadev Desk app, long-press its icon and drag “Weigh & Bill” to the home screen.",
                "ಹೋಮ್ ಸ್ಕ್ರೀನ್ ಟೈಲ್: ಆಪ್ ಅಪ್‌ಡೇಟ್ ಮಾಡಿದ ನಂತರ ಐಕಾನ್ ಮೇಲೆ ಒತ್ತಿ ಹಿಡಿದು “Weigh & Bill” ಅನ್ನು ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ಗೆ ಎಳೆಯಿರಿ."
              )}
            </p>

            {isOwner && (
              <>
                <h4>{k("Lock for staff (all devices)", "ಸಿಬ್ಬಂದಿಗೆ ಲಾಕ್ (ಎಲ್ಲಾ ಸಾಧನಗಳು)")}</h4>
                {(Object.keys(STAFF_LOCKS) as StaffLock[]).map((lk) => (
                  <label key={lk} className="ctr-set">
                    <input
                      type="checkbox"
                      checked={cfg.staffLocks.includes(lk)}
                      onChange={(e) => void saveCfg(cfg.items, e.target.checked ? [...cfg.staffLocks, lk] : cfg.staffLocks.filter((x) => x !== lk))}
                    />
                    <span>{k(STAFF_LOCKS[lk][0], STAFF_LOCKS[lk][1])}</span>
                  </label>
                ))}
                <label className="ctr-set">
                  <span>{k("Staff discount limit (% of bill)", "ಸಿಬ್ಬಂದಿ ರಿಯಾಯಿತಿ ಮಿತಿ (ಬಿಲ್‌ನ %)")}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.5"
                    defaultValue={cfg.staffDiscMaxPct}
                    style={{ width: 70, marginLeft: 8 }}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== cfg.staffDiscMaxPct) void saveCfg(cfg.items, cfg.staffLocks, v);
                    }}
                  />
                </label>
                <button type="button" className="ctr-plu" onClick={openItems}>✏️ {k("Items, PLU numbers and Kannada names", "ವಸ್ತುಗಳು, PLU ಸಂಖ್ಯೆ, ಕನ್ನಡ ಹೆಸರು")}</button>
              </>
            )}
            <p className="ctr-hint">{k("UPI ID: Settings → Shop.", "UPI ID: ಸೆಟ್ಟಿಂಗ್ಸ್ → ಶಾಪ್.")}</p>
          </div>
        </div>
      )}

      {rcpt && <ReceiptSheet doc={rcpt.doc} autoPrint={rcpt.auto} onClose={() => setRcpt(null)} />}
    </div>
  );
}
