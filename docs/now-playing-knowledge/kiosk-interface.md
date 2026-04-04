# kiosk interface

## Purpose

This page describes kiosk-style presentation in the `now-playing` ecosystem.

The kiosk interface is part of the display family, but it deserves its own page because it is not just a visual layout. It also depends on host behavior, display wake/display state assumptions, moOde-side presentation context, and the operational realities of an unattended or semi-unattended screen.

In other words, kiosk behavior sits at the intersection of:
- display and presentation
- runtime and host state
- moOde/display-host coordination
- visual/render mode selection

## What “kiosk” means here

In this project, kiosk should be understood as a display-oriented usage mode where the system is expected to present useful playback information continuously or reliably on a dedicated screen or display context.

That usually implies some combination of:
- presentation-first behavior rather than full browsing/control
- reduced need for direct interaction
- a persistent or semi-persistent screen
- dependencies on display routing, wake state, or host-side display assumptions
- tighter coupling to the live runtime environment than a casual browser tab would have

Kiosk is therefore not only a UI description. It is also an operational mode.

## Why kiosk belongs in its own branch

Kiosk deserves dedicated documentation because kiosk-related behavior can fail in ways that ordinary browser/controller surfaces do not.

Examples of kiosk-specific concerns include:
- whether the correct display surface is being shown continuously
- whether the display wakes or stays awake as expected
- whether the browser/display host is showing the intended routed surface
- whether moOde-side display control and app-host-side display control are aligned
- whether visual/render mode choices behave correctly in the intended kiosk context
- whether local overrides or host-specific patches materially alter behavior

This makes kiosk a good example of a surface that must be documented as both:
- a visible interface
- a runtime/environment-dependent operating mode

## Kiosk within the display family

Kiosk is closely related to the broader display branch documented in `display-interface.md`.

It overlaps with:
- browser/TV display surfaces
- moOde-hosted presentation and renderer modes
- artwork and visual presentation behavior
- runtime-admin and host/display control behavior

But kiosk is distinct because it emphasizes:
- persistence
- unattended presentation
- display-host behavior
- operational stability over time

Related pages:
- `display-interface.md`
- `display-surface-troubleshooting.md`
- `deployment-and-ops.md`
- `local-environment.md`

## Likely kiosk contexts to document more deeply

The kiosk branch should eventually distinguish between different kiosk-like contexts, because they may not all behave the same way.

Likely contexts include:
- browser-based kiosk presentation on a dedicated display
- moOde-hosted kiosk-style presentation
- display-router-driven kiosk behavior
- kiosk behavior that depends on specific renderers or visual modes
- kiosk behavior shaped by wake/display-state logic or local overrides

These may or may not ultimately map to separate pages, but they should at least become separate subsections if they prove materially different.

## Kiosk and moOde-host reality

Kiosk behavior appears especially likely to depend on moOde-host reality.

That may include:
- what the moOde-attached display is expected to show
- how the display is routed or switched
- how moOde-side display control interacts with the app-host/runtime side
- whether local patches or watchdog logic affect what is shown and when
- how the live host environment changes the practical behavior of kiosk presentation

This is why kiosk documentation should not stop at “what page is shown.” It should also explain the host/runtime assumptions that make kiosk work in practice.

## Likely implementation dimensions

This page does not yet attempt to map all implementation files exhaustively, but kiosk behavior likely depends on a combination of:
- HTML display entrypoints
- display/router-related scripts
- visual/render mode logic
- playback-state and metadata inputs
- artwork and derivative/cache behavior
- runtime-admin and host/display control routes or workflows
- local environment patches, overrides, or host-specific assumptions

When this branch is expanded, it should move toward explicit coverage of:
- relevant HTML pages
- relevant JS and CSS
- relevant routes/APIs
- relevant host/runtime control paths
- relevant local-environment-specific realities

## Kiosk-specific questions future documentation should answer

A mature kiosk page should eventually answer questions like:
- what surface is actually shown in kiosk mode?
- what host is responsible for showing it?
- how does kiosk differ from ordinary browser display usage?
- what role does moOde play in kiosk presentation?
- what visual modes/renderers can appear in kiosk contexts?
- what causes kiosk to show the wrong thing, go stale, or fail to wake/update?
- what files, routes, and host/runtime controls are responsible?

## Planned sub-branches

Kiosk may eventually need further drill-down pages such as:

### `kiosk-browser-surface.md`
For kiosk behavior centered on browser-rendered display surfaces.

### `kiosk-on-moode.md`
For kiosk behavior specifically tied to moOde-hosted presentation and display context.

### `display-renderers-and-visual-modes.md`
For the renderer/style choices that may appear within kiosk usage, such as peppy, player, and visualizer modes.

### `artwork-and-visual-assets.md`
For artwork/animation/cached visual dependencies that strongly affect kiosk presentation quality and stability.

## Relationship to troubleshooting and ops

Kiosk documentation should remain tightly linked to troubleshooting and operations pages because kiosk issues are likely to cross from visible symptoms into host/runtime causes.

Especially relevant pages:
- `display-surface-troubleshooting.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `restart-and-runtime-admin-troubleshooting.md`

In this area especially, theory and live behavior may diverge.

## Current status

At the moment, this page is a structural drill-down from the display branch, not a completed kiosk implementation guide.

Its purpose is to establish kiosk as:
- a first-class visible interface/mode
- an operationally sensitive display context
- a branch that should eventually be documented with explicit pages, scripts, routes, host behavior, and local-environment realities
