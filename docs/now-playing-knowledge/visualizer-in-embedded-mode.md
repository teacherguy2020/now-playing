---
title: visualizer-in-embedded-mode
page_type: child
topics:
  - display
  - kiosk
  - controller
  - playback
confidence: high
---

# visualizer in embedded mode

## Purpose

This page documents what `visualizer.html` actually is, and then explains how it behaves when embedded inside controller/kiosk flows.

The earlier version of this page leaned too hard on the embedding context and not hard enough on the visualizer’s real identity.
A better current interpretation is:
- `visualizer.html` is a reactive visual engine
- it exposes a collection of scene/model presets
- those visuals react to live music-driven feature data such as loudness/volume envelopes, band/spectrum values, flux/pulse-style event signals, and related motion drivers
- embedded mode is one operating context for that engine, not the definition of what it is

So this page should start with the visualizer itself, then explain what changes in embedded mode.

## What `visualizer.html` actually is

Direct file inspection shows that `visualizer.html` is a multi-scene reactive visual surface with:
- a canvas-based animation loop
- preset/model selection
- energy/motion/glow controls
- local saved presets
- moOde push behavior
- different operating modes for designer, embedded, and kiosk-fullscreen use

It is not just “a page that can be opened in the pane.”
It is fundamentally a music-reactive visual system.

## Core reactive model

Direct file inspection shows vocabulary and state around live motion/reactivity such as:
- spectrum/band values (`bandVals`)
- loudness/volume envelope signals (`loudnessEnv`, related mono/audio energy state)
- event-style motion triggers such as `spectralFlux` and `pulse`
- animation timing through `requestAnimationFrame`
- canvas-driven rendering

That is the core of the page:
- take continuously changing music-driven feature state
- feed it into a chosen visual scene/model
- render a reactive animation frame-by-frame

So the visualizer should be understood first as a collection of reactive models driven by audio-derived feature data as music plays.

## Scene / model family

Direct file inspection shows multiple visual scene/model names and related preset vocabulary.
Observed examples include names such as:
- `aeon`
- `mobius`
- `orb`
- `cube`
- `bloom field`
- `fireworks`
- `sphere`
- `moire`
- `ambient`

The exact scene list and naming may evolve, but the important current truth is:
- the visualizer is not one effect
- it is a family of visual models/scenes with different rendering behavior

That is why the preset system matters so much.

## Preset / control layer

Direct file inspection shows a substantial preset/configuration layer with controls including:
- `presetSel`
- `savedPresetSel`
- `energySel`
- `motionSel`
- `glowSel`
- `applyBtn`
- `savePresetBtn`
- `deletePresetBtn`
- `exportPresetBtn`
- `importPresetBtn`
- `pushMoodeBtn`

And local saved presets are stored under:
- `nowplaying.visualizer.presets.v1`

That means `visualizer.html` is both:
- a live display surface
- and a design/configuration surface

The page is multi-mode partly because the same underlying reactive visual engine can be:
- tuned
- saved
- exported/imported
- pushed live to moOde

## Query-parameter inputs

Direct file inspection shows `visualizer.html` reads and reacts to query parameters including:
- `embedded`
- `pure`
- `kiosk`
- `ui`
- `preset`
- `energy`
- `motion`
- `glow`

These do not define the visualizer’s core identity, but they do control how the engine is hosted and exposed.

## What embedded mode changes

## Embedded mode

Direct file inspection shows:
- `embeddedOn`

This becomes true when `embedded=1` (or equivalent truthy values).

### The important behavioral change
Embedded mode does **not** change the visualizer into something else.
It changes how the reactive visual engine is hosted.

Observed current behavior:
- embedded mode forces pure mode
- pure mode hides HUD/controls
- embedded mode is treated as a “visual surface only” presentation context

This is reinforced by CSS such as:
- `body.pure .hud { display:none !important; }`
- `body.pure .ctl { display:none !important; }`

So the right statement is:
- embedded mode strips away most of the editor/control chrome
- while leaving the underlying reactive visual engine intact

That is a much better description than treating the page primarily as an embedded child page.

## Embedded visualizer → fullscreen kiosk handoff

One of the most important code-level behaviors is:
- when visualizer is embedded, a tap/click can escalate it into fullscreen kiosk visualizer mode

Current repo-visible logic:
- in embedded mode, a pointer-up handler:
  - removes `embedded`
  - removes `pure`
  - sets `kiosk=1`
  - sets `ui=0`
  - navigates the top window to the resulting target

That means the embedded pane version is effectively a compact hosted view of the same visual engine, with a direct path into fullscreen kiosk presentation.

## Fullscreen kiosk visualizer → controller return path

The opposite direction also exists.

Current repo-visible behavior:
- when `kioskOn && !embeddedOn && !uiOn`
- a pointer-up handler returns to:
  - `controller.html?kiosk=1&preview=1&open=visualizer.html&vpreset=...&venergy=...&vmotion=...&vglow=...`

That means the visualizer participates in a round-trip flow:
1. controller kiosk shell opens embedded visualizer pane
2. embedded visualizer opens fullscreen kiosk visualizer
3. fullscreen kiosk visualizer returns to controller kiosk shell with visualizer state preserved in query params

So the visualizer is not a one-way fullscreen destination. It is part of a controller-backed visual workflow.

## Preserved visual state across the round trip

The fullscreen return URL preserves at least:
- `vpreset`
- `venergy`
- `vmotion`
- `vglow`

Those values are then available for controller-side reopening logic.
That means the visualizer’s scene/control state is treated as part of the navigation handoff, not just local transient UI.

## Push to moOde behavior

One of the most important action flows is the “Push to moOde” action.

Direct file inspection shows a concrete function:
- `pushToMoode()`

Observed behavior includes:
1. fetch runtime config from:
   - `/config/runtime`
2. extract the track key
3. build a visualizer URL like:
   - `/visualizer.html?kiosk=1&preset=...&energy=...&motion=...&glow=...`
4. POST visualizer state to:
   - `/peppy/last-profile`
5. POST the browser target URL to:
   - `/config/moode/browser-url`
6. update UI status text based on success/failure

That means the visualizer is tightly integrated into live display target selection, not just an isolated toy page.

## Relevant API calls

Based on direct file inspection, important API interactions include:

### Read
- `GET /config/runtime`
- `GET /peppy/last-profile`

### Write
- `POST /peppy/last-profile`
- `POST /config/moode/browser-url`

These are central because they bridge:
- saved visualizer scene/control state
- live moOde browser-target updates
- display-mode persistence

## Special embedded-mode rendering differences

A few code-level clues suggest that embedded mode is not just cosmetically smaller.
For example:
- embedded mode forces pure visual mode
- some scene timing behavior changes in embedded mode (for example an `aeon` intro lead-in path)
- low-power or motion-related calculations may also treat embedded mode specially

So embedded mode is best understood as:
- the same reactive visual engine
- hosted under stricter presentation constraints
- with some scene/timing behavior adjusted for that context

## Relationship to controller/kiosk pages

This page depends heavily on controller-side kiosk behavior.

Current strong companion pages:
- `controller-kiosk-mode.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `display-launch-and-wrapper-surfaces.md`

Why:
- the controller shell can open `visualizer.html` in the right pane
- embedded mode is part of the parent/child pane contract
- fullscreen visualizer returns to controller kiosk shell
- visualizer can also be pushed live to moOde through the display-launch workflow

## What this page is now confident about

Direct file inspection supports these strong claims:
- `visualizer.html` is fundamentally a multi-scene reactive visual engine
- it uses music-driven feature state such as volume/loudness/spectrum/event signals to drive animation
- it has a substantial preset/configuration layer
- embedded mode is a hosting mode that hides controls and emphasizes pure visual presentation
- fullscreen kiosk mode and embedded pane mode are two navigation contexts around the same underlying visual system
- the page participates in live moOde push behavior through runtime config + `peppy/last-profile` + browser-target update flow

## Relationship to other pages

This page should stay linked with:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`
- `display-launch-and-wrapper-surfaces.md`
- `kiosk-designer.md`
- future pages around peppy/display-mode persistence

## Current status

At the moment, this page should be read very differently than before.

The strongest current truth is:
- `visualizer.html` is first a reactive visual engine with multiple models/scenes that respond to live music-driven data
- and only secondarily a child page that can run in embedded pane mode

That is the right foundation for understanding how embedded visualizer behavior fits into the larger display branch.
