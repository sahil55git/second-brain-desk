// Proves the QR we draw can be read by an independent decoder (jsQR).
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { qrMatrix } from "@/lib/qr";
import { barrelLink, findBarrelCode } from "@/lib/barrels";

function decode(text: string, scale = 6, quiet = 4, ecc: "L" | "M" | "Q" | "H" = "Q") {
  const m = qrMatrix(text, ecc);
  const n = m.length + quiet * 2;
  const w = n * scale;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.floor(y / scale) - quiet;
      const c = Math.floor(x / scale) - quiet;
      if (r >= 0 && c >= 0 && r < m.length && c < m.length && m[r][c]) {
        const i = (y * w + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = 0;
      }
    }
  return jsQR(px, w, w)?.data ?? null;
}

describe("QR code", () => {
  it("round-trips a barrel link through an independent decoder", () => {
    const url = barrelLink("https://mahadev-second-brain.vercel.app", "R261010-1-03");
    expect(decode(url)).toBe(url);
  });
  it("round-trips the bare code and many different codes", () => {
    for (let lot = 1; lot <= 9; lot++) for (const seq of [1, 9, 10, 57, 80]) {
      const code = `R26101${lot}-${lot}-${String(seq).padStart(2, "0")}`;
      const url = barrelLink("https://x.example", code);
      expect(decode(url, 5)).toBe(url);
    }
  });
  it("still reads at every error-correction level", () => {
    const url = barrelLink("https://mahadev-second-brain.vercel.app", "R261010-12-80");
    for (const e of ["L", "M", "Q", "H"] as const) expect(decode(url, 6, 4, e)).toBe(url);
  });
  it("the desk can pull the barrel code back out of the scanned link or a bare barcode", () => {
    const url = barrelLink("https://mahadev-second-brain.vercel.app/", "R261010-1-03");
    expect(url).toBe("https://mahadev-second-brain.vercel.app/barrels?barrel=R261010-1-03");
    expect(findBarrelCode(url)?.code).toBe("R261010-1-03");
    expect(findBarrelCode("r261010-1-03")?.code).toBe("R261010-1-03");
    expect(findBarrelCode("https://example.com/other")).toBeNull();
    expect(findBarrelCode("")).toBeNull();
  });
});
