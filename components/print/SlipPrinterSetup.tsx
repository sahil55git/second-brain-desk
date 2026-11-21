"use client";

// "Counter slip printer" for THIS tablet / phone (Android app): pick the paired Bluetooth (or USB cable) receipt printer
// once, choose 58 or 80 mm, tap Test. After that Save & Print sends every slip straight to it.
import { useCallback, useEffect, useState } from "react";
import { MahadevPrinter, isNative, type NativePrinter } from "@/lib/native";
import {
  explainSlipError, getSlipPrinter, guessPaper, isLabelPrinterName, openBluetoothSettings, printSlip, setSlipPrinter,
  slipCandidates, turnOnBluetooth, type SlipPrinterCfg,
} from "@/lib/slipPrinter";
import { receiptTime, type ShopInfo } from "@/lib/receipt";
import "./slipPrinter.css";

export default function SlipPrinterSetup({ shop, onChange, compact = false }: { shop: ShopInfo; onChange?: (c: SlipPrinterCfg | null) => void; compact?: boolean }) {
  const [cfg, setCfg] = useState<SlipPrinterCfg | null>(null);
  const [list, setList] = useState<NativePrinter[] | null>(null);
  const [btOn, setBtOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(!compact);

  const load = useCallback(async () => {
    if (!isNative()) return;
    try {
      const r = await MahadevPrinter.list();
      setBtOn(r.bluetoothOn);
      setList(r.printers);
    } catch {
      setList([]);
    }
  }, []);
  useEffect(() => {
    setCfg(getSlipPrinter());
    void load();
  }, [load]);

  const save = (c: SlipPrinterCfg | null) => {
    setSlipPrinter(c);
    setCfg(c);
    onChange?.(c);
  };
  const choose = (p: NativePrinter) => save({ id: p.id, name: p.name, paper: cfg?.id === p.id ? cfg.paper : guessPaper(p.name), cut: cfg?.cut ?? false, kannada: cfg?.kannada ?? true });

  const test = async () => {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await printSlip(
        {
          title: "TEST SLIP",
          no: "0",
          when: receiptTime(Date.now()),
          party: "Cash bill · ಪರೀಕ್ಷೆ",
          rows: [
            { name: "Groundnut oil", detail: "1.000 kg × ₹180", amount: "₹180" },
            { name: "Sunflower oil", detail: "2.500 kg × ₹150", amount: "₹375" },
          ],
          totals: [{ label: "TOTAL", value: "₹555", strong: true }],
          notes: [`${cfg.name} · ${cfg.paper} mm`],
        },
        shop,
        cfg,
      );
      setMsg({ ok: true, text: `Printed in ${(r.ms / 1000).toFixed(1)} s${r.confirmed ? " · printer confirmed" : ""}. Lines cut off at the right? Choose 58 mm. Very narrow? Choose 80 mm.` });
    } catch (e) {
      const x = explainSlipError(e);
      setMsg({ ok: false, text: `${x.en} ${x.kn}` });
    } finally {
      setBusy(false);
    }
  };

  if (!isNative()) {
    return compact ? null : <div className="sp-card"><b>🧾 Counter slip printer</b><p className="sp-note">Direct Bluetooth printing works in the Mahadev Desk Android app. On this browser, Print uses the print window.</p></div>;
  }
  const cands = list ? slipCandidates(list) : [];
  const labels = list ? list.filter((p) => isLabelPrinterName(p.name)) : [];

  return (
    <div className="sp-card">
      <button type="button" className="sp-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>🧾 {cfg ? <>Slip printer: <b>{cfg.name}</b> · {cfg.paper} mm</> : <b>Choose the slip printer ಪ್ರಿಂಟರ್ ಆಯ್ಕೆ</b>}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          {!btOn && (
            <div className="sp-warn">
              Bluetooth is off · ಬ್ಲೂಟೂತ್ ಆಫ್
              <button type="button" className="bd-btn" onClick={async () => { await turnOnBluetooth(); setTimeout(() => void load(), 2500); }}>Turn on</button>
            </div>
          )}
          <div className="sp-list">
            {cands.map((p) => (
              <button key={p.id} type="button" className={`sp-dev${cfg?.id === p.id ? " on" : ""}`} onClick={() => choose(p)}>
                <span className="sp-dot">{cfg?.id === p.id ? "✓" : "🖨️"}</span>
                <span>{p.kind === "usb" ? "🔌 " : ""}{p.name}<small>{p.kind === "usb" ? "USB cable" : p.id.slice(4)}</small></span>
              </button>
            ))}
            {list && cands.length === 0 && <p className="sp-note">No receipt printer found. Switch it on, then tap “Pair a printer” (PIN 0000 or 1234), or plug it in with a USB cable and tap Refresh.</p>}
            {labels.length > 0 && <p className="sp-note">Label printers ({labels.map((l) => l.name).join(", ")}) are left out: they print stickers, not slips.</p>}
          </div>
          <div className="bd-row">
            <button type="button" className="bd-btn" onClick={() => void openBluetoothSettings()}>＋ Pair a printer</button>
            <button type="button" className="bd-btn" onClick={() => void load()}>↻ Refresh</button>
          </div>
          {cfg && (
            <>
              <div className="bd-row">
                <span className="bd-m small">Paper</span>
                {([58, 80] as const).map((w) => (
                  <button key={w} type="button" className={`bd-chip${cfg.paper === w ? " on" : ""}`} onClick={() => save({ ...cfg, paper: w })}>{w} mm</button>
                ))}
              </div>
              <div className="bd-row">
                <label className="sp-tick"><input type="checkbox" checked={cfg.kannada} onChange={(e) => save({ ...cfg, kannada: e.target.checked })} /> Kannada on slip</label>
                <label className="sp-tick"><input type="checkbox" checked={!!cfg.small} onChange={(e) => save({ ...cfg, small: e.target.checked })} /> Small type for address &amp; notes (saves paper; turn off if nothing prints)</label>
                <label className="sp-tick"><input type="checkbox" checked={cfg.cut} onChange={(e) => save({ ...cfg, cut: e.target.checked })} /> Cutter</label>
              </div>
              <div className="bd-row">
                <button type="button" className="bd-btn primary" disabled={busy} onClick={() => void test()}>{busy ? "Printing…" : "🖨️ Test print"}</button>
                <button type="button" className="bd-btn" onClick={() => save(null)}>Forget</button>
              </div>
            </>
          )}
          {msg && <div className={`sp-msg${msg.ok ? " ok" : ""}`}>{msg.text}</div>}
        </>
      )}
    </div>
  );
}
