"""Tests for tools/print_helper.py. Run:  py -m unittest tools/test_print_helper.py -v"""
import base64
import json
import os
import struct
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zlib
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import print_helper as ph  # noqa: E402


def tiny_png(w=40, h=60):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"\xff" * w for _ in range(h))
    return ph.PNG_MAGIC + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def b64(b):
    return base64.b64encode(b).decode()


class FakeBackend:
    dry_run = False

    def __init__(self):
        self.jobs = []
        self.fail = None

    def printers(self):
        return {"printers": ["H30C Thermal Printer", "POSIFLOW 80B"], "default": "POSIFLOW 80B"}

    def print_job(self, job):
        if self.fail:
            raise RuntimeError(self.fail)
        self.jobs.append(job)
        return len(job["items"])


class CheckJobTests(unittest.TestCase):
    def job(self, **kw):
        base = {"printer": "H30C Thermal Printer", "copies": 2, "items": [{"widthMm": 101.6, "heightMm": 152.4, "png": b64(tiny_png())}]}
        base.update(kw)
        return base

    def test_good_job_is_cleaned(self):
        j = ph.check_job(self.job())
        self.assertEqual(j["printer"], "H30C Thermal Printer")
        self.assertEqual(j["copies"], 2)
        self.assertEqual(j["items"][0]["widthMm"], 101.6)
        self.assertTrue(j["items"][0]["png"].startswith(ph.PNG_MAGIC))

    def test_roll_height_comes_from_the_picture(self):
        j = ph.check_job(self.job(items=[{"widthMm": 80, "heightMm": None, "png": b64(tiny_png(40, 100))}]))
        self.assertEqual(j["items"][0]["heightMm"], 200.0)

    def test_rejects_bad_input(self):
        for bad in [
            self.job(printer=""),
            self.job(printer="a\nb"),
            self.job(copies=0),
            self.job(copies=51),
            self.job(copies="x"),
            self.job(items=[]),
            self.job(items="nope"),
            self.job(items=[{"widthMm": 5, "heightMm": 30, "png": b64(tiny_png())}]),
            self.job(items=[{"widthMm": 50, "heightMm": 30, "png": "!!notbase64!!"}]),
            self.job(items=[{"widthMm": 50, "heightMm": 30, "png": b64(b"GIF89a-not-a-png-at-all-xxxxxxxx")}]),
            self.job(items=[{"widthMm": 50, "heightMm": 30, "png": b64(tiny_png(10, 10))}]),
            self.job(items=[{"widthMm": 50, "heightMm": 30, "png": b64(tiny_png())}] * (ph.MAX_ITEMS + 1)),
        ]:
            with self.assertRaises(ph.JobError, msg=str(bad)[:80]):
                ph.check_job(bad)


class PairingTests(unittest.TestCase):
    def test_code_is_made_once_and_kept(self):
        with tempfile.TemporaryDirectory() as d:
            a = ph.load_token(Path(d))
            b = ph.load_token(Path(d))
            self.assertEqual(a, b)
            self.assertRegex(a, r"^[0-9A-F]{4}(-[0-9A-F]{4}){3}$")


class ServerTests(unittest.TestCase):
    TOKEN = "AAAA-BBBB-CCCC-DDDD"

    def setUp(self):
        self.backend = FakeBackend()
        self.srv = ph.make_server(0, self.TOKEN, self.backend, log=lambda *_: None)
        self.port = self.srv.server_address[1]
        self.t = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.t.start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def call(self, method, path, body=None, code=None, origin="https://mahadev-second-brain.vercel.app", raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method)
        if origin:
            req.add_header("Origin", origin)
        if code:
            req.add_header("X-Print-Code", code)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, dict(r.headers), json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), json.loads(e.read() or b"{}")

    def job(self):
        return {"printer": "H30C Thermal Printer", "copies": 1, "items": [{"widthMm": 50, "heightMm": 30, "png": b64(tiny_png(100, 60))}]}

    def test_ping_needs_no_code(self):
        s, h, j = self.call("GET", "/ping")
        self.assertEqual(s, 200)
        self.assertTrue(j["ok"])
        self.assertEqual(j["name"], ph.NAME)

    def test_preflight_allows_private_network(self):
        s, h, _ = self.call("OPTIONS", "/print")
        self.assertEqual(s, 204)
        self.assertEqual(h.get("Access-Control-Allow-Private-Network"), "true")
        self.assertIn("X-Print-Code", h.get("Access-Control-Allow-Headers", ""))
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "https://mahadev-second-brain.vercel.app")

    def test_printers_and_print_need_the_code(self):
        self.assertEqual(self.call("GET", "/printers")[0], 401)
        self.assertEqual(self.call("GET", "/printers", code="WRONG")[0], 401)
        self.assertEqual(self.call("POST", "/print", self.job())[0], 401)
        self.assertEqual(self.call("POST", "/print", self.job(), code="nope")[0], 401)
        self.assertEqual(self.backend.jobs, [])

    def test_printer_list(self):
        s, _, j = self.call("GET", "/printers", code=self.TOKEN)
        self.assertEqual(s, 200)
        self.assertIn("H30C Thermal Printer", j["printers"])
        self.assertEqual(j["default"], "POSIFLOW 80B")

    def test_code_is_case_insensitive_and_trimmed(self):
        self.assertEqual(self.call("GET", "/printers", code=" aaaa-bbbb-cccc-dddd ")[0], 200)

    def test_print_goes_to_the_backend(self):
        s, _, j = self.call("POST", "/print", self.job(), code=self.TOKEN)
        self.assertEqual(s, 200)
        self.assertEqual(j["printed"], 1)
        self.assertEqual(len(self.backend.jobs), 1)
        self.assertEqual(self.backend.jobs[0]["items"][0]["heightMm"], 30.0)

    def test_bad_job_is_400_and_prints_nothing(self):
        bad = self.job()
        bad["copies"] = 99
        s, _, j = self.call("POST", "/print", bad, code=self.TOKEN)
        self.assertEqual(s, 400)
        self.assertIn("Copies", j["error"])
        self.assertEqual(self.backend.jobs, [])

    def test_not_json_is_400(self):
        s, _, _ = self.call("POST", "/print", code=self.TOKEN, raw=b"hello")
        self.assertEqual(s, 400)

    def test_printer_failure_is_reported(self):
        self.backend.fail = "Printer not found: X"
        s, _, j = self.call("POST", "/print", self.job(), code=self.TOKEN)
        self.assertEqual(s, 502)
        self.assertIn("Printer not found", j["error"])

    def test_unknown_route(self):
        self.assertEqual(self.call("GET", "/nope")[0], 404)
        self.assertEqual(self.call("POST", "/nope", {}, code=self.TOKEN)[0], 404)


class DryRunTests(unittest.TestCase):
    def test_saves_pictures(self):
        with tempfile.TemporaryDirectory() as d:
            be = ph.DryRunBackend(Path(d) / "jobs")
            job = ph.check_job({"printer": "x", "copies": 3, "items": [{"widthMm": 50, "heightMm": 30, "png": b64(tiny_png(100, 60))}]})
            self.assertEqual(be.print_job(job), 1)
            files = list((Path(d) / "jobs").glob("*.png"))
            self.assertEqual(len(files), 1)
            self.assertIn("50.0x30.0mm-x3", files[0].name)


if __name__ == "__main__":
    unittest.main()
