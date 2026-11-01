"use client";

// Tap an entry in Today's entries → fix it here: amount, quantity, rate, how it was paid, the
// person, notes (owner: also the date), or delete it. The server keeps the old values in the
// entry's edit history (details.edits), so a change can always be traced.
import { useEffect, useState } from "react";

export interface EditableEntry {
  id: string;
  kind: string;
  date: string;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  notes: string | null;
  details?: unknown;
}

const UNITS = ["kg", "ltr", "bags", "pcs", "box"];
const isGroup = (d: unknown) => !!(d && typeof d === "object" && ("split" in (d as object) || "bill" in (d as object)));
const edits = (d: unknown) => (d && typeof d === "object" && Array.isArray((d as { edits?: unknown[] }).edits) ? ((d as { edits: { at: string; by: string }[] }).edits) : []);

export default function EditEntry({
  e,
  title,
  isOwner,
  onClose,
  onSaved,
  onDelete,
}: {
  e: EditableEntry;
  title: string;
  isOwner: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDelete: () => void;
}) {
  const group = isGroup(e.details);
  const side = e.kind === "SALE" || e.kind === "FRESH_CRUSH" || e.kind === "UDHAAR_IN" ? "in" : e.kind === "PIGMEE" || e.kind === "OWNER_DRAW" ? "oth" : "out";
  const creditOk = e.kind === "SALE" || e.kind === "FRESH_CRUSH" || e.kind === "PURCHASE";
  const [amount, setAmount] = useState(String(e.amountInr));
  const [qty, setQty] = useState(e.qty ? String(e.qty) : "");
  const [unit, setUnit] = useState(e.unit || "kg");
  const [rate, setRate] = useState(e.rateInr ? String(e.rateInr) : "");
  const [mode, setMode] = useState(e.paymentMode === "BANK" ? "UPI" : e.paymentMode);
  const [party, setParty] = useState(e.partyName || "");
  const [label, setLabel] = useState(e.itemLabel || "");
  const [notes, setNotes] = useState(e.notes || "");
  const [date, setDate] = useState(e.date);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hist = edits(e.details);
  const [partyNames, setPartyNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/parties").then((r) => r.json()).then((j) => setPartyNames(((j.data || []) as { name: string }[]).map((p) => p.name))).catch(() => {});
  }, []);

  // qty × rate fills the amount when both are given
  const autoAmount = (q: string, r: string) => {
    const n = Number(q) * Number(r);
    if (Number(q) > 0 && Number(r) > 0 && Number.isFinite(n)) setAmount(String(Math.round(n * 100) / 100));
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { partyName: party, notes };
      if (!group) Object.assign(body, { amountInr: amount, qty, unit, rateInr: rate, paymentMode: mode });
      if (e.itemLabel || e.item === "other") body.itemLabel = label;
      if (isOwner && date !== e.date) body.date = date;
      const r = await fetch(`/api/register/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save.");
      onSaved("Entry updated ✓");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="qr-veil" onClick={onClose} />
      <div className="qr-sheet" role="dialog" aria-modal aria-label={`Edit ${title}`}>
        <div className="qr-sh">
          <span className="ic" aria-hidden>✏️</span>
          <h3>Edit · {title}</h3>
          <button className="qr-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {group && <p className="qr-hint">This entry is part of a split payment / multi-item bill. Name and notes can be fixed here; to change the amount, delete it and enter it again.</p>}

        {!group && (
          <>
            <div className="qr-f">
              <label>Amount ₹</label>
              <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(x) => setAmount(x.target.value)} aria-label="Amount" />
            </div>
            {side !== "oth" && (
              <div className="qr-f">
                <label>Quantity · rate</label>
                <div className="qr-ed-row">
                  <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.01" placeholder="Qty" value={qty} onChange={(x) => { setQty(x.target.value); autoAmount(x.target.value, rate); }} aria-label="Quantity" />
                  <select className="qr-txt" value={unit} onChange={(x) => setUnit(x.target.value)} aria-label="Unit">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input className="qr-num" type="number" inputMode="decimal" min={0} step="0.01" placeholder="Rate ₹" value={rate} onChange={(x) => { setRate(x.target.value); autoAmount(qty, x.target.value); }} aria-label="Rate" />
                </div>
              </div>
            )}
            {side !== "oth" && (
              <div className="qr-f">
                <label>Paid by</label>
                <div className="qr-chips">
                  {[["CASH", "💵 Cash"], ["UPI", "📱 UPI / bank"], ...(creditOk ? [["CREDIT", "🙌 Udhaar"]] : [])].map(([k, l]) => (
                    <button key={k} type="button" className={`qr-chip${mode === k ? " sel" : ""}`} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {(e.itemLabel || e.item === "other") && (
          <div className="qr-f">
            <label>Item</label>
            <input className="qr-txt" value={label} onChange={(x) => setLabel(x.target.value)} maxLength={80} />
          </div>
        )}
        <div className="qr-f">
          <label>{side === "in" ? "Customer" : side === "out" ? "Paid to / supplier" : "Name"}</label>
          <input className="qr-txt" value={party} onChange={(x) => setParty(x.target.value)} list="qr-ed-parties" maxLength={120} autoComplete="off" />
          <datalist id="qr-ed-parties">{partyNames.slice(0, 200).map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="qr-f">
          <label>Notes</label>
          <input className="qr-txt" value={notes} onChange={(x) => setNotes(x.target.value)} maxLength={500} />
        </div>
        {isOwner && (
          <div className="qr-f">
            <label>Date</label>
            <input className="qr-txt" type="date" value={date} onChange={(x) => setDate(x.target.value)} />
          </div>
        )}

        {err && <p className="qr-hint qr-ed-err" role="alert">{err}</p>}
        {hist.length > 0 && <p className="qr-hint">Changed {hist.length}× · last by {hist[hist.length - 1].by}</p>}

        <button className="qr-save" onClick={save} disabled={busy}>✓ {busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="qr-ed-del" onClick={onDelete} disabled={busy}>🗑 Delete this entry</button>
      </div>
    </>
  );
}
