// Talking to the print helper (tools/print_helper.py) that runs on the shop PC, and the
// "one-click" Chrome shortcut. Pure functions are tested in lib/__tests__/printHelper.test.ts.

export const HELPER_PORT = 9101;
export const HELPER_DPI = 203; // the Helett H30C and most label / receipt printers are 203 dpi
export const MAX_COPIES = 50;

export type PrintMode = "window" | "direct" | "queue" | "share" | "oneclick" | "helper";
export const PRINT_MODES: { id: PrintMode; name: string; note: string }[] = [
  { id: "window", name: "Print window", note: "Chrome's usual print window. Works when the printer is installed on this device." },
  { id: "direct", name: "Bluetooth / USB", note: "Straight from this phone, tablet or PC to the printer. No shop PC, no printer app." },
  { id: "queue", name: "Shop printer", note: "Works from any phone, tablet or PC. The shop PC prints it on its USB printer. No Bluetooth." },
  { id: "share", name: "Share to app", note: "Makes a picture at the exact label size and sends it to a printer app on this phone or tablet." },
  { id: "oneclick", name: "One-click", note: "No window. Needs the special Chrome shortcut on the shop PC." },
  { id: "helper", name: "This PC's helper", note: "Exact paper size, straight to the printer, from the PC the helper runs on." },
];
export const printMode = (v: string | null | undefined): PrintMode => (v === "direct" || v === "queue" || v === "share" || v === "oneclick" || v === "helper" ? v : "window");
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

// ---------------------------------------------------------------------------
// One-click printing with the print helper, set up from the app with one downloaded file.
// The page makes the pairing code itself and writes it into the set-up file, so nobody has to copy a
// code from a black window: the file fetches the helper from the app, saves the code where the helper
// reads it, makes it start with Windows and starts it now. The helper prints each label at its exact
// size (it sets the paper on the printer itself), so a size missing from the driver's list does not
// matter and there is no print window.
// ---------------------------------------------------------------------------
export const HELPER_FILE_PATH = "/print-helper/print_helper.py";
export const HELPER_SETUP_FILE = "Mahadev-one-click-printing-setup.bat";

/** A new pairing code like 3FA9-0C1B-77DE-92A4. */
export function newPairingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const b = random(8);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.replace(/(.{4})(?=.)/g, "$1-");
}

/** The Windows set-up file for one-click printing on this PC. */
export function helperSetupBat(origin: string, code: string): string {
  if (!pairingCodeOk(code)) throw new Error("Bad pairing code");
  const url = `${origin.replace(/\/+$/, "")}${HELPER_FILE_PATH}`;
  if (!/^https?:\/\/[A-Za-z0-9.:\-\[\]]+$/.test(origin.replace(/\/+$/, ""))) throw new Error("Bad app address");
  return [
    "@echo off",
    "rem Mahadev one-click printing: puts the small print helper on this PC and starts it.",
    "rem After this, the Print button in the app prints labels and slips at their exact size, with no print window.",
    "setlocal",
    "title Mahadev one-click printing set-up",
    'set "HDIR=%LOCALAPPDATA%\\MahadevPrint\\helper"',
    'set "CDIR=%USERPROFILE%\\.mahadev_print"',
    'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
    'if not exist "%HDIR%" mkdir "%HDIR%"',
    'if not exist "%CDIR%" mkdir "%CDIR%"',
    "echo.",
    "echo  1/4  Getting the print helper from the app...",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '%HDIR%\\print_helper.py'"`,
    'if not exist "%HDIR%\\print_helper.py" (',
    "  echo  Could not download the helper. Check the internet and run this file again.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo  2/4  Looking for Python...",
    'set "PY="',
    'py -c "import sys" >nul 2>nul && set "PY=py"',
    'if not defined PY python -c "import sys" >nul 2>nul && set "PY=python"',
    'if not defined PY if exist "%LOCALAPPDATA%\\Programs\\Python\\Launcher\\py.exe" set "PY=%LOCALAPPDATA%\\Programs\\Python\\Launcher\\py.exe"',
    "if not defined PY (",
    "  echo       Python is needed once. Installing it, please wait...",
    "  winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements",
    ")",
    'if not defined PY if exist "%LOCALAPPDATA%\\Programs\\Python\\Launcher\\py.exe" set "PY=%LOCALAPPDATA%\\Programs\\Python\\Launcher\\py.exe"',
    'if not defined PY if exist "%SystemRoot%\\py.exe" set "PY=%SystemRoot%\\py.exe"',
    "if not defined PY (",
    "  echo  Python could not be installed by itself. The download page opens now: install Python",
    '  echo  ^(tick "Add python.exe to PATH"^), then run this file again.',
    "  start https://www.python.org/downloads/windows/",
    "  pause",
    "  exit /b 1",
    ")",
    "echo  3/4  Pairing it with this browser...",
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*print_helper.py*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul`,
    `> "%CDIR%\\pairing_code.txt" echo ${code}`,
    '> "%HDIR%\\start-helper.bat" echo @echo off',
    '>> "%HDIR%\\start-helper.bat" echo cd /d "%HDIR%"',
    '>> "%HDIR%\\start-helper.bat" echo start "Mahadev print helper - keep open" /min "%PY%" "%HDIR%\\print_helper.py"',
    'copy /y "%HDIR%\\start-helper.bat" "%STARTUP%\\Mahadev print helper.bat" >nul',
    "echo  4/4  Starting it (it also starts by itself when Windows starts)...",
    'call "%HDIR%\\start-helper.bat"',
    "echo.",
    "echo  Done. Go back to the app: it finds the printers by itself in a few seconds.",
    "echo  If Chrome asks to let the site reach devices on this computer or network, choose Allow.",
    "timeout /t 15",
    "endlocal",
    "",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// Shop printer queue (phone / tablet / any PC -> app -> print helper on the shop PC)
// ---------------------------------------------------------------------------
export interface QueueJobRow {
  id: string;
  createdAt: string;
  createdBy: string;
  kind: "label" | "slip";
  title: string;
  copies: number;
  status: "QUEUED" | "PRINTING" | "DONE" | "FAILED" | "CANCELLED";
  error: string | null;
  doneAt: string | null;
}
export interface QueueAgent {
  online: boolean;
  lastSeen: string | null;
  version: string;
  dryRun: boolean;
  labelPrinter: string;
  slipPrinter: string;
}
export interface QueueState {
  jobs: QueueJobRow[];
  agent: QueueAgent;
}
export const QUEUE_CHUNK = 20; // pictures per queued job; the server accepts 40 but a phone's upload is kinder in smaller parts

async function appCall<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("No internet connection to the app. Check the Wi-Fi or mobile data and try again.");
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(j.error || `The app answered ${res.status}.`);
  return j;
}
export const fetchQueue = (limit = 6) => appCall<QueueState>(`/api/print-jobs?limit=${limit}`);
export const queueJob = (job: { kind: "label" | "slip"; title: string; copies: number; items: HelperItem[] }) =>
  appCall<{ id: string }>("/api/print-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
export const jobAction = (id: string, action: "cancel" | "reprint") =>
  appCall<{ id: string }>(`/api/print-jobs/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });

/** Split a long list of pictures into jobs the server and a phone connection can handle. */
export function chunkItems<T>(items: T[], size: number = QUEUE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "3 min ago" for the job list; takes a time and "now" so it can be tested. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - +new Date(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
