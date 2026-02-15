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

wait_for_url() {
  local url="$1"
  local label="$2"
  local tries="${3:-20}"
  local sleep_s="${4:-1}"
  local i
  for ((i=1; i<=tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "OK ${label}"
      return 0
    fi
    sleep "$sleep_s"
  done
  err "FAIL ${label}"
  return 1
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
ART_CACHE_DIR=${INSTALL_DIR}/var/art-cache
TRACK_CACHE_DIR=${INSTALL_DIR}/var/track-cache
PODCAST_DL_LOG=${INSTALL_DIR}/var/podcasts/downloads.ndjson
EOF
fi

log "Ensuring writable runtime cache directories"
${SUDO} mkdir -p "${INSTALL_DIR}/var/art-cache" "${INSTALL_DIR}/var/track-cache" "${INSTALL_DIR}/var/podcasts"
${SUDO} chown -R "${INSTALL_USER}":"${INSTALL_USER}" "${INSTALL_DIR}/var"

SERVICE_NAME="${APP_NAME}.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
WEB_SERVICE_NAME="${APP_NAME}-web.service"
WEB_SERVICE_PATH="/etc/systemd/system/${WEB_SERVICE_NAME}"

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

log "Writing systemd unit: ${WEB_SERVICE_PATH}"
cat <<EOF | ${SUDO} tee "${WEB_SERVICE_PATH}" >/dev/null
[Unit]
Description=Now Playing Web UI
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/env python3 -m http.server ${WEB_PORT}
Restart=always
RestartSec=2
User=${INSTALL_USER}

[Install]
WantedBy=multi-user.target
EOF

SYSTEMCTL_BIN="$(command -v systemctl || echo /bin/systemctl)"
SUDOERS_PATH="/etc/sudoers.d/${APP_NAME}-restart"
log "Writing sudoers rule for service restarts: ${SUDOERS_PATH}"
cat <<EOF | ${SUDO} tee "${SUDOERS_PATH}" >/dev/null
${INSTALL_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} restart ${SERVICE_NAME}, ${SYSTEMCTL_BIN} restart ${WEB_SERVICE_NAME}, ${SYSTEMCTL_BIN} restart ${SERVICE_NAME} ${WEB_SERVICE_NAME}
EOF
${SUDO} chmod 440 "${SUDOERS_PATH}"

log "Reloading and starting services"
${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now "${SERVICE_NAME}"
${SUDO} systemctl enable --now "${WEB_SERVICE_NAME}"

log "Smoke checks"
set +e
wait_for_url "http://127.0.0.1:${PORT}/now-playing" "/now-playing"
wait_for_url "http://127.0.0.1:${PORT}/art/current.jpg" "/art/current.jpg"
wait_for_url "http://127.0.0.1:${WEB_PORT}/config.html" "web /config.html"
set -e

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "${HOST_IP}" ]]; then HOST_IP="<host-ip>"; fi

cat <<EOF

Install complete.

Next steps:
1) Open Config UI in browser:
   - local:  http://127.0.0.1:${WEB_PORT}/config.html
   - LAN:    http://${HOST_IP}:${WEB_PORT}/config.html
2) In Config, run "Check SSH + Paths" and verify green checks.
3) If SSH checks fail, create key-based access from this host to moOde:
   ssh-keygen -t ed25519 -C "now-playing-api"
   ssh-copy-id moode@<moode-ip>
   ssh moode@<moode-ip> 'echo SSH_OK'
4) Advanced/optional: edit ${ENV_FILE} only if you need manual overrides.
5) Service logs:
   sudo journalctl -u ${SERVICE_NAME} -f
   sudo journalctl -u ${WEB_SERVICE_NAME} -f

(After manual env edits, restart with: sudo systemctl restart ${SERVICE_NAME} ${WEB_SERVICE_NAME})

EOF
