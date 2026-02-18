#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./install.sh moode-pi
#   ./install.sh user@host

HOST="${1:-moode-pi}"
STAMP="$(date +%Y%m%d-%H%M%S)"

REMOTE_APLMETA_PY="/var/www/util/aplmeta.py"
REMOTE_READER_SH="/var/www/daemon/aplmeta-reader.sh"
REMOTE_SHAIRPORT_CONF="/etc/shairport-sync.conf"

echo "==> Installing moOde integration files to ${HOST}"

ssh "${HOST}" "sudo -n cp '${REMOTE_APLMETA_PY}' '${REMOTE_APLMETA_PY}.bak.${STAMP}'"
ssh "${HOST}" "sudo -n cp '${REMOTE_READER_SH}' '${REMOTE_READER_SH}.bak.${STAMP}'"
ssh "${HOST}" "sudo -n cp '${REMOTE_SHAIRPORT_CONF}' '${REMOTE_SHAIRPORT_CONF}.bak.${STAMP}'"

echo "==> Backups created with suffix .bak.${STAMP}"

scp "aplmeta.py" "${HOST}:/tmp/aplmeta.py"
scp "aplmeta-reader.sh" "${HOST}:/tmp/aplmeta-reader.sh"
scp "shairport-sync.conf.template" "${HOST}:/tmp/shairport-sync.conf"

ssh "${HOST}" "sudo -n cp /tmp/aplmeta.py '${REMOTE_APLMETA_PY}'"
ssh "${HOST}" "sudo -n cp /tmp/aplmeta-reader.sh '${REMOTE_READER_SH}'"
ssh "${HOST}" "sudo -n cp /tmp/shairport-sync.conf '${REMOTE_SHAIRPORT_CONF}'"
ssh "${HOST}" "sudo -n chmod +x '${REMOTE_READER_SH}'"
ssh "${HOST}" "sudo -n python3 -m py_compile '${REMOTE_APLMETA_PY}'"

echo "==> Restarting AirPlay path"
ssh "${HOST}" "sudo -n /var/www/util/restart-renderer.php --airplay"

echo "==> Done"
