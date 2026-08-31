---
pageType: source
id: source.playback-mode-troubleshooting
title: playback mode troubleshooting
sourceType: local-file
sourcePath: /Users/brianwis/.openclaw/workspace/docs/wiki-source/playback-mode-troubleshooting.md
ingestedAt: 2026-04-08T16:00:53.875Z
updatedAt: 2026-04-08T16:00:53.875Z
status: active
---

# playback mode troubleshooting

## Source
- Type: `local-file`
- Path: `/Users/brianwis/.openclaw/workspace/docs/wiki-source/playback-mode-troubleshooting.md`
- Bytes: 6375
- Updated: 2026-04-08T16:00:53.875Z

## Content
```text
# playback-mode troubleshooting

## Purpose

This runbook helps future agents debug issues involving:
- what is currently playing
- what art should show
- what metadata should appear
- which source of truth should be trusted first

The key lesson: there is **not one universal authority path** for playback, current-song, art, and status in this project.

Start by identifying the playback mode.

## Step 1: classify the playback mode

Use the current playback context to decide which mode you are in:
- **local file**
- **AirPlay**
- **UPnP**
- **radio / stream**
- **unresolved / fallback-driven case**

If you misclassify the mode, you will often debug the wrong authority path.

## Step 2: choose the matching authority path

### Local file
Likely truth sources:
- MPD playback state
- moOde current-song/status
- moOde `coverart.php` for art

Typical shape:
- strongest path for library-file truth
- often the cleanest case
- good first comparison point when other modes behave strangely

Check first:
- `src/services/mpd.service.mjs`
- current now-playing flow in `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`

### AirPlay
Likely truth sources:
- moOde current-song/status
- `aplmeta.txt` / AirPlay-cover logic
- AirPlay-specific metadata fallback behavior

Typical shape:
- art and metadata may not behave like local-file playback
- fresh AirPlay metadata may override simpler cover fallback assumptions

Check first:
- current now-playing flow in `moode-nowplaying-api.mjs`
- AirPlay metadata handling / `aplmeta` references
- `src/routes/art.routes.mjs`
- local override notes if `airplay-json` behavior is involved

### UPnP
Likely truth sources:
- moOde current-song/status as the immediate input
- UPnP-specific resolution logic that may bridge back to local-library truth

Typical shape:
- starts stream-like
- may try to recover a real local-library file
- art may upgrade from generic/stream-like behavior back to local `coverart.php` if resolution succeeds

Check first:
- `moode-nowplaying-api.mjs`
  - `getStreamKind(...)`
  - `resolveLibraryFileForStream(...)`
- current-song/art flow that upgrades UPnP cases into local-file cover truth when possible

Important caution:
- do **not** treat UPnP as interchangeable with generic radio/stream playback

### Radio / stream
Likely truth sources:
- moOde current-song/status as base input
- station logo
- cleanup/normalization logic
- enrichment logic
- fallback/cache behavior

Typical shape:
- most nuanced metadata pipeline
- displayed metadata may be intentionally non-literal
- enrichment may be intentionally suppressed in some cases

Check these layers in order:
1. **holdback policy**
   - some strict stations intentionally delay promotion of new metadata
2. **lookup guardrails**
   - enrichment may be skipped if metadata quality is too weak or misleading
3. **cleanup / normalization**
   - iHeart blobs, classical formatting, and program/station text may be normalized before display
4. **art / enrichment source order**
   - station logo
   - Mother Earth metadata
   - iTunes / Apple-style enrichment
   - cache-backed or `coverurl` fallback

Check first:
- radio handling in `moode-nowplaying-api.mjs`
- `config/radio-logo-aliases.json`
- `src/routes/config.diagnostics.routes.mjs`
- `src/routes/art.routes.mjs`

Important caution:
- if radio metadata looks wrong, ask whether it is being held, suppressed, cleaned, or intentionally de-bogused before assuming the system is broken

### Unresolved / fallback-driven case
Likely truth sources:
- cache-backed `/art/current.jpg`
- generic fallback state
- whatever minimal current-song/status information still survives

Typical shape:
- incomplete metadata
- weak or missing art authority
- often a symptom of another branch failing to resolve cleanly

Check first:
- fallback logic in `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- runtime/integration conditions that may have prevented the stronger branch from winning

## Step 3: choose the code layer to inspect

After you identify the playback mode, inspect the matching layer:

### Page/runtime layer
Use when:
- the symptom is primarily visual
- the wrong text/art is rendered even though backend data may already be correct

Check:
- top-level HTML entrypoints
- `scripts/index-ui.js`
- relevant page-specific runtime logic

### Route layer
Use when:
- the symptom depends on `/art/*`, `/now-playing`, `/next-up`, diagnostics, queue, or ratings endpoints
- mixed authority or fallback behavior is suspected

Check:
- `src/routes/art.routes.mjs`
- `src/routes/queue.routes.mjs`
- `src/routes/rating.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- `src/routes/config.runtime-admin.routes.mjs` when host/runtime behavior matters

### MPD service/helper layer
Use when:
- the issue looks like low-level playback truth or command/state mismatch

Check:
- `src/services/mpd.service.mjs`

### Runtime-admin / local-override layer
Use when:
- moOde display/browser/Peppy/service behavior may be involved
- host-side state appears out of sync with app expectations

Check:
- `src/routes/config.runtime-admin.routes.mjs`
- `integrations/moode/README.md`
- `ops/moode-overrides/README.md`
- `local-environment.md`

## Step 4: choose verification based on change type

If you change behavior while debugging, decide whether the change is:
- frontend/page/style only
- route/service/config/runtime-admin behavior
- immediate host-side control action
- host override change

Then use:
- `deployment-and-ops.md`
- `workflows.md`

to decide whether you need:
- UI refresh only
- endpoint verification
- API restart
- host-side verification

## Quick heuristics

- If the mode is unclear, determine that before doing anything else.
- If the symptom is radio/stream-related, assume the metadata may be intentionally processed before display.
- If the symptom is UPnP-related, check whether the system is trying to recover local-library truth.
- If the symptom is AirPlay-related, inspect `aplmeta`/AirPlay cover handling before assuming art fallback is broken.
- If the symptom is visible/UI-facing, do not assume it is frontend-only; this project often crosses page, route, integration, and host/runtime layers.

## Best companion pages

- `source-map.md`
- `integrations.md`
- `workflows.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `gotchas-and-lessons.md`

```

## Notes
<!-- openclaw:human:start -->
<!-- openclaw:human:end -->
