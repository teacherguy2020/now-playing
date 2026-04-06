---
title: display-interface
page_type: parent
topics:
  - display
  - kiosk
  - playback
  - runtime
confidence: high
---

# display interface

## Purpose

This page documents the display branch of the `now-playing` ecosystem.

A better current interpretation than the older version is:
- the display branch is not just “things that look visual”
- it is the family of surfaces that turn app-host state into room-facing/browser-facing presentation
- much of that presentation branches outward from `/now-playing` as a central visible-truth hinge
- the branch already has real file-backed subpages for launch surfaces, kiosk shell behavior, wrappers, embedded display behavior, and controller-adjacent visual surfaces

So this page should now act as a **display branch hub**, not a placeholder taxonomy page.

## Why this page matters

Display behavior is one of the easiest places for agents to make wrong assumptions.

A display problem might actually belong to:
- state truth (`/now-playing`, `/next-up`)
- kiosk shell routing
- embedded child-page behavior
- moOde browser-target selection
- display-mode selection via `peppy/last-profile`
- runtime or host-specific display behavior

That means the display branch has to do more than name pages.
It has to preserve the relationships between:
- central truth surfaces
- display modes/renderers
- kiosk shell mode
- launch/push helper pages
- controller-backed embedded visual behavior
- runtime/display-host dependencies

## Central display truth starts from `/now-playing`

One of the most important current architectural facts is:
- the independent display/controller system branches outward from the app-host’s `/now-playing` state surface

That endpoint is one of the project’s central visible-truth hinges.
It is where mode-aware playback state becomes the payload that display/controller surfaces consume.

That means the display branch should not be read in isolation from:
- `api-state-truth-endpoints.md`
- `playback-authority-by-mode.md`

If the visible display is wrong, the problem may be upstream of the display page itself.

## What belongs in the display branch

The display branch includes surfaces whose primary job is presenting playback state, artwork, metadata, skins, motion, or room-facing visual behavior.

A useful terminology split is:
- **display mode / renderer** = Player, Peppy, Visualizer
- **presentation/shell mode** = Kiosk
- **launch/helper surface** = pages such as `displays.html`, `controller-visualizer.html`, `index1080.html`
- **designer surface** = pages such as `player.html`, `peppy.html`, `kiosk-designer.html`
- **embedded visual surface** = controller-hosted child pages and iframe-driven visual behavior
- **skin** = a visual/theme variant within a broader display mode, especially useful for Peppy

That split is now important enough to treat as branch truth, not optional terminology.

## Strong current branch map

## 1. Central visible-state truth surfaces

These are not “display pages,” but they are upstream of much of the display branch.

Start with:
- `api-state-truth-endpoints.md`
  - especially `/now-playing`
  - and `/next-up`
- `playback-authority-by-mode.md`

Why:
- display surfaces usually consume normalized visible truth rather than raw playback internals
- mode-specific truth differences can make a display bug look like a rendering bug when it is really a state-truth bug

## 2. Display-mode / renderer flows

Current major renderer-style modes are:
- Player
- Peppy
- Visualizer

A stronger current branch truth is:
- these modes are distinct from kiosk shell mode
- Player/Peppy/Visualizer selection is materially tied to the moOde browser-target workflow documented in `display-launch-and-wrapper-surfaces.md`
- `displays.html` pushes a shared `display.html?kiosk=1` target for Player/Peppy/Visualizer and records the chosen mode through `/peppy/last-profile`

That means the display-mode branch is not just “which page looks pretty.”
It includes live mode selection and push behavior.

Current best anchor page:
- `display-launch-and-wrapper-surfaces.md`

## 3. Kiosk as presentation/shell mode

Kiosk belongs in the display branch, but it should now be treated explicitly as:
- a shell/presentation mode
- not just another renderer

Strong current file-backed truths include:
- `kiosk.html` is a profile-sync + redirect bridge
- `controller.html` is a real kiosk-mode implementation surface
- many `kiosk-*.html` pages are redirect aliases into controller-family pages
- `controller-kiosk.html` is a separate scaffold/prototype path

Current best anchor pages:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-mode.md`

## 4. Launch / wrapper / adapter surfaces

This is now a real documented subfamily, not a vague future branch.

Current strong anchor page:
- `display-launch-and-wrapper-surfaces.md`

What it currently proves:
- `displays.html` = operator-facing moOde browser-target push console
- `controller-visualizer.html` = thin host/adaptor for `visualizer.html`
- `index1080.html` = redirect shim

This is one of the most concrete branch pages now and should be treated that way.

## 5. Embedded visual behavior inside controller flows

Display behavior is not confined to dedicated display pages.
Some visual/presentation logic also appears in controller-hosted contexts.

Current strong anchor pages:
- `visualizer-in-embedded-mode.md`
- `embedded-pane-contracts.md`
- `now-playing-surface-variants.md`
- `controller-now-playing-anatomy.md`

Why this matters:
- a visual issue may belong to an embedded controller child page, not the main display target
- visualizer behavior can appear in controller-backed contexts
- kiosk right-pane behavior often hosts controller-family child pages that still have strong visual/presentation roles

## 6. Runtime / host / display-target behavior

Display behavior in this project is inseparable from host/runtime reality.

Current strong examples:
- `displays.html` pushes browser targets into moOde
- display target choice depends on app-host runtime access and track-key authorization
- local environment and moOde-host behavior can materially change what appears on the real display

Current best companion pages:
- `api-config-and-runtime-endpoints.md`
- `deployment-and-ops.md`
- `local-environment.md`

## What this branch is now confident about

A stronger current branch summary is:
- `/now-playing` is the central state hinge for much of the visible display ecosystem
- display modes (Player/Peppy/Visualizer) are distinct from kiosk shell mode
- `displays.html` is a real launch/push console for live display target selection
- `controller-visualizer.html` is a wrapper host, not a renderer implementation
- `kiosk.html` is not the live kiosk shell; it is a profile-sync + redirect bridge
- `controller.html` owns real kiosk shell behavior
- many kiosk child routes are aliases into controller-family pages
- display behavior is often downstream of playback truth, embedded-pane rules, and runtime host behavior

That is much more concrete than the older “display-family map” language.

## High-value starting paths

### If the visible display content is wrong
Start with:
1. `api-state-truth-endpoints.md`
2. `playback-authority-by-mode.md`
3. the relevant display/kiosk child page

### If the wrong display target is being shown on moOde
Start with:
1. `display-launch-and-wrapper-surfaces.md`
2. `api-config-and-runtime-endpoints.md`
3. `local-environment.md`

### If kiosk presentation behavior is wrong
Start with:
1. `kiosk-launch-and-routing.md`
2. `controller-kiosk-mode.md`
3. `kiosk-right-pane-routing.md`

### If embedded visual behavior is wrong
Start with:
1. `embedded-pane-contracts.md`
2. `visualizer-in-embedded-mode.md`
3. `controller-now-playing-anatomy.md`

## Relationship to other wiki pages

This page should stay closely linked with:
- `api-state-truth-endpoints.md`
- `playback-authority-by-mode.md`
- `display-launch-and-wrapper-surfaces.md`
- `kiosk-interface.md`
- `display-surface-troubleshooting.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `source-map.md`

## Current status

At the moment, this page is best understood as the **display branch hub**.

It is no longer just a placeholder map for future drill-downs.
The current wiki already supports a stronger claim:
- the display branch has real file-backed subpages
- the central visible-state hinge is `/now-playing`
- and the main branch split is now explicit between state truth, display modes, kiosk shell mode, launch/wrapper surfaces, embedded visual behavior, and runtime/display-host behavior.
