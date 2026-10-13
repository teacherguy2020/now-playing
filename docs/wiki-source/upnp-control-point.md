---
title: UPnP/DLNA control point
page_type: architecture
topics:
  - upnp
  - playback
  - architecture
  - security
confidence: high
---

# UPnP/DLNA control point

## Scope

Sonuvi now contains a generic UPnP/DLNA control-point foundation. Milestone 1
discovers local UPnP devices, reads device and service descriptions, browses
compatible `ContentDirectory` services, normalizes DIDL-Lite metadata, and
inspects renderer capabilities. Milestone 2 adds a separately authenticated,
single-track AVTransport session with explicit ownership and MPD safeguards.
Milestone 3 adds a separately authenticated logical queue above that session;
the queue is authoritative for Sonuvi-controlled UPnP playback, while the
renderer-owned MPD queue remains an implementation detail.

This is intentionally separate from:

- the `qobuz-connect`/Pibuz metadata path;
- direct MPD control;
- native iOS playback; and
- the Sonuvi catalog.

The UPnP layer does **not** authenticate Qobuz, install Docker, control Pibuz,
or share state with `qobuz-connect`. Playback mutations remain narrow,
Track-Key-authenticated operations over trusted Browse/Search references; there
is no raw-URL or generic-SOAP interface.

## Implementation

The control point is implemented in:

- `src/lib/upnp-control-point.mjs` — SSDP discovery, URL policy, bounded HTTP,
  device/service/SCPD parsing, DIDL-Lite normalization, trusted browse-item
  references, bounded AVTransport actions, and capability inspection.
- `src/lib/upnp-playback-session.mjs` — single-track selection, renderer
  ownership, MPD queue baselines, Qobuz/MPD takeover gates, transport state,
  and source-neutral Now Playing normalization.
- `src/lib/upnp-playback-queue.mjs` — bounded, in-memory Sonuvi queue state,
  revision-checked mutations, session-generation binding, manual navigation,
  and confirmed end-of-track advancement.
- `src/routes/upnp.routes.mjs` — authenticated discovery/browse routes plus
  narrow session, transport, and queue routes; there is no generic SOAP
  endpoint.
- `controller-upnp.html` — the responsive Music Sources browser used by the
  desktop, tablet, and mobile controller shells. It discovers provider-neutral
  MediaServers, browses/searches their ContentDirectory, and presents the
  separate Sonuvi UPnP queue.
- `scripts/upnp-now-playing.js` — a source-aware bridge for the existing Now
  Playing controls. It routes next/previous/pause/resume/play actions to the
  authenticated UPnP queue only while `/now-playing` identifies
  `upnp-sonuvi`; it never becomes a generic SOAP or URL control surface.
- `test/upnp-control-point.test.mjs` and `test/upnp-playback-session.test.mjs`
  — fixture-driven parser, security, SOAP, discovery, browse, renderer,
  allowlist, ownership, queue-protection, lifecycle, and no-raw-URL coverage.
- `test/upnp-playback-queue.test.mjs` — queue ordering, revision conflicts,
  lifecycle, navigation, duplicate-event suppression, resource-URL omission,
  and external-takeover fixtures.

The server creates one in-memory `UpnpControlPoint`. Device records and SCPD
descriptions are cached only for the process lifetime. The active logical queue
is also memory-only by design: it retains opaque media-server/item references
and metadata, but never persists signed stream/resource URLs. A restart
therefore drops the queue and any Sonuvi UPnP ownership without sending a
renderer command.

## Interfaces

All routes use the existing Sonuvi Track Key authorization boundary. The
server never accepts a device URL from a browser. A browser supplies only a
registered device ID and bounded ContentDirectory parameters.

| Route | Purpose |
| --- | --- |
| `GET /upnp/devices` | Run bounded SSDP discovery and return registered devices. Use `refresh=1` for an explicit refresh. |
| `GET /upnp/devices/:deviceId` | Return a registered device and its dynamically resolved services/actions. |
| `GET /upnp/media-servers/:deviceId/capabilities` | Inspect ContentDirectory actions and read-only search/sort capabilities. |
| `GET /upnp/media-servers/:deviceId/browse` | Read `Browse` results and normalize DIDL-Lite containers/items/resources. |
| `GET /upnp/media-servers/:deviceId/search` | Use `Search` only when the service advertises it. |
| `GET /upnp/media-items/:selectionRef/artwork` | Read bounded artwork through a trusted opaque item reference; browsers never fetch the advertised LAN URL directly. |
| `GET /upnp/renderers/:deviceId/capabilities` | Inspect AVTransport, RenderingControl, and ConnectionManager SCPDs plus read-only renderer state/protocol information. |
| `GET /upnp/preflight?rendererId=...` | Read Qobuz/MPD/renderer ownership state and capture the MPD queue baseline. It never mutates playback. |
| `POST /upnp/sessions` | Select a recent opaque Browse/Search item reference and the approved renderer. It validates the item and captures a baseline but does not send AVTransport. |
| `GET /upnp/sessions/:sessionId` | Read session/transport state and detect ownership loss. |
| `GET /upnp/sessions/:sessionId/transport` | Read-only transport-state alias. |
| `POST /upnp/sessions/:sessionId/load` | Send generated DIDL-Lite and the trusted resource through `SetAVTransportURI`. This is a playback mutation and requires separate operator approval. |
| `POST /upnp/sessions/:sessionId/play` | Send AVTransport `Play` after ownership validation. |
| `POST /upnp/sessions/:sessionId/pause` | Send AVTransport `Pause` after ownership validation. |
| `POST /upnp/sessions/:sessionId/stop` | Send AVTransport `Stop` after ownership validation and release ownership. |
| `POST /upnp/queues` | Create the bounded logical queue for one approved renderer, optionally with ordered opaque item references. |
| `GET /upnp/queue` | Read the current process-local queue without requiring the browser to know its queue ID first. This is read-only and returns an empty snapshot when no queue exists. |
| `GET /upnp/queues/:queueId` | Read queue order, revision, current item, session generation, and confirmed renderer state. |
| `POST /upnp/queues/:queueId/items` | Append one or more trusted Browse/Search item references in order. |
| `DELETE /upnp/queues/:queueId/items/:itemId` | Remove an inactive queue item. |
| `POST /upnp/queues/:queueId/clear` | Stop the Sonuvi-owned session, then clear the logical queue. |
| `POST /upnp/queues/:queueId/reorder` | Move an item by queue item ID while preserving the current item identity. |
| `POST /upnp/queues/:queueId/play` | Play the selected item through the approved renderer. |
| `POST /upnp/queues/:queueId/resume` | Resume the current paused item. |
| `POST /upnp/queues/:queueId/pause` | Pause the current Sonuvi-owned item. |
| `POST /upnp/queues/:queueId/stop` | Stop the current item and release Sonuvi ownership. |
| `POST /upnp/queues/:queueId/next` | Stop the current item and play the next queue item when available. |
| `POST /upnp/queues/:queueId/previous` | Stop the current item and play the previous queue item when available. |

The API preserves the provider-neutral shape needed later by a Sonuvi
control point: device identity, UDN, object/container IDs, opaque selection
references, track metadata, artwork references, resource URIs, duration,
MIME/protocol information, and advertised audio fields such as sample rate and
bit depth. A transport mutation accepts only an opaque selection reference
returned by the server's recent Browse/Search state; it never accepts a raw
URL from a browser.

## Web controller integration

The three controller shells expose one `Music Sources` navigation entry:

- `controller.html` for desktop/kiosk layouts;
- `controller-tablet.html` for tablet and right-pane layouts; and
- `controller-mobile.html` for phone layouts.

All three route to the same responsive `controller-upnp.html` page. The page
keeps the existing controller theme/profile conventions, uses stable device
IDs/UDNs for source identity, and does not hard-code Qobuz as a special source.
An eventual Qobuz UPnP ContentDirectory therefore appears as an ordinary
MediaServer.

The page only shows a renderer after the authenticated server capability probe
accepts it as the approved moOde renderer. It displays the logical UPnP queue
separately from the MPD Live Queue and sends queue mutations with the current
revision. A `409` revision or ownership conflict refreshes authoritative state
and is not retried destructively. Browse/Search item titles, metadata, and
artwork are rendered as untrusted data; artwork is fetched through the
server-side opaque-reference proxy with bounded local-host validation.

Page initialization performs only discovery, ContentDirectory reads,
read-only renderer inspection, and current-queue reads. It does not create a
queue, select a track, or issue AVTransport commands. Playback remains an
explicit user action and is still guarded by the server's ownership and MPD/
Qobuz gates.

## Qobuz account status and unauthenticated browsing

The Sonuvi-only Phase 1 Qobuz integration adds the authenticated read-only
route `GET /config/qobuz/account/status`. It probes discovered MediaServer
roots and identifies the Qobuz provider only when the root contains its
`0$qobuz$` namespace. That proves MediaServer discovery, not account login;
the response therefore reports `not_connected` with authentication
`not_verified` until an approved authorization mechanism exists. The response
contains no Qobuz password, token, application material, authorization code,
cache path, or signed stream URL.

The Config page presents this state in a native-looking Qobuz Account card
with a disabled `Connect Qobuz` action. There is no browser password form and
no active OAuth callback. Future connect/status/cancel/disconnect endpoints
remain design-only and must keep credentials on moOde.

Browse and Search requests under the Qobuz object namespace receive the
sanitized `QOBUZ_AUTH_REQUIRED` error only when the bounded UPnP request times
out. Other media-server timeouts remain `UPNP_TIMEOUT`, so a generic network
failure is not mislabeled as an authentication failure. The web controller
clears its loading state within its client bound and links the operator to
Config for Qobuz status.

The installed moOde Qobuz plugin has a tracked local security override before
any account test: callback request/code/token values are not logged, the
callback reports success only after a user ID and token are returned, and the
Qobuz cache is protected by directory mode `0700` plus an upmpdcli systemd
`UMask=0077`. The patch and offline/live checks are maintained under
`ops/moode-overrides/`. This does not make the undocumented Qobuz
authentication protocol officially authorized; package upgrades require a
fresh source review and a clean patch application.

## Logical queue and ownership

The queue manager stores a bounded ordered list of generated queue item IDs.
Each item retains the media-server ID, ContentDirectory item ID, opaque
selection reference, metadata, artwork reference, duration, and advertised
resource format. It deliberately omits the resource URI: Qobuz-like servers
may return signed or short-lived URLs, so the existing playback session
re-resolves and validates the current resource during `select`/`load`.

Every mutation after queue creation requires the current integer `revision`.
The server returns `UPNP_QUEUE_REVISION_REQUIRED` for a missing revision and
`UPNP_QUEUE_REVISION_CONFLICT` with the current revision for a stale command.
The queue also binds playback to its renderer ID, session ID, and session
generation. A session owned by another UPnP controller, an active Qobuz
Connect session, an active/paused ordinary MPD session, or uncertain renderer
state rejects takeover.

The renderer's MPD queue is not the Sonuvi queue. `SetAVTransportURI` may
replace the renderer's MPD playlist, as observed with moOde/upmpdcli; Sonuvi
does not snapshot or silently restore that implementation queue. Queue
advancement occurs only after a successful renderer-state observation confirms
the prior item was playing, is now stopped, and has reached its reported
duration. Poll failures, stale sessions, and external URI changes do not
advance the queue. A process restart clears the memory-only logical queue.

The queue uses `upnp-sonuvi` as its source identity and shares the existing
session manager's MPD-mutation guard and MPD-history suppression. It does not
add a second history or Last.fm event for the MPD-backed renderer playback.

## Discovery and trust boundary

Discovery sends SSDP `M-SEARCH` only for MediaServer and MediaRenderer device
types over eligible private IPv4 interfaces. Responses are deduplicated by
advertised location, then descriptions are fetched with:

- explicit HTTP/HTTPS and no URL credentials;
- local/private IP or local naming-domain validation;
- no redirect following;
- bounded response bodies and request bodies;
- request timeouts that cover response-body reads; and
- DTD/entity rejection with bounded XML parsing.

Device descriptions may advertise relative service URLs. Sonuvi resolves them
against the description URL or `URLBase`, then applies the same local URL
policy before fetching SCPDs or issuing a read-only SOAP request.

Resource URLs are retained as authenticated local API data for the bounded
session flow. Before `SetAVTransportURI`, Sonuvi validates the resource as a
trusted local URL, requires it to originate from the selected media server,
matches its protocol/MIME data against the approved renderer's
`GetProtocolInfo` sink, and generates DIDL-Lite metadata itself. Sonuvi does
not expose a generic URL-fetch or generic SOAP route.

## ContentDirectory model

`Browse` supports `BrowseMetadata` and `BrowseDirectChildren`, bounded
pagination, and a bounded filter/sort string. `Search` is available only when
the discovered SCPD advertises the action. Sonuvi does not invent search
capabilities or assume that all servers expose artist, album, favorites, or
playlist categories.

DIDL-Lite normalization preserves:

- item/container kind and stable server IDs;
- parent and reference IDs;
- title, creator, artist(s), album artist, album, and track number;
- UPnP class and artwork URI;
- duration and parsed duration seconds;
- resource URI, protocolInfo, MIME type, DLNA/additional protocol data; and
- bounded audio resource fields such as sample frequency, bits per sample,
  channels, bitrate, size, and resolution.

Favorites and playlist writes are not implemented. No account-library
mutation is implied by a server advertising a ContentDirectory action.

## Renderer inspection

Renderer inspection loads service descriptions dynamically and reports the
advertised action set rather than assuming that every renderer supports seek,
volume, queue replacement, gapless playback, or a particular FLAC resolution.

The read-only probes are limited to:

- ConnectionManager `GetProtocolInfo`;
- AVTransport `GetTransportInfo`;
- AVTransport `GetPositionInfo`;
- AVTransport `GetMediaInfo`; and
- AVTransport `GetCurrentTransportActions`.

URI query strings are removed from the returned current/next URI diagnostics,
and the API reports whether current metadata exists without returning raw
metadata that could contain a session URL. No renderer ownership is changed.

## Relationship to moOde and future playback

The intended future path is:

```text
UPnP MediaServer ContentDirectory
        | Browse/Search
        v
Sonuvi control point and queue
        | AVTransport (future milestone)
        v
moOde UPnP renderer -> MPD -> ALSA -> CAVALLI DAC
```

Milestone 2 uses the existing moOde renderer by discovered UDN/device ID and
the expected moOde host; it does not select a renderer by friendly name. It
rejects selection while Qobuz Connect is active/stale, MPD is playing/paused,
or the renderer is loaded/active/uncertain. It captures the MPD queue hash and
never restores a queue automatically. While a Sonuvi UPnP session owns the
renderer, the normal MPD/queue mutation surfaces are rejected and the
listening-history observer is suppressed so the same MPD-backed playback is
not recorded a second time. External renderer URI changes invalidate the
session. Milestone 3 wraps this session in the logical queue described above;
Qobuz Connect remains a separate source and Sonuvi never routes queue commands
through Pibuz.

## Configuration and operations

Optional environment controls are:

- `UPNP_DISCOVERY_INTERFACES` — comma-separated interface names;
- `UPNP_DISCOVERY_TIMEOUT_MS` — SSDP response window;
- `UPNP_HTTP_TIMEOUT_MS` — bounded device/SCPD/SOAP request timeout;
- `UPNP_MAX_XML_BYTES` — device/SCPD body limit;
- `UPNP_MAX_SOAP_BYTES` — SOAP response body limit; and
- `UPNP_DISCOVERY_COOLDOWN_MS` — minimum cached-discovery interval; and
- `UPNP_MOODE_RENDERER_HOST` — approved renderer discovery host (defaults to
  `10.0.0.254`).

The service is deployed as part of Sonuvi only. No Docker, package, moOde,
Pibuz, firewall, or AirPlay change is required. Rollback consists of removing
the new UPnP module/routes and restoring the prior server entrypoint, followed
by restarting only `now-playing.service`.

## Verification status

The automated suite includes the existing Sonuvi tests plus UPnP fixtures for
SSDP, relative URL resolution, malformed/unsafe XML, response limits, SOAP
faults, DIDL-Lite metadata, ContentDirectory browsing, renderer capability
probes, bounded AVTransport actions, selection/session ownership, queue
protection, lifecycle failures, and a no-playback-mutation assertion.

The live verification records the devices and capabilities found on the
trusted LAN and captures a read-only MPD queue baseline. It must not be
interpreted as authorization to begin playback. Queue deployment and
read-only route checks do not send `SetAVTransportURI`, `Play`, `Pause`, or
`Stop`; a multi-track queue acceptance test remains separately approved and
must be coordinated step by step.

Last reviewed: 2026-10-13.
