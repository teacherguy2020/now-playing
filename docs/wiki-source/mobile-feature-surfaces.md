---
title: Native mobile feature surfaces
page_type: feature
topics:
  - mobile
  - genres
  - podcasts
  - radio
  - queue-wizard
confidence: high
---

# Native mobile feature surfaces

The native iPhone/iPad controller now has bearer-authenticated feature
surfaces for **Genres**, **Podcasts**, **Radio**, and **Queue Wizard**. They
reuse the existing controller services on the server while keeping Track Key,
MPD paths, and podcast filesystem paths out of the native client.

## Shared API boundary

The server exposes these mobile-safe families under `/v1/mobile/`:

- `genres` and `genres/:genre/albums`
- `podcasts`, show episodes, subscription settings, refresh, download/delete,
  media, play, and queue actions
- `radio`, options, presets, favorite, Home moOde play/queue actions, and
  ticketed native radio stream authorization
- `queue-wizard/options`, `preview`, `collage-preview`, `apply`,
  `add-to-playlist`, and `vibe`
- `alexa/actions`, `alexa/queue`, and target-aware queue-item play
- `home/profile`, `audio-info`, `next-up`, local-source manifest, and native
  playback-history events

Feature, metadata, and control routes require the existing `mobile-api` bearer
session. Native radio stream delivery uses a separate station-bound ticket
because `AVPlayer` must be able to open the long-lived stream URL without a
custom bearer header. Opaque IDs are used for genres, podcast subscriptions,
and radio stations. The server calls the existing Track-Key-protected
controller routes internally and returns sanitized DTOs; the iOS app never
calls those admin routes directly.

## Genres

Genres are derived from the catalog's genre tags, displayed in alphabetical
order with a right-side alpha rail, and open a filtered album browser. Album
cards retain the native Play and Add controls.

## Podcasts

The show browser follows the web controller's subscription model: grid/list
view, A–Z/Z–A sorting, RSS subscription, refresh, per-show auto-download, and
unsubscribe. Opening a show lists episodes with play, queue, download, and
delete actions. Home moOde can play or queue downloaded episodes; This
iPhone/iPad downloads the episode through the bearer media route before native
AVFoundation playback. The Home **Recent Podcasts** shelf adds a compact
flip face with **Play Newest** (insert the newest downloaded episode at the
front of Live Queue), **Load** (replace the queue with downloaded episodes in
oldest-to-newest order), and **Open** (the show page).

## Radio

The radio surface supports search, genre filtering, favorites-only and
high-quality filters, grid/list view, A–Z/Z–A sorting, station favorites,
quick play/add, multi-selection with replace/add queue actions, and saved
presets. With **Home moOde** selected, play/add uses the existing server-side
radio queue operations. With **This iPhone/iPad** selected, Play requests a
station-bound authorization and sends the server-proxied live stream directly
to the native AVFoundation player. The raw moOde station URL is never returned
to the app, and native radio does not alter the Home moOde queue. The Home
**Favorite Radio Stations** shelf adds **Play** (front-of-queue playback),
**Add** (append), and **Unfavorite** on its flip face; station IDs remain
opaque and are resolved by the server.

## Queue Wizard

Queue Wizard exposes the web controller's filter families—genres, artists,
albums, exclude genres, and playlists—along with max tracks, minimum rating,
variety/shuffle, replace/add, crop/keep-current, preview, apply, save-only
playlist, collage generation, and Vibe start. Preview returns sanitized
catalog tracks. Apply follows the selected output target: Home moOde uses the
server Queue Wizard/MPD queue, Alexa uses the shared server queue and Alexa
start bridge, and This iPhone/iPad installs the canonical tracks into the
native device Live Queue. Replace, add, crop/keep-current, shuffle, and play
therefore work consistently across output sources. Playlist and collage saves
remain server-side and do not mutate an unrelated playback queue.

## Layout parity

The native surfaces intentionally use the same compact dark panel language as
the controller web apps: toolbar actions, grid/list choices, selection rows,
quick action buttons, and drill-down panels. On iPad they render inside the
bounded right content panel, so the sidebar and now-playing card remain fixed
while the feature page replaces the prior content. On iPhone they are regular
library destinations in the existing navigation stack.

## Native target boundary

The mobile API carries canonical opaque IDs and leaves queue ownership to the
selected playback target. Home moOde uses the server/MPD queue, Alexa uses the
same server queue plus the existing Alexa bridge, and This iPhone/This iPad
uses the native canonical-track queue. Queue Wizard Apply, collection actions,
radio actions, and the Home shelf flip actions follow that same split. The
native client never receives Track Keys, raw MPD paths, podcast filesystem
paths, or Alexa credentials.

## Verification

- Node server suite: 94/94.
- Authenticated fixture probe: genres, genre albums, podcasts, episodes, radio,
  and Queue Wizard options all returned expected DTOs.
- Swift core tests: 30/30 in the current native checkout.
- Signed Xcode 27 device build and Pi5 route deployment succeeded for the
  current mobile shelf/API contract.

*Last reviewed: 2026-09-30 America/Chicago*
