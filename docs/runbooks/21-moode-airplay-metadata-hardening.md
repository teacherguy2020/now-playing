# moOde AirPlay Metadata Hardening

This chapter documents the local moOde-side AirPlay metadata pipeline and its
CPU hardening. It is the integration reference for the tracked overrides; the
post-upgrade procedure is in [`22-moode-upgrade-runbook.md`](22-moode-upgrade-runbook.md)
and the failure-specific recovery is in
[`26-moode-airplay-metadata-recovery.md`](26-moode-airplay-metadata-recovery.md).

## Pipeline contract

Shairport owns AirPlay audio. Its metadata emission is consumed separately:

```text
Shairport metadata FIFO
  /tmp/shairport-sync-metadata
        │
        ▼
airplay-json.service
  /var/www/daemon/aplmeta-reader.sh
        │
        ├─ one shairport-sync-metadata-reader process
        └─ /var/www/util/aplmeta.py
              │
              ├─ /var/local/www/aplmeta.txt
              └─ /var/local/www/imagesw/airplay-covers/
```

The required ownership is:

- `airplay-json.service` — the single root-owned reader wrapper;
- `/var/www/daemon/aplmeta-reader.sh` — waits for and reads the FIFO;
- `/tmp/shairport-sync-metadata` — the named pipe produced by Shairport;
- `/usr/local/bin/airplay-json-watchdog.sh` and its service/timer — supervises
  reader CPU behavior;
- `aplmeta-reader.service` — must be absent or inactive; it is the known
  duplicate-reader failure mode.

Do not add another reader for testing or repair. Do not change Shairport's
audio configuration or restart Shairport just to validate this path.

## Problem observed

After the September 2026 moOde upgrade, `aplmeta.txt` stopped changing even
though Shairport audio and its AirPlay session were healthy. The tracked
reader/watchdog pair was disabled while an untracked reader waited for a FIFO
that did not exist. This was service drift, not an audio failure.

The separate symptom that `shairport-sync-metadata-reader` could peg CPU and
make moOde sluggish remains the reason for the watchdog hardening.

## What changed

1. `airplay-json.service` uses the hardened wrapper:
   - `/var/www/daemon/aplmeta-reader.sh`
2. The wrapper waits for `/tmp/shairport-sync-metadata`, then runs exactly one
   `shairport-sync-metadata-reader | aplmeta.py` pipeline.
3. The metadata watchdog is tracked at:
   - `/usr/local/bin/airplay-json-watchdog.sh`
   - `/etc/systemd/system/airplay-json-watchdog.service`
   - `/etc/systemd/system/airplay-json-watchdog.timer`
4. Sonuvi rejects `aplmeta.txt` older than the current AirPlay session, so a
   failed moOde metadata path cannot masquerade as the current track.

## Watchdog behavior

- Timer interval: every 30 seconds.
- Checks CPU for `shairport-sync-metadata-reader`.
- If sustained high CPU (>40% for multiple intervals), restarts only
  `airplay-json.service`.
- Does not restart Shairport or alter its audio configuration.

## Non-destructive health check

Run this from the repository/admin machine while a newly played AirPlay track
is active:

```bash
./integrations/moode/health-check.sh moode-pi http://sonuvi.local:3101
```

Use the configured SSH host and Sonuvi API URL when those names differ. The
check exits non-zero unless all of these are true:

- `airplay-json.service` and `airplay-json-watchdog.timer` are active;
- `aplmeta-reader.service` is not active;
- exactly one `shairport-sync-metadata-reader` process is active;
- `/tmp/shairport-sync-metadata` is a named pipe;
- `/var/local/www/aplmeta.txt` is within the freshness window;
- Sonuvi `/now-playing` reports AirPlay playing state and matching fresh
  title/artist/album plus an artwork URL.

The helper is read-only: it uses service-status/process/file/stat/curl reads
only. It never enables, disables, stops, restarts, or edits a service or
configuration file.

For watchdog-specific diagnostics, use:

```bash
systemctl is-active airplay-json.service
systemctl is-active airplay-json-watchdog.timer
journalctl -u airplay-json-watchdog.service -n 20 --no-pager
tail -n 50 /tmp/airplay-json-watchdog.log
```

## Source-of-truth in repo

Mirrored live override files are tracked at:

- `ops/moode-overrides/`
- `integrations/moode/` for the opt-in integration assets and read-only check

Use those files as restore/deploy source for moOde local overrides, but verify
live host state with the health check after an upgrade. A reachable
`aplmeta.txt` with an old timestamp is not success.
