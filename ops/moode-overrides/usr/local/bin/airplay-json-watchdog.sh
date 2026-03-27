#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="/tmp/airplay-json-watchdog.state"
LOG_FILE="/tmp/airplay-json-watchdog.log"
THRESHOLD="40"
HITS_REQUIRED="2"

cpu_sum=$( (ps -C shairport-sync-metadata-reader -o %cpu= 2>/dev/null || true) | awk '{s+=$1} END{if(NR==0)print 0; else print int(s+0.5)}')
hits=0
if [[ -f "$STATE_FILE" ]]; then
  hits=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
fi

if (( cpu_sum > THRESHOLD )); then
  hits=$((hits+1))
else
  hits=0
fi

echo "$hits" > "$STATE_FILE"

ts=$(date '+%F %T')
echo "$ts cpu=${cpu_sum}% hits=${hits}" >> "$LOG_FILE"

if (( hits >= HITS_REQUIRED )); then
  echo "$ts high cpu detected; restarting airplay-json.service" >> "$LOG_FILE"
  systemctl restart airplay-json.service || true
  echo 0 > "$STATE_FILE"
fi
