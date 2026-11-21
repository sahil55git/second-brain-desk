"use client";

// A small status pill for the slip printer, like the scale pill: green = ready, amber = last slip did not print,
// red = no printer chosen / Bluetooth off / printer not found. Tap it to open the printer set-up (choose, paper, test print).
import { useCallback, useEffect, useState } from "react";
import { MahadevPrinter, isNative } from "@/lib/native";
import { getSlipPrinter, listUnprinted, onUnprintedChange, printSlip, dropUnprinted, type SlipPrinterCfg } from "@/lib/slipPrinter";
import type { ShopInfo } from "@/lib/receipt";
import SlipPrinterSetup from "./SlipPrinterSetup";

type State = "ok" | "mid" | "bad";

export default function PrinterChip({ shop, k }: { shop: ShopInfo; k: (en: string, ka: string) => string }) {
  const [cfg, setCfg] = useState<SlipPrinterCfg | null>(null);
  const [state, setState] = useState<State>("bad");
  const [why, setWhy] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const c = getSlipPrinter();
    setCfg(c);
    setPending(listUnprinted().length);
    if (!c) { setState("bad"); setWhy(k("No printer chosen", "ಪ್ರಿಂಟರ್ ಆಯ್ಕೆ ಇಲ್ಲ")); return; }
    try {
      const r = await MahadevPrinter.list();
      if (!r.bluetoothOn && !c.id.startsWith("nusb:")) { setState("bad"); setWhy(k("Bluetooth off", "ಬ್ಲೂಟೂತ್ ಆಫ್")); return; }
      const found = r.printers.some((p) => p.id === c.id);
      if (!found) { setState("bad"); setWhy(k("Printer not found", "ಪ್ರಿಂಟರ್ ಸಿಕ್ಕಿಲ್ಲ")); return; }
      if (listUnprinted().length > 0) { setState("mid"); setWhy(k("Not printed", "ಮುದ್ರಣ ಆಗಿಲ್ಲ")); return; }
      setState("ok"); setWhy("");
    } catch {
      setState(listUnprinted().length > 0 ? "mid" : "ok"); setWhy("");
    }
  }, [k]);

  useEffect(() => {
    if (!isNative()) return;
    void check();
    const t = setInterval(() => void check(), 15_000);
    const off = onUnprintedChange(() => void check());
    return () => { clearInterval(t); off(); };
  }, [check]);

  if (!isNative()) return null;

  const again = async () => {
    setBusy(true);
    for (const s of listUnprinted()) {
      try { await printSlip(s.doc, s.shop, getSlipPrinter()); dropUnprinted(s.id); } catch { break; }
    }
    setBusy(false);
    void check();
  };

  return (
    <>
      <button type="button" className={`ctr-chip ctr-pchip ${state}`} onClick={() => setOpen(true)} aria-label={k("Printer set-up", "ಪ್ರಿಂಟರ್ ಸೆಟ್ಟಿಂಗ್")}>
        🖨️ {cfg ? cfg.name : k("No printer", "ಪ್ರಿಂಟರ್ ಇಲ್ಲ")}{why ? ` · ${why}` : ""}{pending > 0 ? ` (${pending})` : ""}
      </button>
      {open && (
        <div className="ctr-drawer" role="dialog" aria-label={k("Printer set-up", "ಪ್ರಿಂಟರ್ ಸೆಟ್ಟಿಂಗ್")} onClick={() => { setOpen(false); void check(); }}>
          <div className="ctr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ctr-sheethead">
              <b>🖨️ {k("Bill printer", "ಬಿಲ್ ಪ್ರಿಂಟರ್")}</b>
              <button type="button" onClick={() => { setOpen(false); void check(); }} aria-label="Close">✕</button>
            </div>
            {pending > 0 && (
              <button type="button" className="bd-btn primary" disabled={busy} onClick={() => void again()}>
                {busy ? "…" : `🖨️ ${k("Print the", "ಮತ್ತೆ ಮುದ್ರಿಸಿ")} ${pending} ${k("unprinted bill(s) again", "ಬಿಲ್")}`}
              </button>
            )}
            <SlipPrinterSetup shop={shop} onChange={(c) => { setCfg(c); void check(); }} />
          </div>
        </div>
      )}
    </>
  );
}
