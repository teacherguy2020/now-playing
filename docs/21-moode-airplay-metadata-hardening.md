# moOde AirPlay Metadata Hardening

This chapter documents local moOde-side hardening for AirPlay metadata stability.

## Problem observed

`shairport-sync-metadata-reader` could peg CPU and make moOde sluggish, affecting responsiveness and playback control.

## What changed

1. `airplay-json.service` now uses the hardened wrapper:
   - `/var/www/daemon/aplmeta-reader.sh`
2. Metadata watchdog added:
   - `/usr/local/bin/airplay-json-watchdog.sh`
   - `/etc/systemd/system/airplay-json-watchdog.service`
   - `/etc/systemd/system/airplay-json-watchdog.timer`

## Watchdog behavior

- Timer interval: every 30 seconds
- Checks CPU for `shairport-sync-metadata-reader`
- If sustained high CPU (>40% for multiple intervals), watchdog restarts `airplay-json.service`

## Verification

```bash
systemctl is-active airplay-json.service
systemctl is-active airplay-json-watchdog.timer
journalctl -u airplay-json-watchdog.service -n 20 --no-pager
tail -n 50 /tmp/airplay-json-watchdog.log
```

## Source-of-truth in repo

Mirrored override files are tracked at:

- `ops/moode-overrides/`

Use those files as restore/deploy source for moOde local overrides.
