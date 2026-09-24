# moOde Upgrade Runbook for Now Playing

This is the post-upgrade checklist for an installation where moOde drives a
Now-Playing display and uses Now-Playing for playback metadata, ratings, or
AirPlay integration. moOde upgrades can replace files under `/var/www`, reset
database content, and regenerate the local-display launch command.

For the failure chain behind the display, worker, AirPlay, and Peppy symptoms,
read the consolidated [`moOde upgrade failure chain and recovery map`](25-moode-upgrade-failure-chain.md)
alongside this checklist.

## Before upgrading

Create and verify all of these recovery layers:

1. **Full SD-card image** — preferred rollback path; verify it on another
   system before upgrading.
2. **moOde native backup ZIP** — keep the backup outside the moOde card.
3. **Sticker/rating SQL backup** — moOde may wipe the sticker database during
   an upgrade. Copy the SQL export to another system and record its checksum.
4. **Override inventory** — record current copies and checksums of:
   - `/var/www/daemon/watchdog.sh`
   - `/var/www/daemon/worker.php`
   - `/var/www/daemon/aplmeta-reader.sh` (if present)
   - `/etc/systemd/system/airplay-json-watchdog.*` (if present)
   - `/home/moode/.xinitrc`
   - Peppy configuration files under `/etc/peppymeter/` and
     `/etc/peppyspectrum/`

Do not rely on the native moOde backup alone for sticker ratings or custom
host files.

## Immediately after upgrading

### 1. Confirm the moOde version and database state

```bash
cat /etc/os-release
sqlite3 /var/local/www/db/moode-sqlite3.db \
  "select param,value from cfg_system where param in ('local_display','local_display_url','wake_display','scn_blank');"
```

For moOde r1034 and later, the Target URL must be portless:

```text
http://<NOW_PLAYING_HOST>/display.html?kiosk=1
```

Do not use `:8101` in moOde’s Target URL field. The LAN proxy serves the
display route on HTTP port 80.

### 2. Restore sticker ratings

Use the Now-Playing Config ratings controls when available:

1. Open Config → Ratings.
2. Check the sticker database status.
3. Select the verified pre-upgrade backup.
4. Restore it and confirm that the rating count returns.

If the UI restore path is unavailable, identify the sticker database location
for that exact moOde release before restoring. Verify the resulting row count
and a sample rating; do not overwrite an unknown live database blindly.

### 3. Restore generalized attached-display blanking

The moOde worker's stock screen-blank loop is gated only by
`peppy_display=1`. That means a local WebUI/Player or Now-Playing/Kiosk
display can remain on indefinitely when the player is paused, even though
the configured blank timeout is set. Extend the worker so the blanking loop
runs when either `local_display` or `peppy_display` is enabled.

The blanking decision must use the authoritative playback source:

- local Player/Peppy: MPD `state=play` means active playback;
- external Now-Playing/Kiosk: query `/now-playing` on port `3101`;
- `state=play`, `isAirplay=true`, or `isUpnp=true` means active playback;
- paused/stopped means the attached display may blank.

Back up `/var/www/daemon/worker.php` before applying the version-appropriate
change. Validate and restart the worker after patching:

```bash
sudo cp -a /var/www/daemon/worker.php \
  /var/www/daemon/worker.php.bak.general-display.$(date +%Y%m%d-%H%M%S)
sudo php -l /var/www/daemon/worker.php
sudo kill "$(cat /run/worker.pid)" 2>/dev/null || true
sudo rm -f /run/worker.pid
sudo /usr/bin/php /var/www/daemon/worker.php
```

The worker daemonizes itself. Confirm that `/run/worker.pid` contains a live
worker PID and that `php -l` reports no syntax errors. Do not enable the
Peppy-specific branch merely to obtain blanking for Player or Kiosk.

### 4. Reapply the external-display watchdog patch

The stock r1034 watchdog probes moOde’s `/command/` endpoint on the target
host. Now-Playing does not provide that endpoint, so the probe returns 404 and
can falsely wake the display while paused or stopped.

Apply the version-appropriate patch from:

- [`docs/references/moode/watchdog-remote-display.patch`](../references/moode/watchdog-remote-display.patch)
- [`docs/runbooks/15-moode-remote-display-blanking-fix.md`](./15-moode-remote-display-blanking-fix.md)

The resulting remote branch must query:

```text
http://<NOW_PLAYING_HOST>:3101/now-playing
```

and wake when JSON `state` is `play`, `isAirplay` is `true`, or `isUpnp` is
`true`. AirPlay and UPnP can own the audio path directly, so MPD may report
`stop` while audio is playing. Back up the new moOde file first;
do not blindly replace the entire watchdog because upstream releases change
surrounding logic.

Then validate and reload it:

```bash
sudo bash -n /var/www/daemon/watchdog.sh
sudo killall -s 9 watchdog.sh || true
sudo bash -c '/var/www/daemon/watchdog.sh 3 >/dev/null 2>&1 &'
```

### 5. Refresh the local display target

The moOde database and Chromium launch command can temporarily disagree after
changing Target URL. Confirm both:

```bash
sqlite3 /var/local/www/db/moode-sqlite3.db \
  "select value from cfg_system where param='local_display_url';"
grep -- '--app=' /home/moode/.xinitrc
```

If `.xinitrc` still contains the old `:8101` target, update it through the
moOde Target URL setting or the version-appropriate worker job, then restart
only the local display:

```bash
sudo systemctl restart localdisplay
```

A full reboot is not normally required.

### 6. Reapply AirPlay and Peppy customizations

Check the host-side overrides that the upgrade may have replaced:

```bash
systemctl is-active airplay-json.service
systemctl is-active airplay-json-watchdog.timer
grep -n 'target.url' /etc/peppymeter/config.txt /etc/peppyspectrum/config.txt
```

Restore the hardened AirPlay metadata wrapper/watchdog and Peppy HTTP targets
from the matching repository references when absent. Confirm AirPlay starts,
metadata remains stable, and CPU does not run away before declaring success.

The current Peppy restoration is automated by
`nowplaying-peppy-targets.service`; the current worker/AirPlay process
supervision is automated by `moode-worker-watchdog.timer`. Verify both units,
then follow the consolidated runbook's fresh-data checks rather than relying
only on `systemctl is-active`.

## Functional verification

Test each state, allowing the configured screen-blank interval to elapse:

- Start local playback: display wakes and LED indicates playing.
- Pause playback: Now-Playing reports `pause`; display eventually sleeps and
  watchdog does not wake it repeatedly.
- Stop playback: Now-Playing reports `stop`; display sleeps and the physical
  LED shows the stopped/idle indication.
- Resume playback: display wakes again.
- Start AirPlay: metadata, artwork, and playback controls remain healthy.
- Reopen the Target URL setting and confirm it remains portless.

Useful checks:

```bash
curl -fsS http://<NOW_PLAYING_HOST>/now-playing
curl -fsSI http://<NOW_PLAYING_HOST>/display.html?kiosk=1
```

## Rollback

If the upgrade cannot be made healthy:

1. Stop testing and preserve current logs/config for diagnosis.
2. Restore the verified SD-card image.
3. Confirm sticker ratings and Now-Playing behavior from the restored image.
4. Keep the native ZIP, SQL export, override inventory, and upgrade notes
   together for the next attempt.

## Installation-specific lesson from r1034

The application host can remain unchanged while moOde-side behavior breaks.
For this installation, the essential post-upgrade actions were restoring the
external-display watchdog logic, using the portless Target URL, refreshing
Chromium/localdisplay, and verifying sticker ratings and AirPlay overrides.
