#!/usr/bin/env bash
set -euo pipefail

# moode-playlist-cover.sh
#
# moOde playlist cover generator (idempotent + batch-safe)
#
# Bottom line (your requirement):
#   - If a cover already exists, LEAVE IT ALONE (no overwrite, no prompts).
#   - Otherwise create one.
#
# IMPORTANT: moOde convention
#   moOde typically uses UNDERSCORES in playlist cover filenames.
#   Canonical output:
#     /var/local/www/imagesw/playlist-covers/<Playlist_Name>.jpg
#   We will WRITE the underscore version.
#   We will also treat a space-named version as "exists" (legacy/compat) and leave it alone.
#
# Cover strategy:
#   - Find up to 4 UNIQUE images in playlist contents (dedupe by image hash)
#   - If only 1 unique image across the playlist -> make a single cover (no collage)
#   - Otherwise make a 2x2 collage (600x600)
#   - Optional: --single forces single-cover even if many unique images exist
#
# Usage:
#   Single playlist:
#     sudo /usr/local/bin/moode-playlist-cover.sh "Favorites"
#     sudo /usr/local/bin/moode-playlist-cover.sh "Holiday" --single
#
#   Batch: generate missing covers for ALL playlists:
#     sudo /usr/local/bin/moode-playlist-cover.sh
#
# Exit codes:
#   0 success / already exists / batch completed
#   3 invalid sanitized name
#   4 playlist not found
#   5 no art found

COVERS_DIR="/var/local/www/imagesw/playlist-covers"
MPD_PL_DIR="/var/lib/mpd/playlists"

PLAYLIST_NAME=""
FORCE_SINGLE=0
PREVIEW_MODE=0
TRACKS_FILE=""
OUT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --single)
      FORCE_SINGLE=1
      shift
      ;;
    --preview)
      PREVIEW_MODE=1
      shift
      ;;
    --tracks-file)
      TRACKS_FILE="${2:-}"
      shift 2
      ;;
    --out)
      OUT_PATH="${2:-}"
      shift 2
      ;;
    --*)
      echo "ERROR: Unknown flag: $1" >&2
      exit 2
      ;;
    *)
      if [[ -z "$PLAYLIST_NAME" ]]; then
        PLAYLIST_NAME="$1"
      else
        echo "ERROR: Unexpected extra argument: $1" >&2
        exit 2
      fi
      shift
      ;;
  esac
done

if [[ "$PREVIEW_MODE" == "1" ]]; then
  if [[ -z "$TRACKS_FILE" || -z "$OUT_PATH" ]]; then
    echo "ERROR: --preview requires --tracks-file and --out" >&2
    exit 2
  fi
  if [[ ! -f "$TRACKS_FILE" ]]; then
    echo "ERROR: tracks file not found: $TRACKS_FILE" >&2
    exit 4
  fi
  PLAYLIST_FILE="$TRACKS_FILE"
else
  # -------------------------------------------------
  # Batch mode: no playlist name supplied
  # -------------------------------------------------
  if [[ -z "$PLAYLIST_NAME" ]]; then
    shopt -s nullglob
    for pl in "$MPD_PL_DIR"/*.m3u; do
      name="$(basename "$pl" .m3u)"
      echo "=== $name ==="
      "$0" "$name" || true
      echo
    done
    exit 0
  fi

  PLAYLIST_FILE="$MPD_PL_DIR/$PLAYLIST_NAME.m3u"

  # --- Safety: keep spaces for display name, strip weird chars
  # Allowed: letters, numbers, space, underscore, dot, dash
  safe_name="$(printf '%s' "$PLAYLIST_NAME" | tr -cd 'A-Za-z0-9 _.-')"
  safe_name="$(printf '%s' "$safe_name" | sed 's/^ *//; s/ *$//')"

  if [[ -z "$safe_name" ]]; then
    echo "ERROR: Playlist name becomes empty after sanitization." >&2
    exit 3
  fi

  # Canonical output is underscore name (moOde convention)
  OUT_UNDER="$COVERS_DIR/${safe_name// /_}.jpg"
  # Legacy/compat: some older covers may exist with spaces
  OUT_SPACE="$COVERS_DIR/$safe_name.jpg"

  # If either exists, LEAVE IT ALONE.
  if [[ -f "$OUT_UNDER" || -f "$OUT_SPACE" ]]; then
    echo "OK: cover already exists; leaving it alone."
    [[ -f "$OUT_UNDER" ]] && echo "  $OUT_UNDER"
    [[ -f "$OUT_SPACE" ]] && echo "  $OUT_SPACE"
    exit 0
  fi

  if [[ ! -f "$PLAYLIST_FILE" ]]; then
    echo "ERROR: Playlist not found: $PLAYLIST_FILE" >&2
    exit 4
  fi
fi

tmpdir="$(mktemp -d /tmp/plcover.XXXXXX)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

# -----------------------------
# Helpers
# -----------------------------

is_local_mpd_path() {
  local line="$1"
  [[ -n "$line" ]] || return 1
  [[ "$line" =~ ^# ]] && return 1
  [[ "$line" =~ ^[[:space:]]*$ ]] && return 1
  [[ "$line" =~ ^(http|https|rtsp|mms|icyx?):// ]] && return 1
  return 0
}

mpd_to_fs_path() {
  local mpd_path="$1"
  if [[ "$mpd_path" == USB/* ]]; then
    printf '/media/%s\n' "${mpd_path#USB/}"
  else
    printf '/%s\n' "$mpd_path"
  fi
}

find_folder_art() {
  local dir="$1"
  local f
  for f in \
    cover.jpg cover.jpeg cover.png \
    folder.jpg folder.jpeg folder.png \
    Cover.jpg Cover.jpeg Cover.png \
    Folder.jpg Folder.jpeg Folder.png
  do
    if [[ -f "$dir/$f" ]]; then
      printf '%s\n' "$dir/$f"
      return 0
    fi
  done
  return 1
}

extract_embedded_art() {
  local audio="$1"
  local outimg="$2"

  # Try attached picture stream first
  if ffmpeg -hide_banner -loglevel error -y \
      -i "$audio" -map 0:v:0 -frames:v 1 "$outimg" 2>/dev/null; then
    [[ -s "$outimg" ]] && return 0
  fi

  # Fallback: allow ffmpeg to pick a video stream if present
  if ffmpeg -hide_banner -loglevel error -y \
      -i "$audio" -frames:v 1 "$outimg" 2>/dev/null; then
    [[ -s "$outimg" ]] && return 0
  fi

  return 1
}

img_hash() {
  local img="$1"
  md5sum "$img" 2>/dev/null | awk '{print $1}'
}

# -----------------------------
# Collect unique images (dedupe by IMAGE CONTENT hash)
# -----------------------------
declare -A SEEN_HASH
covers=()

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line//$'\r'/}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"

  is_local_mpd_path "$line" || continue

  fs_path="$(mpd_to_fs_path "$line")"
  [[ -f "$fs_path" ]] || continue

  dir="$(dirname "$fs_path")"

  candidate=""
  tmpimg=""

  if folder_art="$(find_folder_art "$dir")"; then
    candidate="$folder_art"
  else
    tmpimg="$tmpdir/embedded_try_$(printf '%08x' $RANDOM)_${#covers[@]}.jpg"
    if extract_embedded_art "$fs_path" "$tmpimg"; then
      candidate="$tmpimg"
    else
      rm -f "$tmpimg" 2>/dev/null || true
      continue
    fi
  fi

  h="$(img_hash "$candidate")"
  [[ -n "$h" ]] || continue

  if [[ -z "${SEEN_HASH[$h]:-}" ]]; then
    SEEN_HASH["$h"]=1
    covers+=("$candidate")
  else
    # If embedded temp is a duplicate, discard it
    [[ -n "$tmpimg" ]] && rm -f "$tmpimg" 2>/dev/null || true
  fi

  # Keep scanning to collect more unique art so collage can be more diverse.
done < "$PLAYLIST_FILE"

if [[ "${#covers[@]}" -eq 0 ]]; then
  echo "WARN: No art found for playlist '$PLAYLIST_NAME' (streams-only or no embedded/folder art)." >&2
  exit 5
fi

# -----------------------------
# Output functions
# -----------------------------

write_out() {
  if [[ "$PREVIEW_MODE" == "1" ]]; then
    install -m 0644 "$1" "$OUT_PATH"
  else
    # Always write canonical underscore-name
    sudo install -o root -g root -m 0644 "$1" "$OUT_UNDER"
  fi
}

make_single_cover() {
  local src="$1"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$src" \
    -vf "scale=600:600:force_original_aspect_ratio=increase,crop=600:600,format=yuvj420p" \
    -q:v 2 "$tmpdir/out.jpg"
  write_out "$tmpdir/out.jpg"
}

make_collage() {
  local TILE=300
  local n="${#covers[@]}"
  local c0 c1 c2 c3

  if [[ "$n" -ge 4 ]]; then
    # Spread picks across the unique cover list to avoid clustering one album.
    local i1=$(( (n - 1) / 3 ))
    local i2=$(( (2 * (n - 1)) / 3 ))
    c0="${covers[0]}"
    c1="${covers[$i1]}"
    c2="${covers[$i2]}"
    c3="${covers[$((n - 1))]}"
  elif [[ "$n" -eq 3 ]]; then
    c0="${covers[0]}"
    c1="${covers[1]}"
    c2="${covers[2]}"
    c3="${covers[1]}"
  elif [[ "$n" -eq 2 ]]; then
    # Checkerboard-ish repeat so one cover isn't shown 3x.
    c0="${covers[0]}"
    c1="${covers[1]}"
    c2="${covers[1]}"
    c3="${covers[0]}"
  else
    c0="${covers[0]}"
    c1="${covers[0]}"
    c2="${covers[0]}"
    c3="${covers[0]}"
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -i "$c0" -i "$c1" -i "$c2" -i "$c3" \
    -filter_complex "\
      [0:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=increase,crop=${TILE}:${TILE}[t0]; \
      [1:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=increase,crop=${TILE}:${TILE}[t1]; \
      [2:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=increase,crop=${TILE}:${TILE}[t2]; \
      [3:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=increase,crop=${TILE}:${TILE}[t3]; \
      [t0][t1][t2][t3]xstack=inputs=4:layout=0_0|${TILE}_0|0_${TILE}|${TILE}_${TILE},format=yuvj420p[out]" \
    -map "[out]" -q:v 2 "$tmpdir/out.jpg"

  write_out "$tmpdir/out.jpg"
}

# -----------------------------
# Decision logic
# -----------------------------

if [[ "$FORCE_SINGLE" == "1" ]]; then
  echo "NOTE: --single enabled; using a single cover (no collage)."
  make_single_cover "${covers[0]}"
  if [[ "$PREVIEW_MODE" == "1" ]]; then
    echo "OK: generated (single forced) $OUT_PATH"
  else
    echo "OK: generated (single forced) $OUT_UNDER"
  fi
  exit 0
fi

if [[ "${#covers[@]}" -eq 1 ]]; then
  make_single_cover "${covers[0]}"
  if [[ "$PREVIEW_MODE" == "1" ]]; then
    echo "OK: generated (single unique) $OUT_PATH"
  else
    echo "OK: generated (single unique) $OUT_UNDER"
  fi
  exit 0
fi

make_collage
if [[ "$PREVIEW_MODE" == "1" ]]; then
  echo "OK: generated (collage) $OUT_PATH"
else
  echo "OK: generated (collage) $OUT_UNDER"
fi