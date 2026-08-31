---
title: README
page_type: hub
topics:
  - metadata
  - ops
  - environment
confidence: high
---

# now-playing project knowledge base

This wiki tracks the architecture, history, and operational realities of the `now-playing` project — a moOde Audio Player add-on and extension ecosystem for richer playback state, metadata, displays, controls, and surrounding operational glue.

`now-playing` should be understood first as a **moOde-centered enhancement and companion system**, not as a generic media platform. It extends a moOde-based playback setup with richer now-playing state, metadata handling, artwork/display surfaces, control flows, and operational glue across the live environment.

moOde is the anchor. Other inputs, protocols, and display paths matter, but they should be understood in relation to that moOde-centered runtime rather than treated as peers in a generic orchestration layer.

One especially important architectural fact is that the independent display/controller system branches outward from the app-host’s `/now-playing` state surface. That endpoint is one of the project’s central visible-truth hinges: many richer controller, display, kiosk, and metadata behaviors make the most sense only after understanding how `/now-playing` turns playback/mode/runtime state into the payload the UI consumes.

## What this is

This directory is the local wiki and knowledge base for the `now-playing` project.

It is meant to help Brian and future agents:
- understand the system quickly
- form the right mental model before diving into files
- distinguish project-wide structure from Brian-specific local reality
- preserve durable lessons, decisions, and operational knowledge

This wiki is not just a summary. It is the working reference for real maintenance and future changes.

## What this is not

This is not primarily a generic, source-agnostic media orchestration project. While the system touches multiple protocols, metadata paths, and display surfaces, the practical center of the project is enhancing and supporting a moOde installation and the surrounding user experience.

Current state:
- strong orientation and browseability
- substantially trust-hardened source map
- stronger operational boundary guidance around playback modes, runtime/admin behavior, and restart-sensitive changes
- still improving toward a more exhaustive operational reference

## Start here

If you are new to the project or returning after a gap, use this reading order first:

1. **What this system is** → [system-overview.md](system-overview.md)
2. **How the system is structured** → [architecture.md](architecture.md)
3. **Where visible truth comes from** → [api-state-truth-endpoints.md](api-state-truth-endpoints.md) (especially `/now-playing` and `/next-up`)
4. **Where code and assets live** → [source-map.md](source-map.md)
5. **What is true in Brian's live setup** → [local-environment.md](local-environment.md)
6. **What tends to go wrong** → [gotchas-and-lessons.md](gotchas-and-lessons.md)

Then use [decisions-and-history.md](decisions-and-history.md) when you need rationale or historical context.

If the question is how the local wiki should evolve toward a clearer DeepWiki-style top-level structure, use [deepwiki-structure-mapping.md](deepwiki-structure-mapping.md).

## Read by goal

### Understand the system
Start with:
- [system-overview.md](system-overview.md)
- [architecture.md](architecture.md)
- [user-interfaces.md](user-interfaces.md)
- [glossary.md](glossary.md)

### Work on the system
Start with:
- [source-map.md](source-map.md)
- [architecture.md](architecture.md)
- [integrations.md](integrations.md)
- [workflows.md](workflows.md)

### Work on UI and display behavior
Start with:
- [user-interfaces.md](user-interfaces.md)
- [display-interface.md](display-interface.md)
- [workflows.md](workflows.md)
- [source-map.md](source-map.md)

Then reality-check with:
- [display-surface-troubleshooting.md](display-surface-troubleshooting.md)
- [gotchas-and-lessons.md](gotchas-and-lessons.md)
- [local-environment.md](local-environment.md) when runtime/display state may matter

### Debug runtime, playback, or integration behavior
Start with:
- [local-environment.md](local-environment.md)
- [deployment-and-ops.md](deployment-and-ops.md)
- [integrations.md](integrations.md)

Then check:
- [workflows.md](workflows.md)
- [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
- [restart-and-runtime-admin-troubleshooting.md](restart-and-runtime-admin-troubleshooting.md)
- [gotchas-and-lessons.md](gotchas-and-lessons.md)

Especially relevant when the question is about:
- app-host vs moOde-host behavior
- restart-sensitive vs live-applied changes
- current-song / art / status authority by playback mode

### Deploy or operate the system
Start with:
- [deployment-and-ops.md](deployment-and-ops.md)
- [install-and-validation.md](install-and-validation.md)
- [local-environment.md](local-environment.md)

Then check:
- [workflows.md](workflows.md)
- [decisions-and-history.md](decisions-and-history.md)
- [gotchas-and-lessons.md](gotchas-and-lessons.md)

Especially relevant when the question is about:
- restart-sensitive vs live-applied config/runtime changes
- app-host vs moOde-host control boundaries
- host-side runtime-admin or override effects

### Look up terms, history, or prior decisions
- [glossary.md](glossary.md)
- [decisions-and-history.md](decisions-and-history.md)
- [gotchas-and-lessons.md](gotchas-and-lessons.md)

## How to use this wiki

- Use the **knowledge pages** to understand structure, ownership, environment reality, and historical context.
- Use the **runbooks** when you already have a concrete live problem and need a practical troubleshooting path.
- When in doubt, start with the knowledge pages, then drop into the most relevant runbook.

## Knowledge pages

- `system-overview.md` — broad overview of the project, feature areas, and system purpose
- `architecture.md` — major layers, boundaries, and structural relationships
- `user-interfaces.md` — human-visible and operator-visible interface families, organized by how the system is actually used
- `configuration-and-diagnostics-interfaces.md` — operator-facing config, diagnostics, and health/inspection surfaces
- `config-interface.md` — implementation-aware drill-down for the main runtime configuration console
- `diagnostics-interface.md` — implementation-aware drill-down for the live diagnostics and inspection console
- `library-health-interface.md` — implementation-aware drill-down for library audit and maintenance workflows
- `theme-interface.md` — implementation-aware drill-down for the shell-theme editor and preset system
- `style-token-and-surface-naming.md` — canonical UI surface vocabulary, token ownership rules, and background invariants
- `now-playing-surface-variants.md` — grouped map of the `controller-now-playing*` family, including variants and redirect shims
- `controller-device-alias-pages.md` — grouped map of thin iPad/iPhone controller alias and redirect entry pages
- `display-launch-and-wrapper-surfaces.md` — grouped map of display launcher, wrapper, and redirect helper pages
- `youtube-interface.md` — implementation-aware drill-down for the YouTube search, resolve, playlist-expand, and queue bridge surface
- `radio-metadata-eval-interface.md` — implementation-aware drill-down for the radio metadata QA and enrichment-evaluation console
- `alexa-interface.md` — implementation-aware drill-down for the Alexa corrections, recently-heard review, and voice-command guidance surface
- `config-feature-breakdown.md` — feature-level decomposition of the major modules inside `config.html`
- `config-network-and-runtime.md` — detailed drill-down for Config's host/path/runtime bootstrap and environment verification layer
- `config-podcasts-and-library-paths.md` — podcast enablement, path ownership, nightly automation, and podcast-root repair flows
- `config-display-and-render-features.md` — grouped drill-down for Radio Artwork, moOde Display Enhancement, Animated Art, and Album Personnel
- `config-ratings.md` — ratings feature enablement plus sticker-DB verification, backup, and restore flows
- `config-lastfm-and-scrobbling.md` — mpdscribble control plus Last.fm/Vibe setup and row-behavior options
- `config-notifications.md` — Pushover-backed track notifications and monitor/timing controls
- `config-alexa-setup.md` — Alexa enablement, public-domain setup, route webhook configuration, and reachability checks
- `config-advanced-json.md` — raw full-config editing, formatting, and full-save behavior
- `api-service-overview.md` — API-centered parent page for the app-host service and route families
- `api-state-truth-endpoints.md` — focused explanation of `/now-playing`, `/next-up`, Alexa now-playing helpers, and other central visible-state surfaces
- `api-config-and-runtime-endpoints.md` — config/runtime control-plane routes and maintenance/verification endpoint families
- `api-youtube-radio-and-integration-endpoints.md` — YouTube, radio debug/eval, and adjacent integration-feature endpoint families
- `api-playback-and-queue-endpoints.md` — playback-control and queue-shaping endpoint families documented so far
- `source-map.md` — directory-oriented navigation map for where important code and assets live
- `repo-coverage-notes.md` — audit of what the wiki covers strongly, strategically, lightly, or intentionally not at all across the repo
- `wiki-gap-review-2026-04-06.md` — focused comparison of source docs versus wiki coverage and the high-value remaining gaps identified during that review
- `wiki-operations.md` — operating model for maintaining the wiki through ingest, query, and lint work
- `wiki-lint-and-health.md` — quality-control checklist for reachability, drift, duplication, retrieval quality, and confidence hygiene
- `index.md` — content-oriented catalog of pages and branches in the wiki
- `log.md` — chronological record of major wiki evolution milestones
- `workflows.md` — common ways work tends to happen in this project
- `display-interface.md` — map of the display-oriented surfaces, modes, and runtime-sensitive presentation paths
- `display-enhancement-peppy-player-flow.md` — concrete operational reference for builder-first Peppy/Player/Visualizer display-enhancement flow
- `kiosk-interface.md` — kiosk-style display usage as a presentation mode with host/runtime/display-state dependencies
- `kiosk-launch-and-routing.md` — how kiosk entrypoints hand off into controller-backed kiosk behavior
- `kiosk-designer.md` — preview, preset, and moOde push workflow for kiosk presentation
- `controller-kiosk-scaffold.md` — the separate standalone `controller-kiosk.html` scaffold path
- `controller-kiosk-mode.md` — controller-side behavior when kiosk mode is active
- `desktop-browser-interface.md` — desktop/browser-oriented interface hub for larger-screen flexible access
- `tablet-interface.md` — tablet-oriented controller/interface hub tying together pane-rich and kiosk-adjacent behavior
- `tablet-recents-and-lastfm.md` — recents-row customization, Last.fm row-source mapping, URL seeding, and stability guardrails in tablet controller flows
- `phone-interface.md` — phone-oriented controller/interface hub for compact direct interaction
- `kiosk-right-pane-routing.md` — right-pane embedded kiosk/controller subview loading inside controller kiosk mode
- `embedded-pane-contracts.md` — parent/child contract for embedded kiosk pane pages
- `visualizer-in-embedded-mode.md` — code-aware drill-down for embedded/fullscreen/designer visualizer behavior
- `genre-pane-messaging.md` — semantic pane messaging flow from genres into genre-filtered albums
- `kiosk-editor-mode.md` — controller-side editor/designer branch of kiosk mode
- `tablet-kiosk-shell-differences.md` — where the tablet shell implements richer kiosk-pane behavior than the main controller shell
- `integrations.md` — MPD, moOde, YouTube, request flows, and integration-side cautions
- `deployment-and-ops.md` — runtime, verification, configuration, and operational themes
- `install-and-validation.md` — clean-machine installer validation, idempotency, upgrade, rollback, and public-ready gate
- `local-environment.md` — Brian-specific hosts, deploy targets, and local overrides
- `airplay-metadata-hardening.md` — moOde-side AirPlay metadata CPU/runaway hardening, watchdog behavior, and recovery guidance
- `glossary.md` — project-specific terms, names, and vocabulary
- `decisions-and-history.md` — durable decisions and historically important lessons
- `gotchas-and-lessons.md` — sharp edges, fragile areas, and high-value lessons
- `open-questions.md` — unresolved gaps that still need mapping or confirmation

## Runbooks

- `playback-mode-troubleshooting.md` — local file, AirPlay, UPnP, radio/stream, and fallback playback-state debugging
- `restart-and-runtime-admin-troubleshooting.md` — restart-sensitive vs live-applied changes, runtime-admin actions, and app-host vs moOde-host control
- `display-surface-troubleshooting.md` — desktop/tablet/phone/display-router/moOde-surface troubleshooting and iframe-vs-top-level issues

## Local environment and reality checks

These pages should stay highly visible because they are the difference between theory and the live system.

Before making operational assumptions, check the pages that reflect local truth:

- `local-environment.md` — current hosts, deploy target, and local override reality
- `deployment-and-ops.md` — operational expectations and runtime verification habits
- `gotchas-and-lessons.md` — known project-specific traps that often matter in live work

In this project, local runtime behavior may differ from generic expectations because of host roles, deployment preferences, and local overrides.

## Where to go next

Go here first based on the problem you have:
- **Where does the code live?** → `source-map.md`
- **What is this system and how is it structured?** → `system-overview.md`, then `architecture.md`, then `user-interfaces.md`
- **Is this a runtime/live-behavior issue?** → `local-environment.md`, then `deployment-and-ops.md`, then `restart-and-runtime-admin-troubleshooting.md`
- **Is this an integration or authority-path issue?** → `integrations.md`, then `playback-mode-troubleshooting.md`, then `workflows.md`
- **Is this a display/UI issue?** → `user-interfaces.md`, then `display-interface.md`, then `display-surface-troubleshooting.md`, then `workflows.md`, then `source-map.md`
- **Do I need prior lessons or rationale?** → `decisions-and-history.md`, then `gotchas-and-lessons.md`
- **Is this still unresolved or poorly mapped?** → `open-questions.md`

## How to maintain this wiki

- Keep project-wide knowledge in the general pages (`system-overview`, `architecture`, `workflows`, `integrations`).
- Keep Brian-specific host and setup details in `local-environment.md`.
- When in doubt, separate **project truth** from **local installation truth** instead of mixing them together.
- Put durable lessons into `gotchas-and-lessons.md` or `decisions-and-history.md`, not only in chat.
- If something is uncertain, put it in `open-questions.md` instead of presenting it as settled fact.
- Update this wiki when major behavior changes, important lessons are learned, or file ownership becomes clearer.
- Let the homepage point toward future expansion, but keep the actual source of truth in the individual pages.
- Use `wiki-structure-notes.md` for the explicit rules around hub pages, parent/child/companion relationships, runbooks, reachability, and page-splitting discipline.
- Use `repo-coverage-notes.md` when you need to know how complete the wiki is by repo area before assuming a directory is already deeply mapped.
- Use `wiki-operations.md` when the real question is how to maintain the wiki itself: ingesting new truth, querying effectively, or linting for health and retrieval quality.
- Use `wiki-lint-and-health.md` when the real question is what a good health-check pass should inspect and fix.
- Use `index.md` when the real question is “what pages exist here, and what branch should I open first?”
- Use `log.md` when the real question is how the wiki reached its current shape over time.
