# now-playing Architecture

Distributed now-playing system for moOde with clear separation of concerns.

## One-line model

- **API node = data + control** (JSON, metadata logic, art generation, queue/rating endpoints)
- **Web/UI node = pixels** (HTML/JS pages)

In most installs these are on the same host, but they can be split.

## Default ports (current)

- **API:** `3101`
- **Web/UI:** `8101`

These are configurable via runtime config (`ports.api`, `ports.ui`).

## Topology

1. **moOde Player (audio authority)**
   - MPD/moOde playback + library
   - `/command/?cmd=get_currentsong`
   - `/command/?cmd=status`
   - `/var/local/www/aplmeta.txt` (AirPlay metadata/art)

2. **API + Web Host (brains + UI host)**
   - Node API server (`moode-nowplaying-api.mjs`)
   - Route modules under `src/routes/*`
   - Metadata normalization (local/radio/UPnP/AirPlay)
   - Artwork resolution/caching
   - JSON API on `:3101` (default)
   - Web UI on `:8101` (default)
   - Optional Alexa integration endpoint

3. **Display/Kiosk (optional)**
   - Chromium kiosk or browser device
   - Loads `http://<WEB_HOST>:8101/index.html`
   - No metadata/control logic on device

## Primary files/directories

- `moode-nowplaying-api.mjs` — API entrypoint
- `src/routes/` — API route modules
- `src/services/` — MPD/service helpers
- `index.html`, `scripts/index-ui.js` — now-playing display UI
- `queue-wizard.html`, `library-health.html`, `diagnostics.html`, `podcasts.html`, `config.html` — admin/ops UIs
- `alexa/*` — optional Alexa skill runtime/assets

## Core API contracts

### Public (read)
- `GET /now-playing`
- `GET /next-up`
- `GET /art/current.jpg`
- `GET /art/current_bg_640_blur.jpg`

### Key-protected (control/config)
- Queue/rating/control routes under route modules (for example `src/routes/queue.routes.mjs`, `src/routes/rating.routes.mjs`, `src/routes/config.routes.mjs`)
- Config/maintenance endpoints generally require `x-track-key`

## Playback mode behavior

- **Local files:** full metadata, ratings/progress shown
- **Radio:** iTunes enrichment when possible; graceful fallback to station/moOde metadata
- **UPnP:** stream-like behavior, metadata can be limited
- **AirPlay:** uses `aplmeta.txt` + LAN/public art fallbacks

## Guardrails

- Do not serve UI from the API port
- Do not point UI directly at moOde
- Do not open UI via `file://`
- Ratings are local-file-only (MPD stickers)

## Alexa integration principles

- Alexa never talks directly to moOde
- API host mediates queue coordination
- MPD remains authoritative
- Queue alignment and metadata consistency are preserved
