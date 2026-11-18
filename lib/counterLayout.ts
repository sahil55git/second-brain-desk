// Counter layouts the owner can choose for all staff or for one device (pure, tested).
// tablet: big item list for tablets, with optional hides (see TabletOpts). standard: today's screen. simple: extras hidden. big: huge weight and price. steps: one job per screen.
import { ensurePayOption, SHOW_SIMPLE, type ShowCfg } from "./counterShow";

export const LAYOUTS = ["standard", "simple", "big", "steps", "tablet"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_INFO: Record<Layout, { en: string; kn: string; en2: string; kn2: string }> = {
  standard: { en: "Standard", kn: "ಸಾಮಾನ್ಯ", en2: "Everything as it is today", kn2: "ಈಗಿನಂತೆಯೇ ಎಲ್ಲವೂ" },
  simple: { en: "Simple", kn: "ಸರಳ", en2: "Extras hidden: weigh, tap item, pay", kn2: "ಹೆಚ್ಚುವರಿ ಮರೆ: ತೂಕ, ವಸ್ತು, ಪಾವತಿ" },
  big: { en: "Big weight", kn: "ದೊಡ್ಡ ತೂಕ", en2: "Weight and price fill the screen", kn2: "ತೂಕ ಮತ್ತು ಬೆಲೆ ದೊಡ್ಡದಾಗಿ" },
  tablet: { en: "Tablet big items", kn: "ಟ್ಯಾಬ್ಲೆಟ್ ದೊಡ್ಡ ವಸ್ತುಗಳು", en2: "Big item list, small cash strip, tap weight to read", kn2: "ದೊಡ್ಡ ವಸ್ತು ಪಟ್ಟಿ, ಸಣ್ಣ ನಗದು ಪಟ್ಟಿ" },
  steps: { en: "Step by step", kn: "ಹಂತ ಹಂತವಾಗಿ", en2: "One job per screen, flashing guide", kn2: "ಒಂದು ಪರದೆಗೆ ಒಂದು ಕೆಲಸ, ಮಿನುಗುವ ಮಾರ್ಗದರ್ಶಿ" },
};

export function parseLayout(raw: unknown): Layout {
  const v = raw && typeof raw === "object" ? (raw as { layout?: unknown }).layout : raw;
  return LAYOUTS.includes(v as Layout) ? (v as Layout) : "standard";
}

/** This device's own choice wins; "shop" (or nothing) follows the layout the owner set for all staff. */
export function pickLayout(shop: unknown, device: unknown): Layout {
  return typeof device === "string" && LAYOUTS.includes(device as Layout) ? (device as Layout) : parseLayout(shop);
}

/** The buttons actually shown: the device's own button choices, further trimmed by the layout. */
export function layoutShow(layout: Layout, base: ShowCfg): ShowCfg {
  if (layout === "standard" || layout === "tablet") return base;
  const hide: Partial<ShowCfg> = layout === "big"
    ? { scaleSetup: false, itemsBtn: false, deskLink: false, byAmount: false, gst: false, lang: false, size: false }
    : SHOW_SIMPLE;
  const out = { ...base };
  for (const k of Object.keys(hide) as (keyof ShowCfg)[]) if (hide[k] === false) out[k] = false;
  return ensurePayOption(out);
}

/** Tablet layout extras, saved on the device: hide what is not needed to give the item list more room. */
export interface TabletOpts {
  /** no Read weight button: tap the weight display to read it */
  hideRead: boolean;
  /** no Tare button: tap the Tare display to tare (tap again to clear) */
  hideTare: boolean;
  /** no Total box at the top; Parked / Bills / Held move up beside Tare (the total stays on the Save button) */
  hideTotal: boolean;
  /** no Oil kg / Wait row */
  hideOil: boolean;
}
export const TABLET_DEFAULT: TabletOpts = { hideRead: false, hideTare: false, hideTotal: false, hideOil: false };
export function parseTabletOpts(raw: unknown): TabletOpts {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { hideRead: o.hideRead === true, hideTare: o.hideTare === true, hideTotal: o.hideTotal === true, hideOil: o.hideOil === true };
}
