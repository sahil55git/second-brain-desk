// Fonts the label / receipt designer can use. They are served from /public/fonts (same origin), so
// every device prints the same letters and the picture maker (html-to-image) can embed them.
// Pure data + string helpers; the browser-only loading is in lib/fontLoad.ts.

export const FONT_IDS = ["sans", "kannada", "hindi", "serif", "mono", "cond"] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface FontDef {
  id: FontId;
  /** shown in the font list */
  name: string;
  /** CSS family name used in @font-face */
  family: string;
  /** full font-family value (family + fallbacks) */
  stack: string;
  /** woff2 file per weight */
  files: { weight: 400 | 700; url: string }[];
  /** sample text drawn in the font in the list */
  sample: string;
}

const two = (base: string) => [
  { weight: 400 as const, url: `/fonts/${base}-400.woff2` },
  { weight: 700 as const, url: `/fonts/${base}-700.woff2` },
];

// Kannada and Devanagari letters missing from a Latin font are taken from these two.
const SCRIPTS = '"BD Kannada", "BD Devanagari"';

export const FONTS: FontDef[] = [
  { id: "sans", name: "Sans (Inter)", family: "BD Inter", stack: `"BD Inter", ${SCRIPTS}, Arial, sans-serif`, files: two("inter"), sample: "MAHADEV 0123" },
  { id: "cond", name: "Narrow (Oswald)", family: "BD Oswald", stack: `"BD Oswald", "BD Inter", ${SCRIPTS}, Arial, sans-serif`, files: two("cond"), sample: "MAHADEV 0123" },
  { id: "serif", name: "Serif (Merriweather)", family: "BD Merriweather", stack: `"BD Merriweather", ${SCRIPTS}, Georgia, serif`, files: two("serif"), sample: "Mahadev Traders" },
  { id: "mono", name: "Typewriter (Roboto Mono)", family: "BD Mono", stack: `"BD Mono", ${SCRIPTS}, "Courier New", monospace`, files: two("mono"), sample: "BRL-01  18.4" },
  { id: "kannada", name: "ಕನ್ನಡ (Noto Kannada)", family: "BD Kannada", stack: `"BD Kannada", "BD Inter", "BD Devanagari", Arial, sans-serif`, files: two("kannada"), sample: "ಮಹಾದೇವ ಟ್ರೇಡರ್ಸ್" },
  { id: "hindi", name: "हिन्दी / मराठी (Noto Devanagari)", family: "BD Devanagari", stack: `"BD Devanagari", "BD Inter", "BD Kannada", Arial, sans-serif`, files: two("devanagari"), sample: "महादेव ट्रेडर्स" },
];

export const fontOf = (id: string | null | undefined): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];
export const fontStack = (id: string | null | undefined) => fontOf(id).stack;
export const isFontId = (v: unknown): v is FontId => typeof v === "string" && (FONT_IDS as readonly string[]).includes(v);

/** @font-face rules for every font. `urlFor` lets the picture maker swap in data: URLs. */
export function fontFaceCss(urlFor: (url: string) => string = (u) => u): string {
  const out: string[] = [];
  for (const f of FONTS) {
    for (const file of f.files) {
      out.push(`@font-face{font-family:"${f.family}";font-style:normal;font-weight:${file.weight};font-display:swap;src:url("${urlFor(file.url)}") format("woff2")}`);
    }
  }
  return out.join("\n");
}

export type Weight = 400 | 700;
export interface FontNeed {
  id: FontId;
  weight: Weight;
}

const KANNADA = /[\u0C80-\u0CFF]/;
const DEVANAGARI = /[\u0900-\u097F]/;

/** The font files needed to draw this text in this font: the font itself, the Latin base for the script fonts, and a script font when the text has those letters. */
export function fontNeeds(font: string, bold: boolean, text: string): FontNeed[] {
  const weight: Weight = bold ? 700 : 400;
  const id = fontOf(font).id;
  const out: FontNeed[] = [{ id, weight }];
  if (id === "kannada" || id === "hindi") out.push({ id: "sans", weight });
  if (KANNADA.test(text) && id !== "kannada") out.push({ id: "kannada", weight });
  if (DEVANAGARI.test(text) && id !== "hindi") out.push({ id: "hindi", weight });
  return out;
}

/** "sans:400,kannada:700": the needs, without repeats, as a string that can sit in a data- attribute. */
export function needSpec(needs: FontNeed[]): string {
  const seen = new Set<string>();
  for (const n of needs) seen.add(`${n.id}:${n.weight}`);
  return Array.from(seen).sort().join(",");
}

export function parseSpec(spec: string | null | undefined): FontNeed[] {
  const out: FontNeed[] = [];
  for (const part of (spec ?? "").split(",")) {
    const [id, w] = part.split(":");
    if (isFontId(id) && (w === "400" || w === "700")) out.push({ id, weight: Number(w) as Weight });
  }
  return out;
}
