// Printers the person saved on this device ("Helett H30C - labels"): how it prints (mode, Bluetooth / USB
// device, printer language and darkness...) so the Print button can use it with no setup. Stored with the
// other print choices in this device's localStorage; every function here is pure.
import type { DirectCfg } from "@/lib/directPrint";
import { printMode, type PrintMode } from "@/lib/printHelper";

export type PrintKind = "label" | "slip";

export interface SavedPrinter {
  id: string;
  name: string;
  /** which pages it is for: label pages or slip / receipt pages */
  for: PrintKind;
  mode: PrintMode;
  /** Bluetooth / USB: how it was connected, and the id the browser knows it by */
  via?: "bluetooth" | "usb";
  deviceId?: string;
  /** Bluetooth / USB settings (language, darkness, gap...). Print width stays with the paper size. */
  cfg?: Partial<Omit<DirectCfg, "widthMm">>;
  /** printer name inside the print helper (This PC's helper mode) */
  helper?: string;
}

export interface PrinterBook {
  printers: SavedPrinter[];
  /** default printer id per kind */
  defaults: { label?: string; slip?: string };
}

export const MAX_PRINTERS = 12;
export const emptyBook = (): PrinterBook => ({ printers: [], defaults: {} });

export const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "");

/** Read whatever was stored; anything damaged is dropped instead of breaking the page. */
export function readBook(raw: unknown): PrinterBook {
  const book = emptyBook();
  if (!raw || typeof raw !== "object") return book;
  const r = raw as { printers?: unknown; defaults?: { label?: unknown; slip?: unknown } };
  if (Array.isArray(r.printers)) {
    for (const p of r.printers.slice(0, MAX_PRINTERS)) {
      if (!p || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      const name = cleanName(q.name);
      if (typeof q.id !== "string" || !q.id || !name) continue;
      if (q.for !== "label" && q.for !== "slip") continue;
      const sp: SavedPrinter = { id: q.id, name, for: q.for, mode: printMode(typeof q.mode === "string" ? q.mode : undefined) };
      if (q.via === "bluetooth" || q.via === "usb") sp.via = q.via;
      if (typeof q.deviceId === "string") sp.deviceId = q.deviceId.slice(0, 120);
      if (q.cfg && typeof q.cfg === "object") sp.cfg = q.cfg as SavedPrinter["cfg"];
      if (typeof q.helper === "string") sp.helper = q.helper.slice(0, 120);
      book.printers.push(sp);
    }
  }
  for (const k of ["label", "slip"] as const) {
    const id = r.defaults?.[k];
    if (typeof id === "string" && book.printers.some((p) => p.id === id && p.for === k)) book.defaults[k] = id;
  }
  return book;
}

export const printersFor = (b: PrinterBook, kind: PrintKind) => b.printers.filter((p) => p.for === kind);
export const defaultPrinter = (b: PrinterBook, kind: PrintKind): SavedPrinter | null => {
  const id = b.defaults[kind];
  return (id && b.printers.find((p) => p.id === id && p.for === kind)) || null;
};

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Save a printer. The same name for the same kind updates that printer. The first printer saved for a kind
 * becomes its default. Returns the new book and the saved printer.
 */
export function savePrinter(b: PrinterBook, p: Omit<SavedPrinter, "id"> & { id?: string }): { book: PrinterBook; saved: SavedPrinter } {
  const name = cleanName(p.name);
  if (!name) throw new Error("Give the printer a name.");
  const existing = b.printers.find((x) => x.id === p.id) ?? b.printers.find((x) => x.for === p.for && x.name.toLowerCase() === name.toLowerCase());
  if (!existing && b.printers.length >= MAX_PRINTERS) throw new Error(`You can save up to ${MAX_PRINTERS} printers. Delete one first.`);
  const saved: SavedPrinter = { ...p, name, id: existing?.id ?? newId() };
  const printers = existing ? b.printers.map((x) => (x.id === existing.id ? saved : x)) : [...b.printers, saved];
  const defaults = { ...b.defaults };
  if (!defaults[saved.for]) defaults[saved.for] = saved.id;
  return { book: { printers, defaults }, saved };
}

export function removePrinter(b: PrinterBook, id: string): PrinterBook {
  const gone = b.printers.find((p) => p.id === id);
  const printers = b.printers.filter((p) => p.id !== id);
  const defaults = { ...b.defaults };
  if (gone && defaults[gone.for] === id) {
    const next = printers.find((p) => p.for === gone.for);
    if (next) defaults[gone.for] = next.id;
    else delete defaults[gone.for];
  }
  return { printers, defaults };
}

export function makeDefault(b: PrinterBook, id: string): PrinterBook {
  const p = b.printers.find((x) => x.id === id);
  return p ? { ...b, defaults: { ...b.defaults, [p.for]: id } } : b;
}

/** Update the saved settings of one printer (used when settings are changed while it is selected). */
export function patchPrinter(b: PrinterBook, id: string, patch: Partial<Omit<SavedPrinter, "id" | "for">>): PrinterBook {
  return { ...b, printers: b.printers.map((p) => (p.id === id ? { ...p, ...patch, cfg: patch.cfg ? { ...p.cfg, ...patch.cfg } : p.cfg } : p)) };
}

/** A new connection to the same physical printer (the browser may give a new id), keeping the name and settings. */
export const withDevice = (p: SavedPrinter, via: "bluetooth" | "usb", deviceId: string): SavedPrinter => ({ ...p, via, deviceId });
