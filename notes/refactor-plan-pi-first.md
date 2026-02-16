# Refactor Plan (Pi-first, no git until verified)

Goal: Reduce risk while splitting `moode-nowplaying-api.mjs` / `src/routes/config.routes.mjs` into maintainable modules.

Rules:
1. Tiny changes only (one concern per step)
2. Deploy each step to Pi (`10.0.0.233`)
3. Run smoke tests after each deploy
4. No commit/push until user explicitly approves

---

## Baseline (before refactor)

Capture current behavior:
- `/config/runtime`
- `/config/queue-wizard/options`
- `/config/diagnostics/queue`
- `/config/diagnostics/playback` (shuffle toggle)
- `/config/queue-wizard/playlists`
- `/config/queue-wizard/playlist-preview`
- `/config/queue-wizard/preview`
- `/config/queue-wizard/apply` (dry-safe with append + 1 track when possible)
- `/podcasts`
- `/podcasts/nightly-status`
- `/rating/current`

UI sanity pages:
- config.html
- diagnostics.html
- library-health.html
- queue-wizard.html
- podcasts.html

---

## Phase 1 (safe extraction): Queue Wizard routes split

### Step 1.1
Create `src/routes/config.queue-wizard.routes.mjs` and move only these endpoints from `config.routes.mjs`:
- `GET /config/queue-wizard/options`
- `POST /config/queue-wizard/preview`
- `POST /config/queue-wizard/collage-preview`
- `POST /config/queue-wizard/apply`
- `GET /config/queue-wizard/playlists`
- `POST /config/queue-wizard/load-playlist`
- `GET /config/queue-wizard/playlist-preview`
- `POST /config/queue-wizard/vibe-start`
- `GET /config/queue-wizard/vibe-status/:jobId`
- `POST /config/queue-wizard/vibe-cancel/:jobId`
- `GET /config/queue-wizard/vibe-nowplaying`
- `POST /config/queue-wizard/vibe-nowplaying`

Keep exact behavior/signatures.

### Step 1.2
Wire new module from main/bootstrap with the same deps object.

### Step 1.3
Deploy to Pi and run smoke tests + UI checks.

Stop and confirm with user before Phase 2.

---

## Phase 2: Diagnostics routes split from config.routes

Move:
- `POST /config/diagnostics/playback`
- `GET /config/diagnostics/queue`

Deploy + test.

---

## Phase 3: Ratings sticker/admin routes split

Move sticker backup/restore/status routes.

Deploy + test.

---

## Phase 4: Runtime/config admin split

Move runtime read/write/check-env/resolve-host/restart routes.

Deploy + test.

---

## Smoke test command set (Pi)

Use track key from `/config/runtime`.

- `curl -s http://10.0.0.233:3101/config/runtime`
- `curl -s -H 'x-track-key: <KEY>' http://10.0.0.233:3101/config/queue-wizard/options`
- `curl -s -H 'x-track-key: <KEY>' http://10.0.0.233:3101/config/queue-wizard/playlists`
- `curl -s -H 'x-track-key: <KEY>' http://10.0.0.233:3101/config/diagnostics/queue`
- `curl -s -X POST -H 'Content-Type: application/json' -H 'x-track-key: <KEY>' -d '{"action":"shuffle"}' http://10.0.0.233:3101/config/diagnostics/playback`

(Plus UI open/refresh checks)

---

## Rollback strategy

If any step fails:
1. Re-sync previous known-good file(s) from local backup
2. `pm2 restart api`
3. Re-run smoke tests
4. Stop and report exact diff that caused break
