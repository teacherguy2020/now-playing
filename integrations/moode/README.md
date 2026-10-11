# moOde AirPlay Metadata Integration (Manual / Opt-In)

This directory contains **optional host-level overrides** for moOde AirPlay metadata handling.

## Important

- These files are **NOT auto-installed** by `now-playing-next`.
- App install/update should **never** silently modify a user's moOde host.
- Use these only when a user explicitly wants enhanced AirPlay metadata stability.

For Brian's current installation, the durable service definitions are mirrored
under [`ops/moode-overrides/`](../../ops/moode-overrides/). The live contract is
one root-owned `airplay-json.service` reader, the
`/tmp/shairport-sync-metadata` FIFO, and the 30-second
`airplay-json-watchdog.timer`. Do not use a second `aplmeta-reader.service`.

The checks in this document are read-only. They do not edit
`/etc/shairport-sync.conf`, restart Shairport Sync, or create another reader.

---

## Why these exist

Some moOde/shairport combinations can show issues like:

- stale or missing AirPlay metadata,
- delayed cover-art refresh,
- **stale artwork carryover** (previous source art reused when new source sends no art),
- inconsistent parser behavior across sender apps (Apple Music, Spotify, YouTube/Safari, etc.).

These overrides provide a more deterministic metadata pipeline.

### Key behavior improvement

When a new AirPlay source/track does **not** provide fresh cover art, this integration intentionally falls back to default/neutral art instead of reusing stale art from the previous source.

---

## Files

- `aplmeta.py`
  - Enhanced AirPlay metadata parser/normalizer.
- `aplmeta-reader.sh`
  - FIFO reader/supervisor for shairport metadata stream.
- `health-check.sh`
  - Non-destructive post-upgrade check for reader ownership, FIFO presence,
    fresh `aplmeta.txt`, and the matching Sonuvi `/now-playing` response.
- `shairport-sync.conf.template`
  - Reference metadata configuration only; it is not part of the health check
    and must not be applied as an audio-configuration change without explicit
    review.
- `install.sh`
  - Optional helper to apply all overrides manually (with backups).
- `revert.sh`
  - Optional helper to restore backups created by `install.sh`.

---

## Runtime target paths on moOde

- `/var/www/util/aplmeta.py`
- `/var/www/daemon/aplmeta-reader.sh`
- `/etc/shairport-sync.conf`

The metadata path is:

```text
Shairport metadata FIFO
  /tmp/shairport-sync-metadata
        │
        ▼
airplay-json.service
  /var/www/daemon/aplmeta-reader.sh
        │
        ├─ exactly one shairport-sync-metadata-reader process
        └─ /var/www/util/aplmeta.py
              │
              ├─ /var/local/www/aplmeta.txt
              └─ /var/local/www/imagesw/airplay-covers/
```

`airplay-json-watchdog.timer` runs
`/usr/local/bin/airplay-json-watchdog.sh` every 30 seconds and only repairs
the metadata reader when its CPU runaway threshold is sustained. It does not
own or alter Shairport's audio configuration.

---

## Legacy manual install (explicit host mutation)

The current Brian installation uses the tracked `ops/moode-overrides/` service
pair and the read-only health check below. Use this installer only when a
different moOde host explicitly needs the optional integration and the
operator has reviewed its host mutations.

From this directory on your admin machine:

```bash
cd integrations/moode
./install.sh moode@<moode-host>
```

The legacy `install.sh` path also writes `/etc/shairport-sync.conf` and asks
moOde to restart its AirPlay renderer. That is an explicit host mutation, not
the post-upgrade health check, and is not the recovery path for Brian's
current installation. Follow [`26-moode-airplay-metadata-recovery.md`](../../docs/runbooks/26-moode-airplay-metadata-recovery.md)
when a repair is actually required. Do not restart Shairport merely to run
the check, and do not enable a second reader unit.

---

## Manual revert

```bash
cd integrations/moode
./revert.sh moode@<moode-host>
```

---

## Validation checks

Run this while a newly played AirPlay track is active:

```bash
./health-check.sh moode-pi http://sonuvi.local:3101
```

Use the configured SSH host and Sonuvi API URL when those names differ. The
script is read-only and fails unless all of these are true:

- `airplay-json.service` and `airplay-json-watchdog.timer` are active;
- `aplmeta-reader.service` is not active;
- exactly one `shairport-sync-metadata-reader` process exists;
- `/tmp/shairport-sync-metadata` is a named pipe;
- `/var/local/www/aplmeta.txt` is newer than the configured freshness window;
- Sonuvi reports `isAirplay: true`, `state: play`, matching title/artist/album,
  and an AirPlay artwork URL.

It exits non-zero on a stale record, missing FIFO, duplicate reader, or
Sonuvi mismatch. It never enables, stops, restarts, or edits a service.

For lower-level read-only inspection:

```bash
systemctl is-active airplay-json.service airplay-json-watchdog.timer
systemctl is-active aplmeta-reader.service 2>/dev/null || true
test -p /tmp/shairport-sync-metadata
pgrep -a -x shairport-sync-metadata-reader
cat /var/local/www/aplmeta.txt
tail -n 80 /tmp/aplmeta-reader.log
```

The metadata timestamp must be from the current AirPlay session. A reachable
`aplmeta.txt` with an old timestamp is not success.

---

## Philosophy

Keep `now-playing-next` app behavior and moOde host overrides separate:

- **App install/update:** safe, no host mutation.
- **Host overrides:** explicit, manual, auditable, reversible.
