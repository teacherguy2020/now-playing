#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./revert.sh moode-pi [STAMP]
# If STAMP omitted, uses latest backup found per file.

HOST="${1:-moode-pi}"
STAMP="${2:-}"

pick_backup() {
  local host="$1" base="$2" stamp="$3"
  if [[ -n "$stamp" ]]; then
    echo "${base}.bak.${stamp}"
  else
    ssh "$host" "ls -1t '${base}.bak.'* 2>/dev/null | head -n1"
  fi
}

REMOTE_APLMETA_PY="/var/www/util/aplmeta.py"
REMOTE_READER_SH="/var/www/daemon/aplmeta-reader.sh"
REMOTE_SHAIRPORT_CONF="/etc/shairport-sync.conf"

APLMETA_BAK="$(pick_backup "$HOST" "$REMOTE_APLMETA_PY" "$STAMP")"
READER_BAK="$(pick_backup "$HOST" "$REMOTE_READER_SH" "$STAMP")"
CONF_BAK="$(pick_backup "$HOST" "$REMOTE_SHAIRPORT_CONF" "$STAMP")"

echo "==> Reverting on ${HOST}"
echo "    aplmeta.py <- ${APLMETA_BAK}"
echo "    aplmeta-reader.sh <- ${READER_BAK}"
echo "    shairport-sync.conf <- ${CONF_BAK}"

ssh "$HOST" "test -f '${APLMETA_BAK}' && sudo -n cp '${APLMETA_BAK}' '${REMOTE_APLMETA_PY}'"
ssh "$HOST" "test -f '${READER_BAK}' && sudo -n cp '${READER_BAK}' '${REMOTE_READER_SH}'"
ssh "$HOST" "test -f '${CONF_BAK}' && sudo -n cp '${CONF_BAK}' '${REMOTE_SHAIRPORT_CONF}'"
ssh "$HOST" "sudo -n chmod +x '${REMOTE_READER_SH}'"

echo "==> Restarting AirPlay path"
ssh "$HOST" "sudo -n /var/www/util/restart-renderer.php --airplay"

echo "==> Done"
