"use client";

// Quick Register — the manager's one-screen, icon-first, bilingual counter
// cash book. Talks only to /api/register/* and the existing /api/job-work/*
// routes, so every entry lands in the same Postgres database as the rest of
// Second Brain Desk.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  itemsFor,
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
  | { t: "jw" }
  | { t: "jwpay"; id: string }
  | { t: "count" }
  | { t: "calc" }
  | { t: "report" }
  | null;

const KIND_ICON: Record<RegisterKind, string> = {
  SALE: "💰",
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="qr-veil" onClick={onClose} />
      <div className="qr-sheet" role="dialog" aria-modal="true">
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

  const Tile = ({ k, icon, onClick }: { k: WordKey; icon: string; onClick: () => void }) => {
    const w = words(k, lang);
    return (
      <button className="qr-tile" onClick={onClick} disabled={dbOffline}>
        <span className="ic" aria-hidden>
          {icon}
        </span>
        <span className="p">{w.main}</span>
        {w.sub && <span className="s">{w.sub}</span>}
      </button>
    );
  };

  const unsettled = (day?.jobWork || []).filter((j) => !j.settled);
  const nextLang: Record<LangMode, LangMode> = { both: "en", en: "kn", kn: "both" };
  const langLabel: Record<LangMode, string> = { both: "EN+ಕ", en: "EN", kn: "ಕನ್ನಡ" };

  return (
    <div className="qr">
      <div className="qr-wrap">
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

        {/* ---------------- action board ---------------- */}
        <div className="qr-board">
          <div className="qr-col in">
            <div className="qr-head">
              <span>
                <Txt k="moneyIn" lang={lang} />
              </span>
              <span aria-hidden>⬇</span>
            </div>
            <Tile k="SALE" icon="💰" onClick={() => setSheet({ t: "entry", kind: "SALE" })} />
            <Tile k="UDHAAR_IN" icon="🙌" onClick={() => setSheet({ t: "entry", kind: "UDHAAR_IN" })} />
          </div>
          <div className="qr-col out">
            <div className="qr-head">
              <span>
                <Txt k="moneyOut" lang={lang} />
              </span>
              <span aria-hidden>⬆</span>
            </div>
            <Tile k="PURCHASE" icon="🛒" onClick={() => setSheet({ t: "entry", kind: "PURCHASE" })} />
            <Tile k="EXPENSE" icon="🧾" onClick={() => setSheet({ t: "entry", kind: "EXPENSE" })} />
            <Tile k="PAYMENT" icon="🤝" onClick={() => setSheet({ t: "entry", kind: "PAYMENT" })} />
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
            <Tile k="jwNew" icon="🌾" onClick={() => setSheet({ t: "jw" })} />
            <Tile
              k="jwSettle"
              icon="💳"
              onClick={() => {
                document.getElementById("qr-jw-ledger")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
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
            <Tile k="PIGMEE" icon="🏦" onClick={() => setSheet({ t: "entry", kind: "PIGMEE" })} />
            <Tile k="OWNER_DRAW" icon="🧔" onClick={() => setSheet({ t: "entry", kind: "OWNER_DRAW" })} />
          </div>
        </div>

        <div className="qr-tools">
          <Tile k="count" icon="💵" onClick={() => setSheet({ t: "count" })} />
          <button className="qr-tile" onClick={() => setSheet({ t: "calc" })}>
            <span className="ic" aria-hidden>
              🧮
            </span>
            <span className="p">{words("calc", lang).main}</span>
            {words("calc", lang).sub && <span className="s">{words("calc", lang).sub}</span>}
          </button>
          <button className="qr-tile" onClick={() => setSheet({ t: "report" })}>
            <span className="ic" aria-hidden>
              🖨️
            </span>
            <span className="p">{words("reports", lang).main}</span>
            {words("reports", lang).sub && <span className="s">{words("reports", lang).sub}</span>}
          </button>
        </div>

        {/* ---------------- summary ---------------- */}
        <div className="qr-card">
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
        </div>

        {/* ---------------- today's entries ---------------- */}
        <div className="qr-card" style={{ background: "transparent", border: "none", padding: 0 }}>
          <h2>
            <Txt k="entries" lang={lang} />
          </h2>
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
        </div>

        {/* ---------------- job-work ledger ---------------- */}
        <div className="qr-card" id="qr-jw-ledger">
          <h2>
            🌾 <Txt k="jobWork" lang={lang} />
          </h2>
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
          {(day?.jobWork || []).slice(0, 15).map((j) => {
            const due = expectedSettlement(j);
            const cansTxt = Object.entries(j.cans || {})
              .filter(([, c]) => c && c.qty)
              .map(([k, c]) => `${c!.qty}× ${CAN_TYPES[k as CanKey]?.label || k}`)
              .join(", ");
            return (
              <div className="qr-jwrow" key={j.id}>
                <div className="t">
                  <span>
                    {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, {hm(j.createdAt)}
                  </span>
                  <span>{j.cakeOwnership === "SHOP" ? "🏪" : "🙋"}</span>
                </div>
                <div className="n">
                  {j.customer}
                  {j.vehicleNo && <span className="qr-m"> ({j.vehicleNo})</span>}
                </div>
                <div className="qr-m" style={{ fontSize: 13 }}>
                  {j.seedKg} kg{cansTxt ? " · " + cansTxt : ""}
                  {j.notes ? " · " + j.notes : ""}
                </div>
                {j.settled ? (
                  <span className="qr-badge ok">
                    ✓ {word("paid", lang)} {rs(j.settlementAmountInr)}
                  </span>
                ) : (
                  <>
                    <span className="qr-badge due">
                      {word(j.cakeOwnership === "SHOP" ? "shopPays" : "customerPays", lang)} {rs(Math.abs(due))}
                    </span>
                    <div className="qr-btnrow" style={{ gridTemplateColumns: "1fr" }}>
                      <button className="qr-btn2" disabled={dbOffline} onClick={() => setSheet({ t: "jwpay", id: j.id })}>
                        💰 {word("pay", lang)}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!day?.jobWork.length && <div className="qr-empty">{word("none", lang)}</div>}
        </div>
      </div>

      {/* ---------------- sheets ---------------- */}
      {sheet?.t === "entry" && day && (
        <EntrySheet
          kind={sheet.kind}
          day={day}
          lang={lang}
          date={date}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast(word("saved", lang));
            load();
          }}
          toast={toast}
        />
      )}
      {sheet?.t === "jw" && day && (
        <JobWorkSheet
          day={day}
          lang={lang}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast(word("saved", lang));
            load();
          }}
          toast={toast}
        />
      )}
      {sheet?.t === "jwpay" && day && (
        <JobWorkPaySheet
          entry={day.jobWork.find((j) => j.id === sheet.id)!}
          lang={lang}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast(word("saved", lang));
            load();
          }}
          toast={toast}
        />
      )}
      {sheet?.t === "count" && day && (
        <CountSheet
          day={day}
          lang={lang}
          date={date}
          isOwner={isOwner}
          onClose={() => setSheet(null)}
          onSaved={(msg) => {
            setSheet(null);
            toast(msg);
            load();
          }}
          reload={load}
          toast={toast}
        />
      )}
      {sheet?.t === "calc" && <CalcSheet lang={lang} onClose={() => setSheet(null)} />}
      {sheet?.t === "report" && day && (
        <ReportSheet
          day={day}
          lang={lang}
          setLang={setLang}
          isOwner={isOwner}
          onClose={() => setSheet(null)}
          toast={toast}
          reloadToday={load}
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
  onClose,
  onSaved,
  toast,
}: {
  day: DayBundle;
  lang: LangMode;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [seedKg, setSeedKg] = useState("");
  const [cake, setCake] = useState<CakeOwnership>("SHOP");
  const [advC, setAdvC] = useState("");
  const [advA, setAdvA] = useState("");
  const [cans, setCans] = useState<Record<CanKey, string>>({ can15: "", can5new: "", can5old: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const cansObj = useMemo(() => {
    const o: Partial<Record<CanKey, { qty: number; rate: number }>> = {};
    (Object.keys(CAN_TYPES) as CanKey[]).forEach((k) => {
      const q = parseInt(cans[k], 10);
      if (q > 0) o[k] = { qty: q, rate: CAN_TYPES[k].rate };
    });
    return o;
  }, [cans]);

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
      await api("/api/job-work", {
        method: "POST",
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
    <SheetFrame icon="🌾" k="jwNew" lang={lang} onClose={onClose}>
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
        ✓ {word(busy ? "saving" : "logIntake", lang)}
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
  isOwner,
  onClose,
  toast,
  reloadToday,
}: {
  day: DayBundle;
  lang: LangMode;
  setLang: (m: LangMode) => void;
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
        notes: [e.notes, e.drawKind].filter(Boolean).join(" "),
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
