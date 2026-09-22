---
title: using now playing
page_type: hub
topics:
  - controller
  - playback
  - queue
  - library
confidence: high
---

# Using Now Playing

This is the user-facing map of the system. Start here when the question is
“how do I use this feature?” rather than “which file owns this behavior?”

For the conceptual split between playback authority, queue control, display
shells, and integration ownership, see [Core Concepts](core-concepts.md).

## Main surfaces

- **Dashboard** — `app.html`, the broad browser shell with hero transport,
  queue, tabs, and embedded feature pages.
- **Controllers** — `controller.html`, `controller-tablet.html`, and
  `controller-mobile.html` for direct playback, queue, browse, and display
  control.
- **Now Playing displays** — `index.html`, player, Peppy, and display-router
  surfaces for room-facing playback state.
- **Kiosk** — a presentation and browsing mode described in
  [kiosk-interface.md](kiosk-interface.md).

See [user-interfaces.md](user-interfaces.md) for the complete surface map and
device-specific behavior.

## Playback and queue

- Transport, mode authority, and visible playback truth →
  [playback-features.md](playback-features.md) and
  [playback-authority-by-mode.md](playback-authority-by-mode.md)
- Inspect and directly manipulate the current queue →
  [controller-queue-interface.md](controller-queue-interface.md)
- Preview and shape a future queue →
  [queue-wizard-internals.md](queue-wizard-internals.md)
- Understand the queue/control distinction →
  [queue-interface-vs-queue-wizard.md](queue-interface-vs-queue-wizard.md)
- Build a Last.fm/Vibe queue → [config-lastfm-and-scrobbling.md](config-lastfm-and-scrobbling.md)
- Listen through the browser device → [listen-on-device.md](listen-on-device.md)

## Library and content features

- Browse albums, artists, genres, playlists, and radio →
  [media-library.md](media-library.md)
- Repair and audit library metadata/art →
  [library-health-interface.md](library-health-interface.md)
- Radio stations and metadata behavior → [radio-interface.md](radio-interface.md)
- Podcasts and episode downloads → [podcasts-interface.md](podcasts-interface.md)
- YouTube search, resolution, and queueing → [youtube-interface.md](youtube-interface.md)
- Ratings and favorites → [config-ratings.md](config-ratings.md)
- Themes and visual customization → [theme-interface.md](theme-interface.md)

## Voice and external control

- Alexa voice commands and corrections → [alexa-interface.md](alexa-interface.md)
- Mabel/Multiphone boundary → [mabel-integration.md](mabel-integration.md)
- Seeburg, Multiphone, and Mills behavior → [integrations.md](integrations.md)

## Installed web apps

The iPhone/iPad and controller surfaces can be saved to the Home Screen with
distinct app identities and icons. The tablet app uses opaque `black`
status-bar treatment with `viewport-fit=cover`; the earlier translucent mode
caused an iPadOS top-edge vignette. Client-local settings include Screen Wake
Lock, MediaSession metadata, and Listen on Device preferences. See
[tablet-interface.md](tablet-interface.md) and
[controller-tablet-anatomy.md](controller-tablet-anatomy.md).

## Next step

If the visible behavior is wrong, classify the playback mode before assuming
the UI is the owner. [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
contains the mode-specific authority and art/metadata checks.

*Last reviewed: 2026-09-22 America/Chicago*
