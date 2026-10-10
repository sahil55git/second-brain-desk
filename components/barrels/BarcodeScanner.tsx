"use client";

// Camera barcode reader for barrel labels. Uses the browser's built-in
// BarcodeDetector (Chrome / Edge on Android and desktop). Where that is not
// available the caller still has the text box, which also works with any
// USB / Bluetooth barcode scanner (they type the code and press Enter).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

export function cameraScanSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

export default function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        if (!cameraScanSupported()) throw new Error("This browser cannot read barcodes with the camera. Use Chrome, or type the code.");
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["code_128", "qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stop) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stop) return;
          try {
            const found = await detector.detect(v);
            const hit = found.find((f) => f.rawValue);
            if (hit) {
              stop = true;
              if (navigator.vibrate) navigator.vibrate(60);
              onCode(hit.rawValue);
              return;
            }
          } catch {
            // a frame that cannot be read is simply skipped
          }
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "The camera could not be opened.");
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="bd-scan" role="dialog" aria-modal aria-label="Scan barrel label">
      <div className="bd-scanbox">
        <div className="bd-scanhead">📷 Scan the barrel label · ಲೇಬಲ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ</div>
        {err ? <div className="bd-err">{err}</div> : <video ref={video} className="bd-video" playsInline muted />}
        <div className="bd-scanline" aria-hidden />
        <button type="button" className="bd-btn" onClick={onClose}>
          ✕ Close · ಮುಚ್ಚಿ
        </button>
      </div>
    </div>,
    document.body
  );
}
