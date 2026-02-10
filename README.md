# now-playing

A moOde-focused now-playing API + UI stack with podcast management, queue controls, ratings, and optional Alexa integration. The project began as a way to display enhanced information on a dedicated display (like your TV), and now also adapts to devices and adds playback controls.

## What this project does

- Serves a Now Playing API (`/now-playing`, `/next-up`, `/alexa/was-playing`, artwork routes, queue/rating controls)
- Hosts adaptive UI pages (`index.html`, `podcasts.html`)
- Manages podcast subscriptions/downloads/playlists
- Supports multi-device/home deployments (Pi nodes)
- Supports optional Alexa endpoint flow when enabled
- Keeps display behavior as consistent as possible across listening modes:
  - local library music/podcasts
  - radio streams
  - AirPlay
  - UPnP

## Project layout

- `moode-nowplaying-api.mjs` – main API server entrypoint
- `src/` – routes/services/config helpers
- `styles/`, `scripts/`, `index.html`, `podcasts.html` – UI assets
- `config/now-playing.config.example.json` – master config template
- `CONFIG.md` – config details
- `INSTALLER_PLAN.md` – installer roadmap

## Quick start

```bash
npm ci
cp config/now-playing.config.example.json config/now-playing.config.json
# edit config/now-playing.config.json
node moode-nowplaying-api.mjs
```

API default: `http://<host>:3101`

## UX highlights

- **Clickable stars for ratings**: users can click star ratings in the now-playing UI to update track rating.
- **Adaptive layout**: `index.html` adapts to screen/environment, including portrait behavior with on-screen playback controls.
- **Alexa-aware display mode**: UI can auto-switch to Alexa playback state using `/alexa/was-playing` (with explicit lifecycle active/inactive state).
- **iTunes enrichment**: track-specific album-art lookup, album release year augmentation, and Apple Music deep-link support when found.
- **AirPlay metadata hardening**: AirPlay metadata handling is enhanced/stabilized to improve continuity and display quality.

## Runtime config

Primary source of truth:

- `config/now-playing.config.json`

Optional overrides via env vars still work (env wins).

You can point to a different config file with:

```bash
export NOW_PLAYING_CONFIG_PATH=/path/to/now-playing.config.json
```

## Key config fields

- `nodes[]` – Pi hosts, IPs, and roles (`api`, `display`, `both`)
- `ports.api` / `ports.ui`
- `alexa.enabled` + `alexa.publicDomain`
- `paths.musicLibraryRoot`, `paths.moodeUsbMount`, `paths.piMountBase`, `paths.podcastRoot`

## Optional: iOS track-start push notifications (Pushover)

The API can send push notifications when a new track starts.

Source selection is automatic:
- If Alexa state is active/fresh (`/alexa/was-playing`) → notify from Alexa track
- Otherwise (normal playback) → notify from `/now-playing` track

Preferred configuration is in the master JSON (`config/now-playing.config.json`):

```json
"notifications": {
  "trackNotify": {
    "enabled": true,
    "pollMs": 3000,
    "dedupeMs": 15000,
    "alexaMaxAgeMs": 21600000
  },
  "pushover": {
    "token": "<your app token>",
    "userKey": "<your user key>"
  }
}
```

Environment variables still override config when present:
- `TRACK_NOTIFY_ENABLED`
- `TRACK_NOTIFY_POLL_MS`
- `TRACK_NOTIFY_DEDUPE_MS`
- `TRACK_NOTIFY_ALEXA_MAX_AGE_MS`
- `PUSHOVER_TOKEN`
- `PUSHOVER_USER_KEY`

After config/env changes:

```bash
pm2 restart api --update-env
pm2 save
```

### Web config page

You can edit core Alexa/notification settings in-browser at:

- `https://<your-domain>/config.html`

The page reads/writes via:
- `GET /config/runtime`
- `POST /config/runtime` (requires `x-track-key`)

It supports both:
- guided field editing (Alexa/notifications)
- advanced full JSON editing (entire config object)

After save, the UI prompts to restart API. On PM2 hosts, use the built-in "Restart API now" action.

Notes:
- Track key field supports masked/unmasked toggle.
- Track key is preloaded from effective runtime config (and cached in browser localStorage).
- Notification values are shown as effective values (config + env overrides).

## Ratings (MPD stickers)

If ratings are enabled, ensure MPD has `sticker_file` configured and writable.

Example in `mpd.conf`:

```conf
sticker_file "/var/lib/mpd/sticker.sql"
```

## Deployment notes

Many setups copy files to Pi hosts (`scp`/`rsync`) instead of pulling directly from git.
If so, deploy to the folder actually served by your web/API processes, then restart service manager (PM2/systemd).

## Current branch workflow

Typical flow used in this project:

1. Make/test changes on live Pi when needed
2. Sync back to local repo
3. Commit + push to `jarvis/refactor-api-structure`

## License

MIT
