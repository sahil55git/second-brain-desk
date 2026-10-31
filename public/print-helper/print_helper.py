"""Mahadev print helper: prints barrel labels and slips straight to a named printer.

Why it exists: the browser print window cannot choose an exact paper size or stay silent. This
small program runs on the shop PC (the one that has the label printer and the receipt printer
installed). The business app, open in Chrome on the same PC, sends it a picture of each label
or slip and the paper size, and the helper prints it at exactly that size with no print window.

Run it on the shop PC (Python is already there for the scale bridge). No packages to install:
    py tools/print_helper.py

First run: it prints a PAIRING CODE. Paste that code once into the app (Print panel -> "Print
helper" -> Pairing code). Only a browser that knows the code can print. The helper listens only
on this computer (127.0.0.1), never on the shop network.

Phones and tablets (no Bluetooth needed): the helper can also fetch jobs from the app. A phone or tablet
queues a label or slip in the app ("Shop printer" mode); the helper, with the printers on USB, prints it:
    set PRINT_QUEUE_SECRET=<16+ characters, the same value as in Vercel>   (SCALE_PUSH_SECRET also works)
    py tools/print_helper.py --queue-url https://<your-app>/api/print-jobs/agent ^
        --label-printer "H30C Thermal Printer" --slip-printer "POSIFLOW 80B"

Options:
    --port 9101       change the port (also change it in the app)
    --queue-url URL   also print jobs queued from phones and tablets
    --label-printer N printer name for labels (default: the one that looks like a label printer)
    --slip-printer N  printer name for slips and receipts
    --dry-run         do not print; save each picture into the print-jobs folder instead
                      (use this to check the app and helper talk to each other before using paper)
    --show-code       print the pairing code again and exit

Printing itself uses Windows' own printing through PowerShell (System.Drawing), so any printer
that appears in Windows "Printers & scanners" works. On other systems it falls back to --dry-run.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hmac
import json
import os
import platform
import secrets
import struct
import subprocess
import re
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.1"
NAME = "mahadev-print-helper"
DEFAULT_PORT = 9101
MAX_BODY = 25 * 1024 * 1024  # a 4x6 label at 203 dpi is well under 1 MB; this is a safety stop
MAX_ITEMS = 100
MAX_COPIES = 50
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

CONFIG_DIR = Path(os.environ.get("MAHADEV_PRINT_HOME") or Path.home() / ".mahadev_print")


# ---------------------------------------------------------------------------
# Pairing code
# ---------------------------------------------------------------------------
def load_token(directory: Path = CONFIG_DIR) -> str:
    """The pairing code is made once and kept in a file, so it survives a restart of the helper."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "pairing_code.txt"
    if path.exists():
        code = path.read_text(encoding="utf-8").strip()
        if len(code) >= 12:
            return code
    code = "-".join(secrets.token_hex(2).upper() for _ in range(4))  # e.g. 3FA9-0C1B-77DE-92A4
    path.write_text(code + "\n", encoding="utf-8")
    return code


# ---------------------------------------------------------------------------
# Job checking (pure, tested)
# ---------------------------------------------------------------------------
class JobError(ValueError):
    pass


PRINT_LOCK = threading.Lock()  # one print job at a time: two jobs at once would mix up the printer


def png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or not data.startswith(PNG_MAGIC) or data[12:16] != b"IHDR":
        raise JobError("One of the pictures is not a PNG image.")
    return struct.unpack(">II", data[16:24])


def check_job(body: dict) -> dict:
    """Validate a /print request and decode the pictures. Returns the cleaned job."""
    printer = str(body.get("printer") or "").strip()
    if not printer or len(printer) > 200 or any(c in printer for c in "\r\n\0"):
        raise JobError("Choose a printer first.")
    try:
        copies = int(body.get("copies", 1))
    except (TypeError, ValueError):
        raise JobError("Copies must be a number.")
    if not 1 <= copies <= MAX_COPIES:
        raise JobError(f"Copies must be 1 to {MAX_COPIES}.")
    raw_items = body.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise JobError("There is nothing to print.")
    if len(raw_items) > MAX_ITEMS:
        raise JobError(f"At most {MAX_ITEMS} pictures per job.")
    items = []
    for i, it in enumerate(raw_items, 1):
        if not isinstance(it, dict):
            raise JobError(f"Picture {i} is not valid.")
        try:
            w = float(it.get("widthMm"))
        except (TypeError, ValueError):
            raise JobError(f"Picture {i}: paper width is missing.")
        h_raw = it.get("heightMm")
        try:
            h = None if h_raw in (None, "", 0) else float(h_raw)
        except (TypeError, ValueError):
            raise JobError(f"Picture {i}: paper height is not a number.")
        if not 10 <= w <= 300 or (h is not None and not 10 <= h <= 600):
            raise JobError(f"Picture {i}: paper size must be 10 to 300 mm wide.")
        try:
            png = base64.b64decode(str(it.get("png") or ""), validate=True)
        except (binascii.Error, ValueError):
            raise JobError(f"Picture {i} could not be read.")
        pw, ph = png_size(png)
        if pw < 20 or ph < 20 or pw > 6000 or ph > 12000:
            raise JobError(f"Picture {i} has an unusual size ({pw} x {ph}).")
        if h is None:  # roll paper: the slip decides its own length
            h = round(w * ph / pw, 1)
        items.append({"png": png, "widthMm": round(w, 1), "heightMm": round(h, 1)})
    return {"printer": printer, "copies": copies, "items": items, "title": str(body.get("title") or "")[:80]}


# ---------------------------------------------------------------------------
# Windows printing (PowerShell + System.Drawing)
# ---------------------------------------------------------------------------
PRINT_PS1 = r"""
param([string]$Printer, [string]$Png, [double]$WidthMm, [double]$HeightMm, [int]$Copies)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$script:img = [System.Drawing.Image]::FromFile($Png)
try {
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $Printer
  if (-not $pd.PrinterSettings.IsValid) { throw "Printer not found: $Printer" }
  $pd.PrinterSettings.Copies = [int16]$Copies
  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $pd.OriginAtMargins = $false
  $w = [int][math]::Round($WidthMm / 25.4 * 100)
  $h = [int][math]::Round($HeightMm / 25.4 * 100)
  $pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Mahadev', $w, $h)
  $pd.add_PrintPage({
    param($sender, $e)
    $g = $e.Graphics
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($script:img, 0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
    $e.HasMorePages = $false
  })
  $pd.Print()
} finally { $script:img.Dispose() }
"""

LIST_PS1 = r"""
Add-Type -AssemblyName System.Drawing
$d = New-Object System.Drawing.Printing.PrinterSettings
@{ default = $d.PrinterName; printers = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters) } | ConvertTo-Json -Compress
"""


def _powershell(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    exe = "powershell.exe" if platform.system() == "Windows" else "pwsh"
    return subprocess.run([exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", *args], capture_output=True, text=True, timeout=timeout)


class WindowsBackend:
    """Prints for real. Only usable on Windows."""

    dry_run = False

    def printers(self) -> dict:
        r = _powershell(["-Command", LIST_PS1], timeout=30)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout or "Could not read the printer list.").strip())
        data = json.loads(r.stdout.strip() or "{}")
        names = data.get("printers") or []
        if isinstance(names, str):
            names = [names]
        return {"printers": sorted(names), "default": data.get("default") or ""}

    def print_job(self, job: dict) -> int:
        with tempfile.TemporaryDirectory(prefix="mahadev_print_") as tmp:
            script = Path(tmp) / "print.ps1"
            script.write_text(PRINT_PS1, encoding="utf-8")
            done = 0
            for n, it in enumerate(job["items"], 1):
                png = Path(tmp) / f"item{n}.png"
                png.write_bytes(it["png"])
                r = _powershell(["-File", str(script), "-Printer", job["printer"], "-Png", str(png), "-WidthMm", str(it["widthMm"]), "-HeightMm", str(it["heightMm"]), "-Copies", str(job["copies"])])
                if r.returncode != 0:
                    msg = (r.stderr or r.stdout or "The printer refused the job.").strip().splitlines()
                    raise RuntimeError(msg[0][:300] if msg else "The printer refused the job.")
                done += 1
            return done


class DryRunBackend:
    """Saves the pictures instead of printing. For checking the connection before using paper."""

    dry_run = True

    def __init__(self, folder: Path):
        self.folder = folder

    def printers(self) -> dict:
        return {"printers": ["(dry run) save to print-jobs folder"], "default": "(dry run) save to print-jobs folder"}

    def print_job(self, job: dict) -> int:
        self.folder.mkdir(parents=True, exist_ok=True)
        stamp = secrets.token_hex(3)
        for n, it in enumerate(job["items"], 1):
            name = f"{stamp}-{n:02d}-{it['widthMm']}x{it['heightMm']}mm-x{job['copies']}.png"
            (self.folder / name).write_bytes(it["png"])
        return len(job["items"])


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------
def make_handler(token: str, backend, log=print):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"{NAME}/{VERSION}"

        def log_message(self, fmt, *args):  # quiet the default access log
            pass

        # --- helpers
        def _cors(self):
            origin = self.headers.get("Origin")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Print-Code")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")  # Chrome asks this of a public site calling 127.0.0.1
            self.send_header("Access-Control-Max-Age", "600")

        def _send(self, status: int, payload: dict):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _authed(self) -> bool:
            sent = (self.headers.get("X-Print-Code") or "").strip().upper()
            return bool(sent) and hmac.compare_digest(sent.encode(), token.upper().encode())

        # --- routes
        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/ping":  # no code needed: lets the app show "helper running" before pairing
                return self._send(200, {"ok": True, "name": NAME, "version": VERSION, "dryRun": backend.dry_run})
            if path == "/printers":
                if not self._authed():
                    return self._send(401, {"ok": False, "error": "Wrong or missing pairing code."})
                try:
                    return self._send(200, {"ok": True, **backend.printers()})
                except Exception as e:  # noqa: BLE001
                    return self._send(500, {"ok": False, "error": str(e)[:300]})
            self._send(404, {"ok": False, "error": "Not found."})

        def do_POST(self):
            if self.path.split("?")[0] != "/print":
                return self._send(404, {"ok": False, "error": "Not found."})
            if not self._authed():
                return self._send(401, {"ok": False, "error": "Wrong or missing pairing code."})
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_BODY:
                return self._send(413, {"ok": False, "error": "The print job is too big or empty."})
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(body, dict):
                    raise JobError("The print job is not valid.")
                job = check_job(body)
            except (JobError, ValueError, UnicodeDecodeError) as e:
                return self._send(400, {"ok": False, "error": str(e)[:300]})
            with PRINT_LOCK:
                try:
                    n = backend.print_job(job)
                except Exception as e:  # noqa: BLE001
                    log(f"print failed: {e}")
                    return self._send(502, {"ok": False, "error": str(e)[:300]})
            log(f"printed {n} x{job['copies']} on {job['printer']}" + (" (dry run)" if backend.dry_run else ""))
            self._send(200, {"ok": True, "printed": n, "copies": job["copies"], "dryRun": backend.dry_run})

    return Handler


def make_server(port: int, token: str, backend, log=print) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(token, backend, log))


# ---------------------------------------------------------------------------
# Jobs queued from phones and tablets
# ---------------------------------------------------------------------------
LABEL_HINT = re.compile(r"h30c|helett|label|tsc|zebra|godex|xprinter", re.I)
SLIP_HINT = re.compile(r"posiflow|receipt|pos[- ]?80|pos[- ]?58|thermal receipt", re.I)


def pick_printer(kind: str, names: list[str], default: str, wanted: str = "") -> str:
    """The printer a queued job should use: the one named on the command line, else one that looks right."""
    if wanted:
        return wanted
    hint = LABEL_HINT if kind == "label" else SLIP_HINT
    for n in names:
        if hint.search(n):
            return n
    return default or (names[0] if names else "")


class QueueWorker:
    """Asks the app for queued print jobs and prints them. step() does one round and is easy to test."""

    def __init__(self, url: str, secret: str, backend, label_printer: str = "", slip_printer: str = "", log=print):
        self.url, self.secret, self.backend, self.log = url, secret, backend, log
        self.label_printer, self.slip_printer = label_printer, slip_printer
        self._names: tuple[list[str], str] | None = None
        self.last_error = ""

    def _post(self, payload: dict) -> dict:
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"), method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("x-print-secret", self.secret)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read() or b"{}").get("error")
            except Exception:  # noqa: BLE001
                msg = None
            raise RuntimeError(f"The app answered {e.code}: {msg or e.reason}")

    def _printers(self) -> tuple[list[str], str]:
        if self._names is None:
            try:
                d = self.backend.printers()
                self._names = (d.get("printers") or [], d.get("default") or "")
            except Exception:  # noqa: BLE001
                self._names = ([], "")
        return self._names

    def printer_for(self, kind: str) -> str:
        names, default = self._printers()
        return pick_printer(kind, names, default, self.label_printer if kind == "label" else self.slip_printer)

    def step(self) -> bool:
        """One round: tell the app we are here, take a job if there is one, print it, report. True if a job was handled."""
        res = self._post({"action": "claim", "version": VERSION, "dryRun": self.backend.dry_run, "labelPrinter": self.printer_for("label"), "slipPrinter": self.printer_for("slip")})
        job = res.get("job")
        if not job:
            return False
        ok, err = True, ""
        try:
            cleaned = check_job({
                "printer": self.printer_for(job.get("kind", "label")),
                "copies": job.get("copies", 1),
                "items": [{"png": it.get("png"), "widthMm": it.get("widthMm"), "heightMm": it.get("heightMm")} for it in job.get("items", [])],
                "title": job.get("title", ""),
            })
            with PRINT_LOCK:
                n = self.backend.print_job(cleaned)
            self.log(f"queue: printed {n} x{cleaned['copies']} for '{job.get('title') or job.get('id')}' on {cleaned['printer']}" + (" (dry run)" if self.backend.dry_run else ""))
        except Exception as e:  # noqa: BLE001
            ok, err = False, str(e)[:300]
            self.log(f"queue: job failed: {err}")
        self._post({"action": "done", "id": job.get("id"), "ok": ok, "error": err})
        return True

    def run_forever(self, every: float = 2.0):
        while True:
            try:
                busy = self.step()
                if self.last_error:
                    self.log("queue: connected again")
                    self.last_error = ""
                if busy:
                    continue  # more jobs may be waiting
            except Exception as e:  # noqa: BLE001
                msg = str(e)[:200]
                if msg != self.last_error:  # say it once, not every 2 seconds
                    self.log(f"queue: cannot reach the app ({msg}). Will keep trying.")
                    self.last_error = msg
            time.sleep(every)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Mahadev print helper")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--dry-run", action="store_true", help="save pictures instead of printing")
    ap.add_argument("--show-code", action="store_true", help="show the pairing code and exit")
    ap.add_argument("--queue-url", default="", help="also print jobs queued from phones and tablets (the app's /api/print-jobs/agent address)")
    ap.add_argument("--label-printer", default="", help="printer name for labels")
    ap.add_argument("--slip-printer", default="", help="printer name for slips and receipts")
    args = ap.parse_args(argv)

    token = load_token()
    if args.show_code:
        print(token)
        return 0
    dry = args.dry_run or platform.system() != "Windows"
    backend = DryRunBackend(Path.cwd() / "print-jobs") if dry else WindowsBackend()
    secret = os.environ.get("PRINT_QUEUE_SECRET") or os.environ.get("SCALE_PUSH_SECRET") or ""
    if args.queue_url and len(secret) < 16:
        print("--queue-url needs PRINT_QUEUE_SECRET (16+ characters, the same value as in Vercel) set first.")
        return 2
    srv = make_server(args.port, token, backend)
    print(f"Mahadev print helper {VERSION} is running on http://127.0.0.1:{args.port}")
    print(f"Pairing code (paste it once into the app): {token}")
    if dry:
        why = "asked for" if args.dry_run else "not Windows"
        print(f"DRY RUN ({why}): pictures are saved to {Path.cwd() / 'print-jobs'} instead of being printed.")
    if args.queue_url:
        worker = QueueWorker(args.queue_url, secret, backend, args.label_printer, args.slip_printer)
        threading.Thread(target=worker.run_forever, daemon=True).start()
        print(f"Also printing jobs queued from phones and tablets: labels on '{worker.printer_for('label') or '?'}', slips on '{worker.printer_for('slip') or '?'}'.")
    print("Leave this window open while you print. Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
