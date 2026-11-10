"use client";

// Helpers, small widgets and types shared by the register entry forms and
// QuickRegister.tsx. Moved verbatim out of QuickRegister.tsx.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type CakeOwnership, type CanKey } from "@/lib/calculations";
import { PAY_CHANNELS, businessDate, channelToMode, type CashEvent, type LangMode, type Mode, type PayChannel, type RegisterConfigData, type RegisterEntryLike, type RegisterKind } from "@/lib/register";
import { pairLabel, word, words, type WordKey } from "@/lib/registerI18n";
import { PLACES } from "@/lib/bidarPlaces";
import { type VoiceAction } from "@/lib/voice";
import { type Captured } from "@/lib/proofClient";
import { G } from "@/components/register/Glyph";


// Pre-fill for an entry form: from a voice command, or from a scanned slip
// (linkProofId attaches that scan to the entry once it is saved).
export type EntryInit = Partial<Pick<Extract<VoiceAction, { type: "entry" }>, "item" | "qty" | "unit" | "rate" | "amount" | "mode" | "party">> & {
  linkProofId?: string;
  note?: string;
  /** An item the register has no button for: opens as "Other" with this name. */
  otherName?: string;
  /** Photo the AI read the entry from — attached to the entry as proof once it is saved. */
  photo?: Captured;
};


// ---------------------------------------------------------------------------
// Types returned by GET /api/register
// ---------------------------------------------------------------------------
export interface Entry extends RegisterEntryLike {
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

export interface JobWork {
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

export interface Tally {
  id: string;
  session: "AFTERNOON" | "NIGHT";
  counterCashInr: number;
  systemCashInr: number;
  cashDiffInr: number;
  cashMismatch: boolean;
  createdAt: string;
}

export interface DayBundle {
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
  proofs?: Record<string, string[]>; // entry id -> proof kinds attached
}


// "modal" = bottom sheet over the page (phones / one-column layout);
// "inline" = form opens in the right-hand panel, side by side.
export const SheetModeCtx = createContext<"modal" | "inline">("modal");


export const KIND_ICON: Record<RegisterKind, string> = {
  SALE: "💰",
  FRESH_CRUSH: "🫗",
  UDHAAR_IN: "🙌",
  PURCHASE: "🛒",
  EXPENSE: "🧾",
  PAYMENT: "🤝",
  PIGMEE: "🏦",
  OWNER_DRAW: "🧔",
};


export const rs = (n: number | null | undefined) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export const todayIST = () => businessDate(Date.now());


// Offline: a new entry that cannot reach the server is kept on this phone and sent when the
// internet is back (each carries a clientId, so a retry never saves it twice).
export const QUEUE_KEY = "qr-offline-queue-v1";

export interface Queued { url: string; body: string; at: number }

export function offlineQueue(): Queued[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

export function setQueue(q: Queued[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qr-queue", { detail: q.length }));
}


export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isNew = url === "/api/register" && init?.method === "POST" && typeof init.body === "string";
  let body = init?.body;
  if (isNew) {
    const b = JSON.parse(init!.body as string);
    if (!b.clientId) b.clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    body = JSON.stringify(b);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setQueue([...offlineQueue(), { url, body: body as string, at: Date.now() }]);
      return { data: { queued: true } } as T;
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      body,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch (e) {
    if (isNew) {
      setQueue([...offlineQueue(), { url, body: body as string, at: Date.now() }]);
      return { data: { queued: true } } as T;
    }
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}


export const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;


// ---------------------------------------------------------------------------
// Small bilingual building blocks
// ---------------------------------------------------------------------------
export function Txt({ k, lang }: { k: WordKey; lang: LangMode }) {
  const w = words(k, lang);
  return (
    <>
      {w.main}
      {w.sub && <span className="qr-sub">{w.sub}</span>}
    </>
  );
}


export function Chips<V extends string>({
  options,
  value,
  onPick,
  lang,
  compact,
}: {
  options: { key: V; icon: string; en: string; kn: string }[];
  value: V | null;
  onPick: (v: V) => void;
  lang: LangMode;
  compact?: boolean;
}) {
  return (
    <div className={`qr-chips${compact ? " compact" : ""}`} role="radiogroup">
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
              <G e={o.icon} />
            </span>
            {l.main}
            {l.sub && <span className="qr-sub">{l.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}


// Compact drop-down menu (with search when the list is long) — replaces big
// tile grids so forms stay short.
export function PickMenu<V extends string>({
  options,
  value,
  onPick,
  lang,
  searchAt = 7,
}: {
  options: { key: V; icon: string; en: string; kn: string }[];
  value: V | null;
  onPick: (v: V) => void;
  lang: LangMode;
  searchAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
    };
  }, [open]);
  const sel = options.find((o) => o.key === value);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => `${o.en} ${o.kn}`.toLowerCase().includes(needle)) : options;
  const label = (o: { en: string; kn: string }) => {
    const l = pairLabel(o.en, o.kn, lang);
    return (
      <span className="qr-pl">
        {l.main}
        {l.sub && <span className="qr-sub">{l.sub}</span>}
      </span>
    );
  };
  return (
    <div
      className="qr-pick"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.nativeEvent.stopPropagation(); // close only the menu, not the whole form
          setOpen(false);
        }
      }}
    >
      <button type="button" className="qr-pickbtn" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((v) => !v); setQ(""); }}>
        <span className="ci" aria-hidden>
          {sel ? <G e={sel.icon} /> : "▾"}
        </span>
        {sel ? label(sel) : <span className="qr-pl">—</span>}
        <span className="car" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="qr-menu" role="listbox">
          {options.length >= searchAt && (
            <input autoFocus value={q} placeholder={word("pickSearch", lang)} onChange={(e) => setQ(e.target.value)} />
          )}
          {shown.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={value === o.key}
              className={`qr-opt${value === o.key ? " sel" : ""}`}
              onClick={() => {
                onPick(o.key);
                setOpen(false);
              }}
            >
              <span className="ci" aria-hidden>
                <G e={o.icon} />
              </span>
              {label(o)}
            </button>
          ))}
          {!shown.length && <div className="qr-none">—</div>}
        </div>
      )}
    </div>
  );
}


// Payment channel for a sale: one channel, or split across several.
export const PAY_OPTS: { key: PayChannel; icon: string; en: string; kn: string }[] = [
  { key: "CASH", icon: "💵", en: "Cash", kn: "ನಗದು" },
  { key: "UPI", icon: "📱", en: "UPI", kn: "UPI" },
  { key: "OWNER_PHONEPE", icon: "🟣", en: "Owner PhonePe", kn: "ಮಾಲೀಕರ PhonePe" },
  { key: "CREDIT", icon: "📒", en: "Udhaar", kn: "ಉದ್ರಿ" },
];

export type PayState = { chan: PayChannel; splitOn: boolean; parts: Partial<Record<PayChannel, string>> };

export const initPay = (m?: Mode): PayState => ({ chan: m === "UPI" || m === "CREDIT" ? m : "CASH", splitOn: false, parts: {} });


/** Fields to merge into the POST body, or an error word to toast. */
export function payBody(total: number, p: PayState, party: string): { body: Record<string, unknown> } | { err: WordKey } {
  if (!p.splitOn) return { body: { paymentMode: channelToMode(p.chan), payChannel: p.chan } };
  const splits = PAY_CHANNELS.map((c) => ({ channel: c, amount: parseFloat(p.parts[c] || "") || 0 })).filter((x) => x.amount > 0);
  const sum = Math.round(splits.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  if (!splits.length || Math.abs(sum - total) > 0.01) return { err: "splitBad" };
  if (splits.some((x) => x.channel === "CREDIT") && !party.trim()) return { err: "splitNeedName" };
  if (splits.length === 1) return { body: { paymentMode: channelToMode(splits[0].channel), payChannel: splits[0].channel } };
  return { body: { paymentMode: "CASH", splits } };
}


export function PayPicker({ lang, total, state, onChange }: { lang: LangMode; total: number; state: PayState; onChange: (s: PayState) => void }) {
  const assigned = Math.round(PAY_CHANNELS.reduce((a, c) => a + (parseFloat(state.parts[c] || "") || 0), 0) * 100) / 100;
  const left = Math.round(((total || 0) - assigned) * 100) / 100;
  return (
    <div className="qr-f">
      <label>
        <Txt k="how" lang={lang} />
      </label>
      {!state.splitOn ? (
        <div className="qr-chips compact" role="radiogroup">
          {PAY_OPTS.map((o) => {
            const l = pairLabel(o.en, o.kn, lang);
            return (
              <button key={o.key} type="button" role="radio" aria-checked={state.chan === o.key} className={`qr-chip${state.chan === o.key ? " sel" : ""}`} onClick={() => onChange({ ...state, chan: o.key })}>
                <span className="ci" aria-hidden><G e={o.icon} /></span>
                {l.main}
                {l.sub && <span className="qr-sub">{l.sub}</span>}
              </button>
            );
          })}
          <button type="button" className="qr-chip" onClick={() => onChange({ ...state, splitOn: true, parts: { [state.chan]: total > 0 ? String(total) : "" } })}>
            <span className="ci" aria-hidden><G e="➗" /></span>
            <Txt k="splitPay" lang={lang} />
          </button>
        </div>
      ) : (
        <div className="qr-paysplit">
          {PAY_OPTS.map((o) => {
            const l = pairLabel(o.en, o.kn, lang);
            return (
              <div className="qr-splitrow" key={o.key}>
                <span className="lab">
                  <G e={o.icon} /> {l.main}
                </span>
                <input
                  className="qr-num"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={state.parts[o.key] ?? ""}
                  onChange={(e) => onChange({ ...state, parts: { ...state.parts, [o.key]: e.target.value } })}
                />
                <button
                  type="button"
                  className="qr-mini"
                  disabled={left <= 0}
                  onClick={() => onChange({ ...state, parts: { ...state.parts, [o.key]: String(Math.round(((parseFloat(state.parts[o.key] || "") || 0) + left) * 100) / 100) } })}
                >
                  + <Txt k="splitFill" lang={lang} />
                </button>
              </div>
            );
          })}
          <div className={`qr-splitsum ${Math.abs(left) < 0.01 && total > 0 ? "ok" : "bad"}`}>
            {Math.abs(left) < 0.01 && total > 0 ? <Txt k="splitDone" lang={lang} /> : <>{word("splitLeft", lang)}: {rs(left)}</>}
          </div>
          <button type="button" className="qr-linkbtn" onClick={() => onChange({ chan: PAY_CHANNELS.find((c) => parseFloat(state.parts[c] || "") > 0) || "CASH", splitOn: false, parts: {} })}>
            ✕ <Txt k="splitPay" lang={lang} />
          </button>
        </div>
      )}
    </div>
  );
}


export function SheetFrame({
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
            <G e={icon} />
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


// Tap-to-pick Bidar villages / towns under a customer name. While the box is
// empty it shows the nearest places; once you type it narrows the list. Your own
// saved customers come first, then the built-in Bidar list (so it works even
// before the places are added as customers in Settings).
export function PlaceChips({ value, onPick, known }: { value: string; onPick: (v: string) => void; known: string[] }) {
  const q = value.trim().toLowerCase();
  const names = Array.from(new Set([...known, ...PLACES.map((p) => p.name)]));
  const list = (q ? names.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q) : PLACES.slice(0, 10).map((p) => p.name))
    .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)))
    .slice(0, 8);
  if (!list.length) return null;
  return (
    <div className="qr-chips compact" style={{ marginTop: 6 }} aria-label="Villages and towns">
      <span className="qr-m" style={{ alignSelf: "center" }}><G e="📍" /></span>
      {list.map((n) => (
        <button key={n} type="button" className="qr-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}


export function PartyField({
  value,
  onChange,
  top,
  all,
  lang,
  label = "who",
  places = false,
}: {
  places?: boolean;
  value: string;
  onChange: (v: string) => void;
  top: string[];
  all: string[];
  lang: LangMode;
  label?: WordKey;
}) {
  // The name chips (regular customers, villages) show only while this box is in use, so the
  // form stays short; tapping a chip fills the box and closes them.
  const [open, setOpen] = useState(false);
  const pick = (n: string) => {
    onChange(n);
    setOpen(false);
  };
  return (
    <div
      className="qr-f"
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !e.currentTarget.contains(next)) setTimeout(() => setOpen(false), 150);
      }}
    >
      <label>
        <Txt k={label} lang={lang} />
      </label>
      <input
        className="qr-txt"
        list={open ? "qr-parties" : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <>
          <datalist id="qr-parties">
            {all.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {top.length > 0 && (
            <div className="qr-chips compact" style={{ marginTop: 6 }}>
              {top.slice(0, 4).map((n) => (
                <button key={n} type="button" className={`qr-chip${value === n ? " sel" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n)}>
                  <G e="👤" /> {n}
                </button>
              ))}
            </div>
          )}
          {places && <PlaceChips value={value} onPick={pick} known={all} />}
        </>
      )}
    </div>
  );
}
