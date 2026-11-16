"use client";

// Quick Register — the manager's one-screen, icon-first, bilingual counter
// cash book. Talks only to /api/register/* and the existing /api/job-work/*
// routes, so every entry lands in the same Postgres database as the rest of
// Second Brain Desk.

import EditEntry from "@/components/register/EditEntry";
import { verdict } from "@/lib/outbox";
import ShareButton from "@/components/share/ShareButton";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccess } from "@/components/AccessProvider";
import { kindToFn, MASK, type FnKey } from "@/lib/access";
import { DEFAULT_WIN, WIN_LABEL, hideWin, moveWin, normalizeWin, showWin, toggleMin, type WinState } from "@/lib/workspaceWin";
import { CAN_TYPES, STANDARD_RATE, defaultPaySplit, expectedSettlement, expectedSettlementWithRate, type CakeOwnership, type CanKey } from "@/lib/calculations";
import { DEFAULT_CONFIG, KIND_SIDE, UNITS, entryChannel, estimatePrice, estimateQty, fmtEstimateQty, splitInfo, dayTotals, freshCrushStats, freshCrushTotals, itemsFor, normalizeFreshCrush, rateKey, toClosingBuckets, toCsv, type LangMode, type RegisterConfigData, type RegisterKind } from "@/lib/register";
import { pairLabel, word, words, type WordKey } from "@/lib/registerI18n";
import { parseVoice } from "@/lib/voice";
import { PROOF_META, type ProofKind } from "@/lib/proofs";
import { getGeo, geoOn, preparePhoto, type Captured } from "@/lib/proofClient";
import { ScaleBtn } from "@/components/register/SmartParts";
import { REGISTER_FILL_KINDS, mapRegisterFill, type RegisterDraft } from "@/lib/registerSmart";
import { DESK_PROMPTS } from "@/lib/aiPrompts";
import MfgQuick from "@/components/mfg/MfgQuick";
import BillSheet from "@/components/register/BillSheet";
import CashSheetBoard, { type CashLine, type MoreCard } from "@/components/register/CashSheetBoard";
import { visibleLinks } from "@/lib/quickLinks";
import { useFeatures } from "@/lib/useFeatures";
import { useCustomize } from "@/lib/customize";
import { BrandMark, Icon, type IconName } from "@/components/ui/Icons";
import { BUILTIN_SIMPLE, assignedMode, type SimpleMode } from "@/lib/simpleMode";
import { G } from "@/components/register/Glyph";
import ReceiptSheet from "@/components/print/ReceiptSheet";
import { entryReceipt, receiptTime, type ReceiptDoc } from "@/lib/receipt";
import EntrySheet from "@/components/register/forms/EntrySheet";
import FreshCrushSheet from "@/components/register/forms/FreshCrushSheet";
import CountSheet from "@/components/register/forms/CountSheet";
import StockSheet from "@/components/register/forms/StockSheet";
import ScanSheet from "@/components/register/forms/ScanSheet";
import { EntryInit, Entry, JobWork, Tally, DayBundle, SheetModeCtx, KIND_ICON, rs, todayIST, offlineQueue, setQueue, api, kg, Txt, Chips, PickMenu, SheetFrame, PartyField } from "@/components/register/forms/shared";


type Sheet =
  | { t: "entry"; kind: RegisterKind; init?: EntryInit }
  | { t: "stock" }
  | { t: "jw"; id?: string }
  | { t: "fresh" }
  | { t: "mfg"; startNew?: boolean }
  | { t: "bill" }
  | { t: "jwpay"; id: string }
  | { t: "count" }
  | { t: "calc" }
  | { t: "estimate" }
  | { t: "report" }
  | { t: "scan" }
  | { t: "smart"; text?: string; auto?: boolean }
  | null;


// Per-device screen preferences (layout, favourite tiles, folded sections).
type TileKey =
  | "SALE"
  | "bill"
  | "FRESH_CRUSH"
  | "UDHAAR_IN"
  | "PURCHASE"
  | "EXPENSE"
  | "PAYMENT"
  | "jwNew"
  | "jwSettle"
  | "PIGMEE"
  | "OWNER_DRAW"
  | "count"
  | "stock"
  | "calc"
  | "estimate"
  | "reports"
  | "scan"
  | "smart"
  | "cashtally";

type SectionKey = "summary" | "entries" | "jobwork";

// What the always-open Workspace card shows.
type WorkTool = "calc" | "estimate" | "notepad" | "FRESH_CRUSH" | "SALE" | "EXPENSE" | "PURCHASE" | "jwNew" | "count" | "stock";

type LayoutMode = "auto" | "side" | "stack";

interface Prefs {
  layout: LayoutMode;
  favs: string[];
  closed: string[];
  work: WorkTool;
  leftW: number | null; // side-by-side: width of the buttons column (drag the divider)
  float: { on: boolean; x: number; y: number; w: number; h: number; op: number }; // floating workspace window
  size: TileSize; // button + text size in the designed looks (S / M / L)
  cols: "auto" | "1" | "2" | "3"; // side by side: how many columns the windows use on wide screens
  cashSheet: boolean; // Money in / out board with a total on each line and a More windows area
}

type TileSize = "s" | "m" | "l";

const DEFAULT_PREFS: Prefs = {
  layout: "auto",
  favs: [],
  closed: [],
  work: "calc",
  leftW: null,
  float: { on: false, x: 120, y: 120, w: 440, h: 560, op: 1 },
  size: "m",
  cols: "auto",
  cashSheet: false,
};

// The page is scaled by the Appearance "text size" (CSS zoom on <body>), so
// pointer positions must be divided by it to get layout pixels.
const pageZoom = () => (typeof document !== "undefined" ? parseFloat(getComputedStyle(document.body).zoom || "1") || 1 : 1);

const PREFS_KEY = "qr-prefs";


function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

const hm = (ts: string | number | Date) =>
  new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

let flushing = false;

/** Send what is waiting; returns how many went. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const q = offlineQueue();
      if (!q.length) break;
      const it = q[0];
      let res: Response;
      try {
        res = await fetch(it.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: it.body });
      } catch {
        break; // still offline
      }
      // Only a clear answer takes it out of the queue: saved, or refused because the entry itself
      // is wrong. A server problem or an expired login keeps it here for the next try
      // (it used to be dropped, losing the entry).
      const v = verdict(res.status);
      if (v === "wait") break;
      setQueue(offlineQueue().slice(1));
      if (v === "sent") sent++;
      else window.dispatchEvent(new CustomEvent("qr-queue-fail", { detail: (await res.json().catch(() => ({}))).error || `HTTP ${res.status}` }));
    }
  } finally {
    flushing = false;
  }
  return sent;
}


/** One-line summary of a fresh-crush entry for lists and slips. */
function freshCrushLine(details: unknown, lang: LangMode): string {
  const d = normalizeFreshCrush(details);
  if (!d) return "";
  const st = freshCrushStats(d);
  const parts = [
    `${word("fcSeedShort", lang)} ${kg(d.seedKg)} → ${word("fcOilShort", lang)} ${kg(d.oilKg)} (${st.yieldPct.toFixed(1)}%)`,
    d.extraKg > 0 ? `${kg(d.extraKg)} → ${d.extraTo || word("fcTankShort", lang)}` : "",
    d.cakeKg > 0 ? `${word("fcCakeShort", lang)} ${kg(d.cakeKg)}` : "",
    st.lossFlag ? "⚠️" : "",
  ];
  return parts.filter(Boolean).join(" · ");
}


// Notepad for the Workspace card — kept on this device only.
function Notepad({ lang }: { lang: LangMode }) {
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      setText(localStorage.getItem("qr-notepad") || "");
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <div>
      <textarea
        className="qr-txt qr-note"
        value={text}
        rows={8}
        onChange={(e) => {
          setText(e.target.value);
          try {
            localStorage.setItem("qr-notepad", e.target.value);
          } catch {
            /* ignore */
          }
        }}
        aria-label={word("notepad", lang)}
      />
      <div className="qr-hint">{word("wsNoteHint", lang)}</div>
    </div>
  );
}


function payLabel(e: { paymentMode: string; details?: unknown }, lang: LangMode): string {
  const c = entryChannel(e);
  const sp = splitInfo(e.details);
  return word(c as WordKey, lang) + (sp && sp.n > 1 ? ` ${sp.i}/${sp.n}` : "");
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function QuickRegister({ pos: startPos = false }: { pos?: boolean } = {}) {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  // Designed looks (any glass skin) swap emoji for line icons and add the counter hero card.
  const { prefs: uiPrefs } = useCustomize();
  const skinned = uiPrefs.look.skin !== "none";
  const pillIc = (e: string, name: IconName) => (skinned ? <Icon name={name} size={18} /> : e);
  // POS counter mode: one big entry window + today's list, nothing else on screen.
  // /register/pos opens straight into it; the POS button switches in place.
  const [posMode, setPosMode] = useState(startPos);
  // Simple mode (🧸): a few big buttons chosen by the owner. null = not decided yet (waits for the day to load).
  const [simpleOn, setSimpleOn] = useState<boolean | null>(null);
  const [posKind, setPosKind] = useState<"SALE" | "FRESH_CRUSH" | "UDHAAR_IN" | "PURCHASE" | "EXPENSE" | "PAYMENT">("SALE");
  const [posKey, setPosKey] = useState(0);

  const [date, setDate] = useState(todayIST);
  // /register?date=YYYY-MM-DD (e.g. "Open / edit" from the Purchase desk) opens that day
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayIST()) setDate(d);
  }, []);
  const [day, setDay] = useState<DayBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const acc = useAccess();
  const toastRef = useRef<((m: string) => void) | null>(null);
  const [sheet, setSheetRaw] = useState<Sheet>(null);
  // A profile can switch functions off: refuse them here too (the server refuses them as well).
  const sheetFn = (v: NonNullable<Sheet>): FnKey | null =>
    v.t === "entry" ? kindToFn(v.kind) : v.t === "fresh" || v.t === "bill" ? "sale" : v.t === "jw" || v.t === "jwpay" ? "jobwork" : v.t === "count" ? "count" : v.t === "stock" ? "stock" : v.t === "report" ? "reports" : null;
  const setSheet = (v: Sheet) => {
    const need = v ? sheetFn(v) : null;
    if (need && !acc.fn(need)) {
      toastRef.current?.("Not in your profile");
      return;
    }
    setSheetRaw(v);
  };
  const [editFavs, setEditFavs] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [hasLocalPrefs, setHasLocalPrefs] = useState(true);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (raw && typeof raw === "object") setPrefsState({ ...DEFAULT_PREFS, ...raw, float: { ...DEFAULT_PREFS.float, ...(raw.float || {}) } });
      else {
        setHasLocalPrefs(false);
        setPrefsState({ ...DEFAULT_PREFS, favs: ["SALE", "EXPENSE", "jwNew"] });
      }
    } catch {
      /* storage blocked — keep defaults */
    }
  }, []);
  const setPrefs = useCallback((fn: (p: Prefs) => Prefs) => {
    setHasLocalPrefs(true);
    setPrefsState((p) => {
      const next = fn(p);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  // Side by side needs a tablet/laptop-width screen; phones always stack.
  const canSide = useMedia("(min-width: 760px)");
  const wide = useMedia("(min-width: 1100px)");
  const sideBySide = simpleOn !== true && canSide && (prefs.layout === "side" || (prefs.layout === "auto" && wide));
  const splitRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  // Right-hand windows (entry form, workspace, job-work, entries): hide / fold / move, saved for this login on this device.
  const winKey = `qr-win-v1:${String((session?.user as { username?: string } | undefined)?.username || "me")}`;
  const [wins, setWinsState] = useState<WinState>(DEFAULT_WIN);
  useEffect(() => {
    try {
      setWinsState(normalizeWin(JSON.parse(localStorage.getItem(winKey) || "null")));
    } catch { /* storage blocked: keep the default arrangement */ }
  }, [winKey]);
  const setWins = (fn: (w: WinState) => WinState) =>
    setWinsState((w) => {
      const next = fn(w);
      try { localStorage.setItem(winKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  // Tapping a tile on the left opens its form on the right and brings that panel into view,
  // wherever the page is scrolled. The form window is shown again if it was hidden or folded.
  useEffect(() => {
    if (!sheet || !sideBySide) return;
    if (wins.hid.includes("form") || wins.min.includes("form")) setWins((w) => showWin(w, "form"));
    const t = window.setTimeout(() => {
      const el = rightRef.current;
      if (!el) return;
      el.scrollTop = 0;
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sideBySide]);
  const floatRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Drag the divider between the buttons column and the forms / tables.
  const startSplit = (e: React.PointerEvent) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    setDragging(true);
    const z = pageZoom();
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.max(300, Math.min(900, (ev.clientX - box.left) / z, box.width / z - 380)));
      setPrefsState((p) => ({ ...p, leftW: w }));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPrefs((p) => p);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // A device that was never set up starts from the shop-wide defaults
  // chosen in Settings (layout, favourites, workspace tool).
  useEffect(() => {
    if (hasLocalPrefs || !day) return;
    const c = day.config;
    const work = (["calc", "estimate", "notepad", "FRESH_CRUSH", "SALE", "EXPENSE", "PURCHASE", "jwNew", "count", "stock"] as const).find((w) => w === c.defaultWork);
    setPrefsState((p) => ({ ...p, layout: c.defaultLayout, favs: c.defaultFavs, work: work || "calc" }));
  }, [hasLocalPrefs, day]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [rcpt, setRcpt] = useState<ReceiptDoc | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    const upd = () => setWaiting(offlineQueue().length);
    upd();
    const onQ = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      setWaiting(n);
    };
    const onFail = (e: Event) => toast(`An entry kept offline was refused: ${(e as CustomEvent<string>).detail}`);
    const goOnline = () => void flushQueue().then((n) => { if (n) { toast(`${n} entr${n === 1 ? "y" : "ies"} sent ✓`); load(); } });
    window.addEventListener("qr-queue", onQ);
    window.addEventListener("qr-queue-fail", onFail);
    window.addEventListener("online", goOnline);
    const t = window.setInterval(() => { if (offlineQueue().length) goOnline(); }, 30000);
    goOnline();
    return () => { window.removeEventListener("qr-queue", onQ); window.removeEventListener("qr-queue-fail", onFail); window.removeEventListener("online", goOnline); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lang, setLangState] = useState<LangMode>("both");
  const [now, setNow] = useState(Date.now());

  // Saved tick + ripple, shown for a moment after every save.
  const [tick, setTick] = useState(0);
  const celebrate = useCallback(() => {
    setTick((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(0), 1300);
    return () => clearTimeout(t);
  }, [tick]);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(null), 1800);
  }, []);
  toastRef.current = toast;

  const load = useCallback(async () => {
    try {
      const r = await api<{ data: DayBundle }>(`/api/register?date=${date}`);
      setDay(r.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "error");
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Language: per device (localStorage), defaulting to the shop-wide setting.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qr-lang") as LangMode | null;
      if (saved === "en" || saved === "kn" || saved === "both") setLangState(saved);
      else if (day?.config.defaultLangMode) setLangState(day.config.defaultLangMode);
    } catch {
      /* storage blocked — keep default */
    }
  }, [day?.config.defaultLangMode]);
  const setLang = (m: LangMode) => {
    setLangState(m);
    try {
      localStorage.setItem("qr-lang", m);
    } catch {
      /* ignore */
    }
  };

  // ---- Simple mode (🧸): the owner's chosen big buttons for this person ----
  const username = String((session?.user as { username?: string } | undefined)?.username || "");
  const myMode = assignedMode(username, day?.config.simpleModes || [], day?.config.simpleAssign || {});
  const simple: SimpleMode = myMode || BUILTIN_SIMPLE;
  const simpleKey = `qr-simple-v1:${username || "me"}`;
  useEffect(() => {
    if (simpleOn !== null || !day || !session) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(simpleKey);
    } catch {
      /* storage blocked */
    }
    setSimpleOn(saved === "on" ? true : saved === "off" ? false : !!myMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, session, simpleOn]);
  const prevLang = useRef<LangMode | null>(null);
  useEffect(() => {
    if (simpleOn === true) {
      if (prevLang.current === null) prevLang.current = lang;
      setLangState(simple.lang);
    } else if (simpleOn === false && prevLang.current !== null) {
      setLangState(prevLang.current);
      prevLang.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simpleOn, simple.lang]);
  const toggleSimple = () => {
    const next = simpleOn !== true;
    setSimpleOn(next);
    if (next) setPosMode(false);
    try {
      localStorage.setItem(simpleKey, next ? "on" : "off");
    } catch {
      /* storage blocked */
    }
  };

  // Clock + roll over to the new business day at midnight.
  // after midnight, move on to the new day — but only if you were on "today" (not a past day you opened)
  const lastToday = useRef(todayIST());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const t = todayIST();
      const was = lastToday.current;
      lastToday.current = t;
      if (t !== was && !sheet) setDate((d) => (d === was ? t : d));
    }, 30000);
    return () => window.clearInterval(id);
  }, [sheet]);

  const dbOffline = !!loadError && /database|DATABASE_URL/i.test(loadError);
  const entries = useMemo(() => day?.entries || [], [day]);
  const totals = useMemo(() => dayTotals(entries, day?.jwEvents || []), [entries, day]);
  const counterNow = day?.systemCashNow ?? 0;
  // Cash balance and totals can be hidden by the profile.
  const rsT = (n: number | null | undefined) => (acc.hidden("totals") ? MASK : rs(n));

  const ins = entries.filter((e) => KIND_SIDE[e.kind] === "in");
  const outs = entries.filter((e) => KIND_SIDE[e.kind] === "out");
  const oths = entries.filter((e) => KIND_SIDE[e.kind] === "oth");
  const sum = (a: Entry[]) => a.reduce((s, e) => s + e.amountInr, 0);

  async function remove(e: Entry) {
    if (!window.confirm(word("deleteQ", lang))) return;
    try {
      await api(`/api/register/${e.id}`, { method: "DELETE" });
      toast(word("deleted", lang));
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : word("error", lang));
    }
  }

  const itemText = (e: Entry) => {
    if (e.totalSale) return (skinned ? "" : "🧾 ") + word("totalSale", lang);
    if (!e.item) return "";
    const it = day ? itemsFor(e.kind, day.config).find((i) => i.key === e.item) : null;
    if (it) return skinned ? (lang === "kn" ? it.kn : it.en) : `${it.icon} ${lang === "kn" ? it.kn : it.en}`;
    return e.itemLabel || e.item;
  };
  const unitText = (u: string | null) => {
    const f = UNITS.find((x) => x.key === (u || "kg"));
    return f ? (lang === "kn" ? f.kn : f.en) : u || "";
  };

  const EntryCard = (e: Entry) => {
    const bits = [
      itemText(e),
      e.qty ? `${e.qty} ${unitText(e.unit)}` : "",
      e.partyName || "",
      e.notes || "",
      e.drawKind ? word(e.drawKind === "full" ? "full" : "partial", lang) : "",
      e.kind === "FRESH_CRUSH" ? freshCrushLine(e.details, lang) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const printable = e.kind === "SALE" || e.kind === "UDHAAR_IN" || e.kind === "FRESH_CRUSH" || e.kind === "PAYMENT" || e.kind === "PURCHASE" || e.kind === "EXPENSE";
    const card = (
      <button
        className={`qr-ent ${KIND_SIDE[e.kind]}${e.paymentMode === "CREDIT" ? " udhaar" : KIND_SIDE[e.kind] === "in" ? " paid" : ""}`}
        onClick={() => setEditing(e)}
        title="Tap to edit or delete"
      >
        <G e={KIND_ICON[e.kind]} /> <span className="m">{hm(e.createdAt)}</span>
        {(day?.proofs?.[e.id] || []).length > 0 && (
          <span className="qr-badge" title={word("proofTitle", lang)}>
            {Array.from(new Set(day?.proofs?.[e.id] || [])).map((k) => PROOF_META[k as ProofKind]?.icon || "📎").join("")}
          </span>
        )}
        <br />
        {word(e.kind as WordKey, lang)}
        {bits ? " — " + bits : ""}
        <span className="a">
          {rs(e.amountInr)}
          {(e.paymentMode !== "CASH" || splitInfo(e.details)) && KIND_SIDE[e.kind] !== "oth" && (
            <span className="m"> ({payLabel(e, lang)})</span>
          )}
        </span>
      </button>
    );
    if (!printable) return <Fragment key={e.id}>{card}</Fragment>;
    return (
      <div key={e.id} className="qr-entw">
        {card}
        <button
          type="button"
          className="qr-entp"
          title="Print a receipt for this entry"
          aria-label="Print a receipt for this entry"
          onClick={() =>
            setRcpt(
              entryReceipt({
                title: e.kind === "UDHAAR_IN" ? "PAYMENT RECEIVED" : e.kind === "SALE" || e.kind === "FRESH_CRUSH" ? "RECEIPT" : "PAYMENT VOUCHER",
                id: e.id,
                when: receiptTime(e.createdAt),
                party: e.partyName,
                what: [word(e.kind as WordKey, "en"), itemText(e)].filter(Boolean).join(" · "),
                detail: [e.qty ? `${e.qty} ${unitText(e.unit)}` : "", e.rateInr ? `@ ₹${e.rateInr}` : ""].filter(Boolean).join(" ") || undefined,
                amountInr: e.amountInr,
                mode: payLabel(e, "en"),
                notes: e.notes,
              })
            )
          }
        >
          🖨️
        </button>
      </div>
    );
  };

  const tallyText = (t: Tally | null) => {
    if (!t) return <b className="qr-m">{word("notDone", lang)}</b>;
    // DailyClosing stores diff = system - counter (positive = counter is short)
    const d = t.cashDiffInr;
    if (Math.abs(d) < 1) return <b className="qr-g">✓ {word("matched", lang)}</b>;
    return (
      <b className={d > 0 ? "qr-r" : "qr-o"}>
        {d > 0 ? `⚠️ ${word("short", lang)} ${rs(d)}` : `${word("extra", lang)} ${rs(-d)}`}
        {t.cashMismatch && <span className="qr-sub">{word("overLimit", lang)}</span>}
      </b>
    );
  };

  // ---------------------------------------------------------------------
  // Tiles: one registry so the board, the favourites strip and edit-mode
  // all use the same definitions.
  // ---------------------------------------------------------------------
  const scrollToLedger = () => {
    const el = document.getElementById("qr-jw-ledger");
    if (el) {
      setPrefs((p) => ({ ...p, closed: p.closed.filter((c) => c !== "jobwork") }));
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const TILES: Record<TileKey, { k: WordKey; icon: string; group: "in" | "out" | "jw" | "oth" | "tool"; open: () => void; needsDb?: boolean }> = {
    SALE: { k: "SALE", icon: "💰", group: "in", open: () => setSheet({ t: "entry", kind: "SALE" }), needsDb: true },
    bill: { k: "bill", icon: "📃", group: "in", open: () => setSheet({ t: "bill" }), needsDb: true },
    FRESH_CRUSH: { k: "FRESH_CRUSH", icon: "🫗", group: "in", open: () => setSheet({ t: "fresh" }), needsDb: true },
    UDHAAR_IN: { k: "UDHAAR_IN", icon: "🙌", group: "in", open: () => setSheet({ t: "entry", kind: "UDHAAR_IN" }), needsDb: true },
    PURCHASE: { k: "PURCHASE", icon: "🛒", group: "out", open: () => setSheet({ t: "entry", kind: "PURCHASE" }), needsDb: true },
    EXPENSE: { k: "EXPENSE", icon: "🧾", group: "out", open: () => setSheet({ t: "entry", kind: "EXPENSE" }), needsDb: true },
    PAYMENT: { k: "PAYMENT", icon: "🤝", group: "out", open: () => setSheet({ t: "entry", kind: "PAYMENT" }), needsDb: true },
    jwNew: { k: "jwNew", icon: "🌾", group: "jw", open: () => setSheet({ t: "jw" }), needsDb: true },
    jwSettle: { k: "jwSettle", icon: "💳", group: "jw", open: scrollToLedger },
    PIGMEE: { k: "PIGMEE", icon: "🏦", group: "oth", open: () => setSheet({ t: "entry", kind: "PIGMEE" }), needsDb: true },
    OWNER_DRAW: { k: "OWNER_DRAW", icon: "🧔", group: "oth", open: () => setSheet({ t: "entry", kind: "OWNER_DRAW" }), needsDb: true },
    count: { k: "count", icon: "💵", group: "tool", open: () => setSheet({ t: "count" }), needsDb: true },
    stock: { k: "stockTally", icon: "📦", group: "tool", open: () => setSheet({ t: "stock" }), needsDb: true },
    calc: { k: "calc", icon: "🧮", group: "tool", open: () => setSheet({ t: "calc" }) },
    estimate: { k: "estimate", icon: "🏷️", group: "tool", open: () => setSheet({ t: "estimate" }) },
    reports: { k: "reports", icon: "🖨️", group: "tool", open: () => setSheet({ t: "report" }) },
    cashtally: { k: "cashTally", icon: "🧮", group: "tool", open: () => { window.location.href = "/cash"; } },
    scan: { k: "scan", icon: "📸", group: "tool", open: () => setSheet({ t: "scan" }), needsDb: true },
    smart: { k: "smart", icon: "✨", group: "tool", open: () => setSheet({ t: "smart" }), needsDb: true },
  };

  // Quick links (/go) and home-screen shortcuts arrive as /register?open=sale etc.
  // Open that form once the day has loaded, then tidy the address.
  const deepRef = useRef(false);
  const openByKey: Record<string, () => void> = {
    sale: () => setSheet({ t: "entry", kind: "SALE" }),
    crush: () => setSheet({ t: "fresh" }),
    udhaar: () => setSheet({ t: "entry", kind: "UDHAAR_IN" }),
    purchase: () => setSheet({ t: "entry", kind: "PURCHASE" }),
    expense: () => setSheet({ t: "entry", kind: "EXPENSE" }),
    payment: () => setSheet({ t: "entry", kind: "PAYMENT" }),
    pigmee: () => setSheet({ t: "entry", kind: "PIGMEE" }),
    draw: () => setSheet({ t: "entry", kind: "OWNER_DRAW" }),
    jobwork: () => setSheet({ t: "jw" }),
    jwsettle: () => setTimeout(scrollToLedger, 400),
    cash: () => setSheet({ t: "count" }),
    stock: () => setSheet({ t: "stock" }),
    calc: () => setSheet({ t: "calc" }),
    estimate: () => setSheet({ t: "estimate" }),
    scan: () => setSheet({ t: "scan" }),
    smart: () => setSheet({ t: "smart" }),
  };

  useEffect(() => {
    if (deepRef.current || !day) return;
    deepRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const key = sp.get("open");
    // from the chat bot: ?say=<what was said> fills the right form; ?edit=last opens the last entry to fix
    const say = sp.get("say");
    const edit = sp.get("edit");
    // from the home-screen "Speak entry" button: ?voice=1 starts listening straight away
    if (sp.get("voice") === "1" && !dbOffline) {
      window.history.replaceState(null, "", window.location.pathname);
      setTimeout(() => startVoice(), 400);
      return;
    }
    if (say && !dbOffline) {
      window.history.replaceState(null, "", window.location.pathname);
      setTimeout(() => runVoice(say), 50);
      return;
    }
    if (edit === "last") {
      window.history.replaceState(null, "", window.location.pathname);
      const all = [...(day.entries || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const mine = all.find((x) => !x.createdByName || x.createdByName === session?.user?.name) || all[0];
      if (mine) setEditing(mine);
      else toast("No entries today yet");
      return;
    }
    if (!key) return;
    const by = openByKey;
    const go = by[key];
    if (go && !dbOffline) go();
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const toggleFav = (key: TileKey) =>
    setPrefs((p) => ({
      ...p,
      favs: p.favs.includes(key) ? p.favs.filter((f) => f !== key) : [...p.favs, key],
    }));

  const TILE_FN: Partial<Record<TileKey, FnKey>> = {
    SALE: "sale", bill: "sale", FRESH_CRUSH: "sale", UDHAAR_IN: "udhaar", PURCHASE: "purchase", EXPENSE: "expense", PAYMENT: "payment",
    jwNew: "jobwork", jwSettle: "jobwork", PIGMEE: "pigmee", OWNER_DRAW: "draw", count: "count", stock: "stock", reports: "reports", cashtally: "count",
  };
  const Tile = ({ id, extraClass = "" }: { id: TileKey; extraClass?: string }) => {
    const need = TILE_FN[id];
    if (need && !acc.fn(need)) return null;
    const t = TILES[id];
    const w = words(t.k, lang);
    const isFav = prefs.favs.includes(id);
    return (
      <button
        className={`qr-tile g-${t.group} ${extraClass}`}
        onClick={() => (editFavs ? toggleFav(id) : t.open())}
        disabled={!editFavs && t.needsDb && dbOffline}
        aria-pressed={editFavs ? isFav : undefined}
      >
        {editFavs && (
          <span className={`qr-star${isFav ? " on" : ""}`} aria-hidden>
            {isFav ? "★" : "☆"}
          </span>
        )}
        <span className="ic" aria-hidden>
          <G e={t.icon} />
        </span>
        <span className="p">{w.main}</span>
        {w.sub && <span className="s">{w.sub}</span>}
      </button>
    );
  };

  // Collapsible section; whatever is left open stays open on this device.
  const Section = ({
    id,
    title,
    right,
    children,
    anchor,
  }: {
    id: SectionKey;
    title: React.ReactNode;
    right?: React.ReactNode;
    children: React.ReactNode;
    anchor?: string;
  }) => {
    const open = !prefs.closed.includes(id);
    return (
      <div className="qr-card qr-sec" id={anchor}>
        <button
          className="qr-sec-head"
          aria-expanded={open}
          onClick={() =>
            setPrefs((p) => ({
              ...p,
              closed: open ? [...p.closed, id] : p.closed.filter((c) => c !== id),
            }))
          }
        >
          <span className="t">{title}</span>
          <span className="r">
            {right}
            <span className="chev" aria-hidden>
              {open ? "▾" : "▸"}
            </span>
          </span>
        </button>
        {open && <div className="qr-sec-body">{children}</div>}
      </div>
    );
  };

  const unsettled = (day?.jobWork || []).filter((j) => !j.settled);
  // open (unfinished) barrels, for the Manufacturing block; blank if it can't be read
  const [openBarrels, setOpenBarrels] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/manufacturing")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j || !Array.isArray(j.data)) return;
        setOpenBarrels(j.data.filter((b: { step4Kg: number | null }) => b.step4Kg == null).length);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const nextLang: Record<LangMode, LangMode> = { both: "en", en: "kn", kn: "both" };
  const langLabel: Record<LangMode, string> = { both: "EN+ಕ", en: "EN", kn: "ಕನ್ನಡ" };
  const nextLayout: Record<LayoutMode, LayoutMode> = { auto: "side", side: "stack", stack: "auto" };
  const layoutLabel: Record<LayoutMode, string> = { auto: "⇆ Auto", side: "⇆ Side", stack: "☰ One" };
  const favKeys = prefs.favs.filter((f): f is TileKey => f in TILES);

  // ---------------------------------------------------------------------
  // Cash sheet board: one line per money bucket with today's total. Every
  // line opens the app's own form; nothing is saved by the board itself.
  // ---------------------------------------------------------------------
  const feats = useFeatures().state;
  const cashBuckets = day ? toClosingBuckets(day.opening.value, day.entries, day.jwEvents) : null;
  const gate = (id: TileKey) => {
    const need = TILE_FN[id];
    return !need || acc.fn(need);
  };
  const cashLines: CashLine[] = cashBuckets
    ? ([
        { key: "open", icon: "🌅", k: "opening", side: "in", amount: cashBuckets.cashInOpening, locked: true },
        { key: "sale", icon: "💰", k: "SALE", side: "in", amount: cashBuckets.cashInSales, open: TILES.SALE.open, fn: "SALE",
          extras: [{ k: "FRESH_CRUSH", icon: "🫗", open: TILES.FRESH_CRUSH.open, fn: "FRESH_CRUSH" }, { k: "bill", icon: "📃", open: TILES.bill.open, fn: "bill" }] },
        { key: "udh", icon: "🙌", k: "UDHAAR_IN", side: "in", amount: cashBuckets.cashInOther, open: TILES.UDHAAR_IN.open, fn: "UDHAAR_IN" },
        { key: "jw", icon: "🌾", k: "jwSettle", side: "out", amount: cashBuckets.cashOutGrn, open: scrollToLedger, fn: "jwSettle",
          extras: [{ k: "jwNew", icon: "🌾", open: TILES.jwNew.open, fn: "jwNew" }] },
        { key: "pur", icon: "🛒", k: "PURCHASE", side: "out", amount: cashBuckets.cashOutOther, open: TILES.PURCHASE.open, fn: "PURCHASE" },
        { key: "exp", icon: "🧾", k: "EXPENSE", side: "out", amount: cashBuckets.cashOutExpenses, open: TILES.EXPENSE.open, fn: "EXPENSE" },
        { key: "sal", icon: "🤝", k: "PAYMENT", side: "out", amount: cashBuckets.cashOutSalary, open: TILES.PAYMENT.open, fn: "PAYMENT" },
        { key: "own", icon: "🧔", k: "OWNER_DRAW", side: "out", amount: cashBuckets.cashOutDraw, open: TILES.OWNER_DRAW.open, fn: "OWNER_DRAW",
          extras: [{ k: "PIGMEE", icon: "🏦", open: TILES.PIGMEE.open, fn: "PIGMEE" }] },
      ] as (Omit<CashLine, "extras"> & { fn?: TileKey; extras?: (NonNullable<CashLine["extras"]>[number] & { fn?: TileKey })[] })[])
        .filter((l) => !l.fn || gate(l.fn))
        .map((l) => ({ ...l, extras: l.extras?.filter((x) => !x.fn || gate(x.fn)) }))
    : [];
  const cashIn = cashBuckets ? cashBuckets.cashInOpening + cashBuckets.cashInSales + cashBuckets.cashInOther : 0;
  const cashOut = cashBuckets ? cashBuckets.cashOutGrn + cashBuckets.cashOutExpenses + cashBuckets.cashOutSalary + cashBuckets.cashOutDraw + cashBuckets.cashOutOther + cashBuckets.cashOutUpi : 0;
  const moreCards: MoreCard[] = [
    ...(["calc", "estimate", "count", "stock", "scan", "smart", "reports"] as TileKey[])
      .filter(gate)
      .map((id) => ({ id: `w-${id}`, group: "Workings" as const, icon: TILES[id].icon, title: words(TILES[id].k, lang).main, open: TILES[id].open })),
    { id: "r-mfg", group: "Register" as const, icon: "🏭", title: "Manufacturing", sub: "New barrel", open: () => setSheet({ t: "mfg", startNew: true }) },
    ...visibleLinks(isOwner, feats)
      .filter((l) => l.id !== "register")
      .map((l) => {
        const m = l.href.match(/^\/register\?open=([a-z]+)/);
        const direct = m ? openByKey[m[1]] : undefined;
        return {
          id: `q-${l.id}`,
          group: "Quick links" as const,
          icon: l.icon,
          title: l.title,
          sub: l.desc,
          open: direct ? () => direct() : () => window.location.assign(l.href),
        };
      }),
  ];
  const cashBoard = (
    <CashSheetBoard
      lang={lang}
      lines={cashLines}
      drawer={cashIn - cashOut}
      inTotal={cashIn}
      outTotal={cashOut}
      cards={moreCards}
      onCount={TILES.count.open}
      offline={dbOffline}
    />
  );

  // ----------------------------- blocks --------------------------------
  const heroBlock = skinned ? (
    <div className="qr-hero">
      <div className="qr-hero-l">
        <Txt k="inCounter" lang={lang} />
      </div>
      <div className="qr-hero-v">{rsT(counterNow)}</div>
      <div className="qr-hero-chips">
        <span className="in">
          <small>↓ IN · ಬರುವುದು</small>
          <b>{rsT(totals.cashIn)}</b>
        </span>
        <span className="out">
          <small>↑ OUT · ಹೋದದ್ದು</small>
          <b>{rsT(totals.cashOut)}</b>
        </span>
        <span className="upi">
          <small>UPI</small>
          <b>{rsT(totals.upiIn)}</b>
        </span>
      </div>
      <svg className="qr-hero-art" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden>
        <path d="M0 90 L60 40 L110 66 L190 12 L260 60 L320 30 L400 58 L400 90 Z" />
      </svg>
    </div>
  ) : null;

  const favouritesBlock =
    favKeys.length > 0 || editFavs ? (
      <div className="qr-favs-wrap">
        <div className="qr-head qr-favs-head">
          <span>
            <G e="⭐" /> <Txt k="favourites" lang={lang} />
          </span>
          {editFavs && (
            <button className="qr-pill" onClick={() => setEditFavs(false)}>
              ✓ {word("done", lang)}
            </button>
          )}
        </div>
        {editFavs && <div className="qr-hint" style={{ margin: "0 4px 8px" }}>{word("favHint", lang)}</div>}
        {favKeys.length > 0 ? (
          <div className="qr-favs">
            {favKeys.map((id) => (
              <Tile key={id} id={id} />
            ))}
          </div>
        ) : (
          <div className="qr-empty">{word("none", lang)}</div>
        )}
      </div>
    ) : null;

  const boardBlock = (
    <>
      <div className="qr-board">
        <div className="qr-col in">
          <div className="qr-head">
            <span>
              <Txt k="moneyIn" lang={lang} />
            </span>
            <span aria-hidden><G e="⬇" /></span>
          </div>
          <Tile id="SALE" />
          <Tile id="bill" />
          <Tile id="FRESH_CRUSH" />
          <Tile id="UDHAAR_IN" />
        </div>
        <div className="qr-col out">
          <div className="qr-head">
            <span>
              <Txt k="moneyOut" lang={lang} />
            </span>
            <span aria-hidden><G e="⬆" /></span>
          </div>
          <Tile id="PURCHASE" />
          <Tile id="EXPENSE" />
          <Tile id="PAYMENT" />
        </div>
      </div>

      <div className="qr-strip jw">
        <div className="qr-head">
          <span>
            <G e="⚙️" /> <Txt k="jobWork" lang={lang} />
          </span>
          <span className="qr-m" style={{ fontSize: 13 }}>
            {unsettled.length} {word("unsettled", lang)}
          </span>
        </div>
        <div className="qr-row2">
          <Tile id="jwNew" />
          <Tile id="jwSettle" />
        </div>
      </div>

      {acc.page("mfg") && (
      <div className="qr-strip jw">
        <div className="qr-head">
          <span>
            <G e="🏭" /> <Txt k="mfgDesk" lang={lang} />
          </span>
          <span className="qr-m" style={{ fontSize: 13 }}>
            {openBarrels === null ? "" : `${openBarrels} ${word("openBarrels", lang)}`}
          </span>
        </div>
        <div className="qr-row2">
          <button type="button" className="qr-tile g-tool" onClick={() => setSheet({ t: "mfg", startNew: true })}>
            <span className="ic" aria-hidden><G e="➕" /></span>
            <span className="p">{words("newBarrel", lang).main}</span>
            {words("newBarrel", lang).sub && <span className="s">{words("newBarrel", lang).sub}</span>}
          </button>
          <button type="button" className="qr-tile g-tool" onClick={() => setSheet({ t: "mfg" })}>
            <span className="ic" aria-hidden><G e="🛢️" /></span>
            <span className="p">{words("barrelSteps", lang).main}</span>
            {words("barrelSteps", lang).sub && <span className="s">{words("barrelSteps", lang).sub}</span>}
          </button>
        </div>
      </div>
      )}

      <div className="qr-strip oth">
        <div className="qr-head">
          <span>
            <Txt k="otherCash" lang={lang} />
          </span>
          <span style={{ fontSize: 12 }}>
            <Txt k="notExpense" lang={lang} />
          </span>
        </div>
        <div className="qr-row2">
          <Tile id="PIGMEE" />
          <Tile id="OWNER_DRAW" />
        </div>
      </div>

      <div className="qr-tools">
        <Tile id="count" />
        <Tile id="stock" />
        <Tile id="scan" />
        <Tile id="smart" />
        <Tile id="estimate" />
        <Tile id="calc" />
        <Tile id="reports" />
      </div>
      <div className="qr-tools">
        {acc.page("mfg") && <a className="qr-tile g-tool" href="/mfg">
          <span className="ic" aria-hidden><G e="🏭" /></span>
          <span className="p">{words("mfgDesk", lang).main}</span>
          {words("mfgDesk", lang).sub && <span className="s">{words("mfgDesk", lang).sub}</span>}
        </a>}
        {(acc.page("stock") || acc.fn("count")) && <a className="qr-tile g-tool" href="/tallies">
          <span className="ic" aria-hidden><G e="🧮" /></span>
          <span className="p">{words("allTallies", lang).main}</span>
          {words("allTallies", lang).sub && <span className="s">{words("allTallies", lang).sub}</span>}
        </a>}
        <a className="qr-tile g-tool" href="/go">
          <span className="ic" aria-hidden><G e="🔗" /></span>
          <span className="p">{words("quickLinks", lang).main}</span>
          {words("quickLinks", lang).sub && <span className="s">{words("quickLinks", lang).sub}</span>}
        </a>
      </div>
    </>
  );

  // Designed looks: every action in one tidy grid of same-size buttons, grouped
  // by meaning with a small coloured label (no boxed columns).
  const toolLink = (href: string, e: string, k: WordKey) => (href === "/mfg" && !acc.page("mfg")) || (href === "/tallies" && !acc.page("stock") && !acc.fn("count")) ? null : (
    <a className="qr-tile g-tool" href={href}>
      <span className="ic" aria-hidden>
        <G e={e} />
      </span>
      <span className="p">{words(k, lang).main}</span>
      {words(k, lang).sub && <span className="s">{words(k, lang).sub}</span>}
    </a>
  );
  const qaHead = (tone: string, k: WordKey, meta?: React.ReactNode) => (
    <div className={`qa-h t-${tone}`}>
      {tone === "in" || tone === "out" ? (
        <span className="mark" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d={tone === "in" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6"} />
          </svg>
        </span>
      ) : (
        <span className="dot" aria-hidden />
      )}
      <span className="t">
        <Txt k={k} lang={lang} />
      </span>
      {meta !== undefined && meta !== null && <span className="m">{meta}</span>}
    </div>
  );
  const designBoard = (
    <div className="qa">
      <section className="qa-sec">
        {qaHead("in", "moneyIn", rsT(totals.cashIn + totals.upiIn))}
        <div className="qa-grid">
          <Tile id="SALE" />
          <Tile id="bill" />
          <Tile id="FRESH_CRUSH" />
          <Tile id="UDHAAR_IN" />
        </div>
      </section>
      <section className="qa-sec">
        {qaHead("out", "moneyOut", rsT(totals.cashOut + totals.upiOut))}
        <div className="qa-grid">
          <Tile id="PURCHASE" />
          <Tile id="EXPENSE" />
          <Tile id="PAYMENT" />
        </div>
      </section>
      <div className="qa-pair">
        <section className="qa-sec">
          {qaHead("jw", "jobWork", `${unsettled.length} ${word("unsettled", lang).toLowerCase()}`)}
          <div className="qa-grid">
            <Tile id="jwNew" />
            <Tile id="jwSettle" />
          </div>
        </section>
        {acc.page("mfg") && <section className="qa-sec">
          {qaHead("mfg", "mfgDesk", openBarrels === null ? null : `${openBarrels} ${word("openBarrelsShort", lang)}`)}
          <div className="qa-grid">
            <button type="button" className="qr-tile g-mfg" onClick={() => setSheet({ t: "mfg", startNew: true })}>
              <span className="ic" aria-hidden>
                <G e="➕" />
              </span>
              <span className="p">{words("newBarrel", lang).main}</span>
              {words("newBarrel", lang).sub && <span className="s">{words("newBarrel", lang).sub}</span>}
            </button>
            <button type="button" className="qr-tile g-mfg" onClick={() => setSheet({ t: "mfg" })}>
              <span className="ic" aria-hidden>
                <G e="🛢️" />
              </span>
              <span className="p">{words("barrelSteps", lang).main}</span>
              {words("barrelSteps", lang).sub && <span className="s">{words("barrelSteps", lang).sub}</span>}
            </button>
          </div>
        </section>}
      </div>
      <section className="qa-sec">
        {qaHead("oth", "otherCash", word("notExpense", lang))}
        <div className="qa-grid">
          <Tile id="PIGMEE" />
          <Tile id="OWNER_DRAW" />
        </div>
      </section>
      <section className="qa-sec">
        {qaHead("tool", "tools")}
        <div className="qa-grid tools">
          <Tile id="count" />
          <Tile id="cashtally" />
          <Tile id="stock" />
          <Tile id="scan" />
          <Tile id="smart" />
          <Tile id="estimate" />
          <Tile id="calc" />
          <Tile id="reports" />
          {toolLink("/mfg", "🏭", "mfgDesk")}
          {toolLink("/tallies", "🧮", "allTallies")}
          {toolLink("/go", "🔗", "quickLinks")}
          {toolLink("/print", "🖨️", "printCentre")}
        </div>
      </section>
    </div>
  );

  const summaryBlockRaw = (
    <Section id="summary" title={<Txt k="summary" lang={lang} />} right={<b>{rsT(counterNow)}</b>}>
      <div className="qr-srow">
        <span>
          <Txt k="opening" lang={lang} />
        </span>
        <b>{rsT(day?.opening.value)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="cashIn" lang={lang} />
        </span>
        <b className="qr-g">+ {rsT(totals.cashIn)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="cashOut" lang={lang} />
        </span>
        <b className="qr-r">− {rsT(totals.cashOut)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="jwCash" lang={lang} />
        </span>
        <b>
          <span className="qr-g">+{rsT(totals.jwIn)}</span> <span className="qr-r">−{rsT(totals.jwOut)}</span>
        </b>
      </div>
      <div className="qr-srow">
        <span>
          {words("PIGMEE", lang).main} + {words("OWNER_DRAW", lang).main}
          {lang === "both" && (
            <span className="qr-sub">
              {words("PIGMEE", lang).sub} + {words("OWNER_DRAW", lang).sub}
            </span>
          )}
        </span>
        <b className="qr-o">− {rsT(totals.pigmee + totals.ownerDraw)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <b>
            <Txt k="inCounter" lang={lang} />
          </b>
        </span>
        <b className="qr-big">{rsT(counterNow)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <G e="📱" /> UPI <b className="qr-g">{rsT(totals.upiIn)}</b> · <b className="qr-r">{rsT(totals.upiOut)}</b>
        </span>
        <span>
          <G e="📒" /> {word("CREDIT", lang)} <b>{rsT(totals.creditGiven)}</b>
          {totals.ownerPhonePeIn > 0 && (
            <>
              {" "}
              · <G e="🟣" /> {word("OWNER_PHONEPE", lang)} <b>{rsT(totals.ownerPhonePeIn)}</b>
            </>
          )}
        </span>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="t1" lang={lang} />
        </span>
        {tallyText(day?.tallies.AFTERNOON || null)}
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="t2" lang={lang} />
        </span>
        {tallyText(day?.tallies.NIGHT || null)}
      </div>
    </Section>
  );

  const entriesBlockRaw = (
    <Section id="entries" title={<Txt k="entries" lang={lang} />} right={<span className="qr-m">{entries.length}</span>}>
      <div className="qr-lists">
        <div className="qr-lcol in">
          <div className="qr-lh">
            <span><G e="⬇" /> {word("moneyIn", lang)}</span>
            <span>{rsT(sum(ins))}</span>
          </div>
          {ins.length ? [...ins].reverse().map(EntryCard) : <div className="qr-empty">{word("none", lang)}</div>}
        </div>
        <div className="qr-lcol out">
          <div className="qr-lh">
            <span><G e="⬆" /> {word("moneyOut", lang)}</span>
            <span>{rsT(sum(outs))}</span>
          </div>
          {outs.length ? [...outs].reverse().map(EntryCard) : <div className="qr-empty">{word("none", lang)}</div>}
        </div>
        {oths.length > 0 && (
          <div className="qr-lcol oth">
            <div className="qr-lh">
              <span>{word("otherCash", lang)}</span>
              <span>{rsT(sum(oths))}</span>
            </div>
            {[...oths].reverse().map(EntryCard)}
          </div>
        )}
      </div>
    </Section>
  );

  // Job-work ledger laid out exactly like the Job-Work Desk table.
  // "w" columns show only when the table has room; on a narrow panel their
  // content folds into the Customer / Status cells, so nothing scrolls.
  const th = (k: WordKey, cls?: string) => {
    const w = words(k, lang);
    return (
      <th className={cls}>
        {w.main}
        {w.sub && <span className="qr-sub">{w.sub}</span>}
      </th>
    );
  };
  const jobWorkBlockRaw = (
    <Section
      id="jobwork"
      anchor="qr-jw-ledger"
      title={
        <>
          <G e="🌾" /> <Txt k="jobWork" lang={lang} />
        </>
      }
      right={<span className="qr-m">{unsettled.length} {word("unsettled", lang)}</span>}
    >
      <div className="qr-stats">
        <div className="qr-stat">
          <div className="l"><G e="🟤" /> {word("khali", lang)}</div>
          <div className="v">{(day?.khaliKg || 0).toFixed(1)} kg</div>
        </div>
        <div className="qr-stat">
          <div className="l">⏳ {word("unsettled", lang)}</div>
          <div className="v">{unsettled.length}</div>
        </div>
      </div>
      <div className="qr-tablewrap">
        <table className="qr-table">
          <thead>
            <tr>
              {th("colTime")}
              {th("colCustomer")}
              {th("colVehicle", "w")}
              {th("colSeed")}
              {th("colCake")}
              {th("colNotes", "w")}
              {th("colStatus")}
              {th("colActions", "w")}
            </tr>
          </thead>
          <tbody>
            {(day?.jobWork || []).map((j) => {
              const due = expectedSettlement(j);
              const cansCharge = Object.values(j.cans || {}).reduce(
                (s, c) => s + (c ? (Number(c.qty) || 0) * (Number(c.rate) || 0) : 0),
                0
              );
              return (
                <tr key={j.id}>
                  <td className="t-date">
                    {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}
                    <span className="qr-sub">{hm(j.createdAt)}</span>
                  </td>
                  <td>
                    <b>{j.customer}</b>
                    {j.advanceCustomerInr > 0 && <span className="qr-m"> (adv ₹{j.advanceCustomerInr})</span>}
                    {cansCharge > 0 && <span className="qr-m"> (cans ₹{cansCharge})</span>}
                    {(j.vehicleNo || j.advanceAutoInr > 0) && (
                      <span className="n fold">
                        <G e="🛺" /> {j.vehicleNo || "—"}
                        {j.advanceAutoInr > 0 && ` (adv ₹${j.advanceAutoInr})`}
                      </span>
                    )}
                    {j.notes && <span className="n fold"><G e="📝" /> {j.notes}</span>}
                  </td>
                  <td className="w">
                    {j.vehicleNo || "—"}
                    {j.advanceAutoInr > 0 && <span className="qr-m"> (adv ₹{j.advanceAutoInr})</span>}
                  </td>
                  <td>{j.seedKg}</td>
                  <td>{word(j.cakeOwnership === "SHOP" ? "cakeShopShort" : "cakeCustomerShort", lang)}</td>
                  <td className="w">{j.notes || "—"}</td>
                  <td>
                    {j.settled ? (
                      <b className="qr-g nowrap">{word("paid", lang)}</b>
                    ) : (
                      <b className="qr-o nowrap">
                        {word("due", lang)} {acc.mask("udhaar", rs(due))}
                      </b>
                    )}
                    <span className="fold acts">
                      {!j.settled && (
                        <button className="qr-link o" disabled={dbOffline} onClick={() => setSheet({ t: "jwpay", id: j.id })}>
                          {word("pay", lang)}
                        </button>
                      )}
                      <button className="qr-link" disabled={dbOffline} onClick={() => setSheet({ t: "jw", id: j.id })}>
                        {word("edit", lang)}
                      </button>
                    </span>
                  </td>
                  <td className="nowrap w">
                    {!j.settled && (
                      <button className="qr-link o" disabled={dbOffline} onClick={() => setSheet({ t: "jwpay", id: j.id })}>
                        {word("pay", lang)}
                      </button>
                    )}
                    <button className="qr-link" disabled={dbOffline} onClick={() => setSheet({ t: "jw", id: j.id })}>
                      {word("edit", lang)}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!day?.jobWork.length && (
              <tr>
                <td colSpan={8} className="qr-empty">
                  {word("none", lang)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );

  // ------------------------------ voice ---------------------------------
  // Uses the browser's speech recogniser (Chrome / Edge / Android; audio is
  // processed by the browser's speech service). The parsed command only
  // OPENS the right form, pre-filled — the person still checks and saves.
  const [voiceOn, setVoiceOn] = useState(false);
  const [heard, setHeard] = useState("");
  const [voiceOk, setVoiceOk] = useState(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setVoiceOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const runVoice = (text: string) => {
    const a = parseVoice(text);
    // The quick rule-based parser did not understand: let the AI try (it only fills a form for checking).
    if (a.type === "unknown") return setSheet({ t: "smart", text, auto: true });
    if (a.type === "open") {
      if (a.target === "reports") window.location.href = isOwner ? "/reports" : "/register";
      else if (a.target === "jw") setSheet({ t: "jw" });
      else setSheet({ t: a.target });
      return;
    }
    if (a.kind === "FRESH_CRUSH") return setSheet({ t: "fresh" });
    const { type: _t, kind, ...init } = a;
    void _t;
    setSheet({ t: "entry", kind, init });
    toast(word("voiceCheck", lang));
  };
  const startVoice = () => {
    const w = window as unknown as Record<string, new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    }>;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    if (voiceOn) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    // the language picked in the AI / voice sheet (EN · ಕನ್ನಡ · हिन्दी), else the screen language
    let saved = "";
    try { saved = localStorage.getItem(SPEECH_KEY) || ""; } catch {}
    rec.lang = saved === "hi-IN" || saved === "kn-IN" || saved === "en-IN" ? saved : lang === "kn" ? "kn-IN" : "en-IN";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = t;
      }
      setHeard(t);
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") toast(`🎤 ${e.error}`);
    };
    rec.onend = () => {
      setVoiceOn(false);
      if (finalText.trim()) runVoice(finalText);
    };
    recRef.current = rec;
    setHeard("");
    setVoiceOn(true);
    rec.start();
  };

  // ---------------------------- workspace ------------------------------
  // An always-open card: pick a tool once and it stays on screen (per device).
  const [wsKey, setWsKey] = useState(0);
  const wsReset = () => setWsKey((k) => k + 1);
  const wsSaved = (msg?: string) => {
    celebrate();
    toast(msg || word("saved", lang));
    load();
    wsReset();
  };
  const WORK_TOOLS: { key: WorkTool; icon: string; k: WordKey }[] = [
    { key: "calc", icon: "🧮", k: "calc" },
    { key: "estimate", icon: "🏷️", k: "estimate" },
    { key: "notepad", icon: "📝", k: "notepad" },
    { key: "FRESH_CRUSH", icon: "🫗", k: "FRESH_CRUSH" },
    { key: "SALE", icon: "💰", k: "SALE" },
    { key: "EXPENSE", icon: "🧾", k: "EXPENSE" },
    { key: "PURCHASE", icon: "🛒", k: "PURCHASE" },
    { key: "jwNew", icon: "🌾", k: "jwNew" },
    { key: "count", icon: "💵", k: "count" },
    { key: "stock", icon: "📦", k: "stockTally" },
  ];
  const WORK_FN: Partial<Record<WorkTool, FnKey>> = { FRESH_CRUSH: "sale", SALE: "sale", EXPENSE: "expense", PURCHASE: "purchase", jwNew: "jobwork", count: "count", stock: "stock" };
  const toolsAllowed = WORK_TOOLS.filter((w) => !WORK_FN[w.key] || acc.fn(WORK_FN[w.key]!));
  const tool: WorkTool = toolsAllowed.some((w) => w.key === prefs.work) ? prefs.work : "calc";
  const wsBody =
    tool === "calc" ? (
      <CalcSheet key={wsKey} lang={lang} onClose={wsReset} />
    ) : tool === "estimate" ? (
      <EstimateSheet key={wsKey} day={day} lang={lang} onClose={wsReset} toast={toast} onMakeSale={(init) => setSheet({ t: "entry", kind: "SALE", init })} />
    ) : tool === "notepad" ? (
      <Notepad lang={lang} />
    ) : !day ? null : tool === "FRESH_CRUSH" ? (
      <FreshCrushSheet key={wsKey} day={day} lang={lang} date={date} onClose={wsReset} onSaved={wsSaved} toast={toast} />
    ) : tool === "jwNew" ? (
      <JobWorkSheet key={wsKey} day={day} lang={lang} onClose={wsReset} onSaved={wsSaved} toast={toast} />
    ) : tool === "stock" ? (
      <StockSheet key={wsKey} lang={lang} date={date} onClose={wsReset} onSaved={(m) => { toast(m); load(); wsReset(); }} toast={toast} />
    ) : tool === "count" ? (
      <CountSheet
        key={wsKey}
        day={day}
        lang={lang}
        date={date}
        isOwner={isOwner}
        onClose={wsReset}
        onSaved={(msg) => {
          toast(msg);
          load();
          wsReset();
        }}
        reload={load}
        toast={toast}
      />
    ) : (
      <EntrySheet key={`${tool}-${wsKey}`} kind={tool} day={day} lang={lang} date={date} onClose={wsReset} onSaved={wsSaved} toast={toast} />
    );
  const floating = prefs.float.on && canSide;
  const startMove = (e: React.PointerEvent) => {
    if (!floating || (e.target as HTMLElement).closest("button,input,select")) return;
    const z = pageZoom();
    const sx = e.clientX / z - prefs.float.x;
    const sy = e.clientY / z - prefs.float.y;
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth / z - 120, ev.clientX / z - sx));
      const y = Math.max(0, Math.min(window.innerHeight / z - 60, ev.clientY / z - sy));
      setPrefsState((p) => ({ ...p, float: { ...p.float, x, y } }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPrefs((p) => p); // save final position
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const workspaceBlockRaw = (
    <div className="qr-work" aria-label={word("workspace", lang)}>
      <div className="qr-head qr-work-head" onPointerDown={startMove}>
        <span>
          <G e="🧰" /> <Txt k="workspace" lang={lang} />
        </span>
        {canSide && (
          <span className="acts">
            {floating && (
              <label title={word("wsOpacity", lang)}>
                ◐
                <input
                  type="range"
                  min={0.35}
                  max={1}
                  step={0.05}
                  value={prefs.float.op}
                  onChange={(e) => setPrefs((p) => ({ ...p, float: { ...p.float, op: Number(e.target.value) } }))}
                  aria-label={word("wsOpacity", lang)}
                  style={{ width: 80 }}
                />
              </label>
            )}
            <button
              className="qr-pill"
              onClick={() => setPrefs((p) => ({ ...p, float: { ...p.float, on: !p.float.on } }))}
              title={floating ? word("wsDock", lang) : word("wsFloat", lang)}
            >
              {floating ? "⇲ " + word("wsDock", lang) : "⧉ " + word("wsFloat", lang)}
            </button>
          </span>
        )}
      </div>
      <div className="qr-chips qr-work-tools" role="tablist">
        {toolsAllowed.map((w) => {
          const l = words(w.k, lang);
          return (
            <button
              key={w.key}
              role="tab"
              aria-selected={tool === w.key}
              className={`qr-chip${tool === w.key ? " sel" : ""}`}
              disabled={dbOffline && w.key !== "calc" && w.key !== "notepad"}
              onClick={() => setPrefs((p) => ({ ...p, work: w.key }))}
            >
              <span className="ci"><G e={w.icon} /></span>
              {l.main}
              {l.sub && <span className="qr-sub">{l.sub}</span>}
            </button>
          );
        })}
      </div>
      <SheetModeCtx.Provider value="inline">
        <div className="qr-work-body">{wsBody}</div>
      </SheetModeCtx.Provider>
    </div>
  );

  // ----------------------------- sheets --------------------------------
  const done = (msg?: string) => {
    setSheet(null);
    celebrate();
    toast(msg || word("saved", lang));
    load();
  };
  const sheetElRaw = !sheet ? null : sheet.t === "calc" ? (
    <CalcSheet lang={lang} onClose={() => setSheet(null)} />
  ) : sheet.t === "estimate" ? (
    <EstimateSheet day={day} lang={lang} onClose={() => setSheet(null)} toast={toast} onMakeSale={(init) => setSheet({ t: "entry", kind: "SALE", init })} />
  ) : !day ? null : sheet.t === "entry" ? (
    <EntrySheet key={sheet.kind + JSON.stringify(sheet.init || {})} kind={sheet.kind} init={sheet.init} day={day} lang={lang} date={date} onClose={() => setSheet(null)} onSaved={(m) => done(m)} toast={toast} />
  ) : sheet.t === "scan" ? (
    <ScanSheet
      lang={lang}
      date={date}
      onClose={() => setSheet(null)}
      onSaved={(m) => done(m)}
      onMakeEntry={(kind, init) => {
        setSheet({ t: "entry", kind, init });
        toast(word("voiceCheck", lang));
      }}
      toast={toast}
    />
  ) : sheet.t === "smart" ? (
    <SmartSheet
      key={(sheet.text || "") + (sheet.auto ? "a" : "")}
      lang={lang}
      date={date}
      day={day}
      initText={sheet.text}
      auto={sheet.auto}
      onClose={() => setSheet(null)}
      onOpen={(kind, init) => {
        if (kind === "FRESH_CRUSH") setSheet({ t: "fresh" });
        else setSheet({ t: "entry", kind, init });
        toast(word("voiceCheck", lang));
      }}
      toast={toast}
    />
  ) : sheet.t === "stock" ? (
    <StockSheet lang={lang} date={date} onClose={() => setSheet(null)} onSaved={(m) => done(m)} toast={toast} />
  ) : sheet.t === "bill" ? (
    <SheetFrame icon="🧾" k="bill" lang={lang} onClose={() => setSheet(null)}>
      <BillSheet lang={lang} date={date} onSaved={(m) => done(m)} toast={toast} />
    </SheetFrame>
  ) : sheet.t === "mfg" ? (
    <SheetFrame icon="🛢️" k="mfgDesk" lang={lang} onClose={() => setSheet(null)}>
      <MfgQuick startNew={sheet.startNew} />
    </SheetFrame>
  ) : sheet.t === "fresh" ? (
    <FreshCrushSheet day={day} lang={lang} date={date} onClose={() => setSheet(null)} onSaved={() => done()} toast={toast} />
  ) : sheet.t === "jw" ? (
    <JobWorkSheet
      key={sheet.id || "new"}
      day={day}
      lang={lang}
      edit={sheet.id ? day.jobWork.find((j) => j.id === sheet.id) : undefined}
      onClose={() => setSheet(null)}
      onSaved={() => done()}
      toast={toast}
    />
  ) : sheet.t === "jwpay" ? (
    day.jobWork.find((j) => j.id === sheet.id) ? (
      <JobWorkPaySheet
        key={sheet.id}
        entry={day.jobWork.find((j) => j.id === sheet.id)!}
        lang={lang}
        onClose={() => setSheet(null)}
        onSaved={() => done()}
        toast={toast}
      />
    ) : null
  ) : sheet.t === "count" ? (
    <CountSheet
      day={day}
      lang={lang}
      date={date}
      isOwner={isOwner}
      onClose={() => setSheet(null)}
      onSaved={(msg) => done(msg)}
      reload={load}
      toast={toast}
    />
  ) : (
    <ReportSheet
      day={day}
      lang={lang}
      setLang={setLang}
      layout={prefs.layout}
      setLayout={(l) => setPrefs((p) => ({ ...p, layout: l }))}
      onEditFavs={() => {
        setSheet(null);
        setEditFavs(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      isOwner={isOwner}
      onClose={() => setSheet(null)}
      toast={toast}
      reloadToday={load}
    />
  );

  // Windows a profile switches off simply are not drawn.
  const summaryBlock = acc.win("summary") ? summaryBlockRaw : null;
  const entriesBlock = acc.win("entries") ? entriesBlockRaw : null;
  const workspaceBlock = acc.win("work") ? workspaceBlockRaw : null;
  const jobWorkBlock = acc.fn("jobwork") && acc.win("work") ? jobWorkBlockRaw : null;
  const sheetEl = acc.win("form") ? sheetElRaw : null;
  const POS_KINDS = (["SALE", "FRESH_CRUSH", "UDHAAR_IN", "PURCHASE", "EXPENSE", "PAYMENT"] as const).filter((k) => acc.fn(kindToFn(k)));
  const posSaved = (msg?: string) => {
    celebrate();
    toast(msg || word("saved", lang));
    load();
    setPosKey((k) => k + 1); // fresh form for the next customer
  };
  const posBlock = (
    <div className="pos-desk">
      <section className="pos-main" aria-label="POS">
        <div className="pos-kinds" role="tablist">
          {POS_KINDS.map((k) => {
            const w = words(k, lang);
            const sideK = KIND_SIDE[k];
            return (
              <button
                key={k}
                role="tab"
                aria-selected={posKind === k}
                className={`pos-kind ${sideK}${posKind === k ? " on" : ""}`}
                onClick={() => {
                  setPosKind(k);
                  setPosKey((x) => x + 1);
                }}
                disabled={dbOffline}
              >
                <span className="pk-ic" aria-hidden>
                  <G e={KIND_ICON[k]} />
                </span>
                <span className="pk-t">
                  {w.main}
                  {w.sub && <small>{w.sub}</small>}
                </span>
              </button>
            );
          })}
        </div>
        <SheetModeCtx.Provider value="inline">
          {!day ? (
            <div className="qr-empty">{loadError ? (dbOffline ? word("offline", lang) : loadError) : "…"}</div>
          ) : posKind === "FRESH_CRUSH" ? (
            <FreshCrushSheet key={`fc-${posKey}`} day={day} lang={lang} date={date} onClose={() => setPosKey((x) => x + 1)} onSaved={() => posSaved()} toast={toast} />
          ) : (
            <EntrySheet key={`${posKind}-${posKey}`} kind={posKind} day={day} lang={lang} date={date} onClose={() => setPosKey((x) => x + 1)} onSaved={posSaved} toast={toast} />
          )}
        </SheetModeCtx.Provider>
      </section>
      <aside className="pos-side">
        {heroBlock}
        {entriesBlock}
      </aside>
    </div>
  );

  const simpleBlock = (
    <div className={`qr-simple sz-${simple.size}`}>
      <div className="qr-simple-cash">
        <span><Txt k="inCounter" lang={lang} /></span>
        <b>{rsT(counterNow)}</b>
      </div>
      <div className="qr-simple-grid">
        {simple.tiles.map((k) => (k in TILES ? <Tile key={k} id={k as TileKey} extraClass="qr-simple-tile" /> : null))}
      </div>
      <div className="qr-simple-hint">{word("simpleOffHint", lang)}</div>
    </div>
  );

  return (
    <div className={`qr${posMode ? " qr-pos" : ""}`} data-size={skinned ? (simpleOn === true ? (simple.size === "S" ? "s" : simple.size === "M" ? "m" : "l") : prefs.size) : undefined}>
      <div className={`qr-wrap${sideBySide || posMode ? " split" : ""}`}>
        <div className="qr-top">
          {skinned && (
            <span className="qr-logo" aria-hidden>
              <BrandMark size={22} />
            </span>
          )}
          <h1>
            {word("title", lang)}
            <small>
              {new Date(now).toLocaleDateString(lang === "kn" ? "kn-IN" : "en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Asia/Kolkata",
              })}{" "}
              · {hm(now)}
            </small>
          </h1>
          <button
            className={`qr-pill qr-simplebtn${simpleOn === true ? " on" : ""}`}
            onClick={toggleSimple}
            aria-pressed={simpleOn === true}
            title={word("simpleMode", lang)}
            aria-label={word("simpleMode", lang)}
          >
            🧸
          </button>
          {simpleOn !== true && (<>
          <button
            className={`qr-pill${editFavs ? " on" : ""}`}
            onClick={() => setEditFavs((v) => !v)}
            aria-label={word("editFavs", lang)}
            title={word("editFavs", lang)}
          >
            {editFavs ? "✓ " : ""}
            {pillIc("⭐", "star")}
          </button>
          {canSide && (
            <button
              className="qr-pill"
              onClick={() => setPrefs((p) => ({ ...p, layout: nextLayout[p.layout] }))}
              title={word("layout", lang)}
            >
              {layoutLabel[prefs.layout]}
            </button>
          )}
          <button
            type="button"
            className={`qr-pill${prefs.cashSheet ? " on" : ""}`}
            onClick={() => setPrefs((p) => ({ ...p, cashSheet: !p.cashSheet }))}
            title="Cash in | Cash out sheet with a total on each line"
            aria-pressed={prefs.cashSheet}
          >
            📋 Cash sheet
          </button>
          <button
            className={`qr-pill qr-posbtn${posMode ? " on" : ""}`}
            onClick={() => (posMode && startPos ? (window.location.href = "/register") : setPosMode((v) => !v))}
            title={posMode ? (lang === "kn" ? "ಪೂರ್ಣ ರಿಜಿಸ್ಟರ್" : "Back to full register") : lang === "kn" ? "ಕೌಂಟರ್ ಮೋಡ್ (POS)" : "Counter mode (POS)"}
            aria-pressed={posMode}
          >
            {skinned ? <Icon name="calc" size={18} /> : "🧾 "}
            <b>{posMode ? (lang === "kn" ? "ಮುಚ್ಚಿ POS" : "Exit POS") : "POS"}</b>
          </button>
          {skinned && (
            <button
              className="qr-pill qr-size"
              onClick={() => setPrefs((p) => ({ ...p, size: p.size === "m" ? "s" : p.size === "s" ? "l" : "m" }))}
              title={word("tileSize", lang)}
              aria-label={`${word("tileSize", lang)}: ${prefs.size.toUpperCase()}`}
            >
              <Icon name="size" size={18} />
              <b>{prefs.size.toUpperCase()}</b>
            </button>
          )}
          <button className="qr-pill" onClick={() => setLang(nextLang[lang])} aria-label={word("language", lang)}>
            {skinned ? "" : "🗣️ "}
            {langLabel[lang]}
          </button>
          {voiceOk && (
            <button className={`qr-pill${voiceOn ? " rec" : ""}`} onClick={startVoice} title={word("voice", lang)} aria-label={word("voice", lang)} aria-pressed={voiceOn}>
              {pillIc("🎤", "mic")}
            </button>
          )}
          <a className="qr-pill" href="/appearance" title="Appearance: themes, text size, colours" aria-label="Appearance">
            {pillIc("🎨", "palette")}
          </a>
          {isOwner && (
            <>
              <a className="qr-pill" href="/reports" title="Reports & dashboard">
                {pillIc("📊", "chart")}
              </a>
              <a className="qr-pill" href="/records" title={word("records", lang)}>
                {pillIc("🗂️", "folder")}
              </a>
              <a className="qr-pill" href="/settings" title="Settings">
                {pillIc("⚙️", "gear")}
              </a>
              <a className="qr-pill" href="/">
                {word("fullDesk", lang)} ↗
              </a>
            </>
          )}
          </>)}
        </div>

        {loadError && <div className="qr-banner">{dbOffline ? word("offline", lang) : loadError}</div>}
        {date !== todayIST() && (
          <div className="qr-banner">
            <G e="📅" /> {date} —{" "}
            <button className="qr-pill" onClick={() => setDate(todayIST())}>
              {word("day", lang)}: {todayIST()}
            </button>
          </div>
        )}

        {simpleOn === true ? (
          simpleBlock
        ) : posMode ? (
          posBlock
        ) : sideBySide ? (
          <div
            className="qr-split has-splitter"
            ref={splitRef}
            style={prefs.leftW ? ({ "--qr-left-w": `${prefs.leftW}px` } as React.CSSProperties) : undefined}
          >
            <div className="qr-left">
              {heroBlock}
              {favouritesBlock}
              {prefs.cashSheet ? cashBoard : skinned ? designBoard : boardBlock}
              {summaryBlock}
            </div>
            <div
              className={`qr-splitter${dragging ? " drag" : ""}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={word("resizeCols", lang)}
              title={word("resizeCols", lang)}
              tabIndex={0}
              onPointerDown={startSplit}
              onDoubleClick={() => setPrefs((p) => ({ ...p, leftW: null }))}
              onKeyDown={(e) => {
                const cur = prefs.leftW || splitRef.current?.querySelector<HTMLElement>(".qr-left")?.offsetWidth || 480;
                if (e.key === "ArrowLeft") setPrefs((p) => ({ ...p, leftW: Math.max(300, cur - 20) }));
                if (e.key === "ArrowRight") setPrefs((p) => ({ ...p, leftW: Math.min(900, cur + 20) }));
              }}
            />
            <div className="qr-right" ref={rightRef}>
              <div className="qr-wrestore" role="group" aria-label="Windows">
                <span className="qr-colpick" role="radiogroup" aria-label="Columns">
                  <span>Columns</span>
                  {(["auto", "1", "2", "3"] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={(prefs.cols || "auto") === c} className={(prefs.cols || "auto") === c ? "on" : ""} onClick={() => setPrefs((p) => ({ ...p, cols: c }))}>
                      {c === "auto" ? "Auto" : c}
                    </button>
                  ))}
                </span>
                {wins.hid.length > 0 && <span>Hidden:</span>}
                {wins.hid.map((id) => (
                  <button key={id} type="button" className="qr-pill" onClick={() => setWins((w) => showWin(w, id))}>
                    ＋ {WIN_LABEL[id]}
                  </button>
                ))}
              </div>
              <div className={`qr-rforms cols-${prefs.cols || "auto"}`}>
                {wins.order.map((id) => {
                  const node: React.ReactNode =
                    id === "form" ? (sheetEl ? <SheetModeCtx.Provider value="inline">{sheetEl}</SheetModeCtx.Provider> : null)
                    : id === "work" ? (!floating ? workspaceBlock : null)
                    : id === "jobwork" ? jobWorkBlock
                    : entriesBlock;
                  if (!node) return null;
                  const hid = wins.hid.includes(id);
                  const min = wins.min.includes(id);
                  const shown = wins.order.filter((x) => !wins.hid.includes(x));
                  const at = shown.indexOf(id);
                  return (
                    <div key={id} className={`qr-win${min ? " min" : ""}`} data-win={id} hidden={hid}>
                      <div className="qr-wbar">
                        <span className="t">{WIN_LABEL[id]}</span>
                        <button type="button" aria-label="Move up" title="Move up" disabled={at <= 0} onClick={() => setWins((w) => moveWin(w, id, -1))}>▲</button>
                        <button type="button" aria-label="Move down" title="Move down" disabled={at < 0 || at >= shown.length - 1} onClick={() => setWins((w) => moveWin(w, id, 1))}>▼</button>
                        <button type="button" aria-label={min ? "Open" : "Minimise"} title={min ? "Open" : "Minimise"} onClick={() => setWins((w) => toggleMin(w, id))}>{min ? "▢" : "–"}</button>
                        <button type="button" aria-label="Hide" title="Hide" onClick={() => setWins((w) => hideWin(w, id))}>✕</button>
                      </div>
                      <div className="qr-wbody" hidden={min}>{node}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {heroBlock}
            {favouritesBlock}
            {prefs.cashSheet ? cashBoard : skinned ? designBoard : boardBlock}
            {!floating && workspaceBlock}
            {summaryBlock}
            {entriesBlock}
            {jobWorkBlock}
          </>
        )}
      </div>

      {(!sideBySide || posMode) && sheetEl}
      {floating && (
        <div
          className="qr-float"
          ref={floatRef}
          style={{ left: prefs.float.x, top: prefs.float.y, width: prefs.float.w, height: prefs.float.h, opacity: prefs.float.op }}
          onPointerUp={() => {
            const el = floatRef.current;
            if (el && (el.offsetWidth !== prefs.float.w || el.offsetHeight !== prefs.float.h))
              setPrefs((p) => ({ ...p, float: { ...p.float, w: el.offsetWidth, h: el.offsetHeight } }));
          }}
        >
          {workspaceBlock}
        </div>
      )}
      {voiceOn && (
        <div className="qr-voice" role="status" aria-live="polite">
          <div className="mic" aria-hidden>
            <G e="🎤" />
          </div>
          <div className="qr-hint">{word("voiceListening", lang)}</div>
          <div className="heard">{heard || "…"}</div>
          <button className="qr-btn2" onClick={() => recRef.current?.stop()}>
            ✓ {word("done", lang)}
          </button>
        </div>
      )}
      {tick > 0 && (
        <div className="qr-saved" key={tick} aria-hidden>
          <span className="rp" />
          <span className="rp r2" />
          <span className="ok">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
      )}
      {rcpt && <ReceiptSheet doc={rcpt} onClose={() => setRcpt(null)} />}
      {waiting > 0 && (
        <button type="button" className="qr-offline" onClick={() => void flushQueue().then((n) => { if (n) { toast(`${n} sent ✓`); load(); } else toast("Still offline — they will go when the internet is back."); })}>
          ⏳ {waiting} entr{waiting === 1 ? "y" : "ies"} saved on this phone · will send when online
        </button>
      )}
      {editing && (
        <EditEntry
          e={editing}
          title={word(editing.kind as WordKey, lang)}
          isOwner={isOwner}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); toast(m); load(); }}
          onDelete={() => { const x = editing; setEditing(null); void remove(x); }}
        />
      )}
      {toastMsg && (
        <div className="qr-toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Job-work intake — writes to the SAME JobWorkIntake table as the Job-Work
// Desk via POST /api/job-work; preview uses lib/calculations unchanged.
// ---------------------------------------------------------------------------
function JobWorkSheet({
  day,
  lang,
  edit,
  onClose,
  onSaved,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  edit?: JobWork; // when set, edits this intake (PATCH) instead of creating one
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const num = (v: number | null | undefined) => (v ? String(v) : "");
  const [customer, setCustomer] = useState(edit?.customer || "");
  const [vehicle, setVehicle] = useState(edit?.vehicleNo || "");
  const [seedKg, setSeedKg] = useState(num(edit?.seedKg));
  const [cake, setCake] = useState<CakeOwnership>(edit?.cakeOwnership || "SHOP");
  const [advC, setAdvC] = useState(num(edit?.advanceCustomerInr));
  const [advA, setAdvA] = useState(num(edit?.advanceAutoInr));
  const [cans, setCans] = useState<Record<CanKey, string>>({
    can15: num(edit?.cans?.can15?.qty),
    can5new: num(edit?.cans?.can5new?.qty),
    can5old: num(edit?.cans?.can5old?.qty),
  });
  const [notes, setNotes] = useState(edit?.notes || "");
  const [busy, setBusy] = useState(false);

  // A can's price is fixed at the moment of intake, so an edit keeps the
  // rate that was saved with the entry (lib/calculations.ts CAN_TYPES note).
  const cansObj = useMemo(() => {
    const o: Partial<Record<CanKey, { qty: number; rate: number }>> = {};
    (Object.keys(CAN_TYPES) as CanKey[]).forEach((k) => {
      const q = parseInt(cans[k], 10);
      if (q > 0) o[k] = { qty: q, rate: edit?.cans?.[k]?.rate ?? CAN_TYPES[k].rate };
    });
    return o;
  }, [cans, edit]);

  const due = expectedSettlement({
    seedKg: parseFloat(seedKg) || 0,
    cakeOwnership: cake,
    advanceCustomerInr: parseFloat(advC) || 0,
    advanceAutoInr: parseFloat(advA) || 0,
    cans: cansObj,
  });

  async function save() {
    if (!customer.trim()) return toast(word("needName", lang));
    const kg = parseFloat(seedKg);
    if (!(kg > 0)) return toast(word("needKg", lang));
    setBusy(true);
    try {
      await api(edit ? `/api/job-work/${edit.id}` : "/api/job-work", {
        method: edit ? "PATCH" : "POST",
        body: JSON.stringify({
          customer: customer.trim(),
          vehicleNo: vehicle.trim() || null,
          seedKg: kg,
          cakeOwnership: cake,
          advanceCustomerInr: parseFloat(advC) || 0,
          advanceAutoInr: parseFloat(advA) || 0,
          cans: cansObj,
          notes: notes.trim() || null,
        }),
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  const canLabels: Record<CanKey, [string, string]> = {
    can15: ["15 kg can", "15 ಕೆಜಿ ಡಬ್ಬಿ"],
    can5new: ["5 kg new can", "5 ಕೆಜಿ ಹೊಸ"],
    can5old: ["5 kg old can", "5 ಕೆಜಿ ಹಳೆ"],
  };

  return (
    <SheetFrame icon={edit ? "✏️" : "🌾"} k={edit ? "jwEdit" : "jwNew"} lang={lang} onClose={onClose}>
      <PartyField
        value={customer}
        onChange={setCustomer}
        top={day.topParties}
        all={Array.from(new Set([...day.jobWork.map((j) => j.customer), ...day.allParties]))}
        lang={lang}
        places
      />
      <div className="qr-f">
        <label>
          <Txt k="vehicle" lang={lang} />
        </label>
        <input className="qr-txt" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="KA-38-A-1234" />
      </div>
      <div className="qr-f">
        <label>
          <Txt k="seedKg" lang={lang} />
        </label>
        <input className="qr-num" type="number" inputMode="decimal" min={0} value={seedKg} onChange={(e) => setSeedKg(e.target.value)} />
        <ScaleBtn lang={lang} onUse={(w) => setSeedKg(String(w))} />
      </div>
      <div className="qr-f">
        <label>
          <Txt k="cakeQ" lang={lang} />
        </label>
        <Chips
          lang={lang}
          value={cake}
          onPick={setCake}
          options={[
            { key: "SHOP", icon: "🏪", en: `Shop keeps cake (₹${STANDARD_RATE.SHOP}/kg)`, kn: `ಅಂಗಡಿ ಹಿಂಡಿ (₹${STANDARD_RATE.SHOP}/ಕೆಜಿ)` },
            {
              key: "CUSTOMER",
              icon: "🙋",
              en: `Customer keeps cake (₹${STANDARD_RATE.CUSTOMER}/kg)`,
              kn: `ಗ್ರಾಹಕ ಹಿಂಡಿ (₹${STANDARD_RATE.CUSTOMER}/ಕೆಜಿ)`,
            },
          ]}
        />
      </div>
      <div className="qr-grid2">
        <div className="qr-f">
          <label>
            <Txt k="advCustomer" lang={lang} />
          </label>
          <input className="qr-num" type="number" inputMode="decimal" min={0} value={advC} onChange={(e) => setAdvC(e.target.value)} />
        </div>
        <div className="qr-f">
          <label>
            <Txt k="advAuto" lang={lang} />
          </label>
          <input className="qr-num" type="number" inputMode="decimal" min={0} value={advA} onChange={(e) => setAdvA(e.target.value)} />
        </div>
      </div>
      <span className="qr-lbl">
        <Txt k="cans" lang={lang} />
      </span>
      <div className="qr-grid3">
        {(Object.keys(CAN_TYPES) as CanKey[]).map((k) => {
          const l = pairLabel(`${canLabels[k][0]} (₹${CAN_TYPES[k].rate})`, `${canLabels[k][1]} (₹${CAN_TYPES[k].rate})`, lang);
          return (
            <div className="qr-f" key={k}>
              <label style={{ fontSize: 12 }}>
                {l.main}
                {l.sub && <span className="qr-sub">{l.sub}</span>}
              </label>
              <input
                className="qr-num"
                type="number"
                inputMode="numeric"
                min={0}
                value={cans[k]}
                onChange={(e) => setCans({ ...cans, [k]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
      <div className="qr-f">
        <label>
          <Txt k="note" lang={lang} />
        </label>
        <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className={`qr-res ${cake === "SHOP" ? "bad" : "ok"}`}>
        <span>
          <Txt k="expected" lang={lang} />
        </span>
        <span>
          {word(cake === "SHOP" ? "shopPays" : "customerPays", lang)} {rs(Math.abs(due))}
        </span>
      </div>
      <button className="qr-save jw" onClick={save} disabled={busy}>
        ✓ {word(busy ? "saving" : edit ? "updateIntake" : "logIntake", lang)}
      </button>
    </SheetFrame>
  );
}


function JobWorkPaySheet({
  entry,
  lang,
  onClose,
  onSaved,
  toast,
}: {
  entry: JobWork;
  lang: LangMode;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const std = STANDARD_RATE[entry.cakeOwnership];
  const [rate, setRate] = useState(String(std));
  const r = parseFloat(rate) > 0 ? parseFloat(rate) : std;
  const split = defaultPaySplit(entry, r);
  const due = expectedSettlementWithRate(entry, r);
  const [cust, setCust] = useState<string | null>(null);
  const [auto, setAuto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const custVal = cust ?? String(Math.round(split.customer));
  const autoVal = auto ?? String(Math.round(split.auto));

  async function pay() {
    setBusy(true);
    try {
      await api(`/api/job-work/${entry.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          ratePerKg: r,
          settlementCustomerInr: parseFloat(custVal) || 0,
          settlementAutoInr: entry.cakeOwnership === "SHOP" ? parseFloat(autoVal) || 0 : 0,
        }),
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  return (
    <SheetFrame icon="💳" k="jwSettle" lang={lang} onClose={onClose}>
      <div className="qr-card" style={{ marginTop: 0 }}>
        <b>{entry.customer}</b> · {entry.seedKg} kg · <G e={entry.cakeOwnership === "SHOP" ? "🏪" : "🙋"} />
      </div>
      <div className="qr-f" style={{ marginTop: 10 }}>
        <label>
          {words("rate", lang).main} kg
          {words("rate", lang).sub && <span className="qr-sub">{words("rate", lang).sub} ಕೆಜಿ</span>}
        </label>
        <input className="qr-num" type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <div className={entry.cakeOwnership === "SHOP" ? "qr-grid2" : ""}>
        <div className="qr-f">
          <label>
            <Txt k="payCustomer" lang={lang} />
          </label>
          <input className="qr-num" type="number" inputMode="decimal" value={custVal} onChange={(e) => setCust(e.target.value)} />
        </div>
        {entry.cakeOwnership === "SHOP" && (
          <div className="qr-f">
            <label>
              <Txt k="payAuto" lang={lang} />
            </label>
            <input className="qr-num" type="number" inputMode="decimal" value={autoVal} onChange={(e) => setAuto(e.target.value)} />
          </div>
        )}
      </div>
      <div className={`qr-res ${entry.cakeOwnership === "SHOP" ? "bad" : "ok"}`}>
        <span>
          <Txt k="expected" lang={lang} />
        </span>
        <span>
          {word(entry.cakeOwnership === "SHOP" ? "shopPays" : "customerPays", lang)} {rs(Math.abs(due))}
        </span>
      </div>
      <button className="qr-save jw" onClick={pay} disabled={busy}>
        ✓ {word(busy ? "saving" : "confirmPay", lang)}
      </button>
    </SheetFrame>
  );
}


// ---------------------------------------------------------------------------
// Customer estimate: "how much for this qty?" and "how much oil for this cash?".
// Items come with the saved sale rates; the rate and qty can be overridden.
// Nothing is saved — "Make this a sale" opens the normal sale form pre-filled.
// ---------------------------------------------------------------------------
type EstRow = { id: number; item: string | null; otherName: string; qty: string; unit: string; rate: string };

const EST_QTYS = [0.25, 0.5, 1, 2, 5, 10];

const EST_CASH = [50, 100, 200, 500, 1000];


function EstimateSheet({
  day,
  lang,
  onClose,
  toast,
  onMakeSale,
}: {
  day: DayBundle | null;
  lang: LangMode;
  onClose: () => void;
  toast: (m: string) => void;
  onMakeSale: (init: EntryInit) => void;
}) {
  const cfg = day?.config ?? DEFAULT_CONFIG;
  const items = itemsFor("SALE", cfg);
  const saved = (it: string | null) => {
    const r = it ? cfg.rates[rateKey("SALE", it)] : undefined;
    return r ? String(r) : "";
  };
  const first = items[0]?.key || null;
  const mk = (id: number, it: string | null = first): EstRow => ({ id, item: it, otherName: "", qty: "", unit: "kg", rate: saved(it) });
  const [mode, setMode] = useState<"qty" | "cash">("qty");
  const [rcpt, setRcpt] = useState<ReceiptDoc | null>(null);
  const [rows, setRows] = useState<EstRow[]>(() => [mk(1)]);
  const [cash, setCash] = useState("");
  const nextId = useRef(2);
  const patch = (id: number, p: Partial<EstRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const unitLabel = (u: string) => {
    const o = UNITS.find((x) => x.key === u) || UNITS[0];
    return lang === "kn" ? o.kn : o.en;
  };
  const nameOf = (r: EstRow) => {
    if (r.item === "other") return r.otherName.trim() || word("itemName", lang);
    const c = items.find((i) => i.key === r.item);
    return c ? (lang === "kn" ? c.kn : c.en) : "";
  };

  // ---- the sums ----
  const priced = rows.map((r) => ({ r, amt: estimatePrice(parseFloat(r.qty) || 0, parseFloat(r.rate) || 0) }));
  const total = Math.round(priced.reduce((a, x) => a + x.amt, 0) * 100) / 100;
  const r0 = rows[0];
  const cashN = parseFloat(cash) || 0;
  const gets = estimateQty(cashN, parseFloat(r0.rate) || 0);
  const used = Math.round(gets * (parseFloat(r0.rate) || 0) * 100) / 100;

  const lines: string[] =
    mode === "qty"
      ? priced.filter((x) => x.amt > 0).map((x) => `${nameOf(x.r)} ${fmtEstimateQty(parseFloat(x.r.qty), x.r.unit)} × ₹${x.r.rate} = ${rs(x.amt)}`)
      : gets > 0
        ? [`${rs(cashN)} → ${fmtEstimateQty(gets, r0.unit)} ${nameOf(r0)} @ ₹${r0.rate}/${unitLabel(r0.unit)}`]
        : [];
  const text = ["Mahadev Traders — " + word("estimate", "en"), ...lines, ...(mode === "qty" && lines.length > 1 ? [`${word("estTotal", "en")}: ${rs(total)}`] : [])].join("\n");
  const has = lines.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast(word("estCopied", lang));
    } catch {
      toast(text);
    }
  }
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  const single = mode === "qty" ? (priced.filter((x) => x.amt > 0).length === 1 ? priced.find((x) => x.amt > 0)! : null) : gets > 0 ? { r: r0, amt: cashN } : null;
  function makeSale() {
    if (!single) return;
    const { r, amt } = single;
    const q = mode === "cash" ? gets : parseFloat(r.qty);
    onMakeSale({ item: (r.item as string) || undefined, otherName: r.item === "other" ? r.otherName.trim() : undefined, qty: q, unit: r.unit as never, rate: parseFloat(r.rate) || undefined, amount: amt });
  }

  const rateField = (r: EstRow) => {
    const sv = saved(r.item);
    const custom = r.rate !== "" && r.rate !== sv;
    return (
      <div className="qe-rate">
        <label className="qr-lbl">
          {words("rate", lang).main} {unitLabel(r.unit)}
        </label>
        <input className="qr-num" type="number" inputMode="decimal" min={0} value={r.rate} onChange={(e) => patch(r.id, { rate: e.target.value })} aria-label={word("rate", lang)} />
        <small className={`qe-tag${custom ? " custom" : ""}`}>
          {r.rate === "" ? (
            word("estNoRate", lang)
          ) : custom ? (
            <>
              {word("estCustom", lang)}
              {sv && (
                <button type="button" className="qr-linkbtn" onClick={() => patch(r.id, { rate: sv })}>
                  {word("estReset", lang)} ₹{sv}
                </button>
              )}
            </>
          ) : (
            <>{word("estSaved", lang)}</>
          )}
        </small>
      </div>
    );
  };

  const pick = (r: EstRow) => (
    <>
      <PickMenu lang={lang} value={r.item} options={items} onPick={(v) => patch(r.id, { item: v, rate: saved(v) })} />
      {r.item === "other" && <input className="qr-txt" style={{ marginTop: 6 }} placeholder={word("itemName", lang)} value={r.otherName} onChange={(e) => patch(r.id, { otherName: e.target.value })} />}
    </>
  );

  return (
    <SheetFrame icon="🏷️" k="estimate" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <Chips
          compact
          lang={lang}
          value={mode}
          onPick={setMode}
          options={[
            { key: "qty", icon: "⚖️", en: word("estQtyMode", "en"), kn: word("estQtyMode", "kn") },
            { key: "cash", icon: "💵", en: word("estCashMode", "en"), kn: word("estCashMode", "kn") },
          ]}
        />
      </div>

      {mode === "qty" ? (
        <>
          {rows.map((r, i) => (
            <div className="qe-row" key={r.id}>
              <div className="qe-top">
                <span className="qe-n">{i + 1}</span>
                <div className="qe-pick">{pick(r)}</div>
                {rows.length > 1 && (
                  <button type="button" className="qe-x" aria-label={word("removeQ", lang)} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                    ✕
                  </button>
                )}
              </div>
              <div className="qe-grid">
                <div>
                  <label className="qr-lbl">
                    <Txt k="qty" lang={lang} />
                  </label>
                  <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.1" value={r.qty} onChange={(e) => patch(r.id, { qty: e.target.value })} aria-label={word("qty", lang)} />
                </div>
                {rateField(r)}
              </div>
              <Chips compact lang={lang} value={r.unit} onPick={(u) => patch(r.id, { unit: u })} options={UNITS} />
              {(r.unit === "kg" || r.unit === "ltr") && (
                <div className="qe-quick">
                  {EST_QTYS.map((q) => (
                    <button type="button" key={q} className={parseFloat(r.qty) === q ? "on" : ""} onClick={() => patch(r.id, { qty: String(q) })}>
                      {q < 1 ? fmtEstimateQty(q, r.unit) : q}
                    </button>
                  ))}
                </div>
              )}
              <div className="qe-line">
                <span>
                  {fmtEstimateQty(parseFloat(r.qty) || 0, r.unit)} × ₹{r.rate || 0}
                </span>
                <b>{rs(priced[i].amt)}</b>
              </div>
            </div>
          ))}
          <div className="qr-f">
            <button
              type="button"
              className="qe-add"
              onClick={() => {
                const id = nextId.current++;
                setRows((rs) => [...rs, mk(id)]);
              }}
            >
              <span className="pl">+</span> <Txt k="estAddItem" lang={lang} />
            </button>
          </div>
          <div className="qe-res">
            <small>
              <Txt k="estTotal" lang={lang} />
            </small>
            <b>{rs(total)}</b>
          </div>
        </>
      ) : (
        <>
          <div className="qe-row">
            <div className="qe-top">
              <div className="qe-pick">{pick(r0)}</div>
            </div>
            <div className="qe-grid">
              <div>
                <label className="qr-lbl">
                  <Txt k="estCash" lang={lang} />
                </label>
                <input className="qr-num" type="number" inputMode="decimal" min={0} value={cash} onChange={(e) => setCash(e.target.value)} autoFocus aria-label={word("estCash", lang)} />
              </div>
              {rateField(r0)}
            </div>
            <Chips compact lang={lang} value={r0.unit} onPick={(u) => patch(r0.id, { unit: u })} options={UNITS} />
            <div className="qe-quick">
              {EST_CASH.map((c) => (
                <button type="button" key={c} className={cashN === c ? "on" : ""} onClick={() => setCash(String(c))}>
                  ₹{c}
                </button>
              ))}
            </div>
          </div>
          <div className="qe-res">
            <small>
              <Txt k="estGets" lang={lang} />
            </small>
            <b>{gets > 0 ? `${fmtEstimateQty(gets, r0.unit)} ${nameOf(r0)}` : "—"}</b>
            {gets > 0 && cashN - used >= 0.5 && (
              <em>
                = {rs(used)} · {rs(cashN - used)} {lang === "kn" ? "ಉಳಿಯಿತು" : "left"}
              </em>
            )}
          </div>
        </>
      )}

      <div className="qe-acts">
        <button type="button" className="qr-chip" onClick={copy} disabled={!has}>
          <G e="📋" /> <Txt k="estCopy" lang={lang} />
        </button>
        <button type="button" className="qr-chip" onClick={share} disabled={!has}>
          <G e="💬" /> <Txt k="estShare" lang={lang} />
        </button>
        <button
          type="button"
          className="qr-chip"
          disabled={!has}
          onClick={() =>
            setRcpt({
              title: "ESTIMATE",
              when: receiptTime(),
              rows: lines.map((l) => ({ name: l })),
              totals: mode === "qty" ? [{ label: "TOTAL", value: rs(total), strong: true }] : [],
              notes: ["Estimate only, not a bill"],
            })
          }
        >
          <G e="🖨️" /> {lang === "kn" ? "ಮುದ್ರಿಸಿ" : "Print"}
        </button>
        {rcpt && <ReceiptSheet doc={rcpt} onClose={() => setRcpt(null)} />}
        {single && (
          <button type="button" className="qr-save" onClick={makeSale}>
            ✓ <Txt k="estMakeSale" lang={lang} />
          </button>
        )}
      </div>
      <div className="qr-hint">
        <Txt k="estNote" lang={lang} />
      </div>
    </SheetFrame>
  );
}


function CalcSheet({ lang, onClose }: { lang: LangMode; onClose: () => void }) {
  const [x, setX] = useState("");
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "C", "+", "⌫", "(", ")", "="];
  function press(k: string) {
    if (k === "C") return setX("");
    if (k === "⌫") return setX((s) => s.slice(0, -1));
    if (k === "=") {
      const ex = x.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
      if (!ex || /[^0-9+\-*/().]/.test(ex)) return setX("");
      try {
        // Only digits/operators reach here (checked above).
        const v = Function(`"use strict";return (${ex})`)();
        return setX(Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "");
      } catch {
        return setX("");
      }
    }
    setX((s) => s + k);
  }
  return (
    <SheetFrame icon="🧮" k="calc" lang={lang} onClose={onClose}>
      <div className="qr-cd">{x || "0"}</div>
      <div className="qr-ck">
        {keys.map((k) => (
          <button key={k} className={"÷×−+".includes(k) ? "op" : k === "=" ? "eq" : ""} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
    </SheetFrame>
  );
}


// ---------------------------------------------------------------------------
// Reports, print, share, accountant CSV, language + owner settings
// ---------------------------------------------------------------------------
function ReportSheet({
  day: todayBundle,
  lang,
  setLang,
  layout,
  setLayout,
  onEditFavs,
  isOwner,
  onClose,
  toast,
  reloadToday,
}: {
  day: DayBundle;
  lang: LangMode;
  setLang: (m: LangMode) => void;
  layout: LayoutMode;
  setLayout: (l: LayoutMode) => void;
  onEditFavs: () => void;
  isOwner: boolean;
  onClose: () => void;
  toast: (m: string) => void;
  reloadToday: () => Promise<void>;
}) {
  const [date, setDate] = useState(todayBundle.date);
  const [day, setDay] = useState<DayBundle>(todayBundle);
  const [month, setMonth] = useState<Entry[]>([]);
  const [pigmee, setPigmee] = useState(String(todayBundle.config.pigmeeDefault));

  useEffect(() => {
    if (date === todayBundle.date) {
      setDay(todayBundle);
      return;
    }
    api<{ data: DayBundle }>(`/api/register?date=${date}`)
      .then((r) => setDay(r.data))
      .catch((e) => toast(e.message));
  }, [date, todayBundle, toast]);

  useEffect(() => {
    const m = date.slice(0, 7);
    const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    api<{ data: Entry[] }>(`/api/register/range?from=${m}-01&to=${m}-${String(last).padStart(2, "0")}`)
      .then((r) => setMonth(r.data))
      .catch(() => setMonth([]));
  }, [date]);

  const t = dayTotals(day.entries, day.jwEvents);
  const fc = freshCrushTotals(day.entries);
  const mfc = freshCrushTotals(month);
  const seedName = (k: string) => {
    const it = itemsFor("FRESH_CRUSH", day.config).find((i) => i.key === k);
    return it ? it.en : k;
  };

  // What the accountant enters in Vyapar at day closing for fresh crush sales.
  const vyaparText = () => {
    const list = day.entries.filter((e) => e.kind === "FRESH_CRUSH");
    let v = `FRESH CRUSH (our seed) — ${day.date}\nFor Vyapar at day closing. Check against the counter before entering.\n`;
    list.forEach((e, i) => {
      const d = normalizeFreshCrush(e.details);
      if (!d) return;
      const name = e.item === "other" || !itemsFor("FRESH_CRUSH", day.config).some((x) => x.key === e.item) ? e.itemLabel || e.item || "Oil" : seedName(e.item || "");
      const st = freshCrushStats(d);
      v += `\n#${i + 1}  ${hm(e.createdAt)}  ${e.partyName || "Cash customer"}\n`;
      v += `  1) SALE: ${name} oil (fresh crushed) ${e.qty ?? "-"} ${e.unit || ""} @ ₹${e.rateInr ?? "-"} = ₹${e.amountInr}  [${e.paymentMode}]\n`;
      v += `  2) MANUFACTURE / STOCK: ${name} seed −${d.seedKg} kg  →  ${name} oil +${d.oilKg} kg` + (d.cakeKg ? `, ${name} oil cake +${d.cakeKg} kg` : "") + `  (yield ${st.yieldPct.toFixed(1)}%)\n`;
      if (d.extraKg > 0) v += `  3) TRANSFER: ${d.extraKg} kg ${name} oil → ${d.extraTo || "tank / barrel"}\n`;
      if (st.lossFlag) v += `  ⚠ Loss ${st.lossKg.toFixed(2)} kg (${st.lossPct.toFixed(1)}%) is over 2% — recheck weights\n`;
    });
    v += `\nDAY TOTALS: ${fc.count} crushing(s), sales ₹${Math.round(fc.amount)}\n`;
    for (const [k, x] of Object.entries(fc.bySeed)) {
      v += `  ${seedName(k)}: seed ${x.seedKg} kg → oil ${x.oilKg} kg, to tank ${x.extraKg} kg, cake ${x.cakeKg} kg\n`;
    }
    return v;
  };
  const mt = dayTotals(month);
  const kinds = Object.keys(t.byKind) as RegisterKind[];
  const mkinds = Object.keys(mt.byKind) as RegisterKind[];
  const cls = (k: RegisterKind) => (KIND_SIDE[k] === "in" ? "qr-g" : KIND_SIDE[k] === "out" ? "qr-r" : "qr-o");
  const label = (k: RegisterKind) => `${KIND_ICON[k]} ${word(k as WordKey, lang)}`;
  const itemName = (e: Entry) => {
    if (e.totalSale) return "Total sale";
    const it = itemsFor(e.kind, day.config).find((i) => i.key === e.item);
    return it ? it.en : e.itemLabel || e.item || "";
  };

  const [rcpt, setRcpt] = useState<ReceiptDoc | null>(null);
  const text = () => {
    const bl = (k: WordKey) => (lang === "both" ? `${words(k, "en").main}/${words(k, "kn").main}` : word(k, lang));
    let s = `MAHADEV TRADERS — ${day.date}\n${bl("opening")}: ${rs(day.opening.value)}\n\n`;
    for (const e of day.entries) {
      s += `${hm(e.createdAt)} ${KIND_SIDE[e.kind] === "in" ? "+" : "-"} ${bl(e.kind as WordKey)} ${itemName(e)}${
        e.qty ? ` ${e.qty}${e.unit || ""}` : ""
      }${e.partyName ? " " + e.partyName : ""} ${rs(e.amountInr)} ${e.paymentMode}\n`;
    }
    s += `\n${bl("cashIn")} ${rs(t.cashIn)} | ${bl("cashOut")} ${rs(t.cashOut)} | ${bl("jwCash")} +${rs(t.jwIn)} -${rs(t.jwOut)}\n`;
    s += `Pigmee ${rs(t.pigmee)} | Sahil ${rs(t.ownerDraw)} | UPI ${rs(t.upiIn)}/${rs(t.upiOut)} | Udhaar ${rs(t.creditGiven)}\n`;
    (["AFTERNOON", "NIGHT"] as const).forEach((s2, i) => {
      const x = day.tallies[s2];
      if (x) s += `Tally ${i + 1}: counted ${rs(x.counterCashInr)} vs system ${rs(x.systemCashInr)}\n`;
    });
    return s;
  };

  async function copy(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast(word("copied", lang));
    } catch {
      window.prompt("Copy:", s);
    }
  }

  const csv = () =>
    toCsv(
      day.entries.map((e) => ({
        date: e.date,
        time: hm(e.createdAt),
        side: KIND_SIDE[e.kind],
        type: words(e.kind as WordKey, "en").main,
        item: itemName(e),
        qty: e.qty ?? "",
        unit: e.qty ? e.unit || "kg" : "",
        rate: e.rateInr ?? "",
        party: e.partyName || "",
        mode: e.paymentMode,
        amount: e.amountInr,
        notes: [e.notes, e.drawKind, e.kind === "FRESH_CRUSH" ? freshCrushLine(e.details, "en") : ""].filter(Boolean).join(" "),
      }))
    );

  async function saveOwner(patch: Partial<RegisterConfigData>) {
    try {
      await api("/api/register/config", { method: "PUT", body: JSON.stringify(patch) });
      toast(word("saved", lang));
      reloadToday();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    }
  }

  const customItems = Object.entries(day.config.customItems).flatMap(([k, list]) =>
    (list || []).map((c) => ({ kind: k as RegisterKind, ...c }))
  );

  return (
    <SheetFrame icon="🖨️" k="reports" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <label>
          <Txt k="day" lang={lang} />
        </label>
        <input className="qr-txt" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="qr-card" style={{ marginTop: 0 }}>
        <div className="qr-srow">
          <span>{word("opening", lang)}</span>
          <b>{rs(day.opening.value)}</b>
        </div>
        {kinds.length ? (
          kinds.map((k) => (
            <div className="qr-srow" key={k}>
              <span>{label(k)}</span>
              <b className={cls(k)}>{rs(t.byKind[k])}</b>
            </div>
          ))
        ) : (
          <div className="qr-empty">{word("none", lang)}</div>
        )}
        <div className="qr-srow">
          <span><G e="💵" /> {word("cashIn", lang)}</span>
          <b className="qr-g">{rs(t.cashIn)}</b>
        </div>
        <div className="qr-srow">
          <span><G e="💵" /> {word("cashOut", lang)}</span>
          <b className="qr-r">{rs(t.cashOut)}</b>
        </div>
        <div className="qr-srow">
          <span><G e="⚙️" /> {word("jwCash", lang)}</span>
          <b>
            +{rs(t.jwIn)} / −{rs(t.jwOut)}
          </b>
        </div>
        <div className="qr-srow">
          <span><G e="📱" /> UPI</span>
          <b>
            {rs(t.upiIn)} / {rs(t.upiOut)}
          </b>
        </div>
        <div className="qr-srow">
          <span><G e="📒" /> {word("CREDIT", lang)}</span>
          <b>{rs(t.creditGiven)}</b>
        </div>
      </div>
      <div className="qr-btnrow">
        <button className="qr-btn2" onClick={() => window.print()}>
          <G e="🖨️" /> {word("print", lang)}
        </button>
        <ShareButton text={text()} title={`Day summary ${day.date}`} className="qr-btn2" url={false} />
        <button className="qr-btn2" onClick={() => setRcpt({ title: "DAY SUMMARY", when: day.date, rows: [], pre: text().replace(/^MAHADEV TRADERS — [^\n]*\n/, "") })} title="Print on the receipt printer">
          <G e="🧾" /> {lang === "kn" ? "ರಸೀದಿ ಪ್ರಿಂಟರ್" : "Slip printer"}
        </button>
        {rcpt && <ReceiptSheet doc={rcpt} onClose={() => setRcpt(null)} />}
        <button
          className="qr-btn2"
          onClick={() => {
            const s = text();
            if (navigator.share) navigator.share({ text: s }).catch(() => undefined);
            else copy(s);
          }}
        >
          <G e="📤" /> {word("share", lang)}
        </button>
      </div>
      <button className="qr-btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => copy(csv())}>
        <G e="📋" /> {word("csv", lang)}
      </button>

      <div className="qr-card">
        <h2><G e="🫗" /> {word("fcReport", lang)}</h2>
        {fc.count ? (
          <>
            {Object.entries(fc.bySeed).map(([k, x]) => (
              <div className="qr-srow" key={k}>
                <span>
                  {seedName(k)} ×{x.count}
                  <span className="qr-sub">
                    {word("fcSeedShort", lang)} {kg(x.seedKg)} → {word("fcOilShort", lang)} {kg(x.oilKg)} (
                    {x.seedKg ? ((x.oilKg / x.seedKg) * 100).toFixed(1) : "0"}%) · {word("fcTankShort", lang)} {kg(x.extraKg)} ·{" "}
                    {word("fcCakeShort", lang)} {kg(x.cakeKg)}
                  </span>
                </span>
                <b className="qr-g">{rs(x.amount)}</b>
              </div>
            ))}
            {Object.entries(fc.extraByTank).map(([tank, q]) => (
              <div className="qr-srow" key={tank}>
                <span><G e="🛢️" /> → {tank}</span>
                <b>{kg(q)}</b>
              </div>
            ))}
            {fc.flagged > 0 && (
              <div className="qr-srow">
                <span className="qr-r"><G e="⚠️" /> {fc.flagged} {word("fcFlagged", lang)}</span>
              </div>
            )}
            <button className="qr-btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => copy(vyaparText())}>
              <G e="🧾" /> {word("vyapar", lang)}
            </button>
          </>
        ) : (
          <div className="qr-empty">{word("none", lang)}</div>
        )}
        {mfc.count > 0 && (
          <div className="qr-srow">
            <span>
              {word("month", lang)}: ×{mfc.count}
              <span className="qr-sub">
                {Object.entries(mfc.bySeed)
                  .map(([k, x]) => `${seedName(k)} ${kg(x.seedKg)}→${kg(x.oilKg)}`)
                  .join(" · ")}
              </span>
            </span>
            <b className="qr-g">{rs(mfc.amount)}</b>
          </div>
        )}
      </div>

      <div className="qr-card">
        <h2>
          {word("month", lang)} ({date.slice(0, 7)})
        </h2>
        {mkinds.length ? (
          mkinds.map((k) => (
            <div className="qr-srow" key={k}>
              <span>{label(k)}</span>
              <b className={cls(k)}>{rs(mt.byKind[k])}</b>
            </div>
          ))
        ) : (
          <div className="qr-empty">{word("none", lang)}</div>
        )}
      </div>

      <div className="qr-card">
        <h2>
          <G e="🗣️" /> <Txt k="language" lang={lang} />
        </h2>
        <Chips
          lang={lang}
          value={lang}
          onPick={setLang}
          options={[
            { key: "both", icon: "🇮🇳", en: "Both", kn: "ಎರಡೂ" },
            { key: "en", icon: "A", en: "English only", kn: "ಇಂಗ್ಲಿಷ್ ಮಾತ್ರ" },
            { key: "kn", icon: "ಅ", en: "Kannada only", kn: "ಕನ್ನಡ ಮಾತ್ರ" },
          ]}
        />
      </div>

      <div className="qr-card">
        <h2>
          <G e="🖥️" /> <Txt k="layout" lang={lang} />
        </h2>
        <Chips
          lang={lang}
          value={layout}
          onPick={setLayout}
          options={[
            { key: "auto", icon: "⇆", en: "Auto (side by side on big screens)", kn: "ಸ್ವಯಂ (ದೊಡ್ಡ ಪರದೆಯಲ್ಲಿ ಪಕ್ಕ-ಪಕ್ಕ)" },
            { key: "side", icon: "◧", en: "Always side by side", kn: "ಯಾವಾಗಲೂ ಪಕ್ಕ-ಪಕ್ಕ" },
            { key: "stack", icon: "☰", en: "One column", kn: "ಒಂದೇ ಕಾಲಮ್" },
          ]}
        />
        <div className="qr-hint">{word("layoutHint", lang)}</div>
        <button className="qr-btn2" style={{ width: "100%", marginTop: 8 }} onClick={onEditFavs}>
          <G e="⭐" /> {word("editFavs", lang)}
        </button>
      </div>

      {isOwner && (
        <div className="qr-card">
          <h2><G e="⚙️" /> {word("ownerOnly", lang)}</h2>
          <div className="qr-srow">
            <span>{word("pigmeeDefault", lang)}</span>
            <input
              className="qr-txt"
              style={{ width: 120, padding: "4px 8px" }}
              type="number"
              inputMode="decimal"
              value={pigmee}
              onChange={(e) => setPigmee(e.target.value)}
              onBlur={() => saveOwner({ pigmeeDefault: Number(pigmee) || 0 })}
            />
          </div>
          <div className="qr-srow">
            <span>Default language (new devices)</span>
            <select
              className="qr-txt"
              style={{ width: 140, padding: "4px 8px" }}
              value={day.config.defaultLangMode}
              onChange={(e) => saveOwner({ defaultLangMode: e.target.value as LangMode })}
            >
              <option value="both">Both</option>
              <option value="en">English</option>
              <option value="kn">Kannada</option>
            </select>
          </div>
          <span className="qr-lbl" style={{ marginTop: 8 }}>
            <G e="📚" /> {word("library", lang)}
          </span>
          {customItems.length ? (
            <div className="qr-chips">
              {customItems.map((c) => (
                <button
                  key={c.kind + c.key}
                  className="qr-chip"
                  onClick={() =>
                    saveOwner({
                      customItems: {
                        ...day.config.customItems,
                        [c.kind]: (day.config.customItems[c.kind] || []).filter((x) => x.key !== c.key),
                      },
                    })
                  }
                >
                  <G e="⭐" /> {c.label} ✕<span className="qr-sub">{word(c.kind as WordKey, lang)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="qr-empty">{word("none", lang)}</div>
          )}
        </div>
      )}

      {/* thermal print slip — only visible when printing */}
      <div className="qr-print">
        <h4>MAHADEV TRADERS</h4>
        <div style={{ textAlign: "center" }}>{day.date}</div>
        <hr />
        <div className="pr">
          <span>Opening</span>
          <span>{rs(day.opening.value)}</span>
        </div>
        <hr />
        {day.entries.map((e) => (
          <div className="pr" key={e.id}>
            <span>
              {hm(e.createdAt)} {words(e.kind as WordKey, "en").main} {itemName(e)}
              {e.qty ? ` ${e.qty}${e.unit || ""}` : ""}
            </span>
            <span>
              {KIND_SIDE[e.kind] === "in" ? "+" : "-"}
              {rs(e.amountInr)}
              {(e.paymentMode !== "CASH" || splitInfo(e.details)) && KIND_SIDE[e.kind] !== "oth" ? ` ${payLabel(e, "en")}` : ""}
            </span>
          </div>
        ))}
        <hr />
        <div className="pr">
          <span>Cash in / out</span>
          <span>
            {rs(t.cashIn)} / {rs(t.cashOut)}
          </span>
        </div>
        <div className="pr">
          <span>Job-work cash</span>
          <span>
            +{rs(t.jwIn)} / -{rs(t.jwOut)}
          </span>
        </div>
        <div className="pr">
          <span>Pigmee + Sahil</span>
          <span>{rs(t.pigmee + t.ownerDraw)}</span>
        </div>
        <div className="pr">
          <span>UPI in / out</span>
          <span>
            {rs(t.upiIn)} / {rs(t.upiOut)}
          </span>
        </div>
        <div className="pr">
          <span>Udhaar given</span>
          <span>{rs(t.creditGiven)}</span>
        </div>
        <hr />
        {(["AFTERNOON", "NIGHT"] as const).map((s, i) => {
          const x = day.tallies[s];
          return x ? (
            <div className="pr" key={s}>
              <span>Tally {i + 1}</span>
              <span>
                {rs(x.counterCashInr)} (sys {rs(x.systemCashInr)})
              </span>
            </div>
          ) : null;
        })}
      </div>
    </SheetFrame>
  );
}


// ---------------------------------------------------------------------------
// Scan slip / bill — photo → AI reads the fields → person checks → saved and
// filed in Google Drive (06_Scans_&_Proofs/<type>/<month>), optionally turned
// straight into a Purchase / Expense entry with the scan attached.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Smart entry: say / type / photograph what happened → the right form opens
// pre-filled (still needs Save). The second tab only ANSWERS questions.
// ---------------------------------------------------------------------------
type SpeechLang = "en-IN" | "kn-IN" | "hi-IN";

const SPEECH_KEY = "qr-smart-speech";


function SmartSheet({
  lang,
  date,
  day,
  initText,
  auto,
  onClose,
  onOpen,
  toast,
}: {
  lang: LangMode;
  date: string;
  day: DayBundle;
  initText?: string;
  auto?: boolean;
  onClose: () => void;
  onOpen: (kind: RegisterKind, init: EntryInit) => void;
  toast: (m: string) => void;
}) {
  const [tab, setTab] = useState<"fill" | "ask">("fill");
  const [text, setText] = useState(initText || "");
  const [photo, setPhoto] = useState<Captured | null>(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [pickedKind, setPickedKind] = useState<RegisterKind | null>(null);
  const [noAi, setNoAi] = useState(false);
  const [empty, setEmpty] = useState(false);
  // speech
  const [speechLang, setSpeechLang] = useState<SpeechLang>(lang === "kn" ? "kn-IN" : "en-IN");
  const [micOk, setMicOk] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  // ask
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setMicOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    try {
      const v = localStorage.getItem(SPEECH_KEY);
      if (v === "en-IN" || v === "kn-IN" || v === "hi-IN") setSpeechLang(v);
    } catch {}
  }, []);
  useEffect(() => () => recRef.current?.stop(), []);

  // The form is always worked out from what the AI read + the kind the person confirmed.
  const draft: RegisterDraft | null = useMemo(() => (fields ? mapRegisterFill(fields, day.config, pickedKind) : null), [fields, day.config, pickedKind]);
  const kind = draft?.kind || null;

  async function run(t: string, ph: Captured | null) {
    if (!t.trim() && !ph) return;
    setBusy(true);
    setFields(null);
    setPickedKind(null);
    setNoAi(false);
    setEmpty(false);
    try {
      const [head, b64] = ph ? ph.dataUrl.split(",") : ["", ""];
      const res = await fetch("/api/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desk: "register",
          text: t,
          imageBase64: ph ? b64 : undefined,
          imageMime: ph ? head.slice(5, head.indexOf(";")) : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || !json.fields) {
        setNoAi(true);
        return;
      }
      const f = json.fields as Record<string, unknown>;
      if (mapRegisterFill(f, day.config).empty) setEmpty(true);
      else setFields(f);
    } catch {
      setNoAi(true);
    } finally {
      setBusy(false);
    }
  }

  // A sentence the quick parser could not read arrives here already typed: read it at once.
  const ranAuto = useRef(false);
  useEffect(() => {
    if (auto && initText && !ranAuto.current) {
      ranAuto.current = true;
      void run(initText, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMic() {
    if (listening) return recRef.current?.stop();
    const w = window as unknown as Record<string, new () => {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    }>;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = speechLang;
    rec.interimResults = true;
    const base = text.trim() ? text.trim() + " " : "";
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(base + t);
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") toast(`🎤 ${e.error}`);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    try {
      const dataUrl = await preparePhoto(f);
      const geo = geoOn() ? await getGeo() : null;
      const cap: Captured = { kind: "BILL", dataUrl, capturedAt: new Date().toISOString(), geo };
      setPhoto(cap);
      void run(text, cap);
    } catch {
      toast(word("smartNoAi", lang));
    }
  }

  async function ask(promptId?: string) {
    const q = question.trim();
    if (!promptId && !q) return;
    setAsking(true);
    setAnswer("");
    setAskErr("");
    try {
      const r = await api<{ answer?: string }>("/api/ai/desk", {
        method: "POST",
        body: JSON.stringify({ desk: "register", ...(promptId ? { promptId } : { question: q }), date, lang }),
      });
      setAnswer(r.answer || "");
    } catch (e) {
      setAskErr(e instanceof Error ? e.message : word("smartNoAi", lang));
    } finally {
      setAsking(false);
    }
  }

  const summary = draft
    ? [
        draft.init.item === "other" ? draft.init.otherName : draft.init.item,
        draft.init.qty ? `${draft.init.qty} ${draft.init.unit || ""}`.trim() : "",
        draft.init.rate ? `@ ₹${draft.init.rate}` : "",
        draft.init.amount ? `= ₹${draft.init.amount}` : "",
        draft.init.mode || "",
        draft.init.party || "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <SheetFrame icon="✨" k="smart" lang={lang} onClose={onClose}>
      <Chips
        compact
        lang={lang}
        value={tab}
        onPick={setTab}
        options={[
          { key: "fill", icon: "✍️", en: word("smartFillTab", "en"), kn: word("smartFillTab", "kn") },
          { key: "ask", icon: "💬", en: word("smartAskTab", "en"), kn: word("smartAskTab", "kn") },
        ]}
      />

      {tab === "fill" ? (
        <>
          <div className="qr-hint">
            <Txt k="smartHint" lang={lang} />
          </div>
          <textarea
            className="qr-smart-ta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={word("smartPlaceholder", lang)}
            aria-label={word("smart", lang)}
          />
          <div className="qr-smart-row">
            {micOk && (
              <button type="button" className="qr-btn2" onClick={toggleMic}>
                <G e="🎤" /> {word(listening ? "smartStop" : "smartSpeak", lang)}
              </button>
            )}
            <button type="button" className="qr-btn2" onClick={() => fileRef.current?.click()}>
              <G e="📷" /> <Txt k="smartPhoto" lang={lang} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
          </div>
          {micOk && (
            <div className="qr-f">
              <select
                className="qr-txt"
                value={speechLang}
                aria-label="Speech language"
                onChange={(e) => {
                  const v = e.target.value as SpeechLang;
                  setSpeechLang(v);
                  try {
                    localStorage.setItem(SPEECH_KEY, v);
                  } catch {}
                }}
              >
                <option value="en-IN">English</option>
                <option value="kn-IN">ಕನ್ನಡ</option>
                <option value="hi-IN">हिन्दी</option>
              </select>
            </div>
          )}
          {photo && (
            <div className="qr-f qr-scanview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt="" style={{ maxHeight: 120 }} />
              <div className="qr-hint"><G e="📎" /> {word("smartPhotoKept", lang)}</div>
            </div>
          )}
          <button type="button" className="qr-save" onClick={() => run(text, photo)} disabled={busy || (!text.trim() && !photo)}>
            <G e="✨" /> {word(busy ? "smartReading" : "smartGo", lang)}
          </button>

          {noAi && <div className="qr-chk warn">{word("smartNoAi", lang)}</div>}
          {empty && <div className="qr-chk info">{word("smartNothing", lang)}</div>}

          {draft && (
            <>
              <div className="qr-draft">
                {kind ? `${KIND_ICON[kind]} ${word(kind as WordKey, lang)}` : word("smartWhatKind", lang)}
                {summary && <small>{summary}</small>}
                {text.trim() && (
                  <small>
                    {word("smartHeard", lang)}: “{text.trim().slice(0, 120)}”
                  </small>
                )}
              </div>
              {!kind && (
                <div className="qr-chiprow">
                  {REGISTER_FILL_KINDS.map((k) => (
                    <button key={k} type="button" className="qr-chip" onClick={() => setPickedKind(k)}>
                      <G e={KIND_ICON[k]} /> {word(k as WordKey, lang)}
                    </button>
                  ))}
                </div>
              )}
              {kind && (
                <button
                  type="button"
                  className="qr-save"
                  onClick={() => onOpen(kind, { ...draft.init, ...(photo ? { photo } : {}) })}
                >
                  <G e="➜" /> <Txt k="smartOpen" lang={lang} />
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="qr-chiprow">
            {DESK_PROMPTS.register.map((p) => (
              <button key={p.id} type="button" className="qr-chip" disabled={asking} onClick={() => ask(p.id)}>
                {lang === "kn" && p.kn ? p.kn : p.label}
                {lang === "both" && p.kn && <span className="qr-sub">{p.kn}</span>}
              </button>
            ))}
          </div>
          <div className="qr-coderow qr-f">
            <input
              className="qr-txt"
              value={question}
              placeholder={word("askPlaceholder", lang)}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void ask();
                }
              }}
            />
            <button type="button" className="qr-btn2" disabled={asking || !question.trim()} onClick={() => ask()}>
              <Txt k="askGo" lang={lang} />
            </button>
          </div>
          {asking && <div className="qr-hint">{word("askThinking", lang)}</div>}
          {askErr && <div className="qr-chk warn">{askErr}</div>}
          {answer && <div className="qr-answer">{answer}</div>}
          <div className="qr-hint">
            <Txt k="askNote" lang={lang} />
          </div>
        </>
      )}
    </SheetFrame>
  );
}
