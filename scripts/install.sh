#!/usr/bin/env bash
set -euo pipefail

# now-playing installer scaffold (v0)
# This script is intentionally conservative and prints TODOs where project-specific
# decisions are still pending.

APP_NAME="now-playing"
DEFAULT_INSTALL_DIR="/opt/${APP_NAME}"
DEFAULT_PORT="3101"
MODE="split"
INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
ALLOW_ROOT="false"
NON_INTERACTIVE="false"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --mode <split|single-box>   Deployment mode (default: split)
  --install-dir <path>        Install directory (default: ${DEFAULT_INSTALL_DIR})
  --port <number>             API port (default: ${DEFAULT_PORT})
  --non-interactive           Do not prompt; require env/flags
  --allow-root                Allow running as root
  -h, --help                  Show this help
EOF
}

log() { printf "[install] %s\n" "$*"; }
err() { printf "[install][error] %s\n" "$*" >&2; }

require_bin() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required binary: $1"; exit 1; }
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"; shift 2 ;;
    --install-dir)
      INSTALL_DIR="${2:-}"; shift 2 ;;
    --port)
      DEFAULT_PORT="${2:-}"; shift 2 ;;
    --non-interactive)
      NON_INTERACTIVE="true"; shift ;;
    --allow-root)
      ALLOW_ROOT="true"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      err "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ "$ALLOW_ROOT" != "true" && "${EUID:-$(id -u)}" -eq 0 ]]; then
  err "Refusing to run as root. Re-run with --allow-root if intentional."
  exit 1
fi

if [[ "$MODE" != "split" && "$MODE" != "single-box" ]]; then
  err "Invalid --mode: $MODE"
  exit 1
fi

require_bin node
require_bin npm
require_bin curl

if ! command -v systemctl >/dev/null 2>&1; then
  err "systemctl not found. This scaffold currently targets systemd hosts."
  err "TODO: add launchd support for macOS and pm2 fallback."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log "Mode: ${MODE}"
log "Project dir: ${PROJECT_DIR}"
log "Install dir: ${INSTALL_DIR}"

log "Creating install directory"
sudo mkdir -p "${INSTALL_DIR}"
sudo rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "*.zip" \
  "${PROJECT_DIR}/" "${INSTALL_DIR}/"

log "Installing dependencies"
if [[ -f "${INSTALL_DIR}/package-lock.json" ]]; then
  sudo npm --prefix "${INSTALL_DIR}" ci
else
  sudo npm --prefix "${INSTALL_DIR}" install
fi

ENV_FILE="${INSTALL_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  log ".env exists; leaving in place"
else
  log "Creating .env from template"
  if [[ -f "${INSTALL_DIR}/.env.example" ]]; then
    sudo cp "${INSTALL_DIR}/.env.example" "${ENV_FILE}"
  else
    cat <<'EOF' | sudo tee "${ENV_FILE}" >/dev/null
# TODO: fill required values
PORT=3101
TRACK_KEY=
MOODE_BASE_URL=
PUBLIC_TRACK_BASE=
ART_MODE=track
EOF
  fi
fi

SERVICE_NAME="${APP_NAME}.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

log "Writing systemd unit: ${SERVICE_PATH}"
cat <<EOF | sudo tee "${SERVICE_PATH}" >/dev/null
[Unit]
Description=Now Playing API
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env node ${INSTALL_DIR}/moode-nowplaying-api.mjs
Restart=always
RestartSec=2
User=${USER}

[Install]
WantedBy=multi-user.target
EOF

log "Reloading and starting service"
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

log "Smoke checks"
set +e
curl -fsS "http://127.0.0.1:${DEFAULT_PORT}/healthz" >/dev/null && log "OK /healthz" || err "FAIL /healthz"
curl -fsS "http://127.0.0.1:${DEFAULT_PORT}/now-playing" >/dev/null && log "OK /now-playing" || err "FAIL /now-playing"
curl -fsS "http://127.0.0.1:${DEFAULT_PORT}/art/current.jpg" >/dev/null && log "OK /art/current.jpg" || err "FAIL /art/current.jpg"
set -e

cat <<EOF

Install scaffold complete.

Next steps:
1) Validate ${ENV_FILE} values.
2) Check service logs: sudo journalctl -u ${SERVICE_NAME} -f
3) If using reverse proxy, point it to http://127.0.0.1:${DEFAULT_PORT}
4) For mode=${MODE}, apply mode-specific tuning (TODO in docs).

EOF
