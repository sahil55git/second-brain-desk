// QR code for barrel labels and slips (uses the small `qrcode-generator` encoder;
// drawing is our own so it prints crisp as SVG). Error correction "Q" (25%) so a
// scuffed or oily label still scans.
import qrcode from "qrcode-generator";

export function qrMatrix(text: string, ecc: "L" | "M" | "Q" | "H" = "Q"): boolean[][] {
  if (!text || text.length > 300) throw new Error("QR text must be 1–300 characters");
  const qr = qrcode(0, ecc); // type 0 = pick the smallest size that fits
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Inline SVG of the QR code, including the 4-module quiet zone the standard requires. */
export function qrSvg(text: string, opts: { moduleSize?: number; quiet?: number; ecc?: "L" | "M" | "Q" | "H" } = {}): { svg: string; size: number } {
  const m = qrMatrix(text, opts.ecc ?? "Q");
  const q = opts.quiet ?? 4;
  const s = opts.moduleSize ?? 4;
  const n = m.length;
  const size = (n + q * 2) * s;
  let path = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) {
        c++;
        continue;
      }
      let e = c;
      while (e < n && m[r][e]) e++;
      path += `M${(c + q) * s} ${(r + q) * s}h${(e - c) * s}v${s}h${-(e - c) * s}z`;
      c = e;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return { svg, size };
}
