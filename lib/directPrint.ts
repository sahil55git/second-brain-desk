// Printing straight from this phone / tablet / PC to a thermal printer over Bluetooth or USB,
// with no shop PC and no driver. The browser opens the printer itself (Web Bluetooth / WebUSB, Chrome
// and Edge only, https only) and sends the printer commands built in printerLang.ts.
// The pure parts (picking the write channel, chunked sending, error wording, defaults) are tested in
// lib/__tests__/directPrint.test.ts; the browser parts need a real printer and are checked with the Test label.
import { mmToDots, toMono, type Mono, type PrinterLang } from "@/lib/printerLang";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export interface DirectCfg {
  lang: PrinterLang;
  /** print darkness 0-15 */
  density: number;
  /** gap between labels in mm (0 = continuous roll) */
  gapMm: number;
  /** width the printer can really print, mm (72 for an 80 mm receipt roll, 48 for 58 mm) */
  widthMm: number;
  /** TSPL: send 0 = black; turn off if the label comes out inverted */
  invert: boolean;
  /** grey level (0-255) below which a pixel prints black */
  threshold: number;
  /** bytes per Bluetooth write; smaller is slower but safer */
  chunk: number;
  /** pause between writes, ms */
  delay: number;
  /** a Bluetooth service id to look in, for a printer that is not found with the usual ones */
  service: string;
}

export const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** Sensible starting settings for a label or a slip of this width. */
export function directDefaults(kind: "label" | "slip", paperWidthMm: number): DirectCfg {
  const receipt = kind === "slip" && paperWidthMm <= 82;
  return {
    lang: receipt ? "escpos" : "tspl",
    density: 8,
    gapMm: receipt ? 0 : 3,
    widthMm: receipt ? (paperWidthMm >= 76 ? 72 : paperWidthMm >= 56 ? 48 : paperWidthMm) : paperWidthMm,
    invert: true,
    threshold: 160,
    chunk: 100,
    delay: 20,
    service: "",
  };
}

/** Saved values laid over the defaults; anything missing or silly falls back. */
export function directConfig(kind: "label" | "slip", paperWidthMm: number, saved?: Partial<DirectCfg> | null): DirectCfg {
  const d = directDefaults(kind, paperWidthMm);
  const s = saved ?? {};
  return {
    lang: s.lang === "tspl" || s.lang === "escpos" || s.lang === "zpl" ? s.lang : d.lang,
    density: clampInt(s.density, 0, 15, d.density),
    gapMm: clampInt(s.gapMm, 0, 20, d.gapMm),
    widthMm: clampInt(s.widthMm, 20, 220, d.widthMm),
    invert: typeof s.invert === "boolean" ? s.invert : d.invert,
    threshold: clampInt(s.threshold, 40, 230, d.threshold),
    chunk: clampInt(s.chunk, 20, 512, d.chunk),
    delay: clampInt(s.delay, 0, 500, d.delay),
    service: typeof s.service === "string" ? s.service.trim().toLowerCase().slice(0, 40) : "",
  };
}

// ---------------------------------------------------------------------------
// What this browser can do
// ---------------------------------------------------------------------------
interface Nav {
  bluetooth?: unknown;
  usb?: unknown;
}
export interface DirectSupport {
  bluetooth: boolean;
  usb: boolean;
  /** the page is on https (or localhost), which both APIs insist on */
  secure: boolean;
}
export function directSupport(): DirectSupport {
  if (typeof navigator === "undefined") return { bluetooth: false, usb: false, secure: false };
  const n = navigator as unknown as Nav;
  return { bluetooth: !!n.bluetooth, usb: !!n.usb, secure: typeof window !== "undefined" ? window.isSecureContext : false };
}

/** Why direct printing is not available here, in plain words ("" = it is). */
export function unsupportedReason(s: DirectSupport, ua: string): string {
  if (s.bluetooth || s.usb) return "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone and iPad browsers cannot print to a Bluetooth or USB printer directly. Use Share to app, or Shop printer.";
  if (!s.secure) return "Open the app at its https:// address; browsers only allow Bluetooth and USB on a secure page.";
  return "This browser cannot talk to printers. Open the app in Chrome (or Edge) on Android, Windows, Mac or Linux. Firefox and Safari cannot.";
}

// ---------------------------------------------------------------------------
// Bluetooth: which characteristic to write to
// ---------------------------------------------------------------------------
const base = (n: number) => `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

/** Services label / receipt printers use for their print channel. Chrome only shows the services we name here. */
export const PRINTER_SERVICES: string[] = [
  base(0x18f0),
  base(0xffe0),
  base(0xff00),
  base(0xfff0),
  base(0xff12),
  base(0xfee7),
  base(0xae00),
  base(0xae30),
  base(0xff80),
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip transparent UART (many Chinese printers)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Bluetooth printer (Zebra / generic)
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

/** Characteristics that carry print data on the usual printers, best first. */
const GOOD_CHARS = [
  base(0xff02), // FF00 service
  base(0x2af1), // 18F0 service
  base(0xffe1), // FFE0 service
  base(0xfff2), // FFF0 service
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

export interface CharInfo {
  service: string;
  uuid: string;
  write: boolean;
  writeNoResponse: boolean;
}

/** The characteristic to send print data to: a known one first, else any writable one (no-response preferred, it is much faster). */
export function pickWriteChar(chars: CharInfo[]): CharInfo | null {
  const ok = chars.filter((c) => c.write || c.writeNoResponse);
  if (!ok.length) return null;
  for (const g of GOOD_CHARS) {
    const hit = ok.find((c) => c.uuid.toLowerCase() === g);
    if (hit) return hit;
  }
  return ok.find((c) => c.writeNoResponse) ?? ok[0];
}

export const shortId = (uuid: string) => (/^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/i.test(uuid) ? uuid.slice(4, 8).toUpperCase() : uuid);

// ---------------------------------------------------------------------------
// Sending bytes in small pieces
// ---------------------------------------------------------------------------
export interface Sink {
  write(chunk: Uint8Array): Promise<void>;
}
export interface SendOpts {
  chunk: number;
  delayMs?: number;
  /** smallest piece to fall back to when a write fails */
  minChunk?: number;
  onProgress?: (sent: number, total: number) => void;
  sleep?: (ms: number) => Promise<void>;
}
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Writes `bytes` to the sink piece by piece. When a write fails the piece size is halved (down to
 * `minChunk`) and the same piece is tried again, because the usual cause is a printer that cannot
 * take big writes. Returns the piece size that worked, so the caller can remember it.
 */
export async function sendBytes(sink: Sink, bytes: Uint8Array, o: SendOpts): Promise<number> {
  const min = Math.max(1, o.minChunk ?? 20);
  const wait = o.sleep ?? realSleep;
  let size = Math.max(min, o.chunk);
  let at = 0;
  while (at < bytes.length) {
    const end = Math.min(bytes.length, at + size);
    try {
      await sink.write(bytes.subarray(at, end));
    } catch (e) {
      if (size > min) {
        size = Math.max(min, Math.floor(size / 2));
        continue;
      }
      throw e;
    }
    at = end;
    o.onProgress?.(at, bytes.length);
    if (o.delayMs && at < bytes.length) await wait(o.delayMs);
  }
  return size;
}

// ---------------------------------------------------------------------------
// Retrying a Bluetooth link that drops while it is being set up
// ---------------------------------------------------------------------------
/** True for the errors a printer causes by hanging up mid-setup ("GATT Server is disconnected", NetworkError). */
export const isDroppedLink = (e: unknown) => {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return name === "NetworkError" || /disconnected|GATT/i.test(msg);
};

/**
 * Runs `attempt` up to `tries` times, pausing `waitMs * try` between, but only when the failure is a dropped link.
 * Any other error (not allowed, not found, cancelled) is thrown at once.
 */
export async function retryDropped<T>(
  attempt: (n: number) => Promise<T>,
  o: { tries?: number; waitMs?: number; sleep?: (ms: number) => Promise<void>; onRetry?: (n: number, e: unknown) => void } = {}
): Promise<T> {
  const tries = Math.max(1, o.tries ?? 3);
  const wait = o.sleep ?? realSleep;
  for (let n = 1; ; n++) {
    try {
      return await attempt(n);
    } catch (e) {
      if (n >= tries || !isDroppedLink(e)) throw e;
      o.onRetry?.(n, e);
      await wait((o.waitMs ?? 700) * n);
    }
  }
}

// ---------------------------------------------------------------------------
// Errors in plain words
// ---------------------------------------------------------------------------
export function explainError(e: unknown, via: "bluetooth" | "usb" | "print" = "print"): string {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (name === "NotFoundError" && /cancel|chosen|selected|user/i.test(msg)) return "No printer was chosen.";
  if (name === "NotFoundError" && via === "usb") return "No USB printer was found. Plug the printer in with an OTG cable, switch it on and try again.";
  if (name === "NotFoundError" && via === "bluetooth") return "No printer was found. Switch the printer on, close the printer's own app, make sure no other phone or PC is connected to it, and try again.";
  if (name === "SecurityError" || name === "NotAllowedError") return via === "usb" ? "The browser did not allow USB. Tap Connect again and choose the printer." : "The browser did not allow Bluetooth. Turn on Bluetooth and Location (Android needs both), allow 'Nearby devices' for Chrome, and tap Connect again.";
  if (name === "NetworkError") return "The printer connected and then hung up. It is probably still held by another phone, tablet or PC (close WePrint and switch Bluetooth off on the others), or by this tablet's own Bluetooth settings (tap Forget on it there). Then switch the printer off and on, and try again.";
  if (name === "InvalidStateError") return "The printer connection was lost. Tap Connect again.";
  if (name === "NotSupportedError") return "The printer did not accept that. Try another printer language.";
  if (/disconnected|GATT/i.test(msg)) return "The printer disconnected. Tap Connect again.";
  if (/claimInterface|Access denied|LIBUSB/i.test(msg)) return "Another program is holding the USB printer (on Windows its normal driver does). Use Bluetooth, the Print window, or the Shop printer instead.";
  return msg || "Printing did not work.";
}

// ---------------------------------------------------------------------------
// Connections (browser only)
// ---------------------------------------------------------------------------
export interface DirectConnection {
  kind: "bluetooth" | "usb";
  name: string;
  /** what was found on the printer, for the diagnostics panel */
  log: string[];
  sink: Sink;
  /** suggested piece size and pause for this link */
  chunk: number;
  delay: number;
  isOpen(): boolean;
  close(): Promise<void>;
}

// A tiny slice of the Web Bluetooth / WebUSB shapes, so this file compiles without extra type packages.
interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValue?(v: BufferSource): Promise<void>;
}
interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  getPrimaryServices(): Promise<BtService[]>;
  getPrimaryService(uuid: string): Promise<BtService>;
  disconnect(): void;
}
interface BtDevice {
  id: string;
  name?: string;
  gatt?: { connected: boolean; connect(): Promise<BtServer>; disconnect(): void };
  addEventListener(t: "gattserverdisconnected", f: () => void): void;
}
interface UsbEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
  packetSize: number;
}
interface UsbAlternate {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: UsbEndpoint[];
}
interface UsbInterface {
  interfaceNumber: number;
  alternates: UsbAlternate[];
}
interface UsbDevice {
  productName?: string;
  manufacturerName?: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  configuration: { configurationValue: number; interfaces: UsbInterface[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  selectAlternateInterface(n: number, alt: number): Promise<void>;
  transferOut(ep: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
}

let current: DirectConnection | null = null;
export const currentConnection = () => (current && current.isOpen() ? current : null);
export async function disconnectPrinter() {
  const c = current;
  current = null;
  if (c) await c.close().catch(() => {});
}

/** Open the Bluetooth chooser (must be called from a tap) and connect to the printer that is picked. */
export async function connectBluetooth(extraService = "", onLost?: () => void, onLog?: (lines: string[]) => void): Promise<DirectConnection> {
  const bt = (navigator as unknown as { bluetooth?: { requestDevice(o: unknown): Promise<BtDevice> } }).bluetooth;
  if (!bt) throw new Error("This browser has no Bluetooth printing. Use Chrome on Android or PC.");
  await disconnectPrinter();
  const services = [...PRINTER_SERVICES];
  const extra = extraService.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(extra)) services.push(base(parseInt(extra, 16)));
  else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(extra)) services.push(extra);
  const log: string[] = [];
  const say = (m: string) => {
    log.push(m);
    onLog?.([...log]);
  };
  const dev = await bt.requestDevice({ acceptAllDevices: true, optionalServices: services });
  say(`Chosen: ${dev.name || "(no name)"} [${dev.id.slice(0, 8)}…]`);
  if (!dev.gatt) throw new Error("This printer cannot be used over Bluetooth Low Energy.");
  const gatt = dev.gatt;
  const chars: CharInfo[] = [];
  const byKey = new Map<string, BtCharacteristic>();
  let found = 0;

  // Connect, give the printer a moment, then list its services. Some printers (and Android) drop the
  // link if it is asked too soon or the printer is busy; a dropped link is retried from the start.
  await retryDropped(
    async (n) => {
      chars.length = 0;
      byKey.clear();
      say(n === 1 ? "Connecting…" : `Connecting again (try ${n})…`);
      const server = await gatt.connect();
      say("Connected. Waiting a moment…");
      await realSleep(n === 1 ? 600 : 1200);
      if (!server.connected) throw Object.assign(new Error("GATT Server is disconnected."), { name: "NetworkError" });
      say("Looking for the print channel…");
      let list: BtService[] = [];
      try {
        list = await server.getPrimaryServices();
      } catch (e) {
        if (isDroppedLink(e)) throw e;
        say(`Service list not available (${e instanceof Error ? e.name : "error"}), asking for each known service…`);
      }
      if (!list.length) {
        // some printers only answer when asked for a service by id
        for (const id of services) {
          try {
            list.push(await server.getPrimaryService(id));
          } catch (e) {
            if (isDroppedLink(e)) throw e;
          }
        }
      }
      found = list.length;
      for (const sv of list) {
        say(`Service ${shortId(sv.uuid)}`);
        let cs: BtCharacteristic[] = [];
        try {
          cs = await sv.getCharacteristics();
        } catch (e) {
          if (isDroppedLink(e)) throw e;
          say("  (could not list its characteristics)");
        }
        for (const c of cs) {
          const info: CharInfo = { service: sv.uuid, uuid: c.uuid, write: c.properties.write, writeNoResponse: c.properties.writeWithoutResponse };
          say(`  ${shortId(c.uuid)}${info.write ? " write" : ""}${info.writeNoResponse ? " write-no-response" : ""}`);
          chars.push(info);
          byKey.set(`${sv.uuid}|${c.uuid}`, c);
        }
      }
    },
    {
      tries: 3,
      waitMs: 800,
      onRetry: (n, e) => {
        say(`The printer hung up (${e instanceof Error ? e.message : "disconnected"}).`);
        try {
          gatt.disconnect();
        } catch {}
      },
    }
  );
  if (!found) say("The printer showed no services we know. It may use a different service id, or it is a classic-Bluetooth-only printer.");
  const pick = pickWriteChar(chars);
  if (!pick) {
    try {
      gatt.disconnect();
    } catch {}
    throw new Error(
      found
        ? "Connected, but the printer has no channel to write to. Open the diagnostics and send them to the developer."
        : "Connected, but this printer does not show a print channel over Bluetooth Low Energy. Try the USB cable, or enter its service id under Advanced."
    );
  }
  const ch = byKey.get(`${pick.service}|${pick.uuid}`)!;
  say(`Using ${shortId(pick.uuid)} (${pick.writeNoResponse ? "write without response" : "write"})`);
  const fast = pick.writeNoResponse && typeof ch.writeValueWithoutResponse === "function";
  const sink: Sink = {
    write: async (chunk) => {
      // copy: the browser wants its own buffer
      const data = chunk.slice();
      if (fast) await ch.writeValueWithoutResponse!(data);
      else if (ch.writeValueWithResponse) await ch.writeValueWithResponse(data);
      else await ch.writeValue!(data);
    },
  };
  let open = true;
  dev.addEventListener("gattserverdisconnected", () => {
    open = false;
    if (current === conn) current = null;
    onLost?.();
  });
  const conn: DirectConnection = {
    kind: "bluetooth",
    name: dev.name || "Bluetooth printer",
    log,
    sink,
    chunk: 100,
    delay: fast ? 20 : 5,
    isOpen: () => open && !!dev.gatt?.connected,
    close: async () => {
      open = false;
      try {
        dev.gatt?.disconnect();
      } catch {}
    },
  };
  current = conn;
  return conn;
}

/** USB printers already allowed for this site (no chooser needed). */
export async function knownUsbPrinters(): Promise<UsbDevice[]> {
  const usb = (navigator as unknown as { usb?: { getDevices(): Promise<UsbDevice[]> } }).usb;
  if (!usb) return [];
  try {
    return await usb.getDevices();
  } catch {
    return [];
  }
}

/** Open the USB chooser (from a tap) or reuse a printer already allowed, then claim its bulk-out channel. */
export async function connectUsb(device?: UsbDevice, onLost?: () => void): Promise<DirectConnection> {
  const usb = (navigator as unknown as { usb?: { requestDevice(o: unknown): Promise<UsbDevice>; addEventListener(t: string, f: (e: { device: UsbDevice }) => void): void } }).usb;
  if (!usb) throw new Error("This browser has no USB printing. Use Chrome on Android or PC.");
  await disconnectPrinter();
  const dev = device ?? (await usb.requestDevice({ filters: [{ classCode: 7 }, { classCode: 255 }] }));
  const label = [dev.manufacturerName, dev.productName].filter(Boolean).join(" ") || `USB ${dev.vendorId.toString(16)}:${dev.productId.toString(16)}`;
  const log: string[] = [`Chosen: ${label}`];
  await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  const cfg = dev.configuration;
  if (!cfg) throw new Error("The USB printer gave no configuration.");
  let target: { iface: number; alt: number; ep: number } | null = null;
  for (const i of cfg.interfaces) {
    for (const a of i.alternates) {
      const out = a.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      log.push(`Interface ${i.interfaceNumber} class ${a.interfaceClass}${out ? ` · bulk-out ${out.endpointNumber}` : ""}`);
      if (out && (!target || a.interfaceClass === 7)) target = { iface: i.interfaceNumber, alt: a.alternateSetting, ep: out.endpointNumber };
    }
  }
  if (!target) {
    await dev.close().catch(() => {});
    throw new Error("This USB device has no printing channel.");
  }
  await dev.claimInterface(target.iface);
  if (target.alt) await dev.selectAlternateInterface(target.iface, target.alt);
  log.push(`Using interface ${target.iface}, endpoint ${target.ep}`);
  let open = true;
  usb.addEventListener("disconnect", (e) => {
    if (e.device === dev) {
      open = false;
      if (current === conn) current = null;
      onLost?.();
    }
  });
  const conn: DirectConnection = {
    kind: "usb",
    name: label,
    log,
    sink: {
      write: async (chunk) => {
        const r = await dev.transferOut(target!.ep, chunk.slice());
        if (r.status !== "ok") throw new Error(`USB transfer ${r.status}`);
      },
    },
    chunk: 16384,
    delay: 0,
    isOpen: () => open && dev.opened,
    close: async () => {
      open = false;
      try {
        await dev.releaseInterface(target!.iface);
      } catch {}
      try {
        await dev.close();
      } catch {}
    },
  };
  current = conn;
  return conn;
}

// ---------------------------------------------------------------------------
// Picture -> 1-bit at the printer's size (browser only)
// ---------------------------------------------------------------------------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not read the label picture."));
    img.src = src;
  });
}

/** Dots across for a print width in mm, a whole number of bytes. */
export const dotsAcross = (widthMm: number) => Math.max(8, Math.round(mmToDots(widthMm) / 8) * 8);

/** Scale a picture to `widthDots` (height keeps the shape) and turn it into black and white dots. */
export async function monoFromDataUrl(url: string, widthDots: number, threshold = 160): Promise<Mono> {
  const img = await loadImage(url);
  const w = widthDots;
  const h = Math.max(1, Math.round((img.height * w) / img.width));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the label.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return toMono(ctx.getImageData(0, 0, w, h).data, w, h, threshold);
}
