// Printer command languages for printing straight from the browser (Bluetooth / USB), no driver.
// A label is first turned into a 1-bit picture (1 = black dot), then wrapped in the commands of
// the printer's own language. Thermal label printers speak one of these:
//   TSPL    most 4x6 / 50x30 label printers (TSC-style)         ESC/POS  receipt printers (58 / 80 mm)
//   ZPL     Zebra-style shipping-label printers
// Everything here is pure (bytes in, bytes out) so it can be tested without a printer.

export type PrinterLang = "tspl" | "escpos" | "zpl";
export const PRINTER_LANGS: { id: PrinterLang; name: string; note: string }[] = [
  { id: "tspl", name: "TSPL", note: "Most label printers (4 × 6 in, 50 × 30 mm). Try this first for labels." },
  { id: "escpos", name: "ESC/POS", note: "Receipt printers (58 / 80 mm rolls). Try this first for slips." },
  { id: "zpl", name: "ZPL", note: "Zebra-style shipping-label printers. Slower over Bluetooth." },
];
export const printerLang = (v: string | null | undefined, fallback: PrinterLang): PrinterLang => (v === "tspl" || v === "escpos" || v === "zpl" ? v : fallback);

/** A 1-bit picture: rows of bytes, most significant bit first, 1 = black. */
export interface Mono {
  width: number;
  height: number;
  rowBytes: number;
  data: Uint8Array;
}

/** RGBA pixels (like canvas ImageData) to a 1-bit picture. A pixel darker than `threshold` (0-255) is black; transparent counts as white. */
export function toMono(rgba: ArrayLike<number>, width: number, height: number, threshold = 160): Mono {
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (lum < threshold) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, rowBytes, data };
}

export const countBlack = (m: Mono) => m.data.reduce((n, b) => n + popcount(b), 0);
function popcount(b: number) {
  let n = 0;
  for (let v = b; v; v &= v - 1) n++;
  return n;
}

const enc = new TextEncoder();
const ascii = (s: string) => enc.encode(s);
export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const mmText = (n: number) => String(Math.round(n * 10) / 10);

// ---------------------------------------------------------------------------
// TSPL
// ---------------------------------------------------------------------------
export interface TsplOpts {
  widthMm: number;
  heightMm: number;
  copies?: number;
  /** gap between labels in mm; 0 = continuous roll */
  gapMm?: number;
  /** print darkness 0-15 */
  density?: number;
  /** TSPL BITMAP data is "0 = black" on most printers; turn off if the label prints inverted */
  invert?: boolean;
}

export function buildTspl(m: Mono, o: TsplOpts): Uint8Array {
  const density = Math.max(0, Math.min(15, Math.round(o.density ?? 8)));
  const gap = o.gapMm ?? 3;
  const head = ascii(
    `SIZE ${mmText(o.widthMm)} mm,${mmText(o.heightMm)} mm\r\n` +
      (gap > 0 ? `GAP ${mmText(gap)} mm,0 mm\r\n` : "GAP 0 mm,0 mm\r\n") +
      `DENSITY ${density}\r\nDIRECTION 0,0\r\nREFERENCE 0,0\r\nCLS\r\n` +
      `BITMAP 0,0,${m.rowBytes},${m.height},0,`
  );
  const bits = (o.invert ?? true) ? m.data.map((b) => ~b & 0xff) : m.data;
  return concat(head, bits, ascii(`\r\nPRINT ${Math.max(1, Math.round(o.copies ?? 1))},1\r\n`));
}

// ---------------------------------------------------------------------------
// ESC/POS (GS v 0 raster, in bands so a small printer buffer is never overrun)
// ---------------------------------------------------------------------------
export interface EscposOpts {
  copies?: number;
  /** cut the paper after each copy (only if the printer has a cutter) */
  cut?: boolean;
  /** blank lines fed after the picture so it clears the tear bar */
  feedLines?: number;
  /** darkness 0-8 (GS ( K, honoured by most thermal receipt printers; ignored by the rest) */
  density?: number;
}
export function buildEscpos(m: Mono, o: EscposOpts = {}): Uint8Array {
  const BAND = 128;
  const parts: Uint8Array[] = [Uint8Array.of(0x1b, 0x40)]; // ESC @ initialise
  if (o.density != null) parts.push(Uint8Array.of(0x1d, 0x28, 0x4b, 0x02, 0x00, 0x31, Math.max(0, Math.min(8, Math.round(o.density))))); // GS ( K 2 0 49 n
  const one: Uint8Array[] = [];
  for (let y = 0; y < m.height; y += BAND) {
    const h = Math.min(BAND, m.height - y);
    one.push(Uint8Array.of(0x1d, 0x76, 0x30, 0x00, m.rowBytes & 0xff, m.rowBytes >> 8, h & 0xff, h >> 8), m.data.subarray(y * m.rowBytes, (y + h) * m.rowBytes));
  }
  one.push(Uint8Array.of(0x1b, 0x64, Math.max(0, Math.min(255, o.feedLines ?? 3)))); // ESC d n: feed
  if (o.cut) one.push(Uint8Array.of(0x1d, 0x56, 0x42, 0x00)); // GS V 66 0: feed and cut
  const copy = concat(...one);
  for (let i = 0; i < Math.max(1, Math.round(o.copies ?? 1)); i++) parts.push(copy);
  return concat(...parts);
}

// ---------------------------------------------------------------------------
// ZPL
// ---------------------------------------------------------------------------
export interface ZplOpts {
  copies?: number;
  /** darkness 0-30 */
  darkness?: number;
}
export function buildZpl(m: Mono, o: ZplOpts = {}): Uint8Array {
  const total = m.data.length;
  let hex = "";
  for (let i = 0; i < total; i++) hex += (m.data[i] < 16 ? "0" : "") + m.data[i].toString(16).toUpperCase();
  const dark = o.darkness == null ? "" : `~SD${String(Math.max(0, Math.min(30, Math.round(o.darkness)))).padStart(2, "0")}`;
  return ascii(`${dark}^XA^PW${m.width}^LL${m.height}^LH0,0^PQ${Math.max(1, Math.round(o.copies ?? 1))}^FO0,0^GFA,${total},${total},${m.rowBytes},${hex}^FS^XZ`);
}

// ---------------------------------------------------------------------------
// Anything: pick the language
// ---------------------------------------------------------------------------
export interface DirectOpts extends Partial<TsplOpts>, EscposOpts, ZplOpts {
  lang: PrinterLang;
}
export function buildJob(m: Mono, o: DirectOpts): Uint8Array {
  // label size defaults to the picture's own size (203 dpi)
  if (o.lang === "tspl") return buildTspl(m, { ...o, widthMm: o.widthMm ?? m.width / DOTS_PER_MM, heightMm: o.heightMm ?? m.height / DOTS_PER_MM });
  if (o.lang === "escpos") return buildEscpos(m, o);
  return buildZpl(m, { copies: o.copies, darkness: o.density != null ? Math.round((o.density / 15) * 30) : undefined });
}

/** Dots across a printer's print head for common widths (203 dpi). */
export const DOTS_PER_MM = 203 / 25.4;
export const mmToDots = (mm: number) => Math.round(mm * DOTS_PER_MM);

// ---------------------------------------------------------------------------
// A test picture that shows at a glance whether the language, darkness and polarity are right:
// a frame, a solid square top-left (solid = right way round, hollow = inverted), diagonals and bars.
// ---------------------------------------------------------------------------
export function testPattern(widthDots: number, heightDots: number): Mono {
  const w = widthDots;
  const rowBytes = Math.ceil(w / 8);
  const data = new Uint8Array(rowBytes * heightDots);
  const set = (x: number, y: number) => {
    if (x >= 0 && x < w && y >= 0 && y < heightDots) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
  };
  const frame = 4;
  for (let y = 0; y < heightDots; y++)
    for (let x = 0; x < w; x++) {
      if (x < frame || y < frame || x >= w - frame || y >= heightDots - frame) set(x, y);
    }
  const sq = Math.max(24, Math.round(Math.min(w, heightDots) * 0.18));
  for (let y = 12; y < 12 + sq; y++) for (let x = 12; x < 12 + sq; x++) set(x, y); // solid square
  const step = Math.max(1, Math.round(heightDots / 40));
  for (let t = 0; t < Math.min(w, heightDots); t++) {
    set(t, Math.round((t * heightDots) / Math.min(w, heightDots)));
    set(w - 1 - t, Math.round((t * heightDots) / Math.min(w, heightDots)));
  }
  for (let i = 0; i < 6; i++) for (let y = heightDots - 12 - 6 * step; y < heightDots - 12; y++) for (let x = 20 + i * 24; x < 20 + i * 24 + 6 + i * 2; x++) set(x, y); // growing bars
  return { width: w, height: heightDots, rowBytes, data };
}

export const chunks = (bytes: Uint8Array, size: number): Uint8Array[] => {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, Math.min(bytes.length, i + size)));
  return out;
};
