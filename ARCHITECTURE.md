# now-playing Architecture

Distributed now-playing system for moOde with clear separation of concerns.

## One-line model

- **API node = data + control** (JSON, metadata logic, art generation, queue/rating endpoints)
- **Web/UI node = pixels** (HTML/JS pages)

In most installs these are on the same host, but they can be split.

## Authority scope

moOde/MPD remains authoritative for the Home/local/radio playback paths that
actually use MPD. It is not a universal authority for every Sonuvi playback
source. Qobuz Connect, Sonuvi-owned UPnP playback, and native device playback
have separate state, queue, and control boundaries; the API host arbitrates
those boundaries and exposes source-aware normalized state.

## Default ports (current)

- **API:** `3101`
- **Web/UI:** `8101`

These are configurable via runtime config (`ports.api`, `ports.ui`).

## Topology

1. **moOde Player (MPD-domain authority)**
   - MPD/moOde playback + library
   - `/command/?cmd=get_currentsong`
   - `/command/?cmd=status`
   - `/var/local/www/aplmeta.txt` (AirPlay metadata/art)

2. **API + Web Host (brains + UI host)**
   - Node API server (`moode-nowplaying-api.mjs`)
   - Route modules under `src/routes/*`
   - Metadata and state normalization (local/radio/UPnP/AirPlay/Qobuz/mobile)
   - Artwork resolution/caching
   - JSON API on `:3101` (default)
   - Web UI on `:8101` (default)
   - Optional Alexa integration endpoint

3. **Display/Kiosk (optional)**
   - Chromium kiosk or browser device
   - Recommended moOde Target URL (r1034+): `http://<WEB_HOST>/display.html?kiosk=1`
   - The portless URL uses the LAN proxy; do not put `:8101` in moOde's Target URL field
   - `display.html` routes to custom Peppy/Player/moOde UI modes from saved profile state
   - No metadata/control logic on device

## Primary files/directories

- `moode-nowplaying-api.mjs` — API entrypoint
- `src/routes/` — API route modules
- `src/services/` — MPD/service helpers
- `index.html`, `scripts/index-ui.js` — legacy/primary display UI base
- `display.html` — stable router target for moOde
- `peppy.html` — custom peppy builder/display
- `player.html` + `player-render.html` — player builder + render path
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

### Bearer-authenticated native mobile

- Native clients use scoped `Authorization: Bearer <mobile-session-token>`
  under `/v1/mobile/*`; they do not receive the Track Key.
- `POST /v1/mobile/session` enrolls a device with the configured
  `X-Mobile-Enrollment-Code`; access tokens last 12 hours and refresh tokens
  use a separate 365-day `mobile-refresh` scope.
- Current shared contracts include mobile now-playing/queue, Qobuz Connect,
  UPnP, Audio Info, local-source availability, playback events, and recent
  history. Responses use opaque IDs and sanitized server-owned data.

## Playback mode behavior

- **Local files:** full metadata, ratings/progress shown
- **Radio:** iTunes enrichment when possible; graceful fallback to station/moOde metadata
- **Qobuz Connect:** PiBuZ owns the remote receiver/session and queue while
  Sonuvi observes and exposes guarded controls; Qobuz is not an MPD queue.
- **UPnP:** Sonuvi owns a guarded logical queue/session for its playback path;
  the renderer's MPD queue is an implementation detail and is not silently
  restored.
- **AirPlay:** uses `aplmeta.txt` + LAN/public art fallbacks
- **Native iOS:** the device may play through its own queue, while current
  Server-backed MobileTrack identity, local-source resolution, and shared
  history contracts remain authoritative during the transition.

## Guardrails

- Do not serve UI from the API port
- Do not point UI directly at moOde
- Do not open UI via `file://`
- Ratings are local-file-only (MPD stickers)

## Alexa integration principles

- Alexa never talks directly to moOde
- API host mediates queue coordination
- MPD remains authoritative for the Alexa Home/moOde path
- Queue alignment and metadata consistency are preserved

## Mabel and VIP integration boundary

The Multiphone project's Mabel agent is an external client of this API. Its
normal numbered requests use the dedicated Multiphone integration and jukebox
priority rules. Its VIP/off-script music requests reuse bounded Sonuvi API
actions such as album, artist, playlist, mix, and now-playing operations.

The Mac-side Mabel bridge is the orchestration and credential boundary. Mabel
must not receive unrestricted HTTP or MPD access, and the iPad handset must not
receive permanent API credentials. VIP requests should carry explicit options
when behavior matters, including artist limits, physical queue shuffle, and
the rating filter that excludes one-star tracks.

Future lighting, Harmony Hub, and room-ambience controls belong in a separate
allow-listed VIP action layer rather than in core MPD routes. Each adapter
should have a named action, validated arguments, bounded execution, and a
defined cleanup/restore policy. See `docs/compatibility-guides/23-mabel-vip.md`.
