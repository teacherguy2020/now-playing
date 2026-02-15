# Testing Checklist

Use this before merging major changes to `main`.

## 1) Boot / syntax

- [ ] `node --check moode-nowplaying-api.mjs`
- [ ] `node --check scripts/index-ui.js`
- [ ] `node --check scripts/queue-wizard.js`
- [ ] API process starts cleanly (pm2/systemd)

## 2) Core API smoke (default port 3101)

- [ ] `GET /healthz`
- [ ] `GET /now-playing`
- [ ] `GET /next-up`
- [ ] `GET /art/current.jpg`
- [ ] `GET /art/current_640.jpg`
- [ ] `GET /art/current_bg_640_blur.jpg`

## 3) Protected API smoke (`x-track-key`)

- [ ] `GET /config/runtime`
- [ ] `GET /config/diagnostics/queue`
- [ ] `POST /config/diagnostics/playback` (`play/pause/prev/next/shuffle/remove/rate`)
- [ ] `POST /config/queue-wizard/preview`
- [ ] `POST /config/queue-wizard/apply`

## 4) UI smoke (default web port 8101)

- [ ] `index.html` loads and updates now-playing state
- [ ] `diagnostics.html` queue controls work (shuffle state, remove, rating)
- [ ] `queue-wizard.html` filter + vibe + queue card controls work
- [ ] `library-health.html` scan runs and modules render
- [ ] `podcasts.html` loads and core actions are responsive

## 5) Alexa flow (optional)

- [ ] `/alexa/was-playing` lifecycle behaves as expected
- [ ] Queue advancement semantics still align with skill expectations
- [ ] `index.html` Alexa mode next-up behavior is correct

## 6) Installer flow (systemd Linux)

- [ ] `scripts/install.sh` succeeds on clean host
- [ ] service starts (`now-playing.service`)
- [ ] smoke endpoints respond after install
- [ ] re-run is idempotent

See: `docs/INSTALL_VALIDATION.md` for full installer validation gate.

## Regression hotspots

- Queue/rating side effects and position handling
- Art fallback behavior for radio/airplay/upnp
- Podcast file/id mapping consistency
- SSH-based maintenance operations (art/tag/sticker flows)
