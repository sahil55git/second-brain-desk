"use client";

// Pair the label printer (Helett H30C) for the Mill Desk: choose it from the phone's paired Bluetooth
// devices, pick the label size, press Test print, Save. Opens over the desk; also opens by itself when a
// slip is printed and no printer has been chosen yet.
import { useCallback, useEffect, useState } from "react";
import { MahadevPrinter, isNative, type NativePrinter } from "@/lib/native";
import { nativePrinterScan } from "@/lib/directPrint";
import {
  MILL_PAPERS, TEST_DOC, buildMillJob, cleanCfg, explainPrintError, getMillPrinter, isBleName, isLabelishName, labelCandidates, listUnprinted, sendBytes, setMillPrinter, type MillPrinterCfg,
} from "@/lib/mill/millPrint";

const card: React.CSSProperties = { background: "#0f1720", border: "1px solid #2b3a4a", borderRadius: 14, padding: 12, display: "grid", gap: 10 };
const btn: React.CSSProperties = { minHeight: 48, borderRadius: 12, border: "1px solid #3a4c60", background: "#16212c", color: "#e8eef5", fontSize: 16, fontWeight: 700, padding: "0 14px" };
const go: React.CSSProperties = { ...btn, background: "#1f8a4c", borderColor: "#2fb868", color: "#fff" };

export default function MillPrinterSheet({ onClose }: { onClose: () => void }) {
  const native = isNative();
  const [saved, setSaved] = useState<MillPrinterCfg | null>(null);
  const [draft, setDraft] = useState<MillPrinterCfg | null>(null);
  const [devices, setDevices] = useState<NativePrinter[]>([]);
  const [reason, setReason] = useState<"ok" | "permission" | "off" | "none" | "error">("ok");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(async () => {
    const r = await nativePrinterScan();
    setDevices(labelCandidates(r.printers));
    setReason(r.reason);
    return r;
  }, []);

  useEffect(() => {
    const c = getMillPrinter();
    setSaved(c);
    const p = MILL_PAPERS[0];
    setDraft(c ?? null);
    if (!native) return;
    void scan().then((r) => {
      if (c) return;
      // nothing saved yet: if exactly one label-type printer is paired, offer it
      const label = labelCandidates(r.printers).filter((d) => isLabelishName(d.name) && !isBleName(d.name));
      if (label.length === 1) setDraft({ id: label[0].id, name: label[0].name, widthMm: p.widthMm, heightMm: p.heightMm, gapMm: p.gapMm, density: 8, invert: true });
    });
  }, [native, scan]);

  const paperId = draft ? MILL_PAPERS.find((x) => x.widthMm === draft.widthMm && x.heightMm === draft.heightMm)?.id ?? "50x75" : "50x75";
  const pick = (d: NativePrinter) => {
    if (isBleName(d.name)) {
      setMsg({ ok: false, text: `“${d.name}” is the low-energy (BLE) entry; the app cannot print over it. Pair the one without “_BLE” (printer icon) in Bluetooth settings, press Refresh, and choose that.` });
      return;
    }
    const p = MILL_PAPERS.find((x) => x.widthMm === draft?.widthMm && x.heightMm === draft?.heightMm) ?? MILL_PAPERS[0];
    setDraft({ id: d.id, name: d.name, widthMm: p.widthMm, heightMm: p.heightMm, gapMm: p.gapMm, density: draft?.density ?? 8, invert: draft?.invert ?? true });
    setMsg(null);
  };
  const setPaper = (id: string) => {
    const p = MILL_PAPERS.find((x) => x.id === id);
    if (p && draft) setDraft({ ...draft, widthMm: p.widthMm, heightMm: p.heightMm, gapMm: p.gapMm });
  };

  const test = async () => {
    const cfg = cleanCfg(draft);
    if (!cfg) return setMsg({ ok: false, text: "Choose the printer first." });
    setBusy(true);
    setMsg({ ok: true, text: "Printing the test label… (the first one can take 10 seconds)" });
    try {
      const { bytes } = buildMillJob({ ...TEST_DOC, when: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) }, cfg, 1);
      const r = await sendBytes(cfg, bytes);
      setMsg({ ok: true, text: `Sent in ${(r.ms / 1000).toFixed(1)} s. Look at the label: a frame of text, a barcode and a QR. All black or all white? Change “Black on white fix” below and test again.` });
    } catch (e) {
      setMsg({ ok: false, text: explainPrintError(e, cfg.name).text });
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const cfg = cleanCfg(draft);
    if (!cfg) return setMsg({ ok: false, text: "Choose the printer first." });
    setMillPrinter(cfg);
    setSaved(cfg);
    onClose();
  };
  const forget = () => {
    setMillPrinter(null);
    setSaved(null);
    setDraft(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(3,6,10,.86)", overflowY: "auto", padding: 12, color: "#e8eef5", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{ ...btn, minHeight: 44 }} onClick={onClose}>← Back</button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Mill printer · Helett</h2>
        </div>

        {!native && (
          <div style={card}>
            <b>One-tap printing works in the Mahadev Desk Android app.</b>
            <span style={{ opacity: 0.8 }}>In a browser the desk uses the normal print window. Open the app on the phone, then come back here.</span>
          </div>
        )}

        {native && (
          <>
            <div style={card}>
              <b>1 · Pair the printer once</b>
              <span style={{ opacity: 0.8, fontSize: 14 }}>Switch the Helett on. Close its own app and disconnect it from any other phone. Pair it in Android Bluetooth settings (PIN 0000 or 1234). It shows twice: pair the one WITHOUT “_BLE” (printer icon), e.g. H30C_F1BA, not H30C_F1BA_BLE. Then come back and press Refresh.</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btn} onClick={() => void MahadevPrinter.openBluetoothSettings().catch(() => {})}>Open Bluetooth settings</button>
                {reason === "off" && <button style={btn} onClick={() => void MahadevPrinter.enableBluetooth().catch(() => {})}>Turn on Bluetooth</button>}
                <button style={btn} onClick={() => void scan()}>Refresh</button>
              </div>
              {reason === "permission" && <span style={{ color: "#ff9d8f" }}>Allow “Nearby devices” for Mahadev Desk: Android Settings → Apps → Mahadev Desk → Permissions.</span>}
              {reason === "off" && <span style={{ color: "#ff9d8f" }}>Bluetooth is off.</span>}
              {reason === "none" && <span style={{ color: "#ffd58a" }}>No paired Bluetooth device found yet.</span>}
            </div>

            <div style={card}>
              <b>2 · Choose it</b>
              {!devices.length && <span style={{ opacity: 0.7 }}>No paired printers listed.</span>}
              {devices.map((d) => (
                <button key={d.id} style={{ ...btn, textAlign: "left", opacity: isBleName(d.name) ? 0.55 : 1, background: draft?.id === d.id ? "#1c3a2a" : "#16212c", borderColor: draft?.id === d.id ? "#2fb868" : "#3a4c60" }} onClick={() => pick(d)}>
                  {isBleName(d.name) ? "✕ " : isLabelishName(d.name) ? "★ " : ""}{d.name}{isBleName(d.name) ? " — BLE, can’t print from the app" : ""} <small style={{ opacity: 0.55, fontFamily: "monospace" }}>{d.id.slice(4)}</small>
                </button>
              ))}
            </div>

            {draft && (
              <div style={card}>
                <b>3 · Label size and test</b>
                <select style={{ ...btn, appearance: "auto" }} value={paperId} onChange={(e) => setPaper(e.target.value)}>
                  {MILL_PAPERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  Darkness {draft.density}
                  <input type="range" min={1} max={15} value={draft.density} onChange={(e) => setDraft({ ...draft, density: Number(e.target.value) })} style={{ flex: 1 }} />
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={draft.invert} onChange={(e) => setDraft({ ...draft, invert: e.target.checked })} />
                  Black on white fix (keep ticked for the Helett H30C)
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btn} disabled={busy} onClick={() => void test()}>{busy ? "Printing…" : "🖨 Test print"}</button>
                  <button style={go} disabled={busy} onClick={save}>✓ Save this printer</button>
                </div>
              </div>
            )}

            {msg && <div style={{ ...card, borderColor: msg.ok ? "#2fb868" : "#e5604a", color: msg.ok ? "#bdf0cf" : "#ffd0c7" }}>{msg.text}</div>}

            {saved && (
              <div style={{ ...card, fontSize: 14 }}>
                <span>Saved: <b>{saved.name}</b> · {saved.widthMm} × {saved.heightMm || "roll"} mm{listUnprinted().length ? ` · ${listUnprinted().length} not printed yet` : ""}</span>
                <button style={{ ...btn, minHeight: 40, fontSize: 14 }} onClick={forget}>Forget this printer</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
