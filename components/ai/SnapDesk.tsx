"use client";

// 📸 Photo reading: count bags or tins, read the power meter, a tank gauge or a scale display.
// The reading is shown to check, then saved (meter → Machines power log; others → a photo record).
import { useState } from "react";
import { businessDate } from "@/lib/register";
import { FeatureGate } from "@/lib/useFeatures";

const KINDS = [
  { k: "bags", label: "🧺 Count bags", tip: "Stand back so the whole stack shows" },
  { k: "tins", label: "🥫 Count tins / bottles", tip: "Rows straight, top view if you can" },
  { k: "meter", label: "⚡ Power meter", tip: "Close and straight, no glare" },
  { k: "gauge", label: "📏 Tank gauge / dipstick", tip: "Scale marks must be readable" },
  { k: "scale", label: "⚖️ Scale display", tip: "Only the display in the photo" },
];

async function shrink(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export default function SnapDesk() {
  const [kind, setKind] = useState("bags");
  const [photo, setPhoto] = useState<string | null>(null);
  const [res, setRes] = useState<{ value: number | null; unit: string; how: string; confidence: string } | null>(null);
  const [val, setVal] = useState("");
  const [machine, setMachine] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const read = async (f: File) => {
    setBusy(true); setRes(null); setMsg(null);
    const d = await shrink(f);
    setPhoto(d);
    const r = await fetch("/api/snap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, dataUrl: d }) }).then((x) => x.json()).catch(() => ({ error: "Network problem." }));
    if (r.data) { setRes(r.data); setVal(r.data.value == null ? "" : String(r.data.value)); } else setMsg(r.error);
    setBusy(false);
  };
  const save = async () => {
    const today = businessDate(Date.now());
    const v = Number(val);
    const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let extra = "";
    if (kind === "meter" && machine.trim()) {
      // units used = this reading − the last meter photo for the same machine
      const prev = await fetch("/api/ops-records?kinds=photo_read").then((r) => r.json()).then((j) => ((j.data || []) as { ref: string | null; data: { kind?: string; value?: number; machine?: string } }[]).filter((x) => x.data.kind === "meter" && (x.data.machine || "").toLowerCase() === machine.trim().toLowerCase()).pop()).catch(() => null);
      const units = prev?.data.value != null && v > prev.data.value ? Math.round((v - prev.data.value) * 10) / 10 : null;
      if (units != null) { await post("/api/machines", { date: today, machine: machine.trim(), kind: "run", powerUnits: units, note: `meter ${prev!.data.value} → ${v} (photo)` }); extra = ` · ${units} units logged on ${machine.trim()}`; }
      else extra = " · first meter photo for this machine — units are logged from the next one";
    }
    const ok = (await post("/api/ops-records", { kind: "photo_read", date: today, ref: kind, data: { kind, value: v, unit: res?.unit, how: res?.how, confidence: res?.confidence, machine: machine.trim() || undefined } })).ok;
    setMsg(ok ? `Saved ✓${extra}` : "Could not save");
  };
  const tip = KINDS.find((x) => x.k === kind)?.tip;
  return (
    <FeatureGate k="photoAi">
      <div className="hub">
        <header className="hub-top"><div><h1>📸 Photo reading</h1><div className="hub-m">Take a photo — the app counts or reads it for you to check.</div></div></header>
        <section className="hub-card" style={{ display: "grid", gap: 10, maxWidth: 640 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{KINDS.map((x) => <button key={x.k} className={`hub-btn sm${kind === x.k ? " primary" : ""}`} onClick={() => { setKind(x.k); setRes(null); }}>{x.label}</button>)}</div>
          <small className="hub-m">Tip: {tip}</small>
          <label className="hub-btn primary" style={{ justifySelf: "start" }}>📷 {busy ? "Reading…" : "Take / choose photo"}<input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} /></label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 10, objectFit: "contain" }} />}
          {res && (
            <>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{res.value ?? "?"} <small style={{ fontSize: 16 }}>{res.unit}</small></div>
              <small className="hub-m">{res.how} · confidence {res.confidence}</small>
              <label style={{ display: "grid", gap: 4 }}>Correct it if needed<input type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></label>
              {kind === "meter" && <label style={{ display: "grid", gap: 4 }}>Machine (to log on Machines)<input value={machine} placeholder="Expeller 1" onChange={(e) => setMachine(e.target.value)} /></label>}
              <button className="hub-btn primary" onClick={() => void save()}>Save reading</button>
            </>
          )}
          {msg && <div className="hub-m" role="status">{msg}</div>}
        </section>
      </div>
    </FeatureGate>
  );
}
