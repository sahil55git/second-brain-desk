// Appearance — themes, fonts, text size, density, corners, transparency,
// contrast, motion, button style. Pure functions (unit-tested) used by the
// CustomizeProvider (lib/customize.tsx), which applies the result as CSS
// variables / data-attributes on <html>, so every screen (main desk, Quick
// Register, Reports, Settings) follows the same look. Saved per device.
//
// Ideas borrowed from well-known apps: Linear-style themes built from a few
// colours (background, text, panel, accent) with shareable theme codes;
// Windows / Material-style high-contrast mode; translucent "glass" panels;
// Notion-style font choice; accessibility text size and reduced motion.

export type FontKey = "default" | "system" | "inter" | "rounded" | "serif" | "mono" | "kannada";
export type Density = "compact" | "comfortable" | "spacious";
export type Pattern = "none" | "gradient" | "dots" | "grid" | "sunrise";
export type TileStyle = "solid" | "soft" | "outline";

export interface CustomTheme {
  bg: string;
  fg: string;
  card: string;
  accent: string;
}

export interface Look {
  preset: string; // theme preset key, or "custom"
  custom: CustomTheme | null; // used when preset === "custom" or a preset carries colours
  font: FontKey;
  textScale: number; // 0.85 – 1.4 (whole interface)
  iconScale: number; // 0.8 – 1.5 (register button icons)
  density: Density;
  radius: number; // 0 (square) – 1.6 (extra round)
  panelOpacity: number; // 0.5 – 1 (1 = solid)
  pattern: Pattern;
  contrast: "normal" | "high";
  motion: "full" | "reduced";
  tileStyle: TileStyle;
}

export const DEFAULT_LOOK: Look = {
  preset: "parchment",
  custom: null,
  font: "default",
  textScale: 1,
  iconScale: 1,
  density: "comfortable",
  radius: 1,
  panelOpacity: 1,
  pattern: "none",
  contrast: "normal",
  motion: "full",
  tileStyle: "solid",
};

export const FONTS: Record<FontKey, { label: string; stack: string | null; google?: string; sample: string }> = {
  default: { label: "Default (each screen's own)", stack: null, sample: "Aa ಅ" },
  system: { label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', sample: "Aa ಅ" },
  inter: { label: "Inter (clean)", stack: '"Inter", "Noto Sans Kannada", system-ui, sans-serif', google: "Inter:wght@400;600;800", sample: "Aa ಅ" },
  rounded: { label: "Rounded (Baloo, Kannada-friendly)", stack: '"Baloo Tamma 2", "Noto Sans Kannada", system-ui, sans-serif', google: "Baloo+Tamma+2:wght@500;700;800", sample: "Aa ಅ" },
  serif: { label: "Serif (ledger book)", stack: '"Noto Serif", "Noto Serif Kannada", Georgia, serif', google: "Noto+Serif:wght@400;700&family=Noto+Serif+Kannada:wght@400;700", sample: "Aa ಅ" },
  mono: { label: "Monospace (numbers line up)", stack: '"JetBrains Mono", "Noto Sans Kannada", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;700", sample: "Aa ಅ 0123" },
  kannada: { label: "Noto Sans Kannada (best for ಕನ್ನಡ)", stack: '"Noto Sans Kannada", "Noto Sans", system-ui, sans-serif', google: "Noto+Sans+Kannada:wght@400;600;800&family=Noto+Sans:wght@400;600;800", sample: "Aa ಅ" },
};

/**
 * Theme presets. `mode` forces light/dark ("auto" follows the device);
 * `colors` (when present) is a full custom palette like Linear's themes.
 * Presets without colours use the existing background palettes + accent.
 */
export interface ThemePreset {
  key: string;
  label: string;
  mode: "auto" | "light" | "dark";
  accent: string;
  background?: "default" | "slate" | "sepia" | "sage";
  colors?: CustomTheme;
  look?: Partial<Look>;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: "parchment", label: "Parchment (original)", mode: "auto", accent: "#d97706", background: "default" },
  { key: "ocean-slate", label: "Ocean Slate", mode: "auto", accent: "#1d6fb8", background: "slate" },
  { key: "sage-field", label: "Sage Field", mode: "light", accent: "#3f8f4f", background: "sage" },
  { key: "sepia-ledger", label: "Sepia Ledger", mode: "light", accent: "#c2622d", background: "sepia", look: { font: "serif" } },
  { key: "ash", label: "Ash (clean light)", mode: "light", accent: "#475ba1", colors: { bg: "#ffffff", fg: "#44494d", card: "#edeef3", accent: "#475ba1" } },
  { key: "midnight", label: "Midnight", mode: "dark", accent: "#d25e65", colors: { bg: "#0f0f10", fg: "#eeeff1", card: "#151516", accent: "#d25e65" } },
  { key: "dawn", label: "Dawn", mode: "dark", accent: "#a84376", colors: { bg: "#2a222e", fg: "#eeeff1", card: "#382a3c", accent: "#a84376" } },
  { key: "mahadev-gold", label: "Mahadev Gold", mode: "dark", accent: "#e0a526", colors: { bg: "#17120b", fg: "#f5ead7", card: "#231a0f", accent: "#e0a526" } },
  { key: "mustard-field", label: "Mustard Field", mode: "light", accent: "#b7791f", colors: { bg: "#fffbea", fg: "#3b2f0b", card: "#fff3c4", accent: "#b7791f" } },
  { key: "glass-sky", label: "Glass Sky", mode: "light", accent: "#2563eb", colors: { bg: "#e8f0fe", fg: "#10213f", card: "#ffffff", accent: "#2563eb" }, look: { pattern: "gradient", panelOpacity: 0.72 } },
  { key: "high-contrast", label: "High contrast", mode: "dark", accent: "#ffd400", colors: { bg: "#000000", fg: "#ffffff", card: "#0b0b0b", accent: "#ffd400" }, look: { contrast: "high", tileStyle: "solid" } },
];

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
export function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());
}
function rgb(hex: string) {
  const m = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.substring(i, i + 2), 16) || 0);
}
export function mixHex(a: string, b: string, t: number): string {
  // t = 0 -> a, t = 1 -> b
  const A = rgb(a);
  const B = rgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0")
    ).join("")
  );
}
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio, 1 – 21. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export interface SurfaceTokens {
  bg: string;
  fg: string;
  card: string;
  line: string;
  soft: string;
  isDark: boolean;
}

/** Card / border / secondary-text shades derived from just bg + fg (+ optional card). */
export function deriveSurface(bg: string, fg: string, card?: string | null, highContrast = false): SurfaceTokens {
  const isDark = luminance(bg) < 0.25;
  const c = card && isHex(card) ? card : isDark ? mixHex(bg, "#ffffff", 0.06) : mixHex(bg, "#ffffff", 0.7);
  return {
    bg,
    fg,
    card: c,
    line: highContrast ? mixHex(bg, fg, 0.6) : mixHex(bg, fg, isDark ? 0.18 : 0.14),
    soft: highContrast ? fg : mixHex(bg, fg, 0.62),
    isDark,
  };
}

/** Shareable theme code, Linear-style: "#bg,#fg,#card,#accent". */
export function themeCode(t: CustomTheme): string {
  return [t.bg, t.fg, t.card, t.accent].map((x) => x.toLowerCase()).join(",");
}
export function parseThemeCode(code: string): CustomTheme | null {
  const parts = code
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("#") ? p : `#${p}`));
  if (parts.length < 3 || !parts.every(isHex)) return null;
  const [bg, fg] = parts;
  const card = parts.length >= 4 ? parts[2] : deriveSurface(bg, fg).card;
  const accent = parts.length >= 4 ? parts[3] : parts[2];
  return { bg, fg, card, accent };
}

export function clampLook(raw: unknown): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Look>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const one = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  const custom = r.custom && isHex(r.custom.bg) && isHex(r.custom.fg) && isHex(r.custom.accent) ? { ...r.custom, card: isHex(r.custom.card) ? r.custom.card : deriveSurface(r.custom.bg, r.custom.fg).card } : null;
  return {
    preset: typeof r.preset === "string" ? r.preset : DEFAULT_LOOK.preset,
    custom,
    font: one(r.font, Object.keys(FONTS) as FontKey[], "default"),
    textScale: num(r.textScale, 0.85, 1.4, 1),
    iconScale: num(r.iconScale, 0.8, 1.5, 1),
    density: one(r.density, ["compact", "comfortable", "spacious"] as const, "comfortable"),
    radius: num(r.radius, 0, 1.6, 1),
    panelOpacity: num(r.panelOpacity, 0.5, 1, 1),
    pattern: one(r.pattern, ["none", "gradient", "dots", "grid", "sunrise"] as const, "none"),
    contrast: one(r.contrast, ["normal", "high"] as const, "normal"),
    motion: one(r.motion, ["full", "reduced"] as const, "full"),
    tileStyle: one(r.tileStyle, ["solid", "soft", "outline"] as const, "solid"),
  };
}

/** Google Fonts stylesheet URL for a font choice (null when no download is needed). */
export function fontHref(font: FontKey): string | null {
  const g = FONTS[font]?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}
