// Which optional buttons the counter shows on this device (pure, tested). The owner can hide the ones
// staff do not need so the screen stays simple. Pay buttons, Save & Print, Clear and the item keys are always there.

export const SHOW_KEYS = ["byAmount", "totalBox", "tare", "readWeight", "held", "bills", "plu", "search", "customer", "gst", "hold", "lang", "size"] as const;
export type ShowKey = (typeof SHOW_KEYS)[number];
export type ShowCfg = Record<ShowKey, boolean>;

export const SHOW_LABELS: Record<ShowKey, [string, string]> = {
  byAmount: ["₹→kg By amount button", "₹→kg ಮೊತ್ತದಿಂದ ಬಟನ್"],
  totalBox: ["Total ₹ box beside the weight", "ತೂಕದ ಪಕ್ಕದ ಒಟ್ಟು ₹ ಬಾಕ್ಸ್"],
  tare: ["Tare box and tare buttons", "ಟೇರ್ ಬಾಕ್ಸ್ ಮತ್ತು ಬಟನ್‌ಗಳು"],
  readWeight: ["Read weight button", "ತೂಕ ಓದಿ ಬಟನ್"],
  held: ["Held bills button", "ಹಿಡಿದ ಬಿಲ್ ಬಟನ್"],
  bills: ["Bills list button", "ಬಿಲ್ ಪಟ್ಟಿ ಬಟನ್"],
  plu: ["PLU number key", "PLU ಸಂಖ್ಯೆ ಕೀ"],
  search: ["Item search box", "ವಸ್ತು ಹುಡುಕಾಟ ಬಾಕ್ಸ್"],
  customer: ["Customer name / mobile line", "ಗ್ರಾಹಕರ ಹೆಸರು / ಮೊಬೈಲ್"],
  gst: ["GST tax invoice tick", "GST ಇನ್ವಾಯ್ಸ್ ಟಿಕ್"],
  hold: ["Hold button", "ಹಿಡಿ ಬಟನ್"],
  lang: ["English / ಕನ್ನಡ switch", "English / ಕನ್ನಡ ಬದಲಾವಣೆ"],
  size: ["A± screen size button", "A± ಪರದೆ ಗಾತ್ರ ಬಟನ್"],
};

export const SHOW_ALL: ShowCfg = Object.fromEntries(SHOW_KEYS.map((k) => [k, true])) as ShowCfg;

/** A plain screen for new staff: no By amount, no Total box, no PLU key, no GST tick, no size / language buttons. */
export const SHOW_SIMPLE: ShowCfg = { ...SHOW_ALL, byAmount: false, totalBox: false, plu: false, gst: false, lang: false, size: false };

/** Saved data (maybe old or broken) → every button shown unless it was switched off. */
export function parseShow(raw: unknown): ShowCfg {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(SHOW_KEYS.map((k) => [k, o[k] !== false])) as ShowCfg;
}
