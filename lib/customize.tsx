"use client";

// Dashboard-wide look & feel customization (Theme / Accent / Background),
// ported from the original Second Brain Desk artifact's Customize modal
// (plan doc, Version 15). Per-browser only — saved to localStorage, not
// the shared Postgres data, exactly like the artifact's own architecture
// note: "Look-and-feel preferences ... are deliberately not part of the
// shared store — they're per-browser, since they're not shared business
// data."

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { DeskKey } from "./desksConfig";

export type ThemeMode = "auto" | "light" | "dark";
export type BackgroundKey = "default" | "slate" | "sepia" | "sage";

// Version 15/16-style reorder + show/hide, per desk, for a widget strip
// or a ledger table's columns: `order` is a saved permutation of ids
// (any id missing from it — new, or never touched — is appended in its
// natural/default order; see resolveOrder below), `hidden` is the set
// of ids currently hidden.
export interface ListPrefs {
  order: string[];
  hidden: string[];
}

export interface Prefs {
  theme: ThemeMode;
  accent: string; // hex
  background: BackgroundKey;
  widgets: Partial<Record<DeskKey, ListPrefs>>;
  columns: Partial<Record<DeskKey, ListPrefs>>;
}

// Merges a saved order over the definition's natural id order: saved
// ids that still exist keep their saved position, anything new (a field
// added after the prefs were last saved) is appended — so an older save
// never crashes or silently drops a newly-added widget/column.
export function resolveOrder(allIds: string[], lp?: ListPrefs): string[] {
  const known = new Set(allIds);
  const ordered = (lp?.order ?? []).filter((id) => known.has(id));
  const seen = new Set(ordered);
  const missing = allIds.filter((id) => !seen.has(id));
  return [...ordered, ...missing];
}

// Same, filtered down to only the currently-visible ids — what a desk
// component actually renders, in order.
export function visibleOrderedIds(allIds: string[], lp?: ListPrefs): string[] {
  const hidden = new Set(lp?.hidden ?? []);
  return resolveOrder(allIds, lp).filter((id) => !hidden.has(id));
}

export const ACCENT_PRESETS: { key: string; label: string; hex: string }[] = [
  { key: "amber", label: "Amber", hex: "#d97706" },
  { key: "terracotta", label: "Terracotta", hex: "#c2622d" },
  { key: "leaf", label: "Leaf", hex: "#3f8f4f" },
  { key: "teal", label: "Teal", hex: "#0f8a83" },
  { key: "ocean", label: "Ocean", hex: "#1d6fb8" },
  { key: "indigo", label: "Indigo", hex: "#4f52c9" },
  { key: "plum", label: "Plum", hex: "#8a3fa8" },
  { key: "rose", label: "Rose", hex: "#c94f6d" },
];

export const BACKGROUND_PALETTES: Record<
  BackgroundKey,
  { label: string; light: { bg: string; fg: string }; dark: { bg: string; fg: string } }
> = {
  default: {
    label: "Parchment",
    light: { bg: "#faf7f1", fg: "#1f2320" },
    dark: { bg: "#0f1210", fg: "#ededed" },
  },
  slate: {
    label: "Slate",
    light: { bg: "#f1f4f7", fg: "#1b2430" },
    dark: { bg: "#101418", fg: "#e7ecf0" },
  },
  sepia: {
    label: "Sepia",
    light: { bg: "#f7f0e3", fg: "#2b2013" },
    dark: { bg: "#181209", fg: "#f0e6d4" },
  },
  sage: {
    label: "Sage",
    light: { bg: "#f1f5ee", fg: "#1e2a1c" },
    dark: { bg: "#0f130d", fg: "#e6ede1" },
  },
};

const DEFAULT_PREFS: Prefs = {
  theme: "auto",
  accent: ACCENT_PRESETS[0].hex,
  background: "default",
  widgets: {},
  columns: {},
};
const STORAGE_KEY = "sbd_prefs_v1";

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16) || 0;
  const g = parseInt(m.substring(2, 4), 16) || 0;
  const b = parseInt(m.substring(4, 6), 16) || 0;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Derives a readable "ink" text shade and a legible button-text colour
// from any accent hex — preset or custom — separately for light/dark, so
// the whole dashboard stays legible whatever colour is picked.
function deriveAccentShades(hex: string, isDark: boolean) {
  let h = 30;
  let s = 0.5;
  let l = 0.45;
  try {
    const { r, g, b } = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    h = hsl.h;
    s = Math.max(hsl.s, 0.35);
    l = hsl.l;
  } catch {
    // fall back to the defaults above
  }
  const inkL = isDark ? Math.max(l, 0.62) : Math.min(l, 0.42);
  const ink = hslToHex(h, s, inkL);
  const contrast = relativeLuminance(hex) > 0.55 ? "#1a1a1a" : "#ffffff";
  return { ink, contrast };
}

interface Ctx {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  reset: () => void;
  setListPrefs: (kind: "widgets" | "columns", desk: DeskKey, patch: Partial<ListPrefs>) => void;
}

const CustomizeContext = createContext<Ctx | null>(null);

export function CustomizeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      // ignore — start from defaults
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // best-effort only
    }

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = prefs.theme === "dark" || (prefs.theme === "auto" && mql.matches);
      const bg = BACKGROUND_PALETTES[prefs.background] || BACKGROUND_PALETTES.default;
      const surface = isDark ? bg.dark : bg.light;
      const { ink, contrast } = deriveAccentShades(prefs.accent, isDark);
      const root = document.documentElement;
      root.style.setProperty("--background", surface.bg);
      root.style.setProperty("--foreground", surface.fg);
      root.style.setProperty("--accent", prefs.accent);
      root.style.setProperty("--accent-ink", ink);
      root.style.setProperty("--accent-contrast", contrast);
      root.classList.toggle("dark", isDark);
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [prefs, loaded]);

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      setPrefs: (p) => setPrefsState((prev) => ({ ...prev, ...p })),
      reset: () => setPrefsState(DEFAULT_PREFS),
      setListPrefs: (kind, desk, patch) =>
        setPrefsState((prev) => {
          const cur = prev[kind][desk] ?? { order: [], hidden: [] };
          return { ...prev, [kind]: { ...prev[kind], [desk]: { ...cur, ...patch } } };
        }),
    }),
    [prefs]
  );

  return <CustomizeContext.Provider value={value}>{children}</CustomizeContext.Provider>;
}

export function useCustomize() {
  const ctx = useContext(CustomizeContext);
  if (!ctx) throw new Error("useCustomize must be used within CustomizeProvider");
  return ctx;
}
