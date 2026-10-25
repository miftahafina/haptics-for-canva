"""Protocol-only tests: do not trigger physical haptics or install a helper."""
import json
import pathlib
import struct
import subprocess
import unittest

HOST = pathlib.Path(__file__).resolve().parents[1] / "native/build/canva-haptic-host"


def frame(message):
    body = json.dumps(message).encode()
    return struct.pack("<I", len(body)) + body


def decode(data):
    messages = []
    while data:
        if len(data) < 4:
            raise AssertionError("Incomplete frame header")
        length = struct.unpack("<I", data[:4])[0]
        body, data = data[4:4 + length], data[4 + length:]
        if len(body) != length:
            raise AssertionError("Incomplete frame body")
        messages.append(json.loads(body))
    return messages


class NativeProtocolTests(unittest.TestCase):
    def run_host(self, data):
        result = subprocess.run([str(HOST)], input=data, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        return decode(result.stdout)

    def test_ping_and_unknown_command_on_same_connection(self):
        result = self.run_host(frame({"id": 1, "command": "ping"}) + frame({"id": 2, "command": "invalid"}))
        self.assertEqual(result, [
            {"id": 1, "ok": True, "version": "0.1.0"},
            {"id": 2, "ok": False, "error": "Unknown command"},
        ])

    def test_empty_input(self):
        self.assertEqual(self.run_host(b""), [])

    def test_truncated_frame(self):
        self.assertEqual(self.run_host(struct.pack("<I", 50) + b"{}"), [])

    def test_oversized_frame(self):
        self.assertEqual(self.run_host(struct.pack("<I", 65537)), [])

    def test_invalid_json(self):
        self.assertEqual(self.run_host(struct.pack("<I", 1) + b"!"), [])


if __name__ == "__main__":
    unittest.main()
