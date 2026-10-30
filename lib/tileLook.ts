// How the Quick links tiles look on this device: style, shape, size, see-through, colours, and
// per tile its own colour, icon, logo picture and name. Saved in this browser only (like the
// starred tiles). Pure helpers, tested in lib/__tests__/tileLook.test.ts.
import type { LinkGroup } from "@/lib/quickLinks";

export type TileStyle = "theme" | "solid" | "glass" | "outline" | "soft";
export type TileShape = "rounded" | "square" | "pill" | "circle" | "leaf";
export type TileSize = "s" | "m" | "l";

export interface TileOwn {
  /** #rrggbb */
  color?: string;
  /** an emoji or up to 3 letters */
  icon?: string;
  /** small picture (logo) as a data: URL, made small on upload */
  image?: string;
  /** a different name on the tile */
  title?: string;
}

export interface TileLook {
  style: TileStyle;
  shape: TileShape;
  size: TileSize;
  /** 0.15 (mostly see-through) to 1 (solid); used by every style but "theme" */
  opacity: number;
  /** one colour for every tile instead of the section colours */
  oneColor: string | null;
  groupColors: Partial<Record<LinkGroup, string>>;
  showKn: boolean;
  showDesc: boolean;
  tiles: Record<string, TileOwn>;
}

export const TILE_LOOK_KEY = "mahadev-quick-tiles-v1";
export const DEFAULT_GROUP_COLORS: Record<LinkGroup, string> = { entry: "#1e8a4c", jobwork: "#1d5fa8", tally: "#c9731e", mfg: "#7a4a1e", print: "#5b3f8c", office: "#3e4c59" };
export const DEFAULT_TILE_LOOK: TileLook = { style: "theme", shape: "rounded", size: "m", opacity: 1, oneColor: null, groupColors: {}, showKn: true, showDesc: true, tiles: {} };

export const STYLES: { id: TileStyle; name: string; note: string }[] = [
  { id: "theme", name: "Theme", note: "follows the app theme" },
  { id: "solid", name: "Solid", note: "flat colour" },
  { id: "glass", name: "Glass", note: "see-through, blurred" },
  { id: "soft", name: "Soft tint", note: "light colour, dark text" },
  { id: "outline", name: "Outline", note: "coloured border only" },
];
export const SHAPES: { id: TileShape; name: string }[] = [
  { id: "rounded", name: "Rounded" },
  { id: "square", name: "Square" },
  { id: "pill", name: "Pill" },
  { id: "circle", name: "Circle" },
  { id: "leaf", name: "Leaf" },
];
export const SIZES: { id: TileSize; name: string }[] = [
  { id: "s", name: "Small" },
  { id: "m", name: "Medium" },
  { id: "l", name: "Large" },
];
/** Quick colour choices: the section colours plus a few more that read well with white text. */
export const SWATCHES = ["#1e8a4c", "#1d5fa8", "#c9731e", "#7a4a1e", "#5b3f8c", "#3e4c59", "#b42318", "#0e7c86", "#b7791f", "#d0367a", "#2f6f8f", "#111827"];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const pick = <T extends string>(v: unknown, list: { id: T }[], d: T): T => (list.some((x) => x.id === v) ? (v as T) : d);
export const MAX_IMAGE_CHARS = 60_000; // a 96 px PNG / JPEG is a few kB; this keeps the browser storage safe
const MAX_TILES = 120;

/** Whatever was stored, as a look the page can use (bad parts fall back to the defaults). */
export function cleanLook(raw: unknown): TileLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const groupColors: Partial<Record<LinkGroup, string>> = {};
  const gc = (r.groupColors && typeof r.groupColors === "object" ? r.groupColors : {}) as Record<string, unknown>;
  for (const g of Object.keys(DEFAULT_GROUP_COLORS) as LinkGroup[]) if (isHex(gc[g])) groupColors[g] = (gc[g] as string).toLowerCase();
  const tiles: Record<string, TileOwn> = {};
  const tr = (r.tiles && typeof r.tiles === "object" ? r.tiles : {}) as Record<string, unknown>;
  for (const id of Object.keys(tr).slice(0, MAX_TILES)) {
    const t = cleanOwn(tr[id]);
    if (Object.keys(t).length) tiles[id.slice(0, 40)] = t;
  }
  const op = Number(r.opacity);
  return {
    style: pick(r.style, STYLES, "theme"),
    shape: pick(r.shape, SHAPES, "rounded"),
    size: pick(r.size, SIZES, "m"),
    opacity: Number.isFinite(op) ? Math.max(0.15, Math.min(1, Math.round(op * 100) / 100)) : 1,
    oneColor: isHex(r.oneColor) ? r.oneColor.toLowerCase() : null,
    groupColors,
    showKn: r.showKn !== false,
    showDesc: r.showDesc !== false,
    tiles,
  };
}

export function cleanOwn(raw: unknown): TileOwn {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: TileOwn = {};
  if (isHex(t.color)) out.color = t.color.toLowerCase();
  if (typeof t.icon === "string" && t.icon.trim()) out.icon = Array.from(t.icon.trim()).slice(0, 3).join("");
  if (typeof t.image === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.image) && t.image.length <= MAX_IMAGE_CHARS) out.image = t.image;
  if (typeof t.title === "string" && t.title.trim()) out.title = t.title.trim().slice(0, 30);
  return out;
}

/** The colour of one tile: its own, else the one colour for all, else its section's. */
export function tileColor(look: TileLook, id: string, group: LinkGroup): string {
  return look.tiles[id]?.color ?? look.oneColor ?? look.groupColors[group] ?? DEFAULT_GROUP_COLORS[group];
}

/** Change one tile's own settings; empty settings remove the tile from the list. */
export function withTile(look: TileLook, id: string, patch: Partial<Record<keyof TileOwn, string | null>>): TileLook {
  const cur: Record<string, unknown> = { ...look.tiles[id] };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete cur[k];
    else cur[k] = v;
  }
  const own = cleanOwn(cur);
  const tiles = { ...look.tiles };
  if (Object.keys(own).length) tiles[id] = own;
  else delete tiles[id];
  return { ...look, tiles };
}

export const isDefaultLook = (l: TileLook) => JSON.stringify(cleanLook(l)) === JSON.stringify(DEFAULT_TILE_LOOK);

/** White or near-black text, whichever reads better on this colour (for the soft and outline styles the page uses the colour itself). */
export function textOn(hex: string): "#ffffff" | "#111111" {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111111" : "#ffffff";
}
