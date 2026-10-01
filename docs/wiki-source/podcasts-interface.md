---
title: podcasts interface
page_type: child
topics:
  - integration
  - library
  - playback
confidence: high
---

# Podcasts Interface

The Podcasts feature manages RSS subscriptions and local episode files. It
combines a user-facing subscription/episode workflow with configuration and
storage administration.

## User workflow

1. Add a podcast by RSS URL.
2. Refresh feeds.
3. Set per-show auto-download behavior and batch limits.
4. Open a subscription to play, queue, download, or delete episodes.
5. Use retention settings to keep local storage bounded.

## Administration boundary

Podcast roots, nightly cleanup, path mapping, and automation belong with
[config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md).
Episode parsing, local indexes, playlists, artwork, and now-playing
enrichment are implementation concerns documented there and in the API/source
maps.

The native iPhone/iPad controller mirrors the same subscription and episode
workflow through bearer-authenticated mobile routes. See
[Native Mobile Feature Surfaces](mobile-feature-surfaces.md) for the safe DTO
and playback-target split. The Home **Recent Podcasts** shelf uses an opaque
subscription ID and a flip face with **Play Newest** (front of queue), **Load**
(replace with downloaded episodes oldest-to-newest), and **Open**. These
actions are backed by the mobile podcast routes and never expose the podcast
media path to the app.

## Related pages

- [using-now-playing.md](using-now-playing.md)
- [config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md)
- [media-library.md](media-library.md)
- [configuration-and-administration.md](configuration-and-administration.md)

*Last reviewed: 2026-09-30 America/Chicago*
