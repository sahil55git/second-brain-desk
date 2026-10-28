// Label and receipt templates: the data model, the checks, and the small pure helpers the designer uses.
//
// A template is plain JSON, so it can be stored in the database, copied, and drawn the same way on
// screen, in the print window and in the picture sent to the printer.
//   label  = a free canvas in millimetres: text, barcode, QR, logo, box and line elements, each with
//            its own position and size (like a sticker designer).
//   slip   = blocks stacked top to bottom on a fixed paper width (58 / 80 mm ...): the length grows
//            with the content (like a receipt designer).
// Text can hold {tokens} such as {code} or {tare|______}; they are filled from the real barrel / weighing.
import { code128Ok, code128Symbols } from "@/lib/code128";
import { fontNeeds, isFontId, needSpec, type FontId, type FontNeed } from "@/lib/fonts";
import { qrSvg } from "@/lib/qr";

export type TemplateKind = "label" | "slip";
export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export const LIMITS = {
  maxEls: 60,
  maxBlocks: 80,
  maxText: 400,
  /** one picture, as a data: URL */
  maxImageChars: 160_000,
  maxImagesTotal: 400_000,
  maxName: 60,
  labelW: [15, 210] as const,
  labelH: [10, 300] as const,
  slipW: [40, 210] as const,
  slipMargin: [0, 10] as const,
  pt: [3, 120] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Rot = 0 | 90 | 180 | 270;
interface ElBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** turn what is inside the box (text, barcode, QR, picture); the box itself stays upright. Missing = 0. */
  rot?: Rot;
}
export interface TextEl extends ElBase {
  type: "text";
  text: string;
  font: FontId;
  /** points */
  size: number;
  bold: boolean;
  italic: boolean;
  align: Align;
  valign: VAlign;
  /** white letters on a black box */
  invert: boolean;
  /** shrink the letters so the text fits the box on one line */
  fit: boolean;
  /** frame around the text box in mm. Missing or 0 = none */
  border?: number;
  underline?: boolean;
}
export interface BarcodeEl extends ElBase {
  type: "barcode";
  value: string;
  /** print the text under the bars */
  human: boolean;
}
export interface QrEl extends ElBase {
  type: "qr";
  value: string;
}
export interface ImageEl extends ElBase {
  type: "image";
  src: string;
  fit: "contain" | "cover";
}
export interface RectEl extends ElBase {
  type: "rect";
  fill: boolean;
  /** border thickness in mm, 0 = none */
  stroke: number;
  radius: number;
}
export interface LineEl extends ElBase {
  type: "line";
  /** thickness in mm; drawn along the longer side */
  thick: number;
}
export type LabelEl = TextEl | BarcodeEl | QrEl | ImageEl | RectEl | LineEl;
export type LabelElType = LabelEl["type"];
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface LabelDoc {
  v: 1;
  kind: "label";
  widthMm: number;
  heightMm: number;
  els: LabelEl[];
}

interface BlockBase {
  id: string;
}
export interface TextBlock extends BlockBase {
  type: "text";
  text: string;
  font: FontId;
  size: number;
  bold: boolean;
  italic: boolean;
  align: Align;
  invert: boolean;
  /** drop the line when every {token} in it is empty */
  hideEmpty: boolean;
}
export interface KvBlock extends BlockBase {
  type: "kv";
  label: string;
  value: string;
  font: FontId;
  size: number;
  bold: boolean;
  hideEmpty: boolean;
}
export interface ColsBlock extends BlockBase {
  type: "cols";
  cells: { label: string; value: string }[];
  font: FontId;
  size: number;
  /** drop the row when every value is empty */
  hideEmpty: boolean;
}
export interface BarcodeBlock extends BlockBase {
  type: "barcode";
  value: string;
  heightMm: number;
  /** how much of the paper width the bars may use */
  widthPct: number;
  align: Align;
  human: boolean;
}
export interface QrBlock extends BlockBase {
  type: "qr";
  value: string;
  sizeMm: number;
  align: Align;
}
export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  widthMm: number;
  align: Align;
}
export interface DividerBlock extends BlockBase {
  type: "divider";
  style: "solid" | "dashed" | "dotted" | "thick";
}
export interface SpacerBlock extends BlockBase {
  type: "spacer";
  heightMm: number;
}
export interface SignBlock extends BlockBase {
  type: "sign";
  labels: string[];
  size: number;
  gapMm: number;
}
export type SlipBlock = TextBlock | KvBlock | ColsBlock | BarcodeBlock | QrBlock | ImageBlock | DividerBlock | SpacerBlock | SignBlock;
export type SlipBlockType = SlipBlock["type"];

export interface SlipDoc {
  v: 1;
  kind: "slip";
  widthMm: number;
  /** white border around the content (the page margin) */
  marginMm: number;
  blocks: SlipBlock[];
}
export type TemplateDoc = LabelDoc | SlipDoc;

/** A saved template as the API returns it. */
export interface TemplateRow {
  id: string;
  name: string;
  kind: TemplateKind;
  widthMm: number;
  heightMm: number | null;
  doc: TemplateDoc;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
export interface TokenInfo {
  name: string;
  label: string;
  sample: string;
}

export const LABEL_TOKENS: TokenInfo[] = [
  { name: "company", label: "Company name", sample: "MAHADEV TRADERS" },
  { name: "code", label: "Barrel code", sample: "BRL-01" },
  { name: "mark", label: "Barrel mark", sample: "Blue lid" },
  { name: "capacity", label: "Most oil it takes (kg)", sample: "180" },
  { name: "tare", label: "Empty weight / tare (kg)", sample: "18.4" },
  { name: "tareDate", label: "Date the tare was taken", sample: "12 Oct 26" },
  { name: "link", label: "Link that opens the barrel's record", sample: "https://app.example/barrels/fleet?code=BRL-01" },
  { name: "today", label: "Today's date", sample: "28 Oct 26" },
];

export const SLIP_TOKENS: TokenInfo[] = [
  { name: "company", label: "Company name", sample: "MAHADEV TRADERS" },
  { name: "title", label: "What this slip is (Full barrel weight …)", sample: "Full barrel weight" },
  { name: "code", label: "Barrel code", sample: "BRL-01" },
  { name: "link", label: "Link that opens the barrel's record", sample: "https://app.example/barrels/fleet?code=BRL-01" },
  { name: "date", label: "Date and time of the weighing", sample: "28 Oct 2026, 4:10 pm" },
  { name: "mark", label: "Barrel mark", sample: "Blue lid" },
  { name: "product", label: "Oil", sample: "Sunflower" },
  { name: "route", label: "From → To", sample: "Shop → Customer" },
  { name: "party", label: "Party", sample: "Ramesh Oil Mill" },
  { name: "vehicle", label: "Vehicle number", sample: "KA 38 B 1234" },
  { name: "purpose", label: "Purpose", sample: "Sale" },
  { name: "ref", label: "Bill / reference", sample: "INV-221" },
  { name: "gross", label: "Gross weight (kg)", sample: "198.6" },
  { name: "tare", label: "Tare (kg)", sample: "18.4" },
  { name: "net", label: "Net oil (kg)", sample: "180.2" },
  { name: "equation", label: "Gross − Tare = Net", sample: "198.6 − 18.4 = 180.2 kg" },
  { name: "scale", label: "Scale used", sample: "Scale: Platform 1" },
  { name: "by", label: "Weighed by", sample: "Sahil" },
  { name: "note", label: "Note", sample: "Seal intact" },
  { name: "printedAt", label: "Printed on", sample: "28 Oct 2026, 4:12 pm" },
];

export const tokensFor = (kind: TemplateKind) => (kind === "label" ? LABEL_TOKENS : SLIP_TOKENS);
export const sampleData = (kind: TemplateKind): TokenData => Object.fromEntries(tokensFor(kind).map((t) => [t.name, t.sample]));

export type TokenData = Record<string, string>;

const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9]*)(?:\|([^{}]*))?\}/g;

export interface Filled {
  text: string;
  /** known {tokens} in the text */
  tokens: number;
  /** how many of them were empty */
  blank: number;
  /** the text has tokens and every one of them was empty */
  empty: boolean;
}

/** Replaces {token} / {token|fallback}. A name that is not a token is left as typed so the typo is visible. */
export function fillTokens(text: string, data: TokenData): Filled {
  let tokens = 0;
  let blank = 0;
  const out = text.replace(TOKEN_RE, (whole, name: string, fallback?: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, name)) return whole;
    tokens++;
    const v = (data[name] ?? "").trim();
    if (v === "") {
      blank++;
      return fallback ?? "";
    }
    return data[name];
  });
  return { text: out, tokens, blank, empty: tokens > 0 && blank === tokens };
}

/** Token names used in a text that this kind of template does not know. */
export function unknownTokens(text: string, kind: TemplateKind): string[] {
  const known = new Set(tokensFor(kind).map((t) => t.name));
  const bad = new Set<string>();
  const re = new RegExp(TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!known.has(m[1])) bad.add(m[1]);
  return Array.from(bad);
}

// ---------------------------------------------------------------------------
// Numbers and ids
// ---------------------------------------------------------------------------
export const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A short id not in `taken`. */
export function nextId(taken: Iterable<string>, rnd: () => number = Math.random): string {
  const set = new Set(taken);
  for (;;) {
    const id = Math.floor(rnd() * 36 ** 5).toString(36).padStart(5, "0");
    if (!set.has(id)) return id;
  }
}

// ---------------------------------------------------------------------------
// Checking what came from the browser / database
// ---------------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, def: number, round: (n: number) => number = r1) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return round(clamp(n, lo, hi));
};
const str = (v: unknown, max: number, def = "") => (typeof v === "string" ? v.slice(0, max) : def);
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : def);
const ALIGNS = ["left", "center", "right"] as const;
const VALIGNS = ["top", "middle", "bottom"] as const;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export type Checked<T> = { ok: true; doc: T } | { ok: false; error: string };

function cleanId(v: unknown, taken: Set<string>): string {
  let id = typeof v === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(v) && !taken.has(v) ? v : "";
  if (!id) id = nextId(taken);
  taken.add(id);
  return id;
}

function cleanImage(v: unknown): string | null {
  return typeof v === "string" && v.length <= LIMITS.maxImageChars && IMG_RE.test(v) ? v : null;
}

/** Checks and tidies a template from the browser or database: unknown fields dropped, numbers kept in range. */
export function sanitizeDoc(raw: unknown, kind: TemplateKind): Checked<TemplateDoc> {
  if (!isObj(raw)) return { ok: false, error: "The layout is missing." };
  if (raw.kind !== kind) return { ok: false, error: `This layout is not a ${kind} layout.` };
  return kind === "label" ? sanitizeLabel(raw) : sanitizeSlip(raw);
}

function sanitizeLabel(raw: Record<string, unknown>): Checked<LabelDoc> {
  const W = num(raw.widthMm, LIMITS.labelW[0], LIMITS.labelW[1], 50);
  const H = num(raw.heightMm, LIMITS.labelH[0], LIMITS.labelH[1], 30);
  const list = Array.isArray(raw.els) ? raw.els : [];
  if (list.length > LIMITS.maxEls) return { ok: false, error: `A label can hold at most ${LIMITS.maxEls} items.` };
  const taken = new Set<string>();
  const els: LabelEl[] = [];
  let imageChars = 0;
  for (const r of list) {
    if (!isObj(r)) continue;
    const rot = r.rot === 90 || r.rot === 180 || r.rot === 270 ? r.rot : 0;
    const base = { id: cleanId(r.id, taken), x: num(r.x, -W, W * 2, 0), y: num(r.y, -H, H * 2, 0), w: num(r.w, 0.5, W * 2, 10), h: num(r.h, 0.5, H * 2, 5) };
    const turned = rot ? { rot: rot as Rot } : {};
    switch (r.type) {
      case "text": {
        const border = num(r.border, 0, 1.5, 0, r2);
        els.push({
          ...base,
          ...turned,
          type: "text",
          text: str(r.text, LIMITS.maxText),
          font: isFontId(r.font) ? r.font : "sans",
          size: num(r.size, LIMITS.pt[0], LIMITS.pt[1], 8),
          bold: bool(r.bold, false),
          italic: bool(r.italic, false),
          align: pick(r.align, ALIGNS, "left"),
          valign: pick(r.valign, VALIGNS, "middle"),
          invert: bool(r.invert, false),
          fit: bool(r.fit, false),
          ...(border > 0 ? { border } : {}),
          ...(bool(r.underline, false) ? { underline: true } : {}),
        });
        break;
      }
      case "barcode":
        els.push({ ...base, ...turned, type: "barcode", value: str(r.value, 120, "{code}"), human: bool(r.human, false) });
        break;
      case "qr":
        els.push({ ...base, ...turned, type: "qr", value: str(r.value, 300, "{link}") });
        break;
      case "image": {
        const src = cleanImage(r.src);
        if (!src) return { ok: false, error: "A picture on the label is not a PNG / JPEG / WebP, or is too big. Use a smaller logo." };
        imageChars += src.length;
        if (imageChars > LIMITS.maxImagesTotal) return { ok: false, error: "The pictures on this layout are too big in total. Use smaller logos." };
        els.push({ ...base, ...turned, type: "image", src, fit: pick(r.fit, ["contain", "cover"] as const, "contain") });
        break;
      }
      case "rect":
        els.push({ ...base, type: "rect", fill: bool(r.fill, false), stroke: num(r.stroke, 0, 3, 0.3, r2), radius: num(r.radius, 0, 20, 0) });
        break;
      case "line":
        els.push({ ...base, type: "line", thick: num(r.thick, 0.1, 5, 0.3, r2) });
        break;
      default:
        break;
    }
  }
  return { ok: true, doc: { v: 1, kind: "label", widthMm: W, heightMm: H, els } };
}

function sanitizeSlip(raw: Record<string, unknown>): Checked<SlipDoc> {
  const W = num(raw.widthMm, LIMITS.slipW[0], LIMITS.slipW[1], 80);
  const margin = num(raw.marginMm, LIMITS.slipMargin[0], LIMITS.slipMargin[1], W <= 60 ? 2 : 3);
  const list = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (list.length > LIMITS.maxBlocks) return { ok: false, error: `A slip can hold at most ${LIMITS.maxBlocks} blocks.` };
  const taken = new Set<string>();
  const blocks: SlipBlock[] = [];
  let imageChars = 0;
  for (const r of list) {
    if (!isObj(r)) continue;
    const id = cleanId(r.id, taken);
    switch (r.type) {
      case "text":
        blocks.push({
          id,
          type: "text",
          text: str(r.text, LIMITS.maxText),
          font: isFontId(r.font) ? r.font : "sans",
          size: num(r.size, LIMITS.pt[0], LIMITS.pt[1], 9),
          bold: bool(r.bold, false),
          italic: bool(r.italic, false),
          align: pick(r.align, ALIGNS, "left"),
          invert: bool(r.invert, false),
          hideEmpty: bool(r.hideEmpty, true),
        });
        break;
      case "kv":
        blocks.push({ id, type: "kv", label: str(r.label, 60), value: str(r.value, LIMITS.maxText), font: isFontId(r.font) ? r.font : "sans", size: num(r.size, LIMITS.pt[0], LIMITS.pt[1], 9), bold: bool(r.bold, false), hideEmpty: bool(r.hideEmpty, true) });
        break;
      case "cols": {
        const cells = (Array.isArray(r.cells) ? r.cells : []).slice(0, 4).filter(isObj).map((c) => ({ label: str(c.label, 40), value: str(c.value, 120) }));
        if (!cells.length) break;
        blocks.push({ id, type: "cols", cells, font: isFontId(r.font) ? r.font : "sans", size: num(r.size, LIMITS.pt[0], LIMITS.pt[1], 12), hideEmpty: bool(r.hideEmpty, true) });
        break;
      }
      case "barcode":
        blocks.push({ id, type: "barcode", value: str(r.value, 120, "{code}"), heightMm: num(r.heightMm, 4, 60, 12), widthPct: num(r.widthPct, 20, 100, 100, Math.round), align: pick(r.align, ALIGNS, "center"), human: bool(r.human, false) });
        break;
      case "qr":
        blocks.push({ id, type: "qr", value: str(r.value, 300, "{link}"), sizeMm: num(r.sizeMm, 8, 60, 20), align: pick(r.align, ALIGNS, "center") });
        break;
      case "image": {
        const src = cleanImage(r.src);
        if (!src) return { ok: false, error: "A picture on the slip is not a PNG / JPEG / WebP, or is too big. Use a smaller logo." };
        imageChars += src.length;
        if (imageChars > LIMITS.maxImagesTotal) return { ok: false, error: "The pictures on this layout are too big in total. Use smaller logos." };
        blocks.push({ id, type: "image", src, widthMm: num(r.widthMm, 4, W, Math.min(30, W)), align: pick(r.align, ALIGNS, "center") });
        break;
      }
      case "divider":
        blocks.push({ id, type: "divider", style: pick(r.style, ["solid", "dashed", "dotted", "thick"] as const, "solid") });
        break;
      case "spacer":
        blocks.push({ id, type: "spacer", heightMm: num(r.heightMm, 0.5, 60, 3) });
        break;
      case "sign": {
        const labels = (Array.isArray(r.labels) ? r.labels : []).slice(0, 3).map((l) => str(l, 40));
        if (!labels.length) break;
        blocks.push({ id, type: "sign", labels, size: num(r.size, LIMITS.pt[0], LIMITS.pt[1], 7.5), gapMm: num(r.gapMm, 4, 60, 9) });
        break;
      }
      default:
        break;
    }
  }
  return { ok: true, doc: { v: 1, kind: "slip", widthMm: W, marginMm: margin, blocks } };
}

export function cleanName(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxName) : "";
}

/** Height (mm) to store with a template: the label height, or null for a roll slip. */
export const docHeight = (d: TemplateDoc): number | null => (d.kind === "label" ? d.heightMm : null);

// ---------------------------------------------------------------------------
// Making new things
// ---------------------------------------------------------------------------
export function newLabelEl(type: LabelElType, doc: LabelDoc, rnd?: () => number): LabelEl {
  const id = nextId(doc.els.map((e) => e.id), rnd);
  const W = doc.widthMm;
  const H = doc.heightMm;
  const w = (f: number, min: number) => r1(Math.max(min, Math.min(W - 2, W * f)));
  const h = (f: number, min: number) => r1(Math.max(min, Math.min(H - 2, H * f)));
  const x = (bw: number) => r1(Math.max(0, (W - bw) / 2));
  const y = (bh: number) => r1(Math.max(0, (H - bh) / 2));
  switch (type) {
    case "text": {
      const bw = w(0.7, 8);
      const bh = h(0.15, 3.5);
      return { id, type, x: x(bw), y: y(bh), w: bw, h: bh, text: "Text", font: "sans", size: 8, bold: false, italic: false, align: "center", valign: "middle", invert: false, fit: false };
    }
    case "barcode": {
      const bw = w(0.8, 12);
      const bh = h(0.3, 6);
      return { id, type, x: x(bw), y: y(bh), w: bw, h: bh, value: "{code}", human: false };
    }
    case "qr": {
      const s = r1(Math.max(8, Math.min(W - 2, H - 2, Math.min(W, H) * 0.45)));
      return { id, type, x: x(s), y: y(s), w: s, h: s, value: "{link}" };
    }
    case "image": {
      const s = r1(Math.max(6, Math.min(W - 2, H - 2, Math.min(W, H) * 0.4)));
      return { id, type, x: x(s), y: y(s), w: s, h: s, src: TINY_PNG, fit: "contain" };
    }
    case "rect": {
      const bw = w(0.6, 6);
      const bh = h(0.4, 4);
      return { id, type, x: x(bw), y: y(bh), w: bw, h: bh, fill: false, stroke: 0.3, radius: 0 };
    }
    case "line": {
      const bw = w(0.8, 6);
      return { id, type, x: x(bw), y: y(0.4), w: bw, h: 0.4, thick: 0.3 };
    }
  }
}

/**
 * Empty weight and its date as two separate pieces, so each can be moved on its own:
 * the weight in a black band on top, the date in small letters just under it (right side, like a stamp).
 */
export function newWeightDate(doc: LabelDoc, rnd?: () => number): LabelEl[] {
  const W = doc.widthMm;
  const H = doc.heightMm;
  const taken = doc.els.map((e) => e.id);
  const bw = r1(Math.max(8, W - 2));
  const bh = r1(Math.max(3.5, Math.min(H * 0.2, 9)));
  const dh = r1(Math.max(2.4, Math.min(H * 0.08, 4)));
  const x = r1((W - bw) / 2);
  const y = r1(Math.max(0, Math.min(H - bh - dh, H * 0.2)));
  const idA = nextId(taken, rnd);
  const idB = nextId([...taken, idA], rnd);
  const weight: LabelEl = { id: idA, type: "text", x, y, w: bw, h: bh, text: "TARE (EMPTY) {tare|________} kg", font: "sans", size: r1(Math.min(14, bh * 1.6)), bold: true, italic: false, align: "center", valign: "middle", invert: true, fit: true };
  const date: LabelEl = { id: idB, type: "text", x, y: r1(y + bh + 0.3), w: bw, h: dh, text: "{tareDate}", font: "sans", size: r1(Math.min(8, dh * 2)), bold: false, italic: false, align: "right", valign: "middle", invert: false, fit: true };
  return [weight, date];
}

/** Just the date, small, in the top right corner. */
export function newDateCorner(doc: LabelDoc, rnd?: () => number): LabelEl {
  const W = doc.widthMm;
  const bw = r1(Math.min(W - 2, Math.max(14, W * 0.4)));
  const bh = r1(Math.max(2.4, Math.min(doc.heightMm * 0.07, 3.5)));
  return { id: nextId(doc.els.map((e) => e.id), rnd), type: "text", x: r1(W - bw - 1), y: 0.8, w: bw, h: bh, text: "{tareDate}", font: "sans", size: r1(Math.min(8, bh * 2)), bold: false, italic: false, align: "right", valign: "middle", invert: false, fit: true };
}

/** 1×1 grey placeholder: a new Picture element shows this until a logo is chosen. */
export const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8+x8AAuEB4vP0dZYAAAAASUVORK5CYII=";

export function newBlock(type: SlipBlockType, doc: SlipDoc, rnd?: () => number): SlipBlock {
  const id = nextId(doc.blocks.map((b) => b.id), rnd);
  switch (type) {
    case "text":
      return { id, type, text: "Text", font: "sans", size: 9, bold: false, italic: false, align: "left", invert: false, hideEmpty: true };
    case "kv":
      return { id, type, label: "Label", value: "{note}", font: "sans", size: 9, bold: false, hideEmpty: true };
    case "cols":
      return { id, type, cells: [{ label: "Gross", value: "{gross} kg" }, { label: "Tare", value: "{tare} kg" }, { label: "Net", value: "{net} kg" }], font: "sans", size: 12, hideEmpty: true };
    case "barcode":
      return { id, type, value: "{code}", heightMm: 12, widthPct: 100, align: "center", human: false };
    case "qr":
      return { id, type, value: "{link}", sizeMm: 20, align: "center" };
    case "image":
      return { id, type, src: TINY_PNG, widthMm: Math.min(30, doc.widthMm), align: "center" };
    case "divider":
      return { id, type, style: "solid" };
    case "spacer":
      return { id, type, heightMm: 3 };
    case "sign":
      return { id, type, labels: ["Weighed by", "Checked by"], size: 7.5, gapMm: 9 };
  }
}

export const blankLabel = (w: number, h: number): LabelDoc => ({ v: 1, kind: "label", widthMm: r1(clamp(w, LIMITS.labelW[0], LIMITS.labelW[1])), heightMm: r1(clamp(h, LIMITS.labelH[0], LIMITS.labelH[1])), els: [] });
export const blankSlip = (w: number): SlipDoc => {
  const W = r1(clamp(w, LIMITS.slipW[0], LIMITS.slipW[1]));
  return { v: 1, kind: "slip", widthMm: W, marginMm: W <= 60 ? 2 : 3, blocks: [] };
};

/** The standard barrel label, laid out for the given size: the same things the built-in label shows. */
export function starterLabel(w: number, h: number): LabelDoc {
  const doc = blankLabel(w, h);
  const W = doc.widthMm;
  const H = doc.heightMm;
  const m = r1(Math.max(1, Math.min(3, W * 0.025)));
  const iw = r1(W - 2 * m);
  const s = clamp(Math.min(W / 50, H / 30), 0.6, 3);
  const compact = H < 60;
  const els: LabelEl[] = [];
  const add = (e: DistOmit<LabelEl, "id">) => els.push({ ...e, id: String(els.length + 1) } as LabelEl);
  const text = (x: number, y: number, bw: number, bh: number, t: string, size: number, o: Partial<TextEl> = {}) =>
    add({ type: "text", x: r1(x), y: r1(y), w: r1(bw), h: r1(bh), text: t, font: "sans", size: r1(size), bold: false, italic: false, align: "center", valign: "middle", invert: false, fit: true, ...o });
  let y = m;
  // a small sticker has no room for the company line (the built-in tare label drops it too)
  if (!compact) {
    const headH = r1(5 * Math.min(s, 1.6));
    text(m, y, iw, headH, "{company}", 9 * s, { bold: true });
    y += headH + 0.2;
  }
  const bandH = r1(compact ? 4.2 : 7 * Math.min(s, 1.5));
  text(m, y, iw, bandH, "TARE (EMPTY) {tare|________} kg", compact ? 7 * s : 9.5 * s, { bold: true, invert: true });
  y += bandH + 0.3;
  // the date of that weighing sits on its own line right under the weight (a separate item: move it anywhere)
  const dateH = r1(compact ? 2.6 : 3.2 * Math.min(s, 1.5));
  text(m, y, iw, dateH, "{tareDate}", (compact ? 5 : 6) * s, { align: "right" });
  y += dateH + 0.7;
  const barH = r1(compact ? H * 0.2 : Math.min(H * 0.2, 40));
  add({ type: "barcode", x: m, y: r1(y), w: iw, h: barH, value: "{code}", human: false });
  y += barH + 1;
  const rest = r1(H - m - y);
  if (compact) {
    const q = r1(Math.max(6, Math.min(rest, iw * 0.34)));
    add({ type: "qr", x: r1(W - m - q), y: r1(y + (rest - q) / 2), w: q, h: q, value: "{link}" });
    const tw = r1(iw - q - 1);
    const lines = [
      { t: "{code}", size: 8.5 * s, bold: true },
      { t: "{mark}", size: 6.5 * s, bold: false },
      { t: "Max {capacity} kg oil", size: 5.5 * s, bold: false },
    ];
    const lh = r1(rest / lines.length);
    lines.forEach((l, i) => text(m, y + i * lh, tw, lh, l.t, l.size, { bold: l.bold, align: "left", valign: "middle" }));
  } else {
    const row = r1(Math.min(7, rest * 0.16));
    const k = Math.min(s, 1.6);
    text(m, y, iw, row, "{code}", 16 * k, { bold: true });
    text(m, y + row, iw, row, "{mark}", 10 * k);
    text(m, y + 2 * row, iw, row, "Max {capacity} kg oil", 8 * k);
    const left = r1(rest - 3 * row - 1);
    const q = r1(Math.max(8, Math.min(left, iw * 0.55, 45)));
    add({ type: "qr", x: r1((W - q) / 2), y: r1(y + 3 * row + 0.5 + (left - q) / 2), w: q, h: q, value: "{link}" });
  }
  doc.els = els;
  return fitLabelToCanvas(doc);
}

/** The standard barrel slip as blocks. */
export function starterSlip(w: number): SlipDoc {
  const doc = blankSlip(w);
  const narrow = doc.widthMm <= 60;
  const blocks: SlipBlock[] = [];
  const add = (b: DistOmit<SlipBlock, "id">) => blocks.push({ ...b, id: String(blocks.length + 1) } as SlipBlock);
  const base = narrow ? 8 : 9;
  add({ type: "text", text: "{company}", font: "sans", size: base + 3, bold: true, italic: false, align: "center", invert: false, hideEmpty: false });
  add({ type: "text", text: "{title}", font: "sans", size: base, bold: false, italic: false, align: "center", invert: false, hideEmpty: true });
  add({ type: "divider", style: "thick" });
  add({ type: "barcode", value: "{code}", heightMm: narrow ? 10 : 14, widthPct: 100, align: "center", human: false });
  add({ type: "qr", value: "{link}", sizeMm: narrow ? 18 : 22, align: "center" });
  add({ type: "text", text: "{code}", font: "sans", size: base + 5, bold: true, italic: false, align: "center", invert: false, hideEmpty: false });
  const kv = (label: string, value: string) => add({ type: "kv", label, value, font: "sans", size: base, bold: false, hideEmpty: true });
  kv("Date / time", "{date}");
  kv("Barrel mark", "{mark}");
  kv("Oil", "{product}");
  kv("From → To", "{route}");
  kv("Party", "{party}");
  kv("Vehicle", "{vehicle}");
  kv("Purpose", "{purpose}");
  kv("Bill / ref", "{ref}");
  add({ type: "divider", style: "solid" });
  add({ type: "cols", cells: [{ label: "Gross", value: "{gross} kg" }, { label: "Tare", value: "{tare} kg" }, { label: "NET OIL", value: "{net} kg" }], font: "sans", size: narrow ? 10 : 12, hideEmpty: true });
  add({ type: "text", text: "{equation}", font: "sans", size: base - 0.5, bold: false, italic: false, align: "right", invert: false, hideEmpty: true });
  for (const t of ["{scale}", "By {by}", "{note}"]) add({ type: "text", text: t, font: "sans", size: 7, bold: false, italic: false, align: "left", invert: false, hideEmpty: true });
  add({ type: "sign", labels: ["Weighed by", "Checked by"], size: 7.5, gapMm: 9 });
  add({ type: "text", text: "Printed {printedAt}", font: "sans", size: 7, bold: false, italic: false, align: "right", invert: false, hideEmpty: false });
  doc.blocks = blocks;
  return doc;
}

export type LabelStartId = "blank" | "standard" | "bigcode" | "weight";
export const LABEL_STARTS: { id: LabelStartId; name: string; note: string }[] = [
  { id: "blank", name: "Blank, from scratch", note: "An empty label. Add text, barcodes and pictures yourself." },
  { id: "standard", name: "Standard barrel label", note: "Company, empty weight, date, barcode, code, QR." },
  { id: "bigcode", name: "Big barrel code", note: "The barrel code in large letters, easy to read from far." },
  { id: "weight", name: "Big weight", note: "The empty weight in large letters, with its date." },
];

/** A starting point for a new label of this size. */
export function startLabel(id: LabelStartId, w: number, h: number): LabelDoc {
  if (id === "blank") return blankLabel(w, h);
  if (id === "standard") return starterLabel(w, h);
  const doc = blankLabel(w, h);
  const W = doc.widthMm;
  const H = doc.heightMm;
  const m = r1(Math.max(1, Math.min(3, W * 0.025)));
  const iw = r1(W - 2 * m);
  const s = clamp(Math.min(W / 50, H / 30), 0.6, 3);
  const short = H < 60; // a short sticker: the QR code sits beside the big text instead of under everything
  const els: LabelEl[] = [];
  const add = (e: DistOmit<LabelEl, "id">) => els.push({ ...e, id: String(els.length + 1) } as LabelEl);
  const text = (x: number, y: number, bw: number, bh: number, t: string, size: number, o: Partial<TextEl> = {}) =>
    add({ type: "text", x: r1(x), y: r1(y), w: r1(bw), h: r1(bh), text: t, font: "sans", size: r1(size), bold: false, italic: false, align: "center", valign: "middle", invert: false, fit: true, ...o });
  const weight = id === "weight";
  const bigText = weight ? "{tare|________} kg" : "{code}";
  if (short) {
    const q = r1(Math.max(12, Math.min(H * 0.42, 40)));
    const lw = r1(iw - q - 1);
    const dh = weight ? r1(Math.max(2.6, q * 0.2)) : 0;
    const bigH = r1(q - dh);
    text(m, m, lw, bigH, bigText, 30 * s, { bold: true });
    if (weight) text(m, m + bigH, lw, dh, "TARE (EMPTY)  {tareDate}", 5.5 * s, { align: "right" });
    add({ type: "qr", x: r1(W - m - q), y: m, w: q, h: q, value: "{link}" });
    const y2 = r1(m + q + 1);
    add({ type: "barcode", x: m, y: y2, w: iw, h: r1(Math.max(4, H - m - y2)), value: "{code}", human: true });
  } else {
    let y = m;
    const hh = r1(4 * Math.min(s, 1.6));
    text(m, y, iw, hh, "{company}", 8 * s, { bold: true });
    y += hh + 0.5;
    if (weight) {
      const lh = r1(3.2 * Math.min(s, 1.5));
      text(m, y, iw, lh, "TARE (EMPTY)", 6.5 * s);
      y += lh;
    }
    const bh = r1(H * 0.2);
    text(m, y, iw, bh, bigText, 30 * s, { bold: true });
    y += bh + 0.5;
    if (weight) {
      const dh = r1(3.2 * Math.min(s, 1.5));
      text(m, y, iw, dh, "{tareDate}", 6 * s, { align: "right" });
      y += dh + 0.5;
    }
    const barH = r1(Math.min(H * 0.15, 30));
    add({ type: "barcode", x: m, y: r1(y), w: iw, h: barH, value: "{code}", human: false });
    y += barH + 1;
    const rest = r1(H - m - y);
    const q = r1(Math.max(8, Math.min(rest, iw * 0.4, 40)));
    add({ type: "qr", x: r1(W - m - q), y: r1(y + (rest - q) / 2), w: q, h: q, value: "{link}" });
    const tw = r1(iw - q - 1);
    const lines = weight ? ["{code}", "{mark}"] : ["{mark}", "Max {capacity} kg oil"];
    const lh = r1(Math.min(rest / lines.length, 7));
    const top = r1(y + (rest - lh * lines.length) / 2);
    lines.forEach((t, i) => text(m, top + i * lh, tw, lh, t, (i === 0 && weight ? 9 : 6.5) * s, { align: "left", bold: i === 0 && weight }));
  }
  doc.els = els;
  return fitLabelToCanvas(doc);
}

export const starterFor = (kind: TemplateKind, widthMm: number, heightMm: number | null): TemplateDoc => (kind === "label" ? starterLabel(widthMm, heightMm ?? 30) : starterSlip(widthMm));

// ---------------------------------------------------------------------------
// Geometry (label canvas)
// ---------------------------------------------------------------------------
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const snapTo = (v: number, grid: number) => (grid > 0 ? r2(Math.round(v / grid) * grid) : v);

/** Pulls every item inside the canvas (and shrinks any that is bigger than it). */
export function fitLabelToCanvas(doc: LabelDoc): LabelDoc {
  return { ...doc, els: doc.els.map((e) => keepInside(e, doc.widthMm, doc.heightMm)) };
}

export function keepInside<T extends Box>(e: T, W: number, H: number): T {
  const w = r1(clamp(e.w, 0.5, W));
  const h = r1(clamp(e.h, 0.5, H));
  return { ...e, w, h, x: r1(clamp(e.x, 0, W - w)), y: r1(clamp(e.y, 0, H - h)) };
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** x / y positions (mm) of the guide lines to draw */
  guidesX: number[];
  guidesY: number[];
}

/** How far a moving box should shift so its edges / centre line up with the canvas or other items. */
export function snapBox(box: Box, others: Box[], W: number, H: number, tol: number): SnapResult {
  const tx = [0, W / 2, W];
  const ty = [0, H / 2, H];
  for (const o of others) {
    tx.push(o.x, o.x + o.w / 2, o.x + o.w);
    ty.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const best = (anchors: number[], targets: number[]) => {
    let d = 0;
    let guide: number[] = [];
    let min = tol + 1e-9;
    for (const a of anchors) {
      for (const t of targets) {
        const diff = t - a;
        if (Math.abs(diff) < min - 1e-9) {
          min = Math.abs(diff);
          d = diff;
          guide = [t];
        } else if (Math.abs(Math.abs(diff) - min) < 1e-9 && Math.abs(diff - d) < 1e-9 && !guide.includes(t)) guide.push(t);
      }
    }
    return { d: min <= tol ? d : 0, guide: min <= tol ? guide : [] };
  };
  const bx = best([box.x, box.x + box.w / 2, box.x + box.w], tx);
  const by = best([box.y, box.y + box.h / 2, box.y + box.h], ty);
  return { dx: r2(bx.d), dy: r2(by.d), guidesX: bx.guide, guidesY: by.guide };
}

/** Moves / resizes `start` by the pointer travel (dx, dy mm) from one handle; keeps a minimum size and stays on the canvas. */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, o: { min?: number; W: number; H: number; grid?: number; keepRatio?: boolean }): Box {
  const min = o.min ?? 1;
  let l = start.x;
  let t = start.y;
  let r = start.x + start.w;
  let b = start.y + start.h;
  if (handle.includes("w")) l += dx;
  if (handle.includes("e")) r += dx;
  if (handle.includes("n")) t += dy;
  if (handle.includes("s")) b += dy;
  const g = o.grid ?? 0;
  if (g > 0) {
    if (handle.includes("w")) l = snapTo(l, g);
    if (handle.includes("e")) r = snapTo(r, g);
    if (handle.includes("n")) t = snapTo(t, g);
    if (handle.includes("s")) b = snapTo(b, g);
  }
  if (o.keepRatio && handle.length === 2 && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    let w = r - l;
    let h = b - t;
    if (Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)) h = w / ratio;
    else w = h * ratio;
    if (handle.includes("w")) l = r - w;
    else r = l + w;
    if (handle.includes("n")) t = b - h;
    else b = t + h;
  }
  if (r - l < min) {
    if (handle.includes("w")) l = r - min;
    else r = l + min;
  }
  if (b - t < min) {
    if (handle.includes("n")) t = b - min;
    else b = t + min;
  }
  l = Math.max(0, l);
  t = Math.max(0, t);
  r = Math.min(o.W, r);
  b = Math.min(o.H, b);
  if (r - l < min) {
    if (handle.includes("w")) l = Math.max(0, r - min);
    else r = Math.min(o.W, l + min);
  }
  if (b - t < min) {
    if (handle.includes("n")) t = Math.max(0, b - min);
    else b = Math.min(o.H, t + min);
  }
  return { x: r1(l), y: r1(t), w: r1(r - l), h: r1(b - t) };
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Aligns the chosen items to each other (several) or to the canvas (one). */
export function alignEls(els: LabelEl[], ids: string[], mode: AlignMode, W: number, H: number): LabelEl[] {
  const sel = els.filter((e) => ids.includes(e.id));
  if (!sel.length) return els;
  const area = sel.length === 1 ? { l: 0, t: 0, r: W, b: H } : { l: Math.min(...sel.map((e) => e.x)), t: Math.min(...sel.map((e) => e.y)), r: Math.max(...sel.map((e) => e.x + e.w)), b: Math.max(...sel.map((e) => e.y + e.h)) };
  return els.map((e) => {
    if (!ids.includes(e.id)) return e;
    switch (mode) {
      case "left": return { ...e, x: r1(area.l) };
      case "right": return { ...e, x: r1(area.r - e.w) };
      case "hcenter": return { ...e, x: r1((area.l + area.r) / 2 - e.w / 2) };
      case "top": return { ...e, y: r1(area.t) };
      case "bottom": return { ...e, y: r1(area.b - e.h) };
      case "vcenter": return { ...e, y: r1((area.t + area.b) / 2 - e.h / 2) };
    }
  });
}

/** Gives every chosen item the width and/or height of the first one chosen (kept inside the canvas). */
export function matchSize(els: LabelEl[], ids: string[], what: "w" | "h" | "both", W: number, H: number): LabelEl[] {
  const first = ids.map((id) => els.find((e) => e.id === id)).find(Boolean);
  if (!first || ids.length < 2) return els;
  return els.map((e) => {
    if (!ids.includes(e.id) || e.id === first.id) return e;
    const w = what === "h" ? e.w : r1(Math.min(first.w, W - e.x));
    const h = what === "w" ? e.h : r1(Math.min(first.h, H - e.y));
    return { ...e, w, h };
  });
}

/** Spreads three or more chosen items so the gaps between them are equal. */
export function distributeEls(els: LabelEl[], ids: string[], axis: "h" | "v"): LabelEl[] {
  const sel = els.filter((e) => ids.includes(e.id));
  if (sel.length < 3) return els;
  const pos = (e: LabelEl) => (axis === "h" ? e.x : e.y);
  const size = (e: LabelEl) => (axis === "h" ? e.w : e.h);
  const sorted = [...sel].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = pos(last) + size(last) - pos(first);
  const gap = (total - sorted.reduce((s, e) => s + size(e), 0)) / (sorted.length - 1);
  const place = new Map<string, number>();
  let cur = pos(first);
  for (const e of sorted) {
    place.set(e.id, r1(cur));
    cur += size(e) + gap;
  }
  return els.map((e) => (place.has(e.id) ? (axis === "h" ? { ...e, x: place.get(e.id)! } : { ...e, y: place.get(e.id)! }) : e));
}

export type Order = "front" | "back" | "forward" | "backward";

/** Changes the stacking order (the last item is drawn on top). Works on labels (els) and slips (blocks). */
export function reorder<T extends { id: string }>(list: T[], ids: string[], dir: Order): T[] {
  const picked = list.filter((e) => ids.includes(e.id));
  const rest = list.filter((e) => !ids.includes(e.id));
  if (!picked.length) return list;
  if (dir === "front") return [...rest, ...picked];
  if (dir === "back") return [...picked, ...rest];
  const out = [...list];
  if (dir === "forward") {
    for (let i = out.length - 2; i >= 0; i--) if (ids.includes(out[i].id) && !ids.includes(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  } else {
    for (let i = 1; i < out.length; i++) if (ids.includes(out[i].id) && !ids.includes(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

/** Copies the chosen items next to the originals; returns the new list and the new ids. */
export function duplicateItems<T extends { id: string }>(list: T[], ids: string[], offsetMm = 2, rnd?: () => number): { list: T[]; ids: string[] } {
  const out = [...list];
  const newIds: string[] = [];
  const taken = new Set(list.map((e) => e.id));
  for (const e of list) {
    if (!ids.includes(e.id)) continue;
    const id = nextId(taken, rnd);
    taken.add(id);
    const copy = { ...JSON.parse(JSON.stringify(e)), id } as T;
    const c = copy as unknown as Partial<Box>;
    if (typeof c.x === "number" && typeof c.y === "number") {
      c.x = r1(c.x + offsetMm);
      c.y = r1(c.y + offsetMm);
    }
    out.push(copy);
    newIds.push(id);
  }
  return { list: out, ids: newIds };
}

/** Moves a slip block one place up / down. */
export function moveBlock<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): T[] {
  const i = list.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Changes the label's paper size and scales every item with it (so the layout keeps its shape). */
export function resizeLabel(doc: LabelDoc, w: number, h: number): LabelDoc {
  const W = r1(clamp(w, LIMITS.labelW[0], LIMITS.labelW[1]));
  const H = r1(clamp(h, LIMITS.labelH[0], LIMITS.labelH[1]));
  const fx = W / doc.widthMm;
  const fy = H / doc.heightMm;
  const f = Math.min(fx, fy);
  return fitLabelToCanvas({
    ...doc,
    widthMm: W,
    heightMm: H,
    els: doc.els.map((e) => {
      const moved = { ...e, x: r1(e.x * fx), y: r1(e.y * fy), w: r1(e.w * fx), h: r1(e.h * fy) };
      return e.type === "text" ? ({ ...moved, size: r1(clamp(e.size * f, LIMITS.pt[0], LIMITS.pt[1])) } as LabelEl) : (moved as LabelEl);
    }),
  });
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** key of the last change: a run of changes with the same key (typing in one box) counts as one step */
  key: string | null;
}
export const HISTORY_CAP = 100;
export const histNew = <T>(present: T): History<T> => ({ past: [], present, future: [], key: null });
export function histPush<T>(h: History<T>, next: T, key: string | null = null): History<T> {
  if (next === h.present) return h;
  if (key && h.key === key) return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-HISTORY_CAP), present: next, future: [], key };
}
export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
export function histUndo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null };
}
export function histRedo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_CAP), present: h.future[0], future: h.future.slice(1), key: null };
}

// ---------------------------------------------------------------------------
// Warnings the designer shows before printing
// ---------------------------------------------------------------------------
/** Width in Code 128 modules of the text (start + data + check + stop + quiet zones), or null if it cannot be drawn. */
export function barcodeModuleCount(text: string): number | null {
  if (!code128Ok(text)) return null;
  return code128Symbols(text).length * 11 + 13 + 20; // + 10 quiet modules each side
}

export const PRINTER_DPI = 203;

/**
 * Bars drawn at a whole number of printer dots look sharp and scan well; a width that is not a
 * multiple smears the thin bars. Returns the dots per bar and the width that makes it exact.
 */
export function barcodeDots(boxWidthMm: number, text: string, dpi = PRINTER_DPI): { dotsPerModule: number; moduleMm: number; widthMm: number } | null {
  const modules = barcodeModuleCount(text);
  if (!modules) return null;
  const mmPerDot = 25.4 / dpi;
  const raw = Math.floor(boxWidthMm / mmPerDot / modules);
  const dotsPerModule = Math.max(1, raw);
  const moduleMm = dotsPerModule * mmPerDot;
  return { dotsPerModule: raw, moduleMm: r2(moduleMm), widthMm: r2(moduleMm * modules) };
}

/** Largest square (mm) no bigger than the box that gives the QR a whole number of printer dots per square. */
export function qrFit(boxMm: number, text: string, dpi = PRINTER_DPI): { sizeMm: number; dotsPerModule: number } {
  let modules = 0;
  try {
    modules = qrSvg(text || " ", { moduleSize: 1 }).size;
  } catch {
    return { sizeMm: boxMm, dotsPerModule: 0 };
  }
  const mmPerDot = 25.4 / dpi;
  const raw = Math.floor(boxMm / mmPerDot / modules);
  if (raw < 1) return { sizeMm: boxMm, dotsPerModule: 0 };
  return { sizeMm: r2(raw * modules * mmPerDot), dotsPerModule: raw };
}

/** The font files a filled-in template draws with, as "sans:400,kannada:700" (carried on the page as data-fonts). */
export function docFontSpec(doc: TemplateDoc, data: TokenData): string {
  const needs: FontNeed[] = [];
  const f = (t: string) => fillTokens(t, data).text;
  if (doc.kind === "label") {
    for (const e of doc.els) {
      if (e.type === "text") needs.push(...fontNeeds(e.font, e.bold, f(e.text)));
      else if (e.type === "barcode" && e.human) needs.push(...fontNeeds("sans", false, ""));
    }
  } else {
    for (const b of doc.blocks) {
      if (b.type === "text") needs.push(...fontNeeds(b.font, b.bold, f(b.text)));
      else if (b.type === "kv") needs.push(...fontNeeds(b.font, false, f(b.label)), ...fontNeeds(b.font, b.bold, f(b.value)));
      else if (b.type === "cols") for (const c of b.cells) needs.push(...fontNeeds(b.font, false, f(c.label)), ...fontNeeds(b.font, true, f(c.value)));
      else if (b.type === "sign") for (const l of b.labels) needs.push(...fontNeeds("sans", false, f(l)));
      else if (b.type === "barcode" && b.human) needs.push(...fontNeeds("sans", false, ""));
    }
  }
  return needSpec(needs);
}

/** Things likely to print badly. `data` fills the tokens (sample data in the designer). */
export function checkDoc(doc: TemplateDoc, data: TokenData): string[] {
  const out: string[] = [];
  const kind = doc.kind;
  const items: { type: string; value?: string; text?: string; wMm?: number }[] =
    doc.kind === "label"
      ? doc.els.map((e) => ({ type: e.type, value: "value" in e ? e.value : undefined, text: e.type === "text" ? e.text : undefined, wMm: e.w }))
      : doc.blocks.map((b) => ({ type: b.type, value: b.type === "barcode" || b.type === "qr" ? b.value : undefined, text: b.type === "text" ? b.text : undefined, wMm: b.type === "barcode" ? ((doc.widthMm - 2 * doc.marginMm) * b.widthPct) / 100 : undefined }));
  const seenBad = new Set<string>();
  for (const it of items) {
    for (const t of [it.text, it.value]) if (t) for (const n of unknownTokens(t, kind)) if (!seenBad.has(n)) { seenBad.add(n); out.push(`{${n}} is not a known field, so it prints as typed.`); }
    if (it.type === "barcode" && it.value) {
      const text = fillTokens(it.value, data).text;
      if (!code128Ok(text)) out.push(`The barcode "${text.slice(0, 20)}" cannot be drawn (1–40 plain letters / digits).`);
      else if (it.wMm) {
        const fit = barcodeDots(it.wMm, text);
        if (fit && fit.dotsPerModule < 2) out.push(`A barcode is too tight for a 203 dpi printer to scan (${r2(fit.moduleMm)} mm per bar, needs 0.25): make it wider or the text shorter.`);
      }
    }
  }
  if (doc.kind === "label") {
    for (const e of doc.els) {
      if (e.type === "qr" && Math.min(e.w, e.h) < 12) out.push("A QR code is under 12 mm: a phone may not read it.");
      if (e.type === "text" && e.size < 5 && !e.fit) out.push("Text under 5 pt is hard to read on a thermal label.");
      if (e.type === "image" && e.src === TINY_PNG) out.push("A picture box has no logo yet: choose a file for it or delete it.");
    }
  } else {
    for (const b of doc.blocks) {
      if (b.type === "image" && b.src === TINY_PNG) out.push("A picture block has no logo yet: choose a file for it or delete it.");
      if (b.type === "qr" && b.sizeMm < 12) out.push("A QR code is under 12 mm: a phone may not read it.");
    }
  }
  return Array.from(new Set(out));
}
