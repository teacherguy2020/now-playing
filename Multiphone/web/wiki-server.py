#!/usr/bin/env python3
"""Serve the generated Multiphone wiki locally."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT / "site")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print("Multiphone wiki: http://<Mac-LAN-IP>:8766/", flush=True)
    # LAN-only convenience for viewing from an iPad on the same network.
    ThreadingHTTPServer(("0.0.0.0", 8766), Handler).serve_forever()
