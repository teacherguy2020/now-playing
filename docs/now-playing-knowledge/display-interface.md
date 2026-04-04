# display interface

## Purpose

This page describes the major display-oriented surfaces of the `now-playing` ecosystem.

It is focused on **what can be looked at as a display or presentation surface**, how those surfaces relate to each other, and what kinds of implementation and runtime dependencies support them.

This page is not yet an exhaustive file-by-file implementation map. Its role is to define the display family clearly enough that later drill-down pages can become more precise and exhaustive.

## What belongs in the display family

The display family includes the surfaces whose primary role is to present playback state, artwork, metadata, animations, skins, or display-oriented layouts.

This family is broader than a single HTML page. It includes:
- browser-based display surfaces
- TV/external-browser display usage
- moOde-hosted display modes
- kiosk-like presentation behavior
- renderer/style modes such as peppy/player/visualizer

In practice, display-oriented behavior can still overlap with control logic, playback authority, integration state, and runtime/display-host behavior.

## Core display-oriented surfaces

### Browser/TV display surface
This includes the browser-facing display surface used on TVs or other browsers, likely centered around `display.html` and related display-routing behavior.

This surface should eventually be documented in more detail in a dedicated page because it likely acts as a major architectural entrypoint for presentation-first usage.

Planned deeper drill-down:
- `display-browser-surface.md`

### Kiosk-style display behavior
Kiosk behavior belongs in the display family because it is presentation-first, but it also overlaps with operational/runtime concerns and moOde-host behavior.

This likely includes:
- unattended or semi-unattended presentation
- wake/display-state assumptions
- display loops and display-host behavior
- interactions between browser-rendered output and moOde-side display control

Planned deeper drill-down:
- `kiosk-interface.md`

Current anchor page:
- `kiosk-interface.md`

### moOde-hosted render/display modes
These are important because they are not just pages, but visual/display modes experienced through moOde-hosted or moOde-adjacent display paths.

Important examples include:
- peppy on moOde
- player on moOde
- visualizer on moOde

These modes deserve to be treated as first-class display experiences, not only as implementation details.

Planned deeper drill-down:
- `display-renderers-and-visual-modes.md`

### Display behavior embedded in controller-oriented surfaces
Some display-like behavior appears outside pure display pages.

For example:
- visualizer behavior may also appear in controller-tablet or related controller surfaces
- controller surfaces may expose artwork, presentation, or mini-display behavior that overlaps with the display family

This matters because the display family cannot be documented in total isolation from controller/tablet/mobile surfaces.

Related pages:
- `tablet-interface.md`
- `phone-interface.md`

## What display surfaces are for

Across the ecosystem, display-oriented surfaces appear to serve several purposes:
- showing what is currently playing
- emphasizing artwork, metadata, and visual state
- providing a “now playing” presentation for a room, TV, or remote browser
- supporting style-specific renderers and skins
- acting as the presentation endpoint for state determined elsewhere in the system

Display surfaces are usually downstream of other architectural areas:
- playback state determines much of what is shown
- integrations may determine which metadata and artwork are available
- local caches/derived state may determine whether display is responsive or stable
- runtime or host/display state may affect whether the surface behaves as expected in a live deployment

## Important cross-layer relationships

Display behavior in this project should not be treated as purely visual.

Display surfaces depend heavily on:
- **playback/control logic**
  - transport state
  - queue changes
  - authority rules about what source currently “owns” playback state
- **integration behavior**
  - MPD/moOde metadata
  - source-specific artwork and metadata enrichment
  - stream/radio-specific differences
- **local derived-state and caches**
  - art derivatives
  - locally served/cache-backed representations used for stability or speed
- **runtime and local environment reality**
  - moOde host behavior
  - display host behavior
  - wake/display routing assumptions
  - local overrides and host-specific patches

This means a display bug may actually originate in:
- playback authority logic
- integration behavior
- cached/derived state
- runtime-admin behavior
- local environment differences

## Relationship to other wiki pages

This page should stay closely linked with:
- `architecture.md` — for the layer/boundary view of display behavior
- `user-interfaces.md` — for the top-level interface family map
- `display-surface-troubleshooting.md` — for debugging-oriented guidance
- `deployment-and-ops.md` — when display behavior depends on runtime/admin concerns
- `local-environment.md` — when host roles or local overrides affect display reality
- `source-map.md` — when moving from surface understanding into actual implementation files

This page will also likely link outward over time to more specialized drill-down pages such as:
- `display-browser-surface.md`
- `display-renderers-and-visual-modes.md`
- `kiosk-interface.md`
- `artwork-and-visual-assets.md`

## Planned drill-down branches

The display family is probably too broad to keep on one page forever. The likely next branch pages are:

### `display-browser-surface.md`
Should eventually cover:
- browser/TV display usage
- `display.html`
- display-router behavior
- embedded vs top-level behavior where relevant
- related scripts, styles, API routes, and dependencies

### `display-renderers-and-visual-modes.md`
Should eventually cover:
- peppy presentation
- player presentation
- visualizer presentation
- how visual/render modes are selected or routed
- files, assets, scripts, and generated artifacts that support these modes

### `artwork-and-visual-assets.md`
Should eventually cover:
- artwork source handling
- cached/resized/blurred derivatives
- animated art behavior
- visual asset dependencies used by display surfaces

### `kiosk-interface.md`
Now serves as the first kiosk-specific branch page.

It should continue expanding to cover:
- kiosk-style usage and host/display assumptions
- moOde-hosted presentation context
- operational/display wake interactions
- how kiosk behavior differs from general browser display usage

## Coverage philosophy for future expansion

When this display family is expanded, each drill-down page should eventually answer:
- what visible surface or mode is being discussed
- where it is actually experienced
- what state/data/artwork it depends on
- what files and routes implement it
- what host/runtime realities affect it
- what related display or controller surfaces differ from it
- what known gotchas matter in practice

In other words, the display branch of the wiki should eventually let a reader move from:
- “the thing I can see on the TV / browser / moOde display”

…to:
- the responsible pages
- the supporting scripts and assets
- the routes and state sources behind it
- the runtime/environment conditions that can change how it behaves

## Current status

At the moment, this page is best understood as a display-family map, not a completed implementation guide.

Its main job is to define the display category clearly enough that deeper pages can be created without losing the relationship between:
- browser display surfaces
- kiosk behavior
- moOde-hosted render modes
- controller-embedded visual behavior
- runtime/environment-sensitive presentation behavior
