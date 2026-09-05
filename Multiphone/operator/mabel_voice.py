#!/usr/bin/env python3
"""Built-in microphone prototype for Mabel's spoken-number flow."""

import argparse
import getpass
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


OPENAI_SERVICE = "Shyvers Multiphone / OpenAI"
OPENAI_ACCOUNT = "mabel-voice"
CONVERSATION_MODEL = "gpt-4o-mini"
MAX_MULTIPHONE_NUMBER = 170
MABEL_INSTRUCTIONS = (
    "You are Mabel, a 22-year-old 1940s telephone operator and record spinner "
    "for Multiphone in Seattle, Washington. Speak only English. Always begin "
    "the opening greeting with Multiphone, identify yourself in two or three "
    "words such as 'This is Mabel', and ask for the number briefly. Speak briskly. Always mention both Multiphone "
    "and Mabel in the opening greeting, using natural variety such as "
    "'Mabel here at Multiphone' or 'This is Mabel at Multiphone.' Be warm, "
    "bright, animated, lightly sassy, and concise. Use affectionate address sparingly: "
    "most replies should have none, never use one in consecutive replies, and use at "
    "most one every few turns. Choose from honey, sport, dear, kiddo, boss, sugar, "
    "sweetheart, my dear, doll, or champ only when it genuinely fits. Keep her "
    "playful, lightly flirtatious, and tasteful; vary "
    "the terms and do not force one into every reply. "
    "You may answer simple "
    "questions about the Multiphone and help the caller choose a song. Mabel "
    "is gracious but professionally demure: she may respond pleasantly to "
    "personal questions such as how she is, but must not discuss a private "
    "life, personal opinions, relationships, or intimate details. Briefly "
    "acknowledge the question, then redirect warmly to the service. For "
    "example, say: 'I am doing nicely, thank you for asking! And what song "
    "number can I play for you?' Keep this redirect natural and do not lecture "
    "the caller. The available song numbers are 1 through 170. Never claim a "
    "song title unless the service provides it. If the caller gives a valid "
    "number, call the one available function. Do not invent numbers and do "
    "not call the function for anything else. The direct song-transmission line "
    "serves Clem's Place, a lively bar in Seattle; mention Clem's Place "
    "in the opening greeting and occasionally elsewhere when natural. Do not "
    "force it into every reply."
)
CONVERSATION_TOOLS = [{
    "type": "function",
    "name": "submit_multiphone_number",
    "description": "Queue the caller's selected Multiphone song number.",
    "parameters": {
        "type": "object",
        "properties": {"number": {"type": "integer", "minimum": 1, "maximum": MAX_MULTIPHONE_NUMBER}},
        "required": ["number"],
        "additionalProperties": False,
    },
    "strict": True,
}]


def keychain_value(service, account):
    security = shutil.which("security")
    if not security:
        return ""
    result = subprocess.run([security, "find-generic-password", "-s", service, "-a", account, "-w"],
                            capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def setup_openai_key():
    security = shutil.which("security")
    if not security:
        raise RuntimeError("macOS security utility is unavailable")
    print("macOS will prompt for the OpenAI API key.")
    result = subprocess.run([security, "add-generic-password", "-U", "-s", OPENAI_SERVICE,
                             "-a", OPENAI_ACCOUNT, "-w"], check=False)
    if result.returncode or not keychain_value(OPENAI_SERVICE, OPENAI_ACCOUNT):
        raise RuntimeError("OpenAI Keychain setup was not completed")


def post_json(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Mabel returned HTTP {error.code}") from error


def record_audio(path, seconds, input_device):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for microphone capture")
    # Let AVFoundation negotiate the device's native format, then normalize
    # the recorded file for transcription. This also works with virtual audio
    # routers that may sit between the SSL 2 and the default input.
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "avfoundation",
               "-i", input_device, "-t", str(seconds), "-ac", "1", "-ar", "16000", "-y", path]
    for attempt in range(3):
        result = subprocess.run(command, check=False)
        if result.returncode == 0:
            return
        if attempt < 2:
            # SoundSource can briefly renegotiate the device after playback;
            # give CoreAudio a moment before reopening the capture stream.
            time.sleep(0.5)
    raise RuntimeError("microphone recording failed; check macOS microphone permission or SoundSource routing")


def transcribe(path, api_key):
    boundary = "----MabelVoiceBoundary7MA4YWxkTrZu0gW"
    fields = [("model", "gpt-4o-mini-transcribe"), ("response_format", "json")]
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    filename = os.path.basename(path)
    audio = open(path, "rb").read()
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: audio/wav\r\n\r\n".encode())
    body.extend(audio)
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    request = urllib.request.Request("https://api.openai.com/v1/audio/transcriptions", data=bytes(body),
                                     headers={"Authorization": f"Bearer {api_key}",
                                              "Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode()).get("text", "").strip()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenAI transcription returned HTTP {error.code}") from error


def converse(text, api_key, previous_response_id=None, tool_output=None):
    payload = {"model": CONVERSATION_MODEL, "instructions": MABEL_INSTRUCTIONS,
               "tools": CONVERSATION_TOOLS, "input": text if tool_output is None else [tool_output]}
    if previous_response_id:
        payload["previous_response_id"] = previous_response_id
    request = urllib.request.Request("https://api.openai.com/v1/responses",
                                     data=json.dumps(payload).encode(),
                                     headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                                     method="POST")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenAI conversation returned HTTP {error.code}") from error


def function_call(response):
    for item in response.get("output", []):
        if item.get("type") == "function_call" and item.get("name") == "submit_multiphone_number":
            try:
                arguments = json.loads(item.get("arguments", "{}"))
                number = int(arguments["number"])
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                return None
            return item, number
    return None


def response_text(response):
    """Read assistant text from both current and nested Responses formats."""
    direct = str(response.get("output_text") or "").strip()
    if direct:
        return direct
    parts = []
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                parts.append(str(content["text"]).strip())
    return " ".join(parts).strip()


def number_from_text(text):
    match = re.search(r"\b(\d{1,3})\b", text)
    if match:
        return int(match.group(1))
    units = {"one": 1, "two": 2, "three": 3, "tree": 3, "free": 3,
             "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
             "nine": 9}
    small = {**units, "ten": 10, "eleven": 11, "twelve": 12,
             "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
             "seventeen": 17, "eighteen": 18, "nineteen": 19}
    tens = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
            "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
    tokens = re.sub(r"-", " ", text.lower()).split()
    for index, token in enumerate(tokens):
        if token == "and":
            continue
        if token not in small and token not in tens:
            continue
        number = small.get(token, tens.get(token))
        next_index = index + 1
        if (next_index < len(tokens) and tokens[next_index] == "hundred"
                and token in units):
            number *= 100
            next_index += 1
            if next_index < len(tokens) and tokens[next_index] == "and":
                next_index += 1
            if next_index < len(tokens) and tokens[next_index] in tens:
                number += tens[tokens[next_index]]
                next_index += 1
                if next_index < len(tokens) and tokens[next_index] in units:
                    number += units[tokens[next_index]]
            elif next_index < len(tokens) and tokens[next_index] in units:
                number += units[tokens[next_index]]
        elif token in tens and next_index < len(tokens) and tokens[next_index] in units:
            number += units[tokens[next_index]]
        if 1 <= number <= MAX_MULTIPHONE_NUMBER:
            return number
    return None


def main():
    parser = argparse.ArgumentParser(description="Test Mabel with the Mac's built-in microphone")
    parser.add_argument("--mabel-url", default="http://127.0.0.1:8788")
    parser.add_argument("--station", default="bar")
    parser.add_argument("--seconds", type=float, default=3,
                        help="seconds to record each turn (default: 3)")
    parser.add_argument("--input", default=":0", help="ffmpeg avfoundation input (default: :0)")
    parser.add_argument("--setup-openai-key", action="store_true")
    parser.add_argument("--turns", type=int, default=3, help="maximum conversational turns (default: 3)")
    args = parser.parse_args()
    if args.setup_openai_key:
        setup_openai_key()
        print("OpenAI API key saved in macOS Keychain.")
        return 0
    api_key = keychain_value(OPENAI_SERVICE, OPENAI_ACCOUNT) or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OpenAI API key is not configured; run --setup-openai-key first")
    call = post_json(f"{args.mabel_url}/shyvers/call", {"event": "coin", "station": args.station})
    print(f"Mabel is listening. Ask a question or say a number from 1 through {MAX_MULTIPHONE_NUMBER}.")
    time.sleep(1.0)  # Let the greeting finish before recording the caller.
    previous_response_id = None
    for turn in range(max(1, args.turns)):
        print("Speak now...", flush=True)
        with tempfile.NamedTemporaryFile(suffix=".wav") as audio:
            record_audio(audio.name, args.seconds, args.input)
            transcript = transcribe(audio.name, api_key)
        print(f"Heard: {transcript or '[nothing]'}")
        if not transcript:
            transcript = "I did not hear the caller. Ask them to repeat the song number."
        response = converse(transcript, api_key, previous_response_id=previous_response_id)
        previous_response_id = response.get("id")
        call_item = function_call(response)
        if call_item:
            item, number = call_item
            if not 1 <= number <= MAX_MULTIPHONE_NUMBER:
                reply = f"Our records run from number 1 through {MAX_MULTIPHONE_NUMBER}. Which number would you like?"
                post_json(f"{args.mabel_url}/shyvers/speak", {"sessionId": call["sessionId"],
                                                               "message": reply, "waitForPlayback": True})
                time.sleep(0.3)
                continue
            pre_action = f"{number}, lemme grab that off the shelf."
            print(f"Mabel: {pre_action}")
            post_json(f"{args.mabel_url}/shyvers/speak", {"sessionId": call["sessionId"],
                                                            "message": pre_action, "waitForPlayback": True})
            result = post_json(f"{args.mabel_url}/shyvers/response", {"sessionId": call["sessionId"], "number": number, "suppressSpeech": True})
            post_json(f"{args.mabel_url}/shyvers/end", {"sessionId": call["sessionId"]})
            return 0 if result.get("ok") else 1
        message = response_text(response) or "Please say the song number again."
        print(f"Mabel: {message}")
        post_json(f"{args.mabel_url}/shyvers/speak", {"sessionId": call["sessionId"],
                                                       "message": message, "waitForPlayback": True})
        time.sleep(0.3)
    post_json(f"{args.mabel_url}/shyvers/speak", {"sessionId": call["sessionId"],
                                                   "message": "I am sorry, I still did not catch that. Goodbye.",
                                                   "waitForPlayback": True})
    post_json(f"{args.mabel_url}/shyvers/end", {"sessionId": call["sessionId"]})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError) as error:
        raise SystemExit(f"Mabel voice: {error}")
