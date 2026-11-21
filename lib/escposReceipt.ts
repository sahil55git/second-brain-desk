// A receipt (bill, payment receipt, challan, day summary) as ESC/POS commands for a roll printer, built
// straight from the receipt data instead of a picture of the page. A bill comes to 1-5 KB instead of
// 60-150 KB, so it reaches a battery Bluetooth printer in well under a second and nothing overflows its
// 4 KB buffer. Text the printer's own font cannot show (Kannada) and the UPI QR are sent as small
// pictures. Pure (no browser): the page passes a `render` function that draws a text line on a canvas.
// Tested in lib/__tests__/escposReceipt.test.ts.
import { cleanReceipt, type ReceiptDoc, type ShopInfo } from "./receipt";
import { concat, type Mono } from "./printerLang";
import { qrMatrix } from "./qr";

export type SlipPaper = 58 | 80;
export interface SlipLayout {
  paper: SlipPaper;
  /** printable dots across (8 dots per mm) */
  dots: number;
  /** characters per line in the printer's normal font */
  cols: number;
}
export const SLIP_LAYOUTS: Record<SlipPaper, SlipLayout> = {
  58: { paper: 58, dots: 384, cols: 32 },
  80: { paper: 80, dots: 576, cols: 48 },
};

export interface LineStyle {
  /** the printer's small font (font B): about a third more characters per line, shorter lines */
  small?: boolean;
  bold?: boolean;
  big?: boolean;
  align?: "left" | "center" | "right";
}
/** Draws one line of text (any language) as a 1-bit picture `widthDots` wide, or null if it cannot. */
export type LineRenderer = (text: string, widthDots: number, style: LineStyle) => Mono | null;

export interface SlipOpts {
  paper?: SlipPaper;
  /** cut after the slip (printers with a cutter) */
  cut?: boolean;
  /** blank lines fed at the end so the slip clears the tear bar */
  feed?: number;
  /** add "ಧನ್ಯವಾದಗಳು" under "Thank you" (needs `render`) */
  kannada?: boolean;
  copies?: number;
}

const ESC = 0x1b;
const GS = 0x1d;
const enc = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0) & 0x7f));
const INIT = Uint8Array.of(ESC, 0x40, ESC, 0x74, 0x00); // ESC @ reset, ESC t 0 code page 437 (we only send ASCII)
const align = (a: "left" | "center" | "right") => Uint8Array.of(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
const bold = (on: boolean) => Uint8Array.of(ESC, 0x45, on ? 1 : 0);
/** GS ! n: 0x00 normal, 0x01 double height, 0x11 double width and height */
const size = (n: number) => Uint8Array.of(GS, 0x21, n);
const LF = Uint8Array.of(0x0a);
/** ESC M n: 0 = font A (normal), 1 = font B (small) */
const fontB = (on: boolean) => Uint8Array.of(ESC, 0x4d, on ? 1 : 0);
/** characters per line in the small font (9 dots wide) */
export const smallCols = (dots: number) => Math.floor(dots / 9);

/** Characters the shop uses that the printer cannot show, as plain ASCII. */
export function asciiText(s: string): string {
  return s
    .replace(/₹\s*/g, "Rs.")
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/[·•]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}
/** True when the text still has characters the printer's font has not got (Kannada, emoji...). */
export const needsPicture = (s: string) => /[^\x20-\x7e]/.test(asciiText(s));
/** Drops what cannot be printed as text (used when no picture can be drawn). */
const printable = (s: string) => asciiText(s).replace(/[^\x20-\x7e]+/g, "").replace(/\s{2,}/g, " ").trim();

/** Splits text into lines of at most `cols` characters, breaking at spaces where it can. */
export function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      if (!word) continue;
      let w = word;
      while (w.length > cols) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += " " + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/** "Groundnut oil 5 kg ......... Rs.900": left text, right text at the end of the (last) line. */
export function leftRight(left: string, right: string, cols: number): string[] {
  if (!right) return wrap(left, cols);
  const lines = left ? wrap(left, cols) : [""];
  const last = lines[lines.length - 1];
  if (last.length + 1 + right.length <= cols) lines[lines.length - 1] = last + " ".repeat(cols - last.length - right.length) + right;
  else lines.push(" ".repeat(Math.max(0, cols - right.length)) + right.slice(0, cols));
  return lines;
}

/** A 1-bit picture as GS v 0 bands of 24 rows (small battery printers overflow on bigger bands). */
export function rasterBands(m: Mono): Uint8Array {
  const BAND = 24;
  const parts: Uint8Array[] = [];
  for (let y = 0; y < m.height; y += BAND) {
    const h = Math.min(BAND, m.height - y);
    parts.push(Uint8Array.of(GS, 0x76, 0x30, 0x00, m.rowBytes & 0xff, m.rowBytes >> 8, h & 0xff, h >> 8), m.data.subarray(y * m.rowBytes, (y + h) * m.rowBytes));
  }
  return concat(...parts);
}

/** A QR code as a square picture (at most `widthDots` wide), each module `module` dots. Printed centred
 *  with ESC a 1, so no white margin bytes are sent (a printer that ignores that prints it on the left). */
export function qrMono(text: string, widthDots: number, module = 0): Mono | null {
  let mat: boolean[][];
  try {
    mat = qrMatrix(text, "L"); // low error correction = fewer modules = a smaller code on the roll
  } catch {
    return null;
  }
  const Q = 2; // quiet zone (modules): the white paper around the code is margin enough
  const n = mat.length + 2 * Q;
  const mod = module || Math.max(2, Math.min(3, Math.floor((widthDots * 0.45) / n))); // modules of 2-3 dots keep it small and still scannable
  const side = n * mod;
  const width = Math.min(widthDots, Math.ceil(side / 8) * 8);
  const rowBytes = width / 8;
  const data = new Uint8Array(rowBytes * side);
  const x0 = Q * mod;
  for (let r = 0; r < mat.length; r++)
    for (let c = 0; c < mat.length; c++) {
      if (!mat[r][c]) continue;
      for (let dy = 0; dy < mod; dy++)
        for (let dx = 0; dx < mod; dx++) {
          const x = x0 + c * mod + dx;
          const y = (r + Q) * mod + dy;
          if (x < width) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
    }
  return { width, height: side, rowBytes, data };
}

/**
 * The slip as ESC/POS bytes. `render` draws lines the printer's font cannot show (Kannada); without it
 * those characters are left out. Layout follows the on-screen receipt: shop, title, number and time,
 * party, item rows, totals, notes, day-summary block, QR, thank you.
 */
export function buildReceiptEscpos(docIn: ReceiptDoc, shop: ShopInfo, o: SlipOpts = {}, render?: LineRenderer): Uint8Array {
  const doc = cleanReceipt(docIn);
  const L = SLIP_LAYOUTS[o.paper === 58 ? 58 : 80];
  const cols = L.cols;
  const out: Uint8Array[] = [INIT];
  const textLines = (lines: string[]) => lines.forEach((l) => out.push(enc(l), LF));

  /** one piece of text, as text when the printer can show it, else as a picture */
  const line = (s: string, st: LineStyle = {}) => {
    if (!s) return;
    const a = st.align ?? "left";
    if (needsPicture(s) && render) {
      const m = render(s, L.dots, { ...st, align: a });
      if (m && m.height > 0) {
        out.push(align("left"), rasterBands(m));
        return;
      }
    }
    const t = printable(s);
    if (!t) return;
    const w = st.big ? Math.floor(cols / 2) : st.small ? smallCols(L.dots) : cols;
    out.push(align(a), bold(!!st.bold), size(st.big ? 0x11 : 0x00), fontB(!!st.small));
    textLines(wrap(t, w));
    out.push(fontB(false), size(0), bold(false), align("left"));
  };
  const rule = (ch = "-") => out.push(align("left"), enc(ch.repeat(cols)), LF);
  /** left + right on one line; a left side in Kannada goes on its own picture line first */
  const pair = (left: string, right: string, st: { bold?: boolean; tall?: boolean } = {}) => {
    const r = printable(right);
    let l = left;
    if (needsPicture(left) && render) {
      line(left, { bold: st.bold });
      l = "";
    }
    out.push(bold(!!st.bold), size(st.tall ? 0x01 : 0x00));
    textLines(leftRight(printable(l), r, cols));
    out.push(size(0), bold(false));
  };

  // shop
  const shopName = shop.name || "";
  // compact on purpose: roll paper costs money, so the shop block is small type and the title shares a line with the number and time
  line(shopName, { bold: true, align: "center" });
  if (shop.address) line(shop.address, { small: true, align: "center" });
  const contact = [shop.phone && `Ph ${shop.phone}`, shop.gstin && `GSTIN ${shop.gstin}`].filter(Boolean).join("  ");
  if (contact) line(contact, { small: true, align: "center" });
  rule();
  if (doc.title || doc.no || doc.when) {
    const head = [printable(doc.title || ""), doc.no ? `No. ${printable(doc.no)}` : ""].filter(Boolean).join("  ");
    out.push(align("left"), bold(true), fontB(true));
    textLines(leftRight(head, doc.when ? printable(doc.when) : "", smallCols(L.dots)));
    out.push(fontB(false), bold(false));
  }
  if (doc.party) line(doc.party, { bold: true });
  if (doc.rows.length) {
    rule();
    for (const r of doc.rows) {
      pair(r.name, r.amount ?? "");
      if (r.detail) line(`  ${r.detail}`, { small: true });
    }
  }
  if (doc.pre) {
    rule();
    out.push(align("left"));
    for (const p of doc.pre.split("\n")) {
      if (needsPicture(p) && render) line(p);
      else textLines([printable(p).slice(0, cols)]);
    }
  }
  if (doc.totals && doc.totals.length) {
    rule();
    for (const t of doc.totals) pair(t.label, t.value, { bold: t.strong, tall: t.strong });
  }
  if (doc.notes && doc.notes.length) {
    rule();
    for (const n of doc.notes) line(n, { small: true });
  }
  if (doc.qr) {
    const q = qrMono(doc.qr, L.dots);
    if (q) out.push(align("center"), rasterBands(q), align("left"));
  }
  line("Thank you", { align: "center" });
  if (o.kannada !== false && render) line("ಧನ್ಯವಾದಗಳು", { align: "center" });
  out.push(Uint8Array.of(ESC, 0x64, Math.max(1, Math.min(10, o.feed ?? 3)))); // ESC d n: feed
  if (o.cut) out.push(Uint8Array.of(GS, 0x56, 0x42, 0x00));
  const one = concat(...out.slice(1));
  const copies = Math.max(1, Math.min(5, Math.round(o.copies ?? 1)));
  return concat(INIT, ...Array.from({ length: copies }, () => one));
}
