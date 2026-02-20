#!/usr/bin/env bash
set -euo pipefail

# Safe deploy for pi4 that preserves runtime/user state on target.
# Usage:
#   scripts/deploy-pi4-safe.sh [server-alias] [target-dir]
# Defaults:
#   server-alias: server-pi
#   target-dir:   /home/brianwis/apps/now-playing-next

SERVER="${1:-server-pi}"
TARGET_DIR="${2:-/home/brianwis/apps/now-playing-next}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

rsync -av --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'config/now-playing.config.json' \
  --exclude 'data/***' \
  --exclude 'var/***' \
  --exclude '.env' \
  --exclude '*.log' \
  "$ROOT_DIR/" "$SERVER:$TARGET_DIR/"

echo "Safe deploy complete -> $SERVER:$TARGET_DIR"
