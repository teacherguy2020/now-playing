#!/usr/bin/env bash
set -euo pipefail

# Deploy selected now-playing files to the primary Pi5 app host.
# The Pi5 install is root-owned, so files are staged through /tmp and
# installed with the target user's passwordless sudo allowance.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="${NOW_PLAYING_PI5_SERVER:-brianwis@10.0.0.4}"
TARGET_DIR="${NOW_PLAYING_PI5_TARGET_DIR:-/opt/now-playing}"
SSH_KEY="${NOW_PLAYING_PI5_SSH_KEY:-/home/sandbox/.ssh/nowplaying_ed25519}"
HOST="10.0.0.4"
EXPECTED_ED25519_FP="SHA256:LwD4pGw66x6y4vqInIGiW8rN+1uebXkhG9PsinsVnQ4"

if [[ $# -eq 0 ]]; then
  printf 'Usage: %s relative/path [relative/path ...]\n' "$0" >&2
  exit 2
fi

if [[ "$SERVER" != "brianwis@10.0.0.4" ]]; then
  printf 'Refusing non-primary deployment target: %s\n' "$SERVER" >&2
  exit 2
fi

if [[ ! -r "$SSH_KEY" ]]; then
  printf 'Missing Pi5 SSH key: %s\n' "$SSH_KEY" >&2
  exit 1
fi

KNOWN_HOSTS="$(mktemp -t now-playing-pi5-known-hosts.XXXXXX)"
trap 'rm -f "$KNOWN_HOSTS"' EXIT

if ! ssh-keyscan -T 5 -t ed25519 "$HOST" >"$KNOWN_HOSTS" 2>/dev/null; then
  printf 'Could not read the Pi5 host key from %s\n' "$HOST" >&2
  exit 1
fi
if ! ssh-keygen -lf "$KNOWN_HOSTS" -E sha256 | grep -Fq "$EXPECTED_ED25519_FP"; then
  printf 'Pi5 ED25519 host-key fingerprint did not match the pinned value\n' >&2
  exit 1
fi

SSH_OPTS=(
  -i "$SSH_KEY"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o UserKnownHostsFile="$KNOWN_HOSTS"
  -o StrictHostKeyChecking=yes
)

needs_restart=0
for relative_path in "$@"; do
  case "$relative_path" in
    /*|..|../*|*/../*)
      printf 'Refusing non-relative deployment path: %s\n' "$relative_path" >&2
      exit 2
      ;;
  esac

  local_path="$ROOT_DIR/$relative_path"
  if [[ ! -f "$local_path" ]]; then
    printf 'Missing local deployment file: %s\n' "$local_path" >&2
    exit 1
  fi

  case "$relative_path" in
    src/*|moode-nowplaying-api.mjs)
      needs_restart=1
      ;;
  esac

  safe_name="$(printf '%s' "$relative_path" | tr -c 'A-Za-z0-9._-' '_')"
  remote_tmp="/tmp/now-playing-deploy-$$-$safe_name"
  remote_path="$TARGET_DIR/$relative_path"
  remote_tmp_q="$(printf '%q' "$remote_tmp")"
  remote_path_q="$(printf '%q' "$remote_path")"

  scp "${SSH_OPTS[@]}" "$local_path" "$SERVER:$remote_tmp"
  ssh "${SSH_OPTS[@]}" "$SERVER" \
    "sudo -n install -D -o root -g root -m 644 $remote_tmp_q $remote_path_q && rm -f $remote_tmp_q"

  local_hash="$(sha256sum "$local_path" | awk '{print $1}')"
  remote_hash_line="$(ssh "${SSH_OPTS[@]}" "$SERVER" "sha256sum $remote_path_q")"
  remote_hash="${remote_hash_line%% *}"
  if [[ "$local_hash" != "$remote_hash" ]]; then
    printf 'Hash mismatch after deployment: %s\n' "$relative_path" >&2
    exit 1
  fi
  printf 'Deployed %s (%s)\n' "$relative_path" "$local_hash"
done

if [[ "$needs_restart" -eq 1 ]]; then
  ssh "${SSH_OPTS[@]}" "$SERVER" 'sudo -n systemctl restart now-playing.service'
fi

ssh "${SSH_OPTS[@]}" "$SERVER" 'systemctl is-active now-playing.service'
