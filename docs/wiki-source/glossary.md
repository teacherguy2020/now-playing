# glossary

## Purpose

This page defines project-specific terms and names used across the `now-playing` system and this knowledge base.

It is meant to reduce ambiguity for future agents and for Brian when discussing:
- subsystems
- interfaces
- integrations
- operational concepts

## How to use this page

Use this page when:
- a term appears repeatedly across multiple wiki pages
- two nearby concepts are easy to blur together
- you need a stable project-specific meaning before making implementation or documentation decisions

This page is not meant to replace deeper branch pages. It is meant to stabilize vocabulary before or while reading them.

## Core project terms

- **now-playing** — the overall project/system described by this wiki; a media-control and presentation system with UI, playback, display, integration, and operational concerns.
- **media library** — the area of the system concerned with browsing and managing available media content.
- **playlist management** — the feature area concerned with organizing and controlling playlists.
- **queue wizard** — a documented interface/feature area for managing queue-oriented playback flow.
- **filter builder** — a documented interface/feature area for filtering or shaping content selection.
- **transport controls** — playback-control actions and surfaces.
- **ratings / favorites** — the feature area for user curation and preference marking.
- **animated art system** — the feature area concerned with animated visual art presentation.
- **art caching system** — the subsystem for caching artwork or presentation assets.
- **kiosk mode** — a display-oriented operating mode focused on a dedicated presentation surface.

## Interfaces and surfaces

- **display pages** — documented display-oriented pages/surfaces used for showing project output.
- **mobile controller** — the mobile-facing control surface for interacting with the system remotely.
- **queue wizard interface** — the queue-specific user-facing interface.
- **filter builder** — both a feature area and a user-facing interface for selection/filter logic.
- **radio stations** — the user-facing area for station-oriented playback sources.
- **media library view** — the browsing surface for available content.

## Integrations and external systems

- **MPD** — Music Player Daemon integration used by the project’s playback/control ecosystem.
- **moOde** — an important display/runtime-side external system in this project’s environment and integration model.
- **YouTube** — an external content/integration source documented in the project.
- **GET / POST request flows** — documented request patterns used where the system interacts through HTTP/API-style operations.
- **header auth** — documented request/auth pattern using headers instead of query parameters.

## Operational vocabulary

- **runtime verification** — the practice of checking what is actually running and whether the system is behaving correctly.
- **service control** — starting, stopping, or otherwise managing the runtime services/processes behind the system.
- **configuration management** — the operational/configuration layer for system behavior and setup.
- **API host / webAPI machine** — the host or machine context used for API-side operation in the docs.
- **Chromium process** — a runtime/browser-process concept important enough to have dedicated checks in the documentation.
- **wake display configuration** — configuration related to waking or controlling display state.

## Relationship to other pages

This page should stay closely linked with:
- [README.md](README.md)
- [system-overview.md](system-overview.md)
- [architecture.md](architecture.md)
- [deepwiki-structure-mapping.md](deepwiki-structure-mapping.md)

## Terms needing clarification

These terms are already useful, but still need tighter definitions over time:
- some documented surfaces still need precise file/service ownership mapping in `source-map.md`
- some feature-area terms still need deeper behavioral definitions from repo reality, not only doc titles
- `moOde` and `MPD` are clearly important, but later versions of this page should explain more precisely how each one participates in current live operation

Distinctions future agents should not blur:
- a documented feature area is not automatically the same thing as its implementation ownership
- system-level/runtime configuration is not the same thing as application-level state or UI behavior
- project-wide terminology is not the same thing as Brian-specific local-environment terminology

Good follow-up glossary targets:
- tighter definitions for terms whose behavior is still only partially mapped
- a later mapping-oriented glossary layer for file/service ownership if that becomes useful
- deeper integration vocabulary once MPD/moOde/request-flow ownership is mapped more precisely

## Timestamp

Last updated: 2026-04-06 06:47 America/Chicago
