import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO, DEFAULT_SLIP_PARTS, LABEL_PRESETS, SLIP_PRESETS, autoLabels, autoSlip, highlightOf, highlightPatch, newFieldItem, newWeightField, type AutoOpts } from "../labelDesigns";
import { blankLabel, fieldKey, sanitizeDoc, unknownTokens, withFields, type LabelDoc, type TextEl } from "../labelTemplate";

const SIZES: [number, number][] = [[50, 30], [50, 75], [100, 50], [75, 50], [101.6, 152.4], [40, 30], [50, 25]];
const inside = (d: LabelDoc) => d.els.every((e) => e.x >= -0.05 && e.y >= -0.05 && e.x + e.w <= d.widthMm + 0.05 && e.y + e.h <= d.heightMm + 0.05 && e.w > 0 && e.h > 0);

describe("ready-made label designs", () => {
  for (const p of LABEL_PRESETS)
    for (const [w, h] of SIZES)
      it(`${p.name} at ${w} × ${h} fits and saves`, () => {
        const d = p.make(w, h);
        expect(inside(d)).toBe(true);
        const s = sanitizeDoc(JSON.parse(JSON.stringify(d)), "label");
        expect(s.ok).toBe(true);
        for (const e of d.els) if (e.type === "text") expect(unknownTokens(e.text, "label")).toEqual([]);
      });
});

describe("auto design", () => {
  it("gives every arrangement, and the weight boxes only with weights", () => {
    expect(autoLabels(50, 75, DEFAULT_AUTO).map((v) => v.id)).toEqual(["stack", "side", "band", "card"]);
    expect(autoLabels(50, 75, { parts: ["code", "barcode", "qr"], focus: "code", highlight: "bold" }).map((v) => v.id)).toEqual(["stack", "side", "band"]);
  });
  it("puts the chosen things on the label, inside it, at many sizes", () => {
    const o: AutoOpts = { parts: ["company", "code", "mark", "tare", "gross", "net", "date", "barcode", "qr"], focus: "net", highlight: "band" };
    for (const [w, h] of SIZES)
      for (const v of autoLabels(w, h, o)) {
        expect(inside(v.doc)).toBe(true);
        const all = v.doc.els.map((e) => (e.type === "text" ? e.text : "")).join(" ");
        expect(all).toContain("{net");
        expect(v.doc.els.some((e) => e.type === "barcode")).toBe(true);
        expect(v.doc.els.some((e) => e.type === "qr")).toBe(true);
      }
  });
  it("leaves out what was not chosen", () => {
    const [v] = autoLabels(50, 75, { parts: ["code"], focus: "code", highlight: "plain" });
    expect(v.doc.els.every((e) => e.type === "text")).toBe(true);
  });
  it("the focus in a band is white on black", () => {
    const band = autoLabels(50, 75, DEFAULT_AUTO).find((v) => v.id === "band")!;
    const t = band.doc.els.find((e) => e.type === "text" && e.text.includes("{tare")) as TextEl;
    expect(t.invert).toBe(true);
  });
});

describe("receipts", () => {
  it("every ready receipt saves at 80 / 58 / 50 mm", () => {
    for (const p of SLIP_PRESETS) for (const w of [80, 58, 50]) expect(sanitizeDoc(JSON.parse(JSON.stringify(p.make(w, 0))), "slip").ok).toBe(true);
  });
  it("auto receipt follows the chosen parts", () => {
    const d = autoSlip(80, DEFAULT_SLIP_PARTS, "band");
    expect(d.blocks.some((b) => b.type === "cols")).toBe(true);
    expect(d.blocks.some((b) => b.type === "sign")).toBe(false);
    expect(autoSlip(58, ["bignet", "sign"], "band").blocks.some((b) => b.type === "text" && b.invert)).toBe(true);
  });
});

describe("weight fields and own fields", () => {
  it("adds a weight with its date under it, in the chosen highlight", () => {
    const d = blankLabel(50, 75);
    const [wt, dt] = newWeightField(d, "gross", "box") as TextEl[];
    expect(wt.text).toContain("{gross");
    expect(wt.border).toBe(0.5);
    expect(dt.text).toBe("{grossDate}");
    expect(dt.y).toBeGreaterThan(wt.y);
    expect(newWeightField(d, "capacity", "band")).toHaveLength(1);
  });
  it("switches highlight and reads it back", () => {
    const el = { size: 8, h: 6, invert: false, bold: false } as TextEl;
    for (const h of ["band", "box", "big", "bold", "plain"] as const) expect(highlightOf({ ...el, ...highlightPatch(h, el) } as TextEl)).toBe(h);
  });
  it("makes field keys that do not clash", () => {
    expect(fieldKey("Oil type", "label")).toBe("oilType");
    expect(fieldKey("Code", "label")).toBe("myCode");
    expect(fieldKey("Batch", "label", ["batch"])).toBe("batch2");
    expect(fieldKey("ಬ್ಯಾಚ್", "label")).toBe("field");
  });
  it("keeps own fields through saving and fills them", () => {
    const d: LabelDoc = { ...blankLabel(50, 30), fields: [{ key: "batch", label: "Batch", value: "B-12" }, { key: "code", label: "x", value: "no" }] };
    const s = sanitizeDoc(d, "label");
    expect(s.ok && s.doc.fields).toEqual([{ key: "batch", label: "Batch", value: "B-12" }]);
    expect(withFields(d, { batch: "", code: "BRL-01" }).batch).toBe("B-12");
    expect(withFields(d, { batch: "B-99" }).batch).toBe("B-99");
    const item = newFieldItem(d, "batch", "Batch") as TextEl;
    expect(item.text).toBe("Batch: {batch}");
    expect(unknownTokens(item.text, "label", ["batch"])).toEqual([]);
  });
});
