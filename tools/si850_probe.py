"""One-shot, read-only SI-850 Ethernet probe from a captured Read Weight exchange.

Close Essae's PC software and the scale_bridge before running this probe.
The messages below were recorded while Essae's PC software displayed a weight
using the Read Weight function. This tool never issues tare or rezero commands
and does not send data to the business app.
"""

from __future__ import annotations

import argparse
import math
import socket
import struct


HELLO = bytes.fromhex("11 01 00 00 ee ff")
READ_WEIGHT = bytes.fromhex("33 02 01 00 ca ff 25 db ff")
HELLO_REPLY = bytes.fromhex("66 01 00 02 97 ff")
WEIGHT_REPLY = bytes.fromhex("22 03 5f 00 7c ff")


def read_exact(connection: socket.socket, count: int) -> bytes:
    result = bytearray()
    while len(result) < count:
        chunk = connection.recv(count - len(result))
        if not chunk:
            break
        result.extend(chunk)
    return bytes(result)


def main(host: str, port: int) -> None:
    try:
        with socket.create_connection((host, port), timeout=5) as connection:
            connection.settimeout(3)
            print(f"Connected to {host}:{port}")
            connection.sendall(HELLO)
            hello_reply = read_exact(connection, len(HELLO_REPLY))
            print(f"Handshake reply: {hello_reply.hex(' ')}")
            if not hello_reply.startswith(HELLO_REPLY):
                print("Unexpected handshake reply. No further request was sent.")
                return

            connection.sendall(READ_WEIGHT)
            response = bytearray()
            while len(response) < 4096:
                try:
                    chunk = connection.recv(4096)
                except socket.timeout:
                    break
                if not chunk:
                    break
                response.extend(chunk)
                start = response.find(WEIGHT_REPLY)
                if start >= 0 and len(response) >= start + len(WEIGHT_REPLY) + 8:
                    break

            print(f"Weight reply ({len(response)} bytes): {response.hex(' ')}")
            start = response.find(WEIGHT_REPLY)
            if start < 0 or len(response) < start + len(WEIGHT_REPLY) + 8:
                print("No complete weight response detected. Share this console output.")
                return

            values = struct.unpack_from("<ff", response, start + len(WEIGHT_REPLY))
            if not all(math.isfinite(value) and 0 <= value <= 100_000 for value in values):
                print("Received data, but the candidate weights are invalid. Share this console output.")
                return
            print(f"Candidate display weights: {values[0]:.1f} kg, {values[1]:.1f} kg")
            print("Compare with the number currently shown on the SI-850 display.")
    except (ConnectionError, OSError, socket.timeout) as error:
        print(f"Connection or read failed: {error}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Read a single SI-850 weight for protocol validation")
    parser.add_argument("--host", default="192.168.50.248")
    parser.add_argument("--port", type=int, default=4321)
    arguments = parser.parse_args()
    main(arguments.host, arguments.port)
