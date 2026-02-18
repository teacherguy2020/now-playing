#!/bin/bash
set -euo pipefail

LOCKFILE="/run/aplmeta-reader.lock"
LOGFILE="/var/log/aplmeta-reader.log"
PIPE="/tmp/shairport-sync-metadata"

log() { echo "$(date '+%F %T') aplmeta-reader: $*" >>"$LOGFILE"; }

# Robust lock that can't get "stuck" unless the process is alive
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "already running; exiting"
  exit 0
fi

log "starting (pid $$)"

while true; do
  while [ ! -p "$PIPE" ]; do
    log "waiting for FIFO $PIPE"
    sleep 1
  done

  log "attaching pipeline"

  # Force line-buffering so output appears immediately in the log
  # and force Python unbuffered regardless of env.
  stdbuf -oL -eL shairport-sync-metadata-reader < "$PIPE" \
    | stdbuf -oL -eL /usr/bin/python3 -u /var/www/util/aplmeta.py 1 \
    >>"$LOGFILE" 2>&1

  rc=$?
  log "pipeline ended rc=$rc; restarting in 1s"
  sleep 1
done
