"use client";

// The print panel of the label and slip pages.
// On top, one bar: "Print to [★ Helett H30C · USB ▾]  Copies  [🖨️ Print 26]". The list holds the printers
// saved on this device and the ones the browser can reach right now (USB / Bluetooth printers allowed
// before, the print helper on this PC, the shop PC's printer), found by themselves when the page opens.
// A printer that prints is saved and becomes the default, so next time Print just prints.
// Below, folded: every way to print with its settings and help (print window, Bluetooth / USB, shop
// printer, share to a printer app, one-click, PC helper).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaperSize } from "@/lib/printSizes";
import type { SavedPrint } from "@/components/barrels/PrintKit";
import {
  KIOSK_TARGETS, PRINT_MODES, ago, buildHelperJob, chunkItems, cleanPairingCode, clampCopies, fetchQueue, helperPrinters, isTouchDeviceUA, jobAction, kioskBat, pairingCodeOk,
  pictureName, pingHelper, printMode, queueJob, sendToHelper, stripDataUrl, type HelperPing, type KioskTarget, type PrintMode, type QueueState,
} from "@/lib/printHelper";
import { canCancel, canReprint, statusText } from "@/lib/printQueue";
import {
  connectBluetooth, connectUsb, currentConnection, directConfig, directSupport, disconnectPrinter, dotsAcross, explainError, isUsbHeld, knownUsbPrinters, monoFromDataUrl, reconnectBluetooth, sendBytes, unsupportedReason, usbMatches,
  type DirectCfg, type DirectConnection,
} from "@/lib/directPrint";
import SavedPrinterBar from "@/components/barrels/SavedPrinterBar";
import { makeDefault, patchPrinter, printersFor, readBook, removePrinter, savePrinter, type SavedPrinter } from "@/lib/savedPrinters";
import { buildOptions, detect, nameForNew, nothingDetected, pickInitial, type Detected, type PrinterOption } from "@/lib/printerDetect";
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
  /** show the link to the printer setup page (off on that page itself) */
  setupLink?: boolean;
  /** open the "More ways to print" part from the start (the printer setup page) */
  moreOpen?: boolean;
}

/** What one press of Print uses: how, which device, which settings. */
interface Target {
  mode: PrintMode;
  printer: { via?: "bluetooth" | "usb"; deviceId?: string } | null;
  cfg: DirectCfg;
  helperName: string;
}

type Msg = { ok: boolean; text: string } | null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PrintCenter({ kind, size, selector, marginMm = 0, count, label, disabled, name = "print", saved, onSave, onDone, setupLink = true, moreOpen = false }: Props) {
  const savedRef = useRef(saved);
  savedRef.current = saved;
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

  // --- saved printers (this device)
  const book = readBook(saved.book);
  const mine = printersFor(book, kind);
  const [activeId, setActiveId] = useState("");
  const [spErr, setSpErr] = useState("");
  const active = mine.find((p) => p.id === activeId) ?? null;
  const defaultId = book.defaults[kind] ?? "";
  const appliedFor = useRef("");
  const dcur = kind === "label" ? saved.dlabel : saved.dslip;
  const cfgOf = (p: SavedPrinter): Partial<DirectCfg> => {
    const w = dcur?.widthMm; // print width follows the paper, so keep it
    return { ...p.cfg, ...(w ? { widthMm: w } : {}) };
  };
  const applyPrinter = (p: SavedPrinter) => {
    setActiveId(p.id);
    setMode(p.mode);
    onSave({
      mode: p.mode,
      ...(kind === "label" ? { dlabel: cfgOf(p) } : { dslip: cfgOf(p) }),
      ...(p.mode === "helper" && p.helper ? (kind === "label" ? { hlabel: p.helper } : { hslip: p.helper }) : {}),
    });
  };

  // --- "Print to": saved printers + printers found right now + the print window
  const [found, setFound] = useState<Detected>(nothingDetected());
  const [looking, setLooking] = useState(true);
  const [touch, setTouch] = useState(false);
  const [picked, setPicked] = useState(""); // what the person chose in the list ("" = let the page choose)
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const look = useCallback(async () => {
    setLooking(true);
    try {
      setFound(await detect({ helperCode: savedRef.current.hcode }));
    } catch {
      /* nothing found is fine */
    } finally {
      setLooking(false);
    }
  }, []);
  useEffect(() => {
    void look();
  }, [look, saved.hcode]);
  useEffect(() => {
    // look again when a printer is plugged in or out, and when the person comes back to this tab
    const usb = typeof navigator !== "undefined" ? (navigator as unknown as { usb?: EventTarget }).usb : undefined;
    const again = () => void look();
    const vis = () => document.visibilityState === "visible" && again();
    usb?.addEventListener("connect", again);
    usb?.addEventListener("disconnect", again);
    document.addEventListener("visibilitychange", vis);
    return () => {
      usb?.removeEventListener("connect", again);
      usb?.removeEventListener("disconnect", again);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [look]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  // a USB printer held by the computer's own driver cannot be used straight: do not offer it as "found"
  const held = saved.usbHeld ?? [];
  const usable = useMemo(() => ({ ...found, usb: found.usb.filter((u) => !held.includes(u.deviceId)) }), [found, held.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => buildOptions(book, kind, usable, { share: touch || saved.mode === "share" }), [saved.book, kind, usable, touch, saved.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen: PrinterOption | null = options.find((o) => o.key === picked) ?? pickInitial(options, kind, saved.qlast?.[kind]);
  // keep the settings below in step with the printer chosen above
  useEffect(() => {
    if (!chosen) return;
    if (chosen.saved) {
      if (appliedFor.current !== chosen.key) {
        appliedFor.current = chosen.key;
        applyPrinter(chosen.saved);
      }
    } else {
      appliedFor.current = chosen.key;
      setActiveId("");
      setMode((m) => (chosen.mode === "window" && m === "oneclick" ? m : chosen.mode));
      if (chosen.helper) onSave(kind === "label" ? { hlabel: chosen.helper } : { hslip: chosen.helper });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.key]);

  // a phone or tablet also offers "Share to printer app"
  useEffect(() => {
    if (typeof navigator !== "undefined" && isTouchDeviceUA(navigator.userAgent)) setTouch(true);
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
    // the "Print to" list follows when it has an entry for this way of printing
    const c = currentConnection();
    const match =
      m === "oneclick" ? options.find((o) => o.mode === "window") :
      m === "direct" && c ? options.find((o) => o.deviceId === c.deviceId) :
      options.find((o) => o.mode === m);
    if (match) setPicked(match.key);
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
    setMsg({ ok: false, text: "The printer disconnected. Press Print to connect again." });
  };
  /** Save a printer that was just connected (or just printed with) and choose it in "Print to". */
  const keepConnected = (c: DirectConnection, makeItDefault: boolean, cfgNow: DirectCfg) => {
    const b = readBook(savedRef.current.book);
    const same = printersFor(b, kind).find((p) => p.via === c.kind && p.deviceId === c.deviceId);
    const { widthMm: _w, ...rest } = cfgNow;
    void _w;
    try {
      const r = savePrinter(b, { id: same?.id, name: same?.name ?? nameForNew({ key: "", source: c.kind === "usb" ? "usb" : "bluetooth", name: c.name, detail: "", mode: "direct", ready: true }, b, kind), for: kind, mode: "direct", via: c.kind, deviceId: c.deviceId, cfg: { ...same?.cfg, ...rest } });
      const next = makeItDefault ? makeDefault(r.book, r.saved.id) : r.book;
      const key = `saved:${r.saved.id}`;
      appliedFor.current = key;
      setActiveId(r.saved.id);
      setPicked(key);
      onSave({ book: next, qlast: { ...savedRef.current.qlast, [kind]: key } });
      return r.saved;
    } catch {
      return null; // 12 printers saved already: printing still works, it is just not remembered
    }
  };
  const connect = async (via: "bluetooth" | "usb") => {
    setMsg(null);
    setDlog([]);
    setBusy(true);
    setMenu(false);
    try {
      const c = via === "bluetooth" ? await connectBluetooth(cfg.service, lost, setDlog) : await connectUsb(undefined, lost);
      setConn(c);
      setDlog(c.log);
      const sp = keepConnected(c, !defaultId, cfg);
      setMsg({ ok: true, text: `Connected to ${c.name}${sp ? ` and saved it as "${sp.name}"` : ""}. Press Print. (First time: the ⚙️ test label checks the printer language.)` });
      void look();
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
      keepConnected(c, !defaultId, cfg);
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
      const key = `saved:${sp.id}`;
      appliedFor.current = key;
      onSave({ book: next, qlast: { ...saved.qlast, [kind]: key } });
      setActiveId(sp.id);
      setPicked(key);
      setSpErr("");
      setMsg({ ok: true, text: `Saved "${sp.name}". ${next.defaults[kind] === sp.id ? "It is the default: Print uses it." : "Choose it in Print to any time."}` });
    } catch (e) {
      setSpErr(e instanceof Error ? e.message : "Could not save.");
    }
  };
  const pickSaved = (id: string) => {
    const p = mine.find((x) => x.id === id);
    if (!p) return setActiveId("");
    setPicked(`saved:${p.id}`);
  };
  const deleteSaved = (id: string) => {
    onSave({ book: removePrinter(book, id) });
    setActiveId("");
    setPicked("");
  };
  const hangUp = async () => {
    await disconnectPrinter();
    setConn(null);
    setMsg(null);
  };

  // --- what Print uses: the printer chosen in "Print to"
  const targetFor = (o: PrinterOption | null): Target => {
    if (!o) return { mode, printer: active ? { via: active.via, deviceId: active.deviceId } : null, cfg, helperName: hprinter };
    if (o.saved) {
      const p = o.saved;
      return { mode: p.mode, printer: { via: p.via, deviceId: p.deviceId }, cfg: directConfig(kind, size.w, cfgOf(p)), helperName: p.helper || hprinter };
    }
    return {
      mode: o.mode === "window" && mode === "oneclick" ? "oneclick" : o.mode,
      printer: o.via ? { via: o.via, deviceId: o.deviceId } : null,
      cfg,
      helperName: o.helper || hprinter,
    };
  };
  // Use the open connection to that printer, else reconnect it by itself, else open the chooser (Print is a tap, so it may).
  const ensureConnected = async (t: Target): Promise<DirectConnection> => {
    const cur = currentConnection();
    if (cur && (!t.printer?.deviceId || cur.deviceId === t.printer.deviceId)) return cur;
    let c: DirectConnection | null = null;
    if (t.printer?.via === "usb") {
      const list = await knownUsbPrinters();
      const dev = (t.printer.deviceId && list.find((d) => usbMatches(d, t.printer!.deviceId!))) || (!t.printer.deviceId ? list[0] : undefined);
      if (dev) c = await connectUsb(dev, lost);
    } else if (t.printer?.via === "bluetooth" && t.printer.deviceId) {
      c = await reconnectBluetooth(t.printer.deviceId, t.cfg.service, lost, setDlog);
    }
    if (!c) c = t.printer?.via === "usb" || (!support.bluetooth && support.usb) ? await connectUsb(undefined, lost) : await connectBluetooth(t.cfg.service, lost, setDlog);
    setConn(c);
    setDlog(c.log);
    return c;
  };
  // opening the page on a saved Bluetooth / USB printer: reconnect quietly, no tap needed
  useEffect(() => {
    const p = chosen?.saved;
    if (!p || p.mode !== "direct" || !p.deviceId || currentConnection()) return;
    let live = true;
    (async () => {
      try {
        let c: DirectConnection | null = null;
        if (p.via === "usb") {
          const dev = (await knownUsbPrinters()).find((d) => usbMatches(d, p.deviceId!));
          if (dev) c = await connectUsb(dev, lost);
        } else c = await reconnectBluetooth(p.deviceId!, cfg.service, lost, setDlog);
        if (c && live) setConn(c);
      } catch {
        /* printer off or busy: Print will try again and say why */
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.key]);
  // send one 1-bit picture (or several) to the connected printer in the chosen language
  const sendMono = async (monos: Awaited<ReturnType<typeof monoFromDataUrl>>[], n: number, via: DirectConnection, c: DirectCfg = cfg) => {
    let total = 0;
    for (let i = 0; i < monos.length; i++) {
      const m = monos[i];
      const bytes = buildJob(m, {
        lang: c.lang,
        widthMm: size.w,
        heightMm: size.h ?? undefined,
        copies: n,
        gapMm: c.gapMm,
        density: c.lang === "escpos" ? Math.round((c.density / 15) * 8) : c.density,
        invert: c.invert,
        feedLines: 4,
        cut: false,
      });
      await sendBytes(via.sink, bytes, {
        chunk: Math.min(c.chunk, via.kind === "usb" ? 16384 : c.chunk),
        delayMs: via.kind === "usb" ? 0 : c.delay,
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
      const t = targetFor(chosen?.mode === "direct" ? chosen : null);
      const c = await ensureConnected({ ...t, mode: "direct" });
      const m = testPattern(dotsAcross(t.cfg.widthMm), mmToDots(Math.min(size.h ?? 40, 40)));
      await sendMono([m], 1, c, t.cfg);
      setMsg({ ok: true, text: "Test label sent. Solid square top-left and a frame = right. Hollow square or all black = tick/untick Invert. Nothing = try another language." });
    } catch (e) {
      setProg("");
      setMsg({ ok: false, text: explainError(e) });
    } finally {
      setBusy(false);
    }
  };

  const raster = () => rasterize({ selector, paperWidthMm: size.w, paperHeightMm: size.h, marginMm });
  const plural = (n: number) => `${n} ${kind}${n > 1 ? "s" : ""}`;

  /** Print once with this target. Returns the Bluetooth / USB connection used, if any. Throws with a readable message. */
  const printWith = async (t: Target): Promise<DirectConnection | null> => {
    const n = clampCopies(copies);
    if (t.mode === "window") {
      window.print();
      onDone?.();
      return null;
    }
    if (t.mode === "oneclick") {
      for (let i = 0; i < n; i++) {
        window.print(); // blocks until sent; silent when Chrome was opened with the one-click shortcut
        if (i < n - 1) await sleep(700);
      }
      setMsg({ ok: true, text: n > 1 ? `Sent ${n} copies.` : "Sent to the printer." });
      onDone?.();
      return null;
    }
    if (t.mode === "queue") {
      const pngs = await raster();
      const items = pngs.map((u) => ({ png: stripDataUrl(u), widthMm: size.w, heightMm: size.h }));
      for (const part of chunkItems(items)) await queueJob({ kind, title: name, copies: n, items: part });
      onDone?.();
      const online = q?.agent.online ?? found.queue?.online;
      setMsg({ ok: true, text: `Sent ${plural(items.length)} to the shop printer.${online ? "" : " The print helper on the shop PC is not running yet: it will print as soon as it starts."}` });
      if (mode === "queue") void loadQueue();
      return null;
    }
    if (t.mode === "direct") {
      const c = await ensureConnected(t); // first: it may need the chooser, which only opens right after the tap
      const pngs = await raster();
      const w = dotsAcross(t.cfg.widthMm);
      const monos = await Promise.all(pngs.map((u) => monoFromDataUrl(u, w, t.cfg.threshold)));
      const sent = await sendMono(monos, n, c, t.cfg);
      onDone?.();
      setMsg({ ok: true, text: `Printed ${plural(sent)} on ${c.name}${n > 1 ? ` × ${n}` : ""}.` });
      return c;
    }
    if (t.mode === "helper") {
      if (!pairingCodeOk(code)) throw new Error("Open More ways to print → This PC's helper and paste the pairing code from the helper window first.");
      if (!t.helperName) throw new Error("Choose the printer first.");
      const pngs = await raster();
      const r = await sendToHelper(buildHelperJob({ printer: t.helperName, copies: n, widthMm: size.w, heightMm: size.h, pngs, title: name }), code);
      onDone?.();
      setMsg({ ok: true, text: r.dryRun ? `Test run: ${r.printed} picture(s) saved on the shop PC, nothing printed.` : `Printed ${plural(r.printed)} on ${t.helperName}${n > 1 ? ` × ${n}` : ""}.` });
      return null;
    }
    // phone / tablet: make the pictures now; Share / Save is a second tap (a browser only lets a share start from a fresh tap)
    const made = await raster();
    setPics(made);
    setMsg({ ok: true, text: `${made.length} picture(s) ready at ${dimText}. Now tap Share.` });
    return null;
  };

  /** After a print worked: remember that printer (saving a new one) and make it the default for this page. */
  const remember = (o: PrinterOption, t: Target, c: DirectConnection | null) => {
    const s = savedRef.current;
    let b = readBook(s.book);
    let key = o.key;
    if (o.saved) {
      b = makeDefault(b, o.saved.id);
      if (c && c.deviceId && c.deviceId !== o.saved.deviceId) b = patchPrinter(b, o.saved.id, { via: c.kind, deviceId: c.deviceId });
    } else if (o.source !== "window" && o.source !== "share") {
      const { widthMm: _w, ...rest } = t.cfg;
      void _w;
      try {
        const r = savePrinter(b, {
          name: nameForNew(c ? { ...o, name: c.name } : o, b, kind),
          for: kind,
          mode: o.mode,
          ...(o.mode === "direct" ? { cfg: rest, via: c?.kind ?? o.via, deviceId: c?.deviceId ?? o.deviceId } : {}),
          ...(o.mode === "helper" ? { helper: t.helperName } : {}),
        });
        b = makeDefault(r.book, r.saved.id);
        key = `saved:${r.saved.id}`;
        appliedFor.current = key;
        setActiveId(r.saved.id);
      } catch {
        /* 12 printers saved already: printing worked, it is just not remembered */
      }
    }
    setPicked(key);
    onSave({ book: b, qlast: { ...s.qlast, [kind]: key } });
  };

  const quickPrint = async () => {
    setMsg(null);
    setMenu(false);
    setBusy(true);
    const o = chosen;
    const t = targetFor(o);
    try {
      const c = await printWith(t);
      if (o) remember(o, t, c);
      if (c || o?.source === "usb" || o?.source === "bluetooth") void look();
    } catch (e) {
      setProg("");
      if (t.mode === "direct" && t.printer?.via === "usb" && isUsbHeld(e)) {
        // Windows' own driver holds this printer: print through the print window now, and from now on
        const devId = t.printer.deviceId;
        const b = readBook(savedRef.current.book);
        onSave({
          usbHeld: devId ? Array.from(new Set([...(savedRef.current.usbHeld ?? []), devId])) : savedRef.current.usbHeld,
          ...(o?.saved ? { book: patchPrinter(b, o.saved.id, { mode: "window" }) } : {}),
        });
        if (!o?.saved) setPicked("window");
        setMode("window");
        setMsg({ ok: true, text: `This computer's own printer driver is using ${o?.name ?? "the USB printer"}, so the browser cannot reach it over USB. It is printing through the print window instead: choose ${o?.name ?? "the printer"} there once and Chrome remembers it. From now on Print opens the print window for this printer. (To print with no window at all, use the PC helper.)` });
        window.print();
        onDone?.();
      } else {
        setMsg({ ok: false, text: t.mode === "direct" ? explainError(e, t.printer?.via ?? "print") : e instanceof Error ? e.message : "Printing did not work." });
      }
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
  const tNow = targetFor(chosen);
  const showCopies = tNow.mode !== "window" && tNow.mode !== "share";
  const dotOf = (o: PrinterOption | null) => (!o ? "" : o.ready === true ? "ok" : o.ready === false ? "off" : "");
  const goText = busy ? "Printing…" : tNow.mode === "share" ? `📷 Make ${count > 1 ? `${count} pictures` : "the picture"}` : tNow.mode === "queue" ? `📤 Send ${count} to shop printer` : `🖨️ ${label}`;
  const directOk = !whyNot;

  return (
    <div className="bd-pc bd-noprint">
      <div className="bd-qp" ref={menuRef}>
        <div className="bd-qp-to">
          <span className="bd-qp-lbl">Print to</span>
          <button type="button" className="bd-qp-pick" aria-haspopup="listbox" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <span className={`bd-dot ${dotOf(chosen)}`} aria-hidden />
            <span className="bd-qp-nm">
              <b>{chosen?.isDefault ? "★ " : ""}{chosen?.name ?? "Print window"}</b>
              <small>{looking && chosen?.source !== "saved" ? "Looking for printers…" : chosen?.detail ?? ""}</small>
            </span>
            <span aria-hidden>▾</span>
          </button>
          {menu && (
            <div className="bd-qp-menu" role="listbox" aria-label="Printers">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={o.key === chosen?.key}
                  className={`bd-qp-opt${o.key === chosen?.key ? " on" : ""}`}
                  onClick={() => {
                    setPicked(o.key);
                    setMenu(false);
                    setMsg(null);
                    setPics(null);
                  }}
                >
                  <span className={`bd-dot ${dotOf(o)}`} aria-hidden />
                  <span className="bd-qp-nm">
                    <b>{o.isDefault ? "★ " : ""}{o.name}</b>
                    <small>{o.detail}</small>
                  </span>
                  {o.source !== "saved" && o.source !== "window" && o.source !== "share" && <span className="bd-chip g">found</span>}
                </button>
              ))}
              <div className="bd-qp-foot">
                {directOk && support.bluetooth && <button type="button" className="bd-btn" disabled={busy} onClick={() => void connect("bluetooth")}>＋ Bluetooth printer</button>}
                {directOk && support.usb && <button type="button" className="bd-btn" disabled={busy} onClick={() => void connect("usb")}>＋ USB printer</button>}
                <button type="button" className="bd-linkbtn" onClick={() => void look()}>{looking ? "Looking…" : "↻ Look again"}</button>
                {setupLink && <a className="bd-linkbtn" href={`/barrels/fleet/printers?kind=${kind}`}>⚙️ Printer setup</a>}
              </div>
            </div>
          )}
        </div>
        {showCopies && (
          <div className="bd-qp-copies" aria-label="Copies">
            <button type="button" className="bd-btn" onClick={() => setCopies((c) => clampCopies(c - 1))} aria-label="One copy less">−</button>
            <input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(clampCopies(e.target.value))} aria-label="Copies" />
            <button type="button" className="bd-btn" onClick={() => setCopies((c) => clampCopies(c + 1))} aria-label="One copy more">＋</button>
          </div>
        )}
        <button type="button" className="bd-btn primary bd-qp-go" onClick={() => void quickPrint()} disabled={disabled || busy}>{goText}</button>
      </div>
      {tNow.mode === "window" && (
        <div className="bd-m small">
          Chrome&apos;s window opens: choose the printer and paper <b>{dimText}</b>, Margins <b>None</b>, Scale <b>100%</b>. To print with no window, pick a printer marked <b>found</b> above, or add one with <b>＋ USB / Bluetooth printer</b>.
        </div>
      )}
      {prog && <div className="bd-m small">{prog}</div>}
      {msg && <div className={msg.ok ? "bd-pc-ok" : "bd-err"} role="status">{msg.text}</div>}
      {pics && (
        <>
          <div className="bd-row">
            <button type="button" className="bd-btn primary" onClick={() => void share()}>📤 Share to printer app</button>
            <button type="button" className="bd-btn" onClick={save}>⬇️ Save pictures</button>
          </div>
          <div className="bd-pc-pics">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pics.slice(0, 6).map((u, i) => <img key={i} src={u} alt={`Picture ${i + 1}`} style={{ aspectRatio: `${size.w} / ${size.h ?? size.w}` }} />)}
            {pics.length > 6 && <span className="bd-m">+{pics.length - 6} more</span>}
          </div>
        </>
      )}

      <details className="bd-pc-more" open={moreOpen}>
      <summary>More ways to print, printer settings and help · {dimText}</summary>
      <div className="bd-pc-moreb">
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
        setupHref={setupLink ? `/barrels/fleet/printers?kind=${kind}` : undefined}
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
          For a phone or tablet that has a printer app of its own. Choose <b>Share to printer app</b> in Print to and press the button, then <b>Share</b> and choose your printer&apos;s own app (the one you used to pair the printer). In that app pick the same label size, <b>{dimText}</b>, and print. If the share list does not show the app, tap <b>Save pictures</b> and open them from inside the printer&apos;s app.
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

      </div>
      </details>
    </div>
  );
}

