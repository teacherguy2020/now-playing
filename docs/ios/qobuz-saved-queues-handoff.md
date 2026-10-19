# Qobuz Connect saved queues — native iOS handoff

Last reviewed: 2026-10-19 America/Chicago

## Live status

The Server/PiBuZ workflow is live and verified on the development receiver.
The permanent `Real Group 40th` record was preserved. A disposable 30-track
record was loaded through the public mobile route and reached
`authoritative_readback_verified`; the receiver then reported the first saved
track playing with 30 queue items.

The PiBuZ package currently installed on moOde is:

```text
2.5.1.sonuvi1.sse1.cursorfix2.b5ownership3.mdnsavahi.qsaved2.20261019
```

The native app still has compatibility work before it can display or play
these records. The live Server already returns the records and capabilities;
the iOS policy currently rejects that valid response.

## Authentication and availability

Every route below uses the existing `mobile-api` bearer session. The mobile
client must not call PiBuZ directly, submit a track vector, or supply a host,
SSH key, operation transport, or receiver identity.

Read-only list/detail operations do not require an active Connect session:

```text
GET  /v1/mobile/qobuz-connect/saved-queues
GET  /v1/mobile/qobuz-connect/saved-queues/:savedQueueId
```

The list and detail responses include:

```json
{
  "capabilities": {
    "capture": true,
    "list": true,
    "open": true,
    "rename": true,
    "delete": true,
    "restore": true,
    "play": true
  },
  "restoration": {
    "available": true,
    "reason": "requires an active Qobuz Connect session on the PiBuZ receiver"
  }
}
```

`restore`/`play` being true is not an error. A saved queue can be browsed
while Connect is inactive, but playback requires a fresh
`confirmed-active` PiBuZ ownership proof at submission time.

## Capture/save

```http
POST /v1/mobile/qobuz-connect/saved-queues
Authorization: Bearer <mobile-session>
Content-Type: application/json

{"title":"Diana Krall set"}
```

Success is `201` with the saved record. Capture requires:

- active, confirmed PiBuZ ownership;
- an available authoritative queue;
- `timingStable: true`;
- a current track that matches the queue cursor.

The Server preserves duplicate track occurrences and queue order. PiBuZ's
`history` is recent-first playback context and can contain entries retained
from before a queue replacement. When the current queue is at index zero,
capture correctly saves `currentTrack + upcoming` and excludes unrelated
retained history. A nonzero cursor is captured only when the available
history can be proven to be the queue prefix; otherwise capture fails closed
with `409 QOBUZ_QUEUE_CAPTURE_REJECTED`.

Other record operations:

```text
PATCH  /v1/mobile/qobuz-connect/saved-queues/:savedQueueId
         {"title":"Renamed queue"}
DELETE /v1/mobile/qobuz-connect/saved-queues/:savedQueueId
```

## Play a saved queue

```http
POST /v1/mobile/qobuz-connect/saved-queues/:savedQueueId/play
Authorization: Bearer <mobile-session>
Content-Type: application/json

{"confirm":true,"startIndex":0}
```

`confirm:true` is mandatory because this replaces the receiver's live Qobuz
queue. `startIndex` defaults to zero and must be within the saved occurrence
vector. A successful submission returns `202` while PiBuZ publishes and
verifies the replacement:

```json
{
  "ok": true,
  "operationId": "<uuid>",
  "state": "publication_pending",
  "operationStatus": {
    "state": "publication_pending",
    "track_count": 30,
    "start_index": 0,
    "expected_queue_version": {"major": 19, "minor": 1},
    "cloud_queue_version": null
  },
  "cloudAcceptance": "unverified"
}
```

Poll the typed status route; do not resubmit after an ambiguous result:

```text
GET /v1/mobile/qobuz-connect/saved-queues/operations/:operationId
```

Successful terminal readback is:

```json
{
  "ok": true,
  "status": 200,
  "operationId": "<uuid>",
  "state": "authoritative_readback_verified",
  "operationStatus": {
    "state": "readback_verified",
    "expected_queue_version": {"major": 19, "minor": 1},
    "cloud_queue_version": {"major": 20, "minor": 1},
    "reason_code": null
  },
  "cloudAcceptance": "unverified"
}
```

The public state mapping is:

- `publication_pending` / `cloud_confirmed` → continue polling;
- `authoritative_readback_verified` → success;
- `rejected` → show the typed failure and refresh ownership/queue;
- `timed_out` → status-only recovery, never an automatic replay;
- `ambiguous` / `unknown` → do not retry automatically; require a fresh
  explicit user decision after status and current queue inspection.

Representative errors include `QOBUZ_CONNECT_OWNERSHIP_UNAVAILABLE`,
`QOBUZ_QUEUE_VERSION_CONFLICT`, `QOBUZ_QUEUE_LOAD_REJECTED`,
`SAVED_QUEUE_OPERATION_IN_FLIGHT`, and `BRIDGE_UNAVAILABLE`.

## Existing Qobuz controls

The established Server routes remain the control contract:

```text
POST /v1/mobile/qobuz-connect/play
POST /v1/mobile/qobuz-connect/resume
POST /v1/mobile/qobuz-connect/pause
POST /v1/mobile/qobuz-connect/next
POST /v1/mobile/qobuz-connect/previous
POST /v1/mobile/qobuz-connect/seek
POST /v1/mobile/qobuz-connect/queue/jump
```

They require the current Qobuz track ID and, where available, current queue
index. The live proof confirmed pause, resume, seek, next, previous, and a
forward queue jump. Backward queue navigation is represented by `previous`;
PiBuZ correctly rejects an unsupported backward `queue/jump` as
`QOBUZ_QUEUE_HISTORY_UNSUPPORTED`.

## iOS work still required

The current native client has three compatibility defects/gaps:

1. `MobileSavedQobuzQueuePolicy` rejects list/detail responses when
   `capabilities.restore` or `capabilities.play` is true, even though those
   are the live Server capabilities.
2. The API client/model has no saved-queue play method or operation-status
   polling, and the detail UI still says restoration is coming later.
3. The live queue projection requires `history.count <= currentIndex`. That
   is not a valid Server invariant: `history` is recent-first playback
   context, while `currentIndex` addresses the current queue and
   `currentTrack + upcoming` is the queue order. After loading a queue at
   index zero, PiBuZ can report retained history plus all 29 upcoming tracks.
   The projection must keep the upcoming queue instead of converting this
   valid response into “The Server could not confirm current PiBuZ playback
   ownership.”

The Server now serializes `timingStable` so the existing iOS save preflight
can make a real decision. No iOS source was changed in this Server handoff.
