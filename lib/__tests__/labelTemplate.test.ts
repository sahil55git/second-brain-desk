import { describe, expect, it } from "vitest";
import {
  LABEL_STARTS, LIMITS, TINY_PNG, matchSize, startLabel, alignEls, barcodeDots, docFontSpec, qrFit, blankLabel, blankSlip, canRedo, canUndo, checkDoc, cleanName, barcodeModuleCount, distributeEls, duplicateItems, fillTokens, histNew, histPush, histRedo, histUndo,
  moveBlock, newBlock, newDateCorner, newLabelEl, newWeightDate, nextId, reorder, resizeBox, resizeLabel, sampleData, sanitizeDoc, snapBox, snapTo, starterLabel, starterSlip, unknownTokens,
  type LabelDoc, type LabelEl, type SlipDoc, type TextEl,
} from "@/lib/labelTemplate";

const seq = () => {
  let n = 0;
  return () => (n++ * 7919 + 13) / 36 ** 5 % 1;
};

describe("fillTokens", () => {
  const data = { code: "BRL-01", tare: "18.4", mark: "", note: "  " };
  it("fills known tokens and keeps unknown ones as typed", () => {
    expect(fillTokens("{code} / {nope}", data).text).toBe("BRL-01 / {nope}");
  });
  it("uses the fallback for an empty value", () => {
    const f = fillTokens("TARE {mark|________} kg", data);
    expect(f.text).toBe("TARE ________ kg");
    expect(f.empty).toBe(true);
  });
  it("counts blank tokens, treats whitespace as blank, and is not empty when one token has a value", () => {
    expect(fillTokens("{code} {mark}", data)).toMatchObject({ tokens: 2, blank: 1, empty: false });
    expect(fillTokens("{note}", data).empty).toBe(true);
    expect(fillTokens("plain text", data)).toMatchObject({ tokens: 0, empty: false });
  });
  it("does not treat prototype names as tokens", () => {
    expect(fillTokens("{constructor} {toString}", data).text).toBe("{constructor} {toString}");
  });
  it("lists tokens the kind does not know", () => {
    expect(unknownTokens("{code} {tareee} {gross}", "label")).toEqual(["tareee", "gross"]);
    expect(unknownTokens("{code} {gross}", "slip")).toEqual([]);
  });
});

describe("sanitizeDoc", () => {
  it("rejects the wrong kind and non-objects", () => {
    expect(sanitizeDoc(null, "label").ok).toBe(false);
    expect(sanitizeDoc({ kind: "slip" }, "label").ok).toBe(false);
  });
  it("keeps numbers in range, drops unknown element types and unknown fields", () => {
    const r = sanitizeDoc({ kind: "label", widthMm: 9999, heightMm: -4, els: [{ type: "text", id: "a", x: 1, y: 2, w: 10, h: 4, text: "hi", size: 999, evil: "<script>" }, { type: "nope" }, 5] }, "label");
    expect(r.ok).toBe(true);
    if (!r.ok || r.doc.kind !== "label") return;
    expect(r.doc.widthMm).toBe(LIMITS.labelW[1]);
    expect(r.doc.heightMm).toBe(LIMITS.labelH[0]);
    expect(r.doc.els).toHaveLength(1);
    const t = r.doc.els[0] as TextEl;
    expect(t.size).toBe(LIMITS.pt[1]);
    expect(t).not.toHaveProperty("evil");
  });
  it("gives duplicate or bad ids new ones", () => {
    const r = sanitizeDoc({ kind: "label", widthMm: 50, heightMm: 30, els: [{ type: "line", id: "x" }, { type: "line", id: "x" }, { type: "line", id: "<b>" }] }, "label");
    expect(r.ok).toBe(true);
    if (!r.ok || r.doc.kind !== "label") return;
    expect(new Set(r.doc.els.map((e) => e.id)).size).toBe(3);
  });
  it("accepts a small png logo but refuses svg, javascript: and oversize pictures", () => {
    const ok = sanitizeDoc({ kind: "label", widthMm: 50, heightMm: 30, els: [{ type: "image", src: TINY_PNG }] }, "label");
    expect(ok.ok).toBe(true);
    for (const src of ["data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)", "https://x.test/a.png", "data:image/png;base64," + "A".repeat(LIMITS.maxImageChars)]) {
      expect(sanitizeDoc({ kind: "label", widthMm: 50, heightMm: 30, els: [{ type: "image", src }] }, "label").ok).toBe(false);
    }
  });
  it("caps the number of items and the total picture size", () => {
    const many = Array.from({ length: LIMITS.maxEls + 1 }, () => ({ type: "line" }));
    expect(sanitizeDoc({ kind: "label", widthMm: 50, heightMm: 30, els: many }, "label").ok).toBe(false);
    const big = "data:image/png;base64," + "A".repeat(150_000);
    const three = [1, 2, 3].map(() => ({ type: "image", src: big }));
    expect(sanitizeDoc({ kind: "label", widthMm: 50, heightMm: 30, els: three }, "label").ok).toBe(false);
  });
  it("cleans slip blocks: cells capped at 4, empty cols / sign dropped", () => {
    const cell = { label: "a", value: "b" };
    const r = sanitizeDoc({ kind: "slip", widthMm: 80, marginMm: 99, blocks: [{ type: "cols", cells: [cell, cell, cell, cell, cell] }, { type: "cols", cells: [] }, { type: "sign", labels: [] }, { type: "divider", style: "weird" }] }, "slip");
    expect(r.ok).toBe(true);
    if (!r.ok || r.doc.kind !== "slip") return;
    expect(r.doc.marginMm).toBe(LIMITS.slipMargin[1]);
    expect(r.doc.blocks).toHaveLength(2);
    expect(r.doc.blocks[0]).toMatchObject({ type: "cols" });
    expect((r.doc.blocks[0] as { cells: unknown[] }).cells).toHaveLength(4);
    expect(r.doc.blocks[1]).toMatchObject({ type: "divider", style: "solid" });
  });
  it("cleanName trims, collapses spaces and caps the length", () => {
    expect(cleanName("  A   B ")).toBe("A B");
    expect(cleanName("x".repeat(200))).toHaveLength(LIMITS.maxName);
    expect(cleanName(5)).toBe("");
  });
});

describe("starter templates", () => {
  const sizes: [number, number][] = [[50, 30], [50, 75], [100, 150], [40, 30], [60, 40], [38, 25]];
  it.each(sizes)("label %i × %i mm: everything sits inside the paper and survives sanitizing", (w, h) => {
    const doc = starterLabel(w, h);
    expect(doc.els.length).toBeGreaterThan(5);
    for (const e of doc.els) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(doc.widthMm + 0.05);
      expect(e.y + e.h).toBeLessThanOrEqual(doc.heightMm + 0.05);
    }
    const again = sanitizeDoc(JSON.parse(JSON.stringify(doc)), "label");
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.doc).toEqual(doc);
  });
  it("label elements do not overlap each other much on the standard sizes", () => {
    for (const [w, h] of [[50, 30], [50, 75]] as const) {
      const els = starterLabel(w, h).els.filter((e) => e.type !== "rect" && e.type !== "line");
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          const a = els[i];
          const b = els[j];
          const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ow > 0.3 && oh > 0.3, `${w}x${h}: ${a.type}#${a.id} overlaps ${b.type}#${b.id}`).toBe(false);
        }
      }
    }
  });
  it("starter label has no warnings on sample data", () => {
    expect(checkDoc(starterLabel(50, 75), sampleData("label"))).toEqual([]);
    expect(checkDoc(starterLabel(50, 30), sampleData("label"))).toEqual([]);
  });
  it("slip uses only known tokens and survives sanitizing", () => {
    for (const w of [58, 80, 74]) {
      const doc = starterSlip(w);
      expect(checkDoc(doc, sampleData("slip"))).toEqual([]);
      const again = sanitizeDoc(JSON.parse(JSON.stringify(doc)), "slip");
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.doc).toEqual(doc);
    }
  });
});

describe("new items", () => {
  it("new label items fit the canvas and get unused ids", () => {
    const doc = starterLabel(50, 30);
    for (const t of ["text", "barcode", "qr", "image", "rect", "line"] as const) {
      const e = newLabelEl(t, doc, seq());
      expect(doc.els.some((x) => x.id === e.id)).toBe(false);
      expect(e.x + e.w).toBeLessThanOrEqual(50);
      expect(e.y + e.h).toBeLessThanOrEqual(30);
    }
  });
  it("new slip blocks have unused ids and pass the sanitizer", () => {
    const doc = starterSlip(80);
    const types = ["text", "kv", "cols", "barcode", "qr", "image", "divider", "spacer", "sign"] as const;
    const blocks = types.map((t) => newBlock(t, doc, seq()));
    const r = sanitizeDoc({ ...doc, blocks }, "slip");
    expect(r.ok).toBe(true);
    if (r.ok && r.doc.kind === "slip") expect(r.doc.blocks).toHaveLength(types.length);
  });
  it("nextId never repeats a taken id", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) taken.add(nextId(taken));
    expect(taken.size).toBe(200);
  });
});

describe("geometry", () => {
  it("snapTo rounds to the grid", () => {
    expect(snapTo(3.3, 0.5)).toBe(3.5);
    expect(snapTo(3.3, 0)).toBe(3.3);
  });
  it("snapBox lines the centre up with the canvas centre and reports the guide", () => {
    const r = snapBox({ x: 19.2, y: 5, w: 10, h: 5 }, [], 50, 30, 1);
    expect(r.dx).toBeCloseTo(0.8, 5);
    expect(r.guidesX).toEqual([25]);
    expect(r.dy).toBe(0);
  });
  it("snapBox aligns to another item's edge and ignores things further than the tolerance", () => {
    const other = { x: 10, y: 10, w: 8, h: 8 };
    expect(snapBox({ x: 17.5, y: 22, w: 5, h: 3 }, [other], 50, 30, 1).dx).toBeCloseTo(0.5, 5);
    expect(snapBox({ x: 13, y: 22, w: 5, h: 3 }, [other], 50, 30, 1).dx).toBe(0);
  });
  it("resizeBox moves the right edge and keeps a minimum size", () => {
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(resizeBox(b, "e", 5, 0, { W: 50, H: 30 })).toEqual({ x: 5, y: 5, w: 15, h: 10 });
    expect(resizeBox(b, "e", -20, 0, { W: 50, H: 30, min: 2 })).toMatchObject({ x: 5, w: 2 });
  });
  it("resizeBox from the top-left keeps the opposite corner fixed and stays on the canvas", () => {
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(resizeBox(b, "nw", -2, -3, { W: 50, H: 30 })).toEqual({ x: 3, y: 2, w: 12, h: 13 });
    const out = resizeBox(b, "nw", -20, -20, { W: 50, H: 30 });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.x + out.w).toBe(15);
  });
  it("resizeBox with keepRatio keeps the shape", () => {
    const r = resizeBox({ x: 5, y: 5, w: 10, h: 10 }, "se", 4, 1, { W: 50, H: 30, keepRatio: true });
    expect(r.w).toBe(r.h);
    expect(r.w).toBe(14);
  });
  it("resizeBox never goes past the canvas", () => {
    const r = resizeBox({ x: 40, y: 5, w: 5, h: 5 }, "e", 30, 0, { W: 50, H: 30 });
    expect(r.x + r.w).toBe(50);
  });
  const line = (id: string, x: number, y: number, w = 4, h = 4): LabelEl => ({ id, type: "line", x, y, w, h, thick: 0.3 });
  it("alignEls: one item goes to the canvas, several to each other", () => {
    expect(alignEls([line("a", 3, 3)], ["a"], "hcenter", 50, 30)[0].x).toBe(23);
    expect(alignEls([line("a", 3, 3), line("b", 20, 9)], ["a", "b"], "left", 50, 30).map((e) => e.x)).toEqual([3, 3]);
    expect(alignEls([line("a", 3, 3), line("b", 20, 9)], ["a", "b"], "bottom", 50, 30).map((e) => e.y + e.h)).toEqual([13, 13]);
  });
  it("distributeEls makes equal gaps and leaves other items alone", () => {
    const out = distributeEls([line("a", 0, 0), line("b", 5, 0), line("c", 30, 0), line("z", 40, 9)], ["a", "b", "c"], "h");
    expect(out.map((e) => e.x)).toEqual([0, 15, 30, 40]);
    expect(distributeEls([line("a", 0, 0), line("b", 5, 0)], ["a", "b"], "h").map((e) => e.x)).toEqual([0, 5]);
  });
  it("reorder moves to front / back and one step", () => {
    const l = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(reorder(l, ["b"], "front").map((e) => e.id)).toEqual(["a", "c", "d", "b"]);
    expect(reorder(l, ["c"], "back").map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
    expect(reorder(l, ["b"], "forward").map((e) => e.id)).toEqual(["a", "c", "b", "d"]);
    expect(reorder(l, ["d"], "forward").map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(reorder(l, ["b", "c"], "backward").map((e) => e.id)).toEqual(["b", "c", "a", "d"]);
  });
  it("duplicateItems offsets the copy and leaves the original", () => {
    const r = duplicateItems([line("a", 3, 3)], ["a"], 2, seq());
    expect(r.list).toHaveLength(2);
    expect(r.list[1]).toMatchObject({ x: 5, y: 5 });
    expect(r.ids).toEqual([r.list[1].id]);
    expect(r.list[0].id).not.toBe(r.list[1].id);
  });
  it("moveBlock swaps neighbours and stops at the ends", () => {
    const l = ["a", "b", "c"].map((id) => ({ id }));
    expect(moveBlock(l, "b", -1).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(moveBlock(l, "a", -1)).toBe(l);
    expect(moveBlock(l, "c", 1)).toBe(l);
  });
  it("resizeLabel scales items and text and keeps them inside", () => {
    const doc = starterLabel(50, 30);
    const big = resizeLabel(doc, 100, 60);
    expect(big.widthMm).toBe(100);
    const t0 = doc.els.find((e) => e.type === "text") as TextEl;
    const t1 = big.els.find((e) => e.id === t0.id) as TextEl;
    expect(t1.size).toBeCloseTo(t0.size * 2, 0);
    for (const e of big.els) expect(e.x + e.w).toBeLessThanOrEqual(100.05);
  });
});

describe("history", () => {
  it("undo and redo walk the steps", () => {
    let h = histNew<number>(1);
    h = histPush(h, 2);
    h = histPush(h, 3);
    expect(canUndo(h)).toBe(true);
    h = histUndo(h);
    expect(h.present).toBe(2);
    h = histUndo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    expect(histUndo(h)).toBe(h);
    h = histRedo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
  });
  it("a new change drops the redo steps; the same value is not a step", () => {
    let h = histPush(histNew(1), 2);
    h = histUndo(h);
    h = histPush(h, 5);
    expect(canRedo(h)).toBe(false);
    expect(histPush(h, 5)).toBe(h);
  });
  it("changes with the same key count as one step", () => {
    let h = histNew("");
    for (const s of ["a", "ab", "abc"]) h = histPush(h, s, "text:1");
    expect(h.past).toEqual([""]);
    h = histPush(h, "abcd", "text:2");
    expect(h.past).toEqual(["", "abc"]);
  });
  it("keeps at most 100 steps", () => {
    let h = histNew(0);
    for (let i = 1; i <= 150; i++) h = histPush(h, i);
    expect(h.past).toHaveLength(100);
  });
});

describe("checkDoc", () => {
  const withBarcode = (w: number, value = "{code}"): LabelDoc => ({ ...blankLabel(50, 30), els: [{ id: "1", type: "barcode", x: 1, y: 1, w, h: 8, value, human: false }] });
  it("warns when a barcode is too narrow for 203 dpi and passes when it is wide enough", () => {
    expect(checkDoc(withBarcode(20), sampleData("label")).join(" ")).toMatch(/too tight/);
    expect(checkDoc(withBarcode(48), sampleData("label"))).toEqual([]);
  });
  it("warns about a barcode that cannot be drawn", () => {
    expect(checkDoc(withBarcode(48, "ಕನ್ನಡ"), sampleData("label")).join(" ")).toMatch(/cannot be drawn/);
  });
  it("warns about unknown tokens once, tiny QR, tiny text and empty logo boxes", () => {
    const doc: LabelDoc = {
      ...blankLabel(50, 30),
      els: [
        { id: "1", type: "text", x: 0, y: 0, w: 10, h: 4, text: "{foo} {foo}", font: "sans", size: 4, bold: false, italic: false, align: "left", valign: "top", invert: false, fit: false },
        { id: "2", type: "qr", x: 0, y: 5, w: 8, h: 8, value: "{link}" },
        { id: "3", type: "image", x: 0, y: 15, w: 8, h: 8, src: TINY_PNG, fit: "contain" },
      ],
    };
    const w = checkDoc(doc, sampleData("label"));
    expect(w.filter((x) => x.includes("{foo}"))).toHaveLength(1);
    expect(w.join(" ")).toMatch(/QR/);
    expect(w.join(" ")).toMatch(/under 5 pt/);
    expect(w.join(" ")).toMatch(/no logo/);
  });
  it("barcodeDots picks whole printer dots per bar", () => {
    const f = barcodeDots(48, "BRL-01");
    expect(f).not.toBeNull();
    expect(f!.dotsPerModule).toBeGreaterThanOrEqual(2);
    expect(f!.widthMm).toBeLessThanOrEqual(48);
    expect(f!.moduleMm).toBeCloseTo(f!.dotsPerModule * 25.4 / 203, 1);
    expect(barcodeDots(10, "BRL-01")!.dotsPerModule).toBe(0);
    expect(barcodeDots(48, "ಕ")).toBeNull();
  });
  it("barcodeModuleCount counts start + data + check + stop + quiet zones", () => {
    expect(barcodeModuleCount("A")).toBe(3 * 11 + 13 + 20);
    expect(barcodeModuleCount("ಕ")).toBeNull();
  });
  it("blank documents have the right kind", () => {
    expect(blankLabel(50, 30).kind).toBe("label");
    expect((blankSlip(58) as SlipDoc).marginMm).toBe(2);
    expect((blankSlip(80) as SlipDoc).marginMm).toBe(3);
  });
});

describe("qrFit / docFontSpec", () => {
  it("qrFit snaps the QR to whole printer dots and never exceeds the box", () => {
    const f = qrFit(13.5, "https://app.example/barrels/fleet?code=BRL-01");
    expect(f.dotsPerModule).toBeGreaterThanOrEqual(1);
    expect(f.sizeMm).toBeLessThanOrEqual(13.5);
    expect(qrFit(2, "x").dotsPerModule).toBe(0);
  });
  it("docFontSpec lists each font + weight used and the script fonts for Kannada text", () => {
    const doc = starterLabel(50, 75);
    expect(docFontSpec(doc, sampleData("label"))).toBe("sans:400,sans:700");
    const kn = { ...sampleData("label"), mark: "ನೀಲಿ ಮುಚ್ಚಳ" };
    expect(docFontSpec(doc, kn)).toContain("kannada:");
    const slip = starterSlip(80);
    expect(docFontSpec(slip, sampleData("slip"))).toBe("sans:400,sans:700");
  });
});

describe("weight and date", () => {
  const find = (els: LabelEl[], t: string) => els.findIndex((e) => e.type === "text" && e.text === t);
  it("the standard label puts the weight band above a separate date line", () => {
    for (const [w, h] of [[50, 30], [50, 75], [100, 150]]) {
      const els = starterLabel(w, h).els.filter((e): e is TextEl => e.type === "text");
      const band = els.find((e) => e.text?.includes("{tare"))!;
      const date = els.find((e) => e.text === "{tareDate}")!;
      expect(band && date).toBeTruthy();
      expect(date.y).toBeGreaterThanOrEqual(band.y + band.h - 0.01);
      expect(band.text).not.toContain("{tareDate}");
    }
  });
  it("newWeightDate gives two separate items, date under weight, inside the label", () => {
    const doc = starterLabel(50, 75);
    const two = newWeightDate({ ...doc, els: [] });
    expect(two).toHaveLength(2);
    expect(find(two, "{tareDate}")).toBe(1);
    expect(new Set([...doc.els, ...two].map((e) => e.id)).size).toBe(doc.els.length + 2);
    expect(two[1].y).toBeGreaterThanOrEqual(two[0].y + two[0].h - 0.01);
    for (const e of two) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.x + e.w).toBeLessThanOrEqual(doc.widthMm + 0.01); expect(e.y + e.h).toBeLessThanOrEqual(doc.heightMm + 0.01); }
  });
  it("newDateCorner sits top right inside the label", () => {
    const doc = starterLabel(50, 30);
    const d = newDateCorner(doc);
    expect(d.x + d.w).toBeLessThanOrEqual(doc.widthMm);
    expect(d.y).toBeLessThan(2);
  });
});

describe("starting points, rotation, frame", () => {
  const SIZES: [number, number][] = [[50, 30], [50, 75], [100, 50], [100, 150]];
  it("blank starts empty; every other start passes the checks at every size", () => {
    for (const [w, h] of SIZES) {
      expect(startLabel("blank", w, h).els).toEqual([]);
      for (const st of LABEL_STARTS.filter((x) => x.id !== "blank")) {
        const doc = startLabel(st.id, w, h);
        expect(doc.els.length).toBeGreaterThanOrEqual(3);
        expect(checkDoc(doc, sampleData("label")), `${st.id} ${w}x${h}`).toEqual([]);
        for (const e of doc.els) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.y).toBeGreaterThanOrEqual(0); expect(e.x + e.w).toBeLessThanOrEqual(doc.widthMm + 0.01); expect(e.y + e.h).toBeLessThanOrEqual(doc.heightMm + 0.01); }
        expect(sanitizeDoc(doc, "label").ok).toBe(true);
      }
    }
  });
  it("big weight puts the weight above its date; big code uses the code", () => {
    const wd = startLabel("weight", 50, 75).els.filter((e): e is TextEl => e.type === "text");
    const wt = wd.find((e) => e.text.includes("{tare"))!;
    const dt = wd.find((e) => e.text === "{tareDate}")!;
    expect(dt.y).toBeGreaterThanOrEqual(wt.y + wt.h - 0.01);
    expect(startLabel("bigcode", 50, 75).els.some((e) => e.type === "text" && e.text === "{code}" && e.size >= 20)).toBe(true);
  });
  it("rotation, frame and underline survive sanitizing; bad values are dropped", () => {
    const doc = blankLabel(50, 30);
    const t = newLabelEl("text", doc) as TextEl;
    const raw = { ...doc, els: [{ ...t, rot: 90, border: 0.4, underline: true }, { ...newLabelEl("qr", doc), rot: 45 }, { ...newLabelEl("barcode", doc), rot: 270 }] };
    const r = sanitizeDoc(raw, "label");
    expect(r.ok).toBe(true);
    if (!r.ok || r.doc.kind !== "label") return;
    const [a, b, c] = r.doc.els as [TextEl, LabelEl, LabelEl];
    expect(a.rot).toBe(90); expect(a.border).toBe(0.4); expect(a.underline).toBe(true);
    expect(b.rot).toBeUndefined();
    expect(c.rot).toBe(270);
    const plain = sanitizeDoc({ ...doc, els: [{ ...t, border: 0, underline: false, rot: 0 }] }, "label");
    expect(plain.ok && JSON.stringify(plain.doc)).not.toMatch(/border|underline|rot/);
  });
  it("matchSize copies the first chosen item's size and stays inside the label", () => {
    const doc = blankLabel(50, 30);
    const a = { ...newLabelEl("text", doc), id: "a", x: 1, y: 1, w: 20, h: 6 };
    const b = { ...newLabelEl("text", doc), id: "b", x: 40, y: 20, w: 5, h: 3 };
    const out = matchSize([a, b], ["a", "b"], "both", 50, 30);
    const nb = out.find((e) => e.id === "b")!;
    expect(nb.w).toBe(10); // 50 - 40: cannot leave the label
    expect(nb.h).toBe(6);
    expect(matchSize([a, b], ["a", "b"], "w", 50, 30).find((e) => e.id === "b")!.h).toBe(3);
    expect(matchSize([a, b], ["b"], "both", 50, 30)).toEqual([a, b]);
  });
});
