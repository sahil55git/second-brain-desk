// The counter slip printer of THIS device (Android app): one paired Bluetooth receipt printer that
// Save & Print sends to straight away, with no print window and no settings on the way.
//  - chosen once (or picked by itself when exactly one paired receipt printer is found; label printers
//    such as the Helett H30C are never picked for slips);
//  - the slip is ESC/POS text (lib/escposReceipt.ts), sent in ONE native call that connects, checks the
//    paper, sends paced and retries only while nothing has printed (MahadevPrinterPlugin.printJob);
//  - a slip that could not be printed is kept in the "not printed" list on this device, so it is never
//    lost: one tap prints it again.
import { MahadevPrinter, isNative, toBase64, type NativePrinter } from "./native";
import { buildReceiptEscpos, type LineRenderer, type SlipPaper } from "./escposReceipt";
import { toMono } from "./printerLang";
import type { ReceiptDoc, ShopInfo } from "./receipt";

export interface SlipPrinterCfg {
  /** "nbt:<MAC>" (Bluetooth) or "nusb:<vendor>:<product>" (USB cable) */
  id: string;
  name: string;
  paper: SlipPaper;
  cut: boolean;
  /** Kannada "thank you" and Kannada names as small pictures */
  kannada: boolean;
  /** small font for address / details / notes (off unless the person turns it on) */
  small?: boolean;
  /** picked by the app itself (the person can change it) */
  auto?: boolean;
}

const KEY = "mdSlipPrinter.v1";
const OUT = "mdSlipOutbox.v1";
const EVT = "md-slip-outbox";

const ls = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function getSlipPrinter(): SlipPrinterCfg | null {
  try {
    const v = JSON.parse(ls()?.getItem(KEY) || "null");
    return v && typeof v.id === "string" && (v.id.startsWith("nbt:") || v.id.startsWith("nusb:")) ? { paper: 80, cut: false, kannada: true, ...v } : null;
  } catch {
    return null;
  }
}
export function setSlipPrinter(c: SlipPrinterCfg | null) {
  try {
    if (c) ls()?.setItem(KEY, JSON.stringify(c));
    else ls()?.removeItem(KEY);
  } catch {
    /* storage full / private mode */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("md-slip-printer"));
}

/** Label printers speak TSPL and print on stickers: never a slip printer. */
export const isLabelPrinterName = (n: string) => /h30|helett|label|tsc|zebra|godex|tspl|niimbot|d11|b21/i.test(n);
/** 2-inch (58 mm) or 3-inch (80 mm) roll, from the printer's name. */
export function guessPaper(name: string): SlipPaper {
  const n = name.toLowerCase();
  if (/mpt-?iii|mpt-?3|80|posiflow|3 ?inch|t3|xp-?q?80/.test(n)) return 80;
  if (/mpt-?ii|mpt-?2|58|2 ?inch|ptp-?ii|bt-?58|mtp-?ii/.test(n)) return 58;
  return 80;
}
/** Paired devices that can be a slip printer, best first. */
export function slipCandidates(list: NativePrinter[]): NativePrinter[] {
  return list.filter((p) => (p.kind === "bluetooth" || p.kind === "usb") && !isLabelPrinterName(p.name)).sort((a, b) => Number(b.printer) - Number(a.printer));
}

/** True in an Android app (the only place Save & Print can reach a Bluetooth printer by itself). */
export const canDirectSlip = () => isNative();

/** The saved printer, or the only paired receipt printer (saved for next time), or null. */
export async function resolveSlipPrinter(): Promise<SlipPrinterCfg | null> {
  const c = getSlipPrinter();
  if (c || !isNative()) return c;
  try {
    const r = await MahadevPrinter.list();
    const cands = slipCandidates(r.printers).filter((p) => p.printer);
    if (cands.length !== 1) return null;
    const p = cands[0];
    const cfg: SlipPrinterCfg = { id: p.id, name: p.name, paper: guessPaper(p.name), cut: false, kannada: true, auto: true };
    setSlipPrinter(cfg);
    return cfg;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Kannada (and any script) as a picture
/** Draws a line on a canvas the paper's width and turns it into a 1-bit picture (cropped to the ink). */
export function canvasRenderer(): LineRenderer | undefined {
  if (typeof document === "undefined") return undefined;
  return (text, widthDots, st) => {
    try {
      const px = st.big ? 40 : 26;
      const c = document.createElement("canvas");
      const g = c.getContext("2d");
      if (!g) return null;
      const font = `${st.bold || st.big ? "bold " : ""}${px}px "Noto Sans Kannada", "Noto Sans", Roboto, sans-serif`;
      g.font = font;
      // wrap by measured width
      const lines: string[] = [];
      let cur = "";
      for (const w of text.split(/\s+/).filter(Boolean)) {
        const t = cur ? `${cur} ${w}` : w;
        if (g.measureText(t).width <= widthDots - 4 || !cur) cur = t;
        else {
          lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      const lh = Math.round(px * 1.4);
      c.width = widthDots;
      c.height = Math.max(1, lines.length * lh);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#000";
      g.font = font;
      g.textBaseline = "middle";
      lines.forEach((l, i) => {
        const w = g.measureText(l).width;
        const x = st.align === "center" ? (widthDots - w) / 2 : st.align === "right" ? widthDots - w - 2 : 2;
        g.fillText(l, Math.max(0, x), i * lh + lh / 2);
      });
      const img = g.getImageData(0, 0, c.width, c.height);
      return toMono(img.data, c.width, c.height, 150);
    } catch {
      return null;
    }
  };
}

// ------------------------------------------------------------------ printing
export class SlipPrintError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** What to tell the counter, in English and Kannada, and what the button should do. */
export function explainSlipError(e: unknown): { en: string; kn: string; fix?: "bt-on" | "pair" | "permission" | "setup" } {
  const code = e instanceof SlipPrintError ? e.code : (e as { code?: string })?.code || "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  switch (code) {
    case "BT_OFF":
      return { en: "Bluetooth is off. Turn it on.", kn: "ಬ್ಲೂಟೂತ್ ಆಫ್ ಆಗಿದೆ. ಆನ್ ಮಾಡಿ.", fix: "bt-on" };
    case "NO_PERMISSION":
      return { en: "Allow Nearby devices for Mahadev Desk in Android settings.", kn: "ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ Nearby devices ಅನುಮತಿ ನೀಡಿ.", fix: "permission" };
    case "NOT_PAIRED":
      return { en: "The printer is not paired any more. Pair it in Bluetooth settings.", kn: "ಪ್ರಿಂಟರ್ ಜೋಡಣೆ ಇಲ್ಲ. ಬ್ಲೂಟೂತ್‌ನಲ್ಲಿ ಜೋಡಿಸಿ.", fix: "pair" };
    case "USB_UNPLUGGED":
      return { en: "The USB printer is not plugged in. Connect the cable and switch it on.", kn: "USB ಪ್ರಿಂಟರ್ ಸಿಕ್ಕಿಲ್ಲ. ಕೇಬಲ್ ಹಾಕಿ, ಪ್ರಿಂಟರ್ ಆನ್ ಮಾಡಿ." };
    case "USB_DENIED":
      return { en: "Allow Mahadev Desk to use the USB printer: tap OK when Android asks, then print again.", kn: "Android ಕೇಳಿದಾಗ OK ಒತ್ತಿ, ಮತ್ತೆ ಮುದ್ರಿಸಿ." };
    case "USB_BUSY":
      return { en: "The USB printer is busy with another app. Close that app and print again.", kn: "USB ಪ್ರಿಂಟರ್ ಬೇರೆ ಆಪ್‌ನಲ್ಲಿ ಬಳಕೆಯಲ್ಲಿದೆ. ಅದನ್ನು ಮುಚ್ಚಿ." };
    case "USB_FAIL":
      return { en: "The USB printer did not take the data. Check cable, paper and power.", kn: "USB ಪ್ರಿಂಟರ್ ಡೇಟಾ ತೆಗೆದುಕೊಂಡಿಲ್ಲ. ಕೇಬಲ್, ಕಾಗದ, ಪವರ್ ನೋಡಿ." };
    case "PAPER_OUT":
      return { en: "No paper in the printer. Put a new roll.", kn: "ಪ್ರಿಂಟರ್‌ನಲ್ಲಿ ಕಾಗದ ಇಲ್ಲ. ಹೊಸ ರೋಲ್ ಹಾಕಿ." };
    case "COVER_OPEN":
      return { en: "The printer cover is open. Close it.", kn: "ಪ್ರಿಂಟರ್ ಮುಚ್ಚಳ ತೆರೆದಿದೆ. ಮುಚ್ಚಿ." };
    case "PARTIAL":
      return { en: "The slip may be cut short. Check it; print again if needed.", kn: "ಚೀಟಿ ಅರ್ಧ ಬಂದಿರಬಹುದು. ಬೇಕಿದ್ದರೆ ಮತ್ತೆ ಮುದ್ರಿಸಿ." };
    case "NO_PRINTER":
      return { en: "No slip printer chosen on this tablet.", kn: "ಈ ಟ್ಯಾಬ್ಲೆಟ್‌ಗೆ ಪ್ರಿಂಟರ್ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ.", fix: "setup" };
    default:
      return {
        en: `Printer not answering: switch it on, keep it near, and disconnect it from other phones. ${msg ? `(${msg.slice(0, 120)})` : ""}`.trim(),
        kn: "ಪ್ರಿಂಟರ್ ಉತ್ತರಿಸುತ್ತಿಲ್ಲ: ಆನ್ ಮಾಡಿ, ಹತ್ತಿರ ಇಡಿ, ಬೇರೆ ಫೋನ್‌ನಿಂದ ಬಿಡಿಸಿ.",
      };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notImplemented = (e: unknown) => /not implemented|is not a function|unimplemented/i.test(String((e as Error)?.message ?? e));

/** The slip's bytes for this printer. */
export function slipBytes(doc: ReceiptDoc, shop: ShopInfo, cfg: SlipPrinterCfg, copies = 1): Uint8Array {
  return buildReceiptEscpos(doc, shop, { paper: cfg.paper, cut: cfg.cut, kannada: cfg.kannada, small: cfg.small, copies }, cfg.kannada ? canvasRenderer() : undefined);
}

/** Sends the slip. Resolves when the printer took it; throws SlipPrintError with a code. */
export async function printSlip(doc: ReceiptDoc, shop: ShopInfo, cfgIn?: SlipPrinterCfg | null, copies = 1): Promise<{ confirmed: boolean; ms: number }> {
  const cfg = cfgIn ?? (await resolveSlipPrinter());
  if (!cfg) throw new SlipPrintError("NO_PRINTER", "No slip printer chosen on this device.");
  const bytes = slipBytes(doc, shop, cfg, copies);
  const t0 = Date.now();
  try {
    const r = await MahadevPrinter.printJob({ id: cfg.id, base64: toBase64(bytes), chunk: 512, delayMs: 20, status: true, keepMs: 120_000 });
    return { confirmed: !!r.confirmed, ms: r.ms ?? Date.now() - t0 };
  } catch (e) {
    if (!notImplemented(e)) {
      const code = (e as { code?: string })?.code || "NO_ANSWER";
      throw new SlipPrintError(code, e instanceof Error ? e.message : String(e));
    }
  }
  // app older than 1.3.39: the same small text slip, sent in paced pieces through the old call
  try {
    for (let at = 0; at < bytes.length; at += 512) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          MahadevPrinter.write({ id: cfg.id, base64: toBase64(bytes.subarray(at, at + 512)) }),
          new Promise((_, rej) => {
            timer = setTimeout(() => rej(new SlipPrintError(at ? "PARTIAL" : "NO_ANSWER", "The printer stopped answering.")), 15_000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      await sleep(25);
    }
  } catch (e) {
    if (e instanceof SlipPrintError) throw e;
    throw new SlipPrintError("NO_ANSWER", e instanceof Error ? e.message : String(e));
  }
  return { confirmed: false, ms: Date.now() - t0 };
}

let lastWarm = 0;
/** Opens the printer link ahead of time (quietly; errors ignored). At most every 20 s. */
export function warmSlipPrinter() {
  if (!isNative() || Date.now() - lastWarm < 20_000) return;
  lastWarm = Date.now();
  const c = getSlipPrinter();
  if (!c || c.id.startsWith("nusb:")) return; // a cable needs no warming
  MahadevPrinter.prepare({ id: c.id, keepMs: 120_000 }).catch(() => {});
}

export async function turnOnBluetooth() {
  await MahadevPrinter.enableBluetooth().catch(() => {});
}
export async function openBluetoothSettings() {
  await MahadevPrinter.openBluetoothSettings().catch(() => {});
}

// ------------------------------------------------------------------ slips that did not print
export interface UnprintedSlip {
  id: string;
  at: number;
  doc: ReceiptDoc;
  shop: ShopInfo;
  error: string;
}
export function listUnprinted(): UnprintedSlip[] {
  try {
    const v = JSON.parse(ls()?.getItem(OUT) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeUnprinted(list: UnprintedSlip[]) {
  try {
    ls()?.setItem(OUT, JSON.stringify(list.slice(-25)));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}
/** Keeps a slip that did not print. Same id again replaces the old entry. */
export function keepUnprinted(s: UnprintedSlip) {
  writeUnprinted([...listUnprinted().filter((x) => x.id !== s.id), s]);
}
export function dropUnprinted(id: string) {
  writeUnprinted(listUnprinted().filter((x) => x.id !== id));
}
export function onUnprintedChange(f: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => f();
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener("storage", h);
  };
}
/** A stable id for a slip (title + number + time), so a retry replaces it instead of adding it twice. */
export const slipId = (d: ReceiptDoc) => `${d.title}|${d.no ?? ""}|${d.when ?? ""}|${(d.rows || []).length}`;
