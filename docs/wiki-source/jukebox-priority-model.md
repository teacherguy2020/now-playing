---
title: jukebox priority model
page_type: child
topics:
  - integration
  - queue
  - playback
confidence: high
---

# Jukebox Priority Model

Seeburg wallbox and Multiphone selections share a customer-request priority
segment. Mills is intentionally different because the physical mechanism is
already playing the record and Now Playing supplies only a display surrogate.

## Shared Seeburg/Multiphone behavior

- selections are authenticated and resolved against the configured MPD
  playlist;
- priority entries are tagged by source and use a monotonic sequence;
- a selection during ordinary playback starts immediately while preserving the
  ordinary queue behind the priority segment;
- later Seeburg/Multiphone selections remain FIFO behind active/pending priority
  entries; and
- priority-entry metadata is reconciled with the live MPD queue after restart.

MPD remains playback authority. The extra metadata identifies the priority
segment; it does not replace MPD queue state.

## Mills distinction

Mills accepts physical slots only during an active session. The mechanism owns
selection and audio; Now Playing resolves the selected slot for metadata,
artwork, display state, and Denon/Harmony orchestration. Mills does not add a
digital track to the shared priority queue.

## Ownership

Now Playing owns the validated selection endpoints and queue/playback behavior.
Seeburg firmware and Multiphone/Mabel conversation/hardware remain in their
separate projects. See [integrations.md](integrations.md) and
[mills-throne-integration.md](mills-throne-integration.md).

*Last reviewed: 2026-09-22 America/Chicago*
