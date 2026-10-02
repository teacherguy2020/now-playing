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

### Shared server metadata contract

The server-side normalization boundary is
`src/lib/radio-metadata.mjs` (`RADIO_METADATA_CONTRACT_VERSION` 1). It is
shared by canonical `/now-playing` processing and
`POST /v1/mobile/radio/metadata`; it returns the raw source fields, normalized
artist/title/album, explicit station profile, classification, confidence,
reason codes, conservative lookup decision, classical composer/work/program
and personnel fields, and source artwork hints. Current profiles include
WFMT/classical, Davide/MIMIC, and generic fallback, with aliases kept in one
profile table rather than route-specific URL tests.

Provider enrichment remains behind the existing Apple/iTunes/About safety
gates. Canonical web payloads expose the contract summary as
`radioMetadataContract`; mobile responses expose compatible `radioProfile`,
`radioClassification`, `radioConfidence`, `radioReasonCodes`, and
`radioLookup` fields while preserving the existing match/artwork/link/About
fields. Sponsor/ad and talk/news/sports classifications suppress music lookup
without changing the canonical Sponsor Ad versus native/mobile projection
distinction. Artwork sent to APNs remains an external safe reference, never a
bearer-only URL.

The browser radio helper now treats the server result as authoritative when
present. Its remaining logic is presentation de-jitter and compatibility
fallback for older or incomplete responses, not a second metadata parser.

The native iPhone/iPad controller uses a bearer-authenticated radio surface
with the same search, genre, favorites, bulk queue, and preset concepts. Its
server boundary and Home moOde target behavior are documented in
[Native Mobile Feature Surfaces](mobile-feature-surfaces.md).

Home-moOde Sonuvi on iPhone/iPad consumes the same conservative radio
metadata result as the web controller: matched title, artist, album/artwork,
and year are passed through the bearer `/v1/mobile/now-playing` contract. A
validated Apple Music/iTunes track or album URL is exposed as
`appleMusicUrl`; the native UI presents the link only for that verified match.
Talk/news/sports misses retain station presentation and do not receive a
misleading music link.

When a station is played directly on the iPhone/iPad, `AVPlayer` receives the
server-proxied stream with ICY metadata enabled. The native client submits
each new song title to `POST /v1/mobile/radio/metadata`; the server first
reuses the existing station-specific normalization (for example, iHeart's
embedded `text="..."`/`TPID` blob), then applies the same conservative iTunes
lookup. The native now-playing surface replaces station artwork with verified
track artwork and shows the Apple Music link only when the match is accepted.
Streams with no usable metadata remain station-level, and talk/news/sports
metadata is not enriched.

The Home **Favorite Radio Stations** shelf exposes a native flip face with
**Play** (move to the front of the queue), **Add** (append), and **Unfavorite**.
The row carries an opaque station ID; the server resolves it before any MPD or
stream operation. Direct native radio playback uses the separate station-bound
stream ticket and does not mutate the Home moOde queue.

## Related pages

- [using-now-playing.md](using-now-playing.md)
- [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)
- [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)

*Last reviewed: 2026-10-02 America/Chicago*
