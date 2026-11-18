// Small oil-bottle symbol used wherever staff "give oil" (replaces the old box emoji).
export default function OilIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="oil-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ verticalAlign: "-0.2em", flex: "none" }}>
      <rect x="9.5" y="1.6" width="5" height="2.6" rx="1" fill="#6b7280" />
      <path d="M10 4.2h4v2.2c0 .7.5 1.3 1.1 1.7 1.2.8 1.9 2 1.9 3.5V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8.4c0-1.5.7-2.7 1.9-3.5.6-.4 1.1-1 1.1-1.7V4.2z" fill="#f5b83d" stroke="#b7791f" strokeWidth="1" strokeLinejoin="round" />
      <rect x="8.4" y="12.2" width="7.2" height="5.2" rx="1" fill="#fff8e1" opacity=".9" />
      <path d="M10.2 8.9c.4-.5 1-.8 1.6-.8" stroke="#fff" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".8" />
    </svg>
  );
}

export function CoinIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="coin-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ verticalAlign: "-0.25em", flex: "none" }}>
      <circle cx="12" cy="12" r="10" fill="#f5c542" stroke="#b7791f" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="#b7791f" strokeWidth="1" opacity=".7" />
      <path d="M8.6 7.6h6.8M8.6 10.4h6.8M10 7.6c3 0 4.2 1.2 4.2 2.8S13 13.2 10 13.2l4.4 3.4" stroke="#6b4a0a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function DropIcon({ size = 20 }: { size?: number }) {
  return (
    <svg className="drop-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ verticalAlign: "-0.2em", flex: "none" }}>
      <path d="M12 2.5C9 7 5.5 10.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 2.5z" fill="#f5b83d" stroke="#b7791f" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 15a3 3 0 0 0 2.2 2.8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".85" />
    </svg>
  );
}

export function ArrowIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.75)} viewBox="0 0 40 30" aria-hidden focusable="false" style={{ flex: "none" }}>
      <path d="M2 15h26M20 6l9 9-9 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 22, color = "#22c55e" }: { size?: number; color?: string }) {
  return (
    <svg width={Math.round(size * 0.6)} height={size} viewBox="0 0 24 40" aria-hidden focusable="false" style={{ flex: "none", color }}>
      <path d="M12 3v30M4 24l8 9 8-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
export function ArrowUpIcon({ size = 22, color = "#ef4444" }: { size?: number; color?: string }) {
  return (
    <svg width={Math.round(size * 0.6)} height={size} viewBox="0 0 24 40" aria-hidden focusable="false" style={{ flex: "none", color }}>
      <path d="M12 37V7M4 16l8-9 8 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function PersonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flex: "none" }}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

/** The "oil goes to the customer" picture: bottle, the word Oil, the kg, an arrow, the customer. Staff need no English. */
export function OilOut({ kg, size = 1 }: { kg?: string; size?: number }) {
  return (
    <span className="oil-out" style={{ display: "inline-flex", alignItems: "center", gap: `${10 * size}px` }}>
      <OilIcon size={Math.round(44 * size)} />
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.05 }}>
        <b style={{ fontSize: `${28 * size}px`, fontWeight: 700 }}>Oil</b>
        {kg ? <b style={{ fontSize: `${18 * size}px`, fontWeight: 700 }}>{kg}</b> : null}
      </span>
      <ArrowIcon size={Math.round(30 * size)} />
      <PersonIcon size={Math.round(32 * size)} />
    </span>
  );
}

const L = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const wrap = { flex: "none", verticalAlign: "-0.25em" } as const;

export function PhoneIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /><path d="M9.5 9.5l2 2 3-3.5" />
    </svg>
  );
}
export function BookIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L}>
      <path d="M6 3h11a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H6z" /><path d="M6 3v18M10 8h5M10 12h5" />
    </svg>
  );
}
export function PrinterIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L}>
      <path d="M7 9V3h10v6M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" /><rect x="7" y="14" width="10" height="7" rx="1" />
    </svg>
  );
}
export function PauseIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L} strokeWidth={2}>
      <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
export function CrossIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L} strokeWidth={2.2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
export function TickIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={wrap} {...L} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
export function BackArrowIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.75)} viewBox="0 0 40 30" aria-hidden focusable="false" style={{ flex: "none" }}>
      <path d="M38 15H12M20 6l-9 9 9 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
/** Pay-mode picture: coin, phone or ledger book. */
export function PayIcon({ mode, size = 26 }: { mode: "CASH" | "UPI" | "CREDIT" | "SPLIT"; size?: number }) {
  if (mode === "CASH") return <CoinIcon size={size} />;
  if (mode === "UPI") return <span style={{ color: "#8fb0ff", display: "inline-flex" }}><PhoneIcon size={size} /></span>;
  if (mode === "CREDIT") return <span style={{ color: "#f0b94d", display: "inline-flex" }}><BookIcon size={size} /></span>;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><CoinIcon size={Math.round(size * 0.8)} /><span style={{ color: "#8fb0ff", display: "inline-flex" }}><PhoneIcon size={Math.round(size * 0.65)} /></span></span>;
}
/** Oil coming back from the customer: bottle + green arrow down (in). */
export function OilIn({ size = 1 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${6 * size}px` }}>
      <OilIcon size={Math.round(34 * size)} /><ArrowDownIcon size={Math.round(26 * size)} />
    </span>
  );
}
/** Cash going out to the customer: coin + red arrow up (out). */
export function CashOut({ size = 1 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${6 * size}px` }}>
      <CoinIcon size={Math.round(30 * size)} /><ArrowUpIcon size={Math.round(26 * size)} />
    </span>
  );
}
/** Cash coming in from the customer: coin + green arrow down (in). */
export function CashIn({ size = 1 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${6 * size}px` }}>
      <CoinIcon size={Math.round(30 * size)} /><ArrowDownIcon size={Math.round(26 * size)} />
    </span>
  );
}
