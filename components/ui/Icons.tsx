// Line icons used by the designed looks (Earth & Clay, Pastel Liquid, Neon Glow).
// One stroke style everywhere: 24×24, round caps, currentColor.
import React from "react";

const P: Record<string, React.ReactNode> = {
  rupee: <path d="M7 4h10M7 8.5h10M10 4c3.3 0 5 1.6 5 4.5S13.3 13 10 13H7l7 7" />,
  drop: <path d="M12 3.5c3.2 4 5.5 7.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-3 2.3-6.2 5.5-10.2Z" />,
  leaf: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" /><path d="M5 19l7-7" /></>,
  bill: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></>,
  arrowIn: <><path d="M4 12h12" /><path d="m11 7 5 5-5 5" /><path d="M20 4v16" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>,
  cart: <><path d="M3 4h2.5l2.2 10.5h10l2-7.5H6.4" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  userPlus: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" /><path d="M18 8v6M15 11h6" /></>,
  sprout: <><path d="M12 21v-9" /><path d="M12 12c0-4 2.5-7 7-7 0 4.5-3 7-7 7Z" /><path d="M12 15c0-3-2-5.5-6-5.5 0 3.5 2.4 5.5 6 5.5Z" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10.5h18M7 15h3" /></>,
  bank: <><path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3.5 20h17" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5" /></>,
  cash: <><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  camera: <><path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4Z" /><circle cx="12" cy="13" r="3.5" /></>,
  sparkle: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7ZM19 15c.3 1.9 1 2.7 3 3-2 .3-2.7 1.1-3 3-.3-1.9-1-2.7-3-3 2-.3 2.7-1.1 3-3Z" />,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3M8.5 17.5h.01M12 17.5h.01" /></>,
  printer: <><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  barrel: <><ellipse cx="12" cy="5.5" rx="6.5" ry="2.5" /><path d="M5.5 5.5v13c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-13" /><path d="M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></>,
  factory: <><path d="M3 20.5V10l5 3V10l5 3V10l5 3V4h3v16.5Z" /><path d="M7 17h2M12 17h2" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  chart: <><path d="M4 4v16h16" /><path d="M8 15v-3M12 15V8M16 15v-5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5 6.8 16M17.2 8l2.6-1.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  hand: <><path d="M7 11.5V6a1.5 1.5 0 0 1 3 0v4.5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.8L8 14" /></>,
  folder: <path d="M3.5 6.5h6l2 2.5h9v10.5h-17Z" />,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.8-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.8 16.7 3.5 12 3.5Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.3" r="1" /><circle cx="14.5" cy="7.3" r="1" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  send: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, className, strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {P[name]}
    </svg>
  );
}

/** Quick Register / desk emoji → the matching line icon, for the designed looks. */
export const EMOJI_ICON: Record<string, IconName> = {
  "💰": "rupee",
  "🧾": "bill",
  "🫗": "drop",
  "🙌": "arrowIn",
  "🛒": "cart",
  "🤝": "userPlus",
  "🌾": "sprout",
  "💳": "card",
  "🏦": "bank",
  "🧔": "user",
  "💵": "cash",
  "📦": "box",
  "🧮": "calc",
  "🖨️": "printer",
  "📸": "camera",
  "✨": "sparkle",
  "➕": "plus",
  "🛢️": "barrel",
  "🏭": "factory",
  "🔗": "link",
};

/** The oil-drop brand mark (logo), drawn in the current colour. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 2.8c3.6 4.4 6.2 8 6.2 11.3a6.2 6.2 0 0 1-12.4 0c0-3.3 2.6-6.9 6.2-11.3Z" fill="currentColor" />
      <path d="M9.2 14.6a3 3 0 0 0 2.6 2.9" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
