#!/usr/bin/env bash
set -euo pipefail

# Repo-owned wrapper for generating moOde playlist cover collages.
# This script runs on the API host and executes the cover script on the moOde host.

PLAYLIST_NAME="${1:-}"
if [[ -z "$PLAYLIST_NAME" ]]; then
  echo "Usage: $0 <playlist-name>" >&2
  exit 2
fi

MOODE_USER="${MOODE_SSH_USER:-moode}"
MOODE_HOST="${MOODE_SSH_HOST:-10.0.0.254}"

CANDIDATES=(
  "${MOODE_PLAYLIST_COVER_REMOTE_SCRIPT:-}"
  "/home/moode/moode-playlist-cover.sh"
  "~/moode-playlist-cover.sh"
  "/usr/local/bin/moode-playlist-cover.sh"
)

for sp in "${CANDIDATES[@]}"; do
  [[ -n "$sp" ]] || continue

  if ssh "${MOODE_USER}@${MOODE_HOST}" bash -lc "$(printf '%q ' "$sp" "$PLAYLIST_NAME")"; then
    exit 0
  fi

  if ssh "${MOODE_USER}@${MOODE_HOST}" bash -lc "sudo -n $(printf '%q ' "$sp" "$PLAYLIST_NAME")"; then
    exit 0
  fi
done

echo "Failed to generate playlist cover on ${MOODE_USER}@${MOODE_HOST}" >&2
exit 1
