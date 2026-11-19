"use client";

// Add or fix the customer name, mobile number and a note on a bill that is already saved (money and oil are not touched).
import { useState } from "react";
import { mobileOf } from "@/lib/counterShare";
import "./receivePayment.css";

/** "Ramesh 9876543210" → name and the 10-digit mobile */
export function splitParty(party: string | null): { name: string; mobile: string } {
  const text = (party || "").trim();
  const mobile = mobileOf(text) || "";
  if (!mobile) return { name: text, mobile: "" };
  const name = text.replace(/(?:\+?91[\s-]*)?0?[6-9][\d\s-]{9,}\s*$/, "").replace(/[\s·,|-]+$/, "").trim();
  return { name, mobile };
}
export const joinParty = (name: string, mobile: string) => [name.trim(), mobile.trim()].filter(Boolean).join(" ");

export default function BillDetails({
  no, party, note, locked, k, onSave, onClose,
}: {
  no: string;
  party: string | null;
  note: string;
  /** udhaar bills: the customer is tied to the ledger, so only the note can change */
  locked: boolean;
  k: (en: string, ka: string) => string;
  onSave: (partyName: string, custNote: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const init = splitParty(party);
  const [name, setName] = useState(init.name);
  const [mobile, setMobile] = useState(init.mobile);
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return setErr(k("Mobile must be 10 digits.", "ಮೊಬೈಲ್ 10 ಅಂಕೆ ಇರಬೇಕು."));
    setBusy(true);
    const e = await onSave(locked ? (party || "") : joinParty(name, mobile), text);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="rp-back" role="dialog" aria-label={k("Customer and note", "ಗ್ರಾಹಕ ಮತ್ತು ಟಿಪ್ಪಣಿ")} onClick={() => !busy && onClose()}>
      <div className="rp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rp-head">
          <b>#{no} · {k("Customer and note", "ಗ್ರಾಹಕ ಮತ್ತು ಟಿಪ್ಪಣಿ")}</b>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {locked && <p className="rp-err">{k("Udhaar bill: the customer name is fixed. You can add a note.", "ಉದ್ರಿ ಬಿಲ್: ಹೆಸರು ಬದಲಿಸಲಾಗದು. ಟಿಪ್ಪಣಿ ಸೇರಿಸಬಹುದು.")}</p>}
        <label className="rp-name">
          <span>{k("Customer name", "ಗ್ರಾಹಕರ ಹೆಸರು")}</span>
          <input value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="rp-name">
          <span>{k("Mobile number", "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ")}</span>
          <input inputMode="numeric" value={mobile} disabled={locked} maxLength={10} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} />
        </label>
        <label className="rp-name">
          <span>{k("Note", "ಟಿಪ್ಪಣಿ")}</span>
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        </label>
        {err && <p className="rp-err">{err}</p>}
        <button type="button" className="rp-go" disabled={busy} onClick={() => void save()}>{busy ? "…" : `✓ ${k("Save", "ಉಳಿಸಿ")}`}</button>
      </div>
    </div>
  );
}
