#!/usr/bin/env python3
"""Loopback Echo Link volume sidecar for the Now Playing service."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse


def normalize_percent(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("volume must be a number from 0 to 100")
    if not 0 <= value <= 100:
        raise ValueError("volume must be a number from 0 to 100")
    return round(value)


def normalize_delta(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("delta must be a number")
    if not -100 <= value <= 100:
        raise ValueError("delta must be between -100 and 100")
    return round(value)


def select_device(
    devices: list[dict],
    device_type: str,
    serial: str,
    account_name: str,
) -> dict:
    """Select the exact device; account name is only a sanity check."""
    candidates = [
        d for d in devices
        if d.get("deviceType") == device_type and d.get("serialNumber") == serial
    ]
    if len(candidates) != 1:
        raise ValueError("expected exactly one matching Echo Link device")
    device = candidates[0]
    if account_name and device.get("accountName") != account_name:
        raise ValueError("Echo Link identity/account name mismatch")
    return device


def serial_suffix(serial: str | None) -> str | None:
    value = str(serial or "").strip()
    return value[-4:] if value else None


class VolumeState:
    def __init__(self, path: str | Path):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            self.path.chmod(0o600)
        except FileNotFoundError:
            pass
        self.data = self._load()

    def _load(self) -> dict:
        try:
            raw = json.loads(self.path.read_text())
        except (FileNotFoundError, OSError, ValueError, TypeError):
            raw = {}
        desired = raw.get("desired_volume")
        previous = raw.get("last_nonzero_volume")
        return {
            "desired_volume": desired if isinstance(desired, int) and 0 <= desired <= 100 else None,
            "last_nonzero_volume": previous if isinstance(previous, int) and 1 <= previous <= 100 else None,
            "muted": raw.get("muted") if isinstance(raw.get("muted"), bool) else None,
        }

    def save(self) -> None:
        tmp = self.path.with_name(f".{self.path.name}.tmp-{os.getpid()}-{threading.get_ident()}")
        tmp.write_text(json.dumps(self.data, sort_keys=True) + "\n")
        tmp.chmod(0o600)
        os.replace(tmp, self.path)

    def after_successful_volume(self, volume: int) -> None:
        self.data["desired_volume"] = volume
        self.data["muted"] = volume == 0
        if volume > 0:
            self.data["last_nonzero_volume"] = volume
        self.save()

    def after_successful_mute(self) -> None:
        self.data["desired_volume"] = 0
        self.data["muted"] = True
        self.save()


class EchoLinkController:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.login = None
        self.api = None
        self.device: dict | None = None
        self.devices: list[dict] = []
        self.loop: asyncio.AbstractEventLoop | None = None
        self.loop_thread: threading.Thread | None = None
        self.state = VolumeState(args.state_file)
        self.last_error: str | None = None
        self.auth_required = False
        self.last_connect_attempt = 0.0
        self.connect_lock: asyncio.Lock | None = None

    def start(self) -> None:
        ready = threading.Event()

        def runner() -> None:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            self.connect_lock = asyncio.Lock()
            ready.set()
            self.loop.run_forever()

        self.loop_thread = threading.Thread(target=runner, name="echo-link-asyncio", daemon=True)
        self.loop_thread.start()
        ready.wait(timeout=5)
        if self.loop is None:
            raise RuntimeError("controller loop did not start")

    def run(self, awaitable, timeout: float = 15):
        if self.loop is None:
            raise RuntimeError("controller loop is not running")
        return asyncio.run_coroutine_threadsafe(awaitable, self.loop).result(timeout=timeout)

    async def connect(self) -> None:
        try:
            from alexapy import AlexaAPI, AlexaLogin
        except ImportError as exc:
            raise RuntimeError("alexapy is not installed") from exc

        credentials_path = Path(self.args.credentials).expanduser()
        if not credentials_path.is_file():
            raise RuntimeError("Alexa credentials are not enrolled")
        data_dir = Path(self.args.data_dir).expanduser().resolve()
        data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        (data_dir / ".storage").mkdir(mode=0o700, exist_ok=True)
        self.login = AlexaLogin(
            "amazon.com",
            self.args.email,
            "",
            lambda suffix: str(data_dir / suffix),
            oauth=json.loads(credentials_path.read_text()),
        )
        await self.login.login()
        devices = await AlexaAPI.get_devices(self.login)
        if not devices:
            raise RuntimeError("Amazon returned no Alexa devices")
        self.devices = devices
        if self.args.list_devices:
            return
        self.device = select_device(
            devices,
            self.args.device_type,
            self.args.device_serial,
            self.args.account_name,
        )
        wrapper = SimpleNamespace(
            _device_type=self.device["deviceType"],
            device_serial_number=self.device["serialNumber"],
            _locale=self.device.get("locale", "en-US"),
        )
        self.api = AlexaAPI(wrapper, self.login)
        self.last_error = None
        self.auth_required = False

    async def ensure_connected(self) -> None:
        if self.api:
            return
        now = time.monotonic()
        if now - self.last_connect_attempt < 5:
            raise RuntimeError(self.last_error or "Echo Link is unavailable")
        self.last_connect_attempt = now
        if self.connect_lock is None:
            raise RuntimeError("controller loop is not ready")
        async with self.connect_lock:
            if self.api:
                return
            try:
                await self.connect()
            except Exception as exc:
                message = str(exc).lower()
                self.auth_required = any(token in message for token in ("auth", "login", "cookie", "oauth", "credential"))
                self.last_error = "Alexa authentication required" if self.auth_required else "Amazon Echo Link unavailable"
                raise RuntimeError(self.last_error) from exc

    @staticmethod
    def _remote_volume(state: dict) -> tuple[int | None, bool | None]:
        player_info = state.get("playerInfo") if isinstance(state, dict) else None
        if not isinstance(player_info, dict):
            player_info = {}
        volume = state.get("volume") if isinstance(state, dict) else None
        if not isinstance(volume, dict):
            volume = player_info.get("volume") if isinstance(player_info.get("volume"), dict) else {}
        value = volume.get("volume")
        remote = normalize_percent(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
        muted = volume.get("muted") if isinstance(volume.get("muted"), bool) else None
        return remote, muted

    async def status(self) -> dict:
        payload = {
            "ok": True,
            "ready": False,
            "authRequired": self.auth_required,
            "desiredVolume": self.state.data["desired_volume"],
            "lastNonzeroVolume": self.state.data["last_nonzero_volume"],
            "muted": self.state.data["muted"],
            "remoteVolume": None,
            "device": None,
        }
        if not self.api:
            payload["error"] = self.last_error
            return payload
        try:
            remote_state = await self.api.get_state()
            remote_volume, remote_muted = self._remote_volume(remote_state or {})
            payload.update({
                "ready": True,
                "remoteVolume": remote_volume,
                "remoteMuted": remote_muted,
                "device": {
                    "accountName": self.device.get("accountName"),
                    "deviceType": self.device.get("deviceType"),
                    "serialSuffix": serial_suffix(self.device.get("serialNumber")),
                },
            })
            return payload
        except Exception as exc:
            self.api = None
            self.last_error = "Amazon Echo Link unavailable"
            payload["error"] = self.last_error
            raise RuntimeError(self.last_error) from exc

    async def set_volume(self, volume: int) -> dict:
        await self.ensure_connected()
        await self.api.set_volume(volume / 100)
        self.state.after_successful_volume(volume)
        return await self.status()

    async def mute(self, muted: bool) -> dict:
        await self.ensure_connected()
        if muted:
            remembered = self.state.data["desired_volume"]
            if isinstance(remembered, int) and remembered > 0:
                self.state.data["last_nonzero_volume"] = remembered
                self.state.save()
            await self.api.set_volume(0)
            self.state.after_successful_mute()
        else:
            remembered = self.state.data["last_nonzero_volume"]
            if not isinstance(remembered, int) or remembered <= 0:
                raise ValueError("no remembered nonzero volume")
            await self.api.set_volume(remembered / 100)
            self.state.after_successful_volume(remembered)
        return await self.status()

    async def step(self, delta: int) -> dict:
        desired = self.state.data["desired_volume"]
        if not isinstance(desired, int):
            raise ValueError("volume is unknown; set an absolute volume first")
        return await self.set_volume(normalize_percent(desired + delta))


class Handler(BaseHTTPRequestHandler):
    controller: EchoLinkController

    def send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, sort_keys=True).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/echo-link/status":
            self.send_json(404, {"ok": False, "error": "not found"})
            return
        try:
            self.send_json(200, self.controller.run(self.controller.status()))
        except Exception:
            self.send_json(503, {"ok": False, "error": "Echo Link unavailable"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            path = urlparse(self.path).path
            if path == "/echo-link/volume":
                result = self.controller.run(self.controller.set_volume(normalize_percent(body["volume"])))
            elif path == "/echo-link/mute":
                if not isinstance(body.get("mute"), bool):
                    raise ValueError("mute must be boolean")
                result = self.controller.run(self.controller.mute(body["mute"]))
            elif path == "/echo-link/step":
                result = self.controller.run(self.controller.step(normalize_delta(body["delta"])))
            else:
                self.send_json(404, {"ok": False, "error": "not found"})
                return
            self.send_json(200, result)
        except (KeyError, TypeError, ValueError) as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception:
            self.send_json(503, {"ok": False, "error": "Echo Link unavailable"})

    def log_message(self, *_args: object) -> None:
        pass


def self_test() -> None:
    import tempfile

    assert normalize_percent(35) == 35
    assert normalize_delta(-5) == -5
    device = {
        "accountName": "Main Floor Echo Link",
        "deviceType": "A27VEYGQBW3YR5",
        "serialNumber": "SERIAL-02CH",
    }
    assert select_device([device], "A27VEYGQBW3YR5", "SERIAL-02CH", "Main Floor Echo Link") == device
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "state.json"
        state = VolumeState(path)
        assert state.data["desired_volume"] is None
        state.after_successful_volume(35)
        state.after_successful_mute()
        restored = VolumeState(path)
        assert restored.data == {"desired_volume": 0, "last_nonzero_volume": 35, "muted": True}
    for bad in (-1, 101, True):
        try:
            normalize_percent(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("range validation failed")
    print("self-test: PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    # OAuth credentials carry the Amazon account identity. alexapy accepts a
    # non-email placeholder and then validates the identity returned by
    # Amazon, so the account email need not be stored in deployment config.
    parser.add_argument("--email", default=os.environ.get("ECHO_LINK_EMAIL", "_"))
    parser.add_argument("--device-type", default=os.environ.get("ECHO_LINK_DEVICE_TYPE", "A27VEYGQBW3YR5"))
    parser.add_argument("--device-serial", default=os.environ.get("ECHO_LINK_DEVICE_SERIAL"))
    parser.add_argument("--account-name", default=os.environ.get("ECHO_LINK_ACCOUNT_NAME", "Main Floor Echo Link"))
    parser.add_argument("--list-devices", action="store_true")
    parser.add_argument("--data-dir", default=os.environ.get("ECHO_LINK_DATA_DIR", "~/.local/share/echo-link-volume"))
    parser.add_argument("--credentials", default=os.environ.get("ECHO_LINK_CREDENTIALS"))
    parser.add_argument("--state-file", default=os.environ.get("ECHO_LINK_STATE", "~/.local/share/echo-link-volume/state.json"))
    parser.add_argument("--host", default=os.environ.get("ECHO_LINK_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("ECHO_LINK_PORT", "8765")))
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.credentials:
        parser.error("live mode requires ECHO_LINK_CREDENTIALS")
    if not args.list_devices and not args.device_serial:
        parser.error("live mode requires ECHO_LINK_DEVICE_SERIAL")
    controller = EchoLinkController(args)
    controller.start()
    try:
        controller.run(controller.connect())
    except Exception as exc:
        controller.last_error = "Alexa authentication required" if "auth" in str(exc).lower() else "Amazon Echo Link unavailable"
        controller.auth_required = "auth" in str(exc).lower()
    if args.list_devices:
        for device in controller.devices:
            print(json.dumps({
                "account_name": device.get("accountName"),
                "device_type": device.get("deviceType"),
                "serial": device.get("serialNumber"),
                "model": device.get("deviceFamily"),
            }, sort_keys=True))
        return
    Handler.controller = controller
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
