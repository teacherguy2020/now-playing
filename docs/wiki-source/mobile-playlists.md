---
title: Mobile Playlist API
page_type: reference
topics:
  - api
  - ios
  - security
confidence: high
---

# Mobile Playlist API

The mobile playlist API is the bearer-authenticated playlist contract used by
the paired native client. It lets the app browse ordered playlists and use the
scoped Add to Playlist action without receiving the Track Key, raw MPD paths,
or access to the browser/admin queue routes.

## Routes

Every route below requires:

```http
Authorization: Bearer <mobile-session-token>
```

The token must have the `mobile-api` scope and is issued by the existing
pairing or temporary enrollment flow. A Track Key header by itself is not a
mobile authorization.

### List playlists

```http
GET /v1/mobile/playlists?limit=50&offset=0
```

Response:

```json
{
  "ok": true,
  "offset": 0,
  "limit": 50,
  "total": 1,
  "count": 1,
  "nextCursor": null,
  "items": [
    {
      "id": "pl_opaque_id",
      "name": "Road Trip",
      "trackCount": 24,
      "revision": "rev_opaque_revision",
      "updatedAt": null,
      "artworkUrl": null
    }
  ]
}
```

`limit` is bounded by the common mobile API page limit. Playlist IDs and
revisions are HMAC-backed opaque values derived from the server-side playlist
identity and ordered membership. The client must send the ID, never the
display name or an MPD path.

`artworkUrl` points to the bearer-protected
`/v1/mobile/playlists/:playlistId/artwork` route. The server resolves the
opaque playlist ID, finds the existing custom moOde playlist cover/collage,
and proxies that image without returning the moOde URL or filesystem path to
the client. It does not substitute the first track's album art. `updatedAt`
remains `null` when the MPD playlist provider has no safe timestamp.

The ordinary playlist list intentionally excludes podcast playlists. This uses
the same classification as the working web Queue Wizard controller: a name
containing `podcast` is excluded, and a playlist whose entries are all under a
`podcast`/`podcasts` path is also excluded. Podcast shows and episodes belong
to the separate Podcasts surface rather than this music-playlist contract.

### Fetch ordered entries

```http
GET /v1/mobile/playlists/pl_opaque_id
```

Response:

```json
{
  "ok": true,
  "playlist": {
    "id": "pl_opaque_id",
    "name": "Road Trip",
    "trackCount": 2,
    "revision": "rev_opaque_revision",
    "updatedAt": null,
    "artworkUrl": null
  },
  "entries": [
    {
      "position": 1,
      "available": true,
      "track": {
        "id": "trk_opaque_id",
        "title": "Example Track",
        "artist": "Example Artist",
        "albumArtist": "Example Artist",
        "album": "Example Album",
        "albumId": "alb_opaque_id",
        "artistId": "art_opaque_id",
        "trackNumber": 1,
        "genre": "",
        "durationSec": 214.2,
        "format": "flac",
        "musicBrainz": {
          "trackId": "",
          "albumId": "",
          "artistId": ""
        },
        "availability": { "remote": true, "local": false },
        "artworkUrl": "https://host/v1/mobile/artwork/trk_opaque_id"
      },
      "unavailableReason": null
    }
  ]
}
```

Entries are not deduplicated. Repeated playlist references retain their
positions and point to the same opaque catalog track when resolvable. An entry
that is not present in the server’s mobile catalog is returned with
`available: false`, `track: null`, and a generic reason. Its raw server value
is never included in the response.

## Server-side resolution

The route registration receives a server-only `getMobilePlaylists` provider.
The current provider reads playlist names and ordered `%file%` values through
`mpc` on the Now Playing host. Those values remain inside the server process.
The route then resolves each value through the existing
`buildMobileCatalog()` identity map (`catalog.byFile`) and serializes the
existing `publicMobileTrack()` shape. Swift does not reproduce MPD parsing,
playlist identity, metadata normalization, or duplicate-edition handling.

The browser routes remain separate:

- `/config/queue-wizard/playlists` requires the Track Key;
- `/config/queue-wizard/playlist-preview` exposes raw MPD file values;
- `/config/queue-wizard/load-playlist` mutates the home MPD queue.

The native client must not call those routes. Playlist browsing and playback
remain opaque-ID based; the scoped write path used by native action pickers is
instead:

```http
POST /v1/mobile/queue-wizard/add-to-playlist
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"playlistName":"Road Trip","trackIds":["trk_opaque_id"]}
```

The server resolves every track ID before forwarding the write to the existing
playlist service. A user-created playlist name is allowed by the same route;
the response returns only the sanitized playlist name and count added. This
keeps the native picker useful without exposing playlist files or allowing
arbitrary MPD paths.

### Playlist cover artwork

Playlist covers are the custom images generated and stored by Now Playing's
moOde playlist-cover workflow. The mobile list and detail DTOs use the same
opaque playlist artwork URL, so the collage is also used by Quick Search,
playlist pages, and configured home/recent rows. If no stored cover exists,
the route returns an unavailable image response and the native UI shows its
normal artwork placeholder; it silently falls back to neither a raw path nor
the first track's art.

## Shared mobile API security pattern

Mobile-safe Genres, Queue Wizard, Radio, Podcasts, favorites, and ratings
routes follow the same rules:

1. Require a verified `mobile-api` bearer session before resolving resources.
2. Accept opaque IDs and validated JSON, not raw MPD commands or filesystem
   paths.
3. Reuse server-side library/domain logic and return sanitized public models.
4. Define playback target and authorization scope explicitly for every mutating
   capability. The current Genres, Queue Wizard, Radio, and Podcasts surfaces
   document that target split in
   [Native Mobile Feature Surfaces](mobile-feature-surfaces.md).
5. Keep Track-Key/admin routes and server secrets outside the native client.

## Verification

Server tests cover:

- missing, malformed, or Track-Key-only authorization is rejected with HTTP
  401;
- valid bearer sessions can list and open playlists;
- raw playlist names are not accepted as detail identifiers;
- opaque playlist IDs and revisions are returned;
- entry order and duplicate occurrences are preserved;
- unavailable entries are explicit without leaking their source value; and
- unknown opaque IDs return HTTP 404 after bearer authentication.

The focused mobile API/pairing tests and the full Node test suite pass in the
development checkout.

*Last reviewed: 2026-09-30 America/Chicago*
