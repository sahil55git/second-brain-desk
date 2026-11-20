"use client";
import { useBatteryFree } from "@/lib/keepAwake";

/** Shown only in the Android app when Android may stop the app to save battery (that cuts the scale and printer). */
export default function BatteryWarning({ compact = false }: { compact?: boolean }) {
  const [free, ask] = useBatteryFree();
  if (free !== false) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: compact ? "8px 10px" : "12px 14px", borderRadius: 12, background: "#3a2a12", border: "1px solid #b7862b", color: "#ffe2a8", fontSize: compact ? 13 : 14 }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        Battery saver can cut the scale and printer Bluetooth. Allow Mahadev Desk to run without battery limits.
      </span>
      <button onClick={ask} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e0a94a", background: "#5a3f12", color: "#fff", fontWeight: 600 }}>
        Allow
      </button>
    </div>
  );
}
