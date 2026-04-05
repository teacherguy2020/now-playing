# system overview

## Purpose of the system

The `now-playing` project is a media-control and presentation system centered on playback, browsing, display behavior, and supporting operational workflows.

Based on the DeepWiki corpus, it is not just a single display page. It covers:
- media browsing and playlist control
- queue and filter-driven interaction
- display and kiosk-style presentation surfaces
- runtime/admin/service-management concerns
- integrations with external playback and content systems

## Major feature areas

- **Media management**
  - media library
  - playlist management
  - radio stations
  - ratings / favorites
- **Playback and queue control**
  - transport controls
  - queue wizard interface
  - filter builder
  - quick search over localized library/browse data
- **Display and presentation**
  - display pages
  - kiosk mode
  - moOde display control
  - animated art system
  - art caching system
- **Local derived state and caches**
  - localized library/browse index JSON
  - cached/resized/blurred art derivatives
  - other local artifacts that stabilize or accelerate live behavior

Practical refinement:
- Quick Search is not just a raw live MPD search surface; current code uses the localized browse-index layer (`src/lib/browse-index.mjs`) through browse/queue-wizard route families, which makes local derived-state artifacts part of the real search experience
- **Operations and administration**
  - configuration management
  - service control
  - runtime verification
  - installation/setup workflows
- **External access and request handling**
  - GET/POST request flows
  - header-auth request support
  - API-host-related operation

## User-facing surfaces

Current related drill-down pages include:
- `now-playing-surface-variants.md`
- `controller-device-alias-pages.md`
- `display-launch-and-wrapper-surfaces.md`
- `youtube-interface.md`
- `radio-metadata-eval-interface.md`
- `alexa-interface.md`
- `config-feature-breakdown.md`
- `api-service-overview.md`

The system is better understood by the major surfaces people actually use:
- **Desktop app shell**
  - the broad control/admin shell centered on `app.html`
- **Tablet controller**
  - a richer controller surface centered on `controller-tablet.html`
- **Phone controller**
  - a more compact/swipe-oriented controller surface centered on `controller-mobile.html`
- **moOde box display surfaces**
  - routed through `display.html`, with concrete display modes including Peppy, player-render/player, classic now-playing/index, and kiosk-related flows
- **display/router/classic now-playing layer**
  - the now-playing display/routing layer centered on `display.html` and `index.html`

These surfaces are not interchangeable skins on one page. They depend on overlapping but distinct page logic, route families, runtime behavior, and moOde/display control flows.

## Major integrations and external systems

The documentation explicitly references these external systems and integration areas:
- **MPD**
- **YouTube**
- **moOde**
- HTTP/API request handling via GET/POST flows
- authenticated request patterns using header auth instead of query parameters
- Chromium/runtime process inspection in operational workflows

## Operational themes

The docs suggest several strong operational themes:
- this system has real deployment/runtime concerns, not just frontend code
- service lifecycle and verification matter
- configuration and runtime checks are part of normal maintenance
- display behavior and wake/display-state handling are important enough to document explicitly
- media presentation is closely tied to operational state, not just static UI behavior

## Boundaries and cautions

What this page should and should not do:
- this page should explain broad system scope
- it should not try to be the detailed architecture page
- it should not try to be the file ownership map
- it should not try to encode Brian-specific host details beyond pointing to the right page
- it should stay focused on what the system includes, not every implementation or runtime caveat

What belongs elsewhere in the wiki:
- `architecture.md` for deeper structural relationships
- `source-map.md` for code and directory ownership guidance
- `integrations.md` for external-system and request-flow detail
- `local-environment.md` for Brian-specific host and override reality
- `deployment-and-ops.md` for operational/runtime verification concerns

Project-wide truths that should stay visible here:
- this is a multi-surface media-control and presentation system
- it spans media/content, control, display, integration, and operational concerns
- it also depends on local derived-state/caching layers, not only live upstream playback state
- it should not be treated as a single-page UI or as a purely frontend project
- major user-facing surfaces are first-class parts of the system shape, not just alternate views layered on top of one generic frontend

Caveats future agents should keep in mind:
- DeepWiki gives a strong structural overview, but not the full current local truth
- local deployment and host behavior should be checked against `local-environment.md`
- operational behavior may differ from generic/project-wide expectations because of local patches and environment-specific rules
- documented feature areas are not the same thing as fully mapped implementation ownership
- future agents should treat this page as orientation, then move quickly to `architecture.md`, `source-map.md`, `integrations.md`, and `gotchas-and-lessons.md` for real work
