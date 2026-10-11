"""Tests for tools/scale_ticks.py. Run:  py -m unittest tools/test_scale_ticks.py -v"""
import asyncio
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(__file__))
from scale_ticks import SettleDetector, TickPipeline  # noqa: E402


class SettleTests(unittest.TestCase):
    def feed(self, det, series):
        out = []
        for t, w in series:
            r = det.update(w, now=t)
            if r is not None:
                out.append((t, r))
        return out

    def test_si850_five_second_polling_settles_on_second_matching_poll(self):
        det = SettleDetector()
        self.assertEqual(self.feed(det, [(0, 218.4), (5, 218.4)]), [(5, 218.4)])

    def test_fires_only_once_per_load(self):
        det = SettleDetector()
        fired = self.feed(det, [(0, 218.4), (5, 218.4), (10, 218.4), (15, 218.5), (20, 218.4)])
        self.assertEqual(len(fired), 1)

    def test_moving_weight_does_not_settle(self):
        det = SettleDetector()
        self.assertEqual(self.feed(det, [(0, 120.0), (5, 190.0), (10, 218.0)]), [])
        # ...then it stops moving
        self.assertEqual(len(self.feed(det, [(15, 218.0)])), 1)

    def test_empty_platform_rearms_so_same_weight_fires_again(self):
        det = SettleDetector()
        a = self.feed(det, [(0, 218.4), (5, 218.4), (10, 0.0), (15, 218.4), (20, 218.4)])
        self.assertEqual([w for _, w in a], [218.4, 218.4])

    def test_big_change_rearms_without_going_through_zero(self):
        det = SettleDetector()
        a = self.feed(det, [(0, 218.4), (5, 218.4), (10, 18.2), (15, 18.2)])
        self.assertEqual([w for _, w in a], [218.4, 18.2])

    def test_light_things_are_ignored(self):
        det = SettleDetector()
        self.assertEqual(self.feed(det, [(0, 6.0), (5, 6.0), (10, 6.0)]), [])

    def test_streaming_scale_needs_the_full_window(self):
        det = SettleDetector()
        series = [(i * 0.1, 200.0) for i in range(60)]  # 10 readings per second for 6 s
        fired = self.feed(det, series)
        self.assertEqual(len(fired), 1)
        self.assertGreaterEqual(fired[0][0], 4.2)

    def test_rearm_after_failed_push(self):
        det = SettleDetector()
        self.feed(det, [(0, 218.4), (5, 218.4)])
        det.rearm()
        self.assertEqual(len(self.feed(det, [(10, 218.4), (15, 218.4)])), 1)


class Handler(BaseHTTPRequestHandler):
    received = []
    fail_first = 0

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.headers.get("x-scale-secret") != "s3cret-s3cret-s3cret":
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":"Wrong secret."}'); return
        if Handler.fail_first > 0:
            Handler.fail_first -= 1
            self.send_response(503); self.end_headers(); return
        Handler.received.append(body)
        self.send_response(201); self.end_headers(); self.wfile.write(b'{"ok":true}')

    def log_message(self, *a):
        pass


class PushTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Handler)
        cls.url = f"http://127.0.0.1:{cls.srv.server_port}/api/scale-ticks/ingest"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        Handler.received = []
        Handler.fail_first = 0
        self.logs = []

    def pipe(self, secret="s3cret-s3cret-s3cret"):
        return TickPipeline(self.url, secret, ["PLATFORM-1"], log=self.logs.append, retry_wait_s=0.01)

    def test_sends_settled_weight_with_nonce_and_secret(self):
        p = self.pipe()

        async def go():
            await p.observe("PLATFORM-1", 218.4, now=0)
            await p.observe("PLATFORM-1", 218.4, now=5)

        asyncio.run(go())
        self.assertEqual(len(Handler.received), 1)
        r = Handler.received[0]
        self.assertEqual((r["source"], r["weightKg"]), ("PLATFORM-1", 218.4))
        self.assertRegex(r["nonce"], r"^[0-9a-f]{32}$")

    def test_other_scales_are_ignored(self):
        p = self.pipe()

        async def go():
            await p.observe("SI850-KARADI", 334.4, now=0)
            await p.observe("SI850-KARADI", 334.4, now=5)

        asyncio.run(go())
        self.assertEqual(Handler.received, [])

    def test_retries_with_same_nonce_after_server_trouble(self):
        Handler.fail_first = 2
        p = self.pipe()
        asyncio.run(p.push("PLATFORM-1", 100.0))
        self.assertEqual(len(Handler.received), 1)

    def test_wrong_secret_is_not_retried_and_rearms(self):
        p = self.pipe(secret="wrong-wrong-wrong-wrong")

        async def go():
            await p.observe("PLATFORM-1", 218.4, now=0)
            await p.observe("PLATFORM-1", 218.4, now=5)   # settles, push refused
            await p.observe("PLATFORM-1", 218.4, now=10)
            await p.observe("PLATFORM-1", 218.4, now=15)  # re-armed -> tries again

        asyncio.run(go())
        self.assertEqual(Handler.received, [])
        self.assertEqual(sum("refused" in m for m in self.logs), 2)


if __name__ == "__main__":
    unittest.main()
