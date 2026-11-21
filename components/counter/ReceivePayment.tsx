"use client";

// "Pay at the queue": the bill was printed with no payment mode. Whoever takes the money (oil counter or cashier)
// picks Cash / UPI / Udhaar / Split here. Cash shows the change to return. Saving releases the oil.
import { useState } from "react";
import { changeFor, noteChips } from "@/lib/cashDesk";
import { rupees } from "@/lib/receipt";
import NumPad, { ArrowIcon, CoinIcon, OilIcon, TickIcon } from "./NumPad";
import "./receivePayment.css";

type Mode = "CASH" | "UPI" | "CREDIT" | "SPLIT";
export interface ReceiveArgs {
  parts: { mode: string; amount: number }[];
  given?: number;
  partyName?: string;
  upiConfirmed: boolean;
  release: boolean;
}
/** What was typed so far: kept when staff press "Hold" so the same customer can be finished later. */
export interface RecvDraft { mode: Mode; given: string; sp: { CASH: string; UPI: string; CREDIT: string }; name: string; upiGot: boolean }
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function ReceivePayment({
  no, total, party, items, k, onSubmit, onClose, canUdhaar = true, qr, draft, onHold,
}: {
  no: string;
  total: number;
  party: string | null;
  items: string;
  k: (en: string, ka: string) => string;
  onSubmit: (a: ReceiveArgs) => Promise<string | null>;
  onClose: () => void;
  canUdhaar?: boolean;
  /** UPI QR for this bill (optional) */
  qr?: React.ReactNode;
  /** restore what was typed before "Hold" */
  draft?: RecvDraft;
  /** "Take money & hold": keep this customer's entry, go back, finish later */
  onHold?: (d: RecvDraft) => void;
}) {
  const [mode, setMode] = useState<Mode>(draft?.mode || "CASH");
  const [given, setGiven] = useState(draft?.given || "");
  const [name, setName] = useState(draft?.name || party || "");
  const [sp, setSp] = useState<{ CASH: string; UPI: string; CREDIT: string }>(draft?.sp || { CASH: "", UPI: "", CREDIT: "" });
  const [upiGot, setUpiGot] = useState(draft?.upiGot || false);
  const [active, setActive] = useState<"given" | "CASH" | "UPI" | "CREDIT">("given");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const n = (s: string) => parseFloat(s) || 0;
  const cashPart = mode === "CASH" ? total : mode === "SPLIT" ? n(sp.CASH) : 0;
  const g = n(given);
  const { change, short } = changeFor(cashPart, g);
  const splitSum = r2(n(sp.CASH) + n(sp.UPI) + n(sp.CREDIT));
  const splitLeft = r2(total - splitSum);
  const needName = mode === "CREDIT" || (mode === "SPLIT" && n(sp.CREDIT) > 0);
  const hasUpi = mode === "UPI" || (mode === "SPLIT" && n(sp.UPI) > 0);

  const go = async () => {
    setErr("");
    let parts: { mode: string; amount: number }[];
    if (mode === "SPLIT") {
      if (Math.abs(splitLeft) > 0.005) return setErr(k(`Parts must add up to ${rupees(total)} (now ${rupees(splitSum)}).`, `ಭಾಗಗಳ ಮೊತ್ತ ${rupees(total)} ಆಗಬೇಕು (ಈಗ ${rupees(splitSum)}).`));
      parts = (["CASH", "UPI", "CREDIT"] as const).map((m) => ({ mode: m, amount: n(sp[m]) })).filter((p) => p.amount > 0);
    } else parts = [{ mode, amount: total }];
    if (cashPart > 0 && g > 0 && short > 0) return setErr(k(`₹${short} short. Ask for the rest.`, `₹${short} ಕಡಿಮೆ ಇದೆ. ಉಳಿದದ್ದು ಕೇಳಿ.`));
    if (needName && !name.trim()) return setErr(k("Type the customer's name for udhaar.", "ಉದ್ರಿಗೆ ಗ್ರಾಹಕರ ಹೆಸರು ಬರೆಯಿರಿ."));
    if (hasUpi && !upiGot) return setErr(k("Tick “UPI money received” after you see it.", "UPI ಹಣ ಬಂದ ಮೇಲೆ “UPI ಹಣ ಬಂತು” ಟಿಕ್ ಮಾಡಿ."));
    setBusy(true);
    const e = await onSubmit({ parts, given: cashPart > 0 && g > 0 ? g : undefined, partyName: needName ? name.trim() : undefined, upiConfirmed: hasUpi && upiGot, release: true });
    setBusy(false);
    if (e) setErr(e);
  };

  const tabs: [Mode, string, string][] = [
    ["CASH", "Cash", "ನಗದು"],
    ["UPI", "UPI", "UPI"],
    ...(canUdhaar ? ([["CREDIT", "Udhaar", "ಉದ್ರಿ"]] as [Mode, string, string][]) : []),
    ["SPLIT", "Split", "ಭಾಗ"],
  ];

  return (
    <div className="rp-back" role="dialog" aria-label={k("Receive payment", "ಹಣ ಪಡೆಯಿರಿ")} onClick={() => !busy && onClose()}>
      <div className="rp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rp-head">
          <b>#{no} · {k("Receive payment", "ಹಣ ಪಡೆಯಿರಿ")}</b>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={`rp-money${cashPart > 0 ? "" : " one"}`}>
          <div className="rp-m in"><small>{k("Receive", "ಪಡೆಯಬೇಕು")}{items ? ` · ${items}` : ""}</small><strong>{rupees(total)}</strong></div>
          {cashPart > 0 && (
            <div className={`rp-m out${g > 0 ? (short > 0 ? " bad" : change > 0 ? " flash" : " ok") : ""}`}>
              <small>{g > 0 && short > 0 ? k("Short by", "ಕಡಿಮೆ") : k("Return to customer", "ಗ್ರಾಹಕರಿಗೆ ಹಿಂತಿರುಗಿಸಿ")}</small>
              <strong>{g > 0 ? rupees(short > 0 ? short : change) : "—"}</strong>
            </div>
          )}
        </div>
        <div className="rp-tabs">
          {tabs.map(([m, en, ka]) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => { setMode(m); setErr(""); setActive(m === "SPLIT" ? "CASH" : "given"); }}>{k(en, ka)}</button>
          ))}
        </div>

        {mode === "SPLIT" && (
          <div className="rp-split">
            {(["CASH", "UPI", "CREDIT"] as const).filter((m) => m !== "CREDIT" || canUdhaar).map((m) => (
              <label key={m}>
                <span>{m === "CASH" ? k("Cash", "ನಗದು") : m === "UPI" ? "UPI" : k("Udhaar", "ಉದ್ರಿ")}</span>
                <input readOnly inputMode="none" className={active === m ? "act" : ""} value={sp[m]} placeholder="0" onClick={() => setActive(m)} onFocus={() => setActive(m)} />
              </label>
            ))}
            <p className={Math.abs(splitLeft) < 0.005 ? "ok" : "left"}>{Math.abs(splitLeft) < 0.005 ? "✓ " + k("adds up", "ಸರಿಯಾಗಿದೆ") : `${k("Left", "ಉಳಿದದ್ದು")} ${rupees(splitLeft)}`}</p>
          </div>
        )}

        {cashPart > 0 && (
          <div className="rp-cash">
            <label>
              <span>{k("Customer gave", "ಗ್ರಾಹಕರು ಕೊಟ್ಟದ್ದು")} ({rupees(cashPart)})</span>
              <input readOnly inputMode="none" className={active === "given" ? "act" : ""} value={given} placeholder={String(Math.ceil(cashPart))} onClick={() => setActive("given")} onFocus={() => setActive("given")} />
            </label>
            <div className="rp-chips">
              {noteChips(cashPart).map((v) => <button key={v} type="button" className={v === Math.ceil(cashPart) ? "exact" : ""} aria-label={v === Math.ceil(cashPart) ? k("Exact amount", "ಸರಿಯಾದ ಮೊತ್ತ") : undefined} onClick={() => { setGiven(String(v)); setActive("given"); }}>{v === Math.ceil(cashPart) ? <><TickIcon /> ₹{v}</> : `₹${v}`}</button>)}
            </div>
          </div>
        )}

        {((mode === "SPLIT") || cashPart > 0) && (
          <NumPad allowDot={active !== "given"} value={active === "given" ? given : sp[active]} onChange={(v) => { setErr(""); if (active === "given") setGiven(v); else setSp({ ...sp, [active]: v }); }} />
        )}

        {hasUpi && (
          <div className="rp-upi">
            {qr}
            <label className="rp-tick"><input type="checkbox" checked={upiGot} onChange={(e) => setUpiGot(e.target.checked)} /> {k("UPI money received", "UPI ಹಣ ಬಂತು")}</label>
          </div>
        )}

        {needName && (
          <label className="rp-name">
            <span>{k("Customer name (udhaar)", "ಗ್ರಾಹಕರ ಹೆಸರು (ಉದ್ರಿ)")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {err && <p className="rp-err">{err}</p>}
        <div className="rp-acts">
          {onHold && (
            <button type="button" className="rp-hold" disabled={busy} onClick={() => onHold({ mode, given, sp, name, upiGot })}>
              <span className="rp-hic" aria-hidden>⏸</span>
              <b>{k("Hold", "ಹಿಡಿಯಿರಿ")}</b>
              <small>{k("money taken, finish later", "ಹಣ ತೆಗೆದುಕೊಂಡೆ, ನಂತರ ಮುಗಿಸುವೆ")}</small>
            </button>
          )}
          <button type="button" className="rp-go" disabled={busy} aria-label={k("Money received — give the oil", "ಹಣ ಬಂತು — ಎಣ್ಣೆ ಕೊಡಿ")} onClick={() => void go()}>
            {busy ? "…" : <>
              <span className="rp-step"><CoinIcon /><b>{k("Money received", "ಹಣ ಬಂತು")}</b></span>
              <ArrowIcon />
              <span className="rp-step"><OilIcon /><b>{k("Give oil", "ಎಣ್ಣೆ ಕೊಡಿ")}</b></span>
            </>}
          </button>
        </div>
      </div>
    </div>
  );
}
