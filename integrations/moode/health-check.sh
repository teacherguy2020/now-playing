#!/usr/bin/env bash
set -euo pipefail

# Read-only post-upgrade check for the moOde AirPlay metadata path.
#
# Usage:
#   ./health-check.sh [moode-ssh-host] [sonuvi-api-url]
#
# The check never enables, restarts, stops, or edits a service. Run it while
# a newly played AirPlay track is active so the freshness assertion is useful.

SSH_HOST="${1:-${MOODE_SSH_HOST:-moode-pi}}"
SONUVI_URL="${2:-${SONUVI_API_URL:-http://sonuvi.local:3101}}"
FRESH_MAX_AGE_SECONDS="${FRESH_MAX_AGE_SECONDS:-900}"

if [[ ! "$FRESH_MAX_AGE_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "FRESH_MAX_AGE_SECONDS must be a non-negative integer" >&2
  exit 2
fi

echo "Checking moOde AirPlay metadata path on ${SSH_HOST}"
echo "Checking Sonuvi /now-playing at ${SONUVI_URL%/}/now-playing"

ssh "$SSH_HOST" bash -s -- "$SONUVI_URL" "$FRESH_MAX_AGE_SECONDS" <<'REMOTE_CHECK'
set -euo pipefail

SONUVI_URL="$1"
FRESH_MAX_AGE_SECONDS="$2"
PIPE="/tmp/shairport-sync-metadata"
META_FILE="/var/local/www/aplmeta.txt"
failures=0

pass() {
  printf 'PASS: %s\n' "$*"
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

if systemctl is-active --quiet airplay-json.service; then
  pass "airplay-json.service is active"
else
  fail "airplay-json.service is not active"
fi

if systemctl is-active --quiet airplay-json-watchdog.timer; then
  pass "airplay-json-watchdog.timer is active"
else
  fail "airplay-json-watchdog.timer is not active"
fi

# The historical untracked unit is the known duplicate-reader failure mode.
if systemctl is-active --quiet aplmeta-reader.service 2>/dev/null; then
  fail "duplicate aplmeta-reader.service is active"
else
  pass "no duplicate aplmeta-reader.service is active"
fi

reader_pids="$(pgrep -x shairport-sync-metadata-reader || true)"
reader_count="$(printf '%s\n' "$reader_pids" | awk 'NF { count++ } END { print count + 0 }')"
if [[ "$reader_count" == "1" ]]; then
  pass "exactly one shairport-sync-metadata-reader process is active (PID ${reader_pids//$'\n'/ })"
else
  fail "expected exactly one shairport-sync-metadata-reader process, found ${reader_count}"
fi

if [[ -p "$PIPE" ]]; then
  pass "metadata FIFO exists: $PIPE"
else
  fail "metadata FIFO is missing or is not a named pipe: $PIPE"
fi

metadata_line=""
metadata_fresh=0
if [[ -f "$META_FILE" ]]; then
  metadata_line="$(tail -n 1 "$META_FILE" 2>/dev/null || true)"
  if metadata_mtime="$(stat -c %Y "$META_FILE" 2>/dev/null)"; then
    now="$(date +%s)"
    age=$((now - metadata_mtime))
    (( age < 0 )) && age=0
    if (( age <= FRESH_MAX_AGE_SECONDS )); then
      metadata_fresh=1
      pass "aplmeta.txt is fresh (${age}s old; limit ${FRESH_MAX_AGE_SECONDS}s)"
    else
      fail "aplmeta.txt is stale (${age}s old; limit ${FRESH_MAX_AGE_SECONDS}s)"
    fi
  else
    fail "could not read mtime for $META_FILE"
  fi
else
  fail "metadata file is missing: $META_FILE"
fi

sonuvi_json=""
if sonuvi_json="$(curl -fsS --max-time 8 "${SONUVI_URL%/}/now-playing")"; then
  pass "Sonuvi /now-playing responded"
else
  fail "Sonuvi /now-playing did not respond successfully"
fi

if (( metadata_fresh == 1 )) && [[ -n "$metadata_line" ]] && [[ -n "$sonuvi_json" ]]; then
  if SONUVI_JSON="$sonuvi_json" METADATA_LINE="$metadata_line" python3 - <<'PY'
import json
import os
import sys

line = os.environ.get("METADATA_LINE", "").strip()
parts = line.split("~~~")
if len(parts) < 6 or not parts[0].strip():
    print("invalid or empty aplmeta.txt record", file=sys.stderr)
    raise SystemExit(1)

try:
    payload = json.loads(os.environ["SONUVI_JSON"])
except (KeyError, json.JSONDecodeError) as exc:
    print(f"invalid Sonuvi /now-playing JSON: {exc}", file=sys.stderr)
    raise SystemExit(1)

if payload.get("isAirplay") is not True:
    print("Sonuvi does not report isAirplay=true", file=sys.stderr)
    raise SystemExit(1)
if payload.get("state") != "play":
    print(f"Sonuvi reports state={payload.get('state')!r}, expected play", file=sys.stderr)
    raise SystemExit(1)

expected = {
    "title": parts[0].strip(),
    "artist": parts[1].strip(),
    "album": parts[2].strip(),
}
for field, value in expected.items():
    # Some senders omit artist/album; compare those only when the source sent
    # a value. The title is required above and must always reach Sonuvi.
    if value and str(payload.get(field, "")).strip() != value:
        print(
            f"Sonuvi {field} does not match aplmeta.txt: "
            f"{payload.get(field)!r} != {value!r}",
            file=sys.stderr,
        )
        raise SystemExit(1)

if not any(str(payload.get(field, "")).strip() for field in ("albumArtUrl", "altArtUrl")):
    print("Sonuvi response has no AirPlay artwork URL", file=sys.stderr)
    raise SystemExit(1)

print(
    "Sonuvi matches fresh AirPlay metadata: "
    f"{expected['artist']} — {expected['title']}"
)
PY
  then
    pass "fresh AirPlay metadata reached Sonuvi with artwork"
  else
    fail "Sonuvi response does not match the fresh aplmeta.txt record"
  fi
else
  fail "skipped metadata-to-Sonuvi comparison because a prerequisite check failed"
fi

if (( failures > 0 )); then
  printf '%s\n' "AirPlay metadata health check failed (${failures} issue(s))." >&2
  exit 1
fi

echo "AirPlay metadata health check passed. No services or configuration were changed."
REMOTE_CHECK
