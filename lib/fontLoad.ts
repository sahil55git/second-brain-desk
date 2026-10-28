// Browser-only font handling for the designer: makes the @font-face rules available, waits until the
// letters are ready, and builds the CSS that the picture maker embeds (a picture drawn through an SVG
// cannot see the page's fonts, so they travel inside it as data: URLs).
import { FONTS, fontFaceCss, fontOf, parseSpec, type FontNeed } from "@/lib/fonts";

let injected = false;

/** Adds the @font-face rules to the page once. */
export function injectFontFaces(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.id = "bd-fonts";
  style.textContent = fontFaceCss();
  document.head.appendChild(style);
}

const sampleOf = (n: FontNeed) => (n.id === "kannada" ? "ಕನ್ನಡ" : n.id === "hindi" ? "हिन्दी" : "Aa0");

/** Waits (at most `ms`) until every needed font file is loaded. Never throws: a missing font just falls back. */
export async function loadFonts(needs: FontNeed[], ms = 4000): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  injectFontFaces();
  const jobs = needs.map((n) => document.fonts.load(`${n.weight} 16px "${fontOf(n.id).family}"`, sampleOf(n)).catch(() => []));
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, ms))]);
}

const dataUrls = new Map<string, Promise<string>>();

function toDataUrl(url: string): Promise<string> {
  let p = dataUrls.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Font ${url} not found`);
        return r.blob();
      })
      .then(
        (b) =>
          new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(new Error("Could not read a font"));
            fr.readAsDataURL(b);
          })
      );
    p.catch(() => dataUrls.delete(url));
    dataUrls.set(url, p);
  }
  return p;
}

/** @font-face CSS with the font files inlined, for exactly the fonts named in the spec ("sans:400,kannada:700"). */
export async function fontEmbedCss(spec: string | null | undefined): Promise<string> {
  const needs = parseSpec(spec);
  const rules: string[] = [];
  for (const n of needs) {
    const def = FONTS.find((f) => f.id === n.id);
    const file = def?.files.find((f) => f.weight === n.weight);
    if (!def || !file) continue;
    const data = await toDataUrl(file.url);
    rules.push(`@font-face{font-family:"${def.family}";font-style:normal;font-weight:${n.weight};src:url("${data}") format("woff2")}`);
  }
  return rules.join("\n");
}
