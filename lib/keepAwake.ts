"use client";
// Weighing screens keep the phone's screen on: a sleeping phone pauses the page, and on cheap phones
// Android may also cut Bluetooth. Only in the Android app (newer builds); elsewhere it does nothing.
import { useEffect, useState } from "react";
import { MahadevScale, hasNativeScale } from "@/lib/native";

let holders = 0;
function apply() {
  if (!hasNativeScale()) return;
  MahadevScale.keepAwake({ on: holders > 0 }).catch(() => {
    /* older app: no keep-awake */
  });
}

/** Keep the screen on while the calling screen is open. */
export function useKeepAwake(on = true) {
  useEffect(() => {
    if (!on) return;
    holders++;
    apply();
    return () => {
      holders = Math.max(0, holders - 1);
      apply();
    };
  }, [on]);
}

/** null = unknown / not the app; false = Android may stop the app to save battery (cuts scale and printer). */
export function useBatteryFree(): [boolean | null, () => void] {
  const [free, setFree] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hasNativeScale()) return;
    let alive = true;
    const check = () =>
      MahadevScale.batteryStatus()
        .then((r) => alive && setFree(!!r.unrestricted))
        .catch(() => alive && setFree(null));
    void check();
    const onVis = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const ask = () => void MahadevScale.askBattery().catch(() => {});
  return [free, ask];
}
