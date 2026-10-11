// Code 128 barcode encoder (pure, no dependencies). Used for barrel labels so
// any phone camera, USB barcode gun or Bluetooth scanner can read them.
//
// Code set B covers every printable ASCII character (letters, digits, "-"),
// which is all a barrel code needs. Digit-only text of 4+ digits is packed
// with code set C (two digits per symbol) to keep the label short.

// Bar/space widths for symbol values 0..105 (alternating bar, space, ...; each sums to 11 modules).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const STOP = "2331112"; // 7 elements, 13 modules
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;

export const CODE128_PATTERNS = PATTERNS;
export const CODE128_STOP = STOP;

/** Can this text be written as Code 128? (printable ASCII, 1–40 characters) */
export function code128Ok(text: string): boolean {
  return typeof text === "string" && text.length >= 1 && text.length <= 40 && /^[\x20-\x7e]+$/.test(text);
}

/** Symbol values (including start and checksum, excluding stop) for the text. */
export function code128Symbols(text: string): number[] {
  if (!code128Ok(text)) throw new Error("Code 128 text must be 1–40 printable ASCII characters");
  const out: number[] = [];
  let mode: "B" | "C" | null = null;
  let i = 0;
  while (i < text.length) {
    // Use code set C for a run of 4+ digits.
    const run = /^\d+/.exec(text.slice(i))?.[0].length ?? 0;
    if (run >= 4) {
      const pairs = Math.floor(run / 2);
      if (mode !== "C") {
        out.push(mode === null ? START_C : CODE_C);
        mode = "C";
      }
      for (let p = 0; p < pairs; p++) out.push(Number(text.slice(i + p * 2, i + p * 2 + 2)));
      i += pairs * 2;
      continue;
    }
    if (mode !== "B") {
      out.push(mode === null ? START_B : CODE_B);
      mode = "B";
    }
    out.push(text.charCodeAt(i) - 32);
    i += 1;
  }
  let sum = out[0];
  for (let k = 1; k < out.length; k++) sum += out[k] * k;
  out.push(sum % 103);
  return out;
}

/** Module string, "1" = bar, "0" = space, including a 10-module quiet zone each side. */
export function code128Modules(text: string, quiet = 10): string {
  const symbols = code128Symbols(text);
  let bits = "";
  for (const s of symbols) bits += expand(PATTERNS[s]);
  bits += expand(STOP);
  return "0".repeat(quiet) + bits + "0".repeat(quiet);
}

function expand(widths: string): string {
  let bar = true;
  let out = "";
  for (const ch of widths) {
    out += (bar ? "1" : "0").repeat(Number(ch));
    bar = !bar;
  }
  return out;
}

/** Inline SVG of the barcode (no text). `moduleWidth` is in SVG user units. */
export function code128Svg(text: string, opts: { moduleWidth?: number; height?: number; quiet?: number } = {}): { svg: string; width: number; height: number } {
  const mw = opts.moduleWidth ?? 2;
  const h = opts.height ?? 60;
  const modules = code128Modules(text, opts.quiet ?? 10);
  const width = modules.length * mw;
  let rects = "";
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === "1") {
      let j = i;
      while (j < modules.length && modules[j] === "1") j++;
      rects += `<rect x="${i * mw}" y="0" width="${(j - i) * mw}" height="${h}"/>`;
      i = j;
    } else i++;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(text)}"><rect width="${width}" height="${h}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  return { svg, width, height: h };
}

function escapeAttr(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Decode a module string back to text (used by tests to prove the encoder round-trips). */
export function code128Decode(modules: string): string | null {
  const bits = modules.replace(/^0+|0+$/g, "");
  const widths: number[] = [];
  let i = 0;
  while (i < bits.length) {
    let j = i;
    while (j < bits.length && bits[j] === bits[i]) j++;
    widths.push(j - i);
    i = j;
  }
  // 6 elements per symbol, then the 7-element stop.
  if ((widths.length - 7) % 6 !== 0 || widths.length < 6 * 3 + 7) return null;
  const symbols: number[] = [];
  for (let k = 0; k < widths.length - 7; k += 6) {
    const idx = PATTERNS.indexOf(widths.slice(k, k + 6).join(""));
    if (idx < 0) return null;
    symbols.push(idx);
  }
  if (widths.slice(-7).join("") !== STOP) return null;
  const check = symbols.pop() as number;
  let sum = symbols[0];
  for (let k = 1; k < symbols.length; k++) sum += symbols[k] * k;
  if (sum % 103 !== check) return null;
  let mode = symbols[0] === START_C ? "C" : symbols[0] === START_B ? "B" : null;
  if (!mode) return null;
  let text = "";
  for (const s of symbols.slice(1)) {
    if (s === CODE_B) mode = "B";
    else if (s === CODE_C) mode = "C";
    else if (mode === "C") text += String(s).padStart(2, "0");
    else text += String.fromCharCode(s + 32);
  }
  return text;
}
