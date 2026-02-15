# Master Config (Now Playing)

Use a single config file for user-specific setup.

## Files

- `config/now-playing.config.example.json` → template
- `config/now-playing.config.json` → real local config (create from template)

## Quick start

```bash
cp config/now-playing.config.example.json config/now-playing.config.json
# edit config/now-playing.config.json
```

## Current defaults

- API port: `3101`
- Web/UI port: `8101`
- Timezone default: `America/Chicago` (override per install)

## Key sections

1. `nodes`
   - Host/IP inventory and role hints (`api`, `display`, `both`)
2. `ports`
   - `ports.api`, `ports.ui`
3. `mpd` + `moode`
   - MPD host/port and SSH/base URL values for moOde integration
4. `paths`
   - `musicLibraryRoot`, `moodeUsbMount`, `piMountBase`, `podcastRoot`
5. `alexa`
   - `enabled`, `publicDomain`, `skillId`, `webhookPath`
6. `features`
   - per-install feature flags (`podcasts`, `ratings`, `radio`)
7. `notifications`
   - track-notify/pushover settings

## Runtime overrides

- `NOW_PLAYING_CONFIG_PATH` can point to a non-default config file.
- Environment variables still override some settings (used heavily for hosted/Lambda contexts).

## Safety notes

- Do not commit secrets in config.
- Keep keys/tokens in environment variables or private config files.
- After config changes, restart API process (`pm2 restart api --update-env` or systemd equivalent).
