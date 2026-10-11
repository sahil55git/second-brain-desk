"use client";

// "Use scale weight" — takes the live, STEADY reading from the scale bridge
// into a field with one tap. Nothing happens while the reading is moving or old.
import { useScale } from "@/components/ScaleProvider";

export const SCALE_FRESH_MS = 10_000;

export default function ScaleCapture({ onUse, label = "Use scale weight", compact = false }: { onUse: (kg: number) => void; label?: string; compact?: boolean }) {
  const { connected, selectedReading, selectedScale } = useScale();
  const r = selectedReading;
  const fresh = !!r && Date.now() - r.receivedAt < SCALE_FRESH_MS;
  const steady = fresh && r!.stable !== false && Number.isFinite(r!.weight) && r!.weight > 0;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${compact ? "" : "rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2"}`}>
      <span className={`h-2 w-2 rounded-full ${connected && fresh ? (steady ? "bg-emerald-500" : "bg-amber-500") : "bg-red-500"}`} />
      {!compact && <strong>Scale</strong>}
      {!compact && <span className="font-mono opacity-65">{selectedScale || "not selected"}</span>}
      <span className="tabular-nums font-semibold">{r && fresh ? `${r.weight.toFixed(2)} ${r.unit || "kg"}${steady ? "" : " (moving)"}` : connected ? "No reading" : "Scale bridge not running"}</span>
      <button
        type="button"
        disabled={!steady}
        onClick={() => r && onUse(Math.round(r.weight * 100) / 100)}
        className="rounded border border-[var(--accent)] text-[var(--accent-ink)] px-2 py-1 font-medium disabled:opacity-40"
        title={steady ? "" : "Wait for a steady reading"}
      >
        ⚖️ {label}
      </button>
    </div>
  );
}
