# moOde AirPlay Metadata Integration (Manual / Opt-In)

This directory contains **optional host-level overrides** for moOde AirPlay metadata handling.

## Important

- These files are **NOT auto-installed** by `now-playing-next`.
- App install/update should **never** silently modify a user's moOde host.
- Use these only when a user explicitly wants enhanced AirPlay metadata stability.

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
- `shairport-sync.conf.template`
  - Reference config tuned for this metadata pipeline.
- `install.sh`
  - Optional helper to apply all overrides manually (with backups).
- `revert.sh`
  - Optional helper to restore backups created by `install.sh`.

---

## Runtime target paths on moOde

- `/var/www/util/aplmeta.py`
- `/var/www/daemon/aplmeta-reader.sh`
- `/etc/shairport-sync.conf`

---

## Manual install (recommended flow)

From this directory on your admin machine:

```bash
cd integrations/moode
./install.sh moode@<moode-host>
```

Then restart relevant services on moOde (as needed):

```bash
sudo systemctl restart airplay-json
# and/or
sudo systemctl restart shairport-sync
```

> Note: on many moOde images, AirPlay lifecycle is moOde-managed (not plain `shairport-sync.service`).
> Avoid running duplicate AirPlay launch paths in parallel.

---

## Manual revert

```bash
cd integrations/moode
./revert.sh moode@<moode-host>
```

---

## Validation checks

```bash
pgrep -fa 'shairport-sync -a Moode AirPlay|aplmeta-reader.sh|shairport-sync-metadata-reader|/var/www/util/aplmeta.py'
cat /var/local/www/aplmeta.txt
tail -n 80 /var/log/aplmeta-reader.log
```

---

## Philosophy

Keep `now-playing-next` app behavior and moOde host overrides separate:

- **App install/update:** safe, no host mutation.
- **Host overrides:** explicit, manual, auditable, reversible.
