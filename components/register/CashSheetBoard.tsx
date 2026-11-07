"use client";
// Quick Register — "Cash sheet" board: Cash in on the left (↓ +), Cash out on the right (↑ −),
// one line per money bucket with today's total. Tapping a line opens the app's own entry form;
// nothing is saved here. Below the drawer total sits a "More windows" area with every other
// function (register windows, Quick links, workings) that can be hidden, shown or extended with
// the person's own link cards. Hidden / own cards are remembered on this device only.
import { useEffect, useMemo, useState } from "react";
import { words, type WordKey } from "@/lib/registerI18n";
import type { LangMode } from "@/lib/register";
import { G } from "@/components/register/Glyph";
import { EMPTY_MORE as EMPTY, MORE_KEY, normalizeMore, safeHref, type MoreState } from "@/lib/cashMore";

export interface CashLine {
  key: string;
  icon: string;
  k: WordKey;
  side: "in" | "out";
  amount: number;
  locked?: boolean;
  open?: () => void;
  extras?: { k: WordKey; icon: string; open: () => void }[];
  disabled?: boolean;
}

export type MoreGroup = "Register" | "Quick links" | "Workings";
export interface MoreCard {
  id: string;
  group: MoreGroup;
  icon: string;
  title: string;
  sub?: string;
  open: () => void;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const GROUPS: ("All" | MoreGroup | "Mine")[] = ["All", "Register", "Quick links", "Workings", "Mine"];

export default function CashSheetBoard({
  lang,
  lines,
  drawer,
  inTotal,
  outTotal,
  cards,
  onCount,
  offline,
}: {
  lang: LangMode;
  lines: CashLine[];
  drawer: number;
  inTotal: number;
  outTotal: number;
  cards: MoreCard[];
  onCount: () => void;
  offline: boolean;
}) {
  const [more, setMore] = useState<MoreState>(EMPTY);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(false);
  const [grp, setGrp] = useState<"All" | MoreGroup | "Mine">("All");
  const [draft, setDraft] = useState({ icon: "", title: "", href: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      setMore(normalizeMore(JSON.parse(localStorage.getItem(MORE_KEY) || "null")));
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const save = (fn: (m: MoreState) => MoreState) =>
    setMore((m) => {
      const next = fn(m);
      try {
        localStorage.setItem(MORE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const all = useMemo<(MoreCard & { mine?: boolean })[]>(
    () => [
      ...cards,
      ...more.custom.map((c) => ({
        id: c.id,
        group: "Workings" as MoreGroup,
        mine: true,
        icon: c.icon,
        title: c.title,
        sub: c.href,
        open: () => window.location.assign(c.href),
      })),
    ],
    [cards, more.custom]
  );
  const shown = all.filter((c) => !more.hidden.includes(c.id) && (grp === "All" || (grp === "Mine" ? c.mine : !c.mine && c.group === grp)));
  const count = (g: (typeof GROUPS)[number]) =>
    all.filter((c) => !more.hidden.includes(c.id) && (g === "All" || (g === "Mine" ? c.mine : !c.mine && c.group === g))).length;

  const addOwn = () => {
    const title = draft.title.trim();
    const href = draft.href.trim();
    if (!title) return setErr("Give the card a name.");
    if (!safeHref(href)) return setErr("Link must start with / (a page of this app) or https://");
    save((m) => ({ ...m, custom: [...m.custom, { id: `c${Date.now()}`, icon: draft.icon.trim() || "🔗", title, href }] }));
    setDraft({ icon: "", title: "", href: "" });
    setErr("");
    setAdding(false);
    setGrp("Mine");
  };

  const col = (side: "in" | "out") => (
    <div className={`qr-col ${side} cs-col`}>
      <div className="qr-head">
        <span>{side === "in" ? "Cash in · ಜಮಾ" : "Cash out · ಖರ್ಚು"}</span>
        <span aria-hidden>
          <G e={side === "in" ? "⬇" : "⬆"} /> {side === "in" ? "+" : "−"}
        </span>
      </div>
      {lines
        .filter((l) => l.side === side)
        .map((l) => {
          const w = words(l.k, lang);
          return (
            <div key={l.key} className="cs-line">
              <button type="button" className="cs-main" disabled={l.locked || l.disabled || offline} onClick={l.open}>
                <span className="cs-ic" aria-hidden>
                  <G e={l.icon} />
                </span>
                <span className="cs-t">
                  <b>{w.main}</b>
                  {w.sub && <small>{w.sub}</small>}
                  {l.locked && <small>from yesterday&apos;s closing</small>}
                </span>
                <b className="cs-amt">
                  {side === "in" ? "+" : "−"}
                  {inr(l.amount)}
                </b>
              </button>
              {!!l.extras?.length && (
                <div className="cs-extras">
                  {l.extras.map((x) => (
                    <button key={x.k} type="button" className="qr-pill" disabled={offline} onClick={x.open}>
                      <G e={x.icon} /> {words(x.k, lang).main}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div className="cs-wrap">
      <div className="qr-board cs-board">
        {col("in")}
        {col("out")}
      </div>

      <div className="cs-drawer">
        <b>Cash that should be in the drawer</b>
        <span>
          {inr(inTotal)} − {inr(outTotal)}
        </span>
        <b className="cs-dnum">{inr(drawer)}</b>
        <button type="button" className="qr-pill" disabled={offline} onClick={onCount}>
          💵 Count cash
        </button>
      </div>

      <section className="qr-card cs-more" aria-label="More windows">
        <div className="cs-more-head">
          <b>🧰 More windows</b>
          <span className="cs-sp" />
          <button type="button" className={`qr-pill${manage ? " on" : ""}`} onClick={() => setManage((v) => !v)}>
            {manage ? "✓ Done" : "👁 Show / hide cards"}
          </button>
          <button type="button" className="qr-pill" onClick={() => save((m) => ({ ...m, collapsed: !m.collapsed }))}>
            {more.collapsed ? "▸ Show section" : "▾ Hide section"}
          </button>
        </div>
        {!more.collapsed && (
          <>
            {manage && (
              <div className="cs-manage">
                <span>Tap a card to hide or show it. Remembered on this device.</span>
                <div className="cs-row">
                  <button type="button" className="qr-pill on" onClick={() => save((m) => ({ ...m, hidden: [] }))}>
                    Show all
                  </button>
                  <button type="button" className="qr-pill" onClick={() => save((m) => ({ ...m, hidden: all.map((c) => c.id) }))}>
                    Hide all
                  </button>
                </div>
                <div className="cs-row">
                  {all.map((c) => {
                    const off = more.hidden.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`qr-pill${off ? "" : " on"}`}
                        onClick={() => save((m) => ({ ...m, hidden: off ? m.hidden.filter((h) => h !== c.id) : [...m.hidden, c.id] }))}
                      >
                        {off ? "○" : "●"} {c.icon} {c.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="cs-row" role="tablist">
              {GROUPS.map((g) => (
                <button key={g} type="button" role="tab" aria-selected={grp === g} className={`qr-pill${grp === g ? " on" : ""}`} onClick={() => setGrp(g)}>
                  {g} ({count(g)})
                </button>
              ))}
            </div>
            <div className="cs-cards">
              {shown.map((c) => (
                <button key={c.id} type="button" className="cs-card" disabled={offline && c.group === "Register"} onClick={c.open} title={c.sub}>
                  <span className="cs-ic" aria-hidden>
                    <G e={c.icon} />
                  </span>
                  <b>{c.title}</b>
                  {c.sub && <small>{c.sub}</small>}
                </button>
              ))}
              {!shown.length && <span className="cs-empty">No cards here. Use “Show / hide cards” to bring them back.</span>}
            </div>
            <div className="cs-row">
              <button type="button" className="qr-pill" onClick={() => setAdding((v) => !v)}>
                {adding ? "✕ Cancel" : "＋ Add your own card"}
              </button>
              {more.custom.length > 0 && grp === "Mine" && (
                <button type="button" className="qr-pill" onClick={() => save((m) => ({ ...m, custom: [] }))}>
                  Remove all my cards
                </button>
              )}
            </div>
            {adding && (
              <div className="cs-add">
                <div className="cs-row">
                  <input className="qr-txt" style={{ width: 70 }} value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🔗" aria-label="Icon" />
                  <input className="qr-txt" style={{ flex: 1, minWidth: 160 }} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Card name" aria-label="Card name" />
                </div>
                <input className="qr-txt" value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} placeholder="Opens: /reports or https://…" aria-label="Link" />
                <div className="cs-row">
                  <button type="button" className="qr-pill on" onClick={addOwn}>
                    Save card
                  </button>
                  {err && <span className="cs-err">{err}</span>}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
