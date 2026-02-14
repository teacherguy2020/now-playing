#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import subprocess
import time
import traceback
from datetime import datetime

import requests
from mpd import MPDClient, CommandError
from mutagen import File as MutagenFile

# Use HTTPS (more reliable than plain HTTP) + retries below
LASTFM_ROOT = "https://ws.audioscrobbler.com/2.0/"
LOG_PATH = os.environ.get("VIBE_LOG", "/home/moode/lastfm_vibe_radio.log")

PAREN_COPY_RE = re.compile(
    r"\s\(\d+\)\.(flac|mp3|m4a|mp4|ogg|oga|opus|wav|aiff|aif)$",
    re.IGNORECASE
)

TITLE_JUNK = [
    "album version", "single version", "radio edit", "edit",
    "remaster", "remastered", "live", "live album version",
    "mono", "stereo", "bonus track", "deluxe edition", "expanded edition",
]

# -----------------------------
# Seasonal / Christmas filter
# -----------------------------
XMAS_WORDS = (
    "christmas", "xmas", "noel", "nativity", "yuletide", "advent",
    "silent night", "jingle bell", "santa", "mistletoe",
    "winter wonderland", "white christmas", "let it snow",
    "have yourself a merry little christmas",
    "it's the most wonderful time of the year",
    "the christmas song", "christmas waltz",
)


def is_seasonal_text(*parts: str) -> bool:
    hay = " ".join([p for p in parts if p]).casefold()
    return any(w in hay for w in XMAS_WORDS)


def log_exc(prefix: str = "TRACEBACK"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write("\n" + "=" * 72 + "\n")
        f.write(f"{ts} {prefix}\n")
        f.write(traceback.format_exc())
    print(f"{prefix}: crashed. See log: {LOG_PATH}", flush=True)


def norm(s: str) -> str:
    if not s:
        return ""
    s = s.casefold().strip()
    s = re.sub(r"\s*\(.*?\)\s*", " ", s)
    s = re.sub(r"\s*\[.*?\]\s*", " ", s)
    s = re.sub(r"\b(feat|ft)\.?\b.*$", "", s)
    for junk in TITLE_JUNK:
        s = s.replace(junk, " ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def track_key(artist: str, title: str) -> str:
    a = norm(artist)
    t = norm(title)
    return f"{a}|{t}" if a and t else ""


def album_key(album: str) -> str:
    return norm(album)


def path_score(p: str) -> tuple:
    p_l = (p or "").lower()
    return (1 if PAREN_COPY_RE.search(p_l) else 0, len(p_l))


def ensure_mpd_path(p: str) -> str:
    """Convert absolute /media/... or /var/lib/mpd/music/USB/... to MPD-visible USB/..."""
    if not p:
        return p
    if p.startswith("/media/"):
        return "USB/" + p[len("/media/"):]
    if p.startswith("/var/lib/mpd/music/USB/"):
        return "USB/" + p[len("/var/lib/mpd/music/USB/"):]
    return p


def mpd_to_abs(mpd_file: str) -> str:
    """
    Convert MPD-visible paths to a local filesystem path for Mutagen reads.

    On the API host (10.0.0.233), the library is typically mounted at:
      - /mnt/SamsungMoode/...
      - /mnt/OSDISK/...

    We try common mappings and fall back to the input.
    """
    f = (mpd_file or "").lstrip("/")

    # Already local
    if f.startswith("mnt/"):
        return "/" + f
    if f.startswith("/mnt/"):
        return f

    # Explicit roots your system uses elsewhere
    if f.startswith("USB/SamsungMoode/"):
        return "/mnt/SamsungMoode/" + f[len("USB/SamsungMoode/"):]
    if f.startswith("OSDISK/"):
        return "/mnt/OSDISK/" + f[len("OSDISK/"):]

    # Generic MPD "USB/..." fallback -> assume SamsungMoode mount
    if f.startswith("USB/"):
        return "/mnt/SamsungMoode/" + f[len("USB/"):]

    # Legacy moOde-ish /media mapping (only if your API host actually has /media mounted)
    if f.startswith("media/"):
        return "/" + f
    if f.startswith("/media/"):
        return f

    # As-is (Mutagen will just fail and you’ll get empty tags)
    return f


def mpd_connect(host: str, port: int) -> MPDClient:
    c = MPDClient()
    c.timeout = 10
    c.idletimeout = None
    c.connect(host, port)
    return c


def lastfm_get_similar(api_key: str, artist: str, title: str, limit: int):
    params = {
        "method": "track.getSimilar",
        "artist": artist,
        "track": title,
        "api_key": api_key,
        "format": "json",
        "limit": str(limit),
        "autocorrect": "1",
    }

    last_err = None
    for attempt in range(6):  # 6 tries total
        try:
            r = requests.get(
                LASTFM_ROOT,
                params=params,
                timeout=(5, 20),  # (connect timeout, read timeout)
                headers={"User-Agent": "moode-vibe/chain-2.0"}
            )
            data = r.json()

            if "error" not in data:
                tracks = data.get("similartracks", {}).get("track", [])
                if isinstance(tracks, dict):
                    tracks = [tracks]
                return tracks or []

            err = int(data.get("error") or 0)
            msg = data.get("message") or "Unknown error"

            # Last.fm transient
            if err == 8:
                wait = 1.5 * (attempt + 1)
                print(f"[lastfm] transient error 8 ('{msg}'), retrying in {wait:.1f}s...", flush=True)
                time.sleep(wait)
                continue

            raise RuntimeError(f"Last.fm error {err}: {msg}")

        except (
            requests.exceptions.ReadTimeout,
            requests.exceptions.ConnectTimeout,
            requests.exceptions.Timeout,
            requests.exceptions.ConnectionError,
        ) as e:
            last_err = e
            wait = 1.5 * (attempt + 1)
            print(f"[lastfm] network timeout/conn issue ({e.__class__.__name__}), retrying in {wait:.1f}s...", flush=True)
            time.sleep(wait)
            continue

    raise RuntimeError(f"Last.fm network kept failing after retries: {last_err}")


def pick_best(paths, used_files):
    for p in sorted(paths, key=path_score):
        mpd_file = ensure_mpd_path(p)
        if mpd_file not in used_files:
            return mpd_file
    return None


def fuzzy_within_artist(text_map: dict, rec_artist: str, rec_title: str):
    a = norm(rec_artist)
    t = norm(rec_title)
    if not a or not t:
        return None

    key = f"{a}|{t}"
    if key in text_map:
        return text_map[key]

    t_words = t.split()
    t_prefix = " ".join(t_words[:8]) if len(t_words) > 8 else t

    candidates = []
    prefix = a + "|"
    for k, paths in text_map.items():
        if not k.startswith(prefix):
            continue
        _, title_norm = k.split("|", 1)
        if title_norm == t or title_norm.startswith(t_prefix) or t.startswith(title_norm):
            candidates.extend(paths)

    return candidates or None


def find_seed_file(text_map: dict, artist: str, title: str):
    """Best-effort local-library lookup for seed track file path."""
    key = f"{norm(artist)}|{norm(title)}"
    paths = text_map.get(key)
    if paths:
        return sorted(paths, key=path_score)[0]

    paths = fuzzy_within_artist(text_map, artist, title)
    if paths:
        return sorted(paths, key=path_score)[0]

    return None


def read_tags(mpd_file: str):
    """
    Return (artist, title, album, genre).
    Empty strings if unavailable or unreadable.
    """
    if not mpd_file:
        return ("", "", "", "")

    # Candidate filesystem paths for this MPD file
    candidates = []

    f = mpd_file.lstrip("/")

    if f.startswith("USB/"):
        tail = f[len("USB/"):]
        candidates.extend([
            f"/mnt/SamsungMoode/{tail}",
            f"/mnt/OSDISK/{tail}",
            f"/media/{tail}",
        ])
    else:
        candidates.append(f)

    for path in candidates:
        try:
            mf = MutagenFile(path, easy=True)
            if not mf or not mf.tags:
                continue

            artist = str(mf.tags.get("artist", [""])[0])
            title  = str(mf.tags.get("title", [""])[0])
            album  = str(mf.tags.get("album", [""])[0])
            genre  = str(mf.tags.get("genre", [""])[0])

            return (artist, title, album, genre)
        except Exception:
            continue

    # Nothing worked
    return ("", "", "", "")


def main():
    ap = argparse.ArgumentParser(description="Build a chained Last.fm-based queue in moOde/MPD.")
    ap.add_argument("--api-key", default=os.environ.get("LASTFM_API_KEY", ""))
    ap.add_argument("--index", default="/home/moode/moode_library_index.json")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=6600)

    ap.add_argument("--similar-limit", type=int, default=150)
    ap.add_argument("--target-queue", type=int, default=50)
    ap.add_argument("--sleep", type=float, default=0.0)
    ap.add_argument("--crop", action="store_true")

    ap.add_argument("--max-misses", type=int, default=10)
    ap.add_argument("--reseed-window", type=int, default=12)
    ap.add_argument("--reseed-random", action="store_true")

    ap.add_argument("--include-christmas", action="store_true",
                    help="Allow Christmas/holiday tracks in the queue")
    ap.add_argument("--exclude-christmas", action="store_true",
                    help="Force-exclude Christmas/holiday tracks (overrides include)")

    ap.add_argument("--shuffle-top", type=int, default=10,
                    help="Randomize candidate order within the top N Last.fm similar results (0 disables)")

    # Orchestration options
    ap.add_argument("--seed-artist", default="", help="Seed artist override")
    ap.add_argument("--seed-title", default="", help="Seed title override")
    ap.add_argument("--mode", choices=["load", "play"], default="load",
                    help="load: build queue and stop, play: build queue and start playback")
    ap.add_argument("--append", action="store_true",
                    help="Append to existing queue instead of replacing")
    ap.add_argument("--max-seconds", type=int, default=0,
                    help="Time budget for build; 0 disables")
    ap.add_argument("--json-out", default="",
                    help="Optional JSON output path")
    ap.add_argument("--dry-run", action="store_true",
                    help="Preview tracks without touching MPD")

    args = ap.parse_args()

    if not args.api_key:
        raise SystemExit("ERROR: Provide Last.fm API key via --api-key or env LASTFM_API_KEY")

    env_inc = os.getenv("INCLUDE_CHRISTMAS", "").strip().lower()
    include_xmas = env_inc in ("1", "true", "yes", "y", "on")
    if args.include_christmas:
        include_xmas = True
    if args.exclude_christmas:
        include_xmas = False

    print(f"[{datetime.now().strftime('%H:%M:%S')}] load index {args.index}", flush=True)
    try:
        with open(args.index, "r", encoding="utf-8") as f:
            idx = json.load(f)
        mbid_map = idx.get("mbid_map", {})
        text_map = idx.get("text_map", {})
        print(f"[{datetime.now().strftime('%H:%M:%S')}] index OK: {sum(len(paths) for paths in text_map.values())} text tracks")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] WARNING index load failed ({args.index}): {e}. Empty library.", flush=True)
        mbid_map = {}
        text_map = {}

    # NOTE: even for preview we still connect to MPD to read current song / playlistinfo.
    print(f"[{datetime.now().strftime('%H:%M:%S')}] STEP: mpd connect {args.host}:{args.port}", flush=True)
    mpd = mpd_connect(args.host, args.port)

    def queue_len() -> int:
        try:
            return int(mpd.status().get("playlistlength", "0"))
        except Exception:
            return 0

    # Track output for UI/API
    out_tracks = []

    # -----------------------------
    # Seed resolution
    # -----------------------------
    seed_artist = (args.seed_artist or "").strip()
    seed_title = (args.seed_title or "").strip()

    if (seed_artist and not seed_title) or (seed_title and not seed_artist):
        mpd.disconnect()
        print("ERROR: Provide both --seed-artist and --seed-title (or neither).")
        return

    cur = mpd.currentsong()
    if not seed_artist and not seed_title:
        if not cur:
            mpd.disconnect()
            print("Nothing playing and no explicit seed provided.")
            return
        seed_artist = (cur.get("artist") or "").strip()
        seed_title = (cur.get("title") or "").strip()
        if not seed_artist or not seed_title:
            mpd.disconnect()
            print("Current track missing artist/title.")
            return

    # last album guard (avoid immediate same-album picks)
    last_album_k = ""
    if cur:
        cur_a = (cur.get("artist") or "").strip()
        cur_t = (cur.get("title") or "").strip()
        if norm(cur_a) == norm(seed_artist) and norm(cur_t) == norm(seed_title):
            last_album_k = album_key((cur.get("album") or "").strip())

    # If explicit seed wasn't current song, try local lookup to set album context
    if not last_album_k:
        seed_file = find_seed_file(text_map, seed_artist, seed_title)
        if seed_file:
            alb0 = read_tags(seed_file)[2]
            if alb0:
                last_album_k = album_key(alb0)

    # -----------------------------
    # Queue handling (ONLY when not dry-run)
    # -----------------------------
    if not args.dry_run and not args.append:
        # Prefer crop (keep now playing) if requested, else clear.
        if args.crop:
            subprocess.run(["mpc", "-h", args.host, "-p", str(args.port), "crop"], check=False)
        else:
            try:
                mpd.clear()
            except Exception:
                pass

    used_files = set()
    try:
        for item in mpd.playlistinfo():
            if "file" in item:
                used_files.add((item["file"] or "").strip())
    except Exception:
        pass

    used_tracks = set()
    k0 = track_key(seed_artist, seed_title)
    if k0:
        used_tracks.add(k0)

    added_seed_history = []
    reseed_cursor = 0

    album_cache = {}
    bad_files = set()

    print(f"Seed: {seed_title} — {seed_artist}")
    print(f"Starting queue length: {queue_len()}  (target {args.target_queue})")
    print(f"Mode: {args.mode}  | Append: {'yes' if args.append else 'no'}")
    print(f"Dry-run: {'YES' if args.dry_run else 'no'}")
    print(f"Christmas/holiday: {'ALLOWED' if include_xmas else 'EXCLUDED'}")
    if args.shuffle_top and args.shuffle_top > 0:
        print(f"Candidate shuffle: top {args.shuffle_top} randomized")
    if args.max_seconds > 0:
        print(f"Time budget: {args.max_seconds}s")

    hops = 0
    misses = 0
    started = time.time()

    # IMPORTANT: in dry-run, we do NOT rely on live MPD queue_len() because we are not modifying it.
    # We instead build up out_tracks to args.target_queue.
    def have_enough() -> bool:
        if args.dry_run:
            return len(out_tracks) >= args.target_queue
        return queue_len() >= args.target_queue

    while not have_enough():
        if args.max_seconds > 0 and (time.time() - started) >= args.max_seconds:
            print(f"Time budget reached ({args.max_seconds}s), stopping.")
            break

        hops += 1

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Last.fm get similar {seed_artist} - {seed_title} limit {args.similar_limit}", flush=True)
        sim = lastfm_get_similar(args.api_key, seed_artist, seed_title, args.similar_limit)

        if args.shuffle_top and args.shuffle_top > 0 and sim:
            n = min(args.shuffle_top, len(sim))
            head = sim[:n]
            tail = sim[n:]
            random.shuffle(head)
            sim = head + tail

        chosen_file = None
        chosen_label = ""
        chosen_method = ""
        chosen_rec_artist = ""
        chosen_rec_title = ""
        chosen_album_k = ""

        print(f"[{datetime.now().strftime('%H:%M:%S')}] pick from {len(sim)} similar", flush=True)
        for t in sim:
            rec_title = (t.get("name") or "").strip()
            rec_artist = t.get("artist", {})
            if isinstance(rec_artist, dict):
                rec_artist = (rec_artist.get("name") or "").strip()
            else:
                rec_artist = str(rec_artist).strip()
            rec_mbid = (t.get("mbid") or "").strip().lower()

            if not rec_title or not rec_artist:
                continue

            # Strong seasonal filter at recommendation level
            if not include_xmas and is_seasonal_text(rec_title, rec_artist):
                continue

            rk = track_key(rec_artist, rec_title)
            if rk and rk in used_tracks:
                continue

            cand = None
            method = ""

            # 1) MBID map
            if rec_mbid and rec_mbid in mbid_map:
                cand = pick_best(mbid_map[rec_mbid], used_files)
                if cand:
                    method = "mbid"

            # 2) exact text map
            if not cand:
                key = f"{norm(rec_artist)}|{norm(rec_title)}"
                paths = text_map.get(key)
                if paths:
                    cand = pick_best(paths, used_files)
                    if cand:
                        method = "text"

            # 3) fuzzy within artist
            if not cand:
                paths = fuzzy_within_artist(text_map, rec_artist, rec_title)
                if paths:
                    cand = pick_best(paths, used_files)
                    if cand:
                        method = "fuzzy"

            if not cand:
                continue

            if cand in bad_files:
                continue

            # Strong seasonal filter at local file/tag level
            a_tag, t_tag, alb_tag, g_tag = read_tags(cand)
            if not include_xmas:
                if is_seasonal_text(cand):
                    continue
                if is_seasonal_text(t_tag, alb_tag, a_tag, g_tag):
                    continue

            # same-album guard
            if cand not in album_cache:
                album_cache[cand] = album_key(alb_tag)
            cand_album_k = album_cache.get(cand, "")

            if last_album_k and cand_album_k and cand_album_k == last_album_k:
                continue

            chosen_file = cand
            chosen_method = method
            chosen_label = f"{rec_title} — {rec_artist}"
            chosen_rec_artist = rec_artist
            chosen_rec_title = rec_title
            chosen_album_k = cand_album_k
            break

        if not chosen_file:
            misses += 1

            if added_seed_history:
                window = added_seed_history[-args.reseed_window:] if args.reseed_window > 0 else added_seed_history[:]
                window = [s for s in window if s != (seed_artist, seed_title)]
                if not include_xmas:
                    window = [s for s in window if not is_seasonal_text(s[1], s[0])]

                if not window:
                    print(f"[hop {hops}] No add (miss {misses}/{args.max_misses}). No alternate reseed candidates.")
                else:
                    if args.reseed_random:
                        new_seed = random.choice(window)
                    else:
                        idx_back = min(reseed_cursor, len(window) - 1)
                        new_seed = window[-1 - idx_back]
                        reseed_cursor += 1
                        if reseed_cursor >= len(window):
                            reseed_cursor = 0

                    seed_artist, seed_title = new_seed
                    print(f"[hop {hops}] No add (miss {misses}/{args.max_misses}). Reseed -> {seed_title} — {seed_artist}")
            else:
                print(f"[hop {hops}] No add (miss {misses}/{args.max_misses}). No reseed candidates yet.")

            if misses >= args.max_misses:
                break
            continue

        # Record for UI/API (always)
        a2, t2, alb2, g2 = read_tags(chosen_file)
        out_tracks.append({
            "file": chosen_file,
            "artist": a2 or chosen_rec_artist,
            "title": t2 or chosen_rec_title,
            "album": alb2 or "",
            "genre": g2 or "",
            "method": chosen_method,
            "rec_artist": chosen_rec_artist,
            "rec_title": chosen_rec_title,
        })

        # Actually add to MPD only when not dry-run
        if not args.dry_run:
            try:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] added {chosen_label} ({chosen_method}) file {chosen_file}", flush=True)
                mpd.add(chosen_file)
            except CommandError as e:
                msg = str(e)
                if "No such directory" in msg or "Not found" in msg:
                    bad_files.add(chosen_file)
                    print(f"[hop {hops}] SKIP (MPD can't add): {chosen_label} -> {chosen_file} ({msg})")
                    misses += 1
                    if misses >= args.max_misses:
                        break
                    continue
                raise
            print(f"[{datetime.now().strftime('%H:%M:%S')}] queue len {queue_len()}", flush=True)

        used_files.add(chosen_file)
        misses = 0
        reseed_cursor = 0

        # Next hop seed from actual local tags when possible
        if a2 and t2:
            seed_artist, seed_title = a2, t2
        else:
            seed_artist, seed_title = chosen_rec_artist, chosen_rec_title

        if chosen_album_k:
            last_album_k = chosen_album_k
        elif alb2:
            last_album_k = album_key(alb2)

        k2 = track_key(seed_artist, seed_title)
        if k2:
            used_tracks.add(k2)

        added_seed_history.append((seed_artist, seed_title))

        print(f"[hop {hops}] Added: {chosen_label} ({chosen_method})")
        if not args.dry_run:
            print(f"Queue length now: {queue_len()}")

        if args.sleep > 0:
            time.sleep(args.sleep)

    # Final state (do not stop/play in dry-run)
    final_state = "unknown"
    try:
        final_state = mpd.status().get("state", "unknown")
    except Exception:
        pass

    final_len = queue_len()
    if args.dry_run:
        final_len = len(out_tracks)

    if not args.dry_run:
        if args.mode == "play":
            try:
                mpd.play()
            except Exception:
                pass
        else:
            try:
                mpd.stop()
            except Exception:
                pass

    summary = {
        "seed_artist": seed_artist,
        "seed_title": seed_title,
        "target_queue": args.target_queue,
        "final_queue": final_len,
        "mode": args.mode,
        "state": final_state,
        "append": bool(args.append),
        "include_christmas": bool(include_xmas),
        "hops": hops,
        "max_misses": args.max_misses,
        "shuffle_top": args.shuffle_top,
        "dry_run": bool(args.dry_run),
        "crop": bool(args.crop),
        "tracks": out_tracks,
    }

    if args.json_out:
        try:
            with open(args.json_out, "w", encoding="utf-8") as f:
                json.dump(summary, f, indent=2)
        except Exception:
            print(f"WARN: failed writing json output to {args.json_out}")

    print(f"[{datetime.now().strftime('%H:%M:%S')}] final queue {final_len}", flush=True)
    mpd.disconnect()
    print(f"Done. Final queue length: {final_len} | mode={args.mode} | state={final_state} | dry_run={args.dry_run}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_exc("TRACEBACK")
        raise SystemExit(1)