import { describe, expect, it } from "vitest";
import { DOTS_PER_MM, buildEscpos, buildJob, buildTspl, buildZpl, chunks, countBlack, mmToDots, printerLang, testPattern, toMono } from "../printerLang";

const dec = (b: Uint8Array) => Array.from(b).map((c) => String.fromCharCode(c)).join("");
// 10 x 2 picture: left half black, right half white
const px = (w: number, h: number, black: (x: number, y: number) => boolean) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = black(x, y) ? 0 : 255;
      a.set([v, v, v, 255], (y * w + x) * 4);
    }
  return a;
};

describe("1-bit pictures", () => {
  it("packs bits most-significant first, 1 = black", () => {
    const m = toMono(px(10, 2, (x) => x < 3), 10, 2);
    expect(m.rowBytes).toBe(2);
    expect(Array.from(m.data)).toEqual([0b11100000, 0, 0b11100000, 0]);
    expect(countBlack(m)).toBe(6);
  });
  it("treats grey by the threshold and transparent as white", () => {
    const a = new Uint8ClampedArray([100, 100, 100, 255, 200, 200, 200, 255, 0, 0, 0, 0, 0, 0, 0, 255]);
    expect(Array.from(toMono(a, 4, 1, 160).data)).toEqual([0b10010000]);
    expect(Array.from(toMono(a, 4, 1, 220).data)).toEqual([0b11010000]);
  });
});

describe("TSPL", () => {
  const m = toMono(px(16, 2, (x) => x < 8), 16, 2);
  it("sets the label size, the gap and the bitmap, then prints the copies", () => {
    const t = dec(buildTspl(m, { widthMm: 50, heightMm: 75, copies: 3, gapMm: 3, density: 10 }));
    expect(t.startsWith("SIZE 50 mm,75 mm\r\nGAP 3 mm,0 mm\r\nDENSITY 10\r\n")).toBe(true);
    expect(t).toContain("BITMAP 0,0,2,2,0,");
    expect(t.endsWith("\r\nPRINT 3,1\r\n")).toBe(true);
  });
  it("inverts the bitmap by default (0 = black) and can keep it as is", () => {
    const body = (inv: boolean) => {
      const b = buildTspl(m, { widthMm: 50, heightMm: 30, invert: inv });
      const at = dec(b).indexOf("BITMAP 0,0,2,2,0,") + "BITMAP 0,0,2,2,0,".length;
      return Array.from(b.subarray(at, at + 4));
    };
    expect(body(true)).toEqual([0x00, 0xff, 0x00, 0xff]);
    expect(body(false)).toEqual([0xff, 0x00, 0xff, 0x00]);
  });
  it("continuous roll sends no gap and clamps darkness", () => {
    const t = dec(buildTspl(m, { widthMm: 80, heightMm: 100, gapMm: 0, density: 99 }));
    expect(t).toContain("GAP 0 mm,0 mm");
    expect(t).toContain("DENSITY 15");
  });
});

describe("ESC/POS", () => {
  it("starts with reset, sends GS v 0 rasters in bands, feeds and cuts", () => {
    const m = toMono(px(16, 300, (x, y) => (x + y) % 2 === 0), 16, 300);
    const b = buildEscpos(m, { cut: true, feedLines: 4 });
    expect(Array.from(b.subarray(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(b.subarray(2, 10))).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 128, 0]); // first band: 2 bytes wide, 128 rows
    const bands = Array.from(b).reduce((n, v, i, a) => n + (v === 0x1d && a[i + 1] === 0x76 && a[i + 2] === 0x30 ? 1 : 0), 0);
    expect(bands).toBeGreaterThanOrEqual(3); // 300 rows = 128 + 128 + 44
    expect(Array.from(b.subarray(b.length - 7))).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
  });
  it("repeats the picture for copies", () => {
    const m = toMono(px(8, 4, () => true), 8, 4);
    const one = buildEscpos(m, { copies: 1 }).length;
    const three = buildEscpos(m, { copies: 3 }).length;
    expect(three).toBeGreaterThan(one * 2);
  });
});

describe("ZPL", () => {
  it("wraps the picture as hex with width, length and copies", () => {
    const m = toMono(px(8, 2, (x) => x < 4), 8, 2);
    const z = dec(buildZpl(m, { copies: 2, darkness: 20 }));
    expect(z).toBe("~SD20^XA^PW8^LL2^LH0,0^PQ2^FO0,0^GFA,2,2,1,F0F0^FS^XZ");
  });
});

describe("choosing the language", () => {
  it("buildJob picks the right builder and falls back safely", () => {
    const m = toMono(px(8, 2, () => true), 8, 2);
    expect(dec(buildJob(m, { lang: "tspl", widthMm: 10, heightMm: 10 }))).toContain("BITMAP");
    expect(buildJob(m, { lang: "escpos" })[0]).toBe(0x1b);
    expect(dec(buildJob(m, { lang: "zpl" }))).toContain("^XA");
    expect(printerLang("zpl", "tspl")).toBe("zpl");
    expect(printerLang("nonsense", "tspl")).toBe("tspl");
    expect(printerLang(undefined, "escpos")).toBe("escpos");
  });
  it("203 dpi is about 8 dots per mm", () => {
    expect(DOTS_PER_MM).toBeCloseTo(7.99, 1);
    expect(mmToDots(50)).toBe(400);
    expect(mmToDots(101.6)).toBe(812);
  });
});

describe("test pattern and chunking", () => {
  it("has a solid square top-left and a frame, and is the right size", () => {
    const t = testPattern(400, 300);
    expect(t.rowBytes).toBe(50);
    expect(t.data.length).toBe(50 * 300);
    const bit = (x: number, y: number) => (t.data[y * t.rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    expect(bit(20, 20)).toBe(1); // inside the square
    expect(bit(0, 150)).toBe(1); // frame
    expect(bit(399, 150)).toBe(1);
    expect(bit(200, 8)).toBe(0); // empty between frame and content
    expect(countBlack(t)).toBeGreaterThan(1000);
  });
  it("splits bytes for a slow link", () => {
    const parts = chunks(new Uint8Array(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
    expect(chunks(new Uint8Array(0), 100)).toEqual([]);
  });
});
