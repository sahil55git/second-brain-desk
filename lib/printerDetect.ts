// "Print to: [★ Helett H30C · USB ▾]" — the printers a print page can use right now, in one list:
// the printers saved on this device, the ones the browser can already reach without asking (USB and
// Bluetooth printers allowed before, the print helper on this PC, the shop PC's printer queue), and
// Chrome's own print window. The list is built by a pure function so it can be tested; detect() does
// the looking in the browser and never opens a chooser or a permission prompt.
import type { PrintMode } from "@/lib/printHelper";
import { defaultPrinter, makeDefault, printersFor, savePrinter, type PrintKind, type PrinterBook, type SavedPrinter } from "@/lib/savedPrinters";

export type OptionSource = "saved" | "usb" | "bluetooth" | "helper" | "queue" | "share" | "window";

export interface PrinterOption {
  /** stable key: saved:<id>, usb:<vendor>:<product>, bt:<id>, helper:<printer>, queue, share, window */
  key: string;
  source: OptionSource;
  name: string;
  /** short line under the name: "USB · plugged in", "Bluetooth", "Shop PC · on" */
  detail: string;
  /** how printing with it works */
  mode: PrintMode;
  /** true = seen right now, false = known but not reachable now, null = cannot tell until Print */
  ready: boolean | null;
  saved?: SavedPrinter;
  isDefault?: boolean;
  via?: "usb" | "bluetooth";
  deviceId?: string;
  helper?: string;
}

export interface Detected {
  usb: { deviceId: string; name: string }[];
  bluetooth: { id: string; name: string }[];
  /** print helper on this PC: null = not looked for (never used here), else running or not, and its printers */
  helper: { running: boolean; printers: string[] } | null;
  /** shop PC printer queue: null = could not ask */
  queue: { online: boolean; labelPrinter: string; slipPrinter: string } | null;
}
export const nothingDetected = (): Detected => ({ usb: [], bluetooth: [], helper: null, queue: null });

const MODE_NAME: Record<PrintMode, string> = {
  window: "Print window",
  direct: "Bluetooth / USB",
  queue: "Shop printer",
  share: "Share to app",
  oneclick: "One-click",
  helper: "PC helper",
};

/** Does this printer name look like one for labels (or for slips)? Used to put the likely one first. */
export function suitsKind(name: string, kind: PrintKind): boolean {
  return kind === "label" ? /h30c|helett|label|tsc|zebra|xprinter|godex|tsp|sticker|barcode/i.test(name) : /posiflow|receipt|pos|thermal|58|80|slip|epson|rp/i.test(name);
}

export function savedDetail(p: SavedPrinter, d: Detected): { detail: string; ready: boolean | null } {
  if (p.mode === "direct") {
    if (p.via === "usb") {
      const here = !!p.deviceId && d.usb.some((u) => u.deviceId === p.deviceId);
      return { detail: here ? "USB · plugged in" : "USB · not plugged in", ready: here };
    }
    if (p.via === "bluetooth") {
      const known = !!p.deviceId && d.bluetooth.some((b) => b.id === p.deviceId);
      return { detail: known ? "Bluetooth · known" : "Bluetooth · connects on Print", ready: known ? true : null };
    }
    return { detail: "Bluetooth / USB", ready: null };
  }
  if (p.mode === "helper") {
    if (!d.helper) return { detail: "PC helper", ready: null };
    if (!d.helper.running) return { detail: "PC helper · not running", ready: false };
    const has = !p.helper || d.helper.printers.includes(p.helper);
    return { detail: has ? "PC helper · ready" : "PC helper · printer missing", ready: has };
  }
  if (p.mode === "queue") {
    if (!d.queue) return { detail: "Shop printer", ready: null };
    return { detail: d.queue.online ? "Shop PC · on" : "Shop PC · off (prints when it starts)", ready: d.queue.online };
  }
  return { detail: MODE_NAME[p.mode], ready: null };
}

/**
 * Everything this page can print to, best first: the default saved printer, other saved printers,
 * printers found but not saved yet (the likely one for this page first), then the print window.
 */
export function buildOptions(book: PrinterBook, kind: PrintKind, d: Detected, extra: { share?: boolean } = {}): PrinterOption[] {
  const mine = printersFor(book, kind);
  const def = defaultPrinter(book, kind);
  const out: PrinterOption[] = [];
  const ordered = def ? [def, ...mine.filter((p) => p.id !== def.id)] : mine;
  for (const p of ordered) {
    const s = savedDetail(p, d);
    out.push({ key: `saved:${p.id}`, source: "saved", name: p.name, detail: s.detail, ready: s.ready, mode: p.mode, saved: p, isDefault: p.id === def?.id, via: p.via, deviceId: p.deviceId, helper: p.helper });
  }
  const savedUsb = new Set(mine.filter((p) => p.via === "usb" && p.deviceId).map((p) => p.deviceId));
  const savedBt = new Set(mine.filter((p) => p.via === "bluetooth" && p.deviceId).map((p) => p.deviceId));
  const savedHelper = new Set(mine.filter((p) => p.mode === "helper" && p.helper).map((p) => p.helper));
  const hasQueue = mine.some((p) => p.mode === "queue");
  const found: PrinterOption[] = [];
  for (const u of d.usb) if (!savedUsb.has(u.deviceId)) found.push({ key: u.deviceId, source: "usb", name: u.name, detail: "USB · plugged in · new", ready: true, mode: "direct", via: "usb", deviceId: u.deviceId });
  for (const b of d.bluetooth) if (!savedBt.has(b.id)) found.push({ key: `bt:${b.id}`, source: "bluetooth", name: b.name, detail: "Bluetooth · used before", ready: true, mode: "direct", via: "bluetooth", deviceId: b.id });
  if (d.helper?.running) for (const h of d.helper.printers) if (!savedHelper.has(h)) found.push({ key: `helper:${h}`, source: "helper", name: h, detail: "Installed on this PC · via PC helper", ready: true, mode: "helper", helper: h });
  if (d.queue && !hasQueue) {
    const pn = kind === "label" ? d.queue.labelPrinter : d.queue.slipPrinter;
    found.push({ key: "queue", source: "queue", name: pn ? `Shop PC: ${pn}` : "Shop PC printer", detail: d.queue.online ? "Shop PC · on" : "Shop PC · off (prints when it starts)", ready: d.queue.online, mode: "queue" });
  }
  // the likely printer for this page first, then the ones that are there right now
  found.sort((a, b) => Number(suitsKind(b.name, kind)) - Number(suitsKind(a.name, kind)) || Number(b.ready === true) - Number(a.ready === true));
  out.push(...found);
  if (extra.share && !mine.some((p) => p.mode === "share")) out.push({ key: "share", source: "share", name: "Share to printer app", detail: "Picture at the exact size, for the printer's own app", ready: null, mode: "share" });
  if (!mine.some((p) => p.mode === "window")) out.push({ key: "window", source: "window", name: "Print window", detail: "Chrome's window · choose the printer there", ready: null, mode: "window" });
  return out;
}

/**
 * Which option the page starts on: the one used last (if it is still in the list), else the default saved
 * printer, else a printer found right now that suits this page, else any one found, else the print window.
 */
export function pickInitial(options: PrinterOption[], kind: PrintKind, lastKey?: string): PrinterOption | null {
  if (!options.length) return null;
  const last = lastKey ? options.find((o) => o.key === lastKey) : undefined;
  if (last) return last;
  const def = options.find((o) => o.isDefault);
  if (def) return def;
  const fresh = options.filter((o) => o.source !== "saved" && o.source !== "window" && o.source !== "share" && o.ready === true);
  return fresh.find((o) => suitsKind(o.name, kind)) ?? fresh[0] ?? options.find((o) => o.source === "window") ?? options[0];
}

/** Name to save a newly used printer under, avoiding a name already taken for this kind. */
export function nameForNew(o: PrinterOption, book: PrinterBook, kind: PrintKind): string {
  const base = (o.source === "queue" ? o.name : o.name.replace(/^Shop PC: /, "")).slice(0, 34) || (kind === "label" ? "Label printer" : "Slip printer");
  const taken = new Set(printersFor(book, kind).map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 20; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return `${base} ${Date.now() % 1000}`;
}

// ---------------------------------------------------------------------------
// Browser: look for printers without asking anything
// ---------------------------------------------------------------------------
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Look around. The print helper (a program on this PC) is only asked when it was used here before
 * (`helperCode` set), so other devices never get Chrome's "allow local network" question.
 */
export async function detect(opts: { helperCode?: string; askQueue?: boolean }): Promise<Detected> {
  const { knownUsbPrinters, knownBluetoothPrinters, usbDeviceId, usbLabel, usbLooksLikePrinter, nativePrinters } = await import("@/lib/directPrint");
  const { isNative } = await import("@/lib/native");
  if (isNative()) {
    // the Android app: the phone's paired Bluetooth printers and plugged-in USB printers
    const list = await nativePrinters();
    return {
      usb: list.filter((p) => p.kind === "usb").map((p) => ({ deviceId: p.id, name: p.name })),
      bluetooth: list.filter((p) => p.kind === "bluetooth").map((p) => ({ id: p.id, name: p.name })),
      helper: null,
      queue: opts.askQueue === false ? null : await (await import("@/lib/printHelper")).fetchQueue(1).then((q) => (q.agent.lastSeen || q.agent.online ? { online: q.agent.online, labelPrinter: q.agent.labelPrinter, slipPrinter: q.agent.slipPrinter } : null)).catch(() => null),
    };
  }
  const { pingHelper, helperPrinters, pairingCodeOk, fetchQueue } = await import("@/lib/printHelper");
  const [usb, bluetooth, helper, queue] = await Promise.all([
    knownUsbPrinters().then((l) => l.filter(usbLooksLikePrinter).map((d) => ({ deviceId: usbDeviceId(d.vendorId, d.productId), name: usbLabel(d) }))),
    knownBluetoothPrinters(),
    opts.helperCode
      ? withTimeout(pingHelper(), 1500)
          .then(async () => ({ running: true, printers: pairingCodeOk(opts.helperCode!) ? (await helperPrinters(opts.helperCode!).catch(() => ({ printers: [] as string[] }))).printers : [] }))
          .catch(() => ({ running: false, printers: [] as string[] }))
      : Promise.resolve(null),
    opts.askQueue === false
      ? Promise.resolve(null)
      : withTimeout(fetchQueue(1), 4000)
          .then((q) => (q.agent.lastSeen || q.agent.online ? { online: q.agent.online, labelPrinter: q.agent.labelPrinter, slipPrinter: q.agent.slipPrinter } : null))
          .catch(() => null),
  ]);
  // the same USB printer can show up twice (two interfaces): keep one
  const seen = new Set<string>();
  return { usb: usb.filter((u) => (seen.has(u.deviceId) ? false : (seen.add(u.deviceId), true))), bluetooth, helper, queue };
}

// ---------------------------------------------------------------------------
// One-click set-up finished: save the helper's printers as this device's defaults
// ---------------------------------------------------------------------------
const NOT_A_SHOP_PRINTER = /pdf|xps|onenote|fax|send to|document writer/i;

/**
 * The print helper has just started with the printers installed on this PC. Save the label printer and
 * the receipt printer it found as "PC helper" printers and make them the defaults, so Print on the
 * label pages and on the slip pages goes straight to them with no window. Returns the book and the
 * saved printer per kind (none when no printer suits that kind).
 */
export function bookWithHelper(book: PrinterBook, printers: string[]): { book: PrinterBook; picks: Partial<Record<PrintKind, SavedPrinter>> } {
  const real = printers.filter((p) => p && !NOT_A_SHOP_PRINTER.test(p));
  const picks: Partial<Record<PrintKind, SavedPrinter>> = {};
  let b = book;
  const label = real.find((p) => suitsKind(p, "label"));
  const slip = real.find((p) => p !== label && suitsKind(p, "slip")) ?? real.find((p) => p !== label && !suitsKind(p, "label"));
  const want: [PrintKind, string | undefined][] = [["label", label ?? (real.length === 1 ? real[0] : undefined)], ["slip", slip]];
  for (const [k, pn] of want) {
    if (!pn) continue;
    try {
      const r = savePrinter(b, { name: pn.slice(0, 34), for: k, mode: "helper", helper: pn });
      b = makeDefault(r.book, r.saved.id);
      picks[k] = r.saved;
    } catch {
      /* the device has 12 printers saved already */
    }
  }
  return { book: b, picks };
}
