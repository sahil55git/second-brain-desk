"use client";

// Shared bits for the label and slip print pages: size chips + custom size, remembered choices,
// and the "Printer settings / connecting a printer" help.
import { useEffect, useState } from "react";
import { PRINTER_TYPES, customSize, type PaperSize, type PrinterType } from "@/lib/printSizes";

const KEY = "bd-print-v1";
export interface SavedPrint {
  printer: string;
  type: PrinterType;
  label?: string;
  slip?: string;
}

/** Remembered on this device only (printer name, type, last sizes). Works without storage. */
export function useSavedPrint(): [SavedPrint, (p: Partial<SavedPrint>) => void] {
  const [s, setS] = useState<SavedPrint>({ printer: "", type: "label" });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS((x) => ({ ...x, ...JSON.parse(raw) }));
    } catch {}
  }, []);
  const update = (p: Partial<SavedPrint>) =>
    setS((x) => {
      const n = { ...x, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [s, update];
}

export function SizePicker({ options, value, onPick, roll }: { options: PaperSize[]; value: PaperSize; onPick: (s: PaperSize) => void; roll?: boolean }) {
  const [w, setW] = useState(value.custom ? String(value.w) : "");
  const [h, setH] = useState(value.custom && value.h ? String(value.h) : "");
  const [err, setErr] = useState(false);
  const apply = () => {
    const c = customSize(w, h, roll);
    setErr(!c);
    if (c) onPick(c);
  };
  return (
    <>
      <div className="bd-sizes">
        {options.map((x) => (
          <button key={x.id} className={`bd-chip${value.id === x.id ? " on" : ""}`} onClick={() => onPick(x)} title={x.note}>
            {x.name}
            {x.note && <small>{x.note}</small>}
          </button>
        ))}
      </div>
      <div className="bd-custom">
        <b>Other size (mm):</b>
        <input inputMode="decimal" placeholder="width" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width in mm" />
        ×
        <input inputMode="decimal" placeholder={roll ? "height (blank = roll)" : "height"} value={h} onChange={(e) => setH(e.target.value)} aria-label="Height in mm" style={{ width: roll ? 130 : 70 }} />
        <button className={`bd-chip${value.custom ? " on" : ""}`} onClick={apply}>Use this size</button>
        {err && <span style={{ color: "#b00" }}>Width and height must be 10 to 300 mm.</span>}
      </div>
    </>
  );
}

export function PrinterPanel({ size, kind, saved, onSave, onTest }: { size: PaperSize; kind: "label" | "slip"; saved: SavedPrint; onSave: (p: Partial<SavedPrint>) => void; onTest?: () => void }) {
  const dim = size.id === "a4" ? "A4" : size.h == null ? `${size.w} mm wide, auto length (roll)` : `${size.w} × ${size.h} mm`;
  const t = saved.type;
  return (
    <details className="bd-pp bd-noprint">
      <summary>🖨️ Printer settings and connecting a printer</summary>
      <div className="bd-row">
        <label>
          Printer type{" "}
          <select value={t} onChange={(e) => onSave({ type: e.target.value as PrinterType })}>
            {PRINTER_TYPES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Printer name (to remember){" "}
          <input value={saved.printer} placeholder="e.g. Counter label printer" onChange={(e) => onSave({ printer: e.target.value })} />
        </label>
        {onTest && <button className="bd-btn" onClick={onTest}>🧪 Print a test label at this size</button>}
      </div>
      <div className="bd-m small">
        This page cannot pick or talk to a printer by itself. It sends the job to your browser, which prints on the printers installed on <b>this</b> computer or phone. So: connect the printer to the device first, then choose it in the print window.
      </div>

      <h4>1 · Print window settings for {size.name}{dim === size.name ? "" : ` (${dim})`}</h4>
      <ul>
        <li><b>Destination / Printer:</b> {saved.printer ? <b>{saved.printer}</b> : "your printer"}</li>
        <li><b>Paper size:</b> {size.id === "a4" ? "A4" : size.cls === "gen" || size.h == null ? <>pick the matching size, or a custom/user-defined <code>{size.w} × {size.h ?? "auto"} mm</code></> : <>the {size.w} × {size.h} mm stock</>}. The page already asks for this size, so most printers choose it by themselves.</li>
        <li><b>Margins:</b> None (or Minimum)</li>
        <li><b>Scale:</b> 100% / Default. Never &quot;Fit to page&quot;.</li>
        <li><b>Headers and footers:</b> Off</li>
        <li><b>Background graphics:</b> On (the black FULL / EMPTY band needs it)</li>
        <li><b>Pages:</b> All &middot; <b>Layout:</b> {size.h != null && size.h > size.w ? "Portrait" : "Auto / Landscape if the label is wider than tall"}</li>
      </ul>

      <h4>2 · Connect the printer</h4>
      {t === "label" && (
        <ol>
          <li>Plug the printer into this computer by USB (or put it on the shop network) and switch it on.</li>
          <li>Install the printer maker&apos;s driver from the maker&apos;s website (the one for your exact model, Windows or Mac).</li>
          <li>Windows: Settings → Bluetooth &amp; devices → Printers &amp; scanners → Add device. Mac: System Settings → Printers &amp; Scanners → +.</li>
          <li>Open the printer → Printing preferences → set the stock / paper size to <b>{size.w} × {size.h ?? "auto"} mm</b>, media type <b>labels with gaps</b> (or continuous for a plain roll), then run the printer&apos;s own gap/label calibration once.</li>
          <li>Come back here, tap <b>Print a test label</b>, and check that the black frame is fully on the sticker.</li>
        </ol>
      )}
      {t === "receipt" && (
        <ol>
          <li>Connect the receipt printer by USB, network or Bluetooth and switch it on. Load the {kind === "slip" ? size.w : 80} mm roll.</li>
          <li>Install the maker&apos;s driver and add the printer in the system Printers list.</li>
          <li>In Printing preferences set paper to the roll width and length <b>auto / continuous</b>, and turn on auto-cut if it has a cutter.</li>
          <li>Choose the 80 mm or 58 mm roll chip above to match the roll, then print.</li>
        </ol>
      )}
      {t === "laser" && (
        <ol>
          <li>Connect by USB or Wi-Fi and add it in the system Printers list.</li>
          <li>Choose <b>A4</b> above. Use a sticker sheet (21 per page, 63.5 × 38.1 mm) for labels; print one test page on plain paper first and hold it against a sticker sheet to check alignment.</li>
        </ol>
      )}
      {t === "bluetooth" && (
        <ol>
          <li>Switch the printer on and pair it in the phone or computer&apos;s Bluetooth settings.</li>
          <li>Android: install the printer maker&apos;s print service or app, then print from the browser menu → Print. Windows/Mac: after pairing, add it in the Printers list like a USB printer.</li>
          <li>Set the label or roll size in the maker&apos;s app or driver to <b>{size.w} × {size.h ?? "auto"} mm</b>, then choose it in the print window.</li>
        </ol>
      )}

      <h4>3 · One-tap printing without the print window (optional)</h4>
      <ul>
        <li>Set this printer as the <b>default printer</b> in the system settings.</li>
        <li>In Chrome or Edge on Windows, make a shortcut of the browser and add <code>--kiosk-printing</code> at the end of its Target. Opening the desk from that shortcut prints straight to the default printer using the last print settings.</li>
        <li>Use that shortcut on the label-printing PC only: it never shows the print window, so it cannot be used to pick another printer.</li>
      </ul>
    </details>
  );
}
