# Master Config (Sonuvi)

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
   - per-install feature flags (`podcasts`, `ratings`, `radio`, `moodeDisplayTakeover`)
   - `moodeDisplayTakeover` enables custom Peppy/Player display enhancement flow for moOde
7. `notifications`
   - track-notify/pushover settings

## Runtime overrides

- `NOW_PLAYING_CONFIG_PATH` can point to a non-default config file.
- Environment variables still override some settings (used heavily for hosted/Lambda contexts).

## Credentials and integration boundaries

The JSON file configures the installation and ordinary feature defaults. It is
not a container for every runtime credential or playback integration state:

- The classic web/controller surface uses `TRACK_KEY` / `x-track-key` for
  protected routes. Native clients must not receive that key.
- The native mobile API is enabled and signed through environment-only values
  such as `MOBILE_API_ENABLED`, `MOBILE_API_SECRET`,
  `MOBILE_TRACK_ID_SECRET`, `MOBILE_API_ENROLLMENT_CODE`, and
  `MOBILE_PUBLIC_BASE_URL`. The mobile session, local-source, playback-event,
  and history contracts are documented in the canonical mobile/API pages.
- Last.fm read configuration may use the master config, but write credentials
  remain environment-only: `LASTFM_API_SECRET`, `LASTFM_SESSION_KEY`, and the
  selected `LASTFM_MPD_MODE`.
- Qobuz Connect is a PiBuZ receiver integration. Sonuvi does not store or
  expose Qobuz account credentials in this config; PiBuZ owns the remote
  session, while Sonuvi exposes the guarded observation/control boundary.
- UPnP discovery and the approved moOde renderer are runtime integration
  settings, including `UPNP_MOODE_RENDERER_HOST` and bounded discovery/HTTP
  limits. They are not a second MPD or mobile catalog configuration.

See [Playback authority](./docs/wiki-source/playback-authority-by-mode.md),
[API endpoint catalog](./docs/wiki-source/api-endpoint-catalog.md), and
[Deployment and ops](./docs/wiki-source/deployment-and-ops.md) for the
source-backed ownership and operational details.

## Safety notes

- Do not commit secrets in config.
- Keep keys/tokens in environment variables or private config files.
- After config changes, restart API process (`pm2 restart api --update-env` or systemd equivalent).

## Optional editorial About metadata

Editorial About enrichment is optional. A clean GitHub installation works
normally without Apple credentials and without any About provider configured.

Apple Music is one optional provider. If enabled, supply installer-owned Media
Services credentials outside the repository. Generated developer tokens are
created and cached in memory only. `APPLE_MUSIC_DEVELOPER_TOKEN` is an
optional development/testing fallback, not required for production.

The API exposes provider-neutral `aboutStatus` values: `unconfigured`,
`no-data`, and `available`; `aboutProvider` identifies the provider when data
is available.
