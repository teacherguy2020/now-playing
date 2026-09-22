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

## Related pages

- [using-now-playing.md](using-now-playing.md)
- [config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md)
- [media-library.md](media-library.md)
- [configuration-and-administration.md](configuration-and-administration.md)

*Last reviewed: 2026-09-22 America/Chicago*
