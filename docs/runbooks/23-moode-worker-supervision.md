# moOde worker supervision

## Problem

moOde's `/var/www/daemon/worker.php` owns the attached-display blanking loop.
For an external Now Playing Target URL, that loop is also where the
authoritative `:3101/now-playing` state is evaluated. If the worker dies, the
display remains awake indefinitely even though the Target URL and the
worker-side TargetURL workaround are correct.

The stock worker daemonizes itself and holds an exclusive flock on
`/run/worker.pid`. Its `sudo`-launched helper daemons can inherit that lock.
After an unclean worker exit, a manual worker launch may therefore report
`Already running` even when the PID in `/run/worker.pid` no longer exists.

The same recovery timer also checks the enabled AirPlay receiver. On this
system the receiver is `shairport-sync.service`; a systemd unit can remain
loaded while the process has disappeared, so both the unit state and the
actual process are checked.

## Tracked recovery override

This repository mirrors three moOde-side files:

- `/usr/local/bin/moode-worker-watchdog.sh`
- `/etc/systemd/system/moode-worker-watchdog.service`
- `/etc/systemd/system/moode-worker-watchdog.timer`

The timer runs every 30 seconds. The script:

1. checks the enabled AirPlay receiver and asks moOde's
   `restart-renderer.php --airplay` path to recover it if needed;
2. validates the PID file against the actual `/var/www/daemon/worker.php`
   process;
3. stops only `peppy-gain.php`, `mountmon.php`, and `mpdmon.php` when the
   worker is missing, releasing inherited worker locks;
4. waits for the lock to become available; and
5. launches the stock moOde worker and verifies its new PID.

It does not replace moOde's worker or watchdog logic, and it does not alter
the external Target URL workaround.

## Install or restore

Install the tracked files from the repository's `ops/moode-overrides/` tree,
then enable the timer:

```bash
sudo install -m 755 ops/moode-overrides/usr/local/bin/moode-worker-watchdog.sh \
  /usr/local/bin/moode-worker-watchdog.sh
sudo install -m 644 ops/moode-overrides/etc/systemd/system/moode-worker-watchdog.service \
  /etc/systemd/system/moode-worker-watchdog.service
sudo install -m 644 ops/moode-overrides/etc/systemd/system/moode-worker-watchdog.timer \
  /etc/systemd/system/moode-worker-watchdog.timer
sudo systemctl daemon-reload
sudo systemctl enable --now moode-worker-watchdog.timer
```

## Verification

```bash
systemctl is-active moode-worker-watchdog.timer
systemctl list-timers moode-worker-watchdog.timer
systemctl start moode-worker-watchdog.service
journalctl -u moode-worker-watchdog.service -n 30 --no-pager
cat /run/worker.pid
ps -p "$(cat /run/worker.pid)" -o pid,lstart,args
```

When the worker is healthy, the oneshot exits quietly. During recovery, the
journal records the missing PID, helper cleanup, and recovered worker PID.

## Upgrade note

moOde upgrades can replace files under `/var/www`, including the TargetURL
patches in `worker.php` and `watchdog.sh`. Reapply the version-appropriate
display workaround from
[`15-moode-remote-display-blanking-fix.md`](15-moode-remote-display-blanking-fix.md)
after an upgrade. The systemd override lives outside `/var/www` and should
survive the upgrade, but verify the timer afterward.
