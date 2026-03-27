# Deploy / PM2 / Rollback

## Runtime ownership (important)
Use one launch owner only (PM2 **or** systemd user service). Do not mix ad-hoc `nohup` with service managers.

## Durable config path hardening
For service launches, pin both:
- `WorkingDirectory=/opt/now-playing`
- `NOW_PLAYING_CONFIG_PATH=/opt/now-playing/config/now-playing.config.json`

This prevents accidental fallback to `/home/<user>/config/now-playing.config.json` when cwd drifts.

## Typical services
- `api`
- `webserver`

## Common commands (PM2)
```bash
pm2 restart api webserver
pm2 save
pm2 logs api --lines 100
pm2 logs webserver --lines 100
```

## Common commands (systemd --user)
```bash
systemctl --user daemon-reload
systemctl --user restart now-playing.service
systemctl --user status now-playing.service --no-pager
journalctl --user -u now-playing.service -n 100 --no-pager
```

## Rollback pattern
- checkout previous commit
- restart managed services
- verify `/config/runtime` and UI load
