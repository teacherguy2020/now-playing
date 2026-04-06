---
title: architecture
page_type: hub
topics:
  - runtime
  - api
  - controller
  - integration
confidence: medium
---

# architecture

## Purpose

This page documents the structural shape of the `now-playing` project.

A stronger current interpretation is:
- the project is not a simple UI over MPD
- it is a moOde-centered enhancement system with an app-host control plane, controller/display surfaces, playback/queue mediation logic, and multiple important integration boundaries
- many visible behaviors are produced by app-host normalization and translation layers rather than by one raw source alone

So this page should act as the structural hub for the project, not as a loose conceptual overview.

## Why this page matters

Agents tend to make the wrong architectural guess first.

Typical wrong guesses are:
- treating the project as mostly a static frontend
- treating MPD as the only meaningful source of truth
- treating kiosk as just another page instead of a shell mode
- treating API routes as generic plumbing instead of behavior ownership points
- treating display bugs as purely visual when they may start in state truth or runtime boundaries

This page exists to keep the high-level structure explicit before drilling into files.

## The current structural shape

A useful current structural summary is:

### 1. Central state-truth layer
The app-host API exposes central visible-truth surfaces such as:
- `/now-playing`
- `/next-up`

These are not trivial pass-through routes.
They are part of the architecture because they normalize mode-aware playback state into the payload consumed by controller/display surfaces.

Best companion page:
- `api-state-truth-endpoints.md`

### 2. App-host control plane
The app-host API is one of the project’s main architectural surfaces.
It owns:
- runtime/config control paths
- playback/queue mediation routes
- diagnostics/runtime-admin behavior
- bridge logic into moOde, MPD, YouTube, Alexa, podcasts, and other integrations

Best companion pages:
- `api-service-overview.md`
- `api-endpoint-catalog.md`

### 3. Controller / browser shell layer
The controller/browser family is a major UI layer, not a thin wrapper.
It owns:
- app shell behavior
- controller shell behavior
- queue interface behavior
- kiosk-backed shell behavior in `controller.html`
- embedded child-page hosting and pane logic

Best companion pages:
- `desktop-browser-interface.md`
- `tablet-interface.md`
- `phone-interface.md`
- `app-shell-anatomy.md`
- `controller-tablet-anatomy.md`

### 4. Display / presentation layer
The display branch turns app-host truth into room-facing/browser-facing presentation.
It includes:
- display modes such as Player / Peppy / Visualizer
- kiosk as a shell/presentation mode
- launch/wrapper/helper pages such as `displays.html`
- embedded visual behavior in controller-hosted contexts

Best companion pages:
- `display-interface.md`
- `display-launch-and-wrapper-surfaces.md`
- `visualizer-in-embedded-mode.md`
- `kiosk-interface.md`

### 5. Queue / playback mediation layer
Queue and playback are not one flat thing.
The architecture separates:
- playback truth
- queue control
- queue shaping/curation

This is important because the queue surface, Queue Wizard, and playback authority are related but not interchangeable.

Best companion pages:
- `queue-and-playback-model.md`
- `playback-authority-by-mode.md`
- `controller-queue-interface.md`
- `queue-wizard-internals.md`

### 6. Integration boundary layer
The project continuously translates between:
- app-host truth
- moOde runtime
- MPD playback state
- YouTube
- Alexa
- radio metadata flows
- podcasts and Last.fm/scrobbling

This is architectural, not incidental.
A lot of bugs only make sense at these boundaries.

Best companion page:
- `integrations.md`

### 7. Runtime / host / environment layer
The project’s real behavior depends on host/runtime reality.
Important distinctions include:
- app host vs moOde host
- served page behavior vs host-side display effect
- normal app files vs host override material

Best companion pages:
- `deployment-and-ops.md`
- `local-environment.md`
- `config-network-and-runtime.md`

## Architectural boundaries that matter

## API vs UI
The API is not just backend plumbing.
It is a behavior ownership layer.
Many UI surfaces are thin or moderate clients over meaningful app-host route logic.

## State truth vs presentation
A visible display/controller bug may start in:
- `/now-playing`
- `/next-up`
- mode-specific authority logic
not only in the page that renders the output.

## Shell mode vs content surface
This distinction matters especially in kiosk and embedded flows.
Examples:
- shell owner vs content owner
- queue pane shell vs queue content UI
- controller shell vs embedded child page

## Renderer vs shell mode
Player/Peppy/Visualizer are renderer/display modes.
Kiosk is a presentation/shell mode.
That split should remain architectural truth.

## What this architecture is now confident about

The current repo and wiki support these stronger claims:
- `/now-playing` is one of the central truth hinges of the system
- the app-host API is a main architectural layer, not just plumbing
- controller surfaces own significant shell and interaction behavior
- the display branch is downstream of state truth, not independent from it
- kiosk is controller-backed shell behavior, not just a separate page family
- queue/playback/queue-shaping are distinct architectural layers
- integration boundaries are core to understanding system behavior

## Best next pages by architectural question

### “Where does visible truth come from?”
Use:
- `api-state-truth-endpoints.md`
- `playback-authority-by-mode.md`

### “Where does controller/display behavior actually live?”
Use:
- `display-interface.md`
- `app-shell-anatomy.md`
- `controller-kiosk-mode.md`

### “Where is queue/playback behavior split?”
Use:
- `queue-and-playback-model.md`
- `controller-queue-interface.md`
- `queue-wizard-internals.md`

### “Which external/runtime boundary matters here?”
Use:
- `integrations.md`
- `deployment-and-ops.md`
- `local-environment.md`

## Relationship to other pages

This page should stay linked with:
- `system-overview.md`
- `api-service-overview.md`
- `api-state-truth-endpoints.md`
- `display-interface.md`
- `integrations.md`
- `source-map.md`
- `queue-and-playback-model.md`

## Current status

At the moment, this page should be read as the structural hub for the project.

It is no longer just a conceptual layer diagram.
The current wiki already supports stronger architectural claims about:
- state truth
- control-plane ownership
- controller/display shell behavior
- queue/playback separation
- integration boundaries
- runtime/host reality.
