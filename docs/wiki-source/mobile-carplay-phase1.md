---
title: mobile-carplay-phase1
page_type: guide
topics:
  - api
  - ios
  - carplay
  - security
confidence: medium
---

# Native iPhone/CarPlay Phase 1

This page documents the first gated server/client foundation for the native
iPhone and CarPlay project. It is separate from the existing browser/PWA
controller and does not control the home MPD queue.

## Phase 1 boundary

The first proof of concept is remote-only:

```text
iPhone + Tailscale
        |
        | HTTPS /v1/mobile
        v
Now Playing app host
        |
        | server-side opaque-ID resolution
        v
authorized local library file -> iPhone AVFoundation playback
```

The external SSD is a separate Phase 1A document-provider experiment. Local
SSD playback must eventually produce the same source-neutral track and queue
model, but it must not be allowed to change the remote API security boundary.

## Server implementation

Source files:

- `src/routes/mobile.routes.mjs` — versioned mobile API routes.
- `src/lib/mobile-auth.mjs` — signed session and media-ticket tokens.
- `src/lib/mobile-track-identity.mjs` — opaque IDs and sanitized catalog views.
- `src/routes/track.routes.mjs` — shared byte-range and MP3-transcode helpers;
  the existing `/track` behavior remains unchanged.
- `src/routes/art.routes.mjs` — shared authorized artwork resolver/cache.
- `src/lib/mobile-pairing.mjs` — ephemeral single-use pairing challenges,
  device proof verification, approval state, and app completion.
- `scripts/mobile-pairing-ui.js` — shared display-side pairing widget used by
  Config and Controller Settings.

The route registration is always present in source but is disabled unless
`MOBILE_API_ENABLED=1` and both mobile secrets are configured.

## Environment configuration

These values belong in the host’s private environment, never in the iOS app
or source control:

```text
MOBILE_API_ENABLED=1
MOBILE_API_SECRET=<persistent random signing secret>
MOBILE_TRACK_ID_SECRET=<persistent random ID secret>
MOBILE_API_ENROLLMENT_CODE=<temporary operator enrollment code>
MOBILE_PUBLIC_BASE_URL=https://<tailnet-now-playing-name>
MOBILE_TRACK_CACHE_DIR=/tmp/now-playing/mobile-track-cache
MOBILE_TRANSCODE_TRACKS=1
```

`MOBILE_API_SECRET` is not `TRACK_KEY`. Rotating the track-ID secret changes
catalog IDs and therefore requires the client’s catalog cache to be rebuilt.

## Live tailnet transport

The remote mobile path is deployed on the Now Playing host through Tailscale.
The installation-specific MagicDNS hostname is deliberately kept in the
private host environment rather than committed to the repository.

The live transport is:

```text
iPhone/iPad with Tailscale connected
        |
        | HTTPS, tailnet only, TCP 443
        v
Tailscale Serve on the Now Playing host
        |
        | proxy to http://127.0.0.1:3101
        v
Now Playing mobile API
```

Operational requirements and boundaries:

- `tailscaled` is enabled and running on the Now Playing host.
- Tailscale HTTPS/Serve provides the trusted certificate and maps the
  tailnet-only HTTPS hostname to the local API port.
- `MOBILE_PUBLIC_BASE_URL` is set to the HTTPS Tailscale hostname without a
  port, path, query string, or fragment. Pairing QR payloads use this value.
- Tailscale Funnel is not enabled. The API is not exposed to the public
  Internet.
- Tailscale membership is network access only; the mobile app still requires
  its own pairing-issued bearer session and short-lived media tickets.
- The iOS/iPadOS Tailscale app must be connected before the native client can
  reach the server away from the home LAN.

The current music files remain on the existing home storage path. The Now
Playing host resolves opaque mobile track IDs and reads its existing local
mount of the moOde library; the native client never receives an SMB path,
MPD path, or filesystem permission. The moOde player host does not need its
own Tailscale installation for this playback path, and SMB/MPD/moOde services
must not be exposed directly to the tailnet client.

After changing `MOBILE_PUBLIC_BASE_URL`, generate a fresh pairing QR. A device
that was paired against the old home-LAN URL must be re-paired so its stored
API base URL is replaced with the HTTPS tailnet URL. A simple transport check
from a Tailscale-connected device is the unauthenticated controller-profile
endpoint:

```text
https://<tailnet-now-playing-name>/config/controller-profile
```

It should return the normal JSON profile response. This checks DNS, Tailscale
reachability, certificate trust, Serve, and the local API proxy without
exposing a bearer token.

## API contract

### Enrollment

```http
POST /v1/mobile/session
X-Mobile-Enrollment-Code: <temporary code>
Content-Type: application/json

{"deviceId":"iphone-brian"}
```

The response contains a short-lived bearer access token. The app must store
it in the iOS Keychain. The current Phase 1 implementation intentionally uses
an operator-managed temporary code that must be rotated after enrollment,
rather than pretending to provide a production refresh-token/revocation
system.

### Local-device pairing

The server/display half of the native-app pairing flow is implemented in this
repository. It is available from:

- the authenticated **Config** page in `app.html` (`config.html`); and
- **Controller → Settings** (`controller-tablet-settings.html`).

Both surfaces use the same API and shared browser widget. The controller page
is a convenience entry point; it is not a second pairing implementation.

Pairing is disabled unless `MOBILE_API_ENABLED=1`, both mobile signing secrets
are configured, and a real Now Playing Track Key is configured. The existing
Track Key check is the display authorization/CSRF-equivalent for this project’s
header-authenticated browser surfaces; no cookie session is introduced.

#### Protocol

1. An authorized display calls `POST /v1/mobile/pairing/challenges`.
2. The server creates an in-memory challenge with a 90-second lifetime and a
   separate in-memory display approval token. It returns a QR image and safe
   display state.
3. The QR JSON contains exactly these fields:

   ```json
   {
     "protocol": "now-playing-mobile-pairing",
     "version": 1,
     "baseUrl": "https://<configured-server>",
     "challenge": "<opaque-high-entropy-value>",
     "expiresAt": 0
   }
   ```

   It never contains `MOBILE_API_SECRET`, `MOBILE_TRACK_ID_SECRET`, the
   enrollment code, Track Key, a bearer token, a display token, a poll token,
   a private key, or a filesystem path. `MOBILE_PUBLIC_BASE_URL` is preferred;
   otherwise the server derives the visible address from the request host.
   Configured URLs must be HTTP(S) URLs without credentials, query strings, or
   fragments.
4. The app creates an Ed25519 or P-256 key pair and submits
   `POST /v1/mobile/pairing/requests` with `challenge`, `deviceId`,
   `deviceName`, `deviceModel`, `publicKey`, `signature`, and
   `signatureAlgorithm`.
5. The signature proves possession of the private key over this exact UTF-8
   message, with normalized device fields:

   ```text
   now-playing-mobile-pairing-v1
   <challenge>
   <deviceId>
   <deviceName>
   <deviceModel>
   ```

   The server does not accept a no-proof fallback. Public keys may be PEM or
   base64url-encoded DER SubjectPublicKeyInfo. Ed25519 uses the raw signature
   algorithm; `ecdsa-p256-sha256` uses SHA-256 with the normal DER ECDSA
   signature encoding.
6. The app receives only a short-lived poll token, request ID, verification
   code, and expiry. The display polls
   `GET /v1/mobile/pairing/requests` with its separate display token and sees
   only safe device identity, code, status, and timestamps.
7. The display calls the approve or reject endpoint with the visible
   verification code. The first valid approval wins; all other pending
   requests on that challenge are rejected.
8. The app polls
   `GET /v1/mobile/pairing/requests/:requestId/complete` with its poll token.
   Only that app-held poll token can receive the normal mobile session bearer
   token. The display never receives or displays that token.

Pairing endpoints:

| Method | Route | Credential | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/mobile/pairing/challenges` | Track Key | Create challenge and QR data |
| GET | `/v1/mobile/pairing/requests` | Track Key + display token | List pending requests |
| POST | `/v1/mobile/pairing/requests` | QR challenge + public-key proof | Submit app request |
| POST | `/v1/mobile/pairing/requests/:requestId/approve` | Track Key + display token + code | Approve one request |
| POST | `/v1/mobile/pairing/requests/:requestId/reject` | Track Key + display token + code | Reject one request |
| POST | `/v1/mobile/pairing/challenges/cancel` | Track Key + display token | Cancel the display challenge |
| GET | `/v1/mobile/pairing/requests/:requestId/complete` | App poll token | Complete approved pairing and receive session |

Pairing state is intentionally memory-only in this server/display phase. A
server restart invalidates all challenges, display tokens, poll tokens, and
pending requests. Expired state is cleaned up on requests and by an unref’d
timer. Replays, use-after-approval, wrong display credentials, wrong codes,
expired challenges, and malformed proofs are rejected. No pairing secret or
token is written to logs.

The pre-existing `POST /v1/mobile/session` enrollment endpoint is unchanged
for backward compatibility. The native app may use pairing instead of the
manual enrollment code, but the two paths remain separate until the companion
client implements the new protocol.

### Catalog

Authenticated catalog routes:

- `GET /v1/mobile/catalog/stats`
- `GET /v1/mobile/catalog/artists`
- `GET /v1/mobile/catalog/artists/:artistId/albums`
- `GET /v1/mobile/catalog/albums`
- `GET /v1/mobile/catalog/albums/:albumId`
- `GET /v1/mobile/catalog/tracks/:trackId`
- `GET /v1/mobile/search?q=...`
- `GET /v1/mobile/artwork/:trackId`

Responses contain opaque IDs and metadata only. They do not contain MPD file
paths, filesystem paths, `TRACK_KEY`, MPD song IDs, or queue positions.

List responses are capped at 100 items per page. The native client follows
the `nextCursor`/`total` pagination contract so the Artists and Albums
surfaces load the complete catalog instead of stopping at the first page.
Album responses may also include `addedAt`, an opaque numeric timestamp used
only for native Newest Added and Oldest Added sorting. The timestamp is
enriched server-side from the existing library-health album metadata route;
the mobile client never receives its Track Key or filesystem paths.

Track IDs use an HMAC over MusicBrainz track identity when available. When a
MusicBrainz ID is absent, the server uses normalized metadata plus a
server-side path/parent-folder hint to keep duplicate editions separate. The
path is never returned to the client.

### Playlists

The first read-only playlist contract is documented in
[Mobile Playlist API](mobile-playlists.md). It provides bearer-authenticated
playlist summaries and ordered entries using opaque playlist and track IDs.
Playlist membership is resolved through the server’s existing MPD/catalog
logic; raw playlist files and Track-Key/admin routes remain server-only.

### Media

```http
POST /v1/mobile/media-authorizations
Authorization: Bearer <session-token>
Content-Type: application/json

{"trackId":"trk_...","format":"original"}
```

The client chooses `original` for FLAC and other iOS-native formats when the
**Prefer original audio quality** setting is enabled. It chooses `mp3` when
lower transfer size or broader compatibility is preferred; non-MP3 source
files are then transcoded into the temporary mobile cache. The response
contains a one-hour, track- and device-bound URL compatible with `AVPlayer`,
supports HTTP byte ranges, and does not alter MPD playback. Normal native
**Play** starts from this URL as soon as the player has buffered enough audio.
Playlist **Download & Play** starts from the same URL immediately, then
downloads a second copy in the background and installs it atomically for later
offline playback. The client never points `AVPlayer` at a partially written
local file. Cache eviction is a Phase 1 hardening item.

The ticket is the only credential accepted by the media route. The server
re-resolves the opaque ID and verifies the local file before serving it.

### Native radio streaming

Native radio playback is separate from Home moOde queue playback. The station
list continues to return an opaque station ID; the moOde `station.file` URL
stays server-side. The native client requests:

```http
POST /v1/mobile/radio/stream-authorizations
Authorization: Bearer <session-token>
Content-Type: application/json

{"stationId":"rad_..."}
```

The response contains a station ticket URL for:

```http
GET /v1/mobile/radio/stream/:stationId?ticket=...
```

The server resolves the station URL, follows normal HTTP redirects, requests
ICY metadata when available, and proxies the live response to `AVPlayer`. The
radio ticket is scoped to the station and device. Radio is durationless and is
not downloaded into the local music cache. Existing `POST /v1/mobile/radio/play`
and `/queue` remain the Home moOde operations.

## Security boundary

- Tailnet access is required operationally, but is not treated as app auth.
- The app uses its own bearer session token.
- Media authorization is short-lived and bound to device, track, format, and
  expiration.
- Device pairing requires an app-generated public-key proof before approval
  can produce a session.
- The authenticated display sees a device identity and verification code, not
  a bearer token or private key.
- No permanent media URL or global Alexa `TRACK_KEY` is used.
- Alexa’s `/track` route remains separate.
- All route errors returned to the client are generic; internal logs must not
  include tokens or signed URLs.
- Tailscale Serve is tailnet-only; do not enable Funnel for the mobile API.
- The tailnet transport terminates at the Now Playing host. Do not give the
  native app direct access to the moOde host, CIFS/SMB, MPD, or the library
  filesystem.

The Phase 1 enrollment code is intentionally a temporary POC mechanism and is
not single-use in this first implementation; rotate it after enrollment.
Before distribution, add persistent device sessions, refresh-token rotation,
revocation, rate limits, and audit-safe enrollment logging.

The `now-playing-ios` project implements the companion side of
the pairing contract: generate/store the device key in Keychain, encode the QR
payload, sign the canonical message, submit the pending request, poll with the
poll token, and store the completed session token in Keychain. This session
intentionally does not modify that sibling project or deploy this
server/display work.

## Client scaffold

The separate Apple client project is `../now-playing-ios` in the workspace.
It contains:

- shared Swift catalog/session/media models;
- a URLSession mobile API client;
- an app-owned queue model;
- a minimal SwiftUI shell;
- a minimal standard CarPlay list-template coordinator.

AVFoundation playback, Keychain persistence, lock-screen metadata, SSD
security-scoped bookmarks, and production CarPlay entitlement configuration
remain device/Xcode work.

## Deployment and verification status

The server/display pairing flow and Tailscale transport were deployed and
verified on the live installation on 2026-09-27. The completed transport
checks were:

1. Tailscale was installed and authenticated on the Now Playing host.
2. The host received a stable tailnet identity and MagicDNS name.
3. Tailscale Serve was configured as a tailnet-only HTTPS proxy to local API
   port `3101`; Funnel remains disabled.
4. Tailscale issued a trusted certificate for the MagicDNS hostname.
5. `MOBILE_PUBLIC_BASE_URL` was changed to that HTTPS hostname and the Now
   Playing service was restarted successfully.
6. The pairing flow was tested from the Config and Controller Settings
   displays, and the native app completed pairing and catalog browsing.

Remaining native-client verification:

1. With Tailscale connected, confirm the controller-profile URL above from
   the iPhone and iPad.
2. Generate a fresh QR and re-pair any client that still has the old LAN URL.
3. Authorize a known MP3 and verify `206` range behavior from the tailnet.
4. Authorize one non-MP3 file and verify bounded transcoding/cache behavior.
5. Test the same media URL from AVFoundation while the phone is locked.
6. Confirm remote playback leaves the home MPD queue, Alexa playback, and
   moOde configuration unchanged.
7. For pairing, retain coverage for the QR payload, public-key proof, display
   approval, wrong code, replay/expiry, restart invalidation, and confirmation
   that the display never receives the session token.

The external SSD, production refresh-token/revocation lifecycle, and final
CarPlay entitlement/distribution work remain separate client-side phases.

## Timestamp

Last updated: 2026-09-27 America/Chicago
