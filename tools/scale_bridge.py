"""Mahadev local scale bridge.

Receives TCP streams from weighing indicators on the shop LAN and exposes
validated readings to the browser on ws://127.0.0.1:8765. It can also connect
outward to an indicator configured as a TCP server, such as the Essae SI-850.

Run on the Windows computer that opens the Vercel business app:
    py -m pip install -r tools/scale-requirements.txt
    py tools/scale_bridge.py --scale-port 9000

For an Essae SI-850 set to TCP Server on 192.168.50.248 port 4321:
    py tools/scale_bridge.py --si850 192.168.50.248:4321 --source SI850-KARADI

Barrel receiving: send each STEADY weight of the platform scale to the app so a
barrel's weight comes from the scale, not from typing (see docs/BARREL-RECEIVING.md):
    set SCALE_PUSH_SECRET=<same value as in Vercel>
    py tools/scale_bridge.py --si850-device PLATFORM-1@192.168.50.249:4321 ^
        --push-url https://<your-app>/api/scale-ticks/ingest --push-source PLATFORM-1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import re
import struct
from datetime import datetime, timezone

import websockets

from scale_ticks import TickPipeline


WEIGHT_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")
browser_tabs: set = set()
latest_packets: dict[str, dict] = {}
device_status: dict[str, dict] = {}
# Set in main when --push-url is given: sends each steady platform weight to the app.
tick_pipeline: TickPipeline | None = None

# Confirmed from an SI-850 capture and a live probe at 334.4 kg.
SI850_HELLO = bytes.fromhex("11 01 00 00 ee ff")
SI850_HELLO_REPLY = bytes.fromhex("66 01 00 02 97 ff")
SI850_READ = bytes.fromhex("33 02 01 00 ca ff 25 db ff")
SI850_READ_ACK = bytes.fromhex("66 02 00 00 98 ff")
SI850_POLL_SECONDS = 5


async def si850_exact(reader: asyncio.StreamReader, size: int) -> bytes:
    return await asyncio.wait_for(reader.readexactly(size), timeout=5)


async def si850_read_once(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> tuple[float, bytes]:
    """Request one SI-850 display reading using its observed binary exchange."""
    writer.write(SI850_HELLO)
    await writer.drain()
    hello = await si850_exact(reader, 6)
    if hello != SI850_HELLO_REPLY:
        raise ValueError(f"unexpected SI-850 handshake: {hello.hex(' ')}")

    writer.write(SI850_READ)
    await writer.drain()
    ack = await si850_exact(reader, 6)
    if ack != SI850_READ_ACK:
        raise ValueError(f"unexpected SI-850 read acknowledgement: {ack.hex(' ')}")

    header = await si850_exact(reader, 6)
    if header[:2] != b"\x22\x03" or header[5] != 0xff or sum(header[:5]) % 256 != 0:
        raise ValueError(f"unexpected SI-850 weight header: {header.hex(' ')}")
    length = int.from_bytes(header[2:4], "little")
    if not 8 <= length <= 256:
        raise ValueError(f"unexpected SI-850 weight payload length: {length}")
    # The captured reply has 95 payload bytes followed by two check bytes.
    body = await si850_exact(reader, length + 2)
    first, second = struct.unpack_from("<ff", body)
    if not all(math.isfinite(x) and 0 <= x <= 1000 for x in (first, second)):
        raise ValueError(f"implausible SI-850 weights: {first}, {second}")
    if abs(first - second) > 0.1:
        raise ValueError(f"SI-850 weight fields differ: {first:.1f}, {second:.1f}; check tare/format")
    return round(first, 1), hello + ack + header + body


async def poll_si850(host: str, port: int, scale_source: str, debug_raw: bool) -> None:
    """Poll the scale and relay only validated binary weight replies."""
    while True:
        writer: asyncio.StreamWriter | None = None
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=5)
            weight, raw = await si850_read_once(reader, writer)
            if debug_raw:
                print(f"[SI-850 RAW] {raw.hex(' ')}")
            payload = {
                "scale_source": scale_source,
                "weight": weight,
                "unit": "kg",
                # No stability flag has been identified in the binary reply yet.
                "stable": False,
                "received_at": datetime.now(timezone.utc).isoformat(),
            }
            latest_packets[scale_source] = payload
            await broadcast(payload)
            await report_status(scale_source, "live", f"SI-850 at {host}:{port}")
            print(f"[SI-850] {scale_source}: {weight:.1f} kg")
            if tick_pipeline is not None:
                await tick_pipeline.observe(scale_source, weight)
        except (OSError, ValueError, asyncio.TimeoutError, asyncio.IncompleteReadError) as error:
            latest_packets.pop(scale_source, None)
            await report_status(scale_source, "error", str(error))
            print(f"[-] SI-850 read failed ({host}:{port}): {error}")
        finally:
            if writer is not None:
                writer.close()
                try:
                    await writer.wait_closed()
                except ConnectionError:
                    pass
        await asyncio.sleep(SI850_POLL_SECONDS)


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
    tabs = tuple(browser_tabs)
    results = await asyncio.gather(
        *(tab.send(message) for tab in tabs),
        return_exceptions=True,
    )
    for tab, result in zip(tabs, results):
        if isinstance(result, Exception):
            browser_tabs.discard(tab)


async def report_status(source: str, state: str, detail: str) -> None:
    payload = {"event": "scale_status", "scale_source": source, "state": state,
               "detail": detail[:200], "received_at": datetime.now(timezone.utc).isoformat()}
    if device_status.get(source, {}).get("state") != state or device_status.get(source, {}).get("detail") != payload["detail"]:
        device_status[source] = payload
        await broadcast(payload)


def packet_description(packet: bytes) -> str:
    """Provide bounded safe logging for an unknown indicator protocol."""
    preview = packet[:256]
    text = preview.decode("ascii", errors="replace").replace("\r", "\\r").replace("\n", "\\n")
    suffix = " …" if len(packet) > len(preview) else ""
    return f"ASCII={text!r} HEX={preview.hex(' ')}{suffix}"


async def process_packet(packet: bytes, scale_source: str, emit_readings: bool, debug_raw: bool) -> None:
    if debug_raw:
        print(f"[RAW] {scale_source}: {packet_description(packet)}")
    if not emit_readings:
        return

    weight = parse_industrial_weight(packet)
    if weight is None:
        return
    payload = {
        "scale_source": scale_source,
        "weight": weight,
        "unit": "kg",
        "stable": True,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    latest_packets[scale_source] = payload
    await broadcast(payload)
    if tick_pipeline is not None:
        await tick_pipeline.observe(scale_source, weight)


async def handle_incoming_scale(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    emit_readings: bool,
    debug_raw: bool,
    source: str,
) -> None:
    peer = writer.get_extra_info("peername")
    scale_ip = peer[0] if peer else "unknown"
    scale_source = source if source != "Scale" else scale_ip
    print(f"[+] Scale online: {scale_ip}")
    await report_status(scale_source, "connected", f"TCP stream from {scale_ip}; waiting for validated format")
    try:
        while packet := await reader.read(1024):
            await process_packet(packet, scale_source, emit_readings, debug_raw)
    except (ConnectionError, asyncio.CancelledError) as error:
        print(f"[-] Scale link ended ({scale_ip}): {error}")
    finally:
        writer.close()
        await writer.wait_closed()
        print(f"[-] Scale offline: {scale_ip}")
        await report_status(scale_source, "offline", f"TCP stream from {scale_ip} closed")


def parse_host_port(value: str) -> tuple[str, int]:
    try:
        host, port_text = value.rsplit(":", 1)
        port = int(port_text)
        if not host or not 1 <= port <= 65535:
            raise ValueError
        return host, port
    except ValueError as error:
        raise argparse.ArgumentTypeError("use HOST:PORT, for example 192.168.50.248:4321") from error


def parse_named_device(value: str) -> tuple[str, str, int]:
    """A source ID followed by a TCP address, e.g. TANK-A@192.168.50.248:4321."""
    if "@" not in value:
        raise argparse.ArgumentTypeError("use SOURCE@HOST:PORT")
    source, address = value.split("@", 1)
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,64}", source):
        raise argparse.ArgumentTypeError("source must contain only letters, digits, _ or -")
    host, port = parse_host_port(address)
    return source, host, port


def parse_serial_device(value: str) -> tuple[str, str, int, int, str, int]:
    """SOURCE@COM3:9600:8:N:1. Use a USB-to-serial adapter's COM port too."""
    try:
        source, settings = value.split("@", 1)
        port, baud, bits, parity, stops = settings.split(":")
        baud, bits, stops = int(baud), int(bits), int(stops)
        parity = parity.upper()
        if not re.fullmatch(r"[A-Za-z0-9_-]{2,64}", source) or not port or \
                baud < 300 or baud > 115200 or bits not in (7, 8) or \
                parity not in ("N", "E", "O") or stops not in (1, 2):
            raise ValueError
        return source, port, baud, bits, parity, stops
    except (ValueError, TypeError) as error:
        raise argparse.ArgumentTypeError("use SOURCE@COM3:9600:8:N:1") from error


async def read_serial_scale(device: tuple[str, str, int, int, str, int], debug_raw: bool) -> None:
    """Read serial bytes without assuming another manufacturer's packet format."""
    source, port, baud, bits, parity, stops = device
    try:
        import serial
    except ImportError:
        await report_status(source, "error", "pyserial missing: py -m pip install pyserial")
        return
    while True:
        connection = None
        try:
            connection = await asyncio.to_thread(serial.Serial, port=port, baudrate=baud,
                bytesize=bits, parity=parity, stopbits=stops, timeout=1)
            await report_status(source, "connected", f"Serial {port}; capturing raw data pending protocol verification")
            while True:
                packet = await asyncio.to_thread(connection.read, 256)
                if packet:
                    await process_packet(packet, source, False, debug_raw)
                    await report_status(source, "capturing", f"Raw serial bytes received from {port}; decoder not verified")
        except (OSError, serial.SerialException) as error:
            await report_status(source, "error", f"{port}: {error}")
            print(f"[-] Serial {source}: {error}")
        finally:
            if connection is not None:
                await asyncio.to_thread(connection.close)
        await asyncio.sleep(3)


async def read_server_mode_scale(
    host: str,
    port: int,
    scale_source: str,
    emit_readings: bool,
    debug_raw: bool,
) -> None:
    """Connect to an indicator that is itself configured as a TCP server."""
    while True:
        writer: asyncio.StreamWriter | None = None
        try:
            print(f"[*] Connecting to {scale_source} at {host}:{port} ...")
            reader, writer = await asyncio.open_connection(host, port)
            print(f"[+] Connected to {scale_source}. Waiting for scale data.")
            await report_status(scale_source, "connected", f"TCP {host}:{port}; waiting for validated format")
            while packet := await reader.read(1024):
                await process_packet(packet, scale_source, emit_readings, debug_raw)
            print(f"[-] {scale_source} closed its connection.")
            await report_status(scale_source, "offline", f"TCP {host}:{port} closed its connection")
        except (ConnectionError, OSError, asyncio.TimeoutError) as error:
            await report_status(scale_source, "error", str(error))
            print(f"[-] {scale_source} connection failed: {error}")
        finally:
            if writer is not None:
                writer.close()
                try:
                    await writer.wait_closed()
                except ConnectionError:
                    pass
        print("[*] Retrying in 3 seconds...")
        await asyncio.sleep(3)


async def browser_handler(websocket) -> None:
    browser_tabs.add(websocket)
    print("[Chrome] Business app connected.")
    try:
        for payload in latest_packets.values():
            await websocket.send(json.dumps(payload))
        for payload in device_status.values():
            await websocket.send(json.dumps(payload))
        async for _ in websocket:
            pass
    finally:
        browser_tabs.discard(websocket)
        print("[Chrome] Business app disconnected.")


async def main(
    listen_port: int | None,
    tcp_client: tuple[str, int] | None,
    si850: tuple[str, int] | None,
    source: str,
    browser_port: int,
    emit_readings: bool,
    debug_raw: bool,
    si850_devices: list[tuple[str, str, int]],
    tcp_devices: list[tuple[str, str, int]],
    serial_devices: list[tuple[str, str, int, int, str, int]],
) -> None:
    print("[*] Launching Mahadev Scale Bridge...")
    browser_server = await websockets.serve(browser_handler, "127.0.0.1", browser_port)
    print(f"[*] Chrome bridge: ws://127.0.0.1:{browser_port}")
    tasks = [browser_server.wait_closed()]
    scale_server = None
    if listen_port is not None:
        scale_server = await asyncio.start_server(
            lambda reader, writer: handle_incoming_scale(reader, writer, emit_readings, debug_raw, source),
            "0.0.0.0",
            listen_port,
        )
        print(f"[*] Client-mode indicators can send TCP to this PC on port {listen_port}")
        tasks.append(scale_server.serve_forever())
    if tcp_client is not None:
        host, port = tcp_client
        tasks.append(read_server_mode_scale(host, port, source, emit_readings, debug_raw))
    if si850 is not None:
        host, port = si850
        tasks.append(poll_si850(host, port, source, debug_raw))
    for device_source, host, port in si850_devices:
        tasks.append(poll_si850(host, port, device_source, debug_raw))
    for device_source, host, port in tcp_devices:
        tasks.append(read_server_mode_scale(host, port, device_source, emit_readings, debug_raw))
    for device in serial_devices:
        tasks.append(read_serial_scale(device, debug_raw))
    try:
        await asyncio.gather(*tasks)
    finally:
        if scale_server is not None:
            scale_server.close()
            await scale_server.wait_closed()
        browser_server.close()
        await browser_server.wait_closed()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bridge shop scales to the Mahadev web app")
    parser.add_argument(
        "--scale-port",
        type=int,
        help="Optional TCP listener for an indicator configured as a TCP client",
    )
    parser.add_argument(
        "--tcp-client",
        type=parse_host_port,
        help="Connect to an indicator configured as a TCP server (HOST:PORT)",
    )
    parser.add_argument("--source", default="Scale", help="Name shown in the business app")
    parser.add_argument("--si850", type=parse_host_port, help="Poll an Essae SI-850 TCP server (HOST:PORT)")
    parser.add_argument("--si850-device", type=parse_named_device, action="append", default=[],
                        help="Repeat SOURCE@HOST:PORT to poll several SI-850 indicators through one browser bridge")
    parser.add_argument("--tcp-device", type=parse_named_device, action="append", default=[],
                        help="Repeat SOURCE@HOST:PORT to capture other TCP-server indicators (raw until verified)")
    parser.add_argument("--serial-device", type=parse_serial_device, action="append", default=[],
                        help="Repeat SOURCE@COM3:9600:8:N:1 for RS-232 or USB serial; raw capture until verified")
    parser.add_argument("--push-url", help="App endpoint that stores steady weights, e.g. https://your-app.vercel.app/api/scale-ticks/ingest")
    parser.add_argument("--push-secret", help="Shared secret (or set the SCALE_PUSH_SECRET environment variable)")
    parser.add_argument("--push-source", action="append", default=[],
                        help="Repeat for each scale whose steady weights are sent, e.g. PLATFORM-1. Tank scales should NOT be listed.")
    parser.add_argument("--list-serial", action="store_true", help="List Windows COM ports and exit")
    parser.add_argument("--browser-port", type=int, default=8765, help="Local WebSocket port used by Chrome")
    parser.add_argument("--emit-readings", action="store_true", help="Send parsed readings to the browser")
    parser.add_argument("--debug-raw", action="store_true", help="Print the raw data received from the indicator")
    args = parser.parse_args()
    if args.list_serial:
        try:
            from serial.tools import list_ports
            ports = list(list_ports.comports())
            for port in ports:
                print(f"{port.device}: {port.description}")
            if not ports:
                print("No COM ports detected. Check the USB/serial driver and Device Manager.")
        except ImportError:
            parser.error("install pyserial first: py -m pip install pyserial")
        raise SystemExit(0)
    if args.scale_port is None and args.tcp_client is None and args.si850 is None and not args.si850_device and not args.tcp_device and not args.serial_device:
        parser.error("provide --scale-port, --tcp-client, --si850-device, --tcp-device, or --serial-device")
    sources = ([args.source] if args.si850 or args.tcp_client or args.scale_port else []) + [x[0] for x in args.si850_device + args.tcp_device + args.serial_device]
    if len(sources) != len(set(sources)):
        parser.error("each scale source must be unique")
    if args.push_url:
        secret = args.push_secret or os.environ.get("SCALE_PUSH_SECRET", "")
        if len(secret) < 16:
            parser.error("--push-url needs a secret of 16+ characters (--push-secret or SCALE_PUSH_SECRET)")
        if not args.push_source:
            parser.error("--push-url needs at least one --push-source SCALE_NAME")
        unknown = [x for x in args.push_source if x not in sources]
        if unknown:
            parser.error(f"--push-source {', '.join(unknown)} is not one of the scales being read: {', '.join(sources)}")
        if not (args.push_url.startswith("https://") or args.push_url.startswith("http://127.0.0.1")):
            parser.error("--push-url must start with https://")
        tick_pipeline = TickPipeline(args.push_url, secret, args.push_source)
        print(f"[*] Steady weights from {', '.join(args.push_source)} will be sent to {args.push_url}")
    elif args.push_source or args.push_secret:
        parser.error("--push-source / --push-secret only work together with --push-url")
    # Unknown formats must be inspected before publishing numeric data.
    emit_readings = args.emit_readings
    try:
        asyncio.run(
            main(
                args.scale_port,
                args.tcp_client,
                args.si850,
                args.source,
                args.browser_port,
                emit_readings,
                args.debug_raw,
                args.si850_device,
                args.tcp_device,
                args.serial_device,
            )
        )
    except KeyboardInterrupt:
        print("\n[*] Bridge closed safely.")
