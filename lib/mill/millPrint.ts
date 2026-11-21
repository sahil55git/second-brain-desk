// Mill Desk printing on the Helett H30C (a TSPL label printer): ONE tap, no print window.
//
//   desk (iframe) ──"print" message──▶ MillDeskFrame ──▶ this file ──MahadevPrinter.printJob──▶ printer
//
// The desk sends a small description of the paper (title, rows, barcode text), never HTML. Here it is
// laid out in printer dots (203 dpi), drawn on a canvas as one picture (so Kannada names print too),
// cut into label-sized pages and sent as TSPL in ONE native call that connects, sends in small paced
// pieces and reconnects only while nothing has printed (so a label is never printed twice by itself).
// A job that cannot print is kept on the device ("not printed") and printed again with one tap.
//
// Pure parts (layout, paging, TSPL bytes, config, outbox) are tested in lib/__tests__/millPrint.test.ts.
import { code128Modules, code128Ok } from "@/lib/code128";
import { qrMatrix } from "@/lib/qr";
import { buildEscpos, buildTspl, concat, mmToDots, toMono, type Mono } from "@/lib/printerLang";
import { MahadevPrinter, isNative, toBase64, type NativePrinter } from "@/lib/native";

// ------------------------------------------------------------------ what the desk sends
export type MillRow = [string, string] | "-";
export interface MillPrintDoc {
  kind: "slip" | "token" | "sticker";
  /** barcode text, also printed under it: WS-0012 / JW-0012 */
  code: string;
  shop: string;
  title: string;
  sub?: string;
  when?: string;
  rows: MillRow[];
  /** big line under the rows, e.g. ["Estimate", "₹ 1,250"] */
  total?: [string, string];
  /** small last line, e.g. ["By Raju", "20 Nov 06:11 PM"] */
  foot?: [string, string];
  /** also print a QR of `code` */
  qr?: boolean;
}

/** Keeps what the desk sent within sane limits, so a bad message can never break printing. */
export function cleanDoc(raw: unknown): MillPrintDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, n = 80) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, n) : "");
  const code = s(r.code, 30);
  if (!code || !Array.isArray(r.rows)) return null;
  const rows: MillRow[] = [];
  for (const x of r.rows.slice(0, 60)) {
    if (x === "-") rows.push("-");
    else if (Array.isArray(x) && x.length >= 2) rows.push([s(x[0]), s(x[1], 40)]);
  }
  const pair = (v: unknown): [string, string] | undefined => (Array.isArray(v) && v.length >= 2 ? [s(v[0], 40), s(v[1], 40)] : undefined);
  return {
    kind: r.kind === "token" ? "token" : r.kind === "sticker" ? "sticker" : "slip",
    code,
    shop: s(r.shop, 40) || "MAHADEV TRADERS",
    title: s(r.title, 40),
    sub: s(r.sub, 40) || undefined,
    when: s(r.when, 40) || undefined,
    rows,
    total: pair(r.total),
    foot: pair(r.foot),
    qr: r.qr === true,
  };
}

// ------------------------------------------------------------------ the printer on this device
export interface MillPrinterCfg {
  /** "nbt:<MAC>" (Bluetooth) or "nusb:<vendor>:<product>" (USB cable, OTG), both through the phone */
  id: string;
  name: string;
  widthMm: number;
  /** label height; 0 = continuous roll (as tall as the slip) */
  heightMm: number;
  gapMm: number;
  density: number;
  /** TSPL bitmap "0 = black": ticked is right for the Helett H30C (docs/PRINTING.md) */
  invert: boolean;
  /** "tspl" = label printer (Helett); "escpos" = receipt printer (MPT-III and other POS roll printers) */
  lang: "tspl" | "escpos";
}

export const MILL_PAPERS: { id: string; name: string; widthMm: number; heightMm: number; gapMm: number; lang: "tspl" | "escpos" }[] = [
  { id: "50x75", name: "50 × 75 mm label", widthMm: 50, heightMm: 75, gapMm: 3, lang: "tspl" },
  { id: "75x100", name: "75 × 100 mm label", widthMm: 75, heightMm: 100, gapMm: 3, lang: "tspl" },
  { id: "100x150", name: "100 × 150 mm (4 × 6 in) label", widthMm: 100, heightMm: 150, gapMm: 3, lang: "tspl" },
  { id: "50x30", name: "50 × 30 mm sticker (slips split over several)", widthMm: 50, heightMm: 30, gapMm: 3, lang: "tspl" },
  { id: "roll50", name: "Roll without gaps, 50 mm wide", widthMm: 50, heightMm: 0, gapMm: 0, lang: "tspl" },
  // receipt rolls: the width is the PRINTED width (a 58 mm roll prints 48 mm, an 80 mm roll 72 mm)
  { id: "rcpt58", name: "Receipt roll 58 mm (2 inch)", widthMm: 48, heightMm: 0, gapMm: 0, lang: "escpos" },
  { id: "rcpt80", name: "Receipt roll 80 mm (3 inch)", widthMm: 72, heightMm: 0, gapMm: 0, lang: "escpos" },
];
/** Receipt (bill) printers: MPT-III, "POS-58", RPP02, PT-210 … */
export const isReceiptName = (n: string) => /\bmpt|pos[-_ ]?\d|\bpos\b|receipt|rpp\d|\bpt-?\d{3}|\bmtp|58mm|80mm|thermal/i.test(n);

const KEY = "mdMillPrinter.v1";
const OUT = "mdMillOutbox.v1";
const EVT_CFG = "md-mill-printer";
const EVT_OUT = "md-mill-outbox";

const ls = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};
const num = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
};

export const isUsbId = (id: string) => id.startsWith("nusb:");
export const isMillPrinterId = (id: string) => id.startsWith("nbt:") || isUsbId(id);

export function cleanCfg(v: unknown): MillPrinterCfg | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !isMillPrinterId(r.id)) return null;
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name ? r.name.slice(0, 40) : "Printer",
    widthMm: num(r.widthMm, 20, 108, 50),
    heightMm: r.heightMm === 0 ? 0 : num(r.heightMm, 15, 300, 75),
    gapMm: num(r.gapMm, 0, 12, 3),
    density: num(r.density, 0, 15, 8),
    invert: typeof r.invert === "boolean" ? r.invert : true,
    lang: r.lang === "escpos" ? "escpos" : "tspl",
  };
}
/** Two places on one phone: the RECEIPT printer (MPT-III: customer slips) and the LABEL printer (Helett: tokens, bag / barrel stickers). */
export type PrinterSlot = "receipt" | "label";
export interface MillPrinters {
  receipt: MillPrinterCfg | null;
  label: MillPrinterCfg | null;
}
const KEY2 = "mdMillPrinters.v1";
export function getMillPrinters(): MillPrinters {
  const out: MillPrinters = { receipt: null, label: null };
  try {
    const raw = ls()?.getItem(KEY2);
    if (raw) {
      const v = JSON.parse(raw) as Record<string, unknown>;
      out.receipt = cleanCfg(v?.receipt);
      out.label = cleanCfg(v?.label);
      if (out.receipt) out.receipt.lang = "escpos";
      if (out.label) out.label.lang = "tspl";
      return out;
    }
    // the single printer saved by earlier versions goes to its own place by type
    const old = cleanCfg(JSON.parse(ls()?.getItem(KEY) || "null"));
    if (old) out[old.lang === "escpos" ? "receipt" : "label"] = old;
  } catch {
    /* none */
  }
  return out;
}
function writePrinters(p: MillPrinters) {
  try {
    if (p.receipt || p.label) ls()?.setItem(KEY2, JSON.stringify(p));
    else ls()?.removeItem(KEY2);
    ls()?.removeItem(KEY); // the old single entry is now inside the new one
  } catch {
    /* storage full / private mode: it still works for this visit */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT_CFG));
}
export function setMillPrinterSlot(slot: PrinterSlot, c: MillPrinterCfg | null) {
  const cur = getMillPrinters();
  cur[slot] = c ? { ...c, lang: slot === "receipt" ? "escpos" : "tspl" } : null;
  writePrinters(cur);
}
/** Which printer a paper goes to: the customer's weight slip to the receipt printer, tokens and stickers to the label printer.
 *  With only one printer chosen, everything goes there (as before). */
export function printerFor(doc: Pick<MillPrintDoc, "kind">, p: MillPrinters = getMillPrinters()): MillPrinterCfg | null {
  return doc.kind === "slip" ? p.receipt ?? p.label : p.label ?? p.receipt;
}
/** The printer used for tokens (kept for older callers): label printer first. */
export function getMillPrinter(): MillPrinterCfg | null {
  const p = getMillPrinters();
  return p.label ?? p.receipt;
}
export function setMillPrinter(c: MillPrinterCfg | null) {
  if (c) setMillPrinterSlot(c.lang === "escpos" ? "receipt" : "label", c);
  else writePrinters({ receipt: null, label: null });
}
export const onMillPrinterChange = (f: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT_CFG, f);
  return () => window.removeEventListener(EVT_CFG, f);
};

/** Label printers (TSPL) first: the Helett H30C and friends. */
export const isLabelishName = (n: string) => /h30|helett|label|tsc|zebra|godex|tspl|xprinter|\bxp-?\d|niimbot|d11|b21/i.test(n);
/** Many label printers show up twice: "H30C_F1BA" (normal Bluetooth, what the app prints over) and "H30C_F1BA_BLE" (low-energy, which the app cannot print over). */
export const isBleName = (n: string) => /(^|[\s_-])ble$/i.test(n.trim());
export function labelCandidates(list: NativePrinter[]): NativePrinter[] {
  return list
    .filter((p) => p.kind === "bluetooth" || p.kind === "usb")
    .sort((a, b) => Number(isBleName(a.name)) - Number(isBleName(b.name)) || Number(isLabelishName(b.name)) - Number(isLabelishName(a.name)) || Number(b.printer) - Number(a.printer));
}

// ------------------------------------------------------------------ layout (in printer dots)
export type Op =
  | { t: "text"; x: number; y: number; h: number; text: string; px: number; bold: boolean; align: "left" | "right" | "center" }
  | { t: "hr"; x: number; y: number; h: number; w: number }
  | { t: "bars"; x: number; y: number; h: number; modules: string; mod: number }
  | { t: "qr"; x: number; y: number; h: number; matrix: boolean[][]; mod: number };

export type Measure = (text: string, px: number, bold: boolean) => number;

const MARGIN = 6;

/** Words wrapped to a width; a single word wider than the line is cut. */
export function wrapText(text: string, maxW: number, px: number, bold: boolean, measure: Measure): string[] {
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (measure(w, px, bold) > maxW && w.length > 1) {
      // cut the long word where it fits
      let k = w.length - 1;
      while (k > 1 && measure(w.slice(0, k), px, bold) > maxW) k--;
      push();
      out.push(w.slice(0, k));
      w = w.slice(k);
    }
    const t = cur ? `${cur} ${w}` : w;
    if (cur && measure(t, px, bold) > maxW) {
      push();
      cur = w;
    } else cur = t;
  }
  push();
  return out.length ? out : [""];
}

/** The whole slip as drawing operations, top to bottom. `scale` shrinks everything (to fit a small label). */
export function layoutDoc(doc: MillPrintDoc, widthDots: number, measure: Measure, scale = 1): { ops: Op[]; height: number } {
  const base = Math.max(18, Math.min(32, Math.round(widthDots / 15))) * scale;
  const px = Math.round(base);
  const big = Math.round(base * 1.3);
  const lh = (p: number) => Math.round(p * 1.3);
  const inner = widthDots - 2 * MARGIN;
  const ops: Op[] = [];
  let y = 4;
  const centered = (text: string, p: number, bold: boolean) => {
    for (const line of wrapText(text, inner, p, bold, measure)) {
      ops.push({ t: "text", x: widthDots / 2, y, h: lh(p), text: line, px: p, bold, align: "center" });
      y += lh(p);
    }
  };
  const hr = () => {
    y += 3;
    ops.push({ t: "hr", x: MARGIN, y, h: 3, w: inner });
    y += 6;
  };
  const pair = (l: string, r: string, p: number, bold: boolean) => {
    const rw = measure(r, p, true);
    const gap = Math.round(p * 0.6);
    const leftMax = Math.max(inner * 0.3, inner - rw - gap);
    const lines = wrapText(l, leftMax, p, bold, measure);
    lines.forEach((line, i) => {
      ops.push({ t: "text", x: MARGIN, y, h: lh(p), text: line, px: p, bold, align: "left" });
      if (i === 0) ops.push({ t: "text", x: widthDots - MARGIN, y, h: lh(p), text: r, px: p, bold: true, align: "right" });
      y += lh(p);
    });
  };

  if (doc.shop) centered(doc.shop, big, true);
  if (doc.title) centered(doc.title, px, true);
  if (doc.sub) centered(doc.sub, px, false);
  if (doc.when) centered(doc.when, Math.round(px * 0.85), false);
  hr();
  for (const r of doc.rows) {
    if (r === "-") hr();
    else pair(r[0], r[1], px, false);
  }
  if (doc.total) {
    hr();
    pair(doc.total[0], doc.total[1], big, true);
  }
  if (doc.foot) {
    hr();
    pair(doc.foot[0], doc.foot[1], Math.round(px * 0.85), false);
  }
  y += 8;
  // The phones scan the QR with the camera, so the QR is what is printed (no barcode: nobody has a scanner),
  // with the number under it. A barcode is only the fallback if the QR cannot be made, or when asked for (qr:false).
  let qrDone = false;
  if (doc.qr !== false) {
    try {
      const m = qrMatrix(doc.code, "M");
      const want = Math.round(6 * Math.min(1, scale + 0.1));
      const mod = Math.max(3, Math.min(want, Math.floor(Math.min(inner, widthDots * 0.55) / m.length)));
      const side = m.length * mod;
      ops.push({ t: "qr", x: Math.round((widthDots - side) / 2), y, h: side, matrix: m, mod });
      y += side + 4;
      qrDone = true;
    } catch {
      /* fall back to the barcode below */
    }
  }
  if (!qrDone && code128Ok(doc.code)) {
    const modules = code128Modules(doc.code, 0);
    const mod = Math.max(1, Math.min(3, Math.floor(inner / modules.length)));
    const w = modules.length * mod;
    const h = Math.max(48, Math.round(base * 2.2));
    ops.push({ t: "bars", x: Math.round((widthDots - w) / 2), y, h, modules, mod });
    y += h + 4;
  }
  centered(doc.code, px, true);
  return { ops, height: y + 4 };
}

/** Cuts the drawing into pages of `pageDots` without cutting through a line, barcode or QR. */
export function paginate(ops: Op[], pageDots: number): Op[][] {
  if (pageDots <= 0) return [ops];
  const pages: Op[][] = [];
  let cur: Op[] = [];
  let start = 0;
  for (const op of ops) {
    if (cur.length && op.y + op.h - start > pageDots) {
      pages.push(cur);
      cur = [];
      start = op.y;
    }
    cur.push({ ...op, y: op.y - start } as Op);
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** Page height (dots) for a continuous roll: the drawing's own height, a whole number of dots. */
export const continuousHeight = (ops: Op[]) => ops.reduce((m, o) => Math.max(m, o.y + o.h), 0) + 6;

export interface PlannedJob {
  pages: Op[][];
  widthDots: number;
  /** printed height of every page in dots */
  pageDots: number[];
  scale: number;
}

/** Layout for this printer: shrinks the writing a little (down to 75 %) to keep one slip on one label, then cuts into pages. */
export function planJob(doc: MillPrintDoc, cfg: Pick<MillPrinterCfg, "widthMm" | "heightMm">, measure: Measure): PlannedJob {
  const widthDots = Math.max(8, Math.round(mmToDots(cfg.widthMm) / 8) * 8);
  const labelDots = cfg.heightMm > 0 ? mmToDots(cfg.heightMm) : 0;
  let scale = 1;
  let lay = layoutDoc(doc, widthDots, measure, scale);
  if (labelDots > 0 && lay.height > labelDots) {
    // shrink the text and the QR a little; only then spill onto a second label
    const tries = [0.9, 0.82, 0.75, 0.68, 0.62];
    let fitted = false;
    for (const t of tries) {
      const l = layoutDoc(doc, widthDots, measure, t);
      if (l.height <= labelDots) {
        lay = l;
        scale = t;
        fitted = true;
        break;
      }
    }
    if (!fitted) {
      scale = 0.62;
      lay = layoutDoc(doc, widthDots, measure, scale);
    }
  }
  const pages = paginate(lay.ops, labelDots);
  const pageDots = pages.map((p) => (labelDots > 0 ? labelDots : continuousHeight(p)));
  return { pages, widthDots, pageDots, scale };
}

// ------------------------------------------------------------------ drawing and bytes
/** Draws one page on a canvas (browser only) and returns it as black and white dots. */
export function renderPage(ops: Op[], widthDots: number, heightDots: number): Mono {
  const c = document.createElement("canvas");
  c.width = widthDots;
  c.height = heightDots;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("Could not prepare the slip.");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, widthDots, heightDots);
  g.fillStyle = "#000";
  g.textBaseline = "top";
  for (const o of ops) {
    if (o.t === "text") {
      g.font = fontOf(o.px, o.bold);
      g.textAlign = o.align;
      g.fillText(o.text, o.x, o.y + Math.round(o.px * 0.12));
    } else if (o.t === "hr") {
      g.fillRect(o.x, o.y, o.w, 2);
    } else if (o.t === "bars") {
      for (let i = 0; i < o.modules.length; ) {
        if (o.modules[i] !== "1") {
          i++;
          continue;
        }
        let j = i;
        while (j < o.modules.length && o.modules[j] === "1") j++;
        g.fillRect(o.x + i * o.mod, o.y, (j - i) * o.mod, o.h);
        i = j;
      }
    } else if (o.t === "qr") {
      for (let r = 0; r < o.matrix.length; r++) for (let k = 0; k < o.matrix.length; k++) if (o.matrix[r][k]) g.fillRect(o.x + k * o.mod, o.y + r * o.mod, o.mod, o.mod);
    }
  }
  const img = g.getImageData(0, 0, widthDots, heightDots);
  return toMono(img.data, widthDots, heightDots, 150);
}

export const fontOf = (px: number, bold: boolean) => `${bold ? "bold " : ""}${px}px "Noto Sans Kannada", "Noto Sans", Roboto, "DejaVu Sans", sans-serif`;

/** A measuring function backed by a canvas (browser only). */
export function canvasMeasure(): Measure {
  const g = document.createElement("canvas").getContext("2d");
  return (text, px, bold) => {
    if (!g) return text.length * px * 0.6;
    g.font = fontOf(px, bold);
    return g.measureText(text).width;
  };
}

/** TSPL bytes of the whole job: every page, `copies` of each. */
export function jobBytes(pagesMono: Mono[], cfg: Pick<MillPrinterCfg, "widthMm" | "heightMm" | "gapMm" | "density" | "invert"> & { lang?: MillPrinterCfg["lang"] }, copies: number): Uint8Array {
  const n = Math.max(1, Math.min(10, Math.round(copies) || 1));
  if (cfg.lang === "escpos") {
    // a receipt printer: the slip as one picture down the roll, fed past the tear bar, N times
    return concat(...pagesMono.map((m) => buildEscpos(m, { copies: n, feedLines: 4, density: Math.round((cfg.density / 15) * 8) })));
  }
  return concat(
    ...pagesMono.map((m) =>
      buildTspl(m, {
        widthMm: cfg.widthMm,
        heightMm: cfg.heightMm > 0 ? cfg.heightMm : Math.round(((m.height / 203) * 25.4) * 10) / 10,
        gapMm: cfg.heightMm > 0 ? cfg.gapMm : 0,
        density: cfg.density,
        invert: cfg.invert,
        copies: n,
      }),
    ),
  );
}

export function buildMillJob(doc: MillPrintDoc, cfg: MillPrinterCfg, copies = 1): { bytes: Uint8Array; pages: number } {
  const plan = planJob(doc, cfg, canvasMeasure());
  const monos = plan.pages.map((ops, i) => renderPage(ops, plan.widthDots, plan.pageDots[i]));
  return { bytes: jobBytes(monos, cfg, copies), pages: monos.length };
}

/** A sample slip for the Test print button. */
export const TEST_DOC: MillPrintDoc = {
  kind: "token",
  code: "TEST-0001",
  shop: "MAHADEV TRADERS",
  title: "PRINTER TEST",
  sub: "Mill 1",
  when: "",
  rows: [["Seed", "123.45 kg"], ["Bags", "3"], "-", ["ಬೀಜ", "50.00 kg"]],
  total: ["Total", "173.45 kg"],
  qr: true,
};

// ------------------------------------------------------------------ errors in plain words
export class MillPrintError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export type PrintFix = "bt-on" | "pair" | "permission" | "setup" | "app" | "usb";
export function explainPrintError(e: unknown, printerName = ""): { text: string; fix?: PrintFix } {
  const code = e instanceof MillPrintError ? e.code : (e as { code?: string })?.code || "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (isBleName(printerName) && !code.startsWith("USB") && code !== "BT_OFF" && code !== "NO_PERMISSION" && code !== "NOT_APP" && code !== "NO_PRINTER") {
    return { text: `“${printerName}” is the low-energy (BLE) entry and the app cannot print over it. Forget it in Bluetooth settings and pair the one without “_BLE” (the one with the printer icon), then choose that.`, fix: "setup" };
  }
  switch (code) {
    case "BT_OFF":
      return { text: "Bluetooth is off. Turn it on.", fix: "bt-on" };
    case "NO_PERMISSION":
      return { text: "Allow Nearby devices for Mahadev Desk in Android settings.", fix: "permission" };
    case "NOT_PAIRED":
      return { text: "The printer is not paired any more. Pair it in Bluetooth settings.", fix: "pair" };
    case "NO_PRINTER":
      return { text: "No printer chosen on this phone yet. Choose it once: Settings → Choose printers.", fix: "setup" };
    case "NOT_APP":
      return { text: "One-tap printing works in the Mahadev Desk Android app.", fix: "app" };
    case "USB_UNPLUGGED":
      return { text: "The USB printer is not plugged in. Connect the cable and switch the printer on.", fix: "usb" };
    case "USB_DENIED":
      return { text: "Allow Mahadev Desk to use the USB printer: tap OK when Android asks (tick “always”), then print again.", fix: "usb" };
    case "USB_BUSY":
      return { text: "The USB printer is busy with another app. Close the printer's own app and print again.", fix: "usb" };
    case "USB_FAIL":
      return { text: "The USB printer did not take the data. Check the cable, paper and that it is switched on.", fix: "usb" };
    case "PARTIAL":
      return { text: "The label may be cut short. Look at it; print again only if it is short." };
    case "PAPER_OUT":
      return { text: "No paper in the printer." };
    default:
      return { text: `Printer not answering: switch it on, keep it near, close the printer's own app and disconnect it from other phones.${msg ? ` (${msg.slice(0, 100)})` : ""}` };
  }
}

const notImplemented = (e: unknown) => /not implemented|is not a function|unimplemented/i.test(String((e as Error)?.message ?? e));

/** Sends a job. Resolves when the printer took it; throws MillPrintError with a code. */
export async function sendBytes(cfg: MillPrinterCfg, bytes: Uint8Array): Promise<{ ms: number }> {
  if (!isNative()) throw new MillPrintError("NOT_APP", "Not in the app");
  const t0 = Date.now();
  try {
    // status:false — a label printer is not asked the receipt-printer status question
    // a label printer (TSPL) is not asked the receipt-printer status question; a receipt printer is
    // (it tells "paper out"), and gets smaller, slower pieces: small battery printers have a 4 KB buffer
    const rc = cfg.lang === "escpos";
    // a receipt printer is shared with the Weigh & Bill counter (the oil bills must never wait): let it go
    // 10 s after the slip (the shortest the app allows) instead of holding it for 5 minutes
    await MahadevPrinter.printJob({ id: cfg.id, base64: toBase64(bytes), chunk: rc ? 256 : 480, delayMs: rc ? 20 : 8, status: rc, keepMs: rc ? MILL_RECEIPT_KEEP_MS : 300_000 });
    return { ms: Date.now() - t0 };
  } catch (e) {
    if (!notImplemented(e)) throw new MillPrintError((e as { code?: string })?.code || "NO_ANSWER", e instanceof Error ? e.message : String(e));
  }
  // an app older than printJob: the same bytes in paced pieces through write()
  let at = 0;
  try {
    for (; at < bytes.length; at += 240) {
      await MahadevPrinter.write({ id: cfg.id, base64: toBase64(bytes.subarray(at, at + 240)) });
      await new Promise((r) => setTimeout(r, 25));
    }
  } catch (e) {
    // part of the label already went out: say so (and never retry it by itself)
    throw new MillPrintError(at > 0 ? "PARTIAL" : "NO_ANSWER", e instanceof Error ? e.message : String(e));
  }
  return { ms: Date.now() - t0 };
}

/** Prints one slip. Throws MillPrintError. */
/** How long the Mill Desk keeps a RECEIPT printer after a slip: the app's minimum, so the bill counter can print. */
export const MILL_RECEIPT_KEEP_MS = 10_000;

/** NO_ANSWER = the app could not reach the printer and sent NOTHING, so trying again cannot print a second copy. */
export function safeToRetry(e: unknown): boolean {
  const code = e instanceof MillPrintError ? e.code : (e as { code?: string })?.code || "";
  return code === "NO_ANSWER";
}

export async function printMillDoc(doc: MillPrintDoc, copies = 1, cfgIn?: MillPrinterCfg | null, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<{ ms: number; pages: number }> {
  const cfg = cfgIn ?? printerFor(doc);
  if (!cfg) throw new MillPrintError("NO_PRINTER", "No printer chosen.");
  const { bytes, pages } = buildMillJob(doc, cfg, copies);
  const t0 = Date.now();
  try {
    const r = await sendBytes(cfg, bytes);
    return { ms: r.ms, pages };
  } catch (e) {
    // a printer that was asleep or busy with the scale's reconnect often answers a few seconds later:
    // one more try, but only when nothing was sent (never a second copy) and the person is not kept waiting long
    if (!safeToRetry(e) || Date.now() - t0 > 45_000) throw e;
    await wait(2500);
    await sendBytes(cfg, bytes);
    return { ms: Date.now() - t0, pages };
  }
}

/** Opens the link ahead of time so the first print does not wait for it (quiet; errors ignored). */
let lastWarm = 0;
export function warmMillPrinter() {
  if (!isNative() || Date.now() - lastWarm < 20_000) return;
  const c = getMillPrinters().label; // never the receipt printer: it may be shared with the Weigh & Bill counter
  if (!c || isUsbId(c.id)) return; // a cable needs no warming
  lastWarm = Date.now();
  MahadevPrinter.prepare({ id: c.id, keepMs: 300_000 }).catch(() => {});
}

// ------------------------------------------------------------------ jobs that did not print
export interface UnprintedMill {
  id: string;
  at: number;
  doc: MillPrintDoc;
  copies: number;
  error: string;
}
export function listUnprinted(): UnprintedMill[] {
  try {
    const v = JSON.parse(ls()?.getItem(OUT) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && cleanDoc(x.doc)) : [];
  } catch {
    return [];
  }
}
function writeUnprinted(list: UnprintedMill[]) {
  try {
    ls()?.setItem(OUT, JSON.stringify(list.slice(-25)));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT_OUT));
}
/** Keeps a job that did not print. The same code again replaces the old entry (a retry never adds a second one). */
/** A sticker has the same code as its slip, but is a different job: never replace one by the other. */
export const docKey = (d: Pick<MillPrintDoc, "kind" | "code">) => (d.kind === "sticker" ? `${d.code}#sticker` : d.code);
export function keepUnprinted(j: UnprintedMill) {
  writeUnprinted([...listUnprinted().filter((x) => docKey(x.doc) !== docKey(j.doc)), j]);
}
export function dropUnprinted(key: string) {
  writeUnprinted(listUnprinted().filter((x) => docKey(x.doc) !== key));
}
export const onUnprintedChange = (f: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT_OUT, f);
  return () => window.removeEventListener(EVT_OUT, f);
};
