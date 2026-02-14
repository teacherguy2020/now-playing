#!/usr/bin/env bash
set -euo pipefail

PLAYLIST_NAME=""
TRACKS_FILE_LOCAL=""
FORCE="0"

usage() {
  echo "Usage:" >&2
  echo "  $0 <playlist-name>" >&2
  echo "  $0 --playlist <name> [--tracks-file <local-path>] [--force]" >&2
  exit 2
}

die() { echo "ERROR: $*" >&2; exit 1; }

[[ $# -gt 0 ]] || usage

while [[ $# -gt 0 ]]; do
  case "$1" in
    --playlist) shift; [[ $# -gt 0 ]] || usage; PLAYLIST_NAME="$1"; shift ;;
    --tracks-file) shift; [[ $# -gt 0 ]] || usage; TRACKS_FILE_LOCAL="$1"; shift ;;
    --force) FORCE="1"; shift ;;
    -h|--help) usage ;;
    --*) die "Unknown option: $1" ;;
    *)
      if [[ -z "$PLAYLIST_NAME" ]]; then
        PLAYLIST_NAME="$1"; shift
      else
        die "Unexpected extra argument: $1"
      fi
      ;;
  esac
done

[[ -n "$PLAYLIST_NAME" ]] || usage

MOODE_USER="${MOODE_SSH_USER:-moode}"
MOODE_HOST="${MOODE_SSH_HOST:-10.0.0.254}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=6)

MOODE_COVER_DIR="${MOODE_PLAYLIST_COVER_DIR:-/var/local/www/imagesw/playlist-covers}"
MOODE_PLAYLIST_DIR="${MOODE_MPD_PLAYLIST_DIR:-/var/lib/mpd/playlists}"

CANDIDATES=(
  "${MOODE_PLAYLIST_COVER_REMOTE_SCRIPT:-}"
  "/home/moode/moode-playlist-cover.sh"
  "\$HOME/moode-playlist-cover.sh"
  "/usr/local/bin/moode-playlist-cover.sh"
)

urlencode() {
  python3 - <<'PY' "$1"
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1]))
PY
}

# Mirror moOde script sanitization EXACTLY: keep spaces; allow A-Z a-z 0-9 space _ . -
safe_name="$(printf '%s' "$PLAYLIST_NAME" | tr -cd 'A-Za-z0-9 _.-' | sed 's/^ *//; s/ *$//')"
[[ -n "$safe_name" ]] || die "Playlist name becomes empty after sanitization"

REMOTE_TRACKS_TMP=""
REMOTE_PL_PATH="${MOODE_PLAYLIST_DIR}/${safe_name}.m3u"
REMOTE_PL_TMP_CREATED="0"

ssh_run() {
  # Usage: ssh_run arg1 arg2 ... <<'EOF' <bash script> EOF
  ssh "${SSH_OPTS[@]}" "${MOODE_USER}@${MOODE_HOST}" \
    bash --noprofile --norc -s -- "$@"
}

ssh_run_sudo() {
  ssh "${SSH_OPTS[@]}" "${MOODE_USER}@${MOODE_HOST}" \
    sudo -n bash --noprofile --norc -s -- "$@"
}

cleanup_remote() {
  # best-effort cleanup only
  if [[ -n "${REMOTE_TRACKS_TMP:-}" ]]; then
    ssh_run "$REMOTE_TRACKS_TMP" >/dev/null 2>&1 <<'EOF' || true
set -euo pipefail
rm -f -- "$1" >/dev/null 2>&1 || true
EOF
  fi

  if [[ "$REMOTE_PL_TMP_CREATED" == "1" ]]; then
    # Playlist file lives under mpd dir; remove with sudo
    ssh_run_sudo "$REMOTE_PL_PATH" >/dev/null 2>&1 <<'EOF' || true
set -euo pipefail
rm -f -- "$1" >/dev/null 2>&1 || true
EOF
  fi
}
trap cleanup_remote EXIT

echo "[moode-cover] playlist: $PLAYLIST_NAME" >&2
echo "[moode-cover] safe_name: $safe_name" >&2
[[ -n "$TRACKS_FILE_LOCAL" ]] && echo "[moode-cover] tracks-file(local): $TRACKS_FILE_LOCAL" >&2
[[ "$FORCE" == "1" ]] && echo "[moode-cover] force: yes" >&2

# ---- if tracks-file provided, stage a temp playlist file on moOde ----
if [[ -n "$TRACKS_FILE_LOCAL" ]]; then
  [[ -f "$TRACKS_FILE_LOCAL" ]] || die "--tracks-file not found: $TRACKS_FILE_LOCAL"
  [[ -s "$TRACKS_FILE_LOCAL" ]] || die "--tracks-file is empty: $TRACKS_FILE_LOCAL"

  ts="$(date +%s)"
  rand="${RANDOM}${RANDOM}"
  REMOTE_TRACKS_TMP="/tmp/qw-tracks-${ts}-${rand}.txt"

  echo "[moode-cover] scp tracks-file to ${MOODE_USER}@${MOODE_HOST}:${REMOTE_TRACKS_TMP}" >&2
  scp -q "${SSH_OPTS[@]}" "$TRACKS_FILE_LOCAL" "${MOODE_USER}@${MOODE_HOST}:${REMOTE_TRACKS_TMP}"

  # Move it into the MPD playlists dir as <safe_name>.m3u (with sudo)
  ssh_run_sudo "$REMOTE_TRACKS_TMP" "$REMOTE_PL_PATH" "$MOODE_PLAYLIST_DIR" >/dev/null <<'EOF'
set -euo pipefail
src="$1"
dst="$2"
dir="$3"

mkdir -p -- "$dir"
mv -f -- "$src" "$dst"
chown mpd:audio "$dst" 2>/dev/null || true
chmod 0644 "$dst" 2>/dev/null || true
EOF

  REMOTE_TRACKS_TMP=""
  REMOTE_PL_TMP_CREATED="1"
fi

# ---- if --force, delete existing cover(s) before generating ----
if [[ "$FORCE" == "1" ]]; then
  ssh_run_sudo "$MOODE_COVER_DIR" "$safe_name" >/dev/null <<'EOF' || true
set -euo pipefail
dir="$1"
sn="$2"
p1="$dir/$sn.jpg"
p2="$dir/${sn// /_}.jpg"
rm -f -- "$p1" "$p2" 2>/dev/null || true
EOF
fi

remote_find_cover() {
  ssh_run "$MOODE_COVER_DIR" "$safe_name" <<'EOF'
set -euo pipefail
dir="$1"
sn="$2"

p1="$dir/$sn.jpg"
p2="$dir/${sn// /_}.jpg"
if [[ -f "$p1" ]]; then echo "$p1"; exit 0; fi
if [[ -f "$p2" ]]; then echo "$p2"; exit 0; fi

base="$(printf "%s" "$sn" | tr "[:upper:]" "[:lower:]")"
shopt -s nullglob
for p in "$dir"/*.jpg; do
  bn="$(basename "$p")"
  bl="$(printf "%s" "${bn%.jpg}" | tr "[:upper:]" "[:lower:]")"
  [[ "$bl" == "$base" ]] && echo "$p" && exit 0
done
exit 1
EOF
}

# ---- run the remote script (positional playlist name ONLY) ----
for sp in "${CANDIDATES[@]}"; do
  [[ -n "$sp" ]] || continue
  echo "[moode-cover] Trying remote script: $sp" >&2

  # Expand literal "$HOME/..." candidate locally into a flag we pass; expand on remote safely.
  if ssh_run "$sp" "$safe_name" <<'EOF'
set -euo pipefail
script="$1"
name="$2"

if [[ "$script" == \$HOME/* ]]; then
  script="$HOME/${script#\$HOME/}"
fi

exec "$script" "$name"
EOF
  then
    :
  elif ssh_run_sudo "$sp" "$safe_name" <<'EOF'
set -euo pipefail
script="$1"
name="$2"

if [[ "$script" == \$HOME/* ]]; then
  script="$HOME/${script#\$HOME/}"
fi

exec "$script" "$name"
EOF
  then
    :
  else
    echo "[moode-cover] Failed with: $sp (continuing)" >&2
    continue
  fi

  if cover_path="$(remote_find_cover)"; then
    bn="$(basename "$cover_path")"
    echo "COVER_PATH=${cover_path}"
    echo "COVER_FILE=${bn}"
    echo "COVER_URL=http://${MOODE_HOST}/imagesw/playlist-covers/$(urlencode "$bn")"
    exit 0
  fi

  die "Cover generation reported success but file not found in ${MOODE_COVER_DIR} for safe_name=${safe_name}"
done

die "Failed to generate playlist cover on ${MOODE_USER}@${MOODE_HOST} for playlist: ${PLAYLIST_NAME}"