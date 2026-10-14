// Paper sizes for barrel labels (stickers) and weighment slips (receipts).
// Every size knows its print-dialog page rule so the browser prints at exactly that size.
// Any width x height in mm can also be typed in ("custom").

export interface PaperSize {
  /** url / saved value: a preset id, or "c50x25" for a typed size */
  id: string;
  name: string;
  note: string;
  /** width in mm */
  w: number;
  /** height in mm; null = roll paper (the printer cuts where the slip ends) */
  h: number | null;
  /** print-CSS class: "a4" and "thermal" are the two hand-tuned layouts, "gen" scales to any size */
  cls: "a4" | "thermal" | "gen";
  custom?: boolean;
}

const IN = 25.4;
const r1 = (n: number) => Math.round(n * 10) / 10;
const lbl = (id: string, name: string, note: string, w: number, h: number): PaperSize => ({ id, name, note, w, h, cls: id === "50x30" ? "thermal" : "gen" });

export const LABEL_SIZES: PaperSize[] = [
  lbl("4x6", "4 × 6 inch", "shipping-label size", r1(4 * IN), r1(6 * IN)),
  lbl("4x4", "4 × 4 inch", "large square", r1(4 * IN), r1(4 * IN)),
  lbl("100x50", "100 × 50 mm", "wide label", 100, 50),
  lbl("3x2", "3 × 2 inch", "", r1(3 * IN), r1(2 * IN)),
  lbl("75x50", "75 × 50 mm", "", 75, 50),
  lbl("50x75", "50 × 75 mm", "tall label", 50, 75),
  lbl("2x2", "2 × 2 inch", "small square", r1(2 * IN), r1(2 * IN)),
  lbl("50x50", "50 × 50 mm", "", 50, 50),
  lbl("50x30", "50 × 30 mm", "thermal roll", 50, 30),
  lbl("50x25", "50 × 25 mm", "thermal roll", 50, 25),
  lbl("40x30", "40 × 30 mm", "", 40, 30),
  lbl("2x1", "2 × 1 inch", "", r1(2 * IN), r1(1 * IN)),
  lbl("38x25", "38 × 25 mm", "", 38, 25),
  lbl("30x20", "30 × 20 mm", "tiny", 30, 20),
  { id: "a4", name: "A4 sticker sheet", note: "21 per page", w: 210, h: 297, cls: "a4" },
];

const slip = (id: string, name: string, note: string, w: number, h: number | null): PaperSize => ({ id, name, note, w, h, cls: id === "80mm" ? "thermal" : id === "a4" ? "a4" : "gen" });
export const SLIP_SIZES: PaperSize[] = [
  slip("80mm", "80 mm roll", "receipt printer", 80, null),
  slip("58mm", "58 mm roll", "small receipt printer", 58, null),
  slip("50mm", "50 mm roll", "narrow roll", 50, null),
  slip("4x6", "4 × 6 inch", "label printer, one slip per sheet", r1(4 * IN), r1(6 * IN)),
  slip("100x75", "100 × 75 mm", "", 100, 75),
  slip("50x75", "50 × 75 mm", "", 50, 75),
  slip("2x2", "2 × 2 inch", "short slip: barrel, gross, tare, net", r1(2 * IN), r1(2 * IN)),
  slip("a5", "A5", "", 148, 210),
  slip("a4", "A4 paper", "2 slips across", 210, 297),
];

const MM_MAX = 300;
const mm = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 10 && n <= MM_MAX ? r1(n) : null;
};

/** A typed size: "c50x25" (label) or "c58x0" / "c58" (roll slip, height optional). */
export function customSize(w: number | string, h: number | string | null, roll = false): PaperSize | null {
  const cw = mm(String(w));
  const ch = h == null || h === "" || Number(h) === 0 ? null : mm(String(h));
  if (cw == null || (!roll && ch == null) || (h != null && h !== "" && Number(h) !== 0 && ch == null)) return null;
  return { id: `c${cw}x${ch ?? 0}`, name: ch == null ? `${cw} mm roll` : `${cw} × ${ch} mm`, note: "custom", w: cw, h: ch, cls: "gen", custom: true };
}

function parse(list: PaperSize[], v: string | null | undefined, roll: boolean, fallback: string): PaperSize {
  const f = list.find((s) => s.id === fallback) as PaperSize;
  if (v === "thermal") return list.find((s) => s.id === (roll ? "80mm" : "50x30")) ?? f;
  const hit = list.find((s) => s.id === v);
  if (hit) return hit;
  const m = /^c(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(String(v || ""));
  return (m && customSize(m[1], m[2], roll)) || f;
}
/** Read a size from a URL / saved value. The old "thermal" value keeps working. */
export const labelSize = (v: string | null | undefined) => parse(LABEL_SIZES, v, false, "a4");
export const slipSize = (v: string | null | undefined) => parse(SLIP_SIZES, v, true, "80mm");

/** The @page rule for the print dialog. */
export function pageCss(s: PaperSize, kind: "label" | "slip"): string {
  if (s.id === "a4") return kind === "label" ? "@page { size: A4; margin: 8mm 6mm }" : "@page { size: A4; margin: 10mm }";
  if (kind === "label") return `@page { size: ${s.w}mm ${s.h}mm; margin: 0 }`;
  return `@page { size: ${s.w}mm ${s.h == null ? "auto" : `${s.h}mm`}; margin: ${s.w <= 60 ? 2 : 3}mm }`;
}

/** Layout numbers for the generic ("gen") label CSS. */
export function labelLayout(s: PaperSize) {
  const h = s.h ?? 30;
  const compact = h < 38;
  const sc = Math.max(0.55, Math.min(2.6, compact ? h / 30 : Math.min(s.w, h) / 50.8));
  return {
    compact,
    roomy: h >= 90,
    sc: r1(sc * 100) / 100,
    barH: r1(compact ? h * 0.36 : Math.min(h * 0.26, 52)),
    qr: r1(compact ? h * 0.5 : Math.min(s.w * 0.3, 42)),
  };
}

/** Layout numbers for the generic slip CSS. */
export function slipLayout(s: PaperSize) {
  const margin = s.w <= 60 ? 2 : 3;
  return {
    inner: r1(s.w - margin * 2),
    ss: Math.max(0.8, Math.min(1.4, r1(s.w / 80 * 100) / 100)),
    short: s.h != null && s.h <= 60,
    fixed: s.h != null,
  };
}

// ---------------------------------------------------------------------------
// Printer set-up help
// ---------------------------------------------------------------------------
export type PrinterType = "label" | "receipt" | "laser" | "bluetooth";
export const PRINTER_TYPES: { id: PrinterType; name: string }[] = [
  { id: "label", name: "Thermal label printer (USB / network)" },
  { id: "receipt", name: "Receipt printer (58 / 80 mm)" },
  { id: "laser", name: "Laser / inkjet printer (A4)" },
  { id: "bluetooth", name: "Bluetooth printer / phone" },
];

// ---------------------------------------------------------------------------
// Printers this shop uses. Picking one sets the type, remembers the name, suggests sizes and
// warns when a chosen size is wider than the printer can print.
// ---------------------------------------------------------------------------
export interface PrinterModel {
  id: string;
  name: string;
  type: PrinterType;
  /** widest paper the printer takes, mm (from the maker's / retailer's spec) */
  maxWidth: number;
  /** size ids to suggest, first one is the default */
  labelSizes?: string[];
  slipSizes?: string[];
  about: string;
  setup: string[];
}
export const PRINTER_MODELS: PrinterModel[] = [
  {
    id: "h30c",
    name: "Helett (Rapid Label) Neo H30C",
    type: "label",
    maxWidth: 108,
    labelSizes: ["50x30", "50x25", "50x75", "75x50", "100x50", "4x6"],
    slipSizes: ["4x6", "100x75", "50x75"],
    about: "Direct-thermal label printer, USB, 203 dpi, labels about 27 to 108 mm wide (no ribbon needed). Listed specs; check your unit's box if it differs.",
    setup: [
      "Install the Helett H30C driver (Windows) from Helett's support page, then connect it by USB and switch it on. It then appears in the Printers list.",
      "Load direct-thermal labels with gaps. Slide the paper guides to touch the label edges.",
      "In the driver's Printing preferences set the stock to the label size shown here (create a user-defined size if it is not listed), media type \"labels with gaps\", direction normal.",
      "Run the printer's gap / label calibration once after changing label rolls (hold the feed button as in the manual, or use the driver's Calibrate button).",
      "Set darkness about medium and speed medium; very high speed makes barcodes faint. Always scan one printed label with a phone before printing the whole lot.",
    ],
  },
  {
    id: "posiflow80b",
    name: "POSIFLOW Thermal Receipt Printer 80B",
    type: "receipt",
    maxWidth: 80,
    slipSizes: ["80mm", "58mm"],
    about: "80 mm direct-thermal receipt printer. It prints on a continuous roll, so use the 80 mm roll size for slips. It cannot print gap labels.",
    setup: [
      "Install the POSIFLOW 80B driver (from the maker or the CD / link in the box), connect it by USB (or the network / Bluetooth port your unit has) and switch it on.",
      "Load an 80 mm thermal roll with the shiny (heat-sensitive) side facing out.",
      "In the driver set paper to 80 mm roll (\"80mm × Receipt\" / continuous) and cut mode to cut after each page if your unit has the cutter.",
      "If the print comes out cut off at the edges, choose the 80 mm roll size here and set margins to none in the print window; if it is too small, check scale is 100%.",
      "Barrel labels do not suit this printer: use it for the weighment slips and receipts (Print slips page). Use the H30C for barrel stickers.",
    ],
  },
];
export const printerModel = (id: string | undefined) => PRINTER_MODELS.find((m) => m.id === id);
