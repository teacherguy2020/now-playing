# Config Route Refactor Inventory (Pi-first)

Generated: 2026-02-16

## Modules and endpoints

### config.alexa-alias.routes.mjs (12)
- POST /config/artist-alias-suggestion
- POST /mpd/artist-alias-suggestion
- POST /config/album-alias-suggestion
- POST /mpd/album-alias-suggestion
- POST /config/alexa-heard-artist
- POST /mpd/alexa-heard-artist
- POST /config/alexa-heard-album
- POST /mpd/alexa-heard-album
- POST /config/alexa-heard-playlist
- POST /mpd/alexa-heard-playlist
- POST /config/playlist-alias-suggestion
- POST /mpd/playlist-alias-suggestion

### config.diagnostics.routes.mjs (2)
- POST /config/diagnostics/playback
- GET /config/diagnostics/queue

### config.library-health-art.routes.mjs (2)
- GET /config/library-health/album-art
- POST /config/library-health/album-art

### config.library-health-batch.routes.mjs (3)
- GET /config/library-health/genre-folders
- POST /config/library-health/genre-batch
- POST /config/library-health/rating-batch

### config.library-health-genre.routes.mjs (2)
- GET /config/library-health/album-genre
- POST /config/library-health/album-genre

### config.library-health-performers.routes.mjs (2)
- GET /config/library-health/album-performers-suggest
- POST /config/library-health/album-performers-apply

### config.library-health-read.routes.mjs (3)
- GET /config/library-health
- GET /config/library-health/missing-artwork
- GET /config/library-health/album-tracks

### config.queue-wizard-apply.routes.mjs (1)
- POST /config/queue-wizard/apply

### config.queue-wizard-basic.routes.mjs (4)
- GET /config/queue-wizard/options
- GET /config/queue-wizard/playlists
- POST /config/queue-wizard/load-playlist
- GET /config/queue-wizard/playlist-preview

### config.queue-wizard-collage.routes.mjs (1)
- POST /config/queue-wizard/collage-preview

### config.queue-wizard-preview.routes.mjs (1)
- POST /config/queue-wizard/preview

### config.queue-wizard-vibe.routes.mjs (5)
- POST /config/queue-wizard/vibe-start
- GET /config/queue-wizard/vibe-status/:jobId
- POST /config/queue-wizard/vibe-cancel/:jobId
- GET /config/queue-wizard/vibe-nowplaying
- POST /config/queue-wizard/vibe-nowplaying

### config.ratings-sticker.routes.mjs (4)
- GET /config/ratings/sticker-status
- POST /config/ratings/sticker-backup
- GET /config/ratings/sticker-backups
- POST /config/ratings/sticker-restore

### config.runtime-admin.routes.mjs (8)
- GET /config/runtime
- POST /config/runtime/resolve-host
- POST /config/runtime/check-env
- POST /config/runtime/ensure-podcast-root
- POST /config/alexa/check-domain
- POST /config/runtime
- POST /config/restart-api
- POST /config/restart-services

## Notes
- `src/routes/config.routes.mjs` is now a compatibility no-op export.
- All route registrations are centralized in `moode-nowplaying-api.mjs`.
- Refactor remains uncommitted/unpushed pending explicit approval.
