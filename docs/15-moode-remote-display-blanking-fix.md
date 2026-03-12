# 15) moOde remote display blanking fix (wake-on-play)

## Problem
When moOde local display target URL is set to an external page (for example `http://10.0.0.233:8101/display.html?kiosk=1`), screen blanking/wake behavior can break:

- Blanking appears inconsistent or immediately wakes.
- With `wake_display=1`, display can be forced back on repeatedly.

## Root Cause
On moOde Pi4 (`10.0.0.254`), watchdog remote wake logic in:

- `/var/www/daemon/watchdog.sh`

was checking playback via:

- `http://<local_display_host>/command/?cmd=get_output_format`

For host `10.0.0.233:8101`, that endpoint does not exist (`404`), causing false-positive wake decisions.

## Fix Applied (2026-03-02)
Patched `/var/www/daemon/watchdog.sh` remote branch to query:

- `http://<host>:3101/now-playing`

and wake only when:

- `state == "play"`

This preserves wake-on-play while using external target URL control.

## How to apply on a new moOde host

> Use this only when local display target URL points to an external host (`http://<other-host>:8101/...`).

1. Backup watchdog file:

```bash
sudo cp -a /var/www/daemon/watchdog.sh /var/www/daemon/watchdog.sh.bak.$(date +%s)
```

2. Edit watchdog remote-display wake check in:

- `/var/www/daemon/watchdog.sh`

Replace the remote playback probe that calls:

- `http://<host>/command/?cmd=get_output_format`

with a now-playing API probe:

- `http://<host>:3101/now-playing`

and gate wake on JSON playback state:

- wake only if `state == "play"`.

3. Restart the watchdog path (or reboot moOde):

```bash
sudo systemctl restart php8.2-fpm || true
sudo systemctl restart nginx || true
# or simply reboot
```

If your moOde image uses different service names, reboot is the safest universal option.

### Reference logic (shell sketch)

```bash
state=$(curl -fsS "http://$host:3101/now-playing" \
  | python3 -c 'import sys,json; print((json.load(sys.stdin).get("state") or "").strip())' 2>/dev/null || true)
if [ "$state" = "play" ]; then
  # wake display path
fi
```

## Live Environment Details
- moOde host: `moode@10.0.0.254`
- External UI host: `10.0.0.233`
- Display page: `:8101/display.html`
- Playback API: `:3101/now-playing`

## Verification
1. Confirm local display URL:
   - `sqlite3 /var/local/www/db/moode-sqlite3.db "select value from cfg_system where param='local_display_url';"`
2. Confirm patched line exists:
   - `grep -n "now-playing" /var/www/daemon/watchdog.sh`
3. Confirm behavior:
   - With `wake_display=1`, screen wakes on active play state and no longer false-wakes from 8101 `/command/` 404s.

## Rollback
Restore backup copy (created before patch) from `/var/www/daemon/watchdog.sh.bak.*` and restart watchdog.
