# source map

## Purpose

This page is the navigation map for the `now-playing` codebase.

It should help future agents and humans answer questions like:
- where should I look first?
- what directory probably owns this behavior?
- what parts are runtime/integration-heavy vs UI-heavy?

## High-level repository areas

### `moode-nowplaying-api.mjs`
Current main server/bootstrap assembly point for the API.

Related API branch pages:
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`

Observed repo evidence:
- creates the Express app
- registers `registerArtRoutes`, `registerRatingRoutes`, `registerQueueRoutes`, `registerAllConfigRoutes`, and `registerTrackRoutes`
- also contains additional endpoint wiring such as YouTube-related routes and the final `app.listen(...)`

Practical implication:
- for real API assembly/runtime wiring questions, start here before assuming a root `index.js`-style entrypoint owns the server

### `src/`
Primary application source tree.

Important subareas visible from the repo layout:
- `src/config/`
- `src/lib/`
- `src/routes/`
- `src/services/`
- `src/private/`

Use this area first when the task is about application logic, routing, service behavior, or structured source changes.

Observed refinement:
- `src/lib/` currently looks more like a shared utility/data-helper layer than a generic rendering bucket.
- `src/routes/` contains many focused route modules that are assembled by the main server bootstrap rather than standing alone.

### `scripts/`
Project scripts and helper flows.

Check here when the task involves:
- utilities
- operational helpers
- one-off supporting scripts
- automation adjacent to the main app

Observed refinement:
- `scripts/` is concretely an operational/build helper layer, not generic app logic.

### `styles/`
Styling-related assets.

Start here when the task is clearly about presentation or styling and not broader application logic.

### `assets/`
Static assets and bundled resources.

Visible subareas include:
- `assets/icons/`
- `assets/peppy/`
- `assets/fonts/`

Use this area for icons, fonts, imagery, or display-supporting assets.

### `integrations/`
Integration-specific code and support files.

Visible subareas include:
- `integrations/moode/`

Start here for external-system glue, especially moOde-related behavior.

### `ops/`
Operational and environment-specific material.

Visible subareas include:
- `ops/moode-overrides/`

This is especially important for local/runtime overrides and recovery/audit copies of operational customizations.

Observed refinement:
- `ops/moode-overrides/` is concretely a recovery/audit mirror of host-side moOde override scripts, not just a generic notes area.

### `config/`
Configuration material outside the main source tree.

Check here when the task is about environment settings, configuration behavior, or top-level configuration support.

### `docs/`
Project-local documentation and references.

Visible subareas include:
- `docs/images/`
- `docs/references/`

Useful for understanding documented intent, references, and supporting explanation.

Observed refinement:
- `docs/` is concretely a more structured reference/support material area rather than just miscellaneous prose.

### `notes/`
Project notes and possibly ad hoc working documentation.

Treat as supporting context rather than the first source of truth unless the task is explicitly about historical/project notes.

Observed refinement:
- `notes/` is concretely more ad hoc working/project-note material and should stay secondary to code, config, and stronger reference docs when establishing technical truth.

### `alexa/`, `lambda_bundle/`, `lambda_upload/`
Alexa/Lambda-related integration and deployment material.

Observed refinement:
- `alexa/` is the primary candidate for Alexa skill/voice logic
- `lambda_bundle/` and `lambda_upload/` are stronger candidates for packaging/deployment wrapper material around that logic
- root `index.js` is not the main app server entrypoint; it is an Alexa export shim

These areas are likely relevant when the task touches voice integration, Lambda packaging, or Alexa-specific handlers.

### `skins/`
Skin/theme-style variants and presentation-specific customizations.

Visible subareas include:
- `skins/mack-blue-compact`
- `skins/cassette-linear`

Start here when the task involves display themes, visual variants, or skin-specific behavior.

### `exports/`
Exported/generated assets or support output.

Visible subareas include:
- `exports/peppymeter/`

Likely relevant when the task involves exported display assets or generated presentation content.

Observed refinement:
- `exports/peppymeter/` is a concrete exported/display-supporting area with real config/output material, not just a random dump.

## First places to look by task

### UI or visual behavior
Start with the user-facing surface first:
- **Desktop app shell** → `app.html`
- **Tablet controller** → `controller-tablet.html`
- **Phone controller** → `controller-mobile.html`
- **moOde box display surfaces** → `kiosk.html`, `peppy.html`, `player.html`
- **display/router/classic now-playing layer** → `display.html`, `index.html`

Then check:
- `src/routes/`
- `styles/`
- `skins/`
- `assets/`

Most decisive starting split:
- start with the actual user-facing page/surface when the issue is tied to how someone experiences now-playing on desktop, tablet, phone, or the moOde box
- start with `styles/`, `skins/`, and `assets/` when the task is clearly visual/presentation-oriented
- start with `src/routes/` when the visible behavior appears tied to API/config/runtime endpoints rather than only page structure/presentation

Likely roles:
- top-level HTML files define or host the major user-facing surfaces directly in the current repo
- `styles/`, `skins/`, and `assets/` shape presentation and visual assets
- `src/routes/` connects those surfaces to app/runtime behavior where API/config/state interactions matter
- especially relevant support routes include controller-profile, runtime-admin, diagnostics, browse, art, and queue-wizard/config-facing modules depending on the page surface involved

### Playback or control behavior
Start with:
- `src/services/`
- `src/routes/`
- `src/lib/`

Most decisive starting split:
- start with `src/services/` when the task feels like business logic, orchestration, playback logic, or state transitions
- start with `src/routes/` when the behavior looks request-driven, route-driven, or entry-point-oriented
- use `src/lib/` as a likely shared-logic layer rather than the first guess for every control issue

Likely roles:
- `src/services/` is the strongest candidate for playback/control-side logic
- `src/routes/` likely owns route-triggered control behavior
- `src/lib/` may contain shared state or logic used by control surfaces

### Integration behavior
Start with:
- `integrations/`
- `src/services/`
- `src/routes/`
- `ops/` (if local overrides may affect runtime behavior)

Most decisive starting split:
- start with `integrations/` when the issue clearly belongs to an external-system boundary
- start with `src/services/` or `src/routes/` when the issue seems to be app-side handling of an integration rather than the external glue itself
- treat `ops/` as a special-case area only when local runtime overrides may explain the behavior

Likely roles:
- `integrations/moode/` is the clearest integration-specific subarea visible in the repo
- `src/services/` and `src/routes/` likely bridge app logic to integration behavior

### Deployment/runtime issues
Start with:
- `ops/`
- `scripts/`
- `config/`
- `src/config/`
- project docs / local environment notes

Most decisive starting split:
- start with `ops/` when local overrides or runtime behavior may be the main issue
- start with `scripts/` when the task feels helper/automation-oriented
- start with `config/` or `src/config/` when the issue looks configuration-shaped rather than code-flow-shaped

Likely roles:
- `ops/` holds high-impact operational material
- `src/config/` and top-level `config/` likely shape runtime/config behavior
- `scripts/` likely contains operational helpers and one-off support flows

Observed repo evidence:
- `scripts/deploy-pi.sh` is concrete deploy helper material
- `scripts/healthcheck.sh` is concrete operational verification material
- `scripts/build-lambda.sh` is concrete build/packaging helper material
- practical implication: `scripts/` is a real deploy/build/ops helper layer, not just a miscellaneous bucket

### Alexa or voice-related work
Start with:
- `alexa/`
- `lambda_bundle/`
- `lambda_upload/`

Likely roles:
- `alexa/` is the strongest candidate for Alexa-specific logic/handlers
- `lambda_bundle/` and `lambda_upload/` appear to be packaging/deployment-adjacent areas for Lambda/Alexa flows

Observed repo evidence:
- `alexa/README.md` and `alexa/skill.js` make `alexa/` the clearest primary skill-logic area
- `alexa/skill.js` wires together the Alexa API client, intent handlers, audio handlers, token/play/enqueue helpers, and queue/idempotency guard logic
- `alexa/lib/api.js` is the concrete Alexa-side API bridge for `/alexa/was-playing`, runtime config, queue advance, now-playing, MPD priming, and related play/queue endpoints
- `alexa/handlers/audio.js` owns Alexa audio-event behavior such as posting was-playing state, handling NearlyFinished enqueue flow, and advancing/top-upping queue state
- `alexa/handlers/intents.js` owns launch/intent behavior, including deciding when `/now-playing` metadata is trustworthy relative to the current Alexa token
- `lambda_bundle/alexa/handlers/intents.js` contains substantive bundled Alexa request/intent logic rather than being pure packaging
- `lambda_upload/lambda/index.js` simply re-exports the Alexa skill module, reinforcing that the Lambda upload area is a packaging/deployment wrapper rather than the core ownership area
- `moode-nowplaying-api.mjs` owns the concrete `GET /next-up` endpoint and also holds `alexaWasPlaying`, `youtubeNowPlayingHint`, and `getYoutubeQueueHint(...)` state/support used by this broader path
- `config.diagnostics.routes.mjs` also knows about `/next-up`, Alexa was-playing state, and YouTube queue hints as an inspection/support surface rather than the canonical owner

### Documentation or project understanding
Start with:
- `docs/`
- DeepWiki exports
- this wiki directory (`docs/now-playing-knowledge/`)

## Areas future agents should usually avoid editing first

- `node_modules/` should not be treated as an edit target
- `src/private/` should not be the first place to poke unless the task clearly belongs there; current repo inspection shows a very small internal-only area rather than a broad feature surface (for example `src/private/mother-earth.local.example.mjs`)
- `ops/moode-overrides/` is high-impact operational material; edit only with strong reason and environment awareness

## Special cautions

- local runtime behavior may be affected by material under `ops/moode-overrides/`
- host/deploy assumptions should be checked against `local-environment.md` before operational changes
- DeepWiki helps explain the system, but repo layout is the better guide for where actual changes should land
- Alexa/Lambda-related areas should be treated as specialized integration/deployment surfaces, not generic app code

## Verified ownership guidance

This section reflects the strongest current Phase 1 takeaways: verified starting points first, with remaining uncertainty called out separately.

### User-facing surfaces
- **Desktop app shell** is concretely anchored in `app.html`
  - verified support/endpoints used directly from `app.html` include `config/runtime`, `config/diagnostics/playback`, `config/diagnostics/queue`, `config/queue-wizard/*`, `config/browse/*`, `config/moode/display*`, `config/moode/browser*`, `config/moode/browser-url*`, `config/moode/peppyalsa/*`, `config/moode/peppymeter/*`, `config/services/mpdscribble/*`, `peppy/last-profile`, `peppy/vumeter`, `now-playing`, `next-up`, `alexa/was-playing`, `favorites/toggle`, and `art/*`
  - `app.html` also owns the shell iframe (`#appFrame`), page switching among many internal tools/pages, and moOde display takeover / Peppy control flows
- **Tablet controller** is concretely anchored in `controller-tablet.html`, with richer visual/blurred now-playing treatment and tablet/kiosk-landscape-oriented layout variants
  - verified support/endpoints used directly from `controller-tablet.html` include `config/runtime`, `config/controller-profile`, `config/library-health/animated-art/lookup`, `config/library-health/albums`, `config/queue-wizard/*`, `config/browse/*`, `config/diagnostics/playback`, `config/moode/audio-info`, `config/moode/browser-url`, `config/moode/display-mode`, `config/moode/peppymeter/start`, `config/moode/peppyalsa/ensure`, `rating/current`, `favorites/toggle`, `peppy/last-profile`, `now-playing`, `next-up`, `alexa/was-playing`, `alexa/now-playing`, `alexa/next-up`, `podcasts`, `podcasts/episodes/list`, and multiple `art/*` endpoints
  - `controller-tablet.html` also owns tablet-specific recent-pane/Next Up/action-bar behavior, kiosk/tablet layout classes, and embedded kiosk-pane iframe behavior (`#kioskPaneFrame`)
- **Phone controller** is concretely anchored in `controller-mobile.html`, with compact/swipe/rail-oriented controller interaction patterns
  - verified support/endpoints used directly from `controller-mobile.html` include `config/runtime`, `config/controller-profile`, `config/library-health/albums`, `config/queue-wizard/*`, `config/diagnostics/playback`, `config/diagnostics/queue`, `config/moode/browser-url`, `config/moode/display-mode`, `config/moode/peppymeter/start`, `config/moode/peppyalsa/ensure`, `rating/current`, `peppy/last-profile`, `now-playing`, `alexa/now-playing`, `podcasts`, `podcasts/episodes/list`, and multiple `art/*` endpoints
  - `controller-mobile.html` also owns mobile-specific recent-rail/swipe behavior, compact queue/recent interactions, kiosk 1280 preview/push controls, and personnel/flip-card now-playing interactions
- **Shared/generic controller base** is concretely anchored in `controller.html`, which also carries kiosk-oriented layout modes
- **moOde box display surfaces** are primarily routed via `display.html`, with concrete mode surfaces including `peppy.html`, `player-render.html`/`player.html`, `index.html`, and a kiosk flow anchored by `kiosk.html`
  - verified support/endpoints used directly across this routed surface family include `peppy/last-profile`, `peppy/vumeter`, `peppy/spectrum`, `config/runtime`, `config/moode/browser-url`, `config/moode/browser-url/status`, `config/moode/display`, `config/moode/display-mode`, `config/moode/peppymeter/start`, `config/moode/peppy-vumeter-target/status`, `config/moode/peppy-spectrum-target/status`, `config/moode/peppy-spectrum-target`, `config/diagnostics/playback`, `config/diagnostics/queue`, `config/library-health/animated-art/lookup`, `config/queue-wizard/radio-preview`, `now-playing`, `alexa/now-playing`, `favorites/toggle`, and multiple `art/*` endpoints
  - `display.html` owns mode routing into `player-render.html`, `index.html`, `peppy.html`, or a pushed visualizer URL; `player-render.html` is an embedded render target with iframe-specific fallback/background behavior; `peppy.html` is both a runtime display surface and a moOde/Peppy readiness + push/configuration control surface
- **display/router/classic now-playing layer** is concretely anchored in `display.html` and `index.html`
- `src/routes/` is still relevant when these surfaces depend on API/config/runtime endpoints, but the surfaces themselves are not primarily represented by route files named `display.routes.mjs`, `controller.routes.mjs`, or `mobile.routes.mjs`
- `styles/`, `skins/`, and `assets/` remain strong candidates for visual/theming/presentation ownership
- service/integration layers become relevant when these surfaces are strongly state-driven rather than purely presentational
- observed support-layer evidence: `src/routes/config.controller-profile.routes.mjs` backs saved controller/mobile profile state, `src/routes/config.runtime-admin.routes.mjs` backs display/moOde/browser-url/runtime flows, and `src/routes/config.diagnostics.routes.mjs` catalogs and exposes many live endpoints used to inspect or exercise page-supporting behavior
- observed repo nuance: `display.html` is the actual display router, `kiosk.html` redirects into a controller-based kiosk preview flow, `peppy.html` is a dedicated peppy bridge/runtime surface, and `player.html` is a builder/preview surface for `player-render.html`

Practical visual-layer ownership assumption:
- `styles/` is the strongest candidate for global visual rules and presentation definitions
- `skins/` is the strongest candidate for theme/variant-specific visual mapping
- `assets/` is the strongest candidate for static visual resources such as images, fonts, and icons
- `src/routes/` and `src/lib/` are the strongest candidates when visual behavior depends on rendering context, route context, or shared rendering logic
- visual bugs should not be assumed to live only in CSS/theme layers when rendering/state logic may also be involved

Observed repo evidence for visual-layer ownership:
- real current examples include `styles/hero.css`, `styles/index1080.css`, `styles/controller-modals.css`, `skins/mack-blue-compact/meter.json`, and static assets under `assets/icons/`, `assets/peppy/`, and `assets/fonts/`
- `src/routes/art.routes.mjs` provides concrete route-layer presence for art-related behavior
- practical implication: the split between styles, skin/theme assets, static assets, and art-related route behavior is visible in the current repo

### Playback / control ownership
- `src/services/` is the strongest current starting point for reusable playback/control primitives and orchestration
- `src/routes/` is the strongest current starting point for request/entry-point control behavior
- `src/lib/` should usually be treated as a shared helper/data layer rather than the first assumption for every control issue

#### Queue wizard / filter builder
- `src/routes/` is the strongest current starting point for entry points and request-driven behavior around these features
- `src/lib/` does provide real shared support here, especially browse-index-backed data material
- any visual/presentation layer should be treated as secondary until the route/helper boundary is understood
- one verified example: user-facing surfaces (`app.html`, `controller-tablet.html`, `controller-mobile.html`, `peppy.html`) call `config/queue-wizard/*` and `config/browse/*` endpoints directly; `src/routes/config.queue-wizard-basic.routes.mjs`, `config.queue-wizard-preview.routes.mjs`, `config.queue-wizard-apply.routes.mjs`, `config.queue-wizard-vibe.routes.mjs`, and `config.browse.routes.mjs` own substantial route-layer logic; `src/lib/browse-index.mjs` is the shared browse data/index helper behind many browse/preview endpoints

#### Transport controls / ratings / favorites
- `src/routes/` is a strong candidate for request/entry-point behavior for these features
- `src/services/` is a strong candidate for transport-control logic and ratings/favorites business rules
- `src/lib/` is a candidate for shared models, helper logic, or reusable state/data structures
- integration layers are candidates if transport or ratings behavior crosses external-system boundaries
- presentation layers may be involved for visible UI, but should be treated as secondary until route/service/lib ownership is verified
- observed repo pattern: route files clearly exist for ratings and some browse/queue/config-facing features
- current Phase 1 audit note: `src/routes/playback.routes.mjs`, `src/routes/transport.routes.mjs`, and `src/lib/player-state.mjs` were re-checked and are **not present at those paths**; do not treat prior exact-file claims about them as verified evidence
- observed repo evidence: `src/services/mpd.service.mjs` provides concrete MPD transport/control primitives (`mpdPlay`, `mpdPause`, `mpdStop`, status/query parsing), while route-level MPD control also appears in focused route modules such as `config.diagnostics.routes.mjs` and queue-wizard apply/basic flows

#### Radio stations / playlist management
- `src/routes/` is a strong candidate for request/entry-point behavior for these feature areas
- `src/services/` is a strong candidate for station/playlist business logic and state changes
- `src/lib/` is a candidate for shared models, helper logic, or reusable data/state structures
- integration layers are candidates if playlist or station sources cross external-system boundaries
- presentation layers may be involved for visible UI, but should be treated as secondary until route/service/lib ownership is verified
- current Phase 1 audit note: `src/routes/playlist.routes.mjs` and `src/routes/radio.routes.mjs` were re-checked and are **not present at those paths**; do not treat prior exact-file claims about them as verified evidence
- observed repo evidence: `src/routes/config.browse.routes.mjs` now provides concrete route-layer ownership for recent playlist/radio/podcast/album browse surfaces and related cache-warming/fallback behavior

Practical route/service boundary assumption:
- `src/routes/` is the strongest candidate for transport-layer concerns, entry-point validation, and request/route handling
- `src/services/` is the strongest candidate for reusable control primitives and non-transport-specific application behavior
- current repo evidence suggests some operational control logic is still implemented directly in focused route modules rather than being fully centralized in services
- one verified example: UI surfaces (`app.html`, `controller-tablet.html`, `controller-mobile.html`) hit `GET /next-up` and `POST /config/diagnostics/playback`; Alexa audio/intent flows call `/queue/advance`; `src/routes/queue.routes.mjs` owns the queue-head deletion/resolve/prime/fallback workflow; `src/services/mpd.service.mjs` owns lower-level reusable MPD primitives such as `mpdPlay`, `mpdPause`, `mpdStop`, `mpdQueryRaw`, and MPD status parsing
- practical implication: route modules currently own substantial operational workflows, while services provide reusable MPD primitives rather than absorbing all queue/control logic

### Integration ownership
- `integrations/` is the primary external-system glue area
- `integrations/moode/` is the clearest visible integration-specific subarea
- `src/services/` and `src/routes/` bridge app-side logic to integration behavior
- request/auth boundaries likely still span route-level handling and service-level interpretation

### Runtime / ops-sensitive ownership
- `ops/moode-overrides/` owns high-impact local override behavior
- `scripts/` is a strong current starting point for operational helpers and health/support flows
- `config/` and `src/config/` are the strongest current starting points for configuration-shaped runtime behavior
- `src/services/` and `src/routes/` matter when runtime sensitivity is tied to orchestration or endpoint/service boundaries
- one verified example: user-facing surfaces such as `app.html`, `controller-tablet.html`, `controller-mobile.html`, and `peppy.html` repeatedly call `GET /config/runtime` plus runtime-admin moOde control endpoints such as `/config/moode/display`, `/config/moode/display-mode`, `/config/moode/browser-url`, `/config/moode/browser-url/status`, `/config/moode/peppymeter/start`, and `/config/moode/peppyalsa/ensure`; `src/routes/config.runtime-admin.routes.mjs` is the concrete route-layer owner for these endpoints and also performs direct config-file mutation plus SSH-backed moOde/display side effects
- Phase 2 refinement: the live MPD/moOde boundary is not a clean one-layer seam. MPD primitives live in `src/services/mpd.service.mjs`, but route modules like `queue.routes.mjs`, `rating.routes.mjs`, and `art.routes.mjs` also mix MPD queries with moOde JSON/command endpoint calls; runtime-admin routes separately own SSH-backed moOde host control; host overrides remain documented/manual in `integrations/moode/` and mirrored under `ops/moode-overrides/`
- current-song / art / status truth is case-dependent rather than universal: `art.routes.mjs` and the core now-playing flow fetch moOde `get_currentsong` + `status`, but art resolution then branches by source type (local file → `coverart.php`, AirPlay → `aplmeta.txt` / fresh AirPlay covers, UPnP → stream-like current-song/status plus a resolver that tries to map back to local-library file/cover truth, radio/streams → station/logo or external-enrichment fallbacks, unresolved cases → `/art/current.jpg` cache-backed fallback). Practical implication: future agents should ask which content mode is active before deciding what the authoritative art/status source is
- UPnP is a distinct bridge mode in current code, not just a generic stream label: `getStreamKind(file)` classifies `:8200/MediaItems/` URLs as `upnp`; `resolveLibraryFileForStream(...)` attempts to recover a real local-library file via MPD playlist metadata, MusicBrainz track id, or looser tag heuristics; the core now-playing/art flow upgrades UPnP art to local `coverart.php` when resolution succeeds, otherwise it falls back through more generic stream logic

Observed repo evidence:
- `ops/moode-overrides/README.md` explicitly frames this area as a recovery/audit mirror for local moOde overrides
- practical implication: `ops/moode-overrides/` is still documented as an operational override mirror, but current file-level claims should be anchored to what is actually mirrored in-repo right now

Practical config/runtime ownership assumption:
- `config/` is the strongest candidate for configuration definitions, defaults, and top-level config material
- `src/config/` is the strongest candidate for app-consumed configuration models or code-facing config structures
- `scripts/` is a strong candidate for setup/application/generation flows around runtime config
- `ops/` is a strong candidate when configuration-shaped behavior becomes operational, deployment-sensitive, or override-sensitive

Observed repo evidence for config/runtime ownership:
- `src/config/load-config.mjs` is a concrete code-facing loader/validator for runtime config
- `config/now-playing.config.example.json` is a concrete top-level example/default config artifact
- `config/radio-logo-aliases.json` is a concrete config/data file for radio-related runtime behavior
- practical implication: the split between `config/` and `src/config/` is already visible in real files, not just inferred

## Observed architectural patterns

These are the strongest architectural takeaways from the current Phase 1 verification work:

- The repo is **not** cleanly organized as “thin routes, fat services.” Many important behaviors are route-heavy.
- Top-level HTML pages are first-class ownership points for user-facing surfaces; page behavior is not primarily explained by route filenames alone.
- `src/routes/` often owns substantial operational workflows directly, especially for queue advancement, runtime/admin control, browse/queue-wizard flows, ratings, and art handling.
- `src/services/` does contain real reusable primitives, but selectively. A strong example is `src/services/mpd.service.mjs`, which provides low-level MPD control/query helpers rather than absorbing all playback logic.
- `src/lib/` is a shared helper/data layer, not a generic dumping ground. A strong example is `src/lib/browse-index.mjs`, which supports browse and queue-wizard data flows.
- Runtime-admin routes are especially important because they bridge config mutation, environment discovery, and SSH-backed moOde/display side effects in one place.
- The app’s practical structure is easier to understand by tracing representative endpoint families than by assuming a clean abstract layering model.

## Highest-value remaining unknowns

- clearer ownership boundaries across additional representative endpoint families beyond the now-traced queue/playback, display/runtime, and browse/queue-wizard slices
- the exact practical boundary between reusable service primitives, shared helper/data layers, and route-local operational logic
- the exact practical boundary between pure visual ownership and app-side rendering/runtime ownership across `styles/`, `skins/`, `assets/`, HTML entrypoints, `src/routes/`, and `scripts/index-ui.js`
- the remaining unresolved parts of the MPD/moOde synchronization boundary, especially where app-side MPD state, moOde JSON/command endpoints, runtime-admin SSH control, and host overrides interact in one live behavior
- the exact live role split between `lambda_bundle/` and `lambda_upload/` in the current Alexa/Lambda deployment path
- additional file-level ownership confirmation for transport controls and radio/playlist management beyond the strong starting anchors already verified

## Best next verification targets

- trace additional representative endpoints to confirm the practical boundaries between route-local workflows, shared helpers, and reusable services
- verify where display-state issues stop being frontend/page concerns and start being runtime/integration issues
- verify which route/service/config/ops boundaries most often make a change deploy-sensitive or restart-sensitive
- verify which areas actually mediate MPD playback-side state into moOde display/runtime-side behavior
- verify the practical division between app-side moOde handling and host-side moOde override/install behavior
- continue filling file-level ownership gaps for transport controls and radio/playlist management

Focused candidate ownership for Next Up / Alexa path:
- `alexa/` is a verified primary ownership area for Alexa-specific handlers and playback/invocation-side logic
- `lambda_bundle/` is also a real logic-bearing area for bundled Alexa handlers, not just inert packaging
- `lambda_upload/` remains a strong candidate for packaging/deployment-side support for that path
- `moode-nowplaying-api.mjs` is a verified primary API-side ownership area for `/next-up`, Alexa was-playing state, and YouTube queue/now-playing hints used by this path
- `src/services/` is a strong candidate for reusable playback/control primitives on the API side
- `src/routes/` is a strong candidate for route/request entry points into adjacent support behavior (especially diagnostics/config surfaces that inspect or expose this path)
- `src/lib/` and presentation layers are candidates where Next Up state becomes visible/UI-facing behavior
- this path should still be treated as cross-layer rather than a single-owner feature

Focused candidate ownership for iframe-vs-top-level display behavior:
- top-level page files are verified primary ownership points for this path, especially `index.html`, `display.html`, and `app.html`
- `display.html` is explicitly an iframe-based display router that chooses and loads other display surfaces
- `index.html` contains explicit embedded-preview/iframe-condition logic (`window.top !== window.self`) and adjusts body/background/layer behavior when embedded
- `scripts/index-ui.js` is a major runtime owner for display behavior, including Next Up/render/background runtime logic and mode-sensitive endpoint selection
- `styles/index1080.css` is a concrete styling owner for body/background/content/layer behavior and already encodes transparent-body/background-layer assumptions relevant to embedded display behavior
- `app.html` is a large shell page that targets and embeds multiple named surfaces, making it a likely owner or mediator for some top-level-vs-embedded behavior
- `styles/`, `skins/`, and `assets/` are still relevant where visible iframe-vs-top-level differences surface
- route/config/runtime layers remain relevant when page behavior depends on mode/profile/runtime state rather than only page structure
- this path should still be treated as cross-layer, but it is now clearly not just a hypothetical `src/routes/` problem

Focused candidate ownership for MPD/moOde boundary behavior:
- `integrations/moode/` is a strong candidate for the bridge between playback-side and display/runtime-side behavior
- `src/services/` is a strong candidate for synchronization or translation logic between those domains
- `src/routes/` is a candidate where request/entry-point behavior touches the boundary externally
- `ops/moode-overrides/` is a candidate whenever local runtime adjustments may bend the expected boundary behavior
- config-related layers are candidates if state ownership or synchronization assumptions are environment-shaped
- this boundary should be treated as a synchronization/translation boundary until verified, not as a single-owner feature

Observed repo evidence for moOde integration ownership:
- `integrations/moode/README.md` explicitly frames this area as optional host-level overrides for moOde AirPlay metadata handling
- `integrations/moode/install.sh` is a concrete host-mutation/install helper for deploying those overrides onto the moOde host
- `integrations/moode/aplmeta-reader.sh` is a concrete runtime-side reader/supervisor script for the moOde AirPlay metadata path
- practical implication: `integrations/moode/` is not just abstract app glue; it also contains explicit host-level integration/install material for moOde runtime behavior

Observed repo evidence from deeper route inspection:
- `src/routes/config.queue-wizard-preview.routes.mjs` contains substantial queue-wizard preview logic, including browse-index and MPD/data-filtering behavior
- `src/routes/config.alexa-alias.routes.mjs` contains Alexa alias/config mutation behavior tied directly to config file updates
- `src/routes/config.controller-profile.routes.mjs` shows controller-profile behavior living at the route layer rather than only in a deeper service abstraction
- `src/routes/track.routes.mjs` owns Alexa-gated `/track` serving, range support, and optional transcoding/cache behavior for local tracks
- `src/routes/queue.routes.mjs` owns concrete queue-advance and related MPD/moOde queue-head logic, including fallback/priming behavior
- `src/routes/rating.routes.mjs` owns `/rating` and `/rating/current` flows for file/current-song rating reads and writes
- `src/routes/art.routes.mjs` owns current/track art serving, cache fill/reuse, resize, and blurred-background generation behavior
- `src/routes/config.routes.index.mjs` is a real aggregation point for many focused config/library-health/queue-wizard/config-adjacent route modules
- `src/routes/config.browse.routes.mjs` owns recent browse surfaces and startup cache-warming/fallback behavior for albums, podcasts, playlists, and radio favorites
- current route-registration inventory also shows many focused registrars such as `registerQueueRoutes`, `registerRatingRoutes`, `registerArtRoutes`, podcast route registrars, and many config/library-health/runtime registrars rather than a small set of giant surface-named route files
- practical implication: some named features and config-facing behaviors are concretely implemented in route files, not only delegated to service-layer modules, and the current repo favors many focused route modules plus a config registration hub rather than one-file-per-surface naming

## Next improvements for this page

This page is still not a full file-level map. It should later be expanded with:
- key file-level pointers
- which routes/services own which visible features
- safer edit guidance for common tasks
- known high-risk files or areas
- a clearer mapping of deploy/restart-sensitive areas across `src/services/`, `src/routes/`, `config/`, `src/config/`, `scripts/`, and `ops/`
