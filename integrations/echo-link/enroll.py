#!/usr/bin/env python3
"""Interactive local Alexa enrollment for the Echo Link sidecar."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aiohttp
from alexapy.secureauth import EnrollmentFlow


async def enroll(domain: str, output: Path, clipboard: bool) -> None:
    flow = EnrollmentFlow(domain=domain)
    print("Open this URL in your own browser:\n", flush=True)
    print(flow.oauth_url, flush=True)
    if clipboard:
        input("After Amazon redirects, copy the complete address-bar URL, then press Return.\n> ")
        try:
            redirect = subprocess.check_output(["pbpaste"], text=True).strip()
        except (OSError, subprocess.CalledProcessError) as exc:
            raise SystemExit("Could not read the macOS clipboard with pbpaste.") from exc
    else:
        redirect = input("Paste the complete Amazon redirect URL:\n> ").strip()
    parsed = urlparse(redirect)
    if parsed.scheme != "https" or not parsed.netloc.endswith("amazon.com") or parsed.path != "/ap/maplanding":
        raise SystemExit("Expected an https://*.amazon.com/ap/maplanding redirect URL.")
    print(f"Redirect fields found: {', '.join(sorted(parse_qs(parsed.query, keep_blank_values=True)))}", flush=True)
    code = flow.parse_redirect_url(redirect)
    async with aiohttp.ClientSession() as session:
        try:
            credentials = await asyncio.wait_for(flow.async_register(session, code), timeout=30)
        except asyncio.TimeoutError as exc:
            raise SystemExit("Amazon did not respond within 30 seconds; retry enrollment.") from exc
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    output.write_text(json.dumps(credentials.as_dict(), indent=2) + "\n")
    os.chmod(output, 0o600)
    print(f"Saved Alexa credentials to {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", default="amazon.com")
    parser.add_argument("--output", required=True)
    parser.add_argument("--clipboard", action="store_true")
    args = parser.parse_args()
    asyncio.run(enroll(args.domain, Path(args.output).expanduser().resolve(), args.clipboard))


if __name__ == "__main__":
    main()
