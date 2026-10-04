"use client";

// Quick Register — the manager's one-screen, icon-first, bilingual counter
// cash book. Talks only to /api/register/* and the existing /api/job-work/*
// routes, so every entry lands in the same Postgres database as the rest of
// Second Brain Desk.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CAN_TYPES,
  STANDARD_RATE,
  defaultPaySplit,
  expectedSettlement,
  expectedSettlementWithRate,
  type CakeOwnership,
  type CanKey,
} from "@/lib/calculations";
import {
  DENOMINATIONS,
  KIND_SIDE,
  UNITS,
  businessDate,
  dayTotals,
  denominationTotal,
  freshCrushStats,
  freshCrushTotals,
  itemsFor,
  normalizeFreshCrush,
  suggestedExtraKg,
  MASS_BALANCE_TOLERANCE_PCT,
  rateKey,
  systemCash,
  toCsv,
  type CashEvent,
  type LangMode,
  type Mode,
  type RegisterConfigData,
  type RegisterEntryLike,
  type RegisterKind,
} from "@/lib/register";
import { pairLabel, word, words, type WordKey } from "@/lib/registerI18n";

// ---------------------------------------------------------------------------
// Types returned by GET /api/register
// ---------------------------------------------------------------------------
interface Entry extends RegisterEntryLike {
  id: string;
  date: string;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  totalSale: boolean;
  drawKind: string | null;
  partyName: string | null;
  notes: string | null;
  createdByName: string | null;
  details?: unknown;
  createdAt: string;
}
interface JobWork {
  id: string;
  customer: string;
  vehicleNo: string | null;
  seedKg: number;
  cakeOwnership: CakeOwnership;
  advanceCustomerInr: number;
  advanceAutoInr: number;
  cans: Partial<Record<CanKey, { qty: number; rate: number }>> | null;
  notes: string | null;
  settled: boolean;
  settlementAmountInr: number | null;
  settledAt: string | null;
  createdAt: string;
}
interface Tally {
  id: string;
  session: "AFTERNOON" | "NIGHT";
  counterCashInr: number;
  systemCashInr: number;
  cashDiffInr: number;
  cashMismatch: boolean;
  createdAt: string;
}
interface DayBundle {
  date: string;
  config: RegisterConfigData;
  opening: { value: number; source: "override" | "lastClosing" | "none"; fromDate?: string };
  entries: Entry[];
  jwEvents: CashEvent[];
  systemCashNow: number;
  tallies: { AFTERNOON: Tally | null; NIGHT: Tally | null };
  jobWork: JobWork[];
  khaliKg: number;
  topParties: string[];
  allParties: string[];
}

type Sheet =
  | { t: "entry"; kind: RegisterKind }
  | { t: "jw"; id?: string }
  | { t: "fresh" }
  | { t: "jwpay"; id: string }
  | { t: "count" }
  | { t: "calc" }
  | { t: "report" }
  | null;

// Per-device screen preferences (layout, favourite tiles, folded sections).
type TileKey =
  | "SALE"
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
  | "calc"
  | "reports";
type SectionKey = "summary" | "entries" | "jobwork";
// What the always-open Workspace card shows.
type WorkTool = "calc" | "notepad" | "FRESH_CRUSH" | "SALE" | "EXPENSE" | "PURCHASE" | "jwNew" | "count";
type LayoutMode = "auto" | "side" | "stack";
interface Prefs {
  layout: LayoutMode;
  favs: string[];
  closed: string[];
  work: WorkTool;
}
const DEFAULT_PREFS: Prefs = { layout: "auto", favs: [], closed: [], work: "calc" };
const PREFS_KEY = "qr-prefs";

// "modal" = bottom sheet over the page (phones / one-column layout);
// "inline" = form opens in the right-hand panel, side by side.
const SheetModeCtx = createContext<"modal" | "inline">("modal");

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

const KIND_ICON: Record<RegisterKind, string> = {
  SALE: "💰",
  FRESH_CRUSH: "🫗",
  UDHAAR_IN: "🙌",
  PURCHASE: "🛒",
  EXPENSE: "🧾",
  PAYMENT: "🤝",
  PIGMEE: "🏦",
  OWNER_DRAW: "🧔",
};

const rs = (n: number | null | undefined) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const hm = (ts: string | number | Date) =>
  new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const todayIST = () => businessDate(Date.now());

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;

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

// ---------------------------------------------------------------------------
// Small bilingual building blocks
// ---------------------------------------------------------------------------
function Txt({ k, lang }: { k: WordKey; lang: LangMode }) {
  const w = words(k, lang);
  return (
    <>
      {w.main}
      {w.sub && <span className="qr-sub">{w.sub}</span>}
    </>
  );
}

function Chips<V extends string>({
  options,
  value,
  onPick,
  lang,
}: {
  options: { key: V; icon: string; en: string; kn: string }[];
  value: V | null;
  onPick: (v: V) => void;
  lang: LangMode;
}) {
  return (
    <div className="qr-chips" role="radiogroup">
      {options.map((o) => {
        const l = pairLabel(o.en, o.kn, lang);
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            className={`qr-chip${value === o.key ? " sel" : ""}`}
            onClick={() => onPick(o.key)}
          >
            <span className="ci" aria-hidden>
              {o.icon}
            </span>
            {l.main}
            {l.sub && <span className="qr-sub">{l.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SheetFrame({
  icon,
  k,
  lang,
  onClose,
  children,
}: {
  icon: string;
  k: WordKey;
  lang: LangMode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const mode = useContext(SheetModeCtx);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      {mode === "modal" && <div className="qr-veil" onClick={onClose} />}
      <div
        className={`qr-sheet${mode === "inline" ? " inline" : ""}`}
        role={mode === "modal" ? "dialog" : "region"}
        aria-modal={mode === "modal" ? true : undefined}
      >
        <div className="qr-sh">
          <span className="ic" aria-hidden>
            {icon}
          </span>
          <h3>
            <Txt k={k} lang={lang} />
          </h3>
          <button className="qr-x" onClick={onClose} aria-label={word("close", lang)}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function PartyField({
  value,
  onChange,
  top,
  all,
  lang,
  label = "who",
}: {
  value: string;
  onChange: (v: string) => void;
  top: string[];
  all: string[];
  lang: LangMode;
  label?: WordKey;
}) {
  return (
    <div className="qr-f">
      <label>
        <Txt k={label} lang={lang} />
      </label>
      {top.length > 0 && (
        <div className="qr-chips" style={{ marginBottom: 6 }}>
          {top.map((n) => (
            <button key={n} type="button" className={`qr-chip${value === n ? " sel" : ""}`} onClick={() => onChange(n)}>
              👤 {n}
            </button>
          ))}
        </div>
      )}
      <input
        className="qr-txt"
        list="qr-parties"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <datalist id="qr-parties">
        {all.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function QuickRegister() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";

  const [date, setDate] = useState(todayIST);
  const [day, setDay] = useState<DayBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editFavs, setEditFavs] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (raw && typeof raw === "object") setPrefsState({ ...DEFAULT_PREFS, ...raw });
      else setPrefsState({ ...DEFAULT_PREFS, favs: ["SALE", "EXPENSE", "jwNew"] });
    } catch {
      /* storage blocked — keep defaults */
    }
  }, []);
  const setPrefs = useCallback((fn: (p: Prefs) => Prefs) => {
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
  const sideBySide = canSide && (prefs.layout === "side" || (prefs.layout === "auto" && wide));
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lang, setLangState] = useState<LangMode>("both");
  const [now, setNow] = useState(Date.now());

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(null), 1800);
  }, []);

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

  // Clock + roll over to the new business day at midnight.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const t = todayIST();
      setDate((d) => (d !== t && !sheet ? t : d));
    }, 30000);
    return () => window.clearInterval(id);
  }, [sheet]);

  const dbOffline = !!loadError && /database|DATABASE_URL/i.test(loadError);
  const entries = useMemo(() => day?.entries || [], [day]);
  const totals = useMemo(() => dayTotals(entries, day?.jwEvents || []), [entries, day]);
  const counterNow = day?.systemCashNow ?? 0;

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
    if (e.totalSale) return "🧾 " + word("totalSale", lang);
    if (!e.item) return "";
    const it = day ? itemsFor(e.kind, day.config).find((i) => i.key === e.item) : null;
    if (it) return `${it.icon} ${lang === "kn" ? it.kn : it.en}`;
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
    return (
      <button key={e.id} className="qr-ent" onClick={() => remove(e)} title={word("deleteQ", lang)}>
        {KIND_ICON[e.kind]} <span className="m">{hm(e.createdAt)}</span>
        <br />
        {word(e.kind as WordKey, lang)}
        {bits ? " — " + bits : ""}
        <span className="a">
          {rs(e.amountInr)}
          {e.paymentMode !== "CASH" && KIND_SIDE[e.kind] !== "oth" && (
            <span className="m"> ({word(e.paymentMode as WordKey, lang)})</span>
          )}
        </span>
      </button>
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
    calc: { k: "calc", icon: "🧮", group: "tool", open: () => setSheet({ t: "calc" }) },
    reports: { k: "reports", icon: "🖨️", group: "tool", open: () => setSheet({ t: "report" }) },
  };

  const toggleFav = (key: TileKey) =>
    setPrefs((p) => ({
      ...p,
      favs: p.favs.includes(key) ? p.favs.filter((f) => f !== key) : [...p.favs, key],
    }));

  const Tile = ({ id, extraClass = "" }: { id: TileKey; extraClass?: string }) => {
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
          {t.icon}
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
  const nextLang: Record<LangMode, LangMode> = { both: "en", en: "kn", kn: "both" };
  const langLabel: Record<LangMode, string> = { both: "EN+ಕ", en: "EN", kn: "ಕನ್ನಡ" };
  const nextLayout: Record<LayoutMode, LayoutMode> = { auto: "side", side: "stack", stack: "auto" };
  const layoutLabel: Record<LayoutMode, string> = { auto: "⇆ Auto", side: "⇆ Side", stack: "☰ One" };
  const favKeys = prefs.favs.filter((f): f is TileKey => f in TILES);

  // ----------------------------- blocks --------------------------------
  const favouritesBlock =
    favKeys.length > 0 || editFavs ? (
      <div className="qr-favs-wrap">
        <div className="qr-head qr-favs-head">
          <span>
            ⭐ <Txt k="favourites" lang={lang} />
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
            <span aria-hidden>⬇</span>
          </div>
          <Tile id="SALE" />
          <Tile id="FRESH_CRUSH" />
          <Tile id="UDHAAR_IN" />
        </div>
        <div className="qr-col out">
          <div className="qr-head">
            <span>
              <Txt k="moneyOut" lang={lang} />
            </span>
            <span aria-hidden>⬆</span>
          </div>
          <Tile id="PURCHASE" />
          <Tile id="EXPENSE" />
          <Tile id="PAYMENT" />
        </div>
      </div>

      <div className="qr-strip jw">
        <div className="qr-head">
          <span>
            ⚙️ <Txt k="jobWork" lang={lang} />
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
        <Tile id="calc" />
        <Tile id="reports" />
      </div>
    </>
  );

  const summaryBlock = (
    <Section id="summary" title={<Txt k="summary" lang={lang} />} right={<b>{rs(counterNow)}</b>}>
      <div className="qr-srow">
        <span>
          <Txt k="opening" lang={lang} />
        </span>
        <b>{rs(day?.opening.value)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="cashIn" lang={lang} />
        </span>
        <b className="qr-g">+ {rs(totals.cashIn)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="cashOut" lang={lang} />
        </span>
        <b className="qr-r">− {rs(totals.cashOut)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <Txt k="jwCash" lang={lang} />
        </span>
        <b>
          <span className="qr-g">+{rs(totals.jwIn)}</span> <span className="qr-r">−{rs(totals.jwOut)}</span>
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
        <b className="qr-o">− {rs(totals.pigmee + totals.ownerDraw)}</b>
      </div>
      <div className="qr-srow">
        <span>
          <b>
            <Txt k="inCounter" lang={lang} />
          </b>
        </span>
        <b className="qr-big">{rs(counterNow)}</b>
      </div>
      <div className="qr-srow">
        <span>
          📱 UPI <b className="qr-g">{rs(totals.upiIn)}</b> · <b className="qr-r">{rs(totals.upiOut)}</b>
        </span>
        <span>
          📒 {word("CREDIT", lang)} <b>{rs(totals.creditGiven)}</b>
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

  const entriesBlock = (
    <Section id="entries" title={<Txt k="entries" lang={lang} />} right={<span className="qr-m">{entries.length}</span>}>
      <div className="qr-lists">
        <div className="qr-lcol in">
          <div className="qr-lh">
            <span>⬇ {word("moneyIn", lang)}</span>
            <span>{rs(sum(ins))}</span>
          </div>
          {ins.length ? [...ins].reverse().map(EntryCard) : <div className="qr-empty">{word("none", lang)}</div>}
        </div>
        <div className="qr-lcol out">
          <div className="qr-lh">
            <span>⬆ {word("moneyOut", lang)}</span>
            <span>{rs(sum(outs))}</span>
          </div>
          {outs.length ? [...outs].reverse().map(EntryCard) : <div className="qr-empty">{word("none", lang)}</div>}
        </div>
        {oths.length > 0 && (
          <div className="qr-lcol oth">
            <div className="qr-lh">
              <span>{word("otherCash", lang)}</span>
              <span>{rs(sum(oths))}</span>
            </div>
            {[...oths].reverse().map(EntryCard)}
          </div>
        )}
      </div>
    </Section>
  );

  // Job-work ledger laid out exactly like the Job-Work Desk table.
  const th = (k: WordKey) => {
    const w = words(k, lang);
    return (
      <th>
        {w.main}
        {w.sub && <span className="qr-sub">{w.sub}</span>}
      </th>
    );
  };
  const jobWorkBlock = (
    <Section
      id="jobwork"
      anchor="qr-jw-ledger"
      title={
        <>
          🌾 <Txt k="jobWork" lang={lang} />
        </>
      }
      right={<span className="qr-m">{unsettled.length} {word("unsettled", lang)}</span>}
    >
      <div className="qr-stats">
        <div className="qr-stat">
          <div className="l">🟤 {word("khali", lang)}</div>
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
              {th("colVehicle")}
              {th("colSeed")}
              {th("colCake")}
              {th("colNotes")}
              {th("colStatus")}
              {th("colActions")}
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
                  <td className="nowrap">
                    {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })},{" "}
                    {hm(j.createdAt)}
                  </td>
                  <td>
                    <b>{j.customer}</b>
                    {j.advanceCustomerInr > 0 && <span className="qr-m"> (adv ₹{j.advanceCustomerInr})</span>}
                    {cansCharge > 0 && <span className="qr-m"> (cans ₹{cansCharge})</span>}
                  </td>
                  <td>
                    {j.vehicleNo || "—"}
                    {j.advanceAutoInr > 0 && <span className="qr-m"> (adv ₹{j.advanceAutoInr})</span>}
                  </td>
                  <td>{j.seedKg}</td>
                  <td>{word(j.cakeOwnership === "SHOP" ? "cakeShopShort" : "cakeCustomerShort", lang)}</td>
                  <td>{j.notes || "—"}</td>
                  <td className="nowrap">
                    {j.settled ? (
                      <b className="qr-g">{word("paid", lang)}</b>
                    ) : (
                      <b className="qr-o">
                        {word("due", lang)} {rs(due)}
                      </b>
                    )}
                  </td>
                  <td className="nowrap">
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

  // ---------------------------- workspace ------------------------------
  // An always-open card: pick a tool once and it stays on screen (per device).
  const [wsKey, setWsKey] = useState(0);
  const wsReset = () => setWsKey((k) => k + 1);
  const wsSaved = () => {
    toast(word("saved", lang));
    load();
    wsReset();
  };
  const WORK_TOOLS: { key: WorkTool; icon: string; k: WordKey }[] = [
    { key: "calc", icon: "🧮", k: "calc" },
    { key: "notepad", icon: "📝", k: "notepad" },
    { key: "FRESH_CRUSH", icon: "🫗", k: "FRESH_CRUSH" },
    { key: "SALE", icon: "💰", k: "SALE" },
    { key: "EXPENSE", icon: "🧾", k: "EXPENSE" },
    { key: "PURCHASE", icon: "🛒", k: "PURCHASE" },
    { key: "jwNew", icon: "🌾", k: "jwNew" },
    { key: "count", icon: "💵", k: "count" },
  ];
  const tool = prefs.work;
  const wsBody =
    tool === "calc" ? (
      <CalcSheet key={wsKey} lang={lang} onClose={wsReset} />
    ) : tool === "notepad" ? (
      <Notepad lang={lang} />
    ) : !day ? null : tool === "FRESH_CRUSH" ? (
      <FreshCrushSheet key={wsKey} day={day} lang={lang} date={date} onClose={wsReset} onSaved={wsSaved} toast={toast} />
    ) : tool === "jwNew" ? (
      <JobWorkSheet key={wsKey} day={day} lang={lang} onClose={wsReset} onSaved={wsSaved} toast={toast} />
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
  const workspaceBlock = (
    <div className="qr-work" aria-label={word("workspace", lang)}>
      <div className="qr-head qr-work-head">
        <span>
          🧰 <Txt k="workspace" lang={lang} />
        </span>
      </div>
      <div className="qr-chips qr-work-tools" role="tablist">
        {WORK_TOOLS.map((w) => {
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
              <span className="ci">{w.icon}</span>
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
    toast(msg || word("saved", lang));
    load();
  };
  const sheetEl = !sheet ? null : sheet.t === "calc" ? (
    <CalcSheet lang={lang} onClose={() => setSheet(null)} />
  ) : !day ? null : sheet.t === "entry" ? (
    <EntrySheet key={sheet.kind} kind={sheet.kind} day={day} lang={lang} date={date} onClose={() => setSheet(null)} onSaved={() => done()} toast={toast} />
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

  return (
    <div className="qr">
      <div className={`qr-wrap${sideBySide ? " split" : ""}`}>
        <div className="qr-top">
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
            className={`qr-pill${editFavs ? " on" : ""}`}
            onClick={() => setEditFavs((v) => !v)}
            aria-label={word("editFavs", lang)}
            title={word("editFavs", lang)}
          >
            {editFavs ? "✓ ⭐" : "⭐"}
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
          <button className="qr-pill" onClick={() => setLang(nextLang[lang])} aria-label={word("language", lang)}>
            🗣️ {langLabel[lang]}
          </button>
          {isOwner && (
            <a className="qr-pill" href="/">
              {word("fullDesk", lang)} ↗
            </a>
          )}
        </div>

        {loadError && <div className="qr-banner">{dbOffline ? word("offline", lang) : loadError}</div>}
        {date !== todayIST() && (
          <div className="qr-banner">
            📅 {date} —{" "}
            <button className="qr-pill" onClick={() => setDate(todayIST())}>
              {word("day", lang)}: {todayIST()}
            </button>
          </div>
        )}

        {sideBySide ? (
          <div className="qr-split">
            <div className="qr-left">
              {favouritesBlock}
              {boardBlock}
              {summaryBlock}
            </div>
            <div className="qr-right">
              <div className="qr-rforms">
                <SheetModeCtx.Provider value="inline">{sheetEl}</SheetModeCtx.Provider>
                {workspaceBlock}
              </div>
              <div className="qr-rtables">
                {jobWorkBlock}
                {entriesBlock}
              </div>
            </div>
          </div>
        ) : (
          <>
            {favouritesBlock}
            {boardBlock}
            {workspaceBlock}
            {summaryBlock}
            {entriesBlock}
            {jobWorkBlock}
          </>
        )}
      </div>

      {!sideBySide && sheetEl}
      {toastMsg && (
        <div className="qr-toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Entry sheet (sale / udhaar / purchase / expense / payment / pigmee / draw)
// ---------------------------------------------------------------------------
function EntrySheet({
  kind,
  day,
  lang,
  date,
  onClose,
  onSaved,
  toast,
}: {
  kind: RegisterKind;
  day: DayBundle;
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const side = KIND_SIDE[kind];
  const items = itemsFor(kind, day.config);
  const hasQty = kind === "SALE" || kind === "PURCHASE";
  const modes: { key: Mode; icon: string; en: string; kn: string }[] =
    kind === "SALE" || kind === "PURCHASE"
      ? [
          { key: "CASH", icon: "💵", en: "Cash", kn: "ನಗದು" },
          { key: "UPI", icon: "📱", en: "UPI", kn: "UPI" },
          { key: "CREDIT", icon: "📒", en: "Udhaar", kn: "ಉದ್ರಿ" },
        ]
      : [
          { key: "CASH", icon: "💵", en: "Cash", kn: "ನಗದು" },
          { key: "UPI", icon: "📱", en: "UPI", kn: "UPI" },
        ];

  const [totalMode, setTotalMode] = useState<"itemwise" | "total">("itemwise");
  const [item, setItem] = useState<string | null>(items[0]?.key || null);
  const [otherName, setOtherName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const savedRate = (it: string | null) => {
    const r = it ? day.config.rates[rateKey(kind, it)] : undefined;
    return r ? String(r) : "";
  };
  const [rate, setRate] = useState(() => savedRate(items[0]?.key || null));
  // If the day's data refreshes while the sheet is open (e.g. the previous
  // save is still reloading), fill a still-empty rate from the saved one.
  useEffect(() => {
    if (!item) return;
    const r = day.config.rates[rateKey(kind, item)];
    if (r) setRate((cur) => (cur === "" ? String(r) : cur));
  }, [day.config.rates, item, kind]);
  const [amount, setAmount] = useState(kind === "PIGMEE" ? String(day.config.pigmeeDefault || "") : "");
  const [amtTouched, setAmtTouched] = useState(kind === "PIGMEE");
  const [mode, setMode] = useState<Mode>("CASH");
  const [party, setParty] = useState("");
  const [notes, setNotes] = useState("");
  const [drawKind, setDrawKind] = useState<"partial" | "full">("partial");
  const [busy, setBusy] = useState(false);

  // Auto amount = qty × rate, computed on every render (no lag) until the
  // amount is typed by hand.
  const autoAmount = (() => {
    const q = parseFloat(qty);
    const r = parseFloat(rate);
    return q > 0 && r > 0 ? String(Math.round(q * r * 100) / 100) : "";
  })();
  const amountValue = amtTouched ? amount : autoAmount;

  const showItemwise = !(kind === "SALE" && totalMode === "total");
  const unitObj = UNITS.find((u) => u.key === unit) || UNITS[0];

  async function save() {
    const amt = parseFloat(amountValue);
    if (!(amt > 0)) return toast(word("needAmount", lang));
    if (item === "other" && showItemwise && !otherName.trim()) return toast(word("itemName", lang));
    setBusy(true);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          date,
          kind,
          amountInr: amt,
          paymentMode: mode,
          totalSale: kind === "SALE" && totalMode === "total",
          item: showItemwise ? item : null,
          itemLabel: showItemwise && item === "other" ? otherName.trim() : null,
          qty: showItemwise && hasQty ? parseFloat(qty) || null : null,
          unit: showItemwise && hasQty ? unit : null,
          rateInr: showItemwise && hasQty ? parseFloat(rate) || null : null,
          partyName: party.trim() || null,
          notes: notes.trim() || null,
          drawKind: kind === "OWNER_DRAW" ? drawKind : null,
        }),
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  return (
    <SheetFrame icon={KIND_ICON[kind]} k={kind as WordKey} lang={lang} onClose={onClose}>
      {kind === "SALE" && (
        <div className="qr-f">
          <Chips
            lang={lang}
            value={totalMode}
            onPick={setTotalMode}
            options={[
              { key: "itemwise", icon: "📋", en: "Item-wise", kn: "ಐಟಂ ಪ್ರಕಾರ" },
              { key: "total", icon: "🧾", en: "Total sale (scale slip)", kn: "ಒಟ್ಟು ಮಾರಾಟ (ಸ್ಕೇಲ್ ಸ್ಲಿಪ್)" },
            ]}
          />
        </div>
      )}

      {showItemwise && items.length > 0 && (
        <div className="qr-f">
          <label>
            <Txt k="what" lang={lang} />
          </label>
          <Chips
            lang={lang}
            value={item}
            options={items}
            onPick={(v) => {
              // Remembered rate for the picked item, filled immediately.
              setItem(v);
              setRate(savedRate(v));
              setAmtTouched(false);
            }}
          />
        </div>
      )}
      {showItemwise && item === "other" && (
        <div className="qr-f">
          <label>
            <Txt k="itemName" lang={lang} />
          </label>
          <input className="qr-txt" value={otherName} onChange={(e) => setOtherName(e.target.value)} autoFocus />
        </div>
      )}

      {kind === "OWNER_DRAW" && (
        <div className="qr-f">
          <Chips
            lang={lang}
            value={drawKind}
            onPick={setDrawKind}
            options={[
              { key: "partial", icon: "✂️", en: "Part", kn: "ಸ್ವಲ್ಪ" },
              { key: "full", icon: "🌙", en: "Full closing", kn: "ಪೂರ್ತಿ" },
            ]}
          />
        </div>
      )}

      {showItemwise && hasQty && (
        <>
          <div className="qr-f">
            <label>
              <Txt k="qty" lang={lang} />
            </label>
            <input
              className="qr-num"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="qr-f">
            <Chips lang={lang} value={unit} onPick={setUnit} options={UNITS} />
          </div>
          <div className="qr-f">
            <label>
              {words("rate", lang).main} {lang === "kn" ? unitObj.kn : unitObj.en}
              {words("rate", lang).sub && (
                <span className="qr-sub">
                  {words("rate", lang).sub} {unitObj.kn}
                </span>
              )}
            </label>
            <input
              className="qr-num"
              type="number"
              inputMode="decimal"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="qr-f">
        <label>
          <Txt k="amount" lang={lang} />
        </label>
        <input
          className="qr-num"
          type="number"
          inputMode="decimal"
          min={0}
          value={amountValue}
          autoFocus={!hasQty && items.length === 0}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmtTouched(e.target.value !== "");
          }}
        />
      </div>

      {side !== "oth" && (
        <div className="qr-f">
          <label>
            <Txt k="how" lang={lang} />
          </label>
          <Chips lang={lang} value={mode} onPick={setMode} options={modes} />
        </div>
      )}

      {side !== "oth" && (
        <PartyField value={party} onChange={setParty} top={day.topParties} all={day.allParties} lang={lang} />
      )}

      <div className="qr-f">
        <label>
          <Txt k="note" lang={lang} />
        </label>
        <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button className={`qr-save ${side === "in" ? "" : side === "out" ? "out" : "oth"}`} onClick={save} disabled={busy}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
    </SheetFrame>
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
        <b>{entry.customer}</b> · {entry.seedKg} kg · {entry.cakeOwnership === "SHOP" ? "🏪" : "🙋"}
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
// Cash count (Tally 1 / Tally 2) — saved as a DailyClosing row server-side.
// ---------------------------------------------------------------------------
function CountSheet({
  day,
  lang,
  date,
  isOwner,
  onClose,
  onSaved,
  reload,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  date: string;
  isOwner: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  reload: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const [session, setSession] = useState<"AFTERNOON" | "NIGHT">(
    day.tallies.AFTERNOON || hour >= 16 ? "NIGHT" : "AFTERNOON"
  );
  const [denoms, setDenoms] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);

  const counted = denominationTotal(
    Object.fromEntries(Object.entries(denoms).map(([k, v]) => [k, parseInt(v, 10) || 0])),
    parseFloat(coins) || 0
  );
  const sys = systemCash(day.opening.value, day.entries, day.jwEvents, Date.now());
  const diff = counted - sys;

  async function editOpening() {
    const v = window.prompt(word("opening", lang) + " ₹", String(Math.round(day.opening.value)));
    if (v === null || v === "" || Number.isNaN(Number(v))) return;
    try {
      await api("/api/register/config", {
        method: "PUT",
        body: JSON.stringify({ openings: { ...(isOwner ? day.config.openings : {}), [date]: Number(v) } }),
      });
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
    }
  }

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ data: Tally }>("/api/register/tally", {
        method: "POST",
        body: JSON.stringify({
          date,
          session,
          coins: parseFloat(coins) || 0,
          denoms: Object.fromEntries(Object.entries(denoms).map(([k, v]) => [k, parseInt(v, 10) || 0])),
        }),
      });
      const d = r.data.cashDiffInr;
      onSaved(
        Math.abs(d) < 1
          ? `✓ ${word("matched", lang)}`
          : `${d > 0 ? "⚠️ " + word("short", lang) : word("extra", lang)} ${rs(Math.abs(d))}${
              r.data.cashMismatch ? " — " + word("overLimit", lang) : ""
            }`
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  return (
    <SheetFrame icon="💵" k="count" lang={lang} onClose={onClose}>
      <div className="qr-f">
        <label>
          <Txt k="which" lang={lang} />
        </label>
        <Chips
          lang={lang}
          value={session}
          onPick={setSession}
          options={[
            { key: "AFTERNOON", icon: "🌤️", en: "Tally 1 (midday)", kn: "ಎಣಿಕೆ 1 (ಮಧ್ಯಾಹ್ನ)" },
            { key: "NIGHT", icon: "🌙", en: "Tally 2 (closing)", kn: "ಎಣಿಕೆ 2 (ಮುಚ್ಚುವ)" },
          ]}
        />
      </div>
      <div className="qr-res">
        <span>
          <Txt k="opening" lang={lang} />
        </span>
        <span>{rs(day.opening.value)}</span>
      </div>
      <button className="qr-btn2" style={{ width: "100%", marginTop: 6 }} onClick={editOpening}>
        ✏️ {word("editOpening", lang)}
      </button>
      <table className="qr-dt" style={{ marginTop: 8 }}>
        <tbody>
          {DENOMINATIONS.map((d) => (
            <tr key={d}>
              <td>₹{d}</td>
              <td>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`₹${d}`}
                  value={denoms[String(d)] || ""}
                  onChange={(e) => setDenoms({ ...denoms, [String(d)]: e.target.value })}
                />
              </td>
              <td>{rs((parseInt(denoms[String(d)] || "0", 10) || 0) * d)}</td>
            </tr>
          ))}
          <tr>
            <td>{word("coins", lang)}</td>
            <td colSpan={2}>
              <input type="number" inputMode="numeric" min={0} value={coins} onChange={(e) => setCoins(e.target.value)} />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="qr-res">
        <span>
          <Txt k="counted" lang={lang} />
        </span>
        <span>{rs(counted)}</span>
      </div>
      <div className="qr-res">
        <span>
          <Txt k="inCounter" lang={lang} />
        </span>
        <span>{rs(sys)}</span>
      </div>
      {counted > 0 && (
        <div className={`qr-res ${Math.abs(diff) < 1 || diff > 0 ? "ok" : "bad"}`}>
          <span>
            {Math.abs(diff) < 1
              ? `✓ ${word("matched", lang)}`
              : diff < 0
              ? `⚠️ ${word("short", lang)}`
              : word("extra", lang)}
          </span>
          <span>{Math.abs(diff) >= 1 ? rs(Math.abs(diff)) : ""}</span>
        </div>
      )}
      <button className="qr-save tool" onClick={save} disabled={busy || counted <= 0}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
    </SheetFrame>
  );
}

// ---------------------------------------------------------------------------
// Calculator (never saves anything)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Fresh crush sale — our own seed crushed in front of the customer.
// Records the money (like a sale) AND the production numbers the accountant
// needs at day closing (seed used, oil made, oil to tank/barrel, oil cake).
// ---------------------------------------------------------------------------
function FreshCrushSheet({
  day,
  lang,
  date,
  onClose,
  onSaved,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const seeds = itemsFor("FRESH_CRUSH", day.config);
  const savedRate = (it: string | null, u: string) => {
    const r = it ? day.config.rates[rateKey("FRESH_CRUSH", `${it}:${u}`)] : undefined;
    return r ? String(r) : "";
  };
  const [seed, setSeed] = useState<string>(seeds[0]?.key || "other");
  const [otherName, setOtherName] = useState("");
  const [seedKg, setSeedKg] = useState("");
  const [oilKg, setOilKg] = useState("");
  const [soldQty, setSoldQty] = useState("");
  const [unit, setUnit] = useState<"kg" | "ltr">("kg");
  const [rate, setRate] = useState(() => savedRate(seeds[0]?.key || null, "kg"));
  const [amount, setAmount] = useState("");
  const [amtTouched, setAmtTouched] = useState(false);
  const [extra, setExtra] = useState("");
  const [extraTouched, setExtraTouched] = useState(false);
  const [extraTo, setExtraTo] = useState("");
  const [cake, setCake] = useState("");
  const [mode, setMode] = useState<Mode>("CASH");
  const [party, setParty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const n = (v: string) => (v === "" ? NaN : parseFloat(v));
  const seedN = n(seedKg);
  const oilN = n(oilKg);
  const soldN = n(soldQty);
  const autoAmount = soldN > 0 && n(rate) > 0 ? String(Math.round(soldN * n(rate) * 100) / 100) : "";
  const amountValue = amtTouched ? amount : autoAmount;
  const autoExtra = unit === "kg" ? suggestedExtraKg(oilN, soldN >= 0 ? soldN : null) : null;
  const extraValue = extraTouched ? extra : autoExtra !== null ? String(autoExtra) : "";
  const details = {
    seedKg: seedN,
    oilKg: oilN,
    soldKg: unit === "kg" && soldN >= 0 ? soldN : null,
    extraKg: extraValue === "" ? 0 : parseFloat(extraValue),
    extraTo,
    cakeKg: cake === "" ? 0 : parseFloat(cake),
  };
  const valid = normalizeFreshCrush(details);
  const stats = valid ? freshCrushStats(valid) : null;
  const cakeHint = seedN > 0 && oilN > 0 && oilN < seedN ? Math.round((seedN - oilN) * 10) / 10 : null;

  async function save() {
    if (seed === "other" && !otherName.trim()) return toast(word("itemName", lang));
    if (!valid) return toast(word("fcBadNumbers", lang));
    const amt = parseFloat(amountValue);
    if (!(amt > 0)) return toast(word("needAmount", lang));
    setBusy(true);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          date,
          kind: "FRESH_CRUSH",
          item: seed,
          itemLabel: seed === "other" ? otherName.trim() : null,
          qty: soldN > 0 ? soldN : null,
          unit,
          rateInr: n(rate) > 0 ? n(rate) : null, // remembered per seed AND unit by the API
          amountInr: amt,
          paymentMode: mode,
          partyName: party.trim() || null,
          notes: notes.trim() || null,
          details: valid,
        }),
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : word("error", lang));
      setBusy(false);
    }
  }

  const num = (v: string, set: (x: string) => void, label: WordKey, extraProps: Record<string, unknown> = {}) => (
    <div className="qr-f">
      <label>
        <Txt k={label} lang={lang} />
      </label>
      <input
        className="qr-num"
        type="number"
        inputMode="decimal"
        min={0}
        value={v}
        onChange={(e) => set(e.target.value)}
        {...extraProps}
      />
    </div>
  );

  return (
    <SheetFrame icon="🫗" k="FRESH_CRUSH" lang={lang} onClose={onClose}>
      <div className="qr-res" style={{ marginTop: 0, fontSize: 14, fontWeight: 600 }}>
        <span>ℹ️ {word("fcNotJobwork", lang)}</span>
      </div>

      <div className="qr-f" style={{ marginTop: 10 }}>
        <label>
          <Txt k="fcSeed" lang={lang} />
        </label>
        <Chips
          lang={lang}
          value={seed}
          options={seeds}
          onPick={(v) => {
            setSeed(v);
            setRate(savedRate(v, unit));
            setAmtTouched(false);
          }}
        />
      </div>
      {seed === "other" && (
        <div className="qr-f">
          <label>
            <Txt k="itemName" lang={lang} />
          </label>
          <input className="qr-txt" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
        </div>
      )}

      <span className="qr-lbl">① <Txt k="fcStep1" lang={lang} /></span>
      <div className="qr-grid2">
        {num(seedKg, setSeedKg, "fcSeedKg")}
        {num(oilKg, setOilKg, "fcOilKg")}
      </div>

      <span className="qr-lbl">② <Txt k="fcStep2" lang={lang} /></span>
      <div className="qr-f">
        <Chips
          lang={lang}
          value={unit}
          onPick={(u) => {
            setUnit(u);
            setRate(savedRate(seed, u));
            setAmtTouched(false);
          }}
          options={[
            { key: "kg", icon: "⚖️", en: "kg", kn: "ಕೆಜಿ" },
            { key: "ltr", icon: "🧴", en: "Litre", kn: "ಲೀಟರ್" },
          ]}
        />
      </div>
      <div className="qr-grid2">
        {num(soldQty, setSoldQty, "fcSold")}
        <div className="qr-f">
          <label>
            {words("rate", lang).main} {unit === "kg" ? "kg" : "Litre"}
            {words("rate", lang).sub && (
              <span className="qr-sub">
                {words("rate", lang).sub} {unit === "kg" ? "ಕೆಜಿ" : "ಲೀಟರ್"}
              </span>
            )}
          </label>
          <input className="qr-num" type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>
      <div className="qr-f">
        <label>
          <Txt k="amount" lang={lang} />
        </label>
        <input
          className="qr-num"
          type="number"
          inputMode="decimal"
          min={0}
          value={amountValue}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmtTouched(e.target.value !== "");
          }}
        />
      </div>
      <div className="qr-f">
        <label>
          <Txt k="how" lang={lang} />
        </label>
        <Chips
          lang={lang}
          value={mode}
          onPick={setMode}
          options={[
            { key: "CASH" as Mode, icon: "💵", en: "Cash", kn: "ನಗದು" },
            { key: "UPI" as Mode, icon: "📱", en: "UPI", kn: "UPI" },
            { key: "CREDIT" as Mode, icon: "📒", en: "Udhaar", kn: "ಉದ್ರಿ" },
          ]}
        />
      </div>
      <PartyField value={party} onChange={setParty} top={day.topParties} all={day.allParties} lang={lang} />

      <span className="qr-lbl">③ <Txt k="fcStep3" lang={lang} /></span>
      <div className="qr-grid2">
        {num(extraValue, (v) => {
          setExtra(v);
          setExtraTouched(true);
        }, "fcExtra")}
        <div className="qr-f">
          <label>
            <Txt k="fcExtraTo" lang={lang} />
          </label>
          <input className="qr-txt" list="qr-tanks" value={extraTo} onChange={(e) => setExtraTo(e.target.value)} placeholder="Karadi tank / Barrel A1" />
          <datalist id="qr-tanks">
            <option value="Karadi tank" />
            <option value="Groundnut tank" />
            <option value="Sunflower tank" />
            <option value="Barrel" />
          </datalist>
        </div>
      </div>
      {unit === "ltr" && <div className="qr-hint">{word("fcLtrHint", lang)}</div>}
      <div className="qr-f">
        <label>
          <Txt k="fcCake" lang={lang} />
        </label>
        <input className="qr-num" type="number" inputMode="decimal" min={0} value={cake} onChange={(e) => setCake(e.target.value)} />
        {cakeHint !== null && (
          <div className="qr-hint">
            {word("fcCakeHint", lang)} ≈ {cakeHint} kg
          </div>
        )}
      </div>
      <div className="qr-f">
        <label>
          <Txt k="note" lang={lang} />
        </label>
        <input className="qr-txt" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {stats && (
        <div className={`qr-res ${stats.lossFlag || (stats.unaccountedOilKg ?? 0) > 0.05 ? "bad" : "ok"}`}>
          <span>
            {word("fcYield", lang)} {stats.yieldPct.toFixed(1)}%
            {valid!.cakeKg > 0 && (
              <span className="qr-sub">
                {word("fcLossLbl", lang)} {kg(stats.lossKg)} ({stats.lossPct.toFixed(1)}%)
                {stats.lossFlag ? ` — ${word("fcLoss", lang)} (>${MASS_BALANCE_TOLERANCE_PCT}%)` : ""}
              </span>
            )}
            {(stats.unaccountedOilKg ?? 0) > 0.05 && (
              <span className="qr-sub">
                {word("fcUnaccounted", lang)}: {kg(stats.unaccountedOilKg!)}
              </span>
            )}
          </span>
        </div>
      )}
      {!valid && seedKg !== "" && oilKg !== "" && <div className="qr-res bad">⚠️ {word("fcBadNumbers", lang)}</div>}

      <button className="qr-save" onClick={save} disabled={busy}>
        ✓ {word(busy ? "saving" : "save", lang)}
      </button>
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
          <span>💵 {word("cashIn", lang)}</span>
          <b className="qr-g">{rs(t.cashIn)}</b>
        </div>
        <div className="qr-srow">
          <span>💵 {word("cashOut", lang)}</span>
          <b className="qr-r">{rs(t.cashOut)}</b>
        </div>
        <div className="qr-srow">
          <span>⚙️ {word("jwCash", lang)}</span>
          <b>
            +{rs(t.jwIn)} / −{rs(t.jwOut)}
          </b>
        </div>
        <div className="qr-srow">
          <span>📱 UPI</span>
          <b>
            {rs(t.upiIn)} / {rs(t.upiOut)}
          </b>
        </div>
        <div className="qr-srow">
          <span>📒 {word("CREDIT", lang)}</span>
          <b>{rs(t.creditGiven)}</b>
        </div>
      </div>
      <div className="qr-btnrow">
        <button className="qr-btn2" onClick={() => window.print()}>
          🖨️ {word("print", lang)}
        </button>
        <button
          className="qr-btn2"
          onClick={() => {
            const s = text();
            if (navigator.share) navigator.share({ text: s }).catch(() => undefined);
            else copy(s);
          }}
        >
          📤 {word("share", lang)}
        </button>
      </div>
      <button className="qr-btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => copy(csv())}>
        📋 {word("csv", lang)}
      </button>

      <div className="qr-card">
        <h2>🫗 {word("fcReport", lang)}</h2>
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
                <span>🛢️ → {tank}</span>
                <b>{kg(q)}</b>
              </div>
            ))}
            {fc.flagged > 0 && (
              <div className="qr-srow">
                <span className="qr-r">⚠️ {fc.flagged} {word("fcFlagged", lang)}</span>
              </div>
            )}
            <button className="qr-btn2" style={{ width: "100%", marginTop: 8 }} onClick={() => copy(vyaparText())}>
              🧾 {word("vyapar", lang)}
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
          🗣️ <Txt k="language" lang={lang} />
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
          🖥️ <Txt k="layout" lang={lang} />
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
          ⭐ {word("editFavs", lang)}
        </button>
      </div>

      {isOwner && (
        <div className="qr-card">
          <h2>⚙️ {word("ownerOnly", lang)}</h2>
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
            📚 {word("library", lang)}
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
                  ⭐ {c.label} ✕<span className="qr-sub">{word(c.kind as WordKey, lang)}</span>
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
              {e.paymentMode !== "CASH" && KIND_SIDE[e.kind] !== "oth" ? ` ${e.paymentMode}` : ""}
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
