#!/usr/bin/env python3
"""Keyboard console for exercising a local Mabel session."""

import argparse
import json
import urllib.request


def post(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode())


def main():
    parser = argparse.ArgumentParser(description="Test Mabel's coin and number conversation")
    parser.add_argument("--url", default="http://127.0.0.1:8788")
    parser.add_argument("--station", default="bar")
    args = parser.parse_args()
    call = post(f"{args.url}/shyvers/call", {"event": "coin", "station": args.station})
    print("Mabel: Thanks for calling Multiphone! This is Mabel! What song number?")
    print(f"Session: {call['sessionId']}")
    while True:
        raw = input("Number (q to quit)> ").strip()
        if raw.lower() in {"q", "quit", "exit"}:
            return 0
        if not raw.isdigit() or int(raw) < 1:
            print("Please enter a positive whole number.")
            continue
        result = post(f"{args.url}/shyvers/response", {"sessionId": call["sessionId"], "number": int(raw)})
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
