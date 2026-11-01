"use client";

// Quick card (/quick): a few cards you swipe between — Quick entry, Today, Barrels, Search, My
// tiles — sized for a small window. Keep it open in Android split screen or pop-up view next to
// WhatsApp or the scale app; tap a button to make an entry, glance at today's figures. ⚙️ chooses
// the cards, their order, size, style and how see-through they are (this device only).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { BizData } from "@/lib/bizReports";
import { homeSummary } from "@/lib/homeSummary";
import { businessDate } from "@/lib/register";
import { navSearch } from "@/lib/navSearch";
import { QUICK_LINKS } from "@/lib/quickLinks";
import { ALL_CARDS, DEFAULT_QUICK_CARD, QUICK_CARD_KEY, cleanQuickCard, moveCard, type CardId, type QuickCardPrefs } from "@/lib/quickCard";
import ShareButton from "@/components/share/ShareButton";
import "./quick.css";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const ENTRY: { icon: string; name: string; kn: string; href: string; owner?: boolean }[] = [
  { icon: "💰", name: "Sale", kn: "ಮಾರಾಟ", href: "/register?open=sale" },
  { icon: "🧾", name: "Expense", kn: "ಖರ್ಚು", href: "/register?open=expense" },
  { icon: "🙌", name: "Udhaar in", kn: "ಉದ್ರಿ ಬಂತು", href: "/register?open=udhaar" },
  { icon: "🛒", name: "Purchase", kn: "ಖರೀದಿ", href: "/register?open=purchase" },
  { icon: "🤝", name: "Payment", kn: "ಪಾವತಿ", href: "/register?open=payment" },
  { icon: "⚖️", name: "Weigh full", kn: "ತುಂಬಿದ ತೂಕ", href: "/barrels?weigh=full" },
  { icon: "🛢️", name: "Weigh empty", kn: "ಖಾಲಿ ತೂಕ", href: "/barrels?weigh=empty" },
  { icon: "💵", name: "Cash count", kn: "ನಗದು", href: "/cash" },
  { icon: "👷", name: "Daily wages", kn: "ದಿನಗೂಲಿ", href: "/employees", owner: true },
];

export default function QuickCard() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [p, setP] = useState<QuickCardPrefs>(DEFAULT_QUICK_CARD);
  const [setup, setSetup] = useState(false);
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setP(cleanQuickCard(JSON.parse(localStorage.getItem(QUICK_CARD_KEY) || "null"))); } catch {}
    document.documentElement.classList.add("is-quick");
    return () => document.documentElement.classList.remove("is-quick");
  }, []);
  const save = (n: QuickCardPrefs) => {
    const c = cleanQuickCard(n);
    setP(c);
    try { localStorage.setItem(QUICK_CARD_KEY, JSON.stringify(c)); } catch {}
  };
  const goTo = (i: number) => {
    const el = strip.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  const onScroll = () => {
    const s = strip.current;
    if (!s || p.layout !== "swipe") return;
    setAt(Math.round(s.scrollLeft / Math.max(1, s.clientWidth)));
  };

  return (
    <div className={`qc qc-${p.size} qc-${p.style} qc-lay-${p.layout}`} style={{ "--qc-a": p.opacity } as React.CSSProperties}>
      <header className="qc-top">
        <a className="qc-ib" href="/" aria-label="Home">⌂</a>
        {p.layout === "swipe" ? (
          <nav className="qc-dots" aria-label="Cards">
            {p.cards.map((id, i) => {
              const c = ALL_CARDS.find((x) => x.id === id)!;
              return <button key={id} className={i === at ? "on" : ""} onClick={() => goTo(i)} aria-label={c.name} title={c.name}>{c.icon}</button>;
            })}
          </nav>
        ) : (
          <b className="qc-title">Quick card</b>
        )}
        <button className="qc-ib" onClick={() => setSetup((v) => !v)} aria-label="Customise" aria-expanded={setup}>⚙️</button>
      </header>

      {setup && <Setup p={p} save={save} close={() => setSetup(false)} />}

      <div className="qc-strip" ref={strip} onScroll={onScroll}>
        {p.cards.map((id) => (
          <section key={id} className="qc-card" id={`qc-${id}`} aria-label={ALL_CARDS.find((c) => c.id === id)?.name}>
            {id === "entry" && <EntryCard isOwner={isOwner} />}
            {id === "today" && <TodayCard />}
            {id === "barrels" && <BarrelsCard />}
            {id === "search" && <SearchCard isOwner={isOwner} />}
            {id === "tiles" && <TilesCard isOwner={isOwner} />}
          </section>
        ))}
      </div>
      {p.layout === "swipe" && p.cards.length > 1 && <div className="qc-hint">⇆ swipe for more cards</div>}
    </div>
  );
}

function EntryCard({ isOwner }: { isOwner: boolean }) {
  return (
    <>
      <h2>➕ Quick entry <small>ತ್ವರಿತ ಎಂಟ್ರಿ</small></h2>
      <div className="qc-grid">
        {ENTRY.filter((e) => isOwner || !e.owner).map((e) => (
          <a key={e.href} className="qc-act" href={e.href}>
            <span className="ic" aria-hidden>{e.icon}</span>
            <b>{e.name}</b>
            <small>{e.kn}</small>
          </a>
        ))}
      </div>
    </>
  );
}

function TodayCard() {
  const [data, setData] = useState<BizData | null>(null);
  const [err, setErr] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const to = businessDate(now);
    const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - 8 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/reports/hub?from=${from}&to=${to}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) setErr(r.status === 403 ? "Today's figures are for the owner." : j.error || "Could not load.");
        else setData(j.data as BizData);
      })
      .catch(() => setErr("Could not load."));
  }, [now]);
  const s = useMemo(() => (data ? homeSummary(data, now) : null), [data, now]);
  return (
    <>
      <h2>📊 Today <small>ಇಂದು</small></h2>
      {err && <p className="qc-m">{err}</p>}
      {!s && !err && <p className="qc-m">Loading…</p>}
      {s && (
        <div id="qc-today-figs">
          <div className="qc-big">{inr(s.soldToday)} <small>sold</small></div>
          <div className="qc-kv">
            <span>Cash in</span><b>{inr(s.cashInToday)}</b>
            <span>UPI in</span><b>{inr(s.upiInToday)}</b>
            <span>Spent</span><b>{inr(s.spentToday)}</b>
            <span>Udhaar out</span><b>{inr(s.udhaarOutstanding)}</b>
            <span>Job-work waiting</span><b>{s.jobWork.waiting}</b>
          </div>
          <ShareButton text={`Sold ${inr(s.soldToday)}\nCash in ${inr(s.cashInToday)} · UPI ${inr(s.upiInToday)}\nSpent ${inr(s.spentToday)}\nUdhaar outstanding ${inr(s.udhaarOutstanding)}\nJob-work waiting: ${s.jobWork.waiting}`} title={`Mahadev Traders · ${s.today}`} className="qc-btn" url={false} />
        </div>
      )}
    </>
  );
}

function BarrelsCard() {
  const [n, setN] = useState<{ waiting: number; notWeighed: number } | null>(null);
  useEffect(() => {
    fetch("/api/barrels")
      .then((r) => r.json())
      .then((j: { data?: { barrels: { grossKg: number | null; emptyKg: number | null }[]; status: string }[] }) => {
        const open = (j.data ?? []).filter((l) => l.status === "OPEN").flatMap((l) => l.barrels);
        setN({ waiting: open.filter((b) => b.grossKg != null && b.emptyKg == null).length, notWeighed: open.filter((b) => b.grossKg == null).length });
      })
      .catch(() => setN(null));
  }, []);
  return (
    <>
      <h2>🛢️ Barrels <small>ಬ್ಯಾರಲ್</small></h2>
      <div className="qc-kv">
        <span>To weigh full</span><b>{n ? n.notWeighed : "…"}</b>
        <span>Waiting to empty</span><b>{n ? n.waiting : "…"}</b>
      </div>
      <div className="qc-grid two">
        <a className="qc-act" href="/barrels?weigh=full"><span className="ic">⚖️</span><b>Weigh full</b></a>
        <a className="qc-act" href="/barrels?weigh=empty"><span className="ic">🛢️</span><b>Weigh empty</b></a>
      </div>
    </>
  );
}

function SearchCard({ isOwner }: { isOwner: boolean }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => navSearch(q, isOwner, 8), [q, isOwner]);
  return (
    <>
      <h2>🔍 Search <small>ಹುಡುಕಿ</small></h2>
      <input className="qc-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="sale, barrel, ಸ್ಟಾಕ್…" aria-label="Search the app" />
      <ul className="qc-list">
        {hits.map((h) => (
          <li key={h.id}><a href={h.href}><span aria-hidden>{h.icon}</span> <b>{h.title}</b> <small>{h.kn}</small></a></li>
        ))}
      </ul>
    </>
  );
}

function TilesCard({ isOwner }: { isOwner: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("mahadev-quick-links") || "null");
      setIds(Array.isArray(raw) ? raw : ["sale", "expense", "jwnew", "cash", "stock", "mfg"]);
    } catch {
      setIds(["sale", "expense", "jwnew", "cash", "stock", "mfg"]);
    }
  }, []);
  const list = QUICK_LINKS.filter((l) => ids.includes(l.id) && (isOwner || !l.ownerOnly));
  return (
    <>
      <h2>⭐ My tiles <small>ನನ್ನ ಟೈಲ್</small></h2>
      {!list.length && <p className="qc-m">Star tiles on the Quick links page to see them here.</p>}
      <div className="qc-grid">
        {list.map((l) => (
          <a key={l.id} className="qc-act" href={l.href}><span className="ic">{l.icon}</span><b>{l.title}</b></a>
        ))}
      </div>
      <a className="qc-link" href="/go">All quick links →</a>
    </>
  );
}

function Setup({ p, save, close }: { p: QuickCardPrefs; save: (p: QuickCardPrefs) => void; close: () => void }) {
  const toggle = (id: CardId) => save({ ...p, cards: p.cards.includes(id) ? p.cards.filter((c) => c !== id) : [...p.cards, id] });
  const chips = <T extends string>(list: [T, string][], v: T, set: (x: T) => void) => (
    <span className="qc-chips">{list.map(([id, n]) => <button key={id} className={v === id ? "on" : ""} onClick={() => set(id)}>{n}</button>)}</span>
  );
  return (
    <div className="qc-setup">
      <div className="qc-srow"><b>Cards</b>
        <div className="qc-cards">
          {ALL_CARDS.map((c) => {
            const on = p.cards.includes(c.id);
            return (
              <span key={c.id} className={`qc-cc${on ? " on" : ""}`}>
                <label><input type="checkbox" checked={on} onChange={() => toggle(c.id)} /> {c.icon} {c.name}</label>
                {on && <><button onClick={() => save(moveCard(p, c.id, -1))} aria-label={`Move ${c.name} left`}>◀</button><button onClick={() => save(moveCard(p, c.id, 1))} aria-label={`Move ${c.name} right`}>▶</button></>}
              </span>
            );
          })}
        </div>
      </div>
      <div className="qc-srow"><b>Size</b>{chips([["s", "Small"], ["m", "Medium"], ["l", "Large"]], p.size, (size) => save({ ...p, size }))}</div>
      <div className="qc-srow"><b>Style</b>{chips([["solid", "Solid"], ["glass", "Glass"], ["outline", "Outline"]], p.style, (style) => save({ ...p, style }))}</div>
      <div className="qc-srow"><b>Show</b>{chips([["swipe", "Swipe cards ⇆"], ["list", "One under another"]], p.layout, (layout) => save({ ...p, layout }))}</div>
      <div className="qc-srow"><b>See-through</b><input type="range" min={30} max={100} step={5} value={Math.round(p.opacity * 100)} onChange={(e) => save({ ...p, opacity: Number(e.target.value) / 100 })} /></div>
      <details className="qc-help">
        <summary>Keep it open beside another app (Android)</summary>
        <ol>
          <li>In Chrome open this page → ⋮ → <b>Add to Home screen</b> (or install the app; long-press its icon → <b>Quick card</b>).</li>
          <li>Open Recent apps (the square button or swipe up and hold) → tap the app&apos;s icon on top → <b>Split screen</b> or <b>Open in pop-up view</b> (Samsung). The card stays open while you use WhatsApp or another app.</li>
          <li>A real home-screen widget (on the home screen without opening anything) needs an Android app; this card is the closest a web app can do.</li>
        </ol>
      </details>
      <div className="qc-srow"><button className="qc-btn" onClick={() => save(DEFAULT_QUICK_CARD)}>↺ Reset</button><button className="qc-btn" onClick={close}>✓ Done</button></div>
    </div>
  );
}
