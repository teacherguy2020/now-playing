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
