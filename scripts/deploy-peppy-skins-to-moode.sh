#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MOODE_HOST="${MOODE_HOST:-10.0.0.254}"
MOODE_USER="${MOODE_USER:-moode}"
REMOTE_DIR="/opt/peppymeter/1280x400"

node scripts/export-peppymeter-skins.mjs
scp exports/peppymeter/1280x400/* "${MOODE_USER}@${MOODE_HOST}:/tmp/"

ssh "${MOODE_USER}@${MOODE_HOST}" "bash -s" <<'REMOTE'
set -e
REMOTE_DIR="/opt/peppymeter/1280x400"
sudo cp -f /tmp/*.png "$REMOTE_DIR"/ || true

if [ -f /tmp/meters.generated.txt ]; then
  sudo python3 - <<'PY'
from pathlib import Path
p = Path('/opt/peppymeter/1280x400/meters.txt')
text = p.read_text()
for skin in ('mack-blue-compact', 'cassette-linear'):
    lines = text.splitlines()
    out = []
    inblk = False
    for ln in lines:
        s = ln.strip()
        if s == f'[{skin}]':
            inblk = True
            continue
        if inblk and s.startswith('[') and s.endswith(']'):
            inblk = False
        if not inblk:
            out.append(ln)
    text = '\n'.join(out) + '\n'
p.write_text(text)
PY

  sudo tee -a "$REMOTE_DIR/meters.txt" >/dev/null < /tmp/meters.generated.txt
fi

sudo rm -f /tmp/meters.generated.txt /tmp/*.png || true
echo "remote deploy complete"
REMOTE

echo "Deployed generated peppy skins to ${MOODE_USER}@${MOODE_HOST}:${REMOTE_DIR}"
