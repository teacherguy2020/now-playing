---
title: api-endpoint-catalog
page_type: child
topics:
  - api
  - runtime
  - controller
  - diagnostics
confidence: high
---

# api endpoint catalog

## Purpose

This page is the first source-driven endpoint catalog for the `now-playing` app-host API.

It exists because the API branch already has useful route-family pages, but the wiki did not yet have a single catalog page that lists concrete endpoints found directly in source.

This page is meant to be:
- source-driven
- grouped by family
- honest about proof and limits

It is **not** meant to replace the narrative API branch pages.
Those pages still matter because they explain architectural role and usage context.

## Scope and proof model

This catalog is based on direct route findings in source, primarily from:
- `now-playing/moode-nowplaying-api.mjs`
- `now-playing/src/routes/*.mjs`

That means the route paths listed here are real source-visible endpoints.

What this page does **not** yet guarantee:
- full request/response contract detail for every endpoint
- every middleware nuance
- every dynamic code path or indirect helper behavior
- complete usage tracing for every endpoint caller

So the right interpretation is:
- **endpoint inventory confidence:** high
- **full contract-detail confidence:** mixed by endpoint family

## How to use this page

Use this page when the question is:
- does this endpoint exist?
- what family does it belong to?
- which source file likely owns it?
- what nearby branch page should I read next?

Then use the family pages for explanation:
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`

## Family: root / now-playing / state surfaces

- `GET /`
  - owner: `moode-nowplaying-api.mjs`
  - likely role: root API/service response
- `GET /now-playing`
  - owner: `moode-nowplaying-api.mjs`
  - likely role: now-playing state payload used by controller/display surfaces
- `GET /next-up`
  - owner: `moode-nowplaying-api.mjs`
  - likely role: next-up state payload
- `GET /track`
  - owner: `src/routes/track.routes.mjs`
  - likely role: track-level data lookup
- `GET /rating`
  - owner: `src/routes/rating.routes.mjs`
  - likely role: ratings lookup
- `POST /rating`
  - owner: `src/routes/rating.routes.mjs`
  - likely role: ratings mutation
- `GET /rating/current`
  - owner: `src/routes/rating.routes.mjs`
  - likely role: current-track rating lookup
- `POST /rating/current`
  - owner: `src/routes/rating.routes.mjs`
  - likely role: current-track rating mutation

## Family: Alexa / current voice-state helpers

- `GET /alexa/was-playing`
- `POST /alexa/was-playing`
- `GET /alexa/now-playing`
- `GET /alexa/next-up`

Owner:
- `moode-nowplaying-api.mjs`

Likely role:
- Alexa-adjacent remembered state and current/next-up helper payloads used by controller surfaces.

## Family: MPD direct action endpoints

Owner:
- `moode-nowplaying-api.mjs`

Endpoints found:
- `POST /mpd/deprime`
- `POST /mpd/prime`
- `POST /mpd/reset-playback-state`
- `POST /mpd/play-artist`
- `POST /mpd/play-album`
- `POST /mpd/play-track`
- `POST /mpd/play-playlist`
- `POST /mpd/shuffle`
- `POST /mpd/play-file`
- `POST /mpd/add-file`
- `POST /mpd/add-album-folder`
- `POST /mpd/play-album-folder`
- `POST /mpd/artist-alias-suggestion`
- `POST /mpd/album-alias-suggestion`
- `POST /mpd/alexa-heard-artist`
- `POST /mpd/alexa-heard-album`
- `POST /mpd/alexa-heard-playlist`
- `POST /mpd/playlist-alias-suggestion`

Likely role:
- direct MPD-backed playback, queueing, and Alexa-adjacent helper actions.

## Family: queue and queue-shaping endpoints

### Direct queue endpoints
- `POST /queue/advance`
  - owner: `src/routes/queue.routes.mjs`
- `POST /queue/mix`
  - owner: `src/routes/queue.routes.mjs`

### Queue Wizard family
Owners include:
- `src/routes/config.queue-wizard-apply.routes.mjs`
- `src/routes/config.queue-wizard-basic.routes.mjs`
- `src/routes/config.queue-wizard-preview.routes.mjs`
- `src/routes/config.queue-wizard-collage.routes.mjs`
- `src/routes/config.queue-wizard-vibe.routes.mjs`

Endpoints found:
- `POST /config/queue-wizard/apply`
- `GET /config/queue-wizard/options`
- `GET /config/queue-wizard/playlists`
- `POST /config/queue-wizard/load-playlist`
- `POST /config/queue-wizard/delete-playlist`
- `GET /config/queue-wizard/playlist-preview`
- `GET /config/queue-wizard/radio-options`
- `GET /config/queue-wizard/radio-favorites`
- `POST /config/queue-wizard/radio-delete`
- `POST /config/queue-wizard/radio-favorite`
- `POST /config/queue-wizard/radio-preview`
- `GET /config/queue-wizard/radio-presets`
- `POST /config/queue-wizard/radio-presets`
- `POST /config/queue-wizard/collage-preview`
- `POST /config/queue-wizard/preview`
- `POST /config/queue-wizard/vibe-start`
- `GET /config/queue-wizard/vibe-status/:jobId`
- `GET /config/queue-wizard/vibe-debug/:jobId`
- `POST /config/queue-wizard/vibe-cancel/:jobId`
- `GET /config/queue-wizard/vibe-nowplaying`
- `POST /config/queue-wizard/vibe-nowplaying`
- `POST /config/queue-wizard/vibe-seed-start`
- `POST /config/queue-wizard/vibe-seed`

Related browse endpoints often used nearby:
- `GET /config/browse/artists`
- `GET /config/browse/albums`
- `GET /config/browse/artist-albums`
- `GET /config/browse/album-tracks`
- `GET /config/browse/stats`
- `POST /config/browse/rebuild`

## Family: diagnostics / debug / browse-index

Owner:
- `src/routes/config.diagnostics.routes.mjs`

Endpoints found:
- `POST /config/browse-index/rebuild`
- `GET /config/diagnostics/endpoints`
- `GET /config/diagnostics/album-tracks`
- `GET /config/diagnostics/artist-albums`
- `POST /config/diagnostics/queue/save-playlist`
- `POST /config/diagnostics/playback`
- `GET /config/diagnostics/queue`
- `GET /art/radio-logo.jpg`

Additional debug family from `moode-nowplaying-api.mjs`:
- `GET /debug/radio-metadata-log`
- `POST /debug/radio-metadata-log/clear`

## Family: config runtime / services / moOde control

Primary owner:
- `src/routes/config.runtime-admin.routes.mjs`

Endpoints found:
- `GET /config/runtime`
- `POST /config/runtime`
- `POST /config/runtime/resolve-host`
- `POST /config/runtime/check-env`
- `POST /config/runtime/ensure-podcast-root`
- `POST /config/restart-api`
- `POST /config/restart-services`

Service-control family:
- `GET /config/services/mpdscribble/status`
- `POST /config/services/mpdscribble/action`

Alexa runtime check:
- `POST /config/alexa/check-domain`

Controller profile:
- `GET /config/controller-profile`
- `POST /config/controller-profile`

Last.fm helper reads:
- `GET /config/lastfm/top-tracks`
- `GET /config/lastfm/recent-tracks`
- `GET /config/lastfm/top-artists`
- `GET /config/lastfm/top-albums`

## Family: moOde display / peppy / browser target control

Primary owner:
- `src/routes/config.runtime-admin.routes.mjs`

Endpoints found:
- `GET /config/moode/display/status`
- `POST /config/moode/display`
- `GET /config/moode/peppymeter/status`
- `POST /config/moode/peppymeter/start`
- `GET /config/moode/peppyalsa/status`
- `POST /config/moode/peppyalsa/ensure`
- `POST /config/moode/native-peppy`
- `POST /config/moode/browser`
- `GET /config/moode/browser-url/status`
- `POST /config/moode/browser-url`
- `GET /config/moode/peppy-vumeter-target/status`
- `POST /config/moode/peppy-vumeter-target`
- `GET /config/moode/peppy-spectrum-target/status`
- `POST /config/moode/peppy-spectrum-target`
- `POST /config/moode/peppyspectrum/ensure`
- `POST /config/moode/library-update`
- `POST /config/moode/reboot`
- `GET /config/moode/audio-info`

Related peppy state endpoints found in `moode-nowplaying-api.mjs` and runtime-admin:
- `GET /peppy/last-profile`
- `POST /peppy/last-profile`
- `GET /peppy/live`
- `PUT /peppy/vumeter`
- `GET /peppy/vumeter`
- `PUT /peppy/spectrum`
- `GET /peppy/spectrum`

Skin deployment family:
- `POST /config/peppy/skins/export`
- `POST /config/peppy/skins/deploy`
- `POST /config/peppy/skins/activate`

## Family: library health / metadata cleanup

Owners include:
- `src/routes/config.library-health-read.routes.mjs`
- `src/routes/config.library-health-art.routes.mjs`
- `src/routes/config.library-health-batch.routes.mjs`
- `src/routes/config.library-health-genre.routes.mjs`
- `src/routes/config.library-health-performers.routes.mjs`
- `src/routes/config.library-health-animated-art.routes.mjs`

Endpoints found:
- `GET /config/library-health`
- `POST /config/library-health/refresh`
- `GET /config/library-health/job`
- `GET /config/library-health/genres`
- `GET /config/library-health/missing-artwork`
- `GET /config/library-health/album-thumb`
- `GET /config/library-health/albums`
- `GET /config/library-health/album-tracks`
- `GET /config/library-health/album-art-search`
- `GET /config/library-health/album-art-fetch`
- `GET /config/library-health/album-art`
- `POST /config/library-health/album-art`
- `GET /config/library-health/genre-folders`
- `POST /config/library-health/genre-batch`
- `POST /config/library-health/rating-batch`
- `GET /config/library-health/album-genre`
- `POST /config/library-health/album-genre`
- `GET /config/library-health/album-performers-suggest`
- `POST /config/library-health/album-artist-cleanup`
- `POST /config/library-health/album-performers-apply`
- `POST /config/library-health/album-tags-overwrite`

Animated-art subfamily:
- `GET /config/library-health/animated-art/media/:name`
- `GET /config/library-health/animated-art/cache`
- `GET /config/library-health/animated-art/discovery`
- `GET /config/library-health/animated-art/job`
- `GET /config/library-health/animated-art/discover-job`
- `GET /config/library-health/animated-art/lookup`
- `POST /config/library-health/animated-art/suppress`
- `POST /config/library-health/animated-art/clear`
- `POST /config/library-health/animated-art/discover`
- `POST /config/library-health/animated-art/build`

## Family: ratings sticker maintenance

Owner:
- `src/routes/config.ratings-sticker.routes.mjs`

Endpoints found:
- `GET /config/ratings/sticker-status`
- `POST /config/ratings/sticker-backup`
- `GET /config/ratings/sticker-backups`
- `POST /config/ratings/sticker-restore`

## Family: podcasts

Owners include:
- `src/routes/podcasts-subscriptions.routes.mjs`
- `src/routes/podcasts-refresh.routes.mjs`
- `src/routes/podcasts-download.routes.mjs`
- `src/routes/podcasts-episodes.routes.mjs`

Endpoints found:
- `GET /podcasts`
- `GET /podcasts/list`
- `POST /podcasts/subscribe`
- `POST /podcasts/subscription/settings`
- `POST /podcasts/unsubscribe`
- `POST /podcasts/refresh`
- `GET /podcasts/refresh`
- `POST /podcasts/refresh-one`
- `GET /podcasts/refresh-one`
- `GET /podcasts/nightly-status`
- `POST /podcasts/nightly-retention`
- `POST /podcasts/cleanup-older-than`
- `POST /podcasts/build-playlist`
- `POST /podcasts/download-one`
- `POST /podcasts/download-latest`
- `POST /podcasts/nightly-run`
- `POST /podcasts/_debug/rebuild-local`
- `GET /podcasts/episodes/status`
- `POST /podcasts/episodes/list`
- `POST /podcasts/episodes/delete`

## Family: YouTube

Owner:
- `moode-nowplaying-api.mjs`

Endpoints found:
- `POST /youtube/resolve`
- `POST /youtube/search`
- `POST /youtube/playlist`
- `GET /youtube/proxy/:id`
- `POST /youtube/queue`

## Family: favorites / recents / browse helpers

Favorites owner in `moode-nowplaying-api.mjs`:
- `POST /favorites/toggle`
- `POST /favorite/current`

Recent/browse helpers in `src/routes/config.browse.routes.mjs`:
- `GET /recent/albums`
- `GET /recent/podcasts`
- `GET /recent/playlists`
- `GET /recent/radio-favorites`

## Relationships to existing API pages

Use this page together with:
- `api-service-overview.md` for architectural framing
- `api-config-and-runtime-endpoints.md` for config/runtime route meaning
- `api-youtube-radio-and-integration-endpoints.md` for integration-family explanation
- `api-playback-and-queue-endpoints.md` for playback/queue interpretation
- `route-ownership-map.md` when the real question is which file/module likely owns a route family

## Important current limits

This catalog is a strong first pass, but it still has clear limits:
- not every endpoint has a documented request/response contract here
- not every caller relationship is listed
- some family descriptions are still inferred from file names + route placement + current wiki coverage
- some routes may deserve their own future child pages once heavily used

## Current status

At the moment, this page gives the wiki the source-driven API inventory it was missing.

That should make the API branch more useful for onboarding, debugging, and safer agent work because the route families are now backed by direct source-visible endpoint listings rather than only surface-level inference.
