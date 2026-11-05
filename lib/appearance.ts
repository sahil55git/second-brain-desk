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

export type FontKey = "default" | "system" | "inter" | "rounded" | "serif" | "mono" | "kannada" | "earth" | "ink" | "geist" | "outfit" | "dmsans" | "lexend" | "plex" | "space" | "nunito" | "manrope";
export type Density = "compact" | "comfortable" | "spacious";
export type Pattern = "none" | "gradient" | "dots" | "grid" | "sunrise" | "mesh" | "grain" | "topo" | "drops" | "lines";
export const PATTERNS: readonly Pattern[] = ["none", "gradient", "dots", "grid", "sunrise", "mesh", "grain", "topo", "drops", "lines"];
export type TileStyle = "solid" | "soft" | "outline";
/**
 * Visual style ("skin") laid over the colours: the glass looks from the design
 * references. "none" = the original flat look.
 *   neon  — dark navy, see-through glowing glass cards, neon blue / pink light
 *   frost — smoky frosted glass over a warm bronze background, lime accents
 *   soft  — bright soft-grey cards, big numbers, gentle shadows (best in daylight)
 *   earth — linen paper, flat cream cards, clay and sage, serif numbers (Earth & Clay design)
 *   pastel — lavender colour glass, white pills, tinted cards (Pastel Liquid design)
 *   ink   — dark ink, see-through glass, oil-gold and teal light (Neon Glow / "Mahadev Glass" design)
 *   graphite — dark charcoal grey, solid matte cards, no shine
 *   stone    — light warm grey, solid matte cards, no shine (daylight)
 *   smoke    — see-through smoked grey glass, frosted but matte (no shine, no glow)
 * Skins give buttons the "liquid glass" finish (shine on top, coloured glow under) unless the
 * finish is matte.
 */
export type Skin = "none" | "neon" | "frost" | "soft" | "earth" | "pastel" | "ink" | "graphite" | "stone" | "smoke";
export const SKINS: readonly Skin[] = ["none", "neon", "frost", "soft", "earth", "pastel", "ink", "graphite", "stone", "smoke"];
/** Glossy = shine and glow on buttons and tiles; matte = flat, no shine, no glow. */
export type Finish = "gloss" | "matte";
/** Skins that are light (the rest are dark). */
export const LIGHT_SKINS: readonly Skin[] = ["soft", "earth", "pastel", "stone"];

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
  skin: Skin;
  finish: Finish;
  /** How cards and panels look: as the theme draws them, or flat / soft shadow / glass / outline. */
  card: CardStyle;
  /** Headings and tabs: the theme's own, or tighter "refined" type. */
  type: TypeStyle;
  /** Font for big amounts (counter total, KPIs): the theme's own, the body font, or a display face. */
  numFont: NumFont;
  /** How tab bars look: the theme's own, pills, underline, segmented control or chips. */
  tabs: TabStyle;
  /** Tab bars: scroll sideways, wrap onto more lines, or stretch to fill the width. */
  tabLayout: TabLayout;
  /** Register buttons: the icon square — theme, filled colour, soft tint, ring or plain icon. */
  icons: IconStyle;
  /** Register buttons: icon beside the words (row), icon on top (stack), small or big. */
  tileLayout: TileLayout;
  /** Cards in lists (orders, machines, stock…): automatic columns or a fixed 1 / 2 / 3. */
  cardCols: CardCols;
  /** Quick links (/go): grid of tiles, a list, icons only, or wide cards with the description. */
  links: LinkLayout;
  /** Page width on big screens: wide (1500 px, as before), full screen, or a comfortable reading width. */
  width: PageWidth;
  /** Tablet mode: bigger touch targets and text. Auto = on for touch screens 600 dp and wider. */
  tablet: TabletMode;
}
export type CardStyle = "theme" | "flat" | "soft" | "glass" | "outline" | "elevated" | "edge" | "tinted" | "neo";
export type TypeStyle = "theme" | "refined";
export type NumFont = "theme" | "same" | "serif" | "light" | "mono" | "narrow";
export type TabStyle = "theme" | "pill" | "underline" | "segment" | "chip";
export type TabLayout = "scroll" | "wrap" | "fill";
export type IconStyle = "theme" | "filled" | "soft" | "ring" | "plain";
export type TileLayout = "theme" | "row" | "stack" | "small" | "big";
export type CardCols = "auto" | "1" | "2" | "3";
export type LinkLayout = "grid" | "list" | "icons" | "cards";
export type PageWidth = "wide" | "full" | "comfort";
export type TabletMode = "auto" | "on" | "off";
export const CARD_STYLES: readonly CardStyle[] = ["theme", "flat", "soft", "glass", "outline", "elevated", "edge", "tinted", "neo"];

/** The original flat look (kept so the old themes stay exactly as they were). */
export const CLASSIC_LOOK: Look = {
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
  skin: "none",
  finish: "gloss",
  card: "theme",
  type: "theme",
  numFont: "theme",
  tabs: "theme",
  tabLayout: "scroll",
  icons: "theme",
  tileLayout: "theme",
  cardCols: "auto",
  links: "grid",
  width: "wide",
  tablet: "auto",
};

export const NEON_COLORS: CustomTheme = { bg: "#0a0e24", fg: "#e9edff", card: "#161c42", accent: "#6d8bff" };

/** Default for every device: Neon glass. */
export const DEFAULT_LOOK: Look = {
  ...CLASSIC_LOOK,
  preset: "neon-glass",
  custom: NEON_COLORS,
  font: "inter",
  radius: 1.3,
  panelOpacity: 0.62,
  skin: "neon",
};

export const FONTS: Record<FontKey, { label: string; stack: string | null; google?: string; sample: string }> = {
  default: { label: "Default (each screen's own)", stack: null, sample: "Aa ಅ" },
  system: { label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', sample: "Aa ಅ" },
  inter: { label: "Inter (clean)", stack: '"Inter", "Noto Sans Kannada", system-ui, sans-serif', google: "Inter:wght@400;600;800", sample: "Aa ಅ" },
  rounded: { label: "Rounded (Baloo, Kannada-friendly)", stack: '"Baloo Tamma 2", "Noto Sans Kannada", system-ui, sans-serif', google: "Baloo+Tamma+2:wght@500;700;800", sample: "Aa ಅ" },
  serif: { label: "Serif (ledger book)", stack: '"Noto Serif", "Noto Serif Kannada", Georgia, serif', google: "Noto+Serif:wght@400;700&family=Noto+Serif+Kannada:wght@400;700", sample: "Aa ಅ" },
  mono: { label: "Monospace (numbers line up)", stack: '"JetBrains Mono", "Noto Sans Kannada", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;700", sample: "Aa ಅ 0123" },
  earth: { label: "Earth (Manrope + Fraunces numbers)", stack: '"Manrope", "Noto Sans Kannada", system-ui, sans-serif', google: "Manrope:wght@500;700;800&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  ink: { label: "Ink (Plus Jakarta + Sora numbers)", stack: '"Plus Jakarta Sans", "Noto Sans Kannada", system-ui, sans-serif', google: "Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@300;400;600;700&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  geist: { label: "Geist (sharp, modern)", stack: '"Geist", "Noto Sans Kannada", system-ui, sans-serif', google: "Geist:wght@400;500;600;700;800&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  outfit: { label: "Outfit (geometric, friendly)", stack: '"Outfit", "Noto Sans Kannada", system-ui, sans-serif', google: "Outfit:wght@400;500;600;700;800&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  dmsans: { label: "DM Sans (calm, rounded edges)", stack: '"DM Sans", "Noto Sans Kannada", system-ui, sans-serif', google: "DM+Sans:wght@400;500;700;800&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  lexend: { label: "Lexend (easiest to read, tablets)", stack: '"Lexend", "Noto Sans Kannada", system-ui, sans-serif', google: "Lexend:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  plex: { label: "IBM Plex Sans (business, ledger-like)", stack: '"IBM Plex Sans", "Noto Sans Kannada", system-ui, sans-serif', google: "IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  space: { label: "Space Grotesk (techy, distinctive)", stack: '"Space Grotesk", "Noto Sans Kannada", system-ui, sans-serif', google: "Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  nunito: { label: "Nunito (soft, round)", stack: '"Nunito", "Noto Sans Kannada", system-ui, sans-serif', google: "Nunito:wght@400;600;700;800&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  manrope: { label: "Manrope (clean, wide)", stack: '"Manrope", "Noto Sans Kannada", system-ui, sans-serif', google: "Manrope:wght@400;500;600;700;800&family=Noto+Sans+Kannada:wght@400;600", sample: "Aa ಅ" },
  kannada: { label: "Noto Sans Kannada (best for ಕನ್ನಡ)", stack: '"Noto Sans Kannada", "Noto Sans", system-ui, sans-serif', google: "Noto+Sans+Kannada:wght@400;600;800&family=Noto+Sans:wght@400;600;800", sample: "Aa ಅ" },
};

/** Fonts for big amounts. "theme" keeps each look's own; "same" uses the body font. */
export const NUM_FONTS: Record<NumFont, { label: string; stack: string | null; google?: string }> = {
  theme: { label: "Theme's own", stack: null },
  same: { label: "Same as text", stack: "var(--ui-font, inherit)" },
  serif: { label: "Elegant serif (Fraunces)", stack: '"Fraunces", Georgia, serif', google: "Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700" },
  light: { label: "Light display (Sora)", stack: '"Sora", system-ui, sans-serif', google: "Sora:wght@200;300;500;700" },
  mono: { label: "Ledger digits (JetBrains Mono)", stack: '"JetBrains Mono", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;600;800" },
  narrow: { label: "Tall narrow (Oswald)", stack: '"Oswald", "Arial Narrow", sans-serif', google: "Oswald:wght@300;400;600" },
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
  // Glass looks (from the design references) — first, as they are the new default family.
  { key: "neon-glass", label: "Neon glass (dark)", mode: "dark", accent: NEON_COLORS.accent, colors: NEON_COLORS, look: { skin: "neon", font: "inter", radius: 1.3, panelOpacity: 0.62, pattern: "none" } },
  { key: "warm-frost", label: "Warm frosted glass", mode: "dark", accent: "#c6f432", colors: { bg: "#2b1d15", fg: "#fbf4ea", card: "#3a322c", accent: "#c6f432" }, look: { skin: "frost", font: "inter", radius: 1.4, panelOpacity: 0.55, pattern: "none" } },
  { key: "soft-light", label: "Soft light cards", mode: "light", accent: "#16a34a", colors: { bg: "#eceeec", fg: "#1b1f1c", card: "#f8f9f8", accent: "#16a34a" }, look: { skin: "soft", font: "inter", radius: 1.6, panelOpacity: 1, pattern: "none" } },
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
  // Design directions approved on the canvas (Oct 2026).
  // The three designs below take their colours, fonts and surfaces from the design boards
  // (E2 Earth & Clay, D2 Pastel Liquid, A "Mahadev Glass" neon glow); the look lives in app/skins.css.
  { key: "earth-clay", label: "Earth & Clay (linen, clay, sage)", mode: "light", accent: "#b5643c", colors: { bg: "#efe7d8", fg: "#2e2a24", card: "#f7f2e7", accent: "#b5643c" }, look: { skin: "earth", font: "earth", radius: 1, panelOpacity: 1, pattern: "none" } },
  { key: "pastel-liquid", label: "Pastel Liquid (colour glass)", mode: "light", accent: "#6d4ae0", colors: { bg: "#f3eefb", fg: "#2a2140", card: "#ffffff", accent: "#6d4ae0" }, look: { skin: "pastel", font: "rounded", radius: 1, panelOpacity: 0.72, pattern: "none" } },
  // Matte looks: grey, no shine, no glow (Oct 2026).
  { key: "graphite-matte", label: "Graphite (dark grey, matte)", mode: "dark", accent: "#d9a441", colors: { bg: "#18191b", fg: "#e8e9eb", card: "#232528", accent: "#d9a441" }, look: { skin: "graphite", finish: "matte", font: "inter", radius: 0.9, panelOpacity: 1, pattern: "none" } },
  { key: "stone-matte", label: "Stone (light grey, matte)", mode: "light", accent: "#2f6f8f", colors: { bg: "#e4e5e6", fg: "#1d1f22", card: "#f1f2f3", accent: "#2f6f8f" }, look: { skin: "stone", finish: "matte", font: "inter", radius: 0.9, panelOpacity: 1, pattern: "none" } },
  { key: "smoke-glass", label: "Smoke glass (see-through, matte)", mode: "dark", accent: "#9cc3e6", colors: { bg: "#111214", fg: "#ececee", card: "#2a2c30", accent: "#9cc3e6" }, look: { skin: "smoke", finish: "matte", font: "inter", radius: 1.1, panelOpacity: 0.6, pattern: "none" } },
  { key: "neon-glow", label: "Neon Glow (dark ink, oil gold)", mode: "dark", accent: "#f6b73c", colors: { bg: "#070b18", fg: "#eef1fa", card: "#121a33", accent: "#f6b73c" }, look: { skin: "ink", font: "ink", radius: 1, panelOpacity: 0.7, pattern: "none" } },
  // Refined looks (Nov 2026): each is a full set — colours, font, number font, cards, tabs, icons, graphic.
  { key: "studio", label: "Studio (charcoal & brass)", mode: "dark", accent: "#d4a84f", colors: { bg: "#121316", fg: "#eceae4", card: "#1c1e22", accent: "#d4a84f" }, look: { skin: "graphite", finish: "matte", font: "geist", numFont: "light", card: "elevated", tabs: "underline", icons: "ring", radius: 0.9, panelOpacity: 1, pattern: "grain" } },
  { key: "ivory", label: "Ivory ledger (warm light, serif numbers)", mode: "light", accent: "#8c5a2b", colors: { bg: "#f4efe6", fg: "#1f1b16", card: "#fffdf8", accent: "#8c5a2b" }, look: { skin: "stone", finish: "matte", font: "dmsans", numFont: "serif", card: "edge", tabs: "segment", icons: "soft", radius: 1.1, panelOpacity: 1, pattern: "lines" } },
  { key: "aurora", label: "Aurora (deep blue, teal mesh)", mode: "dark", accent: "#2dd4bf", colors: { bg: "#071225", fg: "#e6f1ff", card: "#0f1f3a", accent: "#2dd4bf" }, look: { skin: "neon", font: "outfit", numFont: "light", card: "edge", tabs: "pill", icons: "filled", radius: 1.3, panelOpacity: 0.7, pattern: "mesh" } },
  { key: "slate-pro", label: "Slate pro (crisp light)", mode: "light", accent: "#2563eb", colors: { bg: "#eef1f5", fg: "#111827", card: "#ffffff", accent: "#2563eb" }, look: { skin: "soft", font: "plex", numFont: "mono", card: "elevated", tabs: "segment", icons: "soft", radius: 1, panelOpacity: 1, pattern: "none" } },
  { key: "oil-gold", label: "Mustard oil (gold drops)", mode: "dark", accent: "#f2b33d", colors: { bg: "#140f07", fg: "#f6ecd8", card: "#211909", accent: "#f2b33d" }, look: { skin: "ink", font: "manrope", numFont: "serif", card: "tinted", tabs: "chip", icons: "filled", radius: 1.2, panelOpacity: 0.8, pattern: "drops" } },
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
    preset: typeof r.preset === "string" ? r.preset : CLASSIC_LOOK.preset,
    custom,
    font: one(r.font, Object.keys(FONTS) as FontKey[], "default"),
    textScale: num(r.textScale, 0.85, 1.4, 1),
    iconScale: num(r.iconScale, 0.8, 1.5, 1),
    density: one(r.density, ["compact", "comfortable", "spacious"] as const, "comfortable"),
    radius: num(r.radius, 0, 1.6, 1),
    panelOpacity: num(r.panelOpacity, 0.5, 1, 1),
    pattern: one(r.pattern, PATTERNS, "none"),
    contrast: one(r.contrast, ["normal", "high"] as const, "normal"),
    motion: one(r.motion, ["full", "reduced"] as const, "full"),
    tileStyle: one(r.tileStyle, ["solid", "soft", "outline"] as const, "solid"),
    skin: one(r.skin, SKINS, "none"),
    finish: one(r.finish, ["gloss", "matte"] as const, "gloss"),
    card: one(r.card, CARD_STYLES, "theme"),
    type: one(r.type, ["theme", "refined"] as const, "theme"),
    numFont: one(r.numFont, Object.keys(NUM_FONTS) as NumFont[], "theme"),
    tabs: one(r.tabs, ["theme", "pill", "underline", "segment", "chip"] as const, "theme"),
    tabLayout: one(r.tabLayout, ["scroll", "wrap", "fill"] as const, "scroll"),
    icons: one(r.icons, ["theme", "filled", "soft", "ring", "plain"] as const, "theme"),
    tileLayout: one(r.tileLayout, ["theme", "row", "stack", "small", "big"] as const, "theme"),
    cardCols: one(r.cardCols, ["auto", "1", "2", "3"] as const, "auto"),
    links: one(r.links, ["grid", "list", "icons", "cards"] as const, "grid"),
    width: one(r.width, ["wide", "full", "comfort"] as const, "wide"),
    tablet: one(r.tablet, ["auto", "on", "off"] as const, "auto"),
  };
}

/** Google Fonts stylesheet for the number font (null when none is needed). */
export function numFontHref(n: NumFont): string | null {
  const g = NUM_FONTS[n]?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}
/** Tablet mode decision: "auto" = a touch screen whose short side is 600 CSS px or more. */
export function tabletOn(mode: TabletMode, shortSide: number, coarse: boolean): boolean {
  return mode === "on" || (mode === "auto" && coarse && shortSide >= 600);
}

/** Google Fonts stylesheet URL for a font choice (null when no download is needed). */
export function fontHref(font: FontKey): string | null {
  const g = FONTS[font]?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}
