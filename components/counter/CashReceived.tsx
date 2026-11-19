"use client";

// "Cash not in" on a saved bill: the counter types what the customer handed over; the change to give back shows at once.
import { useState } from "react";
import { changeFor, noteChips } from "@/lib/cashDesk";
import { rupees } from "@/lib/receipt";
import "./receivePayment.css";

export default function CashReceived({
  no, due, k, onConfirm, onClose,
}: {
  no: string;
  due: number;
  k: (en: string, ka: string) => string;
  /** given is 0 when the customer paid the exact amount; returns an error text or null */
  onConfirm: (given: number) => Promise<string | null>;
  onClose: () => void;
}) {
  const [given, setGiven] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const g = parseFloat(given) || 0;
  const { change, short } = changeFor(due, g);

  const go = async () => {
    if (g > 0 && short > 0) return setErr(k(`₹${short} short. Ask for the rest.`, `₹${short} ಕಡಿಮೆ ಇದೆ. ಉಳಿದದ್ದು ಕೇಳಿ.`));
    setBusy(true);
    const e = await onConfirm(g > 0 ? g : 0);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="rp-back" role="dialog" aria-label={k("Cash received", "ನಗದು ಬಂತು")} onClick={() => !busy && onClose()}>
      <div className="rp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rp-head">
          <b>#{no} · {k("Cash received", "ನಗದು ಬಂತು")}</b>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rp-total"><span>{k("Cash to take", "ತೆಗೆದುಕೊಳ್ಳಬೇಕಾದ ನಗದು")}</span><strong>{rupees(due)}</strong></div>
        <div className="rp-cash">
          <label>
            <span>{k("Customer gave", "ಗ್ರಾಹಕರು ಕೊಟ್ಟದ್ದು")}</span>
            <input inputMode="decimal" value={given} placeholder={String(Math.ceil(due))} onChange={(e) => { setGiven(e.target.value.replace(/[^0-9.]/g, "")); setErr(""); }} />
          </label>
          <div className="rp-chips">
            {noteChips(due).map((v) => <button key={v} type="button" onClick={() => { setGiven(String(v)); setErr(""); }}>{v === Math.ceil(due) ? k("Exact", "ಸರಿಯಾಗಿ") : `₹${v}`}</button>)}
          </div>
          {g > 0 && (short > 0
            ? <p className="rp-short">{k("Short", "ಕಡಿಮೆ")} {rupees(short)}</p>
            : <p className="rp-change">{k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")}: <b>{rupees(change)}</b></p>)}
        </div>
        {err && <p className="rp-err">{err}</p>}
        <button type="button" className="rp-go" disabled={busy} onClick={() => void go()}>
          {busy ? "…" : `✓ ${k("Cash received", "ನಗದು ಬಂತು")}`}
        </button>
      </div>
    </div>
  );
}
