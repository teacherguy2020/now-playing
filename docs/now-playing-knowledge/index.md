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
- `kiosk-shell-anatomy.md` — anatomy map of kiosk shell path
- `app-shell-anatomy.md` — anatomy map of app shell / hero cards / queue card
- `controller-tablet-anatomy.md` — anatomy map of tablet controller shell
- `controller-mobile-anatomy.md` — anatomy map of mobile controller shell

## Supporting / environment / operations pages

- `deployment-and-ops.md` — deployment/runtime/verification themes
- `local-environment.md` — Brian-specific live environment truth
- `repo-coverage-notes.md` — coverage self-audit
- `wiki-structure-notes.md` — page-structure and hierarchy rules
- `wiki-operations.md` — ingest/query/lint model
- `log.md` — chronological major milestones for the wiki itself

## Current status

At the moment, this page is the catalog layer of the wiki.

A useful current split is:
- `README.md` = broad overview
- `index.md` = page catalog
- `log.md` = chronology
- `wiki-operations.md` = maintenance workflow
