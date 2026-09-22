---
title: radio interface
page_type: child
topics:
  - integration
  - metadata
  - playback
confidence: high
---

# Radio Interface

The Radio feature browses stations, manages favorites, and sends selected
stations to moOde. It is separate from the radio metadata evaluation console:
the former is a user playback feature, while the latter is an operator QA
surface.

## Common actions

- filter/search stations by genre or text;
- show favorites only;
- select stations in bulk;
- append, replace, or crop the queue;
- quick-play or quick-add a station; and
- save/reuse station groups or presets where enabled.

## Metadata and artwork

Radio metadata is intentionally conservative. Talk, news, and sports streams
should not be sent through music-style album enrichment merely because a
metadata string happens to resemble a song. Station-logo resolution,
holdback, cleanup, and enrichment decisions are covered by
[radio-metadata-eval-interface.md](radio-metadata-eval-interface.md) and the
playback troubleshooting branch.

## Related pages

- [using-now-playing.md](using-now-playing.md)
- [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)
- [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)

*Last reviewed: 2026-09-22 America/Chicago*
