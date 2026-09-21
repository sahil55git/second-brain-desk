"""Mahadev local scale bridge.

Receives TCP streams from weighing indicators on the shop LAN and exposes
validated readings to the browser on ws://127.0.0.1:8765.

Run on the Windows computer that opens the Vercel business app:
    py -m pip install -r tools/scale-requirements.txt
    py tools/scale_bridge.py --scale-port 9000
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from datetime import datetime, timezone

import websockets


WEIGHT_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")
browser_tabs: set = set()
latest_packets: dict[str, dict] = {}


def parse_industrial_weight(packet: bytes) -> float | None:
    """Return the last plausible numeric value in an ASCII indicator packet."""
    try:
        text = packet.decode("ascii", errors="ignore").replace("\x00", " ")
        matches = WEIGHT_RE.findall(text)
        if not matches:
            return None
        weight = float(matches[-1])
        if not (-1_000_000 < weight < 1_000_000):
            return None
        return weight
    except (TypeError, ValueError, OverflowError):
        return None


async def broadcast(payload: dict) -> None:
    if not browser_tabs:
        return
    message = json.dumps(payload)
    results = await asyncio.gather(
        *(tab.send(message) for tab in tuple(browser_tabs)),
        return_exceptions=True,
    )
    for tab, result in zip(tuple(browser_tabs), results):
        if isinstance(result, Exception):
            browser_tabs.discard(tab)


async def handle_incoming_scale(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    scale_ip = peer[0] if peer else "unknown"
    print(f"[+] Scale online: {scale_ip}")
    try:
        while packet := await reader.read(1024):
            weight = parse_industrial_weight(packet)
            if weight is None:
                continue
            payload = {
                "scale_source": scale_ip,
                "weight": weight,
                "unit": "kg",
                "stable": True,
                "received_at": datetime.now(timezone.utc).isoformat(),
            }
            latest_packets[scale_ip] = payload
            await broadcast(payload)
    except (ConnectionError, asyncio.CancelledError) as error:
        print(f"[-] Scale link ended ({scale_ip}): {error}")
    finally:
        writer.close()
        await writer.wait_closed()
        print(f"[-] Scale offline: {scale_ip}")


async def browser_handler(websocket) -> None:
    browser_tabs.add(websocket)
    print("[Chrome] Business app connected.")
    try:
        for payload in latest_packets.values():
            await websocket.send(json.dumps(payload))
        async for _ in websocket:
            pass
    finally:
        browser_tabs.discard(websocket)
        print("[Chrome] Business app disconnected.")


async def main(scale_port: int, browser_port: int) -> None:
    print("[*] Launching Mahadev Scale Bridge...")
    scale_server = await asyncio.start_server(handle_incoming_scale, "0.0.0.0", scale_port)
    browser_server = await websockets.serve(browser_handler, "127.0.0.1", browser_port)
    print(f"[*] Indicators send TCP to this PC on port {scale_port}")
    print(f"[*] Chrome bridge: ws://127.0.0.1:{browser_port}")
    async with scale_server, browser_server:
        await asyncio.gather(scale_server.serve_forever(), browser_server.wait_closed())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bridge shop scales to the Mahadev web app")
    parser.add_argument("--scale-port", type=int, default=9000, help="TCP port configured in each indicator")
    parser.add_argument("--browser-port", type=int, default=8765, help="Local WebSocket port used by Chrome")
    args = parser.parse_args()
    try:
        asyncio.run(main(args.scale_port, args.browser_port))
    except KeyboardInterrupt:
        print("\n[*] Bridge closed safely.")

