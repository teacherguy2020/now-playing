# Seeburg and Multiphone priority selections

Now Playing treats Seeburg wallbox selections and Multiphone selections as one
shared customer-request queue. Both integration routes mark inserted tracks as
`source`-specific entries with `priority: "jukebox"` and a monotonic sequence.

## Integration routes

| Source | Selection endpoint | Playlist |
| --- | --- | --- |
| Seeburg | `POST /integrations/seeburg/selection` | `Seeburg Playlist` |
| Multiphone | `POST /integrations/multiphone/selection` | `Multiphone Playlist` |

Both routes require the Now Playing track key and accept a numbered selection.
Both also expose a read-only playlist mapping endpoint for commissioning and
verification.

## Priority behavior

1. If ordinary music is playing, the customer selection is inserted directly
   before the current track and playback starts from that selection.
2. If a Seeburg or Multiphone priority track is already playing, the new
   selection is appended behind the current priority track and any already
   pending priority tracks.
3. The shared priority segment stays ahead of ordinary playback, preserving
   FIFO order across both sources.
4. When the active queue is stopped or paused and no priority track is active,
   a Multiphone request can begin a fresh jukebox session and clear stale
   ordinary queue content before inserting its selection. Seeburg requests do
   not clear the queue.

Multiphone may explicitly request `playNow`, which promotes an existing
pending matching track or starts the selected track immediately. It may also
use deferred playback while Mabel finishes its local retrieval and announcement
sequence.

The service persists priority-entry metadata in
`data/jukebox-entries.json`, reconciles it with the live MPD queue, and recovers
known entries after a service restart. The MPD queue remains the playback
authority; the metadata identifies which queue items belong to the shared
customer-priority segment.

## Ownership boundary

The Shyvers Multiphone/Mabel conversation and hardware live in the separate
[`shyvers-multiphone-mabel`](https://github.com/teacherguy2020/shyvers-multiphone-mabel)
repository. This repository owns the validated selection endpoints and the
queue/playback behavior described here.
