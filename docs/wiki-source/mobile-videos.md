# Mobile Video API

The native Sonuvi app accesses videos through the existing paired mobile
session. Video playback is separate from MPD, the music catalog, and every
server queue.

## Configuration

- `MOBILE_VIDEO_ROOT` — configured video storage root. It defaults to the
  installation's `PI4_MOUNT_BASE`, which is the mounted SSD location.
- `MOBILE_VIDEO_CATALOG_PATH` — protected server-side registry for opaque
  video and folder IDs. It defaults to `var/mobile-video-catalog.json`.

The registry assigns random opaque IDs; IDs are not derived from titles or
filesystem paths. The API never returns absolute paths.

## Routes

All routes require `Authorization: Bearer <mobile-session-token>`.

### `GET /v1/mobile/catalog/videos`

Returns schema `sonuvi.mobile-video-catalog.v1` with bounded pagination:

```text
GET /v1/mobile/catalog/videos?cursor=<opaque>&limit=<1..100>&folderID=<optional>
```

Each item includes `videoID`, title, filename, optional folder identity,
MIME type, format, size, duration when `ffprobe` can read it, modification
time, safe metadata, thumbnail availability, playback availability, and
opaque `thumbnailURL`/`mediaURL` values. `.mp4`, `.m4v`, and `.mov` are
playable. `.mkv` is listed as unsupported until a verified native playback
path exists.

### Thumbnail and media

- `GET /v1/mobile/catalog/videos/:videoID/thumbnail` returns a bounded JPEG
  thumbnail generated from the authorized source file.
- `GET /v1/mobile/catalog/videos/:videoID/media` serves the original playable
  file with its stored MIME type and byte-range support (`206`,
  `Content-Range`, and `Accept-Ranges`). No transcoding is performed.

Every lookup revalidates the file beneath the configured root and rejects
symlink entries and path escapes. A missing or detached root returns `503`
with `video storage is unavailable`; an individual missing ID returns `404`.
Video routes never add files to MPD or mutate any queue.
