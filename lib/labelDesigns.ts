// Ready-made label and receipt designs, the "auto design" maker, and the weight fields of the designer.
// Everything here is pure: (size, choices) in, a layout (LabelDoc / SlipDoc) out, so it is tested in
// lib/__tests__/labelDesigns.test.ts and the designer just shows what these return.
import {
  blankLabel, blankSlip, clamp, fitLabelToCanvas, nextId, r1, startLabel, starterLabel, starterSlip,
  type LabelDoc, type LabelEl, type SlipBlock, type SlipDoc, type TextEl,
} from "@/lib/labelTemplate";

// ---------------------------------------------------------------------------
// Weight fields: each weight as its own item, with its own date, in a chosen highlight
// ---------------------------------------------------------------------------
export type WeightKey = "tare" | "gross" | "net" | "capacity";
export const WEIGHTS: { key: WeightKey; name: string; text: string; date: string | null; note: string }[] = [
  { key: "tare", name: "Tare (empty)", text: "TARE (EMPTY) {tare|________} kg", date: "{tareDate}", note: "The barrel's own weight, empty" },
  { key: "gross", name: "Gross (full)", text: "GROSS {gross|________} kg", date: "{grossDate}", note: "Full barrel, last weighing" },
  { key: "net", name: "Net oil", text: "NET OIL {net|________} kg", date: "{grossDate}", note: "Gross − tare" },
  { key: "capacity", name: "Capacity", text: "MAX {capacity} kg oil", date: null, note: "Most oil the barrel takes" },
];

export type Highlight = "plain" | "bold" | "big" | "box" | "band";
export const HIGHLIGHTS: { id: Highlight; name: string; note: string }[] = [
  { id: "band", name: "Black band", note: "White letters on black, seen from far" },
  { id: "box", name: "Box", note: "A frame round it" },
  { id: "big", name: "Big & bold", note: "Large bold letters" },
  { id: "bold", name: "Bold", note: "Bold letters" },
  { id: "plain", name: "Plain", note: "Ordinary letters" },
];

/** The style changes a highlight makes to a text item. */
export function highlightPatch(h: Highlight, el: Pick<TextEl, "size" | "h">): Partial<TextEl> {
  const big = r1(Math.max(el.size, Math.min(60, el.h * 2.3)));
  switch (h) {
    case "band": return { invert: true, bold: true, border: undefined, fit: true };
    case "box": return { invert: false, bold: true, border: 0.5, fit: true };
    case "big": return { invert: false, bold: true, border: undefined, size: big, fit: true };
    case "bold": return { invert: false, bold: true, border: undefined };
    case "plain": return { invert: false, bold: false, border: undefined };
  }
}
/** Which highlight a text item looks like now (for the buttons in the designer). */
export function highlightOf(el: TextEl): Highlight {
  if (el.invert) return "band";
  if ((el.border ?? 0) > 0) return "box";
  if (el.bold) return el.size >= el.h * 2 ? "big" : "bold";
  return "plain";
}

/** One weight as an item (and its date just under it, as a second item), placed in the first free strip. */
export function newWeightField(doc: LabelDoc, key: WeightKey, h: Highlight, withDate = true, rnd?: () => number): LabelEl[] {
  const W = doc.widthMm;
  const H = doc.heightMm;
  const f = WEIGHTS.find((x) => x.key === key) ?? WEIGHTS[0];
  const taken = doc.els.map((e) => e.id);
  const bw = r1(Math.max(8, W - 2));
  const bh = r1(Math.max(3.5, Math.min(H * 0.16, 9)));
  const dh = withDate && f.date ? r1(Math.max(2.4, Math.min(H * 0.07, 3.6))) : 0;
  // below the lowest item that is already there, else from the top
  const bottom = doc.els.reduce((m, e) => Math.max(m, e.y + e.h), 0);
  const y = r1(bottom + bh + dh + 0.5 <= H ? bottom + 0.5 : Math.max(0, (H - bh - dh) / 2));
  const idA = nextId(taken, rnd);
  const base: TextEl = { id: idA, type: "text", x: 1, y, w: bw, h: bh, text: f.text, font: "sans", size: r1(Math.min(14, bh * 1.7)), bold: false, italic: false, align: "center", valign: "middle", invert: false, fit: true };
  const out: LabelEl[] = [{ ...base, ...highlightPatch(h, base) } as TextEl];
  if (dh) {
    const idB = nextId([...taken, idA], rnd);
    out.push({ id: idB, type: "text", x: 1, y: r1(y + bh + 0.2), w: bw, h: dh, text: f.date!, font: "sans", size: r1(Math.min(8, dh * 2)), bold: false, italic: false, align: "right", valign: "middle", invert: false, fit: true });
  }
  return out;
}

/** A text item for one of the person's own fields: "Batch: {batch}". */
export function newFieldItem(doc: LabelDoc, key: string, label: string, rnd?: () => number): LabelEl {
  const W = doc.widthMm;
  const H = doc.heightMm;
  const bh = r1(Math.max(3, Math.min(H * 0.1, 6)));
  const bottom = doc.els.reduce((m, e) => Math.max(m, e.y + e.h), 0);
  const y = r1(bottom + bh + 0.5 <= H ? bottom + 0.5 : Math.max(0, (H - bh) / 2));
  return { id: nextId(doc.els.map((e) => e.id), rnd), type: "text", x: 1, y, w: r1(W - 2), h: bh, text: `${label}: {${key}}`, font: "sans", size: r1(Math.min(10, bh * 1.8)), bold: false, italic: false, align: "left", valign: "middle", invert: false, fit: true };
}

// ---------------------------------------------------------------------------
// Auto design: pick what to show, get finished labels in a few arrangements
// ---------------------------------------------------------------------------
export type Part = "company" | "code" | "mark" | "tare" | "gross" | "net" | "capacity" | "date" | "product" | "barcode" | "qr";
export const PARTS: { id: Part; name: string }[] = [
  { id: "company", name: "Company name" },
  { id: "code", name: "Barrel code" },
  { id: "mark", name: "Mark (Blue lid…)" },
  { id: "tare", name: "Tare (empty)" },
  { id: "gross", name: "Gross (full)" },
  { id: "net", name: "Net oil" },
  { id: "capacity", name: "Capacity" },
  { id: "product", name: "Oil" },
  { id: "date", name: "Date of the weighing" },
  { id: "barcode", name: "Barcode" },
  { id: "qr", name: "QR code" },
];
export type Focus = "code" | "tare" | "gross" | "net";
export interface AutoOpts {
  parts: Part[];
  /** the one thing printed biggest */
  focus: Focus;
  highlight: Highlight;
}
export type Variant = "stack" | "side" | "band" | "card";
export const VARIANTS: { id: Variant; name: string; note: string }[] = [
  { id: "stack", name: "Stacked", note: "Everything centred, one under the other" },
  { id: "side", name: "QR beside", note: "Text on the left, QR code on the right" },
  { id: "band", name: "Top band", note: "The main thing in a band across the top" },
  { id: "card", name: "Weight boxes", note: "Weights side by side in boxes" },
];
export const DEFAULT_AUTO: AutoOpts = { parts: ["company", "code", "mark", "tare", "date", "barcode", "qr"], focus: "tare", highlight: "band" };

const PT_PER_MM = 2.1; // a text box h mm tall takes letters of about h × 2.1 pt
const WTEXT: Record<"tare" | "gross" | "net", string> = { tare: "TARE {tare|______} kg", gross: "GROSS {gross|______} kg", net: "NET {net|______} kg" };
const WSHORT: Record<"tare" | "gross" | "net", { label: string; value: string }> = {
  tare: { label: "TARE", value: "{tare|____}" },
  gross: { label: "GROSS", value: "{gross|____}" },
  net: { label: "NET OIL", value: "{net|____}" },
};
const dateFor = (k: Focus) => (k === "tare" ? "{tareDate}" : k === "code" ? "{today}" : "{grossDate}");

interface Row {
  weight: number;
  put: (x: number, y: number, w: number, h: number) => void;
}

class Builder {
  els: LabelEl[] = [];
  constructor(readonly W: number, readonly H: number) {}
  text(x: number, y: number, w: number, h: number, t: string, o: Partial<TextEl> = {}) {
    if (w < 1 || h < 1) return;
    this.els.push({ id: String(this.els.length + 1), type: "text", x: r1(x), y: r1(y), w: r1(w), h: r1(h), text: t, font: "sans", size: r1(clamp(h * PT_PER_MM, 4, 60)), bold: false, italic: false, align: "center", valign: "middle", invert: false, fit: true, ...o });
  }
  barcode(x: number, y: number, w: number, h: number, human = false) {
    if (w < 8 || h < 3) return;
    this.els.push({ id: String(this.els.length + 1), type: "barcode", x: r1(x), y: r1(y), w: r1(w), h: r1(h), value: "{code}", human });
  }
  qr(x: number, y: number, s: number) {
    if (s < 6) return;
    this.els.push({ id: String(this.els.length + 1), type: "qr", x: r1(x), y: r1(y), w: r1(s), h: r1(s), value: "{link}" });
  }
  rect(x: number, y: number, w: number, h: number, stroke = 0.4) {
    this.els.push({ id: String(this.els.length + 1), type: "rect", x: r1(x), y: r1(y), w: r1(w), h: r1(h), fill: false, stroke, radius: 0.8 });
  }
  /** share the height among rows by weight, with a small gap */
  stack(x: number, y: number, w: number, h: number, rows: Row[], gap = 0.5) {
    const live = rows.filter(Boolean);
    if (!live.length) return;
    const total = live.reduce((a, r) => a + r.weight, 0);
    const room = h - gap * (live.length - 1);
    let yy = y;
    for (const r of live) {
      const rh = (room * r.weight) / total;
      r.put(x, yy, w, rh);
      yy += rh + gap;
    }
  }
  doc(): LabelDoc {
    return fitLabelToCanvas({ v: 1, kind: "label", widthMm: this.W, heightMm: this.H, els: this.els });
  }
}

/** A finished label of this size from the chosen parts, in one arrangement. */
export function autoLabel(w: number, h: number, o: AutoOpts, variant: Variant): LabelDoc {
  const base = blankLabel(w, h);
  const W = base.widthMm;
  const H = base.heightMm;
  const b = new Builder(W, H);
  const has = (p: Part) => o.parts.includes(p);
  const m = r1(clamp(Math.min(W, H) * 0.04, 1, 3));
  const iw = W - 2 * m;
  const ih = H - 2 * m;
  const short = H < W * 0.75; // a wide, low sticker
  const weights = (["tare", "gross", "net"] as const).filter((k) => has(k));
  const focus: Focus = o.focus === "code" || has(o.focus) ? o.focus : weights[0] ?? "code";
  const hl = highlightPatch(o.highlight, { size: 10, h: 10 });
  const focusText = focus === "code" ? "{code}" : WTEXT[focus];
  const focusStyle: Partial<TextEl> = focus === "code" ? { bold: true } : { ...hl, size: undefined };
  const clean = (p: Partial<TextEl>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Partial<TextEl>;

  // the small lines
  const small: { t: string; weight: number; o?: Partial<TextEl> }[] = [];
  if (focus !== "code" && has("code")) small.push({ t: "{code}", weight: 1.6, o: { bold: true } });
  if (has("mark")) small.push({ t: "{mark}", weight: 1 });
  if (has("product")) small.push({ t: "{product}", weight: 1 });
  for (const k of weights) if (k !== focus && variant !== "card") small.push({ t: WTEXT[k], weight: 1, o: { bold: true } });
  if (has("capacity")) small.push({ t: "Max {capacity} kg oil", weight: 0.85 });
  const dateRow = has("date") ? { t: dateFor(focus), weight: 0.7, o: { align: "right" as const } } : null;

  const company = has("company") ? { weight: 0.9, put: (x: number, y: number, ww: number, hh: number) => b.text(x, y, ww, hh, "{company}", { bold: true }) } : null;
  const focusRow = (weight: number) => ({ weight, put: (x: number, y: number, ww: number, hh: number) => b.text(x, y, ww, hh, focusText, clean(focusStyle)) });
  const smallRows = (list: typeof small) => list.map((l) => ({ weight: l.weight, put: (x: number, y: number, ww: number, hh: number) => b.text(x, y, ww, hh, l.t, l.o) }));
  const barcodeRow = (weight: number) => (has("barcode") ? { weight, put: (x: number, y: number, ww: number, hh: number) => b.barcode(x, y, ww, hh, !has("code") || focus !== "code") } : null);
  const cardRow = (weight: number) =>
    weights.length && variant === "card"
      ? {
          weight,
          put: (x: number, y: number, ww: number, hh: number) => {
            const n = weights.length;
            const cw = (ww - (n - 1) * 1) / n;
            if (cw < 17) {
              // narrow label: one weight per row, name left, value right
              const rh = (hh - (n - 1) * 0.6) / n;
              weights.forEach((k, i) => {
                const ry = y + i * (rh + 0.6);
                const strong = k === focus;
                b.text(x + 0.6, ry, ww * 0.42, rh, WSHORT[k].label, { bold: true, align: "left", ...(strong && o.highlight === "band" ? { invert: true } : {}) });
                b.text(x + ww * 0.42 + 0.6, ry, ww * 0.58 - 1.2, rh, `${WSHORT[k].value} kg`, { bold: true, align: "right" });
                b.rect(x, ry, ww, rh, strong ? 0.6 : 0.3);
              });
              return;
            }
            weights.forEach((k, i) => {
              const cx = x + i * (cw + 1);
              const strong = k === focus;
              if (strong && o.highlight === "band") b.text(cx, y, cw, hh * 0.38, WSHORT[k].label, { bold: true, invert: true });
              else b.text(cx, y, cw, hh * 0.38, WSHORT[k].label, { bold: true });
              b.text(cx, y + hh * 0.38, cw, hh * 0.62, `${WSHORT[k].value} kg`, { bold: true });
              b.rect(cx, y, cw, hh, strong ? 0.6 : 0.3);
            });
          },
        }
      : null;

  const rowsWithQrInline = (qrBox: boolean): Row[] => {
    const rows: (Row | null)[] = [company];
    if (variant === "card") {
      rows.push(cardRow(3.2));
      if (focus === "code") rows.push(focusRow(2.4));
    } else rows.push(focusRow(variant === "band" ? 2.6 : 3));
    if (dateRow) rows.push({ weight: dateRow.weight, put: (x, y, ww, hh) => b.text(x, y, ww, hh, dateRow.t, dateRow.o) });
    rows.push(...smallRows(small));
    rows.push(barcodeRow(short ? 2.6 : 2.4));
    if (qrBox && has("qr")) {
      rows.push({ weight: 4.5, put: (x, y, ww, hh) => { const s = Math.min(ww, hh); b.qr(x + (ww - s) / 2, y + (hh - s) / 2, s); } });
    }
    return rows.filter((r): r is Row => !!r);
  };

  if (variant === "stack" && !(short && has("qr"))) {
    b.stack(m, m, iw, ih, rowsWithQrInline(true));
    return b.doc();
  }
  if (variant === "band") {
    // band across the top (always black: that is the point of this arrangement), the rest under it
    const bandH = r1(clamp(ih * 0.2, 4, 18));
    b.text(0, 0, W, bandH + m, focusText, { bold: true, invert: true });
    let y = bandH + m + 0.6;
    if (dateRow) {
      const dh = r1(clamp(ih * 0.07, 2.4, 5));
      b.text(m, y, iw, dh, dateRow.t, { align: "right" });
      y += dh + 0.4;
    }
    const rest = H - m - y;
    const q = has("qr") ? r1(clamp(Math.min(rest * (has("barcode") ? 0.62 : 1), iw * 0.42), 0, 45)) : 0;
    const bar = has("barcode") ? r1(clamp(rest * 0.3, 4, 30)) : 0;
    const textW = q ? iw - q - 1 : iw;
    const top: Row[] = [company, ...smallRows(small)].filter((r): r is Row => !!r);
    b.stack(m, y, textW, rest - bar - (bar ? 1 : 0), top.length ? top : [{ weight: 1, put: () => {} }]);
    if (q) b.qr(W - m - q, y, q);
    if (bar) b.barcode(m, H - m - bar, iw, bar, true);
    return b.doc();
  }
  // side (and a short sticker with a QR): QR at one side, text column beside it, barcode across the bottom.
  // "Stacked" on a short sticker puts the QR on the left and keeps the text centred.
  const qrLeft = variant === "stack";
  const bar = has("barcode") ? r1(clamp(ih * (short ? 0.3 : 0.2), 4, 30)) : 0;
  const top = ih - bar - (bar ? 1 : 0);
  const q = has("qr") ? r1(clamp(Math.min(top, iw * 0.45), 0, 50)) : 0;
  const colW = q ? iw - q - 1 : iw;
  const colRows: Row[] = [];
  if (company) colRows.push(company);
  if (variant === "card" && weights.length) colRows.push(cardRow(3)!);
  else colRows.push(focusRow(3));
  if (dateRow) colRows.push({ weight: dateRow.weight, put: (x, y, ww, hh) => b.text(x, y, ww, hh, dateRow.t, dateRow.o) });
  colRows.push(...smallRows(small));
  b.stack(qrLeft && q ? m + q + 1 : m, m, colW, top, colRows);
  if (q && !qrLeft) {
    // left-align the column next to a QR on the right
    for (const e of b.els) if (e.type === "text" && e.x < m + colW && e.align === "center" && e.w <= colW + 0.1) (e as TextEl).align = "left";
  }
  if (q) b.qr(qrLeft ? m : W - m - q, m + (top - q) / 2, q);
  if (bar) b.barcode(m, H - m - bar, iw, bar, true);
  return b.doc();
}

/** Every arrangement of the chosen parts at this size (the "Weight boxes" one only when weights are chosen). */
export function autoLabels(w: number, h: number, o: AutoOpts): { id: Variant; name: string; note: string; doc: LabelDoc }[] {
  const hasW = o.parts.some((p) => p === "tare" || p === "gross" || p === "net");
  return VARIANTS.filter((v) => v.id !== "card" || hasW).map((v) => ({ ...v, doc: autoLabel(w, h, o, v.id) }));
}

// ---------------------------------------------------------------------------
// Ready-made designs
// ---------------------------------------------------------------------------
export interface Preset<T> {
  id: string;
  name: string;
  note: string;
  make: (w: number, h: number) => T;
}

export const LABEL_PRESETS: Preset<LabelDoc>[] = [
  { id: "blank", name: "Blank, from scratch", note: "An empty label: add text, fields, barcode yourself", make: (w, h) => blankLabel(w, h) },
  { id: "standard", name: "Standard barrel label", note: "Company, tare band, date, barcode, code, QR", make: (w, h) => starterLabel(w, h) },
  { id: "tareband", name: "Tare in a black band", note: "Empty weight across the top, code and QR under it", make: (w, h) => autoLabel(w, h, { parts: ["company", "code", "mark", "tare", "date", "barcode", "qr"], focus: "tare", highlight: "band" }, "band") },
  { id: "bigtare", name: "Big tare weight", note: "The empty weight in large letters, with its date", make: (w, h) => startLabel("weight", w, h) },
  { id: "full", name: "Full barrel: gross · tare · net", note: "Three weights in boxes, net oil highlighted", make: (w, h) => autoLabel(w, h, { parts: ["company", "code", "tare", "gross", "net", "date", "barcode", "qr"], focus: "net", highlight: "band" }, "card") },
  { id: "netband", name: "Net oil highlight", note: "Net oil in a band, gross and tare under it", make: (w, h) => autoLabel(w, h, { parts: ["code", "product", "tare", "gross", "net", "date", "barcode", "qr"], focus: "net", highlight: "band" }, "band") },
  { id: "bigcode", name: "Big barrel code", note: "The code in large letters, easy to read from far", make: (w, h) => startLabel("bigcode", w, h) },
  { id: "qrside", name: "Code + QR beside", note: "Code, mark and capacity on the left, QR on the right", make: (w, h) => autoLabel(w, h, { parts: ["code", "mark", "capacity", "qr", "barcode"], focus: "code", highlight: "bold" }, "side") },
  { id: "boxed", name: "Boxed tare", note: "Tare in a frame, clean and simple", make: (w, h) => autoLabel(w, h, { parts: ["company", "code", "mark", "tare", "date", "barcode"], focus: "tare", highlight: "box" }, "stack") },
  { id: "strip", name: "Barcode strip", note: "Just the code and its barcode, for small stickers", make: (w, h) => autoLabel(w, h, { parts: ["code", "barcode"], focus: "code", highlight: "bold" }, "stack") },
];

type NewBlock = SlipBlock extends infer B ? (B extends unknown ? Omit<B, "id"> : never) : never;
const T = (text: string, size: number, o: Partial<Extract<SlipBlock, { type: "text" }>> = {}): Omit<Extract<SlipBlock, { type: "text" }>, "id"> => ({ type: "text", text, font: "sans", size, bold: false, italic: false, align: "center", invert: false, hideEmpty: true, ...o });
const KV = (label: string, value: string, size: number, bold = false): Omit<Extract<SlipBlock, { type: "kv" }>, "id"> => ({ type: "kv", label, value, font: "sans", size, bold, hideEmpty: true });
function slipFrom(w: number, parts: NewBlock[]): SlipDoc {
  const doc = blankSlip(w);
  doc.blocks = parts.map((p, i) => ({ ...p, id: String(i + 1) }) as SlipBlock);
  return doc;
}

export const SLIP_PRESETS: Preset<SlipDoc>[] = [
  { id: "blank", name: "Blank, from scratch", note: "An empty receipt: add blocks yourself", make: (w) => blankSlip(w) },
  { id: "standard", name: "Standard weighment slip", note: "Everything: barcode, QR, details, gross/tare/net, signatures", make: (w) => starterSlip(w) },
  {
    id: "compact",
    name: "Compact weight receipt",
    note: "Short: code, date, the three weights, net in a band",
    make: (w) => {
      const n = w <= 60;
      return slipFrom(w, [
        T("{company}", n ? 10 : 12, { bold: true, hideEmpty: false }),
        T("{title}", n ? 7.5 : 8.5),
        { type: "divider", style: "dashed" },
        KV("Barrel", "{code} {mark}", n ? 8 : 9, true),
        KV("Date", "{date}", n ? 7.5 : 8.5),
        KV("Party", "{party}", n ? 7.5 : 8.5),
        { type: "cols", cells: [{ label: "Gross", value: "{gross}" }, { label: "Tare", value: "{tare}" }], font: "sans", size: n ? 10 : 12, hideEmpty: true },
        T("NET {net} kg", n ? 13 : 16, { bold: true, invert: true }),
        T("Printed {printedAt}", 6.5, { align: "right", hideEmpty: false }),
      ]);
    },
  },
  {
    id: "bignet",
    name: "Big net weight",
    note: "The net oil huge in the middle, for the driver",
    make: (w) => {
      const n = w <= 60;
      return slipFrom(w, [
        T("{company}", n ? 10 : 12, { bold: true, hideEmpty: false }),
        T("{code} · {product}", n ? 9 : 11, { bold: true }),
        { type: "divider", style: "thick" },
        T("NET OIL", n ? 8 : 9, { hideEmpty: false }),
        T("{net|—} kg", n ? 24 : 32, { bold: true, hideEmpty: false }),
        T("{equation}", n ? 7.5 : 8.5),
        { type: "divider", style: "solid" },
        KV("Date", "{date}", n ? 7.5 : 8.5),
        KV("Vehicle", "{vehicle}", n ? 7.5 : 8.5),
        { type: "qr", value: "{link}", sizeMm: n ? 16 : 20, align: "center" },
      ]);
    },
  },
  {
    id: "gatepass",
    name: "Gate pass / delivery",
    note: "From → to, party, vehicle, weights and two signatures",
    make: (w) => {
      const n = w <= 60;
      const s = n ? 8 : 9;
      return slipFrom(w, [
        T("{company}", s + 3, { bold: true, hideEmpty: false }),
        T("GATE PASS", s + 1, { bold: true, invert: true, hideEmpty: false }),
        KV("Barrel", "{code}", s, true),
        KV("From → To", "{route}", s),
        KV("Party", "{party}", s),
        KV("Vehicle", "{vehicle}", s, true),
        KV("Purpose", "{purpose}", s),
        KV("Bill / ref", "{ref}", s),
        { type: "divider", style: "solid" },
        { type: "cols", cells: [{ label: "Gross", value: "{gross} kg" }, { label: "Tare", value: "{tare} kg" }, { label: "Net", value: "{net} kg" }], font: "sans", size: n ? 9 : 11, hideEmpty: true },
        { type: "barcode", value: "{code}", heightMm: n ? 9 : 11, widthPct: 90, align: "center", human: true },
        { type: "sign", labels: ["Given by", "Received by"], size: 7.5, gapMm: 9 },
        T("{date}", 7, { align: "right" }),
      ]);
    },
  },
  {
    id: "barcode",
    name: "Barcode + QR ticket",
    note: "Barrel code, barcode and QR only",
    make: (w) => {
      const n = w <= 60;
      return slipFrom(w, [
        T("{company}", n ? 9 : 11, { bold: true, hideEmpty: false }),
        T("{code}", n ? 18 : 24, { bold: true, hideEmpty: false }),
        { type: "barcode", value: "{code}", heightMm: n ? 12 : 16, widthPct: 100, align: "center", human: false },
        { type: "qr", value: "{link}", sizeMm: n ? 20 : 26, align: "center" },
        T("{mark}", n ? 8 : 9),
      ]);
    },
  },
];

/** Auto design for a receipt: the chosen parts in a sensible order. */
export type SlipPart = "company" | "title" | "barcode" | "qr" | "details" | "weights" | "bignet" | "sign" | "printed";
export const SLIP_PARTS: { id: SlipPart; name: string }[] = [
  { id: "company", name: "Company name" },
  { id: "title", name: "What the slip is" },
  { id: "barcode", name: "Barcode" },
  { id: "qr", name: "QR code" },
  { id: "details", name: "Date, party, vehicle…" },
  { id: "weights", name: "Gross · tare · net" },
  { id: "bignet", name: "Net oil, big" },
  { id: "sign", name: "Signature lines" },
  { id: "printed", name: "Printed on" },
];
export function autoSlip(w: number, parts: SlipPart[], highlight: Highlight): SlipDoc {
  const has = (p: SlipPart) => parts.includes(p);
  const n = w <= 60;
  const s = n ? 8 : 9;
  const out: NewBlock[] = [];
  if (has("company")) out.push(T("{company}", s + 3, { bold: true, hideEmpty: false }));
  if (has("title")) out.push(T("{title}", s));
  if (out.length) out.push({ type: "divider", style: "thick" });
  if (has("barcode")) out.push({ type: "barcode", value: "{code}", heightMm: n ? 10 : 13, widthPct: 100, align: "center", human: !has("qr") });
  if (has("qr")) out.push({ type: "qr", value: "{link}", sizeMm: n ? 18 : 22, align: "center" });
  out.push(T("{code}", s + 5, { bold: true, hideEmpty: false }));
  if (has("details")) {
    out.push(KV("Date / time", "{date}", s), KV("Barrel mark", "{mark}", s), KV("Oil", "{product}", s), KV("Party", "{party}", s), KV("Vehicle", "{vehicle}", s), KV("Bill / ref", "{ref}", s));
  }
  if (has("weights")) {
    out.push({ type: "divider", style: "solid" });
    out.push({ type: "cols", cells: [{ label: "Gross", value: "{gross} kg" }, { label: "Tare", value: "{tare} kg" }, { label: "NET OIL", value: "{net} kg" }], font: "sans", size: n ? 10 : 12, hideEmpty: true });
  }
  if (has("bignet")) out.push(T("NET {net|—} kg", n ? 16 : 22, { bold: true, invert: highlight === "band", hideEmpty: false }));
  if (has("sign")) out.push({ type: "sign", labels: ["Weighed by", "Checked by"], size: 7.5, gapMm: 9 });
  if (has("printed")) out.push(T("Printed {printedAt}", 7, { align: "right", hideEmpty: false }));
  return slipFrom(w, out);
}
export const DEFAULT_SLIP_PARTS: SlipPart[] = ["company", "title", "barcode", "details", "weights", "printed"];
