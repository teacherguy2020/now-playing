#!/usr/bin/env python3
import json
import os
import re
from mpd import MPDClient

INDEX_PATH = "/home/moode/moode_library_index.json"
MPD_HOST = os.environ.get("MPD_HOST", "10.0.0.254")
MPD_PORT = int(os.environ.get("MPD_PORT", "6600"))

TITLE_JUNK = [
    "album version", "single version", "radio edit", "edit",
    "remaster", "remastered", "live", "live album version",
    "mono", "stereo", "bonus track", "deluxe edition", "expanded edition",
]

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

def main():
    c = MPDClient()
    c.timeout = 30
    c.idletimeout = None
    c.connect(MPD_HOST, MPD_PORT)

    # Pull everything MPD knows. This is usually fast enough.
    files = c.listall("")

    text_map = {}
    total = 0
    tagged = 0

    for item in files:
        f = (item.get("file") or "").strip()
        if not f:
            continue
        total += 1
        try:
            info = c.find("file", f)
        except Exception:
            continue
        if not info:
            continue
        md = info[0]
        artist = (md.get("artist") or "").strip()
        title = (md.get("title") or "").strip()
        if not artist or not title:
            continue
        k = f"{norm(artist)}|{norm(title)}"
        if not k or "|" not in k:
            continue
        tagged += 1
        text_map.setdefault(k, []).append(f)

    c.disconnect()

    out = {
        "text_map": text_map,
        "mbid_map": {},  # optional; keep empty for now
        "meta": {
            "mpd_host": MPD_HOST,
            "mpd_port": MPD_PORT,
            "total_files": total,
            "tagged_files": tagged,
        },
    }

    # atomic write to avoid 0-byte index if interrupted
    tmp = INDEX_PATH + ".tmp"
    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f)
    os.replace(tmp, INDEX_PATH)

    print(f"Wrote index: {INDEX_PATH}")
    print(f"Total files: {total}")
    print(f"Tagged files (artist+title): {tagged}")
    print(f"Unique keys: {len(text_map)}")

if __name__ == "__main__":
    main()
