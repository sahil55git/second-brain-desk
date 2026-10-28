// Talking to the print helper (tools/print_helper.py) that runs on the shop PC, and the
// "one-click" Chrome shortcut. Pure functions are tested in lib/__tests__/printHelper.test.ts.

export const HELPER_PORT = 9101;
export const HELPER_DPI = 203; // the Helett H30C and most label / receipt printers are 203 dpi
export const MAX_COPIES = 50;

export type PrintMode = "window" | "share" | "oneclick" | "helper";
export const PRINT_MODES: { id: PrintMode; name: string; note: string }[] = [
  { id: "window", name: "Print window", note: "Chrome's usual print window. Works on any device." },
  { id: "share", name: "Phone / tablet", note: "Makes a picture at the exact label size and sends it to your printer's app (Bluetooth printers)." },
  { id: "oneclick", name: "One-click", note: "No window. Needs the special Chrome shortcut on the shop PC." },
  { id: "helper", name: "Print helper", note: "Exact paper size, straight to the chosen printer. Needs the helper program on the shop PC." },
];
export const printMode = (v: string | null | undefined): PrintMode => (v === "share" || v === "oneclick" || v === "helper" ? v : "window");
/** A phone or tablet (Android / iPad / iPhone): the first time, start in the Phone / tablet mode. */
export const isTouchDeviceUA = (ua: string) => /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

/** File name for a saved / shared picture: BRL-01-label-50x75mm.png */
export function pictureName(base: string, kind: "label" | "slip", wMm: number, hMm: number | null, n: number, total: number): string {
  const safe = base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "print";
  const dim = `${Math.round(wMm * 10) / 10}x${hMm == null ? "roll" : Math.round(hMm * 10) / 10}mm`;
  return `${safe}-${kind}-${dim}${total > 1 ? `-${String(n).padStart(2, "0")}` : ""}.png`;
}

export const clampCopies = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(MAX_COPIES, v)) : 1;
};

/** Pairing codes look like 3FA9-0C1B-77DE-92A4; people type them, so be forgiving. */
export function cleanPairingCode(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-F]/g, "").replace(/(.{4})(?=.)/g, "$1-").slice(0, 19);
}
export const pairingCodeOk = (v: string) => /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(v);

/** CSS pixels (96 per inch) a paper size covers on screen. */
export const mmToCssPx = (mm: number) => (mm * 96) / 25.4;
/** html-to-image pixelRatio that gives a bitmap at the printer's dpi. */
export const pixelRatioFor = (dpi: number = HELPER_DPI) => dpi / 96;

export interface HelperItem {
  png: string; // base64, no data: prefix
  widthMm: number;
  heightMm: number | null; // null = roll paper, length from the picture
}
export interface HelperJob {
  printer: string;
  copies: number;
  items: HelperItem[];
  title?: string;
}

export const stripDataUrl = (u: string) => u.replace(/^data:image\/png;base64,/, "");

export function buildHelperJob(opts: { printer: string; copies: number; widthMm: number; heightMm: number | null; pngs: string[]; title?: string }): HelperJob {
  return {
    printer: opts.printer.trim(),
    copies: clampCopies(opts.copies),
    title: opts.title,
    items: opts.pngs.map((p) => ({ png: stripDataUrl(p), widthMm: opts.widthMm, heightMm: opts.heightMm })),
  };
}

export const helperUrl = (port: number = HELPER_PORT) => `http://127.0.0.1:${port}`;

export type HelperState = "unknown" | "off" | "on";
export interface HelperPing {
  ok: boolean;
  name: string;
  version: string;
  dryRun: boolean;
}

async function call<T>(path: string, init: RequestInit & { code?: string; port?: number } = {}): Promise<T> {
  const { code, port, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (code) headers["X-Print-Code"] = code;
  let res: Response;
  try {
    res = await fetch(`${helperUrl(port)}${path}`, { ...rest, headers, cache: "no-store" });
  } catch {
    throw new Error("The print helper is not running on this computer. Start it (py tools/print_helper.py), or allow this site to connect to local devices if Chrome asks.");
  }
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!res.ok || j.ok === false) throw new Error(j.error || `Print helper error ${res.status}`);
  return j;
}

export const pingHelper = (port?: number) => call<HelperPing>("/ping", { port });
export const helperPrinters = (code: string, port?: number) => call<{ printers: string[]; default: string }>("/printers", { code, port });
export const sendToHelper = (job: HelperJob, code: string, port?: number) =>
  call<{ printed: number; copies: number; dryRun: boolean }>("/print", { method: "POST", code, port, headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });

// ---------------------------------------------------------------------------
// One-click printing: a Windows shortcut that opens the app in its own Chrome with --kiosk-printing.
// Chrome then prints without showing the print window, to the printer last used in that Chrome
// profile. Each shortcut gets its own profile folder, so the label shortcut and the receipt shortcut
// each remember their own printer and nothing changes in the everyday Chrome.
// ---------------------------------------------------------------------------
export type KioskTarget = "labels" | "slips";
export const KIOSK_TARGETS: Record<KioskTarget, { title: string; path: string; file: string }> = {
  labels: { title: "Mahadev labels", path: "/barrels/fleet/labels?codes=all&size=50x30&type=tare", file: "Mahadev-label-printing.bat" },
  slips: { title: "Mahadev slips", path: "/barrels/fleet", file: "Mahadev-slip-printing.bat" },
};

export function kioskBat(origin: string, target: KioskTarget): string {
  const t = KIOSK_TARGETS[target];
  const url = `${origin.replace(/\/+$/, "")}${t.path}`;
  const profile = `%LOCALAPPDATA%\\MahadevPrint\\${target}`;
  return [
    "@echo off",
    `rem ${t.title}: opens the app in its own Chrome window that prints WITHOUT the print window.`,
    "rem First time only: press Print once, pick the printer in the print window, choose the paper size, Print.",
    "rem After that every Print button in this window prints straight to that printer.",
    "setlocal",
    `set "PROFILE=${profile}"`,
    'set "CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" (',
    "  echo Google Chrome was not found. Install Chrome and run this file again.",
    "  pause",
    "  exit /b 1",
    ")",
    `start "" "%CHROME%" --kiosk-printing --user-data-dir="%PROFILE%" --no-first-run --app="${url}"`,
    "endlocal",
    "",
  ].join("\r\n");
}
