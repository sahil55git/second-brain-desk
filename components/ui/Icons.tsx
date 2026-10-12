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
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" /></>,
  book: <><path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3Z" /><path d="M5 16.5a3 3 0 0 1 3-3h11" /><path d="M9 8h6" /></>,
  split: <><circle cx="12" cy="6" r="1.4" /><circle cx="12" cy="18" r="1.4" /><path d="M5 12h14" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  alert: <><path d="M12 4 21.5 20h-19Z" /><path d="M12 10v4.5M12 17.3h.01" /></>,
  clip: <path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7" />,
  note: <><path d="M5 3.5h10l4 4v13H5Z" /><path d="M15 3.5v4h4M8.5 12h7M8.5 15.5h5" /></>,
  shop: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8.5h13V12M10 20.5v-5h4v5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5" /><path d="M18 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H11" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  upload: <><path d="M12 15V4M7 8.5 12 4l5 4.5" /><path d="M4.5 15v4.5h15V15" /></>,
  file: <><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="m5 7-2.5 6a2.5 2.5 0 0 0 5 0Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0Z" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r="1" /><circle cx="4.8" cy="12" r="1" /><circle cx="4.8" cy="17.5" r="1" /></>,
  scissors: <><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8 20 18M8 16 20 6" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12.5" rx="2" /><path d="M9 20.5h6M12 16.5v4" /></>,
  pen: <><path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4Z" /><path d="M13 7l4 4" /></>,
  chat: <path d="M4.5 5.5h15v10H11l-4.5 4v-4h-2Z" />,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5.5-5 4 3.5 2.5-2 4.5 4" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5Z" /></>,
  truck: <><path d="M3 6.5h11v10H3ZM14 10h4l3 3.5v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5Z" /><path d="m3.5 13 8.5 4.5 8.5-4.5" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" />,
  cup: <><path d="M5 9h11v5a5 5 0 0 1-10 0Z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5" /></>,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2Z" />,
  tag: <><path d="M3.5 12V4.5H11l9 9-7.5 7.5Z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  fuel: <><path d="M5 20.5V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5v15M3.5 20.5h12M7.5 8h4" /><path d="M14 11h2a1.5 1.5 0 0 1 1.5 1.5v4a1.3 1.3 0 0 0 2.5 0V8.5L17.5 6" /></>,
  can: <><rect x="6" y="4.5" width="12" height="15.5" rx="2" /><path d="M6 8.5h12M9 2.5h6" /></>,
  bag: <><path d="M5.5 8h13l-1 12.5h-11Z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></>,
  hash: <path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16" />,
  hourglass: <><path d="M7 3.5h10M7 20.5h10" /><path d="M8 3.5c0 4 8 4.5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 4.5-8 8.5" /></>,
  undo: <><path d="M9 7 4.5 11.5 9 16" /><path d="M4.5 11.5h10a5 5 0 0 1 0 10H12" /></>,
  invoice: <><path d="M6 3h12v18H6Z" /><path d="M9 7.5h6M9 11h6M9 14.5h3.5M14.5 17h.01" /><path d="M15 14.5h1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8h.01" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  size: <><path d="M4 18 8.5 6h1L14 18M5.6 14h6.8" /><path d="M15.5 18l2.7-7h.6l2.7 7M16.4 15.8h4.2" /></>,
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
  "💰": "rupee", "🧾": "bill", "🫗": "drop", "🙌": "arrowIn", "🛒": "cart", "🤝": "userPlus", "🌾": "sprout",
  "💳": "card", "🏦": "bank", "🧔": "user", "💵": "cash", "📦": "box", "🧮": "calc", "🖨️": "printer",
  "📸": "camera", "📷": "camera", "✨": "sparkle", "➕": "plus", "🛢️": "barrel", "🏭": "factory", "🔗": "link",
  "📱": "phone", "🟣": "wallet", "📒": "book", "➗": "split", "📍": "pin", "👤": "user", "⚠️": "alert", "⚠": "alert",
  "📎": "clip", "⭐": "star", "⚙️": "gear", "🛺": "truck", "📝": "note", "🧰": "grid", "✏️": "pen", "✎": "pen",
  "🏪": "shop", "🙋": "user", "🌤️": "sun", "🌙": "moon", "🗄️": "external", "📅": "calendar", "🕘": "clock",
  "📤": "upload", "📄": "file", "⚖️": "scale", "🧴": "drop", "📋": "list", "✂️": "scissors", "🖥️": "monitor",
  "📚": "book", "✍️": "pen", "💬": "chat", "🖼️": "image", "👀": "eye", "🗣️": "globe", "🎤": "mic", "🎨": "palette",
  "📊": "chart", "🗂️": "folder", "⬇": "arrowDown", "⬆": "arrowUp", "🟤": "layers", "⏳": "hourglass",
  "🌻": "drop", "🟠": "drop", "🥜": "drop", "🟡": "drop", "🥫": "can", "🏷️": "tag", "⛽": "fuel", "☕": "cup",
  "💡": "bolt", "🔧": "wrench", "👷": "user", "🚚": "truck", "🛍️": "bag", "🔢": "hash", "➜": "send", "🚨": "alert", "ℹ️": "info", "🔍": "search", "🛡️": "shield", "📁": "folder", "✅": "check", "🤳": "camera", "👍": "hand", "🚛": "truck", "📃": "invoice",
};

/** Item colours for the oil / seed glyphs (so Sunflower, Karadi … stay easy to tell apart). */
export const EMOJI_TINT: Record<string, string> = {
  "🌻": "#e9b31d", "🟠": "#ea7a2a", "🥜": "#b07a45", "🧴": "#7a5ae0", "🟡": "#d4b21a", "🟤": "#8a5a3c", "🫗": "#e0a01c",
};

/**
 * Mahadev logo: the leaf mark from the brand board (Earth & Clay logo, E-series).
 * Colours come from CSS so every look can tint it:
 *   --lg-a  leaf colour      --lg-mark  vein (usually the tile colour)
 */
export function BrandMark({ size = 22 }: { size?: number; detail?: boolean }) {
  return (
    <svg className="mlogo" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <g className="mlogo-leaf">
        <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" style={{ fill: "var(--lg-a, #efe7d8)" }} />
        <path d="M5 19 13 11" fill="none" style={{ stroke: "var(--lg-mark, #7d8b6a)" }} strokeWidth={size < 30 ? 1.6 : 1.2} strokeLinecap="round" />
      </g>
    </svg>
  );
}
