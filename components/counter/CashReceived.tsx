"use client";

// "Cash not in" on a saved bill: the counter types what the customer handed over; the change to give back shows at once.
import { useState } from "react";
import { changeFor, noteChips } from "@/lib/cashDesk";
import { rupees } from "@/lib/receipt";
import NumPad, { CoinIcon, TickIcon } from "./NumPad";
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

  /** "Exact": the customer paid the bill amount, no change; one tap finishes. */
  const exact = async () => {
    setBusy(true);
    const e = await onConfirm(0);
    setBusy(false);
    if (e) setErr(e);
  };

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
            <input readOnly inputMode="none" className="act" value={given} placeholder={String(Math.ceil(due))} />
          </label>
          <div className="rp-chips">
            {noteChips(due).map((v) => <button key={v} type="button" className={v === Math.ceil(due) ? "exact" : ""} aria-label={v === Math.ceil(due) ? k("Exact amount", "ಸರಿಯಾದ ಮೊತ್ತ") : undefined} onClick={() => { if (v === Math.ceil(due)) { setGiven(""); void exact(); } else { setGiven(String(v)); setErr(""); } }}>{v === Math.ceil(due) ? <><TickIcon /> ₹{v}</> : `₹${v}`}</button>)}
          </div>
          {g > 0 && (short > 0
            ? <p className="rp-short">{k("Short", "ಕಡಿಮೆ")} {rupees(short)}</p>
            : <p className="rp-change">{k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")}: <b>{rupees(change)}</b></p>)}
        </div>
        <NumPad value={given} onChange={(v) => { setGiven(v); setErr(""); }} />
        {err && <p className="rp-err">{err}</p>}
        <button type="button" className="rp-go" disabled={busy} aria-label={k("Cash received", "ನಗದು ಬಂತು")} title={k("Cash received", "ನಗದು ಬಂತು")} onClick={() => void go()}>
          {busy ? "…" : <><TickIcon /><CoinIcon /></>}
        </button>
      </div>
    </div>
  );
}
