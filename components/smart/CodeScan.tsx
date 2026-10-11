"use client";

// Scan a barcode or QR code into a form: works with a USB / Bluetooth scanner
// (it types the code and presses Enter into the box) or the phone camera.
import { useState } from "react";
import BarcodeScanner, { cameraScanSupported } from "@/components/barrels/BarcodeScanner";

export default function CodeScan({ onCode, placeholder = "Scan or type a barcode / QR / item code…" }: { onCode: (code: string) => void; placeholder?: string }) {
  const [v, setV] = useState("");
  const [cam, setCam] = useState(false);
  const send = (code: string) => {
    const c = code.trim();
    if (c) onCode(c);
    setV("");
  };
  return (
    <div className="flex gap-2 items-center">
      <span aria-hidden>🔍</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // a scanner's Enter must not submit the whole form
            send(v);
          }
        }}
        placeholder={placeholder}
        aria-label="Scan a code"
        autoComplete="off"
        className="flex-1 min-w-0 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
      />
      {cameraScanSupported() && (
        <button type="button" onClick={() => setCam(true)} className="rounded border border-black/20 dark:border-white/20 px-2.5 py-1.5 text-sm" title="Scan with the camera">
          📷 Scan
        </button>
      )}
      {cam && (
        <BarcodeScanner
          title="Scan a barcode or QR code"
          onClose={() => setCam(false)}
          onCode={(c) => {
            setCam(false);
            send(c);
          }}
        />
      )}
    </div>
  );
}
