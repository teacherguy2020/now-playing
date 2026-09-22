---
title: Mabel integration
page_type: child
topics:
  - integration
  - playback
  - runtime
confidence: high
---

# Mabel Integration

Mabel is the Shyvers Multiphone operator. The conversation, handset, and
hardware implementation belong in the separate
[`shyvers-multiphone-mabel`](https://github.com/teacherguy2020/shyvers-multiphone-mabel)
repository. Now Playing owns the bounded, authenticated playback and queue
endpoints that Mabel is allowed to call.

## Current boundary

```text
iPad voice/text handset
        ↓
Mac Mabel bridge
        ↓ bounded authenticated API calls
Now Playing :3101
        ↓
MPD/moOde and approved integrations
```

Permanent credentials and conversation state remain on the Mac bridge. The
handset/model does not receive unrestricted HTTP, shell, MPD, or device access.

## Current VIP music actions

The bridge can request bounded album, artist, playlist, multi-artist mix, and
read-only current-playback operations. VIP music requests intentionally use
the one-star rating as an omission filter where documented. Queue creation
must use the validated Now Playing API path and keep MPD as playback authority.

Room automation such as lighting and Harmony activities is planned, not a
current Now Playing feature. Future actions should use an allow-listed action
registry with validation, timeout, idempotency, cleanup, and credential
boundaries.

## Related pages

- [integrations.md](integrations.md)
- [jukebox-priority-model.md](jukebox-priority-model.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
- [developer-reference.md](developer-reference.md)

*Last reviewed: 2026-09-22 America/Chicago*
