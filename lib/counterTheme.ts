// Look & feel of the Weigh & Bill counter, saved per device. Pure helpers: parse what was saved,
// and turn it into the CSS variables / classes the counter uses.

export type ThemeMode = "auto" | "light" | "dark" | "black";
export type Corner = "sq" | "md" | "rd";
export type Density = "compact" | "normal" | "roomy";
export type KeySize = "s" | "m" | "l";
export type Backdrop = "plain" | "tint";
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
}

export const PRESETS: { id: string; en: string; kn: string; hex: string }[] = [
  { id: "blue", en: "Blue", kn: "ನೀಲಿ", hex: "#1f6feb" },
  { id: "teal", en: "Teal", kn: "ಟೀಲ್", hex: "#0d9488" },
  { id: "green", en: "Green", kn: "ಹಸಿರು", hex: "#15803d" },
  { id: "orange", en: "Orange", kn: "ಕಿತ್ತಳೆ", hex: "#d97706" },
  { id: "purple", en: "Purple", kn: "ನೇರಳೆ", hex: "#7c3aed" },
  { id: "slate", en: "Slate", kn: "ಬೂದು", hex: "#475569" },
  { id: "gold", en: "Gold", kn: "ಚಿನ್ನ", hex: "#eab308" },
];

export const DEFAULT_THEME: CounterTheme = {
  preset: "blue", custom: "#1f6feb", mode: "auto", opacity: 100, corner: "md", density: "normal", keySize: "m", backdrop: "plain", lcd: "green",
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
    backdrop: pick(o.backdrop, ["plain", "tint"] as const, "plain"),
    lcd: pick(o.lcd, ["green", "amber", "white", "cyan"] as const, "green"),
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
  light: { "--c-bg": "#f2f4f7", "--c-card": "#ffffff", "--c-ink": "#18202b", "--c-soft": "#667085", "--c-line": "#dde2ea" },
  dark: { "--c-bg": "#0d1117", "--c-card": "#161b22", "--c-ink": "#e6edf3", "--c-soft": "#9aa6b2", "--c-line": "#2b333d" },
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
  return `d-${t.density}${t.backdrop === "tint" ? " tint" : ""}`;
}
