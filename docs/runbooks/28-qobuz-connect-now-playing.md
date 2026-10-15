# Qobuz Connect Now Playing

## Scope

Sonuvi reads the existing moOde/Pibuz metadata cache and exposes active Qobuz
Connect playback through the existing `/now-playing` and artwork surfaces. A
separate authenticated release action is available for an idle or unwanted
Qobuz Connect session; it does not authenticate Qobuz or control ordinary
MPD, ALSA, AirPlay, listening history, or Last.fm playback.

## Transport

The Sonuvi API host fetches:

```text
GET http://<moode-host>/command/renderer.php?cmd=get_qbzmeta
```

This is moOde's existing renderer metadata command, backed by
`/var/local/www/qbzmeta.json` and populated by the installed
`/var/local/www/commandw/qbzevent.sh`. The response contains only normalized
track metadata, artwork, play state, source format, and output format. Sonuvi
does not expose Pibuz's loopback control API, and it never returns Qobuz stream
URLs, credentials, or tokens. The release action uses a fixed, backend-only
SSH command to submit moOde's existing
`renderer.php?cmd=disconnect_renderer` operation with `job=qobuzsvc`; the
browser cannot supply a host, shell command, Pibuz argument, or session ID.

The live Pibuz APIs were inspected during implementation:

- `/api/status` reports `qconnect`, `playback`, `audio`, and network state but
  is loopback-only on the moOde host.
- `/api/queue` reports `current_track`, `current_index`, and queue entries but
  is also loopback-only.
- The existing renderer cache is sufficient for this phase and avoids adding
  a Pi-side bridge.

## Normalized `/now-playing` contract

When the cache is populated, `/now-playing` returns the existing metadata
fields plus these additive source fields:

```json
{
  "source": "qobuz-connect",
  "isQobuz": true,
  "qobuzConnect": true,
  "streamKind": "qobuz-connect",
  "sourceFormat": "FLAC 24/192 kHz",
  "outputFormat": "PCM 32/192 kHz, 2ch",
  "encoded": "FLAC 24/192 kHz",
  "outrate": "PCM 32/192 kHz, 2ch"
}
```

Artwork is served through Sonuvi's existing `/art/current.jpg` cache path.
Qobuz's raw artwork URL is not serialized into the response. Duration is
reported when present. The Pibuz cache does not provide authoritative elapsed
position, so `elapsed` and `percent` remain `null` and `progressAvailable` is
`false` unless a future metadata contract supplies a position.

## Source arbitration

- A valid Qobuz cache record owns visible Now Playing metadata over MPD.
- `Pause` retains the Qobuz track and reports `state: "pause"`.
- Track changes replace title, artist, album, artwork, and formats.
- An empty cache releases ownership; MPD is then read normally.
- Transport errors retain the last valid Qobuz record for 15 seconds based on
  successful fetch time, not file modification time.
- After that bound, Sonuvi reports temporary metadata unavailability instead
  of selecting a possibly stale stopped-MPD snapshot. The history poller
  suppresses MPD observation while Qobuz is active or while a Qobuz transport
  failure is unresolved, preventing stale MPD tracks from being recorded or
  scrobbled. MPD resumes ownership once the existing Qobuz cache explicitly
  becomes empty/stopped.

Records with no explicit `Play`/`Pause` renderer state are treated as
non-rendering and cannot retain Qobuz ownership. This covers the moOde cache
state produced when the Qobuz app moves output back to the iPad without
emitting a final stopped event.

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

- `src/lib/qobuz-connect.mjs` — metadata normalization, bounded freshness,
  source payload construction, and fail-closed non-rendering release.
- `src/lib/qobuz-connect-control.mjs` — fixed backend adapter for moOde's
  supported Qobuz renderer-disconnect action.
- `moode-nowplaying-api.mjs` — source arbitration, artwork integration, and
  MPD-history suppression while Qobuz owns playback.
- `src/routes/art.routes.mjs` — current-art routes prefer active Qobuz art
  while continuing to use the shared cache and resize pipeline.
- `test/qobuz-connect.test.mjs` — unit coverage for metadata, lifecycle,
  freshness, format resolution, artwork privacy, and payload compatibility.
- `src/routes/config.qobuz-account.routes.mjs` — Track-Key-protected release
  route with post-action ownership confirmation.
- `config.html` — the Qobuz Account card's explicit session-release action.

Only `now-playing.service` requires restart after deployment. The explicit
release action may restart the Qobuz renderer through moOde's existing worker
path; it does not modify moOde, Pibuz, MPD, or worker configuration.

## Validation

Local validation:

```sh
npm test
node --check moode-nowplaying-api.mjs
node --check src/lib/qobuz-connect.mjs
node --check src/routes/art.routes.mjs
```

Live validation should be coordinated with the listener:

1. Start Qobuz Connect playback and verify `/now-playing` reports
   `source: "qobuz-connect"`.
2. Verify the reference track metadata and artwork on `/art/current.jpg`.
3. Pause and resume without changing the track; verify state and metadata.
4. Change tracks; verify artwork and formats change together.
5. Use the authenticated Config action `POST /config/qobuz/session/release`
   when the Qobuz session must be shut down; verify Pibuz reports no active
   session and Sonuvi no longer reports `source: "qobuz-connect"`.
6. Confirm no new Qobuz event appears in listening-history or Last.fm state.

## Deployment and rollback

Deploy the changed relative paths with the pinned Pi5 helper, then verify the
service and endpoint. Do not commit or push as part of this task.

Rollback is the normal file restore of the changed server files followed by
`sudo systemctl restart now-playing.service` on `10.0.0.4`. The moOde/Pibuz
installation is unchanged; no Pi-side rollback is required.

## Known limitations

- Elapsed position and seek events are not available through the existing
  renderer cache and are intentionally not synthesized.
- Qobuz artwork is refreshed through the cache when the normalized artwork
  identity changes; a missing artwork URL leaves artwork empty rather than
  fabricating a cover.
- A Qobuz session handed over paused must continue to populate the existing
  moOde cache through `qbzevent.sh`; Sonuvi does not modify that event path.

## Audio Info provenance

`GET /config/moode/audio-info?view=rows` remains compatible with the existing
section/key/value response for MPD playback. When Qobuz Connect owns the
renderer, the response additionally includes `playback` and `audio` objects
and adds provenance fields to the Qobuz rows.

| Field | Authority | Meaning |
| --- | --- | --- |
| Source format | Pibuz/moOde `get_qbzmeta` (`sformat`) | Live renderer-reported source format, not a file probe |
| Decoded to | Pibuz/moOde `get_qbzmeta` (`oformat`) | Renderer-reported decoded PCM/container format; not a claim about the DAC |
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
