# Local listening history

Now Playing keeps a private, server-side listening history so the controller
can provide top albums, top artists, top tracks, and recently played rows even
when Last.fm is not configured.

## Collection

The API polls MPD independently of browser/controller requests. For an MPD
local file, a track shorter than 30 seconds never qualifies. Otherwise the
required played time is exactly
`max(30s, min(50% of duration, 240s))`; an unknown-duration track requires
240 seconds. The event is recorded once per playback instance.

The MPD polling path excludes radio/stream entries, podcasts, AirPlay, and
Alexa-mode playback. Native clients may also report supported catalog, radio,
or podcast observations through `POST /v1/mobile/playback/events`; those use
the same Server-side qualification and deduplication path and are recorded as
source `ios-device` when they qualify. Qobuz Connect is excluded while PiBuZ
owns the renderer, and UPnP playback suppresses the duplicate MPD observer.
The store is local to the Now Playing host; Last.fm submission is a separate
server-side hook.

## Storage

Events are appended to:

- `data/listening-history.jsonl`
- `data/listening-history.state.json`

Both are runtime data and are ignored by Git. JSONL was chosen because the Pi
does not provide the SQLite CLI and the Node project intentionally has no
native database dependency. The append-only format is easy to back up,
inspect, and migrate later if the history grows enough to justify a database.

## API

Track-key-authenticated local-history endpoints mirror the Last.fm row shape:

- `GET /config/listening-history/top-tracks`
- `GET /config/listening-history/recent-tracks`
- `GET /config/listening-history/top-artists`
- `GET /config/listening-history/top-albums`

The existing `/config/lastfm/*` endpoints remain Last.fm-first. If the Last.fm
API key or username is absent, they serve local-history results instead, so
existing controller row selections continue to work without a migration.

The tablet controller also exposes explicit local-history row sources so a
configured Last.fm account does not hide or replace the local data:

- `local-toptracks` -> `/config/listening-history/top-tracks`
- `local-recenttracks` -> `/config/listening-history/recent-tracks`
- `local-topartists` -> `/config/listening-history/top-artists`
- `local-topalbums` -> `/config/listening-history/top-albums`

These appear in tablet settings as Local Top Tracks, Local Recently Played,
Local Top Artists, and Local Top Albums.
