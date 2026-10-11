"""Settled-weight detection and push for the Mahadev scale bridge.

The bridge reads the platform scale all day. For barrel receiving we do not
want every reading — we want ONE trustworthy number each time a barrel has
been put on the scale and the display has stopped moving. This module:

  * SettleDetector  - decides when a stream of readings has become steady,
                      and only fires once per load (it re-arms when the
                      platform is emptied or the weight changes a lot);
  * TickPipeline    - sends each settled weight to the server
                      (POST /api/scale-ticks/ingest) with a shared secret.

It uses only the Python standard library, so it runs on the shop PC with no
extra installs, and it can be tested without any scale attached.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.error
import urllib.request
import uuid
from collections import deque
from typing import Callable, Deque, Dict, Iterable, Optional, Tuple


class SettleDetector:
    """Fires once when readings stop moving; re-arms after unload / big change."""

    def __init__(
        self,
        band_kg: float = 0.2,      # readings within this spread count as "not moving"
        window_s: float = 4.5,     # ... for at least this long
        min_samples: int = 2,
        min_kg: float = 10.0,      # ignore anything lighter (empty platform, a hand on it)
        empty_kg: float = 2.0,     # at or below this the platform is considered empty -> re-arm
        rearm_kg: float = 5.0,     # a change this big from the last settled weight -> re-arm
    ) -> None:
        self.band_kg = band_kg
        self.window_s = window_s
        self.min_samples = min_samples
        self.min_kg = min_kg
        self.empty_kg = empty_kg
        self.rearm_kg = rearm_kg
        self._samples: Deque[Tuple[float, float]] = deque()
        self._armed = True
        self._last_settled: Optional[float] = None

    def rearm(self) -> None:
        """Call when a push failed, so the next steady reading is sent again."""
        self._armed = True
        self._samples.clear()

    def update(self, weight: float, now: Optional[float] = None) -> Optional[float]:
        """Feed one reading. Returns the settled weight (kg, 1 decimal) the moment it settles."""
        t = time.monotonic() if now is None else now
        if weight <= self.empty_kg:
            self._armed = True
            self._last_settled = None
            self._samples.clear()
            return None
        if not self._armed and self._last_settled is not None and abs(weight - self._last_settled) >= self.rearm_kg:
            self._armed = True
            self._samples.clear()

        self._samples.append((t, weight))
        horizon = self.window_s * 2
        while self._samples and t - self._samples[0][0] > horizon:
            self._samples.popleft()

        if not self._armed or weight < self.min_kg:
            return None
        recent = [(ts, w) for ts, w in self._samples if t - ts <= horizon]
        if len(recent) < self.min_samples:
            return None
        # The steady stretch must reach back at least window_s (a little slack for timers).
        span = recent[-1][0] - recent[0][0]
        if span < self.window_s - 0.3:
            return None
        values = [w for _, w in recent]
        if max(values) - min(values) > self.band_kg:
            # Keep only the newest readings that agree with the latest one and try again next time.
            keep = [(ts, w) for ts, w in recent if abs(w - weight) <= self.band_kg]
            self._samples = deque(keep)
            return None
        settled = round(sum(values) / len(values), 1)
        self._armed = False
        self._last_settled = settled
        return settled


class TickPipeline:
    """Sends settled weights from the chosen scales to the server."""

    def __init__(
        self,
        url: str,
        secret: str,
        sources: Iterable[str],
        log: Callable[[str], None] = print,
        detector_factory: Callable[[], SettleDetector] = SettleDetector,
        attempts: int = 3,
        retry_wait_s: float = 2.0,
        timeout_s: float = 8.0,
    ) -> None:
        self.url = url
        self.secret = secret
        self.sources = set(sources)
        self.log = log
        self.attempts = attempts
        self.retry_wait_s = retry_wait_s
        self.timeout_s = timeout_s
        self._detectors: Dict[str, SettleDetector] = {s: detector_factory() for s in self.sources}

    # --- network -----------------------------------------------------------
    def _post(self, payload: dict) -> Optional[bool]:
        """True = stored; False = try again (network / server trouble); None = rejected, do not retry."""
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-scale-secret": self.secret, "User-Agent": "mahadev-scale-bridge"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                return 200 <= resp.status < 300
        except urllib.error.HTTPError as err:
            if 400 <= err.code < 500:
                self.log(f"[tick] server refused the reading ({err.code}): {err.read()[:120]!r}")
                return None
            self.log(f"[tick] server error {err.code}")
            return False
        except (urllib.error.URLError, OSError, TimeoutError) as err:
            self.log(f"[tick] could not reach the server: {err}")
            return False

    async def push(self, source: str, weight: float) -> bool:
        started = time.monotonic()
        nonce = uuid.uuid4().hex  # same nonce on every retry, so a retry can never double-count
        for attempt in range(self.attempts):
            payload = {
                "source": source,
                "weightKg": weight,
                "nonce": nonce,
                "ageSec": round(time.monotonic() - started, 1),
            }
            result = await asyncio.to_thread(self._post, payload)
            if result:
                self.log(f"[tick] {source}: {weight:.1f} kg settled and sent")
                return True
            if result is None:
                return False
            if attempt + 1 < self.attempts:
                await asyncio.sleep(self.retry_wait_s)
        return False

    # --- called for every reading -------------------------------------------
    async def observe(self, source: str, weight: float, now: Optional[float] = None) -> None:
        det = self._detectors.get(source)
        if det is None:
            return
        settled = det.update(weight, now)
        if settled is None:
            return
        self.log(f"[tick] {source}: steady at {settled:.1f} kg")
        if not await self.push(source, settled):
            # Could not send: let the next steady reading try again instead of going silent.
            det.rearm()
