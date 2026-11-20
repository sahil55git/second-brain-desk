// Icons Sahil uploads himself (PNG/JPG/SVG/WebP picture files). Stored as small PNG data URLs in
// AppSetting key "custom_icons" (no new table). Ids look like "my_<name>" and work anywhere a library
// icon id works (<MillIcon id="my_press" />, a Quick-links tile as "mi:my_press").
export interface CustomIcon { id: string; name: string; kn?: string; dataUrl: string; by?: string; at?: string }

export const CUSTOM_KEY = "custom_icons";
export const MAX_CUSTOM = 200;
export const MAX_DATAURL = 120_000; // ~90 KB of PNG after the browser shrinks it to 128 px
const URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isCustomId(id: string): boolean { return /^my_[a-z0-9_]{1,36}$/.test(id); }

/** "Press (new)" → "my_press_new" */
export function customIdFromName(name: string, taken: string[] = []): string {
  const base = "my_" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "icon");
  let id = base, n = 2;
  while (taken.includes(id)) id = `${base}_${n++}`;
  return id;
}

export function cleanCustomIcon(raw: unknown, taken: string[] = []): { ok: true; icon: CustomIcon } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, error: "Give the icon a name." };
  const dataUrl = String(r.dataUrl ?? "");
  if (!URL_RE.test(dataUrl)) return { ok: false, error: "Use a PNG, JPG, WebP or SVG picture." };
  if (dataUrl.length > MAX_DATAURL) return { ok: false, error: "That picture is too big. Try a smaller one." };
  const kn = String(r.kn ?? "").trim().slice(0, 40);
  return { ok: true, icon: { id: customIdFromName(name, taken), name, ...(kn ? { kn } : {}), dataUrl } };
}

// ---- tiny client store so <MillIcon id="my_…"/> can draw uploaded icons anywhere ----
let cache: CustomIcon[] = [];
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const subscribeCustomIcons = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const customIconsSnapshot = () => cache;
export function setCustomIcons(list: CustomIcon[]) { cache = list; loaded = true; emit(); }
export async function loadCustomIcons(force = false): Promise<CustomIcon[]> {
  if (loaded && !force) return cache;
  try {
    const r = await fetch("/api/custom-icons", { cache: "no-store" });
    const j = await r.json();
    setCustomIcons(Array.isArray(j.data) ? j.data : []);
  } catch { loaded = true; }
  return cache;
}
export const findCustomIcon = (id: string) => cache.find((c) => c.id === id);
