# now-playing

A moOde-focused now-playing API + UI stack with podcast management, queue controls, ratings, and optional Alexa integration.

## What this project does

- Serves a Now Playing API (`/now-playing`, `/next-up`, artwork routes, queue/rating controls)
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

Private project / internal use unless otherwise specified.
