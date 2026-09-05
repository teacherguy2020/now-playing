#!/usr/bin/env python3
"""LAN HTTPS handset for iPad-based Mabel calls.

The browser owns microphone/speaker media. This process keeps the permanent
OpenAI key on the Mac, mints an ephemeral Realtime token, and proxies the
local Mabel/Now Playing bridge endpoints.
"""

import argparse
import json
import mimetypes
import os
import re
import ssl
import subprocess
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import uuid

from mabel_voice import keychain_value, OPENAI_ACCOUNT, OPENAI_SERVICE

HANDSET_INSTRUCTIONS = (
    "You are Mabel, a 22-year-old 1940s telephone operator and record spinner "
    "for Multiphone in Seattle, Washington. English is mandatory: speak only "
    "American English in every response, even if the caller speaks another "
    "language or the transcription is uncertain. Never answer in Portuguese, "
    "Spanish, French, or any other language. Be bright, youthful, energetic, "
    "fast, lightly sassy, humorous, and professionally demure. This is the "
    "VIP line and the call is already off-script. Begin with exactly this "
    "English greeting: 'Thanks for calling the VIP line—Mabel here at "
    "Multiphone! Whaddya wanna hear?' Do not translate, paraphrase, or add "
    "anything before that greeting. Use only the bounded music tools and "
    "trust their results. After successful album, artist, playlist, or mix "
    "playback, confirm briefly, say goodbye, and end the call. The direct "
    "song-transmission line serves Clem's Place, a lively bar in Seattle. "
    "Mention Clem's Place occasionally when natural, but do not force it into "
    "every reply or imply that you are connecting the caller to the bar."
)

NORMAL_HANDSET_INSTRUCTIONS = (
    "You are Mabel, a 22-year-old 1940s telephone operator and record spinner "
    "for Multiphone in Seattle, Washington. Speak only American English. Be "
    "bright, brisk, energetic, lightly sassy, humorous, and professionally "
    "demure. This is the normal Multiphone line, not VIP and not off-script. "
    "Greet the caller briefly with Multiphone, identify yourself as Mabel, "
    "acknowledge that the call is coming from Clem's Place, and "
    "ask for a song number from 1 through 170. Use only the validated numbered "
    "tool; do not use off-script music tools or invent catalog details. After a "
    "successful record request, announce the supplied result, say goodbye, and end. "
    "The direct song-transmission line serves Clem's Place, a lively bar in "
    "Seattle. Mention Clem's Place occasionally when natural, but do not force "
    "it into every reply."
)

TEXT_MODEL = "gpt-4o-mini"
MAX_MULTIPHONE_NUMBER = 170
TEXT_GREETING = "Thanks for calling the VIP line—Mabel here at Multiphone! Whaddya wanna hear?"
TEXT_SESSIONS = {}
TEXT_LOCK = threading.Lock()

TEXT_INSTRUCTIONS = (
    "You are Mabel, a 22-year-old 1940s telephone operator and record spinner "
    "for Multiphone in Seattle, Washington. Reply only in American English. "
    "Be bright, youthful, energetic, lightly sassy, concise, and professionally "
    "demure. This is the VIP line, so the caller already knows the available "
    "advanced requests; do not explain the tool categories. Personal questions "
    "get a brief pleasant answer without private details, followed by a natural "
    "redirect to what they would like to hear. Use only the bounded tools for "
    "playback and now-playing information. Never invent titles, artists, queue "
    "results, or playback status. For a successful album, artist, playlist, or "
    "mix action, confirm briefly and say a varied goodbye; do not ask another "
    "question. A now-playing request may continue the conversation. For a valid "
        "number from 1 through 170, use submit_multiphone_number. If the caller says "
    "goodbye, reply warmly and do not ask another question. The direct song-"
    "transmission line serves Clem's Place, a lively bar in Seattle; mention it "
    "occasionally when natural, but do not force the reference. Keep replies short "
    "enough for an iPad text conversation."
)

TEXT_TOOLS = [
    {
        "type": "function", "name": "submit_multiphone_number",
        "description": "Queue a valid Multiphone song number from 1 through 170.",
        "parameters": {"type": "object", "properties": {
            "number": {"type": "integer", "minimum": 1, "maximum": MAX_MULTIPHONE_NUMBER}
        }, "required": ["number"], "additionalProperties": False},
        "strict": True,
    },
    {
        "type": "function", "name": "offscript_play_album",
        "description": "Play a matching album.",
        "parameters": {"type": "object", "properties": {
            "album": {"type": "string", "minLength": 1, "maxLength": 200}
        }, "required": ["album"], "additionalProperties": False},
        "strict": True,
    },
    {
        "type": "function", "name": "offscript_play_artist",
        "description": "Play matching music by an artist, shuffled.",
        "parameters": {"type": "object", "properties": {
            "artist": {"type": "string", "minLength": 1, "maxLength": 200}
        }, "required": ["artist"], "additionalProperties": False},
        "strict": True,
    },
    {
        "type": "function", "name": "offscript_play_playlist",
        "description": "Play a matching saved playlist.",
        "parameters": {"type": "object", "properties": {
            "playlist": {"type": "string", "minLength": 1, "maxLength": 200}
        }, "required": ["playlist"], "additionalProperties": False},
        "strict": True,
    },
    {
        "type": "function", "name": "offscript_play_mix",
        "description": "Build and play a shuffled mix of two or more artists.",
        "parameters": {"type": "object", "properties": {
            "artists": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 120}, "minItems": 2, "maxItems": 8}
        }, "required": ["artists"], "additionalProperties": False},
        "strict": True,
    },
    {
        "type": "function", "name": "offscript_now_playing",
        "description": "Report what is currently playing.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        "strict": True,
    },
]


def realtime_tools():
    """Return Realtime-compatible tools; strict is Responses-only here."""
    return [{key: value for key, value in tool.items() if key != "strict"}
            for tool in TEXT_TOOLS]


def openai_json(server, payload):
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {server.openai_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        raise RuntimeError(f"OpenAI text request returned HTTP {error.code}: {detail[:300]}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach OpenAI: {error.reason}") from error


def bridge_json(server, path, payload):
    request = urllib.request.Request(
        f"{server.bridge_url}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=95) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        try:
            return json.loads(detail or "{}")
        except ValueError:
            return {"ok": False, "error": detail or f"bridge HTTP {error.code}"}
    except urllib.error.URLError as error:
        raise RuntimeError(f"Mabel bridge unavailable: {error.reason}") from error


def response_text(payload):
    direct = str(payload.get("output_text") or "").strip()
    if direct:
        return direct
    parts = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                parts.append(str(content["text"]).strip())
    return " ".join(parts).strip()


def response_function_calls(payload):
    return [item for item in payload.get("output", []) if item.get("type") == "function_call"]


def goodbye_text(text):
    return bool(re.search(r"\b(?:bye|goodbye|buh[- ]?bye|farewell|take care|call again|good night|see ya|catch ya later)\b", str(text or ""), re.I))


def execute_text_tool(server, state, call):
    try:
        arguments = json.loads(call.get("arguments") or "{}")
    except (TypeError, json.JSONDecodeError):
        return {"ok": False, "error": "The tool arguments were invalid."}, False
    name = str(call.get("name") or "")
    session_id = state["bridge_session_id"]
    if name == "submit_multiphone_number":
        number = arguments.get("number")
        if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= MAX_MULTIPHONE_NUMBER:
            return {"ok": False, "error": "The song number must be between 1 and 170."}, False
        return bridge_json(server, "/shyvers/response", {
            "sessionId": session_id, "number": number, "suppressSpeech": True,
        }), False
    action = name.removeprefix("offscript_")
    if action not in {"play_album", "play_artist", "play_playlist", "play_mix", "now_playing"}:
        return {"ok": False, "error": "Unsupported Mabel action."}, False
    body = {"sessionId": session_id, "action": action}
    if action == "play_album":
        body["album"] = str(arguments.get("album") or "")[:200]
    elif action == "play_artist":
        body["artist"] = str(arguments.get("artist") or "")[:200]
    elif action == "play_playlist":
        body["playlist"] = str(arguments.get("playlist") or "")[:200]
    elif action == "play_mix":
        body["artists"] = arguments.get("artists") if isinstance(arguments.get("artists"), list) else []
    result = bridge_json(server, "/shyvers/offscript", body)
    return result, action != "now_playing" and bool(result.get("ok"))


def text_converse(server, state, user_text):
    request = {"model": TEXT_MODEL, "instructions": TEXT_INSTRUCTIONS,
               "tools": TEXT_TOOLS, "input": user_text}
    if state.get("previous_response_id"):
        request["previous_response_id"] = state["previous_response_id"]
    response = openai_json(server, request)
    for _ in range(3):
        calls = response_function_calls(response)
        if not calls:
            state["previous_response_id"] = response.get("id")
            message = response_text(response) or "Whaddya wanna hear?"
            if goodbye_text(message):
                state["ending"] = True
            return message, state.get("ending", False)
        outputs = []
        playback_ended = False
        for call in calls:
            result, ended = execute_text_tool(server, state, call)
            playback_ended = playback_ended or ended
            outputs.append({"type": "function_call_output", "call_id": call.get("call_id"),
                            "output": json.dumps(result)})
        if playback_ended:
            state["ending"] = True
        followup = TEXT_INSTRUCTIONS
        if playback_ended:
            followup += " The playback action succeeded. Confirm it briefly, say goodbye, and do not ask another question; this is the final reply."
        else:
            followup += " Use the exact tool result in your reply. Do not claim anything the result does not say."
        response = openai_json(server, {"model": TEXT_MODEL, "instructions": followup,
                                        "tools": TEXT_TOOLS, "previous_response_id": response.get("id"),
                                        "input": outputs})
    state["previous_response_id"] = response.get("id")
    return response_text(response) or "I am sorry, I could not complete that request.", state.get("ending", False)


class HandsetHandler(BaseHTTPRequestHandler):
    server_version = "MabelHandset/0.1"

    def log_message(self, format, *args):
        print("Mabel handset:", format % args, flush=True)

    def send_bytes(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        self.send_bytes(status, json.dumps(payload).encode(), "application/json")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            body = self.server.index_path.read_bytes()
            return self.send_bytes(200, body, "text/html; charset=utf-8")
        if path == "/realtime-token":
            return self.realtime_token()
        if path == "/health":
            return self.send_json(200, {"ok": True, "service": "mabel-handset", "version": "0.1"})
        if path.startswith("/sounds/"):
            sound = (self.server.sounds_dir / Path(path.removeprefix("/sounds/"))).resolve()
            if self.server.sounds_dir not in sound.parents or not sound.is_file():
                return self.send_json(404, {"ok": False, "error": "not found"})
            content_type = mimetypes.guess_type(sound.name)[0] or "application/octet-stream"
            return self.send_bytes(200, sound.read_bytes(), content_type)
        return self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/realtime-token":
            try:
                body = self.read_json()
            except (ValueError, TypeError):
                return self.send_json(400, {"ok": False, "error": "invalid JSON"})
            return self.realtime_token(str(body.get("mode") or "vip").strip().lower())
        if path == "/text-call":
            if not self.server.openai_key:
                return self.send_json(503, {"ok": False, "error": "OpenAI API key is not configured on the Mac"})
            try:
                bridge = bridge_json(self.server, "/shyvers/call", {
                    "event": "coin", "station": "iPad Text VIP", "suppressGreeting": True,
                })
            except RuntimeError as error:
                return self.send_json(503, {"ok": False, "error": str(error)})
            if not bridge.get("ok") or not bridge.get("sessionId"):
                return self.send_json(502, {"ok": False, "error": bridge.get("error", "Mabel bridge could not open a session")})
            session_id = uuid.uuid4().hex
            with TEXT_LOCK:
                TEXT_SESSIONS[session_id] = {
                    "bridge_session_id": bridge["sessionId"],
                    "previous_response_id": None,
                    "ending": False,
                }
            return self.send_json(201, {"ok": True, "sessionId": session_id,
                                        "reply": TEXT_GREETING, "mode": "text-vip"})
        if path == "/text-message":
            try:
                body = self.read_json()
            except (ValueError, TypeError):
                return self.send_json(400, {"ok": False, "error": "invalid JSON"})
            session_id = str(body.get("sessionId") or "")
            message = str(body.get("text") or "").strip()[:1000]
            if not message:
                return self.send_json(400, {"ok": False, "error": "text is required"})
            with TEXT_LOCK:
                state = TEXT_SESSIONS.get(session_id)
            if not state:
                return self.send_json(404, {"ok": False, "error": "text session not found or already ended"})
            try:
                reply, ended = text_converse(self.server, state, message)
            except (RuntimeError, ValueError) as error:
                return self.send_json(502, {"ok": False, "error": str(error)})
            if ended:
                bridge_json(self.server, "/shyvers/end", {"sessionId": state["bridge_session_id"]})
                with TEXT_LOCK:
                    TEXT_SESSIONS.pop(session_id, None)
            return self.send_json(200, {"ok": True, "reply": reply, "ended": ended})
        if path == "/text-end":
            try:
                body = self.read_json()
            except (ValueError, TypeError):
                return self.send_json(400, {"ok": False, "error": "invalid JSON"})
            session_id = str(body.get("sessionId") or "")
            with TEXT_LOCK:
                state = TEXT_SESSIONS.pop(session_id, None)
            if state:
                bridge_json(self.server, "/shyvers/end", {"sessionId": state["bridge_session_id"]})
            return self.send_json(200, {"ok": True})
        if path in {"/shyvers/call", "/shyvers/response", "/shyvers/offscript", "/shyvers/end"}:
            return self.proxy_to_bridge(path)
        return self.send_json(404, {"ok": False, "error": "not found"})

    def realtime_token(self, mode="vip"):
        api_key = self.server.openai_key
        if not api_key:
            return self.send_json(503, {"ok": False, "error": "OpenAI API key is not configured on the Mac"})
        normal_mode = mode == "normal"
        session = {
            "type": "realtime",
            "model": self.server.model,
            "instructions": NORMAL_HANDSET_INSTRUCTIONS if normal_mode else HANDSET_INSTRUCTIONS,
            "audio": {
                "input": {
                    "transcription": {
                        "model": "gpt-4o-transcribe",
                        "language": "en",
                        "prompt": "The caller speaks American English. Recognize Multiphone, Mabel, song number, and numbers from 1 through 170.",
                    }
                },
                "output": {"voice": self.server.voice},
            },
        }
        session["tools"] = realtime_tools() if not normal_mode else [realtime_tools()[0]]
        request = urllib.request.Request(
            "https://api.openai.com/v1/realtime/client_secrets",
            data=json.dumps({
                "session": session
            }).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace").strip()
            return self.send_json(502, {"ok": False, "error": f"OpenAI token request failed (HTTP {error.code})", "detail": detail})
        except urllib.error.URLError as error:
            return self.send_json(502, {"ok": False, "error": f"OpenAI token request failed: {error.reason}"})
        value = payload.get("value") or (payload.get("client_secret") or {}).get("value")
        if not value:
            return self.send_json(502, {"ok": False, "error": "OpenAI returned no ephemeral client secret"})
        return self.send_json(200, {"value": value, "expires_at": payload.get("expires_at")})

    def proxy_to_bridge(self, path):
        try:
            body = self.read_json()
        except (ValueError, TypeError):
            return self.send_json(400, {"ok": False, "error": "invalid JSON"})
        request = urllib.request.Request(
            f"{self.server.bridge_url}{path}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=95) as response:
                payload = json.loads(response.read().decode() or "{}")
                return self.send_json(response.status, payload)
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            try:
                payload = json.loads(detail or "{}")
            except ValueError:
                payload = {"ok": False, "error": detail or f"bridge HTTP {error.code}"}
            return self.send_json(error.code, payload)
        except urllib.error.URLError as error:
            return self.send_json(503, {"ok": False, "error": f"Mabel bridge unavailable: {error.reason}"})


def ensure_certificate(cert_path, key_path, cert_ip):
    if cert_path.exists() and key_path.exists():
        return
    cert_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", str(key_path), "-out", str(cert_path), "-days", "825",
        "-subj", "/CN=Mabel Handset",
        "-addext", f"subjectAltName=IP:{cert_ip},DNS:mabel.local",
    ], check=True, stdout=subprocess.DEVNULL)
    os.chmod(key_path, 0o600)


def main():
    project_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Run the iPad Mabel handset")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--bridge-url", default="http://127.0.0.1:8788")
    parser.add_argument("--cert-ip", default="10.0.0.210", help="LAN IP included in the self-signed certificate")
    parser.add_argument("--cert", default=str(project_dir / "state" / "mabel-handset-cert.pem"))
    parser.add_argument("--key", default=str(project_dir / "state" / "mabel-handset-key.pem"))
    parser.add_argument("--model", default="gpt-realtime")
    parser.add_argument("--voice", default="sage")
    args = parser.parse_args()
    cert_path, key_path = Path(args.cert), Path(args.key)
    ensure_certificate(cert_path, key_path, args.cert_ip)
    server = ThreadingHTTPServer((args.host, args.port), HandsetHandler)
    server.index_path = project_dir / "web" / "mabel-handset.html"
    server.sounds_dir = project_dir / "sounds"
    server.bridge_url = args.bridge_url.rstrip("/")
    server.openai_key = keychain_value(OPENAI_SERVICE, OPENAI_ACCOUNT)
    server.model = args.model
    server.voice = args.voice
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"Mabel handset: https://{args.cert_ip}:{args.port}/", flush=True)
    print("The browser uses iPad audio; the Mac key stays server-side.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
