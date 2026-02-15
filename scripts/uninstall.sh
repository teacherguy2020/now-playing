#!/usr/bin/env bash
set -euo pipefail

APP_NAME="now-playing"
DEFAULT_INSTALL_DIR="/opt/${APP_NAME}"
SERVICE_NAME="${APP_NAME}.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
WEB_SERVICE_NAME="${APP_NAME}-web.service"
WEB_SERVICE_PATH="/etc/systemd/system/${WEB_SERVICE_NAME}"

INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
PURGE="false"
YES="false"

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --install-dir <path>   Install directory (default: ${DEFAULT_INSTALL_DIR})
  --purge                Also remove install directory and local env/config
  -y, --yes              Skip confirmation prompt
  -h, --help             Show this help
EOF
}

log() { printf "[uninstall] %s\n" "$*"; }
err() { printf "[uninstall][error] %s\n" "$*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="${2:-}"; shift 2 ;;
    --purge)
      PURGE="true"; shift ;;
    -y|--yes)
      YES="true"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      err "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if ! command -v systemctl >/dev/null 2>&1; then
  err "systemctl not found. This uninstall script targets systemd hosts."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1 && [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  err "sudo is required for service removal."
  exit 1
fi

SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  SUDO="sudo"
fi

if [[ "$YES" != "true" ]]; then
  echo
  echo "This will uninstall ${APP_NAME}."
  echo "- service: ${SERVICE_NAME}"
  echo "- service: ${WEB_SERVICE_NAME}"
  echo "- service file: ${SERVICE_PATH}"
  echo "- service file: ${WEB_SERVICE_PATH}"
  if [[ "$PURGE" == "true" ]]; then
    echo "- install dir will be removed: ${INSTALL_DIR}"
  else
    echo "- install dir will be kept: ${INSTALL_DIR}"
  fi
  echo
  read -r -p "Proceed? [y/N] " ans
  case "${ans:-}" in
    y|Y|yes|YES) ;;
    *) log "Cancelled."; exit 0 ;;
  esac
fi

log "Stopping/disabling services (if present)"
for svc in "${SERVICE_NAME}" "${WEB_SERVICE_NAME}"; do
  if ${SUDO} systemctl list-unit-files | grep -q "^${svc}"; then
    ${SUDO} systemctl stop "${svc}" || true
    ${SUDO} systemctl disable "${svc}" || true
  else
    log "Service unit not registered: ${svc}"
  fi
done

for svcPath in "${SERVICE_PATH}" "${WEB_SERVICE_PATH}"; do
  if [[ -f "${svcPath}" ]]; then
    log "Removing service file ${svcPath}"
    ${SUDO} rm -f "${svcPath}"
  fi
done

log "Reloading systemd"
${SUDO} systemctl daemon-reload
${SUDO} systemctl reset-failed || true

if [[ "$PURGE" == "true" ]]; then
  if [[ -d "${INSTALL_DIR}" ]]; then
    log "Purging install directory: ${INSTALL_DIR}"
    ${SUDO} rm -rf "${INSTALL_DIR}"
  else
    log "Install dir not found: ${INSTALL_DIR}"
  fi
else
  log "Keeping install directory (no --purge): ${INSTALL_DIR}"
fi

cat <<EOF

Uninstall complete.

Removed:
- ${SERVICE_NAME}
- ${WEB_SERVICE_NAME}
- ${SERVICE_PATH}
- ${WEB_SERVICE_PATH}

Kept:
- ${INSTALL_DIR} (unless --purge was used)

EOF
