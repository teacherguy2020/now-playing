---
title: Mobile Live Queue
page_type: reference
topics:
  - api
  - ios
  - queue
  - security
confidence: high
---

# Mobile Live Queue

The mobile Live Queue is target-owned. Home moOde and Alexa use the
bearer-authenticated server/MPD queue used by the working web controllers,
while This iPhone/iPad uses a canonical native device queue. The device queue
is a playback queue, not a second catalog, and its track snapshot persists
across force quit.

## Web behavior being mirrored

The authoritative references are:

- `controller-queue.html`
- `docs/wiki-source/controller-queue-interface.md`
- `docs/wiki-source/queue-interface-vs-queue-wizard.md`
- `docs/wiki-source/queue-and-playback-model.md`

The web queue provides current-position display, row deletion, drag/reorder,
crop, clear, shuffle, Vibe, Endless Vibe, save-to-playlist, and playlist/Vibe
actions on eligible rows. Queue Wizard remains a separate queue-shaping
surface; it is not interchangeable with Live Queue. Its preview is shared
across targets, while Apply writes to the active target's queue: the server
MPD queue for Home moOde/Alexa or the native device Live Queue for This
iPhone/iPad.

## Mobile-safe contract

Every route requires the existing `Authorization: Bearer` mobile session with
the `mobile-api` scope. The native app does not send a Track Key to these
routes and does not call raw `/mpd/*` or `/config/*` queue endpoints.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/v1/mobile/queue` | Read current MPD queue and state |
| GET | `/v1/mobile/next-up` | Read the target-aware single Next Up item |
| POST | `/v1/mobile/now-playing/control` | Home moOde transport: play, pause, stop, next, previous, repeat/repeatMode, and bounded seek |
| POST | `/v1/mobile/queue/items/:queueItemId/play` | Play one queue item on home moOde |
| POST | `/v1/mobile/queue/items/:queueItemId/vibe` | Start a seeded Vibe from one eligible local queue item |
| POST | `/v1/mobile/queue-wizard/vibe` | Start a seeded Vibe from a canonical `trackId` |
| POST | `/v1/mobile/vibe/preview` | Return non-mutating native-device Vibe recommendations from a canonical `trackId` |
| GET | `/v1/mobile/vibe/jobs/:jobId` | Read sanitized progress for a mobile-started Vibe job |
| DELETE | `/v1/mobile/queue/items/:queueItemId` | Remove one item |
| POST | `/v1/mobile/queue/items/:queueItemId/delete-below` | Keep the selected item and remove every later Home moOde queue item |
| POST | `/v1/mobile/queue/items/:queueItemId/move` | Move one item to a 1-based position |
| POST | `/v1/mobile/queue/actions` | `shuffle`, `shufflequeue`, `undoshuffle`, `crop`, `clear`, or `vibe` |
| GET | `/v1/mobile/endless-vibe` | Read the shared Endless Vibe setting and safe job state |
| POST | `/v1/mobile/endless-vibe` | Enable or disable the shared Endless Vibe setting |

The mobile `crop` action reuses the web controller's reliable diagnostics
playback path rather than issuing raw MPD `crop` directly. If the queue still
has items but MPD has no current song, that path keeps the queue head instead
of returning the raw MPD rejection seen after a stop or Alexa handoff.

The Alexa transport Shuffle action uses `shufflequeue`, which delegates to the
web physical upcoming-only shuffle path. It keeps the current/played prefix
fixed, disables MPD random mode, and returns the reordered queue so Alexa's
next-track order and the native Live Queue display remain aligned. The ordinary
`shuffle` action is the same physical queue operation; it is retained as the
normal mobile/action name, while `shufflequeue` remains a compatibility alias.

The `undoshuffle` action restores the last physical upcoming-only shuffle
through the same guarded diagnostics path:

```http
POST /v1/mobile/queue/actions
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"action":"undoshuffle"}
```

It is a one-level, process-local undo. A queue reorder or addition invalidates
the snapshot; compatible deletions are reconciled. The response returns the
sanitized refreshed queue and `undoAvailable`. Qobuz ownership is checked by
the existing Home playback guard; the route never releases or takes over a
Qobuz session.

Queue item IDs are opaque, signed handles for a current queue snapshot. MPD
song IDs, positions used internally, file names, filesystem paths, and secrets
are resolved and stripped on the server. A client must refresh the queue after
each mutation because positions and opaque handles can change.

`POST /v1/mobile/queue/items/:queueItemId/delete-below` resolves the opaque
handle against a fresh queue snapshot, keeps that item, and issues the MPD
range delete beginning at the selected item's zero-based successor position.
The selected item is therefore retained and a selected last item is a
successful no-op. A stale or unknown handle returns `404` without mutation.
If the current item would be removed, the server returns `409` without
mutation so playback and position are preserved. Sending `target: "alexa"`
is explicitly rejected with `409`: Alexa's enqueue/stream state is not a
safe alias for this Home MPD range mutation. This action never changes the
native This iPhone/This iPad queue.

The response includes safe display fields only:

```json
{
  "id": "que_opaque_id",
  "position": 3,
  "isCurrent": false,
  "title": "Example Track",
  "artist": "Example Artist",
  "album": "Example Album",
  "isStream": false,
  "isPodcast": false,
  "rating": 0,
  "ratingDisabled": false,
  "isFavorite": true,
  "favoriteDisabled": false,
  "artworkUrl": "https://host/v1/mobile/artwork/trk_opaque_id"
}
```

## Queue paging and revision metadata

`GET /v1/mobile/queue` preserves the legacy full response when neither
`offset` nor `limit` is supplied. In that form the complete queue remains
current-item-first, as existing clients expect. Browser clients may request a
bounded, zero-based ordered window:

```http
GET /v1/mobile/queue?offset=50&limit=50
Authorization: Bearer <mobile-session-token>
```

If either parameter is present, a missing `offset` defaults to `0` and a
missing `limit` defaults to `50`. `limit` is bounded to `1..100` and `offset`
to `0..1000000`; invalid values return `400`
`MOBILE_QUEUE_PAGING_INVALID_REQUEST`. A paged response returns items in
ascending queue position and includes authoritative window metadata:

```json
{
  "offset": 50,
  "limit": 50,
  "count": 50,
  "total": 172,
  "headPos": 53,
  "currentPosition": 53,
  "revision": "qrev_opaque",
  "fingerprint": "qrev_opaque",
  "hasMoreBefore": true,
  "hasMoreAfter": true,
  "items": []
}
```

`count` is the number of items in this response window; `total` is the
authoritative queue length. `headPos` and `currentPosition` are the current
one-based MPD queue position, or `null` when unavailable. `revision` and
`fingerprint` are opaque stable values for the ordered queue contents; a queue
content/order change produces a new value so clients can invalidate cached
pages. Paged reads are read-only and retain the same bearer authorization and
sanitized item boundary as the full response.

## Explicit canonical Vibe seed

The bearer mobile Queue Wizard adapter accepts an explicit canonical catalog
seed without exposing the web/admin Vibe route:

```http
POST /v1/mobile/queue-wizard/vibe
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"trackId":"trk_opaque_id","targetQueue":12,"playNow":true,"keepPlaying":true}
```

`trackId` is resolved against the current Server catalog. The Server derives
the artist/title seed and invokes the existing Queue Wizard seeded builder,
preserving its queue-size, play-now, and keep-playing semantics. The accepted
response is sanitized:

```json
{"ok":true,"accepted":true,"jobId":"vibe_job_opaque","trackId":"trk_opaque_id","targetQueue":12}
```

`targetQueue` must be an integer from 1 through 200. The client cannot submit
artist/title text, a file path, an MPD ID, a renderer URL, or a Track Key.
The no-`trackId` form remains as a compatibility adapter for older mobile
callers that seed from the current Home track; new native migration work must
use the canonical-ID form.

## Native-device Vibe preview

Native-device Vibe recommendations use a separate non-mutating contract. This
is not the Home Queue Wizard job endpoint above:

```http
POST /v1/mobile/vibe/preview
Authorization: Bearer <mobile-session-token>
Content-Type: application/json

{"trackId":"trk_opaque_id","targetQueue":12}
```

The Server resolves the canonical `trackId`, derives the seed internally, and
reuses the existing Vibe engine's dry-run path. The successful response is
`200` and contains only canonical mobile track identities and safe metadata:

```json
{
  "ok": true,
  "kind": "native-device-vibe-preview",
  "trackId": "trk_opaque_id",
  "targetQueue": 12,
  "count": 2,
  "unresolvedCount": 0,
  "tracks": [
    {"id":"trk_recommendation_1","title":"Example","artist":"Example Artist"},
    {"id":"trk_recommendation_2","title":"Another","artist":"Another Artist"}
  ]
}
```

Recommendation rows are mapped to the canonical catalog by their exact
server-side library-file identity. The endpoint never falls back to an
ambiguous title/artist match and never returns the file path. Unmapped rows
are omitted and counted in `unresolvedCount`; if no returned row resolves to a
canonical track, the response is `422` with
`MOBILE_VIBE_PREVIEW_UNRESOLVED`. Invalid fields or bounds return `400`
`MOBILE_VIBE_PREVIEW_INVALID_REQUEST`, an unknown seed returns `404`
`MOBILE_TRACK_NOT_FOUND`, an ineligible stream/track returns `400`
`MOBILE_VIBE_INELIGIBLE_TRACK`, and an engine timeout returns `504`
`MOBILE_VIBE_PREVIEW_TIMEOUT`. Other engine failures return sanitized `502`
`MOBILE_VIBE_PREVIEW_FAILED`.

This preview does not create a Queue Wizard job, mutate the Home MPD queue,
start Home playback, alter saved queues or physical shuffle state, release or
take over Qobuz Connect, or take over UPnP. The mobile caller never sends a
Track Key; the internal dry-run bridge remains server-only. `catalogBuiltAt`
is the current catalog timestamp or `null`. Each `tracks` entry uses the
existing safe mobile-track shape (`id`, `title`, `artist`, `albumArtist`,
`album`, `albumId`, `artistId`, `trackNumber`, `genre`, `durationSec`,
`format`, `musicBrainz`, `availability`, and bearer-protected `artworkUrl`,
with optional `sourceAudio`).
## Next Up parity

The native iPhone and CarPlay surfaces use `/v1/mobile/next-up` for the single
compact successor shown beside the player. The iPad uses the same target-aware
contract in a summary shelf at the top of Home, alongside queue position and
the bearer-safe Audio Info action. Its authority intentionally matches the web
controller:

- Normal Home moOde playback reads the actual MPD successor exposed by the
  web `/next-up` route, including MPD shuffle/repeat decisions.
- Alexa Mode does **not** reuse the ordinary MPD successor. It reads the
  Alexa enqueue successor/queue-head behavior exposed by `/alexa/next-up`,
  falling back to the current queue head when Alexa has not recorded a
  successor yet.
- This iPhone/iPad derives Next Up from the current native device queue,
  including the device's repeat setting and the physically reordered upcoming
  queue after a native shuffle.

The route converts catalog-backed rows to canonical `MobileTrack` data and
bearer-protected artwork URLs. Stream/unsupported rows may remain display-only
and never expose MPD file paths or Alexa credentials. Tapping the iPhone row
opens the full player/Live Queue; CarPlay uses the platform's official
**Next Up** button to open the Live Queue list; the iPad Home **Next Playing**
summary shelf opens the same shared Live Queue destination.

Radio successors are deliberately station-only on this contract. The route
does not promote stale ICY/MPD song fields from a queued stream into **Next
Up**; it returns the resolved station name as `title`, clears `artist` and
`album`, and uses the station logo for `artworkUrl`. The current matched song
continues to appear in the Now Playing card, where its verified song artwork
and metadata belong.

The native Home Live Queue shelf reuses the same full queue authority after
initial load. Remote polling replaces only that shelf row when the server queue
changes, and local playback derives it from the persisted device queue.

## Qobuz Connect live queue semantics

Qobuz Connect is a separate remote playback target exposed through the
bearer-authenticated `/v1/mobile/qobuz-connect/queue` contract. Its
`currentIndex` addresses the current queue together with `upcoming`; the
`history` array is recent-first playback context and may include entries
retained from before a queue replacement. Therefore `history.count` may be
greater than `currentIndex` and is not a valid reason to discard the current
queue projection or report that PiBuZ ownership is unavailable.

Saved Qobuz queues use the same mobile session and are server-owned. List and
detail are available without an active Connect session; capture requires a
fresh `confirmed-active` ownership proof and a stable cursor; play requires
explicit confirmation and status-only polling through the typed operation
route. The server preserves ordered occurrences and duplicate positions.

The current Qobuz control and handoff contract is:

| Method | Route | Required optimistic/confirmation data |
| --- | --- | --- |
| GET | `/v1/mobile/qobuz-connect` or `/queue` | bearer session; snapshot/queue is read-only and source-aware |
| POST | `/v1/mobile/qobuz-connect/{play,resume,pause,next,previous}` | `qobuzTrackId` for the current track where required; the server rejects stale or unconfirmed ownership |
| POST | `/v1/mobile/qobuz-connect/seek` | current `qobuzTrackId` and `positionSec` |
| POST | `/v1/mobile/qobuz-connect/queue/jump` | `index`, `targetQobuzTrackId`, `queueFingerprint`, expected current index/count, and `shuffle: false` |
| POST | `/v1/mobile/qobuz-connect/release` | no Qobuz credential; returns success only after inactive ownership and receiver readiness are confirmed |

The mobile app must not infer Qobuz identity from title, artwork, or a local
path. `queueFingerprint` is an opaque compare-and-swap token, not a track or
catalog identity. A failed or unconfirmed release must stop a Home mutation
from racing the remote receiver.

Each catalog-backed local track receives its authoritative MPD sticker rating
through `rating` (`0..5`) and `ratingDisabled: false`. The reader is the same
server-side `getRatingForFile()` path used by the web diagnostics queue. An
unrated local track therefore returns `rating: 0` while keeping the stars
enabled. Streams, YouTube, podcasts, unsupported items, and queues where the
ratings feature is disabled return `rating: 0` and `ratingDisabled: true`.
The mobile route never calls `/rating/current`, never derives the value from
catalog metadata, and never exposes a file path or MPD song ID.

Catalog-backed local tracks also receive `isFavorite` and
`favoriteDisabled` from the same server-side Favorites playlist reader. The
native client renders the heart and five-star row directly below the queue
track title and writes changes through the bearer catalog-track favorite and
rating routes. Streams, YouTube, podcasts, unsupported items, and unavailable
favorite readers return `isFavorite: false` and `favoriteDisabled: true`.

## Artwork

Queue artwork comes from the Now Playing artwork resolver/cache, not moOde's
`coverart.php` or filesystem paths. For local catalog tracks the queue item
uses the same bearer-protected `/v1/mobile/artwork/:trackId` route used by
albums, artists, playlists, and playback metadata. Radio/stream rows use the
server's station-logo fallback. Radio rows also collapse `title` to the
station name and leave `artist`/`album` empty so a previous stream song cannot
appear as the queued station. The native app passes the bearer token when it
loads these URLs.

The queue reader accepts the MPD protocol greeting before parsing playlist
items. This matters after a web-controller playlist load: the home MPD queue
can contain many items even when the first line is `OK MPD ...`; native
refresh must show that same server-authoritative queue rather than an empty
local snapshot.

The queue intentionally does **not** show the catalog Play/checkmark icons used
by search and browse result rows. Tapping a queue row or choosing **Play now**
from its menu is the queue-specific action; the row menu and swipe action expose
remove and reorder controls.

## Native playback-target behavior

The queue itself remains the home moOde/MPD queue, but native row playback
follows the app's selected playback target:

- With **Home moOde** selected, row playback calls the bearer queue-item play
  route and starts the item on the home MPD system.
- With **This iPhone/iPad** selected, a catalog-backed queue item uses its safe
  embedded track DTO and is authorized through the native media route, so it
  plays on the device without changing the home queue. **Play Queue** starts
  the first playable catalog row; finite items then advance automatically
  through the app-managed local queue.
- Streams and otherwise unrecognized queue rows do not have native media
  authorization and remain unavailable for device playback. Downloaded
  podcast episodes added from the native Podcasts surface carry their
  authenticated episode media route and are playable on the selected device;
  undownloaded podcast episodes still require download first.

Queue Wizard uses the same target ownership rule. Its filtered preview returns
canonical catalog tracks, and Apply replaces, appends, or crops the selected
target queue without creating a second catalog. Device Apply updates the
native queue directly; Alexa Apply updates the shared server queue and invokes
the established Alexa bridge when it starts playback. Optional playlist and
collage saves remain server-side.

The native device queue is durable across force quit: the app writes a
versioned canonical-track snapshot to its Application Support storage after
each queue mutation and restores that snapshot when the app model initializes.
Signed media URLs, filesystem paths, and player state are never persisted;
restored tracks go through the normal local-source or authenticated-server
resolution path when played. Signing out clears the device queue as part of
the account-state reset.

Native device **Shuffle** mirrors the web queue contract rather than MPD
random mode: it physically reorders only the upcoming tracks, keeps the
currently playing and already-played prefix fixed, and leaves random mode out
of the path. The app exposes a one-level **Undo Shuffle**. Deletions after a
shuffle are reconciled into that snapshot; a manual reorder or addition
invalidates Undo. The undo snapshot is process-local and is intentionally not a
second persisted queue store.

## Current native implementation

The phone and tablet surfaces now provide:

- authoritative queue loading and current-position indication;
- server-provided queue artwork;
- row play, remove, move up, and move down actions;
- an explicit **Play Queue** device-target action;
- automatic local advancement after finite track completion, with the existing
  device shuffle/repeat behavior;
- swipe/menu removal;
- Refresh, Shuffle, Crop, and Clear actions; and
- physical upcoming-only Shuffle with one-level Undo Shuffle for the local
  device target; and
- immediate queue refresh after a whole-playlist Home moOde action; and
- Vibe start through the same server-side Vibe builder used by the web Queue
  controller, without exposing its Track Key route to the app.

The mobile Vibe action returns an opaque `jobId` and starts from the selected
home-moOde queue item. The native app polls the dedicated bearer status route
while the builder runs and receives only allowlisted phase, count, and latest
track fields. The existing web status/debug routes remain admin-only; the
native client never polls `/config/queue-wizard/vibe-status/:jobId` directly.

The per-row Vibe action resolves the opaque queue item against the current MPD
snapshot and derives the seed from that item's catalog artist/title. It reuses
the established server-side seeded Vibe builder and returns only `jobId`,
`accepted`, `queueCount`, and the requested target size. Streams, YouTube,
podcasts, AirPlay, and unsupported rows are rejected; the app cannot supply a
file path, MPD song ID, Track Key, or arbitrary seed.

Endless Vibe reads and writes the same server-side setting used by the web
Live Queue. The backend watcher remains responsible for detecting the last
remaining local track and starting the next seeded job, so the mobile app does
not supply a seed or need to keep a controller page open. Its optional job
object is an allowlisted status summary and does not include seed internals,
logs, file paths, or MPD identifiers.

The native device target has a separate local Endless Vibe preference. It does
not use the server-global Endless Vibe setting or mutate the Home moOde queue.
The iOS model currently starts the existing Track-Key-protected seeded preview
before the
native queue reaches exhaustion, resolves candidates back to canonical mobile
track IDs, and replaces only future This iPhone/This iPad queue items. The
device preference is stored in iOS local settings; the current implementation
does not store Last.fm credentials or run the server's Python Vibe script on
the device.

## Home moOde transport detail

The P0 Server transport route is `POST /v1/mobile/now-playing/control`. It
accepts `play`, `pause`, `stop`, `next`, `previous`, repeat-toggle, and
explicit `repeatMode` actions (`off`, `all`, `one`)
plus `seekRelative.seconds` in the inclusive range -600..600 and
`seekPercent.percent` in the inclusive range 0..100. It delegates to the
existing guarded Home playback authority, maps `previous` to the existing
server-side `prev` action, and returns no raw command or status text. It
returns `409 HOME_PLAYBACK_OWNERSHIP_CONFLICT` while Qobuz Connect or Sonuvi
UPnP owns the receiver; the client must use the explicit ownership-specific
mobile contract first. Existing Track-Key web/controller routes are retained.

## Playback-target queue handoff

Changing the selected output target always carries the active queue across the
target boundary:

- **Alexa/Home moOde → This iPhone/iPad:** the app refreshes the bearer
  `/v1/mobile/queue` snapshot, stops the previous remote output, and copies the
  current plus later positions into the native device queue. Already-played
  positions are omitted and streams, podcasts, and other server-only rows are
  skipped because the native player cannot represent them.
- **This iPhone/iPad → Alexa/Home moOde:** the app keeps the current plus later
  native queue items that have canonical server track IDs and replaces the
  server queue through the existing bearer queue contracts. Device-only radio
  and podcast rows are reported as skipped rather than synthesized into the
  server catalog. Directly added native podcast rows remain device-target
  items and are not transferred as catalog tracks.
- **Alexa ↔ Home moOde:** both targets use the same server-authoritative queue,
  so the queue is refreshed and retained while the app stops the old output and
  starts or stops the new output to match the prior play/pause state.

The handoff preserves queue order and does not start the new output when the
source was paused or stopped. A failed stop or missing control credential
prevents the new output from starting, avoiding simultaneous playback. The
current track may restart from its beginning when crossing between native and
remote players because the queue contract does not expose a reliable
cross-player elapsed-time offset. No Track Key, Alexa secret, raw MPD
identifier, or new privileged client route is exposed to the app.

Alexa's first Play is skill-backed: when the Alexa target is selected but the
Echo skill has not been opened for the transferred queue, the mobile transport
uses the existing `start` bridge (`routealexa`) rather than a resume-only
control. That bridge triggers the Homebridge Alexa-start routine, which invokes
the moOde skill against the current server queue. Once that session is ready,
Play after Pause uses `resume` for the existing Echo stream. A literal mobile
`play` action still uses the skill-start route.

## Remaining parity work

The mobile contract now has a scoped `POST
/v1/mobile/queue-wizard/add-to-playlist` path for the native picker and shelf
faces. It resolves opaque track IDs server-side and does not expose the
browser/admin playlist routes. Broader queue save-as-playlist behavior,
playlist revision reconciliation, and richer per-row saved-data management
remain follow-up work; any new mutation must retain the same bearer, opaque-ID,
and explicit-target boundary.

*Last reviewed: 2026-10-22 07:41 America/Chicago*
