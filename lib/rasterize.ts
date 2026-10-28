// Turns the labels / slips shown on the print page into PNG pictures at the printer's dpi,
// laid out on a canvas that is exactly the paper size. Used by the print helper path only
// (browser printing uses the page itself). Browser-only.
import { HELPER_DPI, pixelRatioFor } from "@/lib/printHelper";
import { fontEmbedCss, loadFonts } from "@/lib/fontLoad";
import { parseSpec } from "@/lib/fonts";

export interface RasterOpts {
  /** CSS selector of the things to print, one picture each (".bd-label" / ".bd-slip") */
  selector: string;
  paperWidthMm: number;
  /** null = roll paper: the picture is as tall as the slip */
  paperHeightMm: number | null;
  /** white border the slip CSS leaves around its content (the @page margin); 0 for labels */
  marginMm?: number;
  dpi?: number;
}

const mmToPx = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not draw the label as a picture."));
    img.src = src;
  });
}

/** Returns data:image/png URLs, one per matching element, in page order. */
export async function rasterize(opts: RasterOpts): Promise<string[]> {
  const dpi = opts.dpi ?? HELPER_DPI;
  const els = Array.from(document.querySelectorAll<HTMLElement>(opts.selector));
  if (!els.length) throw new Error("There is nothing on the page to print.");
  const { toPng } = await import("html-to-image");
  const margin = opts.marginMm ?? 0;
  // designer layouts name the fonts they draw (data-fonts="sans:400,kannada:700"): load them, wait for the
  // text to refit, and embed them in the picture (a picture made through SVG cannot see the page's fonts)
  const spec = Array.from(new Set(els.flatMap((e) => Array.from(e.querySelectorAll<HTMLElement>("[data-fonts]")).concat(e.matches("[data-fonts]") ? [e] : []).map((n) => n.dataset.fonts ?? "")))).join(",");
  const fontCss = spec ? await fontEmbedCss(spec).catch(() => "") : "";
  if (spec) {
    await loadFonts(parseSpec(spec));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  const out: string[] = [];
  // the preview may be zoomed on screen; the picture is always made at real size
  const staged = Array.from(document.querySelectorAll<HTMLElement>(".bd-stage > *")).map((e) => [e, e.style.zoom] as const);
  staged.forEach(([e]) => (e.style.zoom = "1"));
  try {
    await rasterAll(els, opts, dpi, margin, toPng, out, fontCss);
  } finally {
    staged.forEach(([e, z]) => (e.style.zoom = z));
  }
  return out;
}

async function rasterAll(els: HTMLElement[], opts: RasterOpts, dpi: number, margin: number, toPng: typeof import("html-to-image").toPng, out: string[], fontCss: string) {
  for (const el of els) {
    const shot = await toPng(el, { pixelRatio: pixelRatioFor(dpi), backgroundColor: "#ffffff", ...(fontCss ? { fontEmbedCSS: fontCss } : { skipFonts: true }), style: { border: "none", margin: "0" } });
    const img = await loadImage(shot);
    const cw = mmToPx(opts.paperWidthMm, dpi);
    const ox = mmToPx(margin, dpi);
    const ch = opts.paperHeightMm == null ? img.height + 2 * ox : mmToPx(opts.paperHeightMm, dpi);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("This browser cannot make the picture.");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = false;
    // labels already fill the paper; slips sit inside the margin
    const dw = Math.min(img.width, cw - ox);
    g.drawImage(img, ox, ox, dw, Math.min(img.height, ch - ox));
    out.push(canvas.toDataURL("image/png"));
  }
}
