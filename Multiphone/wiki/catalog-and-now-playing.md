# Catalog and Now Playing integration

## Current catalog

The initial test catalog is the Now Playing playlist named:

```text
Multiphone Playlist
```

It currently contains 170 tracks, so the software vertical slice accepts playlist
positions 1 through 170. The historical machine's three-digit selections are
different: values such as `298` are catalog keys, not necessarily positions in a
modern playlist. A deterministic mapping layer will be added when the physical
catalog is established.

Mabel must never infer a title or artist from a number. The Now Playing service is
the authority for resolution and returns the selected file and metadata.

## Selection endpoint

The physical cylinder's three-digit numbers are keys, not sequential positions
in a modern playlist. For example:

```text
298 → Elvis Presley → Jailhouse Rock
222 → Chuck Berry   → Johnny B. Goode
225 → The Virtues   → Guitar Boogie Shuffle
```

The mapping must come from deterministic catalog data. Mabel must never invent a
mapping from memory.

```http
POST /integrations/multiphone/selection
Content-Type: application/json

X-Track-Key: <protected key>

{"number": 7}
```

The read-only commissioning route is:

```http
GET /integrations/multiphone/playlist
```

The endpoint uses the configured `Multiphone Playlist` and shares the server-side
jukebox classification with Seeburg.

## Jukebox-priority FIFO behavior

Every integration selection is marked server-side as:

```json
{"source":"multiphone","priority":"jukebox"}
```

Seeburg uses the same priority class. The service tracks MPD `songid` values and
persists metadata in `data/jukebox-entries.json`; it does not identify provenance
from filenames alone.

### First selection

If an ordinary track is playing, the first Multiphone request is inserted ahead of
the ordinary queued tracks and starts immediately. The interrupted ordinary track
is not resumed separately; the remaining normal queue stays behind the jukebox
segment.

If ordinary playback is paused or stopped, the service clears the ordinary queue,
adds the selection, and starts it immediately.

### Later selections

If a jukebox track is actively playing, later selections are inserted immediately
after the current and already-pending jukebox tracks. They do not interrupt the
current record and retain strict FIFO order:

```text
D6 [playing] → A4 → K7 → normal queue...
```

After the jukebox segment finishes, MPD naturally continues into the preserved
normal queue.

An explicit `play_multiphone_now` request is the exception. It promotes the
already-selected record immediately only when the caller clearly asks for it;
ordinary requests always append.

## Reliability details

- Seeburg and Multiphone mutations share a transaction lock.
- Metadata is loaded at service startup and reconciled against live MPD state.
- A persisted session marker and playlist-based recovery protect against a missing
  individual MPD metadata entry during a fresh Multiphone session.
- The MPD parser recognizes queue records even when blank separators are omitted.
- The service reports whether playback started, whether the queue was cleared, and
  whether the request joined a jukebox stack.
- The service fails safely rather than starting an unverified stale queue.

These safeguards matter because MPD `songid`/position data is the playback state,
while the source/priority classification is Now Playing application metadata.
