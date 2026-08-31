---
title: deepwiki-structure-mapping
page_type: support
topics:
  - metadata
  - structure
  - planning
  - documentation
confidence: high
---

# deepwiki structure mapping

## Purpose

This page maps the preferred DeepWiki-style top-level structure for the `now-playing` project against the current local wiki.

It exists because the current wiki has strong content and strong operational truth, but its presentation layer is still less unified than the DeepWiki model.

The goal is not to copy DeepWiki blindly.
The goal is to combine:
- DeepWiki's concept-first top-level clarity
- this local wiki's stronger operational truth, local-environment reality, and maintenance value

## Target top-level structure

The preferred top-level structure is:
1. Overview
2. User Interfaces
3. Display Enhancement System
4. Queue Management
5. Media Library
6. Playback Features
7. External Integrations
8. Theme & Customization
9. Backend API
10. Configuration and Administration
11. Development
12. Glossary

This structure is strong because it is:
- concept-first
- broad enough for orientation
- specific enough to branch cleanly
- compatible with both user-facing and engineering-facing understanding

## Mapping summary

## 1. Overview

### Current closest pages
- [README.md](README.md)
- [system-overview.md](system-overview.md)
- [architecture.md](architecture.md)
- [decisions-and-history.md](decisions-and-history.md)
- [gotchas-and-lessons.md](gotchas-and-lessons.md)

### Current problem
- overview is currently spread across multiple strong pages
- the pages are useful, but the top-level reading ladder is still more fragmented than the DeepWiki model

### Recommended restructuring move
- keep `README.md` as the front door
- keep `system-overview.md` and `architecture.md` as top-level overview pages
- add a future [core-concepts.md](core-concepts.md) page to tighten the teaching layer between overview and branch pages

### Status
- strong content already exists
- structure and reading flow still need unification

## 2. User Interfaces

### Current closest pages
- [user-interfaces.md](user-interfaces.md)
- [desktop-browser-interface.md](desktop-browser-interface.md)
- [tablet-interface.md](tablet-interface.md)
- [phone-interface.md](phone-interface.md)
- [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)
- [controller-device-alias-pages.md](controller-device-alias-pages.md)
- [now-playing-surface-variants.md](now-playing-surface-variants.md)

### Current problem
- interface content is rich but distributed across family hubs, anatomy pages, and special-case pages
- the branch is good for maintenance, but less unified as a top-level presentation layer

### Recommended restructuring move
- keep `user-interfaces.md` as the top-level hub for this branch
- make desktop/tablet/phone/config-diagnostics clearly subordinate under it
- keep anatomy pages as child/reference pages rather than front-door pages

### Status
- good fit overall
- needs cleaner parent/child presentation

## 3. Display Enhancement System

### Current closest pages
- [display-interface.md](display-interface.md)
- [display-enhancement-peppy-player-flow.md](display-enhancement-peppy-player-flow.md)
- [display-launch-and-wrapper-surfaces.md](display-launch-and-wrapper-surfaces.md)
- [visualizer-in-embedded-mode.md](visualizer-in-embedded-mode.md)
- [kiosk-interface.md](kiosk-interface.md)
- [kiosk-launch-and-routing.md](kiosk-launch-and-routing.md)

### Current problem
- display and kiosk are well documented, but the display-enhancement branch still shares top-level attention with broader display/interface concepts
- the branch is conceptually strong, but not yet grouped under one especially legible “Display Enhancement System” parent

### Recommended restructuring move
- consider introducing a future parent page explicitly named `display-enhancement-system.md`
- or strengthen `display-interface.md` to make Peppy/Player/Visualizer a more obvious major sub-branch

### Status
- good content, slightly diffuse top-level framing

## 4. Queue Management

### Current closest pages
- [queue-and-playback-model.md](queue-and-playback-model.md)
- [controller-queue-interface.md](controller-queue-interface.md)
- [queue-wizard-internals.md](queue-wizard-internals.md)
- [queue-interface-vs-queue-wizard.md](queue-interface-vs-queue-wizard.md)
- [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md)

### Current problem
- queue management currently shares territory with playback pages
- the topic is covered well but not always presented as a distinct top-level concept

### Recommended restructuring move
- strengthen queue pages into a clearly grouped branch under a Queue Management top-level concept
- keep playback overlap, but do not let queue identity dissolve into generic playback discussion

### Status
- strong underlying material
- should become a more explicit branch

## 5. Media Library

### Current closest pages
- [library-health-interface.md](library-health-interface.md)
- [library-health-page-anatomy.md](library-health-page-anatomy.md)
- [genre-pane-messaging.md](genre-pane-messaging.md)
- source-map references to albums/artists/genres/playlists branches

### Current problem
- library-related knowledge is present, but it is less clearly gathered into one top-level branch than in the DeepWiki model
- media library behavior is currently distributed across library-health, controller browsing surfaces, and adjacent anatomy pages

### Recommended restructuring move
- create a future media-library parent page that groups browsing, inventory, health/audit, and genre/album relationships

### Status
- partial fit now
- likely needs a new parent page

## 6. Playback Features

### Current closest pages
- [playback-authority-by-mode.md](playback-authority-by-mode.md)
- [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
- [playback-issue-triage-runbook.md](playback-issue-triage-runbook.md)
- [queue-and-playback-model.md](queue-and-playback-model.md)
- [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)

### Current problem
- playback is documented strongly, but split between authority, queue coupling, troubleshooting, and mode-specific behavior
- it does not yet feel like one clean top-level “Playback Features” branch

### Recommended restructuring move
- create or strengthen a playback-features parent page that sits above authority/troubleshooting/mode pages

### Status
- strong content
- presentation still fragmented

## 7. External Integrations

### Current closest pages
- [integrations.md](integrations.md)
- [alexa-interface.md](alexa-interface.md)
- [youtube-interface.md](youtube-interface.md)
- [radio-metadata-eval-interface.md](radio-metadata-eval-interface.md)
- [airplay-metadata-hardening.md](airplay-metadata-hardening.md)
- [config-lastfm-and-scrobbling.md](config-lastfm-and-scrobbling.md)

### Current problem
- integrations are already conceptually present, but spread across feature pages and ops pages
- this works for maintenance, but the top-level branch could be clearer

### Recommended restructuring move
- keep `integrations.md` as the branch hub
- make child branches more explicit under it: Alexa, YouTube, radio metadata, Last.fm, AirPlay, moOde/MPD

### Status
- good fit overall
- mainly needs cleaner grouping

## 8. Theme & Customization

### Current closest pages
- [theme-interface.md](theme-interface.md)
- [theme-page-anatomy.md](theme-page-anatomy.md)
- [style-token-and-surface-naming.md](style-token-and-surface-naming.md)
- [kiosk-designer.md](kiosk-designer.md)

### Current problem
- theme and customization are covered well, but some customization flows are spread between shell theme, kiosk designer, and display builder pages

### Recommended restructuring move
- keep Theme & Customization as an explicit top-level branch
- let shell theme, style/token naming, kiosk designer, and selected display-builder pages live beneath it with clearer cross-links

### Status
- strong candidate for an explicit top-level branch

## 9. Backend API

### Current closest pages
- [api-service-overview.md](api-service-overview.md)
- [api-state-truth-endpoints.md](api-state-truth-endpoints.md)
- [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md)
- [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md)
- [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
- [api-endpoint-catalog.md](api-endpoint-catalog.md)

### Current problem
- this branch is accurate and deep, but still feels list-like rather than gracefully layered

### Recommended restructuring move
- keep `api-service-overview.md` as the root
- more explicitly present child branch order as:
  1. state truth
  2. playback and queue
  3. config/runtime admin
  4. integrations
  5. endpoint catalog

### Status
- strong content, moderate presentation cleanup needed

## 10. Configuration and Administration

### Current closest pages
- [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)
- [config-interface.md](config-interface.md)
- [config-feature-breakdown.md](config-feature-breakdown.md)
- [config-network-and-runtime.md](config-network-and-runtime.md)
- [config-display-and-render-features.md](config-display-and-render-features.md)
- [diagnostics-interface.md](diagnostics-interface.md)
- [backend-change-verification-runbook.md](backend-change-verification-runbook.md)

### Current problem
- strong branch already exists, but the top-level name is not as clean and inclusive as “Configuration and Administration”
- diagnostics, runtime-admin, and config are all present, but slightly spread between interface and ops pages

### Recommended restructuring move
- treat this as one of the best existing fits
- possibly rename or reframe `configuration-and-diagnostics-interfaces.md` later to better match the broader administrative branch identity

### Status
- already close to DeepWiki structure

## 11. Development

### Current closest pages
- [source-map.md](source-map.md)
- [workflows.md](workflows.md)
- [wiki-operations.md](wiki-operations.md)
- [wiki-lint-and-health.md](wiki-lint-and-health.md)
- [repo-coverage-notes.md](repo-coverage-notes.md)
- [backend-change-verification-runbook.md](backend-change-verification-runbook.md)

### Current problem
- development-facing knowledge exists, but it is spread between engineering-reference, wiki-maintenance, and operational verification pages
- there is no obvious top-level “Development” branch page yet

### Recommended restructuring move
- create a future `development.md` parent page that groups code navigation, workflows, verification, and wiki maintenance

### Status
- likely needs a new parent page

## 12. Glossary

### Current closest pages
- [glossary.md](glossary.md)

### Current problem
- none structurally; this is already a clean match

### Recommended restructuring move
- keep glossary as its own top-level branch/page

### Status
- strong fit already

## High-level conclusions

## Best existing structural fits
These branches already map fairly well:
- Overview
- User Interfaces
- External Integrations
- Backend API
- Configuration and Administration
- Glossary

## Branches that likely need stronger parent pages
These are the clearest candidates for future top-level parent pages:
- Media Library
- Playback Features
- Development
- Core Concepts (not a DeepWiki top-level branch, but likely still needed here as a teaching layer)

## Branches that mostly need presentation cleanup rather than brand-new content
These already have strong content but need cleaner grouping:
- Display Enhancement System
- Queue Management
- Theme & Customization

## Recommended restructuring order

The best next restructuring sequence is probably:
1. add `core-concepts.md`
2. strengthen `user-interfaces.md` as an umbrella branch page
3. create or strengthen explicit parent pages for Media Library and Playback Features
4. create a `development.md` parent page
5. re-group display/theme/queue branches under cleaner top-level headings

That order improves conceptual clarity without discarding the operational value already built into the wiki.

## How to use this page

Use this page when deciding:
- what the top-level wiki structure should become
- whether a current page belongs under a clearer branch
- whether a new parent page is justified
- whether a current page should remain support/reference material rather than becoming top-level navigation

## Timestamp

Last updated: 2026-04-06 06:08 America/Chicago
