"use client";

import { useMemo, useState } from "react";
import { useScale } from "./ScaleProvider";

const SCALE_NAMES: Record<string, string> = {
  "192.168.1.61": "Essae Primary Counter",
  "192.168.1.62": "Tank / Bulk Station",
};

export default function ScaleDashboard() {
  const { readings, connected, socketUrl, selectedScale, setSelectedScale, setSocketUrl, reconnect } = useScale();
  const [draftUrl, setDraftUrl] = useState(socketUrl);
  const cards = useMemo(() => {
    const expected = ["192.168.1.61", "192.168.1.62"];
    return Array.from(new Set([...expected, ...Object.keys(readings)]));
  }, [readings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 p-3">
        <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
        <strong className="text-sm">{connected ? "Local bridge connected" : "Local bridge offline"}</strong>
        <input value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} className="min-w-[230px] flex-1 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1 text-sm font-mono" />
        <button onClick={() => { setSocketUrl(draftUrl); reconnect(); }} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 text-sm">Save & reconnect</button>
      </div>
      <p className="text-xs opacity-65">Live readings come directly from the Windows bridge on this computer. Green means a packet arrived recently. Select one scale to drive automatic form entry.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((source) => {
          const r = readings[source];
          const fresh = !!r && Date.now() - r.receivedAt < 10000;
          return (
            <button key={source} onClick={() => setSelectedScale(source)} className={`text-left rounded-xl border-2 p-5 transition ${selectedScale === source ? "border-[var(--accent)]" : "border-black/10 dark:border-white/10"}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{SCALE_NAMES[source] || "Unregistered scale"}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${fresh ? "bg-emerald-100 text-emerald-800" : "bg-black/10 opacity-60"}`}>{fresh ? "LIVE" : "WAITING"}</span>
              </div>
              <div className="mt-1 text-xs opacity-55 font-mono">{source}</div>
              <div className="mt-4 text-5xl font-bold tabular-nums">{r ? r.weight.toFixed(2) : "0.00"}<span className="ml-2 text-base font-normal">{r?.unit || "kg"}</span></div>
              {selectedScale === source && <div className="mt-3 text-xs text-[var(--accent-ink)]">Selected for automatic entry</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

