# About metadata (Phase 1)

Sonuvi can optionally expose normalized editorial information for the current
track through the server's canonical Now Playing payload. This is a server
capability only; the Now Playing card and its personnel flip behavior are not
changed by Phase 1.

## Provider and identity

The existing public iTunes Search/Lookup path remains the identity and artwork
matcher. It supplies an already-accepted Apple track or album URL. When
MusicKit credentials are configured, Sonuvi follows that accepted
catalog identity through the Apple Music Catalog API and reads editorial notes.
Sonuvi does not scrape Apple Music web pages and does not perform a second
fuzzy match for editorial text.

Track editorial notes are preferred. If the matched track has no editorial
notes, the related album is checked. Ambiguous or missing iTunes matches
produce no About object.

## Configuration

The normal production configuration is a protected Media Services key:

```text
APPLE_MUSIC_KEY_ID=<Media Services key ID>
APPLE_MUSIC_TEAM_ID=<Apple Developer Team ID>
APPLE_MUSIC_PRIVATE_KEY_PATH=/etc/now-playing/AuthKey_<MUSIC_KEY_ID>.p8
APPLE_MUSIC_COUNTRY=us                 # optional; defaults to us
APPLE_MUSIC_TIMEOUT_MS=1200             # optional request budget
```

Sonuvi generates the ES256 developer token in memory, caches it, and refreshes
it before expiration. It never persists the generated JWT or returns it in API
payloads, logs, or client configuration. `APPLE_MUSIC_DEVELOPER_TOKEN` remains
an optional manual development/testing fallback only. Existing iTunes matching
continues to work without MusicKit credentials.

Apple Music Catalog access and APNs are independent services. The APNs
`AuthKey_*.p8`, `APNS_KEY_ID`, and APNs configuration are not reused or
modified for Apple Music. Sonuvi only reuses the existing APNs ES256 signing
implementation pattern; Apple Music uses its separately provisioned Media
Services key.

## Normalized payload

When editorial material is available, `/now-playing` includes:

```json
{
  "about": {
    "type": "track",
    "text": "…",
    "shortText": "…",
    "tagline": "…",
    "source": "apple",
    "sourceId": "123456789",
    "match": { "confidence": "strong" }
  }
}
```

`type` is `track` or `album`. The mobile Now Playing DTO exposes the same
sanitized object. Raw Apple responses and provider credentials remain
server-side. A track transition builds a fresh payload, so a previous track's
About text cannot persist into the next track.

## Caching and failure behavior

Successful results are cached in memory for 30 days and no-editorial results
for 12 hours. Cache keys include the accepted Apple identity and Sonuvi
identity. Provider failures, malformed responses, timeouts, rate limits, and
ambiguous matches return no About metadata and do not affect playback or the
rest of Now Playing.

## Attribution and Phase 2

Any client presentation of Apple editorial content must follow the current
[Apple Music API documentation](https://developer.apple.com/documentation/applemusicapi),
including its Apple Music API badge/attribution guidance, and the applicable
[Apple media terms](https://www.apple.com/legal/internet-services/itunes/us/terms.html).
Phase 2 must review those requirements before displaying the text, including
any required Apple Music attribution or link treatment. This server phase
intentionally does not add UI presentation.
