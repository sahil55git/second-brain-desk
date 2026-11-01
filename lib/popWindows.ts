// Pop windows (quick windows) that stay open: what is open, where, how big and how see-through,
// kept in this browser so they come back on every page until closed. Pure helpers, tested in
// lib/__tests__/popWindows.test.ts.
export type PopSize = "s" | "m" | "l";
export interface PopState {
  title: string;
  url: string;
  kind?: "Function" | "App" | "Link";
  external?: boolean;
  size: PopSize;
  /** 0.35 – 1 */
  opacity: number;
  min: boolean;
  x: number;
  y: number;
}
export const POPS_KEY = "sbd_pops_v1";
export const MAX_POPS = 4;
export const POP_SIZES: { id: PopSize; name: string }[] = [
  { id: "s", name: "Small" },
  { id: "m", name: "Medium" },
  { id: "l", name: "Large" },
];

const okUrl = (u: unknown): u is string => typeof u === "string" && u.length < 2000 && (u.startsWith("/") ? !u.startsWith("//") : /^https:\/\//.test(u));

export function cleanPops(raw: unknown): PopState[] {
  if (!Array.isArray(raw)) return [];
  const out: PopState[] = [];
  for (const r of raw.slice(-MAX_POPS)) {
    if (!r || typeof r !== "object") continue;
    const p = r as Record<string, unknown>;
    if (!okUrl(p.url)) continue;
    const op = Number(p.opacity);
    out.push({
      title: typeof p.title === "string" ? p.title.slice(0, 60) : "Window",
      url: p.url,
      kind: p.kind === "Function" || p.kind === "Link" ? p.kind : "App",
      external: p.external === true,
      size: p.size === "s" || p.size === "l" ? p.size : "m",
      opacity: Number.isFinite(op) ? Math.max(0.35, Math.min(1, op)) : 1,
      min: p.min === true,
      x: Number.isFinite(Number(p.x)) ? Math.round(Number(p.x)) : 0,
      y: Number.isFinite(Number(p.y)) ? Math.round(Number(p.y)) : 0,
    });
  }
  return out;
}

/** The same address with ?embed=1, so the page inside the window hides the app's own menus. */
export function embedUrl(url: string): string {
  if (!url.startsWith("/") || /[?&]embed=1\b/.test(url)) return url;
  const [path, hash = ""] = url.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}embed=1${hash ? `#${hash}` : ""}`;
}
