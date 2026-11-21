"use client";

// A big number pad for the payment dialogs, so the phone's full letter keyboard never opens.
// Keys: 1-9, 0, backspace, and either "." (when paise are allowed) or clear.
export function padPress(value: string, key: string, allowDot: boolean): string {
  if (key === "C") return "";
  if (key === "⌫") return value.slice(0, -1);
  if (key === ".") return allowDot && !value.includes(".") ? (value || "0") + "." : value;
  if (!/^\d$/.test(key)) return value;
  if (value.includes(".") && value.split(".")[1].length >= 2) return value;
  if (value === "0") return key;
  return (value + key).slice(0, 9);
}

export default function NumPad({ value, onChange, allowDot = false }: { value: string; onChange: (v: string) => void; allowDot?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDot ? "." : "C", "0", "⌫"];
  return (
    <div className="np" role="group" aria-label="Number pad">
      {keys.map((k) => (
        <button key={k} type="button" className={k === "⌫" || k === "C" ? "np-fn" : ""} aria-label={k === "⌫" ? "Backspace" : k === "C" ? "Clear" : k} onClick={() => onChange(padPress(value, k, allowDot))}>
          {k}
        </button>
      ))}
    </div>
  );
}

/** Small inline icons so the staff do not have to read the buttons. */
export const TickIcon = () => (
  <svg className="rp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const CoinIcon = () => (
  <svg className="rp-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8.5 7.5h7M8.5 11h7M9.5 7.5c3.6 0 4.8 1.2 4.8 3.2s-1.4 3.1-4.8 3.1l4.4 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const ArrowIcon = () => (
  <svg className="rp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const OilIcon = () => (
  <svg className="rp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 4.2 6 7.3 6 10.6a6 6 0 01-12 0c0-3.300 2.400-6.400 6-10.600z" fill="currentColor" /><path d="M9 14a3 3 0 003 3" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
