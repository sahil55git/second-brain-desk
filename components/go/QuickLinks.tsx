"use client";

// Quick links (/go). My tiles = the stars you pick on this device. Pin mode
// shows a star and a "copy link" button on every tile; to put a tile on your
// phone's home screen, open it, then use the browser menu → Add to Home screen.
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { GROUP_META, GROUP_ORDER, visibleLinks, type QuickLink } from "@/lib/quickLinks";
import { TILE_LOOK_KEY, cleanLook, DEFAULT_TILE_LOOK, textOn, tileColor, type TileLook } from "@/lib/tileLook";
import { TileEditor, TilePanel } from "@/components/go/TileStyler";

const KEY = "mahadev-quick-links";

export default function QuickLinks() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [favs, setFavs] = useState<string[]>([]);
  const [pin, setPin] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [look, setLook] = useState<TileLook>(DEFAULT_TILE_LOOK);
  const [panel, setPanel] = useState(false);
  const [editing, setEditing] = useState<QuickLink | null>(null);
  useEffect(() => {
    try {
      setLook(cleanLook(JSON.parse(localStorage.getItem(TILE_LOOK_KEY) || "null")));
    } catch {
      /* storage blocked: default look */
    }
  }, []);
  const saveLook = (l: TileLook) => {
    const c = cleanLook(l);
    setLook(c);
    try { localStorage.setItem(TILE_LOOK_KEY, JSON.stringify(c)); } catch { /* still works this visit */ }
  };

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (Array.isArray(raw)) setFavs(raw.filter((x) => typeof x === "string"));
      else setFavs(["sale", "expense", "jwnew", "cash", "stock", "mfg"]);
    } catch {
      setFavs(["sale", "expense", "jwnew", "cash", "stock", "mfg"]);
    }
  }, []);
  const save = (next: string[]) => {
    setFavs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked — still works this visit */ }
  };
  const toggle = (id: string) => save(favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]);

  const links = useMemo(() => visibleLinks(isOwner), [isOwner]);
  const needle = q.trim().toLowerCase();
  const match = (l: QuickLink) => !needle || `${l.title} ${l.kn} ${l.desc}`.toLowerCase().includes(needle);

  async function copy(l: QuickLink) {
    const url = new URL(l.href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setMsg(`Link copied — ${l.title}`);
    } catch {
      setMsg(url);
    }
    setTimeout(() => setMsg(null), 3500);
  }

  const tile = (l: QuickLink) => {
    const own = look.tiles[l.id] ?? {};
    const c = tileColor(look, l.id, l.group);
    const custom = own.color || look.oneColor || look.groupColors[l.group];
    const vars = { height: "100%", ...(custom ? { "--go-c": c } : {}), "--go-t": textOn(c) } as React.CSSProperties;
    return (
    <div key={l.id} className="go-cell">
      <a className={`go-tile ${l.group}`} href={l.href} style={vars}>
        {own.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ic-img" src={own.image} alt="" />
        ) : (
          <span className="ic" aria-hidden>{own.icon ?? l.icon}</span>
        )}
        <span className="t">{own.title ?? l.title}</span>
        {look.showKn && <span className="k">{l.kn}</span>}
        {look.showDesc && <span className="d">{l.desc}</span>}
      </a>
      {pin && (
        <>
          <button className={`go-star ${favs.includes(l.id) ? "on" : ""}`} aria-label={favs.includes(l.id) ? "Remove from my tiles" : "Add to my tiles"} onClick={() => toggle(l.id)}>
            {favs.includes(l.id) ? "★" : "☆"}
          </button>
          <button className="go-copy" onClick={() => copy(l)}>🔗 copy link</button>
          <button className="go-paint" aria-label={`Change how ${l.title} looks`} onClick={() => setEditing(l)}>🎨</button>
        </>
      )}
    </div>
    );
  };
  const gridAttrs = { "data-shape": look.shape, "data-size": look.size, ...(look.style !== "theme" ? { "data-look": "", "data-style": look.style } : {}), style: { "--go-a": look.opacity } as React.CSSProperties };

  const mine = links.filter((l) => favs.includes(l.id) && match(l));

  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🔗 Quick links</h1>
          <div className="hub-m">One tap to any job. Star your favourites; pin any tile to your phone home screen.</div>
        </div>
        <nav className="hub-links">
          <button className="hub-btn" onClick={() => setPanel(!panel)} aria-pressed={panel}>🎨 Tile look</button>
          <button className="hub-btn" onClick={() => setPin(!pin)} aria-pressed={pin}>{pin ? "✓ Done" : "📌 Pin / edit tiles"}</button>
        </nav>
      </header>

      {panel && <TilePanel look={look} onChange={saveLook} onClose={() => setPanel(false)} />}
      {editing && <TileEditor link={editing} look={look} onChange={saveLook} onClose={() => setEditing(null)} />}
      <input className="go-search" type="search" placeholder="Search — sale, cash, barrel…" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <div className="hub-banner" style={{ borderColor: "var(--h-g)", color: "var(--h-g)", marginTop: 8 }}>{msg}</div>}

      {mine.length > 0 && (
        <>
          <div className="go-sec">⭐ My tiles</div>
          <div className="go-grid" {...gridAttrs}>{mine.map(tile)}</div>
        </>
      )}

      {GROUP_ORDER.map((g) => {
        const list = links.filter((l) => l.group === g && match(l));
        if (!list.length) return null;
        return (
          <div key={g}>
            <div className="go-sec">{GROUP_META[g].icon} {GROUP_META[g].title} · {GROUP_META[g].kn}</div>
            <div className="go-grid" {...gridAttrs}>{list.map(tile)}</div>
          </div>
        );
      })}

      <section className="hub-card" style={{ marginTop: 18 }}>
        <div className="hub-card-head"><h3>📱 Put tiles on your phone screen</h3></div>
        <ol className="go-help">
          <li><b>Whole app:</b> open this page in Chrome → menu ⋮ → <b>Install app</b> (or <i>Add to Home screen</i>). Then <b>long-press the app icon</b> to get Sale, Expense, New job-work, Cash, Stock and Manufacturing shortcuts.</li>
          <li><b>One tile, one icon:</b> tap the tile to open it → Chrome menu ⋮ → <b>Add to Home screen</b>. That icon opens straight to that form.</li>
          <li><b>iPhone:</b> open the tile in Safari → Share → <b>Add to Home Screen</b>.</li>
          <li>Tap <b>📌 Pin / edit tiles</b> to star favourites, copy a tile&apos;s link to share on WhatsApp, or 🎨 give one tile its own colour, icon, logo or name. <b>🎨 Tile look</b> changes all tiles: style, shape, size, see-through and colours.</li>
        </ol>
      </section>
    </div>
  );
}
