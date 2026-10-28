// Turns the labels / slips shown on the print page into PNG pictures at the printer's dpi,
// laid out on a canvas that is exactly the paper size. Used by the print helper path only
// (browser printing uses the page itself). Browser-only.
import { HELPER_DPI, pixelRatioFor } from "@/lib/printHelper";

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
  const out: string[] = [];
  for (const el of els) {
    const shot = await toPng(el, { pixelRatio: pixelRatioFor(dpi), backgroundColor: "#ffffff", skipFonts: true, style: { border: "none", margin: "0" } });
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
  return out;
}
