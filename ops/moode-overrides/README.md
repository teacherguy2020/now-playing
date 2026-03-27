# moOde local overrides (tracked)

These files are live-system overrides on `moode@10.0.0.254` and are mirrored here for versioning/recovery.

## Files mirrored

- `etc/systemd/system/airplay-json.service`
- `var/www/daemon/aplmeta-reader.sh`
- `usr/local/bin/airplay-json-watchdog.sh`
- `etc/systemd/system/airplay-json-watchdog.service`
- `etc/systemd/system/airplay-json-watchdog.timer`

## Why

- Keep AirPlay metadata pipeline stable (single instance + restart loop).
- Auto-heal high CPU runaway in `shairport-sync-metadata-reader`.
- Ensure local moOde edits are not lost and are auditable in git.

## Current behavior

- `airplay-json.service` runs `/var/www/daemon/aplmeta-reader.sh`.
- `airplay-json-watchdog.timer` runs every 30s.
- Watchdog restarts `airplay-json.service` after sustained metadata-reader CPU > 40%.

## Deploy from repo to moOde

```bash
scp ops/moode-overrides/etc/systemd/system/airplay-json.service moode@10.0.0.254:/tmp/
scp ops/moode-overrides/etc/systemd/system/airplay-json-watchdog.service moode@10.0.0.254:/tmp/
scp ops/moode-overrides/etc/systemd/system/airplay-json-watchdog.timer moode@10.0.0.254:/tmp/
scp ops/moode-overrides/usr/local/bin/airplay-json-watchdog.sh moode@10.0.0.254:/tmp/
scp ops/moode-overrides/var/www/daemon/aplmeta-reader.sh moode@10.0.0.254:/tmp/

ssh moode@10.0.0.254 '
  sudo install -m 644 /tmp/airplay-json.service /etc/systemd/system/airplay-json.service &&
  sudo install -m 644 /tmp/airplay-json-watchdog.service /etc/systemd/system/airplay-json-watchdog.service &&
  sudo install -m 644 /tmp/airplay-json-watchdog.timer /etc/systemd/system/airplay-json-watchdog.timer &&
  sudo install -m 755 /tmp/airplay-json-watchdog.sh /usr/local/bin/airplay-json-watchdog.sh &&
  sudo install -m 755 /tmp/aplmeta-reader.sh /var/www/daemon/aplmeta-reader.sh &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now airplay-json-watchdog.timer &&
  sudo systemctl restart airplay-json.service
'
```
