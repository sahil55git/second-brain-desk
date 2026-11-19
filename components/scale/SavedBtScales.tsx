"use client";

// Live Scales → Bluetooth: the shop's saved scales. The owner adds a scale once (name, which
// Bluetooth device, what it is used for, speed) and tests it; every phone, tablet and computer
// then picks one with a single tap. Saved under the "btScales" app setting.
import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/components/AccessProvider";
import { useScale } from "@/components/ScaleProvider";
import { BT_BAUDS, BT_USES, btProfileProblem, isActiveProfile, newBtScaleId, parseBtScales, profileToConfig, removeBtScale, upsertBtScale, type BtScaleProfile, type BtUse } from "@/lib/btScaleProfiles";
import { linkLabel } from "@/lib/scaleLink";
import type { NativeScaleDevice } from "@/lib/native";

const btn = "rounded px-3 py-1.5 text-sm border border-black/20 dark:border-white/20";
const btnMain = "rounded px-3 py-1.5 text-sm bg-[var(--accent)] text-[var(--accent-contrast)]";
const field = "w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm";
const USE_LABEL: Record<BtUse, string> = { any: "Any use", counter: "Counter", barrels: "Barrels", purchase: "Purchase" };

export default function SavedBtScales() {
  const { bt } = useScale();
  const { isOwner } = useAccess();
  const [list, setList] = useState<BtScaleProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState<BtScaleProfile | null>(null);
  const [devices, setDevices] = useState<NativeScaleDevice[] | null>(null);
  const [btOff, setBtOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    fetch("/api/settings/app?key=btScales", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setList(parseBtScales(j?.data)))
      .catch(() => setMsg("Could not load the saved scales. Check the internet."))
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback(async (next: BtScaleProfile[]): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "btScales", data: { scales: next } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save.");
      setList(next);
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const startNew = () => {
    setMsg("");
    setDevices(null);
    setDraft({ id: newBtScaleId(), name: "", use: "any", deviceId: "", deviceName: "", kind: bt.support === "serial" ? "serial" : "native", baud: 9600 });
  };
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
  const choosePort = async () => {
    setMsg("");
    try {
      await bt.chooseSerial();
    } catch (e) {
      if ((e as { name?: string })?.name !== "NotFoundError") setMsg(e instanceof Error ? e.message : "Could not open the list of ports.");
    }
  };
  // the form's scale for a computer is whatever port this browser has open now
  const draftFull = (d: BtScaleProfile): BtScaleProfile => (d.kind === "serial" && bt.config?.kind === "serial" ? { ...d, deviceName: bt.config.name } : d);
  const test = () => {
    if (!draft) return;
    const d = draftFull(draft);
    if (d.kind === "native" && !d.deviceId) { setMsg("Choose the scale first."); return; }
    setMsg("");
    bt.applyConfig(profileToConfig(d));
  };
  const save = async () => {
    if (!draft) return;
    const d = draftFull(draft);
    const problem = btProfileProblem(d, list);
    if (problem) { setMsg(problem); return; }
    setMsg("");
    if (await persist(upsertBtScale(list, d))) { setDraft(null); setDevices(null); }
  };
  const remove = async (p: BtScaleProfile) => {
    if (!window.confirm(`Remove the saved scale "${p.name}" for every device?`)) return;
    await persist(removeBtScale(list, p.id));
  };

  const live = bt.live;
  const fresh = !!live && bt.state.status === "live";

  return (
    <div className="space-y-2 border-b border-black/10 dark:border-white/10 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">Saved scales</strong>
        <span className="text-xs opacity-70">shared by every device</span>
        <span className="flex-1" />
        {isOwner && !draft && <button className={btnMain} onClick={startNew} disabled={bt.support === "none"}>+ Add Bluetooth scale</button>}
      </div>
      {msg && <p className="text-sm text-red-700 dark:text-red-300">{msg}</p>}
      {loaded && !list.length && !draft && <p className="text-sm opacity-70">{isOwner ? "No scale saved yet. Add the first one." : "No scale saved yet. Ask the owner to add one."}</p>}

      {list.map((p) => {
        const active = isActiveProfile(p, bt.config);
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
            <span aria-hidden>🔵</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{p.name} <span className="ml-1 rounded-full border border-black/15 dark:border-white/20 px-2 py-0.5 text-xs font-normal">{USE_LABEL[p.use]}</span></div>
              <div className="text-xs opacity-70">{p.deviceName || (p.kind === "serial" ? "Computer port" : "")} · {p.baud} baud{active ? ` · ${linkLabel(bt.state, now)}` : ""}</div>
            </div>
            {active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">In use here</span> : <button className={btnMain} onClick={() => bt.applyConfig(profileToConfig(p))} disabled={p.kind !== bt.support}>Use here</button>}
            {isOwner && <button className={btn} onClick={() => { setMsg(""); setDevices(null); setDraft(p); }}>Edit</button>}
            {isOwner && <button className="text-xs underline opacity-60" onClick={() => void remove(p)} disabled={busy}>remove</button>}
          </div>
        );
      })}

      {isOwner && draft && (
        <div className="space-y-3 rounded-lg border-2 border-black/15 dark:border-white/20 p-3">
          <strong className="text-sm">{list.some((x) => x.id === draft.id) ? "Edit scale" : "Add Bluetooth scale"}</strong>
          {draft.kind === "native" ? (
            <div className="space-y-1">
              <div className="text-xs opacity-70">1. Scale (paired in the phone&apos;s Bluetooth settings first)</div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn} onClick={findNative}>{draft.deviceId ? "Change scale" : "Choose scale"}</button>
                {draft.deviceId && <span className="text-sm">{draft.deviceName} <span className="font-mono text-xs opacity-50">{draft.deviceId}</span></span>}
              </div>
              {btOff && <p className="text-sm text-red-700 dark:text-red-300">Bluetooth is off. Turn it on and press Choose scale again.</p>}
              {devices && !btOff && (
                <div className="space-y-1">
                  {!devices.length && <p className="text-sm opacity-80">No paired device found. Switch the scale on and pair it in Android Settings → Bluetooth (PIN is usually 1234 or 0000).</p>}
                  {devices.map((d) => (
                    <button key={d.id} className={`block w-full text-left ${btn}`} onClick={() => { setDraft({ ...draft, deviceId: d.id, deviceName: d.name, name: draft.name || d.name }); setDevices(null); }}>
                      {d.scale ? "⚖️ " : ""}{d.name} <span className="font-mono text-xs opacity-50">{d.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs opacity-70">1. Port (pair the scale in Windows Bluetooth settings first). Each computer picks its port again.</div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn} onClick={choosePort}>{bt.config?.kind === "serial" ? "Change port" : "Choose port"}</button>
                {bt.config?.kind === "serial" && <span className="text-sm">{bt.config.name}</span>}
              </div>
            </div>
          )}
          <label className="block text-sm"><span className="text-xs opacity-70">2. Name</span>
            <input className={field} value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Counter scale" />
          </label>
          <div className="text-sm">
            <span className="text-xs opacity-70">3. Used for</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {BT_USES.map((u) => <button key={u} className={draft.use === u ? btnMain : btn} onClick={() => setDraft({ ...draft, use: u })}>{USE_LABEL[u]}</button>)}
            </div>
          </div>
          <label className="block text-sm"><span className="text-xs opacity-70">4. Speed (baud). 9600 suits most scales</span>
            <select className={field} value={draft.baud} onChange={(e) => setDraft({ ...draft, baud: Number(e.target.value) })}>
              {BT_BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <div className="text-xs opacity-70">5. Test reading (uses this device&apos;s connection)</div>
            <div className="flex flex-wrap items-center gap-3">
              <button className={btn} onClick={test}>Test scale</button>
              <span className={`font-mono text-2xl font-bold tabular-nums ${fresh ? "" : "opacity-40"}`}>{live ? live.grossKg.toFixed(3) : "0.000"} kg</span>
              <span className="text-xs">{!fresh ? <span className="opacity-60">{bt.state.status === "off" ? "Not tested yet" : linkLabel(bt.state, now)}</span> : live!.steady ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">STEADY</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">MOVING</span>}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => { setDraft(null); setDevices(null); setMsg(""); }}>Cancel</button>
            <button className={btnMain} onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save scale"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
