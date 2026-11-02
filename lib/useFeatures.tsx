"use client";

// Feature switches on the client: cached in this browser so pages do not flicker, refreshed from
// the shop-wide setting (Settings → Features). See lib/features.ts.
import { useEffect, useState } from "react";
import { isOn, pathOn, type FeatureState } from "@/lib/features";

const KEY = "features-v1";
const EVT = "features-change";
let mem: FeatureState | null = null;
let loading: Promise<void> | null = null;

function readLocal(): FeatureState | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function setFeaturesLocal(s: FeatureState) {
  mem = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new CustomEvent(EVT));
}
function refresh() {
  loading ||= fetch("/api/settings/app?key=features").then((r) => r.json()).then((j) => { if (j && "data" in j) setFeaturesLocal(j.data || { off: [] }); }).catch(() => {}).finally(() => { setTimeout(() => { loading = null; }, 30000); });
  return loading;
}

export function useFeatures() {
  const [s, setS] = useState<FeatureState | null>(() => mem);
  useEffect(() => {
    if (!mem) { mem = readLocal(); setS(mem); }
    void refresh();
    const on = () => setS(mem);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return { state: s, on: (k: string) => isOn(s, k), pathOn: (p: string) => pathOn(s, p) };
}

/** Wrap a page: shows a short note instead when its feature is switched off. */
export function FeatureGate({ k, children }: { k: string; children: React.ReactNode }) {
  const f = useFeatures();
  if (!f.on(k)) {
    return (
      <div className="hub">
        <section className="hub-card" style={{ maxWidth: 560 }}>
          <h3>This feature is switched off</h3>
          <p className="hub-m">The owner can turn it on in Settings → 🧩 Features.</p>
          <a className="hub-btn" href="/settings?section=features">🧩 Open Features</a>
        </section>
      </div>
    );
  }
  return <>{children}</>;
}
