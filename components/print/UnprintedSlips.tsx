"use client";

// Red bar on the counter and the cashier desk when a slip did not print on this device. The bill itself
// was saved before printing; only the paper slip is waiting. One tap prints them all again (oldest first);
// any that still fail stay in the list.
import { useEffect, useState } from "react";
import { dropUnprinted, explainSlipError, keepUnprinted, listUnprinted, onUnprintedChange, printSlip, type UnprintedSlip } from "@/lib/slipPrinter";
import "./slipPrinter.css";

export default function UnprintedSlips({ kn = true }: { kn?: boolean }) {
  const [list, setList] = useState<UnprintedSlip[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  useEffect(() => {
    const f = () => setList(listUnprinted());
    f();
    return onUnprintedChange(f);
  }, []);
  if (!list.length) return null;

  const printAll = async () => {
    setBusy(true);
    setWhy("");
    for (const s of [...list].sort((a, b) => a.at - b.at)) {
      try {
        await printSlip(s.doc, s.shop);
        dropUnprinted(s.id);
      } catch (e) {
        const x = explainSlipError(e);
        keepUnprinted({ ...s, error: x.en });
        setWhy(kn ? `${x.en} · ${x.kn}` : x.en);
        break; // the printer is not ready: no use trying the rest now
      }
    }
    setBusy(false);
  };

  return (
    <div className="up-bar" role="alert">
      <span>🧾✗ {list.length} {list.length > 1 ? "slips" : "slip"} not printed{kn ? " · ಚೀಟಿ ಮುದ್ರಣ ಆಗಿಲ್ಲ" : ""}</span>
      <button type="button" className="big" disabled={busy} onClick={() => void printAll()}>{busy ? "…" : "🖨️ Print now"}</button>
      <button type="button" onClick={() => setOpen(!open)}>{open ? "▲" : "▼"}</button>
      {why && <span className="up-list">{why}</span>}
      {open && (
        <div className="up-list">
          {list.map((s) => (
            <div key={s.id}>
              <span>{s.doc.title} {s.doc.no ? `#${s.doc.no}` : ""} · {s.doc.when ?? ""}</span>
              <button type="button" onClick={() => dropUnprinted(s.id)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
