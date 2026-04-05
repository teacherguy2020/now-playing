# config lastfm and scrobbling

## Purpose

This page documents the Last.fm and scrobbling-related portions of `now-playing/config.html`.

It exists because the Config page contains two tightly related but distinct clusters:
- `mpdscribble` service control
- Last.fm / Vibe configuration

These should be documented together because they are operationally connected, but they should not be collapsed into one indistinguishable feature.

## Why this page matters

This cluster is important because it connects:
- runtime scrobble generation
- Last.fm identity/configuration
- Vibe/discovery behavior
- homepage/row presentation choices
- service-control actions

That means the Config page here is simultaneously:
- a service-control console
- an integration setup surface
- a curation/discovery feature switchboard

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `integrations.md`
- future queue/vibe pages

## High-level model

A good current interpretation is:
- `mpdscribble` is the scrobble/runtime-service side
- Last.fm is the discovery/integration side
- Vibe depends on the Last.fm side being configured meaningfully
- scrobble history often comes from mpdscribble, but the UI explicitly notes that other scrobble sources could also work

That distinction is one of the main points this page should preserve.

## 1. mpdscribble controls

Observed UI elements include:
- `featureMpdscribbleControl`
- `mpdscribbleStatus`
- `mpdscribbleRefreshBtn`
- `mpdscribbleStartBtn`
- `mpdscribbleStopBtn`

### Purpose of this block
This block appears to govern whether mpdscribble controls are exposed and gives operators direct runtime control over the service.

The UI explicitly says:
- it shows scrobble control in hero UI
- it enables start/stop actions

So this is not just a passive status display.

### Status refresh behavior
Observed code includes `refreshMpdscribbleStatus()`.

Observed behavior includes:
- update `mpdscribbleStatus`
- fetch:
  - `GET /config/services/mpdscribble/status`
- cache the returned status in local state
- update UI accordingly

This makes mpdscribble a live runtime-managed service from the Config page’s perspective.

### Start/stop action behavior
Observed code includes `runMpdscribbleAction(action)`.

Observed behavior includes:
- require track key
- update status text while running
- POST to:
  - `/config/services/mpdscribble/action`
- include action such as:
  - `start`
  - `stop`

This is a clear example of Config being an operational service-control surface, not just a form.

### Visibility/gating
Observed code includes `syncMpdscribbleUi()`.

Working interpretation:
- the visibility/usability of mpdscribble controls is tied to the `featureMpdscribbleControl` flag
- the page conditionally exposes live control affordances based on that setting

## 2. Last.fm / Vibe configuration

Observed UI elements include:
- `featureLastfm`
- `lastfmApiKey`
- `lastfmUsername`
- `lastfmRecentsReplaceRadio`
- `lastfmRecentsMode`

### Why this block matters
This is the Last.fm identity and behavior layer for the project.
It appears to affect:
- whether Last.fm-backed features are enabled
- what account/API identity is used
- whether Last.fm replaces the Favorite Radio row
- what flavor of Last.fm content is shown in that row
- whether Vibe tools are meaningfully available

### Config fields and semantics
Observed fields include:
- API key
- username
- replace-radio toggle
- row mode options:
  - `toptracks`
  - `recenttracks`
  - `topartists`
  - `topalbums`

This means the Config page is not just turning Last.fm on/off. It is also shaping how Last.fm-derived UI behavior presents.

### Important UI hints
The Config page explicitly notes:
- when enabled/configured, Vibe tools are available in Queue Wizard
- the Last.fm row relies on scrobble history
- mpdscribble is typical, but not the only possible scrobble source
- the API host needs certain Python dependencies for Vibe:
  - `python3-mpd`
  - `python3-requests`
  - `python3-mutagen`

That makes this section both a feature setup surface and a documentation surface for prerequisites.

## Save/load behavior

Observed config-load behavior includes:
- feature state from `c.features?.lastfm`
- API key from runtime/full config or local secret cache
- username from runtime/full config
- recents replace-radio toggle from full config
- recents mode from full config
- localStorage caching of Last.fm API key

Observed config-save behavior includes:
- `features.lastfm`
- `lastfm.apiKey`
- `lastfm.username`
- `lastfm.recentsReplaceRadio`
- `lastfm.recentsMode`

This shows a split between:
- top-level feature enablement
- nested Last.fm-specific config payload

## Secret handling

Observed secret caching includes:
- `lastfmApiKey` cached in localStorage under:
  - `nowplaying.secret.lastfmApiKey`

### Why it matters
This indicates the Config page tries to preserve operator convenience for API credentials while still treating them as secret-like inputs.

## Visibility / gating behavior

Observed code includes `syncLastfmCardVisibility()`.

Working interpretation:
- the Last.fm card is dynamically gated based on whether the feature is enabled and/or whether API-key state is present
- the UI is trying to help the operator distinguish between disabled, partially configured, and configured states

## Important relationships

## mpdscribble versus Last.fm
These are related but not identical.

A good current distinction is:
- `mpdscribble` = service that may generate scrobble history
- Last.fm = external service/account + Vibe/discovery feature consumer

So when something breaks, the questions are different:
- Is the scrobble service running?
- Are Last.fm credentials configured?
- Is there enough scrobble history for the desired row/mode?
- Are Vibe prerequisites installed on the API host?

## Last.fm versus UI row behavior
`lastfmRecentsReplaceRadio` and `lastfmRecentsMode` show that Last.fm is not just a backend integration.
It directly affects what the user sees in certain UI rows.

So this is both:
- an integration setting
- a user-facing content-selection behavior

## Important endpoints / action surfaces

Based on current inspection, the most explicit mpdscribble endpoints are:
- `GET /config/services/mpdscribble/status`
- `POST /config/services/mpdscribble/action`

The Last.fm side in this page appears to be primarily runtime config load/save driven rather than exposed here through dedicated feature-specific action endpoints.

## User/operator workflow model

A useful current workflow model is:

### Service-control workflow
1. enable mpdscribble controls
2. refresh status
3. start or stop mpdscribble as needed
4. confirm service state in status display

### Last.fm/Vibe setup workflow
1. enable Last.fm
2. enter API key and username
3. choose whether Last.fm replaces the Favorite Radio row
4. choose row mode
5. save config
6. verify Vibe behavior or homepage/row behavior afterward

### Troubleshooting workflow
1. verify mpdscribble service state
2. verify Last.fm credentials
3. verify scrobble history actually exists
4. verify required Python dependencies for Vibe are installed
5. check whether row behavior matches the configured mode

## Architectural interpretation

A good current interpretation is:
- this config cluster bridges runtime service state and feature-layer discovery behavior
- it is both operational and user-facing in effect
- it is one of the stronger examples of Config mixing service control with product behavior configuration

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `integrations.md`
- future queue/Vibe/scrobbling pages

## Things still to verify

Future deeper verification should clarify:
- how Vibe uses Last.fm data after config is saved
- whether mpdscribble is the default live scrobble source in Brian’s current setup or only a supported path
- what exact status payload the mpdscribble status endpoint returns
- which UI surfaces consume `lastfmRecentsReplaceRadio` and `lastfmRecentsMode` most directly

## Current status

At the moment, this page gives the Last.fm/scrobbling config cluster the right level of seriousness.

It is not just “put in an API key.”
It is:
- service control
- feature enablement
- discovery/Vibe setup
- row-behavior shaping
- prerequisite-aware integration config
