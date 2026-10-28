"use client";

// The print panel of the label and slip pages. One place to choose HOW to print:
//   Print window   Chrome's own window (any device)
//   Phone / tablet makes a picture at the exact paper size and shares it to the printer's app
//   One-click      Chrome shortcut on the shop PC that prints without the window
//   Print helper   small program on the shop PC that prints to a named printer at the exact size
// The page it sits on keeps its own paper-size chips; this panel only does the printing.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaperSize } from "@/lib/printSizes";
import type { SavedPrint } from "@/components/barrels/PrintKit";
import {
  KIOSK_TARGETS, PRINT_MODES, buildHelperJob, cleanPairingCode, clampCopies, helperPrinters, isTouchDeviceUA, kioskBat, pairingCodeOk,
  pictureName, pingHelper, printMode, sendToHelper, type HelperPing, type KioskTarget, type PrintMode,
} from "@/lib/printHelper";
import { rasterize } from "@/lib/rasterize";

interface Props {
  kind: "label" | "slip";
  size: PaperSize;
  /** what to turn into pictures: ".bd-label" or ".bd-slip" */
  selector: string;
  /** white margin the slip CSS leaves round its content (0 for labels) */
  marginMm?: number;
  count: number;
  /** text of the big button, e.g. "Print 3 label(s)" */
  label: string;
  disabled?: boolean;
  /** used in picture file names, e.g. "BRL-01" */
  name?: string;
  saved: SavedPrint;
  onSave: (p: Partial<SavedPrint>) => void;
  /** called after something was printed or shared (the receiving page uses it to mark labels printed) */
  onDone?: () => void;
}

type Msg = { ok: boolean; text: string } | null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PrintCenter({ kind, size, selector, marginMm = 0, count, label, disabled, name = "print", saved, onSave, onDone }: Props) {
  const [mode, setMode] = useState<PrintMode>(printMode(saved.mode));
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [ping, setPing] = useState<HelperPing | null | undefined>(undefined); // undefined = checking, null = not running
  const [printers, setPrinters] = useState<string[]>([]);
  const [pics, setPics] = useState<string[] | null>(null); // phone / tablet: pictures ready to share
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const firstRun = useRef(true);

  // first visit on a phone or tablet: start in the phone / tablet mode
  useEffect(() => {
    if (!saved.mode && firstRun.current && typeof navigator !== "undefined" && isTouchDeviceUA(navigator.userAgent)) setMode("share");
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (saved.mode) setMode(printMode(saved.mode));
  }, [saved.mode]);
  // whatever is on the page changes, the prepared pictures are stale
  useEffect(() => setPics(null), [size.id, count, selector]);

  const pick = (m: PrintMode) => {
    setMode(m);
    setMsg(null);
    onSave({ mode: m });
  };

  // --- print helper status + printer list
  const code = saved.hcode ?? "";
  const hprinter = (kind === "label" ? saved.hlabel : saved.hslip) ?? "";
  const loadPrinters = useCallback(async () => {
    if (!pairingCodeOk(code)) return setPrinters([]);
    try {
      const r = await helperPrinters(code);
      setPrinters(r.printers);
      const want = (kind === "label" ? saved.hlabel : saved.hslip) || "";
      if (!want || !r.printers.includes(want)) {
        const guess = r.printers.find((p) => (kind === "label" ? /h30c|helett|label|tsc|zebra/i : /posiflow|receipt|pos|thermal/i).test(p)) ?? r.default ?? r.printers[0];
        if (guess) onSave(kind === "label" ? { hlabel: guess } : { hslip: guess });
      }
    } catch (e) {
      setPrinters([]);
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read the printer list." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, kind]);
  useEffect(() => {
    if (mode !== "helper") return;
    let live = true;
    const tick = () => pingHelper().then((p) => live && setPing(p)).catch(() => live && setPing(null));
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [mode]);
  useEffect(() => {
    if (mode === "helper" && ping) void loadPrinters();
  }, [mode, ping, loadPrinters]);

  const raster = () => rasterize({ selector, paperWidthMm: size.w, paperHeightMm: size.h, marginMm });

  const run = async () => {
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "window") {
        window.print();
        onDone?.();
      } else if (mode === "oneclick") {
        const n = clampCopies(copies);
        for (let i = 0; i < n; i++) {
          window.print(); // blocks until sent; silent when Chrome was opened with the one-click shortcut
          if (i < n - 1) await sleep(700);
        }
        setMsg({ ok: true, text: n > 1 ? `Sent ${n} copies.` : "Sent to the printer." });
        onDone?.();
      } else if (mode === "helper") {
        if (!pairingCodeOk(code)) throw new Error("Paste the pairing code from the helper window first.");
        if (!hprinter) throw new Error("Choose the printer first.");
        const pngs = await raster();
        const r = await sendToHelper(buildHelperJob({ printer: hprinter, copies, widthMm: size.w, heightMm: size.h, pngs, title: name }), code);
        onDone?.();
        setMsg({ ok: true, text: r.dryRun ? `Test run: ${r.printed} picture(s) saved on the shop PC, nothing printed.` : `Sent ${r.printed} to ${hprinter}${copies > 1 ? ` × ${clampCopies(copies)}` : ""}.` });
      } else {
        // phone / tablet: make the pictures now; Share / Save is a second tap (a browser only lets a share start from a fresh tap)
        const made = await raster();
        setPics(made);
        setMsg({ ok: true, text: `${made.length} picture(s) ready at ${dimText}. Now tap Share.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Printing did not work." });
    } finally {
      setBusy(false);
    }
  };

  const filesFrom = async (list: string[]) =>
    Promise.all(list.map(async (u, i) => new File([await (await fetch(u)).blob()], pictureName(name, kind, size.w, size.h, i + 1, list.length), { type: "image/png" })));

  const share = async () => {
    if (!pics) return;
    setMsg(null);
    try {
      const files = await filesFrom(pics);
      if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        await navigator.share({ files, title: "Barrel labels" });
        onDone?.();
        setMsg({ ok: true, text: "Shared. In the printer app choose the same label size and print." });
      } else {
        save();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
      setMsg({ ok: false, text: "This browser cannot share pictures. Use Save pictures instead." });
    }
  };
  const save = () => {
    if (!pics) return;
    pics.forEach((u, i) => {
      const a = document.createElement("a");
      a.href = u;
      a.download = pictureName(name, kind, size.w, size.h, i + 1, pics.length);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    setMsg({ ok: true, text: `Saved ${pics.length} picture(s) to Downloads. Open them from your printer's app.` });
    onDone?.();
  };

  const downloadBat = (t: KioskTarget) => {
    const blob = new Blob([kioskBat(origin, t)], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = KIOSK_TARGETS[t].file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const dimText = size.id === "a4" ? "A4" : size.h == null ? `${size.w} mm roll` : `${size.w} × ${size.h} mm`;
  const showCopies = mode === "oneclick" || mode === "helper";
  const helperReady = mode !== "helper" || (!!ping && pairingCodeOk(code) && !!hprinter);

  return (
    <div className="bd-pc bd-noprint">
      <div className="bd-pc-title"><b>🖨️ How to print</b><span className="bd-m"> · {dimText}</span></div>
      <div className="bd-pc-modes" role="tablist">
        {PRINT_MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={`bd-pc-mode${mode === m.id ? " on" : ""}`} onClick={() => pick(m.id)}>
            <b>{m.name}</b>
            <small>{m.note}</small>
          </button>
        ))}
      </div>

      {mode === "window" && (
        <div className="bd-m small">
          Chrome opens its print window. Pick the printer and paper {dimText}, Margins <b>None</b>, Scale <b>100%</b>, Headers and footers <b>off</b>.
        </div>
      )}

      {mode === "share" && (
        <div className="bd-m small">
          For a phone or tablet (for example the Redmi Pad) with a Bluetooth printer. Tap <b>Make pictures</b>, then <b>Share</b> and choose your printer&apos;s own app (the one you used to pair the printer). In that app pick the same label size, <b>{dimText}</b>, and print. If the share list does not show the app, tap <b>Save pictures</b> and open them from inside the printer&apos;s app.
        </div>
      )}

      {mode === "oneclick" && (
        <div className="bd-m small">
          Prints with no window, to the printer last used in the special shop-PC Chrome. Do this once on the shop PC:
          <ol>
            <li>Download the shortcut: <button className="bd-linkbtn" onClick={() => downloadBat("labels")}>Labels shortcut (.bat)</button> <button className="bd-linkbtn" onClick={() => downloadBat("slips")}>Slips shortcut (.bat)</button></li>
            <li>Open it from your Downloads folder (double-click). It opens the app in its own window; log in there once.</li>
            <li>Press Print once, choose the printer and paper size in the Chrome window, then Print. From then on this window prints by itself.</li>
          </ol>
          Use the labels shortcut for the label printer and the slips shortcut for the receipt printer. Your usual Chrome is not changed.
        </div>
      )}

      {mode === "helper" && (
        <div className="bd-pc-helper">
          <div className="bd-row">
            <span className={`bd-dot ${ping === undefined ? "wait" : ping ? "ok" : "off"}`} aria-hidden />
            <span>{ping === undefined ? "Looking for the print helper…" : ping ? `Print helper running (v${ping.version})${ping.dryRun ? " · TEST MODE, nothing is printed" : ""}` : "Print helper is not running on this computer"}</span>
          </div>
          {ping === null && (
            <div className="bd-m small">
              On the shop PC open a command window in the app folder and run <code>py tools/print_helper.py</code>, then keep that window open. If Chrome asks to allow this site to connect to devices on your network, choose <b>Allow</b>. Use this page on the same PC.
            </div>
          )}
          {ping && (
            <div className="bd-row">
              <label>
                Pairing code{" "}
                <input value={code} placeholder="3FA9-0C1B-77DE-92A4" maxLength={19} spellCheck={false} onChange={(e) => onSave({ hcode: cleanPairingCode(e.target.value) })} style={{ width: 190 }} />
              </label>
              <label>
                Printer for {kind === "label" ? "labels" : "slips"}{" "}
                <select value={hprinter} onChange={(e) => onSave(kind === "label" ? { hlabel: e.target.value } : { hslip: e.target.value })} disabled={!printers.length}>
                  {!printers.length && <option value="">{pairingCodeOk(code) ? "no printers found" : "enter the code first"}</option>}
                  {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <button className="bd-btn" onClick={() => void loadPrinters()}>↻ Refresh</button>
            </div>
          )}
          {ping && !pairingCodeOk(code) && <div className="bd-m small">The code is shown in the helper window when it starts (it is the same every time).</div>}
        </div>
      )}

      <div className="bd-row bd-pc-go">
        {showCopies && (
          <label>
            Copies{" "}
            <input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(clampCopies(e.target.value))} style={{ width: 64 }} />
          </label>
        )}
        <button className="bd-btn primary" onClick={() => void run()} disabled={disabled || busy || !helperReady}>
          {busy ? "Working…" : mode === "share" ? `📷 Make pictures (${count})` : `🖨️ ${label}`}
        </button>
        {mode === "share" && pics && (
          <>
            <button className="bd-btn primary" onClick={() => void share()}>📤 Share to printer app</button>
            <button className="bd-btn" onClick={save}>⬇️ Save pictures</button>
          </>
        )}
      </div>
      {msg && <div className={msg.ok ? "bd-pc-ok" : "bd-err"} role="status">{msg.text}</div>}
      {pics && mode === "share" && (
        <div className="bd-pc-pics">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pics.slice(0, 6).map((u, i) => <img key={i} src={u} alt={`Picture ${i + 1}`} style={{ aspectRatio: `${size.w} / ${size.h ?? size.w}` }} />)}
          {pics.length > 6 && <span className="bd-m">+{pics.length - 6} more</span>}
        </div>
      )}
    </div>
  );
}

