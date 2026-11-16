"use client";

// Live Scales → Bluetooth scale: choose it once, see the live weight, check it against the
// scale's own display, and see today's saved weights.
import { useCallback, useEffect, useState } from "react";
import { useScale } from "@/components/ScaleProvider";
import { linkLabel } from "@/lib/scaleLink";
import { businessDate } from "@/lib/register";
import type { NativeScaleDevice } from "@/lib/native";

interface Tick {
  id: string;
  source: string;
  weightKg: number;
  settledAt: string;
  usedBarrelCode: string | null;
  usedPhase: string | null;
}

const DOT: Record<string, string> = {
  live: "bg-emerald-500",
  silent: "bg-amber-500",
  connecting: "bg-amber-500 animate-pulse",
  waiting: "bg-red-500 animate-pulse",
  blocked: "bg-red-500",
  off: "bg-black/30 dark:bg-white/30",
};
const btn = "rounded px-3 py-1.5 text-sm border border-black/20 dark:border-white/20";
const btnMain = "rounded px-3 py-1.5 text-sm bg-[var(--accent)] text-[var(--accent-contrast)]";
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function BluetoothScalePanel() {
  const { bt, selectedScale, setSelectedScale } = useScale();
  const [now, setNow] = useState(() => Date.now());
  const [devices, setDevices] = useState<NativeScaleDevice[] | null>(null);
  const [btOff, setBtOff] = useState(false);
  const [msg, setMsg] = useState("");
  const [date, setDate] = useState(() => businessDate(Date.now()));
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [logErr, setLogErr] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/scale-ticks/log?date=${date}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load the weighing log.");
      setTicks(j.data);
      setLogErr("");
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : "Could not load the weighing log.");
    }
  }, [date]);
  const savedAt = bt.lastSaved?.at;
  useEffect(() => {
    void loadLog();
  }, [loadLog, savedAt]);

  const findNative = async () => {
    setMsg("");
    try {
      const r = await bt.listNative();
      setBtOff(!r.bluetoothOn);
      setDevices(r.devices.sort((a, b) => Number(b.scale) - Number(a.scale) || a.name.localeCompare(b.name)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read the paired Bluetooth devices.");
    }
  };
  const choosePc = async () => {
    setMsg("");
    try {
      await bt.chooseSerial();
    } catch (e) {
      // closing the browser's list without choosing is not an error worth showing
      if ((e as { name?: string })?.name !== "NotFoundError") setMsg(e instanceof Error ? e.message : "Could not open the list of ports.");
    }
  };
  const csv = () => {
    const rows = [["Date", "Time", "Scale", "Weight kg", "Used for"], ...ticks.map((t) => [date, timeOf(t.settledAt), t.source, t.weightKg.toFixed(3), t.usedBarrelCode ? `${t.usedBarrelCode} ${t.usedPhase || ""}`.trim() : ""])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weighing-log-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = bt.state;
  const live = bt.live;
  const fresh = !!live && s.status === "live";
  const on = s.status !== "off";
  const total = ticks.reduce((a, t) => a + t.weightKg, 0);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[s.status]}`} />
        <strong className="text-sm">Bluetooth scale{bt.config ? ` · ${bt.config.name}` : ""}</strong>
        <span className="text-sm opacity-70">{bt.config ? linkLabel(s, now) : "Not set up on this device"}</span>
        <span className="flex-1" />
        {bt.config && !on && <button className={btnMain} onClick={bt.connect}>Connect</button>}
        {bt.config && (s.status === "waiting" || s.status === "blocked") && <button className={btnMain} onClick={bt.retryNow}>Try now</button>}
        {bt.config && on && <button className={btn} onClick={bt.disconnect}>Disconnect</button>}
      </div>

      {bt.support === "none" && (
        <p className="text-sm opacity-80">
          This browser cannot open a Bluetooth scale. On the phone use the <strong>Mahadev Desk app</strong> (update it from the App page if this message shows inside the app). On a computer use <strong>Chrome or Edge</strong>.
        </p>
      )}
      {s.error && s.status !== "live" && <p className="text-sm text-red-700 dark:text-red-300">{s.error}</p>}
      {msg && <p className="text-sm text-red-700 dark:text-red-300">{msg}</p>}

      {bt.config && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className={`text-6xl font-bold tabular-nums ${fresh ? "" : "opacity-40"}`}>
              {live ? live.weightKg.toFixed(3) : "0.000"}
              <span className="ml-2 text-base font-normal">kg</span>
            </div>
            <div className="mt-1 text-xs">
              {!fresh ? <span className="opacity-60">No live weight</span> : live!.steady ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">STEADY</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">MOVING</span>}
              {bt.source && <span className="ml-2 font-mono opacity-55">{bt.source}</span>}
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bt.checked} onChange={(e) => bt.setChecked(e.target.checked)} />
              <span>I compared this with the scale&apos;s own display and it is correct</span>
            </label>
            {!bt.checked && <p className="text-xs opacity-70">Until this is ticked the scale is watch-only: no weight is filled into a form or saved.</p>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bt.autoRecord} onChange={(e) => bt.setAutoRecord(e.target.checked)} disabled={!bt.checked} />
              <span>Save every steady weight to the weighing log</span>
            </label>
            {bt.source && bt.checked && selectedScale !== bt.source && (
              <button className={btn} onClick={() => setSelectedScale(bt.source!)}>Use this scale to fill weights in forms</button>
            )}
            {bt.queued > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{bt.queued} weight(s) kept on this device, waiting for the internet.</p>}
          </div>
        </div>
      )}

      {/* choosing the scale */}
      {bt.support === "native" && (
        <div className="space-y-2">
          <button className={bt.config ? btn : btnMain} onClick={findNative}>{bt.config ? "Change scale" : "Choose scale"}</button>
          {btOff && <p className="text-sm text-red-700 dark:text-red-300">Bluetooth is off. Turn it on and press Choose scale again.</p>}
          {devices && !btOff && (
            <div className="space-y-1">
              {!devices.length && <p className="text-sm opacity-80">No paired device found. Switch the scale on, pair it in Android Settings → Bluetooth (PIN is usually 1234 or 0000), then come back.</p>}
              {devices.map((d) => (
                <button key={d.id} className={`block w-full text-left ${btn}`} onClick={() => { bt.pickNative(d); setDevices(null); }}>
                  {d.scale ? "⚖️ " : ""}{d.name} <span className="font-mono text-xs opacity-50">{d.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {bt.support === "serial" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className={bt.config ? btn : btnMain} onClick={choosePc}>{bt.config ? "Change scale" : "Choose scale"}</button>
          {bt.config && (
            <label className="flex items-center gap-1">
              Speed
              <select value={bt.config.baud} onChange={(e) => bt.setBaud(Number(e.target.value))} className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1 py-1">
                {[9600, 2400, 4800, 19200].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          )}
          {!bt.config && <span className="opacity-70">Pair the scale in Windows Bluetooth settings first, then pick it (or its COM port) from the list.</span>}
        </div>
      )}

      {bt.config && (
        <div className="text-xs">
          <button className="underline opacity-70" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide" : "Show"} what the scale is sending</button>
          {bt.config && <button className="ml-4 underline opacity-70" onClick={bt.forget}>Remove this scale from this device</button>}
          {showRaw && (
            <div className="mt-1 rounded bg-black/5 dark:bg-white/10 p-2 font-mono leading-5 whitespace-pre">
              {bt.lines.length ? bt.lines.map((l, i) => <div key={i} className={l.ok ? "" : "text-red-700 dark:text-red-300"}>{l.ok ? "✓ " : "✗ "}{l.text}</div>) : "Nothing received yet."}
            </div>
          )}
        </div>
      )}

      {/* weighing log */}
      <div className="border-t border-black/10 dark:border-white/10 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong>Weighing log</strong>
          <input type="date" value={date} max={businessDate(Date.now())} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1" />
          <button className={btn} onClick={() => void loadLog()}>Refresh</button>
          {!!ticks.length && <button className={btn} onClick={csv}>⬇ CSV</button>}
          <span className="opacity-70">{ticks.length} weighing(s) · {total.toFixed(2)} kg</span>
        </div>
        {logErr && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{logErr}</p>}
        {!!ticks.length && (
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs opacity-60"><tr><th className="py-1">Time</th><th>Scale</th><th className="text-right">Weight kg</th><th className="pl-3">Used for</th></tr></thead>
              <tbody>
                {ticks.map((t) => (
                  <tr key={t.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="py-1 tabular-nums">{timeOf(t.settledAt)}</td>
                    <td className="font-mono text-xs">{t.source}</td>
                    <td className="text-right tabular-nums font-semibold">{t.weightKg.toFixed(3)}</td>
                    <td className="pl-3 text-xs">{t.usedBarrelCode ? `${t.usedBarrelCode} ${t.usedPhase || ""}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
