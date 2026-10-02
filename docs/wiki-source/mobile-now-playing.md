# Mobile Home moOde Now Playing

This page defines the bearer-authenticated current-state contract used by the
native iPhone/iPad client. It keeps the controller-tablet `/now-playing`
truth surface authoritative without exposing its Track-Key/admin boundary to
the mobile app.

## Endpoint

```http
GET /v1/mobile/now-playing
Authorization: Bearer <mobile-session-token>
```

The route requires the existing `mobile-api` bearer scope. A Track Key alone
must receive HTTP 401. The native client never calls `/now-playing` directly.

## Response

```json
{
  "ok": true,
  "available": true,
  "title": "Example Track",
  "artist": "Example Artist",
  "album": "Example Album",
  "displayLine3": "Example Album",
  "artworkUrl": "https://host/v1/mobile/home/artwork/har_opaque",
  "state": "play",
  "isPlaying": true,
  "durationSec": 214.2,
  "elapsedSec": 35,
  "queueTrack": 3,
  "queueTotal": 171,
  "stationName": null,
  "stationLogoUrl": null,
  "isStream": false,
  "isPodcast": false,
  "isRadio": false,
  "isAirplay": false,
  "isUpnp": false,
  "isYoutube": false,
  "about": null,
  "aboutStatus": "no-data",
  "aboutProvider": null,
  "appleMusicUrl": null,
  "radioYear": null,
  "track": null,
  "isFavorite": true,
  "rating": 4,
  "ratingDisabled": false
}
```

`track` is the existing sanitized `MobileTrack` shape when the current queue
item belongs to the mobile catalog. It is null for streams or other items
that do not have a catalog identity. `available: false` is a valid empty or
temporarily unavailable state and is not an API error.

`queueTrack` and `queueTotal` describe the queue only when that information is
authoritative. During ordinary Home moOde playback, both fields identify the
current position and total MPD queue length. During fresh Alexa playback,
`queueTrack` is null because Alexa's AudioPlayer position is not an MPD
position, but `queueTotal` remains the full logical server queue length used by
Live Queue. If that queue read is temporarily unavailable, it falls back to
the known Alexa buffer count: one for the current item, or two when the
recorded ENQUEUE successor is present. The native iPad summary therefore shows
the full count without pretending to know an Alexa track position.

For a music-bearing radio stream, the ordinary `title`, `artist`, `album`, and
`artworkUrl` fields reflect the existing conservative server-side metadata
pipeline. That pipeline cleans station metadata, rejects likely talk/news/
sports content, and only promotes a verified iTunes/Apple Music match. When a
match exists, `radioYear` is populated when available and `appleMusicUrl`
contains the exact matched track URL (falling back to the matched album URL).
The mobile route only emits HTTPS URLs on Apple-controlled `music.apple.com`
or `itunes.apple.com` hosts; untrusted or non-Apple links become `null`.

For radio streams, `stationName` and `stationLogoUrl` identify the live
station independently of the current song. `artworkUrl` may therefore be
matched song artwork while `stationLogoUrl` remains the protected station
logo. The mobile route accepts the canonical station aliases
`stationName`, `radioStationName`, and `displayStationName`, preserving the
station identity even when the current payload has been replaced with a
matched iTunes title, artist, album, and artwork. Native clients should
present the station identity below the album metadata and must not substitute
song artwork for the station logo.

When the stream does not publish a station name, the canonical and mobile
routes resolve the current stream URL through the configured radio-logo alias
map before falling back to the stream host. This keeps stations such as Jazz24
visible even when iTunes supplies the current song and album metadata.

When editorial data is available, `about` contains the normalized server-owned
editorial object and `aboutStatus` is `available`; `aboutProvider` identifies
the provider without exposing provider credentials. An explicit non-available
status tells native clients not to show stale text. Older servers may omit the
status/provider siblings, in which case a non-empty `about.text` remains usable.

## Current-track controls

The native client may read and change favorite/rating state through the same
bearer-authenticated current-track contract. The mobile read is derived from
the canonical `/now-playing` snapshot, including its `isFavorite`, `rating`,
and `ratingDisabled` fields. Mutations resolve the file from that same
canonical snapshot (falling back to the current mobile queue item only when
the snapshot has no file), then pass it server-side to the existing file-aware
favorite/rating routes. The client never submits an MPD file path or
rating-file path.

```http
POST /v1/mobile/now-playing/favorite
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"favorite":true}
```

```http
POST /v1/mobile/now-playing/rating
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"rating":4}
```

The mutation routes reuse the existing server-side `/favorites/toggle` and
`/rating` behavior internally. Their responses contain only sanitized state:

```json
{"ok":true,"isFavorite":true,"disabled":false}
{"ok":true,"rating":4,"ratingDisabled":false,"disabled":false}
```

For radio/stream items, AirPlay, an unavailable current item, or a local item
that is not in the mobile catalog, the read returns `isFavorite: false`,
`rating: 0`, and `ratingDisabled: true`; the mutation routes return successful
no-op responses with `disabled: true`. A Track Key without a mobile bearer
session receives HTTP 401. The mobile response never passes through the
canonical `file` or `ratingFile` fields.

## Native device track favorites

When the iPhone or iPad is the playback target, the native client can read and
change favorite state for a canonical catalog track without controlling the
Home moOde queue:

```http
GET /v1/mobile/catalog/tracks/:trackId/favorite
Authorization: Bearer <mobile-session-token>

POST /v1/mobile/catalog/tracks/:trackId/favorite
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"favorite":true}
```

The server resolves the opaque canonical `trackId` to its catalog record and
keeps the source file private. It reuses the existing Favorites playlist
mutation internally and returns only `{ "ok": true, "isFavorite": true,
"disabled": false }`-style state. Stream, radio, podcast, and unavailable
items return a successful disabled response. The native client uses this
contract for the Like heart beside the device rating stars and applies the
same optimistic-update/rollback behavior.

## Direct device radio metadata

When the native client plays a station on the iPhone/iPad, it listens for the
stream's ICY/ID3 song metadata and submits the current song through:

```http
POST /v1/mobile/radio/metadata
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"stationId":"rad_opaque","artist":"Miles Davis","title":"Blue in Green"}
```

The server validates the station, runs the station-specific normalization
already used by Now Playing (including iHeart `StreamTitle` blobs), then
applies the same conservative radio guard and iTunes matcher used by
`/now-playing`. It returns protected matched artwork plus `title`, `artist`,
`album`, `year`, and a validated `appleMusicUrl`. When the canonical Now
Playing snapshot is the same radio song, it also returns its normalized
`about`, `aboutStatus`, and `aboutProvider` fields so direct native radio
playback receives the same editorial content as Home moOde/web playback. A
miss returns the normalized metadata with `matched: false`, so the native
player can still show the station's song title without presenting misleading
music artwork, links, or About text.

The canonical About fallback is attempted whenever the direct enrichment
response does not already contain About, including partial or timing-sensitive
Apple lookups. The server still requires the submitted song to match the
current canonical radio snapshot by verified Apple URL or normalized
artist/title/album before copying that editorial text.

For native track-change notifications, the corresponding radio playback event
is accepted by the shared history route but its APNs send is intentionally
deferred. Once this metadata response completes, the server sends one APNs
notification for the enriched song. The native UI continues to use protected
album artwork, while APNs receives the safe external artwork source because
the notification extension has no bearer session; unmatched streams use a
public station-art fallback. The validated Apple Music URL is included in the
APNs payload. This prevents a premature station-only alert and avoids a
duplicate notification for the same radio title.

### Silent Home moOde stream rows

Home moOde can briefly expose a radio queue row with only its stream URL while
the station logo is already available. The mobile queue adapter reuses the web
`/config/diagnostics/queue` resolver server-side in that case, filling the
station name, stream title, and protected station artwork without exposing the
MPD file or song ID. If canonical `/now-playing` reports the generic fallback
`Radio` / `Live Radio`, the bearer mobile snapshot prefers that resolved
current queue row. This keeps the Home moOde card and Live Queue row aligned
with the web queue during talk-radio streams such as 670 The Score.

When canonical `/now-playing` has a verified Apple Music/iTunes match for a
music-bearing radio stream, its matched `displayArtUrl` takes precedence over
the queue row's station-logo artwork. Unmatched radio content continues to use
the station logo, preserving conservative artwork behavior for talk, news, and
sports stations.

## Animated artwork lookup

The native client can ask the mobile API whether the existing Now Playing
animated-art cache has an H.264 loop for the current item:

```http
GET /v1/mobile/animated-art?artist=Artist&album=Album
Authorization: Bearer <mobile-session-token>
```

For a matched radio stream, the client sends the validated Apple Music URL
instead:

```http
GET /v1/mobile/animated-art?appleMusicUrl=https%3A%2F%2Fmusic.apple.com%2F...
Authorization: Bearer <mobile-session-token>
```

The server invokes the existing cache lookup internally and returns only:

```json
{"ok":true,"hasMotion":true,"mediaUrl":"https://host/config/library-health/animated-art/media/<opaque>.mp4"}
```

The iOS client never calls the Track-Key/admin lookup routes, sends no file
path or Track Key, and falls back to static artwork when `hasMotion` is false.
The returned media is either the server's opaque H.264 cache file or the
already-validated Apple-hosted MP4 URL from the existing matcher.

## Artwork and security

- Catalog-backed artwork uses `/v1/mobile/artwork/:trackId`.
- Rich moOde, AirPlay, station, and stream artwork is stored server-side
  behind an opaque `/v1/mobile/home/artwork/:artworkId` handle.
- The artwork handle route requires the same bearer session and proxies the
  image server-side.
- Radio station-list handles retain the stream source only on the server but
  use the catalog's canonical logo name through `/art/radio-logo.jpg?name=...`.
  This avoids a second SSH-backed stream-URL reverse lookup that can return
  404 for otherwise valid moOde logos, while preserving provider prefixes such
  as iHeart in the logo name even when the display station name is shortened.
  Queue/current-stream handles may still use the file-aware
  `/art/radio-logo.jpg?file=...` resolver for stream aliases.
- The response never includes a raw MPD file, MPD song ID, Track Key, local
  filesystem path, or Last.fm/provider credential.

## Native behavior

When Home moOde is selected, the iPhone/iPad polls this route and uses it for
the now-playing card and full Now Playing pane. Poll errors retain the last
successful card so a brief network failure does not look like playback
stopped. A verified radio match adds an external-link icon that opens the
Apple Music universal link; no icon is shown for misses or non-music radio.

The favorite heart and rating controls use the `isFavorite`, `rating`, and
`ratingDisabled` fields from this same polling response and the two mutation
routes above. They must remain hidden or disabled when `ratingDisabled` is
true, and must not attempt to target the home MPD queue directly.

Native artwork keeps the last successful image visible while a track-specific
artwork URL is fetched. Same-album transitions are album-scoped for animated
artwork lookup and do not reset the existing cover/action face merely because
the next track has a different canonical artwork URL.

## Native Home summary shelf

The iPad Home summary shelf uses the following bearer-authenticated contracts:

```http
GET /v1/mobile/next-up
Authorization: Bearer <mobile-session-token>

GET /v1/mobile/audio-info
Authorization: Bearer <mobile-session-token>
```

`/v1/mobile/next-up` returns the web controller's target-aware successor. The
iPad presents it as **Next Playing** and opens the shared Live Queue when
tapped. The shelf also shows the current queue position/length from the
now-playing payload or the durable device queue.

When Live Queue is selected as a Home discovery row, the native remote poll
also reads the complete upcoming queue and reconciles that row. This covers
queue additions made by another controller; local playback uses the device
queue directly.

`/v1/mobile/audio-info` invokes the existing Track-Key-protected moOde reader
server-side and returns only sanitized `section`, `key`, and `value` rows plus
an optional fetch timestamp. It never exposes the moOde source URL, Track Key,
MPD file path, or raw admin response to the native client.

## Local audio source/cache

The server catalog and queue remain authoritative when the native client plays
to This iPhone/iPad. The attached SSD and Application Support store are byte
sources below the normal canonical `MobileTrack` flow; they are not additional
catalogs, queues, playlists, or track identities.

The client obtains an authenticated availability manifest:

```http
GET /v1/mobile/local-source/manifest
Authorization: Bearer <mobile-session-token>
```

The response maps canonical track IDs to library-relative paths and integrity
evidence. The client validates the attached file and otherwise uses the normal
media authorization endpoint. SSD disconnect, absent files, stale size entries,
and reconnect are cache misses/recovery, not library or playback mode changes.

Native device playback reports progress through the same bearer session:

```http
POST /v1/mobile/playback/events
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"trackId":"trk_...","sessionId":"device-session","state":"progress","elapsedSec":78,"durationSec":214}
```

The server resolves the track ID and feeds the shared listening-history
qualification/idempotency path. The client never submits a filesystem path,
synthetic SSD ID, or alternate queue identity.

Native podcast playback is the feature-specific exception to the catalog ID
shape: the client uses an opaque `podcast-...` episode identity for its local
device queue, and the bearer route resolves that identity to the downloaded
episode's server-owned MPD path and metadata before recording history or
invoking the native APNs bridge. This keeps podcast paths out of the client
while allowing podcast starts to receive the same track-change notification
behavior as music.

*Last reviewed: 2026-10-02 16:55 America/Chicago*
