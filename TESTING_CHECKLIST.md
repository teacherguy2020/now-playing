# Refactor Testing Checklist

Branch: `jarvis/refactor-api-structure`

## 1) Boot / syntax

- [ ] `node --check moode-nowplaying-api.mjs`
- [ ] `node --check lambda.alexa.js`
- [ ] API process starts cleanly (pm2/systemd)

## 2) Core API smoke (Pi #2)

- [ ] `GET /now-playing` returns expected JSON shape
- [ ] `GET /next-up` returns payload
- [ ] `GET /art/current_320.jpg` returns image
- [ ] `GET /art/current_640.jpg` returns image
- [ ] `GET /art/current_bg_640_blur.jpg` returns image

## 3) Ratings/favorites

- [ ] `GET /rating/current` works on local track
- [ ] `POST /rating/current` updates sticker rating
- [ ] `POST /favorites/toggle` updates favorite state

## 4) Alexa-critical routes

- [ ] `GET /track?file=...&k=...` serves track
- [ ] `POST /queue/advance` with `songid` works
- [ ] `POST /queue/advance` with `pos0` fallback works
- [ ] No response shape regressions for Lambda expectations

## 5) Podcast flows

- [ ] `GET /podcasts` and `/podcasts/list`
- [ ] `POST /podcasts/subscribe`
- [ ] `POST /podcasts/refresh` and `/refresh-one`
- [ ] `POST /podcasts/episodes/list`
- [ ] `POST /podcasts/download-one`
- [ ] `POST /podcasts/download-latest`
- [ ] `POST /podcasts/build-playlist`
- [ ] `POST /podcasts/episodes/delete`

## 6) UI smoke

- [ ] `index1080.html` loads CSS+JS from `styles/` and `scripts/`
- [ ] `podcasts.html` loads CSS+JS from `styles/` and `scripts/`
- [ ] Browser console has no blocking errors

## 7) Alexa Lambda smoke (optional but recommended)

- [ ] Launch starts playback
- [ ] NearlyFinished enqueues next item
- [ ] PlaybackStarted advances queue at offset 0 only
- [ ] Pause/Resume keeps offset behavior

## Regression hotspots to watch

- Token/queue semantics between Lambda and `/queue/advance`
- Art fallback behavior for radio/airplay/upnp
- Podcast filename/id mapping consistency (`sha1(...).slice(0,12)`)
- Playlist cover push logic over SSH
