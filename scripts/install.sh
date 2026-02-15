#!/usr/bin/env bash
set -euo pipefail

APP_NAME="now-playing"
DEFAULT_INSTALL_DIR="/opt/${APP_NAME}"
DEFAULT_PORT="3101"
DEFAULT_REPO_URL="https://github.com/teacherguy2020/now-playing.git"
DEFAULT_REF="main"

MODE="split"
INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
PORT="${DEFAULT_PORT}"
WEB_PORT="8101"
REPO_URL="${DEFAULT_REPO_URL}"
REF="${DEFAULT_REF}"
ALLOW_ROOT="false"
NON_INTERACTIVE="false"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --mode <split|single-box>   Deployment mode (default: ${MODE})
  --install-dir <path>        Install directory (default: ${DEFAULT_INSTALL_DIR})
  --port <number>             API port (default: ${DEFAULT_PORT})
  --repo <url>                Git repo URL (default: ${DEFAULT_REPO_URL})
  --ref <branch|tag|sha>      Git ref to install (default: ${DEFAULT_REF})
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
      PORT="${2:-}"; shift 2 ;;
    --repo)
      REPO_URL="${2:-}"; shift 2 ;;
    --ref)
      REF="${2:-}"; shift 2 ;;
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

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  err "Invalid --port: $PORT"
  exit 1
fi

require_bin git
require_bin rsync
require_bin node
require_bin npm
require_bin curl

if ! command -v systemctl >/dev/null 2>&1; then
  err "systemctl not found. This installer currently targets systemd hosts."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1 && [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  err "sudo is required to write ${INSTALL_DIR} and systemd unit files."
  exit 1
fi

SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  SUDO="sudo"
fi

INSTALL_USER="${SUDO_USER:-$USER}"
STAGING_DIR="$(mktemp -d -t now-playing-install.XXXXXX)"
trap 'rm -rf "$STAGING_DIR"' EXIT

log "Mode: ${MODE}"
log "Repo: ${REPO_URL}"
log "Ref: ${REF}"
log "Install dir: ${INSTALL_DIR}"
log "Install user: ${INSTALL_USER}"

log "Cloning source"
git clone --depth 1 --branch "${REF}" "${REPO_URL}" "${STAGING_DIR}/src" 2>/dev/null || {
  log "Branch/tag clone failed, retrying generic clone + checkout"
  git clone --depth 1 "${REPO_URL}" "${STAGING_DIR}/src"
  (cd "${STAGING_DIR}/src" && git fetch --depth 1 origin "${REF}" && git checkout "${REF}")
}

log "Creating install directory"
${SUDO} mkdir -p "${INSTALL_DIR}"

log "Syncing files"
${SUDO} rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "*.zip" \
  "${STAGING_DIR}/src/" "${INSTALL_DIR}/"

${SUDO} chown -R "${INSTALL_USER}":"${INSTALL_USER}" "${INSTALL_DIR}"

log "Installing dependencies"
if [[ -f "${INSTALL_DIR}/package-lock.json" ]]; then
  npm --prefix "${INSTALL_DIR}" ci
else
  npm --prefix "${INSTALL_DIR}" install
fi

ENV_FILE="${INSTALL_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  log ".env exists; leaving in place"
else
  log "Creating .env template at ${ENV_FILE}"
  cat > "${ENV_FILE}" <<EOF
PORT=${PORT}
WEB_PORT=${WEB_PORT}
TRACK_KEY=
MOODE_BASE_URL=
PUBLIC_TRACK_BASE=
ART_MODE=track
EOF
fi

SERVICE_NAME="${APP_NAME}.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

log "Writing systemd unit: ${SERVICE_PATH}"
cat <<EOF | ${SUDO} tee "${SERVICE_PATH}" >/dev/null
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
User=${INSTALL_USER}

[Install]
WantedBy=multi-user.target
EOF

log "Reloading and starting service"
${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now "${SERVICE_NAME}"

log "Smoke checks"
set +e
curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null && log "OK /healthz" || err "FAIL /healthz"
curl -fsS "http://127.0.0.1:${PORT}/now-playing" >/dev/null && log "OK /now-playing" || err "FAIL /now-playing"
curl -fsS "http://127.0.0.1:${PORT}/art/current.jpg" >/dev/null && log "OK /art/current.jpg" || err "FAIL /art/current.jpg"
set -e

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "${HOST_IP}" ]]; then HOST_IP="<host-ip>"; fi

cat <<EOF

Install complete.

Next steps:
1) Edit ${ENV_FILE} values (especially TRACK_KEY and MOODE_BASE_URL).
2) Restart service after env edits: sudo systemctl restart ${SERVICE_NAME}
3) Check logs: sudo journalctl -u ${SERVICE_NAME} -f
4) Open Config UI in browser:
   - local:  http://127.0.0.1:${WEB_PORT}/config.html
   - LAN:    http://${HOST_IP}:${WEB_PORT}/config.html
5) In Config, run "Check SSH + Paths" and verify green checks.

EOF
