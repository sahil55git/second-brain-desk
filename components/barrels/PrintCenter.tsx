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
  KIOSK_TARGETS, PRINT_MODES, ago, buildHelperJob, chunkItems, cleanPairingCode, clampCopies, fetchQueue, helperPrinters, isTouchDeviceUA, jobAction, kioskBat, pairingCodeOk,
  pictureName, pingHelper, printMode, queueJob, sendToHelper, stripDataUrl, type HelperPing, type KioskTarget, type PrintMode, type QueueState,
} from "@/lib/printHelper";
import { canCancel, canReprint, statusText } from "@/lib/printQueue";
import {
  connectBluetooth, connectUsb, currentConnection, directConfig, directSupport, disconnectPrinter, dotsAcross, explainError, knownUsbPrinters, monoFromDataUrl, reconnectBluetooth, sendBytes, unsupportedReason, usbMatches,
  type DirectCfg, type DirectConnection,
} from "@/lib/directPrint";
import SavedPrinterBar from "@/components/barrels/SavedPrinterBar";
import { defaultPrinter, makeDefault, patchPrinter, printersFor, readBook, removePrinter, savePrinter, type SavedPrinter } from "@/lib/savedPrinters";
import { PRINTER_LANGS, buildJob, mmToDots, testPattern } from "@/lib/printerLang";
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
  const [q, setQ] = useState<QueueState | null>(null); // shop printer queue
  const [qErr, setQErr] = useState("");
  const [pics, setPics] = useState<string[] | null>(null); // phone / tablet: pictures ready to share
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const firstRun = useRef(true);
  // Bluetooth / USB direct printing
  const [conn, setConn] = useState<DirectConnection | null>(null);
  const [dlog, setDlog] = useState<string[]>([]);
  const [prog, setProg] = useState("");
  const [usbKnown, setUsbKnown] = useState(0);
  const cfg = directConfig(kind, size.w, kind === "label" ? saved.dlabel : saved.dslip);
  const setCfg = (p: Partial<DirectCfg>) => {
    const { widthMm: _w, ...rest } = p; // print width follows the paper, not the printer
    void _w;
    onSave({
      ...(kind === "label" ? { dlabel: { ...saved.dlabel, ...p } } : { dslip: { ...saved.dslip, ...p } }),
      ...(activeId && Object.keys(rest).length ? { book: patchPrinter(readBook(saved.book), activeId, { cfg: rest }) } : {}),
    });
  };
  const support = typeof window === "undefined" ? { bluetooth: false, usb: false, secure: true } : directSupport();
  const whyNot = typeof navigator === "undefined" ? "" : unsupportedReason(support, navigator.userAgent);

  // --- saved printers (this device): the default one is used as soon as the page opens
  const book = readBook(saved.book);
  const mine = printersFor(book, kind);
  const [activeId, setActiveId] = useState("");
  const [spErr, setSpErr] = useState("");
  const active = mine.find((p) => p.id === activeId) ?? null;
  const defaultId = book.defaults[kind] ?? "";
  const appliedFor = useRef("");
  const cfgOf = (p: SavedPrinter): Partial<DirectCfg> => {
    const w = (kind === "label" ? saved.dlabel : saved.dslip)?.widthMm; // print width follows the paper, so keep it
    return { ...p.cfg, ...(w ? { widthMm: w } : {}) };
  };
  const applyPrinter = (p: SavedPrinter) => {
    setActiveId(p.id);
    setMode(p.mode);
    setMsg(null);
    onSave({
      mode: p.mode,
      ...(kind === "label" ? { dlabel: cfgOf(p) } : { dslip: cfgOf(p) }),
      ...(p.mode === "helper" && p.helper ? (kind === "label" ? { hlabel: p.helper } : { hslip: p.helper }) : {}),
    });
  };
  useEffect(() => {
    // once the saved choices have loaded: open on the default printer of this page
    if (appliedFor.current === kind) return;
    const d = defaultPrinter(book, kind);
    if (d) {
      appliedFor.current = kind;
      applyPrinter(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.book, kind]);

  // first visit on a phone or tablet: print straight to the printer when the browser can, else share a picture
  useEffect(() => {
    if (!saved.mode && firstRun.current && typeof navigator !== "undefined" && isTouchDeviceUA(navigator.userAgent)) {
      const s = directSupport();
      setMode(s.bluetooth || s.usb ? "direct" : "share");
    }
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (saved.mode) setMode(printMode(saved.mode));
  }, [saved.mode]);
  // whatever is on the page changes, the prepared pictures are stale
  useEffect(() => setPics(null), [size.id, count, selector]);

  const pick = (m: PrintMode) => {
    if (active && active.mode !== m) setActiveId(""); // a different way to print is no longer that saved printer
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

  // --- shop printer queue: is the helper online, and how are the recent jobs
  const loadQueue = useCallback(async () => {
    try {
      setQ(await fetchQueue(6));
      setQErr("");
    } catch (e) {
      setQErr(e instanceof Error ? e.message : "Could not reach the app.");
    }
  }, []);
  useEffect(() => {
    if (mode !== "queue") return;
    void loadQueue();
    const t = setInterval(() => void loadQueue(), 3000);
    return () => clearInterval(t);
  }, [mode, loadQueue]);

  // --- direct: remember an open connection while the page stays open; see if a USB printer was allowed before
  useEffect(() => {
    if (mode !== "direct") return;
    setConn(currentConnection());
    void knownUsbPrinters().then((l) => setUsbKnown(l.length));
  }, [mode]);

  const lost = () => {
    setConn(null);
    setMsg({ ok: false, text: "The printer disconnected. Tap Connect to use it again." });
  };
  const connect = async (via: "bluetooth" | "usb") => {
    setMsg(null);
    setDlog([]);
    setBusy(true);
    try {
      const c = via === "bluetooth" ? await connectBluetooth(cfg.service, lost, setDlog) : await connectUsb(undefined, lost);
      setConn(c);
      setDlog(c.log);
      setMsg({ ok: true, text: `Connected to ${c.name}. Press Test label to check it prints right.` });
    } catch (e) {
      setConn(null);
      setDlog((d) => [...d, `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`]);
      setMsg({ ok: false, text: explainError(e, via) });
    } finally {
      setBusy(false);
    }
  };
  const reuseUsb = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const list = await knownUsbPrinters();
      if (!list.length) throw new Error("No USB printer has been allowed yet. Tap Connect USB.");
      const c = await connectUsb(list[0], lost);
      setConn(c);
      setDlog(c.log);
      setMsg({ ok: true, text: `Connected to ${c.name}.` });
    } catch (e) {
      setMsg({ ok: false, text: explainError(e, "usb") });
    } finally {
      setBusy(false);
    }
  };
  // --- saved printer actions
  const saveCurrent = (name: string) => {
    try {
      const { widthMm: _w, ...rest } = cfg;
      void _w;
      const direct = mode === "direct";
      const c = direct ? conn ?? currentConnection() : null;
      const { book: next, saved: sp } = savePrinter(book, {
        id: active?.id,
        name,
        for: kind,
        mode,
        ...(direct ? { cfg: rest } : {}),
        ...(c ? { via: c.kind, deviceId: c.deviceId } : active?.via ? { via: active.via, deviceId: active.deviceId } : {}),
        ...(mode === "helper" && hprinter ? { helper: hprinter } : {}),
      });
      appliedFor.current = kind; // it is already what the page shows
      onSave({ book: next });
      setActiveId(sp.id);
      setSpErr("");
      setMsg({ ok: true, text: `Saved "${sp.name}". ${defaultPrinter(next, kind)?.id === sp.id ? "It is the default: it opens by itself and Print uses it." : "Choose it from the list any time."}` });
    } catch (e) {
      setSpErr(e instanceof Error ? e.message : "Could not save.");
    }
  };
  const pickSaved = (id: string) => {
    const p = mine.find((x) => x.id === id);
    if (!p) return setActiveId("");
    applyPrinter(p);
  };
  const deleteSaved = (id: string) => {
    onSave({ book: removePrinter(book, id) });
    setActiveId("");
  };
  const hangUp = async () => {
    await disconnectPrinter();
    setConn(null);
    setMsg(null);
  };
  // Use the open connection, else reconnect the saved printer by itself, else open the chooser (Print is a tap, so it may).
  const ensureConnected = async (): Promise<DirectConnection> => {
    const cur = currentConnection();
    if (cur) return cur;
    let c: DirectConnection | null = null;
    if (active?.via === "usb") {
      const list = await knownUsbPrinters();
      const dev = (active.deviceId && list.find((d) => usbMatches(d, active.deviceId!))) || list[0];
      if (dev) c = await connectUsb(dev, lost);
    } else if (active?.via === "bluetooth" && active.deviceId) {
      c = await reconnectBluetooth(active.deviceId, cfg.service, lost, setDlog);
    }
    if (!c) c = active?.via === "usb" || (!support.bluetooth && support.usb) ? await connectUsb(undefined, lost) : await connectBluetooth(cfg.service, lost, setDlog);
    setConn(c);
    setDlog(c.log);
    if (active && c.deviceId !== active.deviceId) onSave({ book: patchPrinter(book, active.id, { via: c.kind, deviceId: c.deviceId }) });
    return c;
  };
  // opening the page on a saved Bluetooth / USB printer: reconnect quietly, no tap needed
  useEffect(() => {
    if (mode !== "direct" || !active?.deviceId || currentConnection()) return;
    let live = true;
    (async () => {
      try {
        let c: DirectConnection | null = null;
        if (active.via === "usb") {
          const dev = (await knownUsbPrinters()).find((d) => usbMatches(d, active.deviceId!));
          if (dev) c = await connectUsb(dev, lost);
        } else c = await reconnectBluetooth(active.deviceId!, cfg.service, lost, setDlog);
        if (c && live) {
          setConn(c);
          setMsg({ ok: true, text: `Connected to ${c.name}.` });
        }
      } catch {
        /* printer off or busy: Print will try again and say why */
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeId]);
  // send one 1-bit picture (or several) to the connected printer in the chosen language
  const sendMono = async (monos: Awaited<ReturnType<typeof monoFromDataUrl>>[], n: number, via?: DirectConnection) => {
    const conn = via ?? currentConnection();
    if (!conn) throw new Error("The printer is not connected. Tap Connect.");
    let total = 0;
    for (let i = 0; i < monos.length; i++) {
      const m = monos[i];
      const bytes = buildJob(m, {
        lang: cfg.lang,
        widthMm: size.w,
        heightMm: size.h ?? undefined,
        copies: n,
        gapMm: cfg.gapMm,
        density: cfg.lang === "escpos" ? Math.round((cfg.density / 15) * 8) : cfg.density,
        invert: cfg.invert,
        feedLines: 4,
        cut: false,
      });
      await sendBytes(conn.sink, bytes, {
        chunk: Math.min(cfg.chunk, conn.kind === "usb" ? 16384 : cfg.chunk),
        delayMs: conn.kind === "usb" ? 0 : cfg.delay,
        onProgress: (sent, all) => setProg(`Sending ${i + 1} of ${monos.length} · ${Math.round((sent / all) * 100)}%`),
      });
      total++;
    }
    setProg("");
    return total;
  };
  const testLabel = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const c = await ensureConnected();
      const m = testPattern(dotsAcross(cfg.widthMm), mmToDots(Math.min(size.h ?? 40, 40)));
      await sendMono([m], 1, c);
      setMsg({ ok: true, text: "Test label sent. Solid square top-left and a frame = right. Hollow square or all black = tick/untick Invert. Nothing = try another language." });
    } catch (e) {
      setProg("");
      setMsg({ ok: false, text: explainError(e) });
    } finally {
      setBusy(false);
    }
  };

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
      } else if (mode === "queue") {
        const pngs = await raster();
        const items = pngs.map((u) => ({ png: stripDataUrl(u), widthMm: size.w, heightMm: size.h }));
        for (const part of chunkItems(items)) await queueJob({ kind, title: name, copies: clampCopies(copies), items: part });
        onDone?.();
        setMsg({ ok: true, text: `Sent ${items.length} ${kind}${items.length > 1 ? "s" : ""} to the shop printer.${q?.agent.online ? "" : " The print helper on the shop PC is not running yet: it will print as soon as it starts."}` });
        void loadQueue();
      } else if (mode === "direct") {
        const c = await ensureConnected(); // first: it may need the chooser, which only opens right after the tap
        const pngs = await raster();
        const w = dotsAcross(cfg.widthMm);
        const monos = await Promise.all(pngs.map((u) => monoFromDataUrl(u, w, cfg.threshold)));
        const sent = await sendMono(monos, clampCopies(copies), c);
        onDone?.();
        setMsg({ ok: true, text: `Sent ${sent} ${kind}${sent > 1 ? "s" : ""} to ${c.name}${copies > 1 ? ` × ${clampCopies(copies)}` : ""}.${active ? "" : " Tap Save this printer so Print uses it next time."}` });
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
      setProg("");
      setMsg({ ok: false, text: mode === "direct" ? explainError(e) : e instanceof Error ? e.message : "Printing did not work." });
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
  const showCopies = mode === "oneclick" || mode === "helper" || mode === "queue" || mode === "direct";
  const helperReady = mode !== "helper" || (!!ping && pairingCodeOk(code) && !!hprinter);

  return (
    <div className="bd-pc bd-noprint">
      <div className="bd-pc-title"><b>🖨️ How to print</b><span className="bd-m"> · {dimText}</span></div>
      <SavedPrinterBar
        kind={kind}
        printers={mine}
        activeId={activeId}
        defaultId={defaultId}
        suggestedName={mode === "direct" ? (conn ?? currentConnection())?.name ?? "" : mode === "helper" ? hprinter : PRINT_MODES.find((m) => m.id === mode)?.name ?? ""}
        error={spErr}
        onPick={pickSaved}
        onSave={saveCurrent}
        onDefault={(id) => onSave({ book: makeDefault(book, id) })}
        onDelete={deleteSaved}
      />
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
          A web page cannot choose the printer for Chrome&apos;s window: Chrome pre-selects the one you used last (or the Windows default printer). To print with no window to a chosen printer, use <b>Bluetooth / USB</b>, <b>This PC&apos;s helper</b> or <b>One-click</b> and save that printer.
        </div>
      )}

      {mode === "share" && (
        <div className="bd-m small">
          For a phone or tablet that has a printer app of its own. Tap <b>Make pictures</b>, then <b>Share</b> and choose your printer&apos;s own app (the one you used to pair the printer). In that app pick the same label size, <b>{dimText}</b>, and print. If the share list does not show the app, tap <b>Save pictures</b> and open them from inside the printer&apos;s app.
        </div>
      )}

      {mode === "direct" && (
        <div className="bd-pc-helper">
          {whyNot ? (
            <div className="bd-err">{whyNot}</div>
          ) : (
            <>
              <div className="bd-row">
                <span className={`bd-dot ${conn ? "ok" : "off"}`} aria-hidden />
                <span>{conn ? <>Connected to <b>{conn.name}</b> ({conn.kind === "usb" ? "USB" : "Bluetooth"})</> : "No printer connected on this device"}</span>
                {conn && <button className="bd-linkbtn" onClick={() => void hangUp()}>Disconnect</button>}
              </div>
              <div className="bd-row">
                {support.bluetooth && <button className="bd-btn" disabled={busy} onClick={() => void connect("bluetooth")}>🔵 Connect Bluetooth</button>}
                {support.usb && <button className="bd-btn" disabled={busy} onClick={() => void connect("usb")}>🔌 Connect USB</button>}
                {support.usb && usbKnown > 0 && !conn && <button className="bd-btn" disabled={busy} onClick={() => void reuseUsb()}>🔌 Use the USB printer from before</button>}
                <button className="bd-btn" disabled={busy} onClick={() => void testLabel()}>🧪 Test label</button>
              </div>
              <div className="bd-pc-set">
                <label>
                  Printer language{" "}
                  <select value={cfg.lang} onChange={(e) => setCfg({ lang: e.target.value as DirectCfg["lang"] })}>
                    {PRINTER_LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label>
                  Darkness <b>{cfg.density}</b>{" "}
                  <input type="range" min={1} max={15} value={cfg.density} onChange={(e) => setCfg({ density: Number(e.target.value) })} />
                </label>
                <label>
                  Gap between labels (mm){" "}
                  <input type="number" min={0} max={20} value={cfg.gapMm} onChange={(e) => setCfg({ gapMm: Number(e.target.value) })} style={{ width: 64 }} />
                </label>
                <label>
                  <input type="checkbox" checked={cfg.invert} onChange={(e) => setCfg({ invert: e.target.checked })} /> Invert (TSPL)
                </label>
              </div>
              <div className="bd-m small">{PRINTER_LANGS.find((l) => l.id === cfg.lang)?.note}</div>
              <details className="bd-pc-adv">
                <summary>Advanced</summary>
                <div className="bd-pc-set">
                  <label>
                    Print width (mm){" "}
                    <input type="number" min={20} max={220} value={cfg.widthMm} onChange={(e) => setCfg({ widthMm: Number(e.target.value) })} style={{ width: 70 }} />
                  </label>
                  <label>
                    Black level <b>{cfg.threshold}</b>{" "}
                    <input type="range" min={60} max={220} value={cfg.threshold} onChange={(e) => setCfg({ threshold: Number(e.target.value) })} />
                  </label>
                  <label>
                    Bluetooth piece size{" "}
                    <input type="number" min={20} max={512} value={cfg.chunk} onChange={(e) => setCfg({ chunk: Number(e.target.value) })} style={{ width: 70 }} />
                  </label>
                  <label>
                    Pause (ms){" "}
                    <input type="number" min={0} max={500} value={cfg.delay} onChange={(e) => setCfg({ delay: Number(e.target.value) })} style={{ width: 64 }} />
                  </label>
                  <label>
                    Printer service id{" "}
                    <input value={cfg.service} placeholder="e.g. ffe0" maxLength={40} spellCheck={false} onChange={(e) => setCfg({ service: e.target.value })} style={{ width: 150 }} />
                  </label>
                </div>
                <div className="bd-m small">If the label prints in pieces or stops half way, make the piece size smaller (20-60) and the pause longer (40). The service id is only needed when Connect says it found no print channel.</div>
              </details>
              {dlog.length > 0 && (
                <details className="bd-pc-adv" open={!conn}>
                  <summary>What the app found on the printer</summary>
                  <pre className="bd-pc-log">{dlog.join("\n")}</pre>
                  <button className="bd-linkbtn" onClick={() => void navigator.clipboard?.writeText(dlog.join("\n"))}>Copy</button>
                </details>
              )}
              <details className="bd-pc-adv">
                <summary>Printer not in the list? Checklist</summary>
                <ol className="bd-m small">
                  <li>Switch the printer on and put it near the tablet. Close the printer&apos;s own app (WePrint) and switch Bluetooth off on any other phone or PC it was used with. A printer can talk to one device at a time.</li>
                  <li>If the printer was paired in Android Settings → Bluetooth before, tap <b>Forget</b> on it there. A printer that Android already holds hangs up on the browser.</li>
                  <li>Do <b>not</b> pair it in Android Settings first. Tap <b>Connect Bluetooth</b> here: Chrome scans for the printer itself and shows a list.</li>
                  <li>Android needs <b>Bluetooth</b> and <b>Location</b> switched on, and Chrome allowed under Settings → Apps → Chrome → Permissions → <b>Nearby devices</b>.</li>
                  <li>Some printers only show up while their Bluetooth light is blinking: hold the power button a few seconds, or press the feed button to wake it.</li>
                  <li>Still nothing? Plug the printer into the tablet with a USB-C OTG cable, switch it on and tap <b>Connect USB</b>. This works without Bluetooth.</li>
                  <li>Open <b>What the app found on the printer</b> above and tap Copy if you need to send it to the developer.</li>
                </ol>
              </details>
            </>
          )}
        </div>
      )}

      {mode === "queue" && (
        <div className="bd-pc-helper">
          <div className="bd-row">
            <span className={`bd-dot ${!q ? "wait" : q.agent.online ? "ok" : "off"}`} aria-hidden />
            <span>
              {!q ? (qErr ? "Cannot reach the app" : "Checking the shop printer…") : q.agent.online
                ? `Shop printer is on${q.agent.dryRun ? " · TEST MODE, nothing is printed" : ""}`
                : q.agent.lastSeen ? `Shop printer is off (last seen ${ago(q.agent.lastSeen)})` : "Shop printer has never been switched on"}
            </span>
          </div>
          {q?.agent.online && (
            <div className="bd-m small">
              Labels print on <b>{q.agent.labelPrinter || "the shop PC's printer"}</b>, slips on <b>{q.agent.slipPrinter || "the shop PC's printer"}</b>.
            </div>
          )}
          {q && !q.agent.online && (
            <div className="bd-m small">
              Switch on the shop PC and start the print helper there (<code>py tools/print_helper.py --queue-url …</code>, see the printing guide). Jobs you send now wait and print by themselves when it starts.
            </div>
          )}
          {qErr && <div className="bd-err">{qErr}</div>}
          {q && q.jobs.length > 0 && (
            <ul className="bd-pc-jobs">
              {q.jobs.map((j) => (
                <li key={j.id} className={`st-${j.status.toLowerCase()}`}>
                  <span className="bd-pc-jt"><b>{j.title || (j.kind === "label" ? "Label" : "Slip")}</b> × {j.copies} <small>{ago(j.createdAt)} · {j.createdBy}</small></span>
                  <span className="bd-pc-js">{statusText(j.status, j.error)}</span>
                  {canCancel(j.status) && <button className="bd-linkbtn" onClick={() => jobAction(j.id, "cancel").then(loadQueue).catch((e) => setQErr(e.message))}>Cancel</button>}
                  {canReprint(j.status) && <button className="bd-linkbtn" onClick={() => jobAction(j.id, "reprint").then(loadQueue).catch((e) => setQErr(e.message))}>Print again</button>}
                </li>
              ))}
            </ul>
          )}
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
          {busy ? "Working…" : mode === "queue" ? `📤 Send ${count} to shop printer` : mode === "share" ? `📷 Make pictures (${count})` : `🖨️ ${label}`}
        </button>
        {mode === "share" && pics && (
          <>
            <button className="bd-btn primary" onClick={() => void share()}>📤 Share to printer app</button>
            <button className="bd-btn" onClick={save}>⬇️ Save pictures</button>
          </>
        )}
      </div>
      {prog && <div className="bd-m small">{prog}</div>}
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

