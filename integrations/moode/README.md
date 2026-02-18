# moOde AirPlay Metadata Integration

This folder captures **host-level integration overrides** used to improve AirPlay metadata handling for `now-playing-next`.

These are **not** app runtime files. They are deployment artifacts for a moOde host.

## Files

- `aplmeta.py`
  - Custom AirPlay metadata parser/normalizer used by moOde pipeline.
- `aplmeta-reader.sh`
  - Metadata pipe reader supervisor (FIFO attach, lock, restart loop, logging).
- `shairport-sync.conf.template`
  - Reference shairport-sync config used with this metadata pipeline.

## Why keep these in repo

- Reproducible host behavior across reinstalls/SD card swaps
- Explicit documentation of non-stock moOde behavior
- Easier audit/review before sending findings upstream

## Apply on moOde host

> Host paths currently used:
>
> - `/var/www/util/aplmeta.py`
> - `/var/www/daemon/aplmeta-reader.sh`
> - `/etc/shairport-sync.conf`

Use `install.sh` in this directory.

## Revert on moOde host

Use `revert.sh` in this directory to restore backups made by `install.sh`.

## Notes

- Prefer a single owner for AirPlay lifecycle (moOde worker path).
- Avoid running parallel system units that duplicate AirPlay/metadata pipeline startup.
- Validate with:
  - `pgrep -fa 'shairport-sync -a Moode AirPlay|aplmeta-reader.sh|shairport-sync-metadata-reader|/var/www/util/aplmeta.py'`
  - `tail -n 80 /var/log/aplmeta-reader.log`
  - `cat /var/local/www/aplmeta.txt`
