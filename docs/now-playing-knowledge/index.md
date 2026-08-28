---
title: index
page_type: support
topics:
  - metadata
  - ops
  - runtime
confidence: high
---

# index

## Purpose

This page is the content-oriented catalog for the `now-playing` knowledge wiki.

It exists so both humans and agents can scan the shape of the wiki quickly, find the right page family, and jump into the most relevant branch without guessing from filenames alone.

Use this page when the question is:
- what pages exist in this wiki?
- what branch should I open first?
- what is the shortest path into a topic family?

For the chronological evolution of the wiki, use `log.md`.
For the maintenance workflow, use `wiki-operations.md`.

## Start / retrieval surfaces

- `README.md` — primary overview and broad orientation page
- `api-state-truth-endpoints.md` — central state hinge page for `/now-playing`, `/next-up`, and other visible-truth surfaces
- `agent-start.md` *(rendered-only entry today)* — question-first front door for agents using the rendered wiki
- `search-and-navigation.md` *(rendered-only entry today)* — page-first browse/search entry point in the rendered wiki
- `index.md` — content-oriented catalog of pages and branches
- `log.md` — chronological record of major wiki evolution milestones
- `wiki-operations.md` — ingest/query/lint operating model
- `wiki-structure-notes.md` — structural rules and maintenance conventions
- `repo-coverage-notes.md` — audit of what the wiki covers strongly, strategically, lightly, or intentionally not at all

## Core orientation

- `system-overview.md` — high-level picture of the project as a moOde-centered enhancement ecosystem
- `architecture.md` — major layers, boundaries, and structural relationships
- `user-interfaces.md` — interface-first map of how the system is actually used/viewed
- `source-map.md` — where code and assets live, organized by directory/function
- `workflows.md` — how common work tends to move through the system
- `glossary.md` — vocabulary and naming normalization
- `decisions-and-history.md` — durable decisions and historical rationale
- `gotchas-and-lessons.md` — fragile paths, mistakes, and learned guardrails
- `open-questions.md` — unresolved or weakly mapped areas

## Interface hubs

- `desktop-browser-interface.md` — desktop/browser shell and larger-screen access
- `tablet-interface.md` — tablet controller hub and pane-rich behavior
- `phone-interface.md` — compact/mobile controller hub
- `display-interface.md` — display/render-mode family and presentation behavior
- `kiosk-interface.md` — kiosk as a presentation/shell mode
- `configuration-and-diagnostics-interfaces.md` — operator/config/diagnostics branch hub
- `integrations.md` — MPD, moOde, YouTube, Alexa, and related integration boundaries

## Config / diagnostics / operator branch

- `config-interface.md` — main runtime/operator console
- `config-page-anatomy.md` — card/module map of `config.html`
- `config-feature-breakdown.md` — feature-level decomposition of Config
- `config-network-and-runtime.md` — host/path/runtime bootstrap and environment verification
- `config-podcasts-and-library-paths.md` — podcast and path ownership workflows
- `config-display-and-render-features.md` — render/display/artwork-related config features
- `config-ratings.md` — ratings DB enablement and maintenance
- `config-lastfm-and-scrobbling.md` — mpdscribble, Last.fm, and Vibe-related settings
- `config-notifications.md` — Pushover and track-notification controls
- `config-alexa-setup.md` — Alexa setup/provisioning and route verification
- `config-advanced-json.md` — raw full-config editing and save behavior
- `diagnostics-interface.md` — live diagnostics and inspection console
- `diagnostics-page-anatomy.md` — region/module map of `diagnostics.html`
- `library-health-interface.md` — maintenance workbench for metadata/library cleanup
- `library-health-page-anatomy.md` — region/module map of `library-health.html`
- `theme-interface.md` — client-side theme token editor and preset system
- `theme-page-anatomy.md` — region/module map of `theme.html`
- `style-token-and-surface-naming.md` — canonical UI surface vocabulary, token ownership, and fragile background invariants
- `radio-metadata-eval-interface.md` — radio metadata QA/evaluation surface
- `alexa-interface.md` — Alexa corrections and voice-command review surface

## Playback / queue / engineering-reference branch

- `queue-and-playback-model.md` — conceptual model for playback, queue control, and queue shaping
- `playback-authority-by-mode.md` — source-of-truth split by playback mode
- `queue-wizard-internals.md` — Queue Wizard as queue-shaping/curation layer
- `controller-queue-interface.md` — queue inspection/control surface
- `route-ownership-map.md` — route-family ownership reference
- `fragile-behavior-ownership.md` — fragile path ownership and guardrails
- `api-service-overview.md` — API-centered architectural parent page
- `api-state-truth-endpoints.md` — central visible-state truth surfaces, especially `/now-playing` and `/next-up`
- `api-config-and-runtime-endpoints.md` — config/runtime route families
- `api-youtube-radio-and-integration-endpoints.md` — YouTube/radio/integration route families
- `api-playback-and-queue-endpoints.md` — playback and queue route families documented so far

### Retrieval helpers in this branch

- `queue-interface-vs-queue-wizard.md` — explicit decision-box reference for queue surface vs queue-shaping confusion
- `kiosk-queue-shell-vs-content-owner.md` — explicit decision-box reference for kiosk pane shell vs embedded queue content owner

## Display / kiosk / embedded branch

- `now-playing-surface-variants.md` — controller-now-playing family overview
- `controller-now-playing-anatomy.md` — region/module map for controller now-playing surface
- `controller-device-alias-pages.md` — iPad/iPhone alias and redirect pages
- `display-launch-and-wrapper-surfaces.md` — display launcher and wrapper/helper surfaces
- `display-enhancement-peppy-player-flow.md` — builder-first Peppy/Player/Visualizer flow, stable router target, and bridge-mode operational rules
- `controller-kiosk-scaffold.md` — separate `controller-kiosk.html` scaffold path
- `controller-kiosk-mode.md` — controller behavior when kiosk mode is active
- `kiosk-launch-and-routing.md` — kiosk entrypoints and redirects into controller-backed behavior
- `kiosk-right-pane-routing.md` — embedded right-pane route mapping and pane lifecycle
- `embedded-pane-contracts.md` — parent/child contract for embedded pane pages
- `visualizer-in-embedded-mode.md` — visualizer behavior in embedded/fullscreen contexts
- `genre-pane-messaging.md` — genre-driven pane messaging flow
- `kiosk-designer.md` — kiosk authoring/preview/push tool
- `kiosk-editor-mode.md` — controller-side designer/editor branch of kiosk mode
- `tablet-kiosk-shell-differences.md` — richer kiosk-pane behavior in tablet shell
- `tablet-recents-and-lastfm.md` — tablet recents-row configuration, Last.fm row sources, URL seeding, and stability guardrails
- `kiosk-shell-anatomy.md` — anatomy map of kiosk shell path
- `app-shell-anatomy.md` — anatomy map of app shell / hero cards / queue card
- `controller-tablet-anatomy.md` — anatomy map of tablet controller shell
- `controller-mobile-anatomy.md` — anatomy map of mobile controller shell

## Supporting / environment / operations pages

- `deployment-and-ops.md` — deployment/runtime/verification themes
- `install-and-validation.md` — installer validation, clean-machine checks, idempotency, upgrade, rollback, and public-ready gate
- `local-environment.md` — Brian-specific live environment truth
- `airplay-metadata-hardening.md` — moOde-side AirPlay metadata hardening, watchdog supervision, and verification
- `repo-coverage-notes.md` — coverage self-audit
- `wiki-gap-review-2026-04-06.md` — focused source-doc vs wiki gap review and next recommended additions
- `deepwiki-structure-mapping.md` — target top-level structure map from DeepWiki sections to the current local wiki, including restructuring recommendations
- `wiki-structure-notes.md` — page-structure and hierarchy rules
- `wiki-operations.md` — ingest/query/lint model
- `log.md` — chronological major milestones for the wiki itself

## Current status

At the moment, this page is the catalog layer of the wiki.

A useful current split is:
- `README.md` = broad overview
- `api-state-truth-endpoints.md` = central `/now-playing`-anchored state hinge
- `index.md` = page catalog
- `log.md` = chronology
- `wiki-operations.md` = maintenance workflow

## Generated
<!-- openclaw:wiki:index:start -->
- Render mode: `native`
- Total pages: 94
- Claims: 0
- Sources: 93
- Entities: 0
- Concepts: 0
- Syntheses: 0
- Reports: 1

### Sources
- [AGENTS](sources/agents.md)
- [airplay metadata hardening](sources/airplay-metadata-hardening.md)
- [alexa interface](sources/alexa-interface.md)
- [api config and runtime endpoints](sources/api-config-and-runtime-endpoints.md)
- [api endpoint catalog](sources/api-endpoint-catalog.md)
- [api playback and queue endpoints](sources/api-playback-and-queue-endpoints.md)
- [api service overview](sources/api-service-overview.md)
- [api state truth endpoints](sources/api-state-truth-endpoints.md)
- [api youtube radio and integration endpoints](sources/api-youtube-radio-and-integration-endpoints.md)
- [app shell anatomy](sources/app-shell-anatomy.md)
- [architecture](sources/architecture.md)
- [backend change verification runbook](sources/backend-change-verification-runbook.md)
- [config advanced json](sources/config-advanced-json.md)
- [config alexa setup](sources/config-alexa-setup.md)
- [config display and render features](sources/config-display-and-render-features.md)
- [config feature breakdown](sources/config-feature-breakdown.md)
- [config interface](sources/config-interface.md)
- [config lastfm and scrobbling](sources/config-lastfm-and-scrobbling.md)
- [config network and runtime](sources/config-network-and-runtime.md)
- [config notifications](sources/config-notifications.md)
- [config page anatomy](sources/config-page-anatomy.md)
- [config podcasts and library paths](sources/config-podcasts-and-library-paths.md)
- [config ratings](sources/config-ratings.md)
- [configuration and diagnostics interfaces](sources/configuration-and-diagnostics-interfaces.md)
- [controller device alias pages](sources/controller-device-alias-pages.md)
- [controller kiosk mode](sources/controller-kiosk-mode.md)
- [controller kiosk scaffold](sources/controller-kiosk-scaffold.md)
- [controller mobile anatomy](sources/controller-mobile-anatomy.md)
- [controller now playing anatomy](sources/controller-now-playing-anatomy.md)
- [controller queue interface](sources/controller-queue-interface.md)
- [controller tablet anatomy](sources/controller-tablet-anatomy.md)
- [decisions and history](sources/decisions-and-history.md)
- [deepwiki structure mapping](sources/deepwiki-structure-mapping.md)
- [deployment and ops](sources/deployment-and-ops.md)
- [desktop browser interface](sources/desktop-browser-interface.md)
- [development](sources/development.md)
- [diagnostics interface](sources/diagnostics-interface.md)
- [diagnostics page anatomy](sources/diagnostics-page-anatomy.md)
- [display enhancement peppy player flow](sources/display-enhancement-peppy-player-flow.md)
- [display interface](sources/display-interface.md)
- [display issue triage runbook](sources/display-issue-triage-runbook.md)
- [display launch and wrapper surfaces](sources/display-launch-and-wrapper-surfaces.md)
- [display surface troubleshooting](sources/display-surface-troubleshooting.md)
- [embedded pane contracts](sources/embedded-pane-contracts.md)
- [fragile behavior ownership](sources/fragile-behavior-ownership.md)
- [genre pane messaging](sources/genre-pane-messaging.md)
- [glossary](sources/glossary.md)
- [gotchas and lessons](sources/gotchas-and-lessons.md)
- [inbox](sources/inbox.md)
- [install and validation](sources/install-and-validation.md)
- [integrations](sources/integrations.md)
- [kiosk designer](sources/kiosk-designer.md)
- [kiosk editor mode](sources/kiosk-editor-mode.md)
- [kiosk interface](sources/kiosk-interface.md)
- [kiosk launch and routing](sources/kiosk-launch-and-routing.md)
- [kiosk right pane routing](sources/kiosk-right-pane-routing.md)
- [kiosk shell anatomy](sources/kiosk-shell-anatomy.md)
- [library health interface](sources/library-health-interface.md)
- [library health page anatomy](sources/library-health-page-anatomy.md)
- [local environment](sources/local-environment.md)
- [log](sources/log.md)
- [media library](sources/media-library.md)
- [now playing surface variants](sources/now-playing-surface-variants.md)
- [open questions](sources/open-questions.md)
- [phone interface](sources/phone-interface.md)
- [playback authority by mode](sources/playback-authority-by-mode.md)
- [playback features](sources/playback-features.md)
- [playback issue triage runbook](sources/playback-issue-triage-runbook.md)
- [playback mode troubleshooting](sources/playback-mode-troubleshooting.md)
- [queue and playback model](sources/queue-and-playback-model.md)
- [queue wizard internals](sources/queue-wizard-internals.md)
- [radio metadata eval interface](sources/radio-metadata-eval-interface.md)
- [README](sources/readme.md)
- [repo coverage notes](sources/repo-coverage-notes.md)
- [restart and runtime admin troubleshooting](sources/restart-and-runtime-admin-troubleshooting.md)
- [route ownership map](sources/route-ownership-map.md)
- [source map](sources/source-map.md)
- [style token and surface naming](sources/style-token-and-surface-naming.md)
- [system overview](sources/system-overview.md)
- [tablet interface](sources/tablet-interface.md)
- [tablet kiosk shell differences](sources/tablet-kiosk-shell-differences.md)
- [tablet recents and lastfm](sources/tablet-recents-and-lastfm.md)
- [theme interface](sources/theme-interface.md)
- [theme page anatomy](sources/theme-page-anatomy.md)
- [user interfaces](sources/user-interfaces.md)
- [visualizer in embedded mode](sources/visualizer-in-embedded-mode.md)
- [WIKI](sources/wiki.md)
- [wiki gap review 2026 04 06](sources/wiki-gap-review-2026-04-06.md)
- [wiki lint and health](sources/wiki-lint-and-health.md)
- [wiki operations](sources/wiki-operations.md)
- [wiki structure notes](sources/wiki-structure-notes.md)
- [workflows](sources/workflows.md)
- [youtube interface](sources/youtube-interface.md)

### Entities
- No entities yet.

### Concepts
- No concepts yet.

### Syntheses
- No syntheses yet.

### Reports
- [Lint Report](reports/lint.md)
<!-- openclaw:wiki:index:end -->
