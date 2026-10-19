# Qobuz Connect Now Playing

## Scope

Phase 1 adds a read-only native PiBuZ adapter while retaining the existing
moOde renderer metadata cache as a compatibility fallback. It exposes active
Qobuz Connect playback through `/now-playing`, preserves the existing artwork
surface, and adds authenticated mobile snapshot and queue contracts. It does
not authenticate Qobuz, issue PiBuZ playback or queue commands, or control
ordinary MPD, ALSA, AirPlay, listening history, or Last.fm playback.

## Native PiBuZ transport

The Server uses a fixed, server-configured receiver endpoint:

```text
GET http://<configured-moode-host>:8182/api/status
GET http://<configured-moode-host>:8182/api/now-playing
GET http://<configured-moode-host>:8182/api/queue   # on-demand queue reads
GET http://<configured-moode-host>:8182/api/events  # read-only SSE observer
```

The adapter allowlists those four paths, applies bounded request and response
limits, and never accepts a client-supplied host, port, path, token, or PiBuZ
command. `/api/status` and `/api/now-playing` are polled for current state;
the SSE connection is a single bounded reconnecting observer used for event
freshness/diagnostics, not an unbounded event log.

The installed receiver was verified read-only as `pibuz 2.5.1-1moode1`. It
currently listens on `0.0.0.0:8182` and `0.0.0.0:8183` without an HTTP bearer
challenge. That is a PiBuZ installation hardening issue, not a reason for the
Server to proxy the raw API. Restricting the listeners to loopback or a
firewall allowlist should be evaluated with the moOde/PiBuZ maintainer before
changing it; this Phase 1 does not change the listener, firewall, or service.

The old fallback remains:

```text
GET http://<moode-host>/command/renderer.php?cmd=get_qbzmeta
```

It is used only when PiBuZ cannot be reached and no authoritative PiBuZ state
is available. An explicit `qconnect.is_active: false` state wins over stale
`qbzmeta.json` data, so handing playback back to the iPad does not leave
Sonuvi presenting moOde as the active Qobuz output.

## Normalized `/now-playing` contract

When PiBuZ owns the receiver, `/now-playing` returns the existing metadata
fields plus these additive source fields:

```json
{
  "source": "qobuz-connect",
  "isQobuz": true,
  "qobuzConnect": true,
  "streamKind": "qobuz-connect",
  "playbackOwner": "pibuz",
  "outputDevice": "moode",
  "qobuzTrackId": "37937812",
  "qobuzAlbumId": "0603497870547",
  "qobuzArtistId": "118769",
  "sourceFormat": "Qobuz 24-bit / 96 kHz",
  "outputFormat": "PCM / 96 kHz",
  "encoded": "Qobuz 24-bit / 96 kHz",
  "outrate": "PCM / 96 kHz",
  "elapsed": 258,
  "duration": 297
}
```

PiBuZ's `track.bit_depth` and `track.sample_rate` describe the Qobuz source
quality. `playback.output_sample_rate` describes the receiver output rate.
The native adapter does not invent an output bit depth when PiBuZ does not
report one; `outputFormatDetails.bitDepth` remains `null` in that case.

Artwork is served through Sonuvi's existing `/art/current.jpg` cache path. The
Qobuz payload carries only an opaque `qobuz=<sha256-prefix>` artwork marker on
that mediated URL, so clients repaint when the cover changes without exposing
the provider URL. The art route resolves the marker through the active PiBuZ
or legacy source rather than fetching the mediated current-art URL as an image
source. Qobuz artwork URLs are never serialized into the public response.
Native PiBuZ position and duration are used when reported; the legacy cache
fallback continues to report unavailable position rather than synthesizing it.

## Authenticated mobile contract

Both endpoints require the existing `mobile-api` bearer session:

```text
GET /v1/mobile/qobuz-connect
GET /v1/mobile/qobuz-connect/queue
```

The response is versioned as `qobuz-connect.v1` and separates ownership from
session existence:

```json
{
  "ok": true,
  "version": "qobuz-connect.v1",
  "available": true,
  "active": true,
  "ownershipState": "confirmed-active",
  "source": "qobuz-connect",
  "owner": "pibuz",
  "output": "moode",
  "sessionActive": true,
  "receiverActive": true,
  "state": "play",
  "currentTrack": {
    "qobuzTrackId": "37937812",
    "qobuzAlbumId": "0603497870547",
    "qobuzArtistId": "118769",
    "title": "25 or 6 to 4",
    "artist": "Chicago",
    "album": "Chicago II",
    "durationSec": 297,
    "artworkAvailable": true,
    "artworkUrl": "https://sonuvi.example/v1/mobile/qobuz-connect/artwork/qobuz-<opaque-ref>"
  },
  "capabilities": {
    "readOnly": true,
    "play": false,
    "pause": false,
    "stop": false,
    "seek": false,
    "next": false,
    "previous": false,
    "queueEdit": false
  }
}
```

The `/queue` response adds `queue.availability`, `currentIndex`,
`totalTracks`, `currentTrack`, ordered `history`, ordered `upcoming`,
`repeat`, `shuffle`, and `stopAfterTrackId`. Duplicate occurrences are
preserved. `history` is recent-first playback context from PiBuZ; it is not
guaranteed to be a prefix of the current queue and its length is not required
to equal `currentIndex` (for example, a newly replaced queue can be at index
zero while retained playback history is non-empty). Queue positions are
defined by `currentIndex`, `currentTrack`, and `upcoming`; clients must not
reject a coherent queue solely because `history.count > currentIndex`.
The top-level snapshot also includes `timingStable`; queue capture requires
that field to be true. An inactive receiver returns
`queue.availability: "inactive"`; a reachable receiver with a failed queue
read returns `"unavailable"`. Neither case is represented as a fabricated
empty queue. Artwork is served through the authenticated mediated artwork
route; raw Qobuz artwork URLs, raw PiBuZ responses, local paths, session
identifiers, and credentials are not returned.

## Source arbitration

- `ownershipState` is one of `confirmed-active`, `confirmed-inactive`, or
  `unknown`. `sessionActive` is informational and never grants playback
  ownership.
- A PiBuZ snapshot with `qconnect.is_active: true` owns visible Now Playing
  metadata over MPD and over the legacy cache.
- `qconnect.session_active` only means that a Qobuz cloud session exists; it
  does not grant this receiver playback ownership. Only `is_active: true` can
  claim the Qobuz output.
- `Pause` retains the Qobuz track and reports `state: "pause"`.
- Track changes replace title, artist, album, artwork, and formats.
- An explicit inactive PiBuZ state releases ownership; MPD is then read
  normally. The legacy cache is not consulted for that request.
- Transport errors retain the last authoritative PiBuZ record for 8 seconds
  based on successful fetch time, not file modification time.
- After that bound, Sonuvi reports `ownershipState: "unknown"` with no stale
  Qobuz track and does not claim either Qobuz or MPD ownership. The history
  poller remains neutral until independently verified MPD evidence shows
  `state: "play"` with a current file. A stopped or paused MPD state is not
  proof that Qobuz ended. The legacy qbzmeta cache remains a compatibility
  fallback only when PiBuZ has never established any receiver state.
- If independently verified MPD playback resumes while PiBuZ remains
  unreachable, ordinary Now Playing, artwork, and history may follow MPD.
  No engine is started, stopped, or mutated by this reconciliation.

Records with no active receiver ownership are treated as non-rendering and
cannot retain Qobuz ownership. This covers both the moOde cache state produced
when the Qobuz app moves output back to the iPad and an authenticated PiBuZ
session that is connected but no longer owns playback.

Qobuz playback itself is never passed to `listeningHistory` and cannot invoke
the existing Last.fm hook.

## Explicit session release

The authenticated `POST /config/qobuz/session/release` route is the supported
escape hatch when Qobuz Connect remains connected or leaves a stale cache
record. It submits moOde's existing `qobuzsvc` renderer-disconnect worker job,
waits for the Qobuz source read to become inactive, and returns success only
after that ownership release is confirmed. The action stops current Qobuz
renderer playback if present; it does not sign out the account or expose
Pibuz's loopback API.

## Files and services

Changed server files:

- `src/lib/pibuz-qobuz.mjs` — fixed-host, read-only PiBuZ status, now-playing,
  queue, artwork, and bounded SSE adapter.
- `src/lib/qobuz-connect.mjs` — metadata normalization, bounded freshness,
  source payload construction, native quality/position fields, and fail-closed
  non-rendering release.
- `src/lib/qobuz-connect-control.mjs` — fixed backend adapter for moOde's
  supported Qobuz renderer-disconnect action.
- `moode-nowplaying-api.mjs` — source arbitration, artwork integration, and
  MPD-history suppression while Qobuz owns playback; native PiBuZ is preferred
  over the qbzmeta compatibility fallback.
- `src/lib/mobile-pibuz-qobuz.mjs` — versioned mobile sanitization with
  mediated artwork references and read-only capabilities.
- `src/routes/mobile.routes.mjs` — authenticated Qobuz Connect snapshot,
  queue, and artwork routes.
- `src/routes/art.routes.mjs` — current-art routes prefer active Qobuz art
  while continuing to use the shared cache and resize pipeline.
- `test/qobuz-connect.test.mjs` — unit coverage for metadata, lifecycle,
  freshness, format resolution, artwork privacy, and payload compatibility.
- `test/pibuz-qobuz.test.mjs` and `test/mobile-pibuz-qobuz.test.mjs` — active
  versus inactive ownership, queue ordering, response bounds, SSE state,
  mobile authentication, sanitization, and mediated artwork coverage.
- `src/routes/config.qobuz-account.routes.mjs` — Track-Key-protected release
  route with post-action ownership confirmation.
- `config.html` — the Qobuz Account card's explicit session-release action.

Only `now-playing.service` requires restart after a Server deployment. The
explicit release action may restart the Qobuz renderer through moOde's existing
worker path; it does not modify moOde, PiBuZ, MPD, or worker configuration.

## Validation

Local validation:

```sh
npm test
node --check moode-nowplaying-api.mjs
node --check src/lib/qobuz-connect.mjs
node --check src/lib/pibuz-qobuz.mjs
node --check src/lib/mobile-pibuz-qobuz.mjs
node --check src/routes/mobile.routes.mjs
node --check src/routes/art.routes.mjs
```

Live validation should be coordinated with the listener:

1. Start Qobuz Connect playback and verify `/now-playing` reports
   `source: "qobuz-connect"`.
2. Verify the authenticated `/v1/mobile/qobuz-connect` snapshot and
   `/v1/mobile/qobuz-connect/queue` report the current ID, position, queue
   index, history, and upcoming entries.
3. Verify the reference track metadata and artwork on `/art/current.jpg`.
4. Pause and resume without changing the track; verify state and metadata.
5. Change tracks; verify artwork and formats change together.
6. Use the authenticated Config action `POST /config/qobuz/session/release`
   when the Qobuz session must be shut down; verify Pibuz reports no active
   session and Sonuvi no longer reports `source: "qobuz-connect"`.
7. Confirm no new Qobuz event appears in listening-history or Last.fm state.

## Deployment and rollback

This Phase 1 worktree is intentionally not deployed by the implementation
task. A later approved deployment must include the adapter, mobile sanitizer,
route wiring, and Qobuz payload files together, then restart only
`now-playing.service` and verify the authenticated endpoints. It must not
change PiBuZ, moOde, MPD, ALSA, Qobuz credentials, or playback state.

Rollback is the normal file restore of the changed server files followed by
`sudo systemctl restart now-playing.service` on `10.0.0.4`. The moOde/Pibuz
installation is unchanged; no Pi-side rollback is required.

## Known limitations

- The Phase 1 adapter is read-only. PiBuZ transport and queue mutation are
  deliberately not exposed in the mobile capabilities.
- PiBuZ's event stream is consumed for bounded freshness/diagnostics; current
  API reads remain authoritative, and no event payload history is retained.
- Qobuz artwork is refreshed through the cache when the normalized artwork
  identity changes; a missing artwork URL leaves artwork empty rather than
  fabricating a cover.
- If PiBuZ is unreachable before any authoritative state is observed, Sonuvi
  may use the existing qbzmeta compatibility source. Once PiBuZ has reported
  an authoritative state, bounded transport failure does not silently restore
  stale MPD/Qobuz ownership.
- Native iOS standalone playback remains independent of this Server contract;
  it must obtain its own source metadata when the Server is unavailable.

## Audio Info provenance

`GET /config/moode/audio-info?view=rows` remains compatible with the existing
section/key/value response for MPD playback. When Qobuz Connect owns the
renderer, the response additionally includes `playback` and `audio` objects
and adds provenance fields to the Qobuz rows.

| Field | Authority | Meaning |
| --- | --- | --- |
| Source format | PiBuZ `/api/now-playing` track quality, or legacy moOde `get_qbzmeta` fallback | Live Qobuz source quality, not a file probe |
| Decoded to | PiBuZ playback fields/output format, or legacy moOde `get_qbzmeta` fallback | Renderer-reported decoded PCM/container format; not a claim about the DAC |
| Output format | read-only ALSA `/proc/asound/.../hw_params` | Measured hardware parameters only when an open playback stream exposes them; otherwise `Not measured` |
| ALSA mode | moOde `audioinfo.php` | Configured moOde/MPD path; Qobuz's live `hw`/`plughw` choice is not inferred |
| Audio chain | moOde `audioinfo.php` | Configured moOde/MPD chain, explicitly labeled as unverified for Qobuz |
| Volume type/levels | MPD/moOde diagnostics | `Unavailable` for Qobuz; raw MPD/ALSA mixer errors are not presented as Qobuz facts |

The normalized `audio` object separates `sourceFormat`, `decodedPcm`,
`hardwareOutput`, `configuredOutput`, and `volume`. Its `provenance`,
`valueType`, `live`, and `measured` fields are intended for the authenticated
mobile/server contract; no native iOS code is changed by this runbook.

If ALSA reports `RUNNING`, `PAUSED`, `PREPARED`, or `OPEN`, the hardware
parameters may be shown. A closed stream, an unavailable SSH probe, or missing
parameters produces `Not measured`; MPD being stopped alone is never treated as
proof that a Qobuz renderer is stopped.

## Controller behavior and lifecycle safety

The main tablet, desktop, and mobile controller shells mark MPD transport,
shuffle, repeat, and seek controls unavailable while `/now-playing` reports
`source: "qobuz-connect"`. The server-side diagnostics playback route applies
the same guard, including requests that bypass the web UI. No unofficial Qobuz
remote-control API is introduced. Queue/library actions remain separate so an
operator can intentionally prepare an MPD handoff.

The source adapter covers play, pause, resume, track changes, stop/empty-cache
release, bounded transport failures, renderer reconnect, artwork identity
changes, and optional elapsed-position metadata. It never synthesizes seek
position or MPD history events.

## Additional changed files

- `src/lib/audio-info.mjs` — moOde row parsing, read-only ALSA result parsing,
  Qobuz provenance model, and source-aware diagnostic rows.
- `src/routes/config.moode-audio-info.routes.mjs` — Qobuz-aware Audio Info
  endpoint and read-only ALSA observation.
- `src/routes/config.diagnostics.routes.mjs` — MPD-control guard while Qobuz
  owns the renderer.
- `src/routes/mobile.routes.mjs` — forwards the sanitized optional audio
  provenance contract without exposing internal URLs or paths.
- `controller.html`, `controller-mobile.html`, `controller-tablet.html` —
  disables unsafe MPD controls during Qobuz ownership.
- `test/audio-info.test.mjs` and the existing Qobuz/diagnostics tests — source,
  ALSA, lifecycle, provenance, and control-guard coverage.
