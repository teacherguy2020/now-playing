---
title: integrations
page_type: parent
topics:
  - integration
  - api
  - playback
  - runtime
confidence: medium
---

# integrations

## Purpose

This page documents the external-system and cross-boundary integration layer in the `now-playing` project.

A stronger current interpretation is:
- integrations are not a side topic
- they are one of the main reasons the project is operationally complex
- the project continuously translates between app-host truth, playback/runtime state, metadata enrichment, and external systems such as moOde, MPD, YouTube, Alexa, Last.fm, and podcast feeds

So this page should act as the integration branch hub, not as a loose list of outside services.

## Relevant source files

This page is branch-oriented rather than file-complete, but these areas are especially relevant when grounding integration behavior:
- `moode-nowplaying-api.mjs`
- integration-facing routes under `src/routes/`
- `alexa.html`
- `youtube.html`
- radio-related routes and eval surfaces
- host-side moOde override material under `ops/`

## External integrations at a glance

If you need the compressed branch model first, use this:
- **moOde + MPD** remain the primary integration anchor
- **YouTube, Alexa, radio metadata, Last.fm, podcasts, and AirPlay-related behavior** are important secondary integration branches
- some integration truth is route-side and app-host-owned
- some integration truth is host-side or override-sensitive
- many failures that look like UI bugs are really integration-boundary problems

That is why the integrations branch should be read as a system of external boundaries, not just a list of features.

## Why this page matters

Many of the hardest bugs are integration bugs.

They often involve wrong assumptions about:
- which system is the source of truth
- where a piece of metadata came from
- whether a route is mediating behavior versus passing it through
- whether a visible result belongs to the app host, moOde, MPD, or an external service

This page exists to keep those boundaries explicit.

## What belongs in the integration layer

A useful branch definition is:
- systems that `now-playing` reads from, writes to, mediates, or translates between
- routes and surfaces that bridge into those systems
- operator/debug pages that exist mainly because those boundaries are real and important

That means the integration branch includes both:
- external services
- and the internal bridging logic that makes those services useful to the UI/runtime

## Read this branch in this order

If you are trying to understand the integrations branch as a system, read in this order:
1. [integrations.md](integrations.md)
2. [youtube-interface.md](youtube-interface.md)
3. [alexa-interface.md](alexa-interface.md)
4. [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)
5. [config-lastfm-and-scrobbling.md](config-lastfm-and-scrobbling.md)
6. [airplay-metadata-hardening.md](airplay-metadata-hardening.md)

Then move into runtime or host-specific pages when the issue becomes override-sensitive or environment-specific.

## Strong current integration map

## 1. moOde

moOde is not just one integration among many.
It is the anchor runtime around which the project is organized.

Current strong truths include:
- browser-target control for display surfaces
- status and playback context used in visible-state interpretation
- display/runtime actions initiated through config/runtime-admin routes
- local-host/browser-display behavior that matters operationally

Best companion pages:
- [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md)
- [display-launch-and-wrapper-surfaces.md](display-launch-and-wrapper-surfaces.md)
- [local-environment.md](local-environment.md)
- [deployment-and-ops.md](deployment-and-ops.md)

### Seeburg wallbox selection bridge

The Seeburg wallbox is a hardware client of the app-host API. The Pico firmware
decodes the wallbox selection and sends only the numeric selection, while the
Now Playing API resolves that number against moOde's saved MPD playlist:
- `POST /integrations/seeburg/selection` accepts a number from `1` through `100`
- the number selects that position in the saved `Seeburg Playlist` by default
- selected tracks are classified as `source: "seeburg"` / `priority: "jukebox"`
- if ordinary music is playing, the selected file is inserted immediately after
  the current track and starts; the ordinary queue remains behind it
- if a Seeburg track is already playing, later selections are inserted
  immediately behind the current and pending Seeburg tracks in FIFO order
- once those priority tracks finish, playback naturally returns to the preserved
  ordinary queue
- `dryRun: true` and `GET /integrations/seeburg/playlist` support commissioning before the full 100-track catalog exists
- `SEEBURG_PLAYLIST_NAME` can override the playlist name via the API environment

The firmware and hardware documentation live in the separate
[`seeburg-nowplaying-pico`](https://github.com/teacherguy2020/seeburg-nowplaying-pico)
repository; the project notes are mirrored locally under `seeburg-wallbox/`.
This is intentionally a playlist-position protocol: changing the catalog is a
moOde/MPD playlist operation and does not require changing the Pico firmware or
the API route.

The current hardware-side project is documented in `seeburg-wallbox/wiki/software-integration.md`.

Live deployment status:
- API host: `10.0.0.4` (`/opt/now-playing`)
- service: `now-playing.service`
- playlist observed during commissioning: 36 tracks
- production route behavior: starts a selected track from a stopped/paused state,
  and appends without interruption while already playing

### Mills Throne of Music

The Mills Throne integration is an observation-first bridge for a 1939 mechanical jukebox:
- the original Mills mechanism remains authoritative for selection order and audio
- an AS5600 on a Pico 2 W observes the selector shaft and will eventually report calibrated physical slots 1–20
- the Mills REST gap between positions 20 and 1 must be distinguished from an actual slot-20 selection using movement/phase context
- a Shelly 1PM Gen4 provides power measurement, activity/idle confirmation, and local webhooks
- Now-Playing owns the Mills session, MPD display surrogate, Harmony/Denon source switching, and restoration of the pre-Mills playback state
- the Pico has authenticated local OTA updating so a mounted/calibrated sensor assembly need not be disturbed for firmware changes

See [mills-throne-integration.md](mills-throne-integration.md) for the current architecture, observed power profile, wiring, OTA workflow, and open calibration work.

### Mills Throne source-switching bridge

The Mills integration initially uses the Pico as a transition gateway for
Shelly power/activity events. The Pico forwards only the first active and the
confirmed final idle transition during a Mills session:

- `POST /integrations/mills/start` switches the Denon from `Aux 1` to `Phono`
  through the local Harmony Hub WebSocket.
- `POST /integrations/mills/stop` switches the Denon from `Phono` back to
  `Aux 1`.
- `GET /integrations/mills/status` exposes the integration latch and surrogate
  track details for diagnostics.

The routes are authenticated with the existing `TRACK_KEY`, idempotent, and
serialize transitions so repeated Shelly actions cannot issue duplicate source
changes. A drop from mechanism power to the approximate record-playing level
is not a stop; idle means the whole Mills session has returned to its true idle
power range.

For the initial surrogate-playback test, the first entry in the MPD playlist
`Mills-Playlist` is added through the shared jukebox-priority queue path and
started with normal MPD playback after the Denon switches to Phono. This is
intentional: the Denon is listening to the physical Mills on Phono, while the
inaudible MPD track keeps Now-Playing metadata, artwork, progress, and clients
updated naturally. Duplicate start events do not add another surrogate.

AS5600 selection mapping, exact pre-Mills MPD snapshot/restoration, and final
session-end confirmation remain later phases.

Harmony configuration is installation-specific and supplied to the
Now-Playing service through `HARMONY_HOST`, `HARMONY_PORT`,
`HARMONY_DOMAIN`, `HARMONY_HUB_ID`, and `HARMONY_DENON_DEVICE_ID`. The IR
command names default to `InputPhono` and `InputAux1`.

## 2. MPD

MPD is still foundational to playback and queue behavior even when app-host routes mediate the visible behavior.

Current strong truths include:
- direct `/mpd/*` action routes exist
- queue and playback routes often mediate or enrich visible behavior instead of exposing raw MPD state directly
- mode-specific truth can diverge from simplistic “just ask MPD” assumptions

Best companion pages:
- [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md)
- [queue-and-playback-model.md](queue-and-playback-model.md)
- [playback-authority-by-mode.md](playback-authority-by-mode.md)

## 3. YouTube

YouTube is a first-class integration family with direct route support.

Current strong truths include source-visible endpoints for:
- `/youtube/resolve`
- `/youtube/search`
- `/youtube/playlist`
- `/youtube/proxy/:id`
- `/youtube/queue`

And concrete request-shape notes now exist in:
- `api-endpoint-catalog.md`

Best companion pages:
- [youtube-interface.md](youtube-interface.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
- [api-endpoint-catalog.md](api-endpoint-catalog.md)

## 4. Alexa

Alexa is not just a setup story.
It also has state-truth and correction/review implications.

Current strong truths include:
- setup/provisioning paths in the config branch
- correction/review behavior in `alexa.html`
- helper state endpoints such as `/alexa/now-playing`, `/alexa/next-up`, and `/alexa/was-playing`

Best companion pages:
- [config-alexa-setup.md](config-alexa-setup.md)
- [alexa-interface.md](alexa-interface.md)
- [api-state-truth-endpoints.md](api-state-truth-endpoints.md)
- [playback-authority-by-mode.md](playback-authority-by-mode.md)

## 5. Radio metadata and enrichment boundaries

Radio is important because it makes metadata-truth mistakes easy.

Current strong truths include:
- dedicated eval/debug surface in `radio-metadata-eval-interface.md`
- debug endpoints for radio metadata logs
- explicit caution that enrichment should stay conservative and not treat talk/news/sports streams like normal music metadata sources

Best companion pages:
- [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
- [fragile-behavior-ownership.md](fragile-behavior-ownership.md)

## 6. Last.fm / scrobbling / vibe-adjacent integrations

Current strong truths include:
- explicit config branch coverage for Last.fm and scrobbling
- route-family visibility in config/runtime and queue-wizard/vibe paths
- these are not generic decoration; they affect queue generation and external activity recording

Best companion pages:
- [config-lastfm-and-scrobbling.md](config-lastfm-and-scrobbling.md)
- [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md)
- [api-endpoint-catalog.md](api-endpoint-catalog.md)

## 7. Podcasts

Podcast support is a real integration/runtime family with concrete routes and operational paths.

Current strong truths include source-visible endpoints for:
- subscription management
- refresh flows
- nightly status/run paths
- episode listing/deletion
- playlist-building/download workflows

Best companion pages:
- [config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md)
- [api-endpoint-catalog.md](api-endpoint-catalog.md)
- [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md)

## What this branch is now confident about

The current repo and wiki support these stronger claims:
- moOde is the central runtime anchor, not just one integration among peers
- MPD remains foundational, but app-host logic frequently mediates visible behavior
- YouTube, Alexa, radio, podcasts, and Last.fm each have real route families and surface-level branch pages now
- many “display” or “playback” problems are actually integration-boundary problems
- the important operational question is often “which boundary is responsible?” not just “which page looks wrong?”

## High-value starting paths

### If the bug smells like a boundary/source-of-truth problem
Start with:
1. [integrations.md](integrations.md)
2. [api-state-truth-endpoints.md](api-state-truth-endpoints.md)
3. [playback-authority-by-mode.md](playback-authority-by-mode.md)

### If the bug smells like YouTube or radio behavior
Start with:
1. [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
2. [api-endpoint-catalog.md](api-endpoint-catalog.md)
3. the relevant surface page ([youtube-interface.md](youtube-interface.md) or [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md))

### If the bug smells like Alexa-visible state or setup
Start with:
1. [alexa-interface.md](alexa-interface.md)
2. [config-alexa-setup.md](config-alexa-setup.md)
3. [api-state-truth-endpoints.md](api-state-truth-endpoints.md)

### If the bug smells like podcast/runtime integration
Start with:
1. [config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md)
2. [api-endpoint-catalog.md](api-endpoint-catalog.md)
3. [deployment-and-ops.md](deployment-and-ops.md)

## Relationship to other pages

This page should stay linked with:
- [api-service-overview.md](api-service-overview.md)
- [api-endpoint-catalog.md](api-endpoint-catalog.md)
- [api-state-truth-endpoints.md](api-state-truth-endpoints.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
- [playback-authority-by-mode.md](playback-authority-by-mode.md)
- [local-environment.md](local-environment.md)
- [deployment-and-ops.md](deployment-and-ops.md)

## Current status

At the moment, this page should be read as the parent hub for integration-boundary reasoning.

It is no longer just a list of outside systems.
The current wiki already supports a stronger truth:
- integration boundaries are one of the main structural and operational realities of the project,
- and many hard bugs only make sense when those boundaries are made explicit.

## Timestamp

Last updated: 2026-09-15 America/Chicago
