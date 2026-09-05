#!/usr/bin/env python3
"""Keyboard prototype for the Shyvers Multiphone operator flow."""

import argparse
import json
import os
import shutil
import sys
import subprocess
import urllib.error
import urllib.request


def submit(number, *, endpoint, track_key, dry_run=False, defer_playback=False):
    payload_data = {"number": number, "dryRun": dry_run}
    if defer_playback:
        payload_data["deferPlayback"] = True
    payload = json.dumps(payload_data).encode()
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json", **({"X-Track-Key": track_key} if track_key else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        raise RuntimeError(f"Now Playing returned HTTP {error.code}: {detail or 'request rejected'}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Now Playing: {error.reason}") from error


KEYCHAIN_SERVICE = "Shyvers Multiphone / Now Playing"
KEYCHAIN_ACCOUNT = "multiphone-operator"


def keychain_key():
    """Return the local Keychain value without displaying it."""
    security = shutil.which("security")
    if not security:
        return ""
    result = subprocess.run(
        [security, "find-generic-password", "-s", KEYCHAIN_SERVICE,
         "-a", KEYCHAIN_ACCOUNT, "-w"],
        capture_output=True, text=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def setup_keychain():
    """Prompt macOS security(1) for the key without placing it in argv."""
    security = shutil.which("security")
    if not security:
        raise RuntimeError("macOS security utility is unavailable")
    result = subprocess.run(
        [security, "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE,
         "-a", KEYCHAIN_ACCOUNT, "-w"],
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Keychain setup was not completed")
    if not keychain_key():
        raise RuntimeError("Keychain item was not readable after setup")


def main():
    parser = argparse.ArgumentParser(description="Test the Multiphone number request flow")
    parser.add_argument("--number", type=int, help="submit one number and exit")
    parser.add_argument("--station", default="bar", help="station name for future call-session support")
    parser.add_argument("--dry-run", action="store_true", help="resolve without changing playback")
    parser.add_argument("--setup-keychain", action="store_true", help="securely add/update the Now Playing key in macOS Keychain")
    args = parser.parse_args()
    if args.setup_keychain:
        setup_keychain()
        print("Now Playing track key saved in macOS Keychain.")
        return 0
    endpoint = os.environ.get("NOW_PLAYING_MULTIPHONE_URL", "http://10.0.0.4:3101/integrations/multiphone/selection")
    track_key = keychain_key() or os.environ.get("NOW_PLAYING_TRACK_KEY", "")

    print(f"Mabel keyboard simulator · station: {args.station}")
    print("Enter a playlist number, or q to quit.")
    while True:
        try:
            raw = str(args.number) if args.number is not None else input("Multiphone number> ").strip()
            if raw.lower() in {"q", "quit", "exit"}: return 0
            if not raw.isdigit() or int(raw) < 1:
                print("Please enter a positive whole-number selection.")
                if args.number is not None: return 2
                continue
            result = submit(int(raw), endpoint=endpoint, track_key=track_key, dry_run=args.dry_run)
            if result.get("ok"):
                action = "would queue" if args.dry_run else "queued"
                print(f"Mabel: {action} {result.get('file', 'the selection')} (number {raw}).")
            else:
                print(f"Mabel: The request was not accepted: {result.get('error', 'unknown error')}")
            if args.number is not None: return 0 if result.get("ok") else 1
        except (KeyboardInterrupt, EOFError):
            print(); return 0
        except RuntimeError as error:
            print(f"Mabel: I’m sorry, the central station could not be reached. ({error})", file=sys.stderr)
            if args.number is not None: return 1


if __name__ == "__main__":
    raise SystemExit(main())
