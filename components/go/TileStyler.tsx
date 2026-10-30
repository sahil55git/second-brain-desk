"use client";

// "🎨 Tile look" panel of the Quick links page and the editor for one tile.
// Everything is saved on this device only.
import { useRef, useState } from "react";
import { GROUP_META, GROUP_ORDER, type QuickLink } from "@/lib/quickLinks";
import {
  DEFAULT_GROUP_COLORS, DEFAULT_TILE_LOOK, MAX_IMAGE_CHARS, SHAPES, SIZES, STYLES, SWATCHES, tileColor, withTile,
  type TileLook,
} from "@/lib/tileLook";

function Chips<T extends string>({ list, value, onPick, label }: { list: { id: T; name: string; note?: string }[]; value: T; onPick: (v: T) => void; label: string }) {
  return (
    <div className="go-chips" role="radiogroup" aria-label={label}>
      {list.map((x) => (
        <button key={x.id} type="button" role="radio" aria-checked={value === x.id} className={`go-chip${value === x.id ? " on" : ""}`} title={x.note} onClick={() => onPick(x.id)}>
          {x.name}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, onPick, allowNone, noneText = "Default" }: { value: string | null; onPick: (c: string | null) => void; allowNone?: boolean; noneText?: string }) {
  return (
    <div className="go-swatches">
      {allowNone && <button type="button" className={`go-sw none${value == null ? " on" : ""}`} onClick={() => onPick(null)}>{noneText}</button>}
      {SWATCHES.map((c) => (
        <button key={c} type="button" className={`go-sw${value === c ? " on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => onPick(c)} />
      ))}
      <label className="go-sw pick" title="Any colour">
        🎨
        <input type="color" value={value ?? "#1e8a4c"} onChange={(e) => onPick(e.target.value)} aria-label="Pick any colour" />
      </label>
    </div>
  );
}

export function TilePanel({ look, onChange, onClose }: { look: TileLook; onChange: (l: TileLook) => void; onClose: () => void }) {
  const set = (p: Partial<TileLook>) => onChange({ ...look, ...p });
  const own = Object.keys(look.tiles).length;
  return (
    <section className="hub-card go-panel" aria-label="Tile look">
      <div className="go-panel-h">
        <h3>🎨 Tile look <span className="hub-m small">· this device</span></h3>
        <button className="hub-btn" onClick={onClose}>✓ Done</button>
      </div>
      <div className="go-prow"><b>Style</b><Chips label="Style" list={STYLES} value={look.style} onPick={(style) => set({ style })} /></div>
      <div className="go-prow"><b>Shape</b><Chips label="Shape" list={SHAPES} value={look.shape} onPick={(shape) => set({ shape })} /></div>
      <div className="go-prow"><b>Size</b><Chips label="Size" list={SIZES} value={look.size} onPick={(size) => set({ size })} /></div>
      <div className="go-prow">
        <b>See-through</b>
        <span className="go-range">
          <input type="range" min={15} max={100} step={5} value={Math.round(look.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100, style: look.style === "theme" ? "glass" : look.style })} aria-label="How solid the tiles are" />
          <span className="hub-m small">{look.opacity >= 1 ? "solid" : `${Math.round(look.opacity * 100)}% colour`}</span>
        </span>
      </div>
      <div className="go-prow">
        <b>Colour</b>
        <div>
          <div className="go-chips" role="radiogroup" aria-label="Colour">
            <button type="button" role="radio" aria-checked={!look.oneColor} className={`go-chip${!look.oneColor ? " on" : ""}`} onClick={() => set({ oneColor: null })}>Each section its own</button>
            <button type="button" role="radio" aria-checked={!!look.oneColor} className={`go-chip${look.oneColor ? " on" : ""}`} onClick={() => set({ oneColor: look.oneColor ?? "#2f6f8f" })}>One colour for all</button>
          </div>
          {look.oneColor ? (
            <Swatches value={look.oneColor} onPick={(c) => set({ oneColor: c })} />
          ) : (
            <div className="go-groups">
              {GROUP_ORDER.map((g) => (
                <details key={g} className="go-group">
                  <summary><span className="go-dot" style={{ background: look.groupColors[g] ?? DEFAULT_GROUP_COLORS[g] }} /> {GROUP_META[g].icon} {GROUP_META[g].title}</summary>
                  <Swatches allowNone value={look.groupColors[g] ?? null} onPick={(c) => { const gc = { ...look.groupColors }; if (c) gc[g] = c; else delete gc[g]; set({ groupColors: gc }); }} />
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="go-prow">
        <b>Text</b>
        <span className="go-chips">
          <label className="go-chk"><input type="checkbox" checked={look.showKn} onChange={(e) => set({ showKn: e.target.checked })} /> ಕನ್ನಡ name</label>
          <label className="go-chk"><input type="checkbox" checked={look.showDesc} onChange={(e) => set({ showDesc: e.target.checked })} /> Small description</label>
        </span>
      </div>
      <div className="hub-m small">One tile its own colour, icon, logo or name: tap <b>📌 Pin / edit tiles</b>, then 🎨 on that tile.</div>
      <div className="go-chips">
        <button className="hub-btn" onClick={() => onChange({ ...DEFAULT_TILE_LOOK, tiles: look.tiles })}>↺ Reset the look</button>
        {own > 0 && <button className="hub-btn" onClick={() => onChange({ ...look, tiles: {} })}>↺ Undo {own} tile change{own === 1 ? "" : "s"}</button>}
      </div>
    </section>
  );
}

/** Makes an uploaded picture small (fits 96 × 96) so it can be kept in the browser. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("That file is not a picture."));
      i.src = url;
    });
    const side = 96;
    const s = Math.min(side / img.width, side / img.height, 1);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL("image/png");
    if (out.length > MAX_IMAGE_CHARS) out = c.toDataURL("image/jpeg", 0.85);
    if (out.length > MAX_IMAGE_CHARS) throw new Error("That picture is too detailed. Try a simpler logo.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TileEditor({ link, look, onChange, onClose }: { link: QuickLink; look: TileLook; onChange: (l: TileLook) => void; onClose: () => void }) {
  const own = look.tiles[link.id] ?? {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const set = (p: Parameters<typeof withTile>[2]) => onChange(withTile(look, link.id, p));
  const upload = async (f: File | undefined) => {
    setErr("");
    if (!f) return;
    try {
      set({ image: await shrink(f) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not use that picture.");
    }
  };
  return (
    <div className="go-modalback" onClick={onClose}>
      <div className="go-modal hub-card" role="dialog" aria-modal="true" aria-label={`Tile: ${link.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="go-panel-h">
          <h3>🎨 {own.title ?? link.title}</h3>
          <button className="hub-btn" onClick={onClose}>✓ Done</button>
        </div>
        <label className="go-field">Name on the tile<input value={own.title ?? ""} placeholder={link.title} maxLength={30} onChange={(e) => set({ title: e.target.value })} /></label>
        <div className="go-field">
          Colour <span className="hub-m small">· now {tileColor(look, link.id, link.group)}</span>
          <Swatches allowNone noneText="Same as the others" value={own.color ?? null} onPick={(c) => set({ color: c })} />
        </div>
        <label className="go-field">Icon (an emoji or up to 3 letters)<input value={own.icon ?? ""} placeholder={link.icon} onChange={(e) => set({ icon: e.target.value })} style={{ width: 120, fontSize: 22 }} /></label>
        <div className="go-field">
          Logo or picture <span className="hub-m small">· used instead of the icon</span>
          <div className="go-chips">
            {own.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={own.image} alt="" className="go-logo-prev" />
            )}
            <button className="hub-btn" onClick={() => fileRef.current?.click()}>🖼️ {own.image ? "Change picture" : "Choose a picture"}</button>
            {own.image && <button className="hub-btn" onClick={() => set({ image: null })}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {err && <div className="hub-banner">{err}</div>}
        </div>
        <div className="go-chips">
          <button className="hub-btn" onClick={() => onChange(withTile(look, link.id, { color: null, icon: null, image: null, title: null }))}>↺ Back to normal</button>
        </div>
      </div>
    </div>
  );
}
