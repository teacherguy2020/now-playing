# route ownership map

## Purpose

This page maps major `now-playing` behaviors to the route modules and bootstrap files that most plausibly own them.

It exists because the wiki now has much better conceptual coverage of:
- playback
- queue behavior
- Queue Wizard
- controller queue UI
- config/runtime and integration branches

But the next big question is no longer only:
- “what is this feature?”

It is:
- **which route file or bootstrap point actually owns it?**

This page is the bridge between conceptual pages and code-level ownership.

## Important scope note

This page is intentionally practical rather than pretending to be a final exhaustive route inventory.

What it tries to do:
- identify the strongest current route/file ownership anchors
- separate verified anchors from still-open areas
- help future agents know where to look first

What it does **not** try to do yet:
- fully enumerate every endpoint in the repo
- claim every caller/callee chain is fully proven
- replace deeper code-first tracing where exact contracts still matter

So this is a working ownership map.

## Why this page matters

The `now-playing` codebase is not a clean “thin routes, fat services” system.

Current wiki work already shows that:
- route modules often own substantial behavior directly
- top-level HTML files are first-class ownership points for user-facing surfaces
- reusable services exist, but selectively
- route families are often the fastest way to understand real behavior

That means future debugging and documentation work needs a page that says:
- which behavior likely starts in which route file
- when to look at bootstrap registration versus focused route modules
- when a UI problem is really a route-ownership problem

## Ownership model at a glance

A good current interpretation is:

### 1. Top-level page files own user-facing surface behavior
Examples:
- `controller-now-playing.html`
- `controller-queue.html`
- `config.html`
- `youtube.html`
- `display.html`

These pages are real ownership points for surface logic, not just passive templates.

### 2. `moode-nowplaying-api.mjs` owns server/bootstrap assembly
This is the main API assembly point.

Current wiki work already says it:
- creates the Express app
- registers major route families
- also directly wires some endpoint families such as YouTube-related routes
- owns the final `app.listen(...)`

So when the question is “where does the server wire this in?”, start here.

### 3. Focused route modules often own real feature behavior
This is one of the strongest architectural lessons from current work.

Examples already verified elsewhere include route modules for:
- queue behavior
- queue-wizard behavior
- config/runtime admin
- browse behavior
- art behavior
- ratings behavior
- controller-profile behavior

### 4. Services and shared libs are support layers, not always the main owners
Examples:
- `src/services/mpd.service.mjs` = low-level reusable MPD primitives
- `src/lib/browse-index.mjs` = shared browse/index helper/data layer

Important distinction:
- these are important support layers
- but route files often still own the higher-order operational behavior

## Strong current ownership anchors

These are the strongest currently documented route/file ownership anchors.

## API bootstrap and registration

### `moode-nowplaying-api.mjs`
Current best role:
- main API bootstrap and route registration point
- start here when you need to know whether a feature is app-wide, bootstrap-wired, or directly assembled at the top level

### Why it matters
This file is the practical entrypoint for API assembly questions.
It is the first place to look before guessing that a feature is hidden under a generic backend framework abstraction.

## Queue and queue-advance ownership

### `src/routes/queue.routes.mjs`
Current best role:
- strongest current route-level owner for queue-head deletion, advance, resolve, prime, and fallback behavior
- one of the main owners of concrete queue-operational logic

### Related conceptual pages
- `queue-and-playback-model.md`
- `controller-queue-interface.md`
- `api-playback-and-queue-endpoints.md`

### Important nuance
This is a strong route-level ownership anchor for queue operations, but it does not automatically mean every queue-related UI action lives only here.
The queue UI page still likely sits over a broader queue API contract that may involve more than one module.

## Queue Wizard ownership

Queue Wizard already has some of the clearest route-module anchors in the project.

### `src/routes/config.queue-wizard-basic.routes.mjs`
Current best role:
- basic Queue Wizard entry-point behavior

### `src/routes/config.queue-wizard-preview.routes.mjs`
Current best role:
- preview-side Queue Wizard logic
- one of the strongest current route-level ownership anchors for Queue Wizard internals

### `src/routes/config.queue-wizard-apply.routes.mjs`
Current best role:
- apply-side Queue Wizard behavior

### `src/routes/config.queue-wizard-vibe.routes.mjs`
Current best role:
- Vibe / discovery-oriented Queue Wizard behavior

### Shared support layer
- `src/lib/browse-index.mjs`

### Related conceptual pages
- `queue-wizard-internals.md`
- `queue-and-playback-model.md`
- `api-playback-and-queue-endpoints.md`
- `config-lastfm-and-scrobbling.md`

### Important nuance
Queue Wizard is one of the best examples of the project’s route-heavy design.
Its behavior is not just “some UI calling a monolithic service.”
It has distinct route modules for basic, preview, apply, and Vibe-oriented ownership.

## Browse and recent-library ownership

### `src/routes/config.browse.routes.mjs`
Current best role:
- browse and recent-surface route ownership
- startup cache-warming/fallback behavior for albums, podcasts, playlists, and radio favorites
- practical route-level owner for several browse-adjacent controller surfaces

### Shared support layer
- `src/lib/browse-index.mjs`

### Related conceptual pages
- `source-map.md`
- `queue-wizard-internals.md`
- future media-library branch pages

### Important nuance
This route family is a good example of route modules owning real behavior while shared library code supplies browse-index support underneath.

## Runtime-admin and moOde/display control ownership

### `src/routes/config.runtime-admin.routes.mjs`
Current best role:
- runtime config mutation
- environment discovery
- moOde/browser/display control
- SSH-backed operational side effects

### Related conceptual pages
- `api-config-and-runtime-endpoints.md`
- `config-network-and-runtime.md`
- `display-launch-and-wrapper-surfaces.md`
- `deployment-and-ops.md`

### Important nuance
This is one of the strongest examples of a route module owning not only validation but real operational behavior.
It bridges app-side config actions to live host/runtime effects.

## Diagnostics / playback test ownership

### `src/routes/config.diagnostics.routes.mjs`
Current best role:
- diagnostics-facing route ownership
- direct playback test/control paths such as `/config/diagnostics/playback`
- diagnostic/support visibility into adjacent playback/queue/Alexa state

### Related conceptual pages
- `api-playback-and-queue-endpoints.md`
- `playback-authority-by-mode.md`
- `diagnostics-interface.md`

### Important nuance
This module is a strong anchor for diagnostics-style playback control, but not necessarily the only practical owner of playback behavior overall.
It is better understood as a control/testing entry point into broader playback state.

## Art ownership

### `src/routes/art.routes.mjs`
Current best role:
- current/track art serving
- cache fill/reuse
- resize behavior
- blurred-background generation
- mode-sensitive current-art resolution behavior

### Related conceptual pages
- `playback-authority-by-mode.md`
- `display-interface.md`
- `local-environment.md`

### Important nuance
This module is especially important because art authority is mode-sensitive.
It is one of the places where local file, AirPlay, UPnP, radio/stream, and fallback cases stop being abstract concepts and become route-level behavior.

## Ratings ownership

### `src/routes/rating.routes.mjs`
Current best role:
- `/rating` and `/rating/current` route ownership
- file/current-song rating reads and writes

### Related conceptual pages
- `config-ratings.md`
- `api-config-and-runtime-endpoints.md`

## Track serving ownership

### `src/routes/track.routes.mjs`
Current best role:
- `/track` serving
- Alexa-gated track access
- range support
- optional transcoding/cache behavior

### Related conceptual pages
- `integrations.md`
- Alexa-related pages
- future route/file proof pages

## Controller-profile ownership

### `src/routes/config.controller-profile.routes.mjs`
Current best role:
- controller/mobile/tablet saved profile state
- practical backend owner for profile-backed controller behavior

### Related conceptual pages
- `tablet-interface.md`
- `phone-interface.md`
- `controller-kiosk-mode.md`

## Config aggregation ownership

### `src/routes/config.routes.index.mjs`
Current best role:
- registration/aggregation hub for many focused config, library-health, and queue-wizard route modules

### Why it matters
When the question is not “who owns this exact endpoint?” but rather:
- “where are the config-side route families gathered?”

this is one of the first places to inspect.

## Supporting service and library ownership

These files are important, but they should be understood as support-layer ownership rather than always the topmost feature owner.

## `src/services/mpd.service.mjs`
Current best role:
- reusable MPD primitives
- play/pause/stop/control helpers
- raw query/status parsing support

### Important nuance
This file is foundational, but the current repo pattern suggests many higher-order playback and queue behaviors still live in route modules that call into MPD helpers rather than being fully centralized here.

## `src/lib/browse-index.mjs`
Current best role:
- browse-index generation/support
- shared data/helper layer for browse and Queue Wizard features

### Important nuance
This is a strong shared-data layer, not the sole owner of the features that depend on it.

## Ownership by behavior family

This section is the practical “where should I look first?” map.

## If the issue is direct playback controls
Start with:
- `src/routes/config.diagnostics.routes.mjs`
- `src/services/mpd.service.mjs`
- `moode-nowplaying-api.mjs`

Why:
- diagnostics playback control is one of the clearest verified route-entry paths
- MPD primitives likely support the underlying transport action
- bootstrap may clarify how the route family is registered

## If the issue is queue advance / next-up / queue head behavior
Start with:
- `src/routes/queue.routes.mjs`
- `src/services/mpd.service.mjs`
- `moode-nowplaying-api.mjs`

Why:
- queue route ownership is one of the strongest verified anchors in current work

## If the issue is Queue Wizard preview/apply behavior
Start with:
- `src/routes/config.queue-wizard-preview.routes.mjs`
- `src/routes/config.queue-wizard-apply.routes.mjs`
- `src/routes/config.queue-wizard-basic.routes.mjs`
- `src/routes/config.queue-wizard-vibe.routes.mjs`
- `src/lib/browse-index.mjs`

Why:
- this is one of the best-proven route families in the wiki so far

## If the issue is controller queue UI backing
Start with:
- `controller-queue.html`
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- `moode-nowplaying-api.mjs`

Why:
- the queue page is clearly a first-class UI surface
- but its exact backing contract still needs deeper proof, so these are the strongest current anchors rather than a final exact list

## If the issue is browse/recent/library drill-down data
Start with:
- `src/routes/config.browse.routes.mjs`
- `src/lib/browse-index.mjs`
- relevant controller HTML surface

## If the issue is moOde display/runtime/browser target behavior
Start with:
- `src/routes/config.runtime-admin.routes.mjs`
- `moode-nowplaying-api.mjs`
- relevant display/controller surface
- `ops/moode-overrides/` or `integrations/moode/` if local runtime behavior may differ from project defaults

## If the issue is art/current-art/blurred background behavior
Start with:
- `src/routes/art.routes.mjs`
- relevant display/controller surface
- `src/services/mpd.service.mjs` if playback-side identity is relevant
- local moOde/AirPlay override material if mode-specific live behavior is involved

## If the issue is ratings or current-song rating
Start with:
- `src/routes/rating.routes.mjs`
- relevant controller/config surface

## What is still open / not yet fully proven

This page should stay honest about the remaining gaps.

Still not fully locked down:
- the exact full backend contract behind `controller-queue.html`
- the exact caller-to-route chain for every queue UI action
- the full route inventory for direct playback actions beyond current diagnostics-heavy anchors
- the precise ownership split between bootstrap-level inline endpoint wiring and focused route modules for some integrations
- broader route/file ownership for some radio/playlist-specific behavior outside the currently verified browse-side anchors

## Practical guidance for future agents

When you need exact truth:
1. start with the conceptual page for the feature
2. use this route-ownership map to choose the best code anchor
3. check `moode-nowplaying-api.mjs` to confirm wiring
4. only then widen into services/libs/ops overrides as needed

That order matches the real shape of the project better than assuming a clean layered abstraction first.

## Relationship to other pages

This page should stay linked with:
- `source-map.md`
- `architecture.md`
- `api-service-overview.md`
- `api-playback-and-queue-endpoints.md`
- `queue-wizard-internals.md`
- `controller-queue-interface.md`

## Current status

At the moment, this page gives the wiki a needed next-step bridge:
- from concepts to code ownership
- from surfaces to route modules
- from “what feature is this?” to “where should I inspect first?”

That is exactly the kind of map the Phase 2 branch needed next.
