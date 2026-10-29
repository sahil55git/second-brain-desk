"use client";

// "Printer: [Helett H30C ★ ▾]  Make default  Delete  Save this printer…" — the saved printers of this device
// for the label or slip pages. Choosing one switches the print panel to how that printer prints.
import { useState } from "react";
import type { SavedPrinter } from "@/lib/savedPrinters";
import { PRINT_MODES } from "@/lib/printHelper";

interface Props {
  kind: "label" | "slip";
  printers: SavedPrinter[];
  activeId: string;
  defaultId: string;
  /** suggested name for a new saved printer (the connected printer's name) */
  suggestedName: string;
  /** an error from the last save, if any */
  error?: string;
  onPick: (id: string) => void;
  onSave: (name: string) => void;
  onDefault: (id: string) => void;
  onDelete: (id: string) => void;
  /** link to the printer setup page (left out on that page itself) */
  setupHref?: string;
}

export default function SavedPrinterBar({ kind, printers, activeId, defaultId, suggestedName, error, onPick, onSave, onDefault, onDelete, setupHref }: Props) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const active = printers.find((p) => p.id === activeId);
  const modeName = (p: SavedPrinter) => PRINT_MODES.find((m) => m.id === p.mode)?.name ?? p.mode;
  const start = () => {
    setName(active?.name ?? suggestedName);
    setNaming(true);
  };
  const commit = () => {
    onSave(name);
    setNaming(false);
  };
  return (
    <div className="bd-spb">
      <label>
        <b>{kind === "label" ? "Label printer" : "Slip printer"}</b>{" "}
        <select value={activeId} onChange={(e) => onPick(e.target.value)} aria-label="Saved printer">
          <option value="">{printers.length ? "Not saved: choose how to print below" : "None saved yet"}</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === defaultId ? "★ " : ""}{p.name} · {modeName(p)}
            </option>
          ))}
        </select>
      </label>
      {active && active.id !== defaultId && <button className="bd-linkbtn" onClick={() => onDefault(active.id)}>★ Make default</button>}
      {active && active.id === defaultId && <span className="bd-m small">★ default: used when this page opens</span>}
      {active && <button className="bd-linkbtn" onClick={() => onDelete(active.id)}>Delete</button>}
      {!naming && <button className="bd-btn" onClick={start}>{active ? "💾 Update name" : "💾 Save this printer"}</button>}
      {naming && (
        <span className="bd-spb-name">
          <input value={name} maxLength={40} autoFocus placeholder="e.g. Helett H30C" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit()} />
          <button className="bd-btn primary" onClick={commit} disabled={!name.trim()}>Save</button>
          <button className="bd-linkbtn" onClick={() => setNaming(false)}>Cancel</button>
        </span>
      )}
      {setupHref && <a className="bd-linkbtn" href={setupHref}>⚙️ Printer setup</a>}
      {error && <span className="bd-err">{error}</span>}
    </div>
  );
}
