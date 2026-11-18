// Look & feel of the Weigh & Bill counter, saved per device. Pure helpers: parse what was saved,
// and turn it into the CSS variables / classes the counter uses.

export type ThemeMode = "auto" | "light" | "dark" | "black";
export type Corner = "sq" | "md" | "rd";
export type Density = "compact" | "normal" | "roomy";
export type KeySize = "s" | "m" | "l";
export type PluSize = "m" | "l" | "xl";
export type Backdrop = "plain" | "tint" | "glass";
export type LcdColor = "green" | "amber" | "white" | "cyan";

export interface CounterTheme {
  preset: string; // id from PRESETS, or "custom"
  custom: string; // #rrggbb used when preset is "custom"
  mode: ThemeMode;
  opacity: number; // panel opacity 40..100
  corner: Corner;
  density: Density;
  keySize: KeySize;
  backdrop: Backdrop;
  lcd: LcdColor;
  /** show the small picture / symbol on each item key */
  icons: boolean;
  /** size of the PLU number on each item key (xl = readable from across the counter) */
  pluSize: PluSize;
}

export const PRESETS: { id: string; en: string; kn: string; hex: string }[] = [
  { id: "navy", en: "Navy", kn: "ನೇವಿ", hex: "#1d3557" },
  { id: "blue", en: "Steel blue", kn: "ನೀಲಿ", hex: "#2c5aa0" },
  { id: "teal", en: "Teal", kn: "ಟೀಲ್", hex: "#237a76" },
  { id: "green", en: "Forest", kn: "ಹಸಿರು", hex: "#2e6b4e" },
  { id: "maroon", en: "Maroon", kn: "ಮರೂನ್", hex: "#843040" },
  { id: "orange", en: "Amber", kn: "ಕಿತ್ತಳೆ", hex: "#b4621a" },
  { id: "purple", en: "Plum", kn: "ನೇರಳೆ", hex: "#5d4d8c" },
  { id: "slate", en: "Slate", kn: "ಬೂದು", hex: "#4a5568" },
  { id: "graphite", en: "Graphite", kn: "ಗ್ರ್ಯಾಫೈಟ್", hex: "#2f3a48" },
  { id: "gold", en: "Antique gold", kn: "ಚಿನ್ನ", hex: "#a37a15" },
];

export const DEFAULT_THEME: CounterTheme = {
  preset: "navy", custom: "#1d3557", mode: "auto", opacity: 100, corner: "md", density: "normal", keySize: "m", backdrop: "plain", lcd: "green", icons: true, pluSize: "m",
};

const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

export const validHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

/** Whatever was saved (maybe old, maybe broken) → a complete, valid theme. */
export function parseTheme(raw: unknown): CounterTheme {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = [...PRESETS.map((p) => p.id), "custom"];
  const op = Number(o.opacity);
  return {
    preset: pick(o.preset, ids, DEFAULT_THEME.preset),
    custom: validHex(o.custom) ? o.custom.toLowerCase() : DEFAULT_THEME.custom,
    mode: pick(o.mode, ["auto", "light", "dark", "black"] as const, "auto"),
    opacity: Number.isFinite(op) ? Math.min(100, Math.max(40, Math.round(op))) : 100,
    corner: pick(o.corner, ["sq", "md", "rd"] as const, "md"),
    density: pick(o.density, ["compact", "normal", "roomy"] as const, "normal"),
    keySize: pick(o.keySize, ["s", "m", "l"] as const, "m"),
    backdrop: pick(o.backdrop, ["plain", "tint", "glass"] as const, "plain"),
    lcd: pick(o.lcd, ["green", "amber", "white", "cyan"] as const, "green"),
    icons: o.icons !== false,
    pluSize: pick(o.pluSize, ["m", "l", "xl"] as const, "m"),
  };
}

export function accentOf(t: CounterTheme): string {
  if (t.preset === "custom") return t.custom;
  return PRESETS.find((p) => p.id === t.preset)?.hex ?? PRESETS[0].hex;
}

/** Text colour that stays readable on top of the accent colour. */
export function onAccent(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#1a1a1a" : "#ffffff";
}

const MODES = {
  light: { "--c-bg": "#f1f3f5", "--c-card": "#ffffff", "--c-ink": "#1a212b", "--c-soft": "#5f6b7a", "--c-line": "#dadee3" },
  dark: { "--c-bg": "#0f1318", "--c-card": "#171c23", "--c-ink": "#e7ebf0", "--c-soft": "#9aa4b1", "--c-line": "#272e38" },
  black: { "--c-bg": "#000000", "--c-card": "#0b0b0b", "--c-ink": "#f5f5f5", "--c-soft": "#a3a3a3", "--c-line": "#2a2a2a" },
} as const;

const LCD: Record<LcdColor, string> = { green: "#8ef0a2", amber: "#ffc857", white: "#f5f5f5", cyan: "#7dd3fc" };
const RADIUS: Record<Corner, string> = { sq: "6px", md: "16px", rd: "26px" };
const KEYW: Record<KeySize, string> = { s: "112px", m: "140px", l: "184px" };

/** Inline CSS variables for the counter root. "auto" mode sets no colours, so the device's dark/light setting decides. */
export function themeStyle(t: CounterTheme): Record<string, string> {
  const acc = accentOf(t);
  const s: Record<string, string> = {
    "--c-acc": acc,
    "--c-on-acc": onAccent(acc),
    "--c-lcd-ink": LCD[t.lcd],
    "--r": RADIUS[t.corner],
    "--keyw": KEYW[t.keySize],
    "--card-a": String(t.opacity),
  };
  if (t.mode !== "auto") Object.assign(s, MODES[t.mode]);
  return s;
}

/** Class names for the counter root (density and background style). */
export function themeClass(t: CounterTheme): string {
  return `d-${t.density}${t.backdrop === "tint" ? " tint" : t.backdrop === "glass" ? " glass" : ""}${t.icons ? "" : " no-ic"} plu-${t.pluSize}`;
}
