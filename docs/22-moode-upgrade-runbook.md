# moOde Upgrade Runbook for Now Playing

This is the post-upgrade checklist for an installation where moOde drives a
Now-Playing display and uses Now-Playing for playback metadata, ratings, or
AirPlay integration. moOde upgrades can replace files under `/var/www`, reset
database content, and regenerate the local-display launch command.

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

### 3. Reapply the external-display watchdog patch

The stock r1034 watchdog probes moOde’s `/command/` endpoint on the target
host. Now-Playing does not provide that endpoint, so the probe returns 404 and
can falsely wake the display while paused or stopped.

Apply the version-appropriate patch from:

- [`docs/references/moode/watchdog-remote-display.patch`](./references/moode/watchdog-remote-display.patch)
- [`docs/15-moode-remote-display-blanking-fix.md`](./15-moode-remote-display-blanking-fix.md)

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

### 4. Refresh the local display target

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

### 5. Reapply AirPlay and Peppy customizations

Check the host-side overrides that the upgrade may have replaced:

```bash
systemctl is-active airplay-json.service
systemctl is-active airplay-json-watchdog.timer
grep -n 'target.url' /etc/peppymeter/config.txt /etc/peppyspectrum/config.txt
```

Restore the hardened AirPlay metadata wrapper/watchdog and Peppy HTTP targets
from the matching repository references when absent. Confirm AirPlay starts,
metadata remains stable, and CPU does not run away before declaring success.

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
