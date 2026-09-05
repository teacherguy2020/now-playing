#!/usr/bin/env python3
"""Mabel v0.1: local session service for the Shyvers Multiphone."""

import argparse
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import json
import os
import random
import re
import shutil
import tempfile
import threading
import subprocess
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

from main import keychain_key, submit
from mabel_voice import keychain_value, OPENAI_ACCOUNT, OPENAI_SERVICE


SESSIONS = {}
LOCK = threading.Lock()
REALTIME_PROCESS = None
MAX_MULTIPHONE_NUMBER = 170
MAX_SURPRISE_NUMBER = MAX_MULTIPHONE_NUMBER
SONG_FACT_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "state", "mabel-song-facts.json")
SONG_FACT_CACHE_LOCK = threading.Lock()
SONG_FACT_CACHE = None
SONG_FACT_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mabel-song-fact")
CHOICE_CONFIRMATIONS = (
    "Great choice! Number {number}, coming right up, thanks.",
    "Wonderful pick! Number {number}, coming right up, thanks.",
    "Excellent selection! Number {number}, coming right up, thanks.",
    "You got it! Number {number}, coming right up, thanks.",
    "Oh, I like that one! Number {number}, coming right up, thanks.",
)


def find_node_binary():
    """Resolve Node explicitly because launchd does not provide shell PATH."""
    candidates = (
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        shutil.which("node"),
    )
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return "node"


def realtime_environment():
    """Give the child audio tools a predictable PATH under launchd."""
    environment = os.environ.copy()
    path_entries = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ]
    existing_path = environment.get("PATH", "")
    if existing_path:
        path_entries.extend(existing_path.split(os.pathsep))
    environment["PATH"] = os.pathsep.join(dict.fromkeys(path_entries))
    return environment


def speak_with_macos(message, voice, wait_for_playback=False):
    try:
        process = subprocess.Popen(["say", "-v", voice, message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if wait_for_playback:
            process.wait()
        return True
    except FileNotFoundError:
        return False  # Non-macOS development hosts can still exercise the HTTP flow.


def speak_with_openai(message, voice, api_key, speed=1.1, wait_for_playback=False):
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=json.dumps({"model": "gpt-4o-mini-tts", "voice": voice, "speed": speed,
                         "input": message, "response_format": "wav",
                         "instructions": "Speak as Mabel, a 22-year-old 1940s telephone operator and record spinner for Multiphone in Seattle, Washington. She is youthful, exuberant, bright, happy, warm, and lightly sassy. Use affectionate address sparingly: most replies should have none, never use one in consecutive replies, and use at most one every few turns. Choose honey, sport, dear, kiddo, boss, sugar, sweetheart, my dear, doll, or champ only when it genuinely fits. Keep Mabel fun, warm, lightly flirtatious, tasteful, and varied. Use a noticeably higher, brighter vocal register and a genuinely lively, exuberant delivery. Sound as though you are smiling: use punchy upbeat phrasing, strong but natural emphasis, expressive pitch variation, animated reactions, and a quick conversational rhythm. Keep the energy consistently high—not bored, flat, sleepy, or monotone. Make affirmations sound genuinely excited, with crisp period-appropriate charm. Be playful but never rude or distracting."}).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            audio = response.read()
    except urllib.error.HTTPError as error:
        print(f"Mabel: OpenAI speech returned HTTP {error.code}; using macOS voice.", flush=True)
        return False
    audio_file = tempfile.NamedTemporaryFile(prefix="mabel-", suffix=".wav", delete=False)
    try:
        audio_file.write(audio)
        audio_file.close()
        player = subprocess.Popen(["afplay", audio_file.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if wait_for_playback:
            player.wait()
            os.unlink(audio_file.name)
        else:
            threading.Thread(target=lambda: (player.wait(), os.unlink(audio_file.name)), daemon=True).start()
        return True
    except (FileNotFoundError, OSError):
        try:
            os.unlink(audio_file.name)
        except OSError:
            pass
        return False


def speak(message, server, wait_for_playback=False):
    """Speak without invoking a shell; prefer OpenAI TTS when configured."""
    if server.tts == "openai" and server.openai_key and speak_with_openai(message, server.voice, server.openai_key, server.speed, wait_for_playback):
        return
    speak_with_macos(message, server.fallback_voice, wait_for_playback)


OFFSCRIPT_ACTIONS = {
    "play_album": ("POST", "/mpd/play-album"),
    "play_artist": ("POST", "/mpd/play-artist"),
    "play_playlist": ("POST", "/mpd/play-playlist"),
    "play_mix": ("POST", "/queue/mix"),
    "now_playing": ("GET", "/now-playing"),
}


def offscript_request(server, action, payload):
    method, path = OFFSCRIPT_ACTIONS[action]
    url = f"{server.now_playing_base}{path}"
    body = None if method == "GET" else json.dumps(payload).encode()
    headers = {"X-Track-Key": server.track_key} if server.track_key else {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        print(f"Mabel Now Playing request failed: {method} {url} HTTP {error.code}", flush=True)
        raise RuntimeError(f"Now Playing returned HTTP {error.code}: {detail or 'request rejected'}") from error
    except urllib.error.URLError as error:
        print(f"Mabel Now Playing request failed: {method} {url}: {error.reason}", flush=True)
        # A launchd-started process can retain a stale network path after the
        # Mac changes interfaces. Retry through curl, which asks macOS for a
        # fresh route. Headers are supplied on stdin so the track key never
        # appears in process arguments or logs.
        try:
            curl_args = [
                "/usr/bin/curl", "--silent", "--show-error", "--max-time", "90",
                "--request", method, "--header", "@-", "--write-out", "\n%{http_code}", url,
            ]
            if body is not None:
                curl_args.extend(["--data-binary", body.decode()])
            header_lines = ["Content-Type: application/json"] if body is not None else []
            if server.track_key:
                header_lines.append(f"X-Track-Key: {server.track_key}")
            retried = subprocess.run(
                curl_args,
                input="\n".join(header_lines) + "\n",
                text=True,
                capture_output=True,
                timeout=95,
                check=False,
            )
            if retried.returncode == 0:
                raw = retried.stdout
                payload_text, status_text = raw.rsplit("\n", 1)
                status = int(status_text)
                if status < 400:
                    return json.loads(payload_text or "{}")
                raise RuntimeError(f"Now Playing returned HTTP {status}: {payload_text.strip() or 'request rejected'}")
            raise RuntimeError(retried.stderr.strip() or str(error.reason))
        except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as retry_error:
            raise RuntimeError(f"Could not reach Now Playing: {retry_error}") from error


def start_loaded_head(server, result):
    """The Alexa handlers start playback after load; Mabel must do that locally."""
    now_playing = result.get("nowPlaying") if isinstance(result, dict) else None
    file_name = str((now_playing or {}).get("file") or "").strip()
    if not file_name:
        return result
    request = urllib.request.Request(
        f"{server.now_playing_base}/mpd/start-queue",
        data=json.dumps({}).encode(),
        headers={"Content-Type": "application/json", **({"X-Track-Key": server.track_key} if server.track_key else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            started = json.loads(response.read().decode() or "{}")
        return {**result, "playbackStarted": bool(started.get("ok")), "startedFile": file_name}
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        raise RuntimeError(f"Now Playing could not start playback (HTTP {error.code}): {detail}") from error
    except urllib.error.URLError as error:
        try:
            curl_args = [
                "/usr/bin/curl", "--silent", "--show-error", "--max-time", "90",
                "--request", "POST", "--header", "@-", "--write-out", "\n%{http_code}",
                f"{server.now_playing_base}/mpd/start-queue",
                "--data-binary", "{}",
            ]
            header_lines = ["Content-Type: application/json"]
            if server.track_key:
                header_lines.append(f"X-Track-Key: {server.track_key}")
            retried = subprocess.run(
                curl_args,
                input="\n".join(header_lines) + "\n",
                text=True,
                capture_output=True,
                timeout=95,
                check=False,
            )
            if retried.returncode == 0:
                raw = retried.stdout
                payload_text, status_text = raw.rsplit("\n", 1)
                status = int(status_text)
                if status < 400:
                    started = json.loads(payload_text or "{}")
                    return {**result, "playbackStarted": bool(started.get("ok")), "startedFile": file_name}
                raise RuntimeError(f"Now Playing could not start playback (HTTP {status}): {payload_text.strip()}")
            raise RuntimeError(retried.stderr.strip() or str(error.reason))
        except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as retry_error:
            raise RuntimeError(f"Could not start Now Playing playback: {retry_error}") from error


def start_song(server, song_id):
    """Start an already-added MPD song by stable song ID."""
    request = urllib.request.Request(
        f"{server.now_playing_base}/mpd/start-song",
        data=json.dumps({"songId": int(song_id)}).encode(),
        headers={"Content-Type": "application/json", **({"X-Track-Key": server.track_key} if server.track_key else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            started = json.loads(response.read().decode() or "{}")
        return started
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        raise RuntimeError(f"Now Playing could not start the selected song (HTTP {error.code}): {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not start Now Playing playback: {error.reason}") from error


def get_now_playing_json(server, path, *, timeout=30):
    request = urllib.request.Request(
        f"{server.now_playing_base}{path}",
        headers={"X-Track-Key": server.track_key} if server.track_key else {},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace").strip()
        raise RuntimeError(f"Now Playing rejected catalog lookup (HTTP {error.code}): {detail or 'request rejected'}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not read the Now Playing catalog: {error.reason}") from error


def _load_song_fact_cache():
    global SONG_FACT_CACHE
    with SONG_FACT_CACHE_LOCK:
        if SONG_FACT_CACHE is not None:
            return SONG_FACT_CACHE
        try:
            with open(SONG_FACT_CACHE_PATH, encoding="utf-8") as handle:
                loaded = json.load(handle)
            SONG_FACT_CACHE = loaded if isinstance(loaded, dict) else {}
        except (OSError, ValueError):
            SONG_FACT_CACHE = {}
        return SONG_FACT_CACHE


def _save_song_fact_cache():
    cache_dir = os.path.dirname(SONG_FACT_CACHE_PATH)
    os.makedirs(cache_dir, exist_ok=True)
    temporary = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=cache_dir,
                                            prefix="mabel-song-facts-", delete=False)
    try:
        json.dump(SONG_FACT_CACHE or {}, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary.close()
        os.replace(temporary.name, SONG_FACT_CACHE_PATH)
    finally:
        try:
            os.unlink(temporary.name)
        except OSError:
            pass


def _song_fact_key(title, artist):
    return " ".join(f"{artist or ''} {title or ''}".casefold().split())


def _fact_search_text(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def lookup_song_fact(title, artist):
    """Return one short, song-specific fact from Wikipedia, or None.

    This is deliberately conservative: the search result must contain the
    song title, and only the first one or two sentences of its summary are
    returned. The cache avoids repeating lookups during later surprise calls.
    """
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title or not artist:
        return None
    key = _song_fact_key(title, artist)
    cache = _load_song_fact_cache()
    with SONG_FACT_CACHE_LOCK:
        if key in cache:
            return cache[key] or None

    headers = {"User-Agent": "Multiphone-Mabel/0.1 (local song-fact lookup)"}
    search_params = urlencode({
        "action": "query", "list": "search",
        "srsearch": f'intitle:"{title}" "{artist}"',
        "format": "json", "utf8": "1", "srlimit": "5",
    })
    try:
        request = urllib.request.Request(
            f"https://en.wikipedia.org/w/api.php?{search_params}", headers=headers)
        with urllib.request.urlopen(request, timeout=2.0) as response:
            search = json.loads(response.read().decode() or "{}")
        normalized_title = _fact_search_text(title)
        title_words = set(normalized_title.split())
        candidates = (search.get("query") or {}).get("search") or []
        ranked_candidates = []
        for row in candidates:
            candidate_title = str(row.get("title") or "").strip()
            normalized_candidate = _fact_search_text(candidate_title)
            if not title_words or not title_words.issubset(set(normalized_candidate.split())):
                continue
            suffix = normalized_candidate[len(normalized_title):].strip() \
                if normalized_candidate.startswith(normalized_title) else normalized_candidate
            score = 10
            if normalized_candidate == normalized_title:
                score = 100
            elif suffix.startswith(("song", "tune", "single", "composition")) \
                    or " song" in suffix or " tune" in suffix \
                    or (suffix.startswith("(") and any(word in suffix for word in ("song", "tune", "single"))):
                score = 90
            ranked_candidates.append((score, candidate_title))
        page_title = max(ranked_candidates, default=(0, None))[1]
        if not page_title:
            fact = None
        else:
            page_url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + quote(page_title, safe="")
            request = urllib.request.Request(page_url, headers=headers)
            with urllib.request.urlopen(request, timeout=2.0) as response:
                summary = json.loads(response.read().decode() or "{}")
            extract = str(summary.get("extract") or "").strip()
            sentences = re.split(r"(?<=[.!?])\s+", extract)
            short_extract = " ".join(sentences[:2]).strip()[:420]
            fact = {"text": short_extract, "source": str(summary.get("content_urls", {}).get("desktop", {}).get("page") or "")}
            if not fact["text"]:
                fact = None
    except (OSError, ValueError, KeyError, TypeError):
        fact = None

    if fact:
        with SONG_FACT_CACHE_LOCK:
            cache[key] = fact
            try:
                _save_song_fact_cache()
            except OSError:
                pass
    return fact


def choose_surprise_record(server, *, artist=None, exclude_holiday=False, defer_playback=False):
    """Choose a real Multiphone playlist position without revealing it first.

    With an artist constraint, intersect the numbered Multiphone playlist with
    the browse catalog so the chosen number is both playable by Mabel and
    genuinely credited to that artist. The number remains server-side until
    the final return announcement.
    """
    playlist = get_now_playing_json(server, "/integrations/multiphone/playlist")

    tracks = playlist.get("tracks") if isinstance(playlist, dict) else None
    eligible = []
    artist_name = str(artist or "").strip()[:200]
    artist_tracks = {}
    if artist_name:
        albums = get_now_playing_json(
            server,
            f"/config/browse/artist-albums?{urlencode({'artist': artist_name})}",
            timeout=45,
        )
        for album_row in (albums.get("albums") if isinstance(albums, dict) else []) or []:
            album_name = str(album_row.get("album") or "").strip()
            if not album_name:
                continue
            album_tracks = get_now_playing_json(
                server,
                f"/config/browse/album-tracks?{urlencode({'album': album_name, 'artist': artist_name})}",
                timeout=45,
            )
            for row in (album_tracks.get("tracks") if isinstance(album_tracks, dict) else []) or []:
                if not isinstance(row, dict):
                    continue
                file_name = str(row.get("file") or "").strip()
                row_artist = str(row.get("artist") or artist_name).strip()
                if not file_name or row_artist.casefold() != artist_name.casefold():
                    continue
                artist_tracks[file_name] = {
                    "artist": row_artist,
                    "title": str(row.get("title") or "").strip(),
                    "album": str(row.get("album") or album_name).strip(),
                }
        if not artist_tracks:
            raise RuntimeError(f"No Multiphone records found by {artist_name}")

    for track in (tracks or []):
        if not isinstance(track, dict):
            continue
        file_name = str(track.get("file") or "").strip()
        metadata = artist_tracks.get(file_name) if artist_name else None
        if artist_name and metadata is None:
            continue
        if exclude_holiday and metadata and any(
            marker in " ".join((metadata.get("title", ""), metadata.get("album", ""))).casefold()
            for marker in ("christmas", "holiday", "xmas", "santa", "noel")
        ):
            continue
        try:
            number = int(track.get("number", 0) or 0)
        except (TypeError, ValueError):
            continue
        # Surprise picks use the same 1-170 range as caller-entered numbers.
        # Records added beyond that range remain available to other catalog
        # and controller workflows, but Mabel must never choose them.
        max_number = MAX_SURPRISE_NUMBER
        if 1 <= number <= max_number:
            eligible.append({**track, **(metadata or {})})
    if not eligible:
        suffix = f" by {artist_name}" if artist_name else ""
        raise RuntimeError(f"The Multiphone playlist has no eligible records{suffix}")
    chosen = random.choice(eligible)
    number = int(chosen["number"])
    fact_future = SONG_FACT_EXECUTOR.submit(
        lookup_song_fact,
        chosen.get("title", ""),
        chosen.get("artist") or artist_name,
    )
    result = submit(number, endpoint=server.now_playing_endpoint,
                    track_key=server.track_key, defer_playback=defer_playback)
    try:
        song_fact = fact_future.result(timeout=3.0)
    except FutureTimeoutError:
        fact_future.cancel()
        song_fact = None
    except Exception:
        song_fact = None
    return {**result, "surprise": True, "surpriseNumber": number,
            "surpriseArtist": artist_name or None,
            "title": result.get("title") or chosen.get("title", ""),
            "artist": result.get("artist") or chosen.get("artist", ""),
            "songFact": song_fact}


class MabelHandler(BaseHTTPRequestHandler):
    server_version = "Mabel/0.1"

    def log_message(self, format, *args):
        print("Mabel:", format % args, flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "mabel", "version": "0.1"})
        else:
            self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        try:
            data = self.read_json()
        except (ValueError, TypeError):
            return self.send_json(400, {"ok": False, "error": "invalid JSON"})

        if self.path == "/shyvers/call":
            if data.get("event") != "coin":
                return self.send_json(400, {"ok": False, "error": "event must be coin"})
            station = str(data.get("station") or "bar").strip()[:80]
            session_id = uuid.uuid4().hex
            with LOCK:
                SESSIONS[session_id] = {"station": station}
            # Do not open the microphone while the greeting is still playing;
            # SoundSource or another audio router may otherwise feed Mabel's
            # own voice back into the next recording.
            if data.get("suppressGreeting") is not True:
                speak("Multiphone! This is Mabel. What number?", self.server, True)
            return self.send_json(201, {"ok": True, "sessionId": session_id, "station": station, "state": "awaiting-number"})

        if self.path in ("/shyvers/start", "/shyvers/start-normal"):
            # LAN trigger for an iPad Shortcut. The iPad starts the call; the
            # caller still speaks through the Mac's selected audio devices.
            # `/shyvers/start` is the VIP/off-script line; the explicit normal
            # route leaves off-script disabled so the numbered state machine
            # handles the call.
            global REALTIME_PROCESS
            off_script = self.path == "/shyvers/start"
            with LOCK:
                if REALTIME_PROCESS is not None and REALTIME_PROCESS.poll() is None:
                    return self.send_json(409, {"ok": False, "error": "Mabel is already running", "pid": REALTIME_PROCESS.pid})
                REALTIME_PROCESS = None
            try:
                command = [self.server.node_binary, self.server.realtime_script,
                           "--input", self.server.realtime_input]
                if off_script:
                    command.append("--off-script")
                command.extend(("--mabel-url", f"http://127.0.0.1:{self.server.server_port}"))
                process = subprocess.Popen(command, cwd=self.server.project_dir,
                                           env=self.server.realtime_env)
            except OSError as error:
                return self.send_json(503, {"ok": False, "error": f"Could not start Mabel: {error}"})
            with LOCK:
                REALTIME_PROCESS = process
            return self.send_json(202, {"ok": True, "mode": "off-script" if off_script else "normal",
                                        "pid": process.pid, "state": "starting"})

        if self.path == "/shyvers/response":
            session_id = str(data.get("sessionId") or "")
            number = data.get("number")
            suppress_speech = data.get("suppressSpeech") is True
            defer_playback = data.get("deferPlayback") is True
            with LOCK:
                session = SESSIONS.get(session_id)
            if not session:
                return self.send_json(404, {"ok": False, "error": "session not found or already completed"})
            if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= MAX_MULTIPHONE_NUMBER:
                return self.send_json(400, {"ok": False, "error": f"number must be an integer from 1 through {MAX_MULTIPHONE_NUMBER}"})
            if not suppress_speech:
                with LOCK:
                    SESSIONS.pop(session_id, None)
            try:
                result = submit(number, endpoint=self.server.now_playing_endpoint,
                                track_key=self.server.track_key, defer_playback=defer_playback)
            except RuntimeError as error:
                speak("I am sorry, the central station could not be reached.", self.server)
                return self.send_json(502, {"ok": False, "error": str(error)})
            if result.get("ok"):
                confirmation = random.choice(CHOICE_CONFIRMATIONS).format(number=number)
                if not suppress_speech:
                    speak(confirmation, self.server)
            return self.send_json(200 if result.get("ok") else 422, {"ok": bool(result.get("ok")), "number": number, "result": result, "speechSuppressed": suppress_speech})

        if self.path == "/shyvers/surprise":
            session_id = str(data.get("sessionId") or "")
            with LOCK:
                session_exists = session_id in SESSIONS
            if not session_exists:
                return self.send_json(404, {"ok": False, "error": "session not found or already completed"})
            try:
                artist = str(data.get("artist") or "").strip()[:200] or None
                result = choose_surprise_record(
                    self.server,
                    artist=artist,
                    exclude_holiday=artist is not None and data.get("excludeHoliday") is not False,
                    defer_playback=data.get("deferPlayback") is True,
                )
            except RuntimeError as error:
                return self.send_json(502, {"ok": False, "error": str(error)})
            return self.send_json(200 if result.get("ok") else 422, {
                "ok": bool(result.get("ok")),
                "number": result.get("surpriseNumber"),
                "result": result,
                "surprise": True,
            })

        if self.path == "/shyvers/start-song":
            session_id = str(data.get("sessionId") or "")
            song_id = data.get("songId")
            with LOCK:
                session_exists = session_id in SESSIONS
            if not session_exists:
                return self.send_json(404, {"ok": False, "error": "session not found or already completed"})
            if isinstance(song_id, bool) or not isinstance(song_id, int) or song_id < 0:
                return self.send_json(400, {"ok": False, "error": "songId must be a non-negative integer"})
            try:
                result = start_song(self.server, song_id)
            except RuntimeError as error:
                return self.send_json(502, {"ok": False, "error": str(error)})
            return self.send_json(200, {"ok": bool(result.get("ok")), "songId": song_id, "playbackStarted": bool(result.get("playbackStarted"))})

        if self.path == "/shyvers/offscript":
            session_id = str(data.get("sessionId") or "")
            action = str(data.get("action") or "").strip()
            with LOCK:
                session_exists = session_id in SESSIONS
            if not session_exists:
                return self.send_json(404, {"ok": False, "error": "session not found"})
            if action not in OFFSCRIPT_ACTIONS:
                return self.send_json(400, {"ok": False, "error": "unsupported off-script action"})
            if action == "play_album":
                query = str(data.get("album") or "").strip()[:200]
                payload = {"album": query, "excludeRating1": True}
            elif action == "play_artist":
                query = str(data.get("artist") or "").strip()[:200]
                payload = {"artist": query, "shuffle": bool(data.get("shuffle", True)), "maxTracks": 50, "excludeRating1": True}
            elif action == "play_playlist":
                query = str(data.get("playlist") or "").strip()[:200]
                payload = {"playlist": query, "excludeRating1": True}
            elif action == "play_mix":
                artists = data.get("artists")
                if not isinstance(artists, list):
                    return self.send_json(400, {"ok": False, "error": "artists must be a list"})
                artists = [str(item).strip()[:120] for item in artists if str(item).strip()][:8]
                payload = {"artists": artists, "excludeHoliday": True, "clearFirst": True,
                           "random": False, "shuffle": True, "startPlayback": True, "maxTracks": 300,
                           "excludeRating1": True}
            else:
                payload = {}
            if action != "now_playing" and not any(payload.values()):
                return self.send_json(400, {"ok": False, "error": "a search value is required"})
            try:
                result = offscript_request(self.server, action, payload)
                if action != "now_playing" and result.get("ok") and not (
                    result.get("playbackStarted") or result.get("startedPlayback")
                ):
                    result = start_loaded_head(self.server, result)
            except RuntimeError as error:
                return self.send_json(502, {"ok": False, "error": str(error)})
            return self.send_json(200, {"ok": True, "action": action, "result": result})

        if self.path == "/shyvers/speak":
            session_id = str(data.get("sessionId") or "")
            message = str(data.get("message") or "").strip()[:500]
            with LOCK:
                session_exists = session_id in SESSIONS
            if not session_exists:
                return self.send_json(404, {"ok": False, "error": "session not found"})
            if not message:
                return self.send_json(400, {"ok": False, "error": "message is required"})
            speak(message, self.server, data.get("waitForPlayback") is True)
            return self.send_json(200, {"ok": True})

        if self.path == "/shyvers/end":
            session_id = str(data.get("sessionId") or "")
            with LOCK:
                SESSIONS.pop(session_id, None)
            return self.send_json(200, {"ok": True})

        self.send_json(404, {"ok": False, "error": "not found"})


def main():
    parser = argparse.ArgumentParser(description="Run the local Mabel session service")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--now-playing-url", default="http://10.0.0.4:3101/integrations/multiphone/selection")
    parser.add_argument("--voice", default=os.environ.get("MABEL_VOICE", "coral"), help="OpenAI TTS voice (default: coral)")
    parser.add_argument("--speed", type=float, default=1.1, help="OpenAI TTS playback speed (default: 1.1)")
    parser.add_argument("--fallback-voice", default="Samantha", help="macOS say fallback voice")
    parser.add_argument("--tts", choices=("openai", "macos"), default="openai")
    parser.add_argument("--realtime-input", default=os.environ.get("MABEL_REALTIME_INPUT", ":0"),
                        help="AVFoundation input selector for iPad-started Realtime calls")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), MabelHandler)
    server.now_playing_endpoint = args.now_playing_url
    parsed_endpoint = urlsplit(args.now_playing_url)
    server.now_playing_base = urlunsplit((parsed_endpoint.scheme, parsed_endpoint.netloc, "", "", ""))
    server.track_key = keychain_key()
    server.openai_key = keychain_value(OPENAI_SERVICE, OPENAI_ACCOUNT)
    server.voice = args.voice
    server.speed = max(0.25, min(4.0, args.speed))
    server.fallback_voice = args.fallback_voice
    server.tts = args.tts
    server.project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    server.realtime_script = os.path.join(server.project_dir, "operator", "mabel_realtime.mjs")
    server.realtime_input = args.realtime_input
    server.node_binary = find_node_binary()
    server.realtime_env = realtime_environment()
    print(f"Mabel listening on http://127.0.0.1:{args.port}", flush=True)
    print("POST /shyvers/call to begin a session; POST /shyvers/response to answer.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
