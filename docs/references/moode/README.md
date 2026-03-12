# moOde watchdog reference files

These files are sourced from the moOde project runtime on a live system and are provided as version-specific references for the remote-display wake/blanking fix.

## Files

- `watchdog.sh.upstream-20260302.example`
  - Baseline backup copy from `/var/www/daemon/watchdog.sh.bak.20260302-190700`
- `watchdog.sh.patched.example`
  - Patched live copy from `/var/www/daemon/watchdog.sh`
- `watchdog-remote-display.patch`
  - Unified diff between the above two files

## License / credit

- Origin: moOde audio player project (`/var/www/daemon/watchdog.sh`)
- Copyright: The moOde audio player project / Tim Curtis
- License: **GPL-3.0-or-later**

These reference files remain under their upstream GPL terms.
Do not relicense them under this repository's root Unlicense.

## Usage guidance

Prefer applying the patch/diff to a matching moOde version rather than blindly replacing `watchdog.sh`.
moOde updates can change watchdog internals across releases.
