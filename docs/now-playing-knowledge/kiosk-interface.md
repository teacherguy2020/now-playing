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

## Important kiosk-facing files and entrypoints

Kiosk is not represented by only one HTML file. There is a broader kiosk family in the live `now-playing` app.

Current repo-visible kiosk-facing HTML entrypoints include:
- `now-playing/kiosk.html`
- `now-playing/controller-kiosk.html`
- `now-playing/kiosk-now-playing.html`
- `now-playing/kiosk-albums.html`
- `now-playing/kiosk-artists.html`
- `now-playing/kiosk-playlists.html`
- `now-playing/kiosk-radio.html`
- `now-playing/kiosk-podcasts.html`
- `now-playing/kiosk-genres.html`
- `now-playing/kiosk-queue.html`
- `now-playing/kiosk-queue-wizard.html`
- `now-playing/kiosk-designer.html`

This means the kiosk branch should be understood as a family of presentation-oriented surfaces, not a single page.

## First classification of kiosk files

Based on direct repo inspection, the kiosk family already falls into a few distinct roles.

### `now-playing/kiosk.html` — primary kiosk launcher/bridge
This currently looks like the main kiosk entrypoint.

What it does:
- reads incoming theme/color/recent-source query parameters
- merges them with a saved kiosk profile from localStorage (`nowplaying.kiosk.profile.v1`)
- keeps a controller profile in sync (`nowplaying.mobile.profile.v2`)
- redirects into `controller.html` with kiosk-related query parameters such as:
  - `kiosk=1`
  - `preview=1`
  - `rev=20260329-motion-art-fix`
  - theme/color/recent-source settings

This is important because it means `kiosk.html` is not mainly the final rendered kiosk UI. It is a launcher/profile handoff layer that boots kiosk-flavored controller behavior.

### `now-playing/kiosk-designer.html` — kiosk preview/designer/push tool
This is not the kiosk display itself. It is a support surface for designing and pushing kiosk presentation settings.

Repo-visible behavior includes:
- iframe preview of `kiosk.html`
- theme/color preset controls
- preset save/export/import controls
- runtime API calls via the `:3101` app host
- moOde browser URL status checks
- push-to-moOde behavior via config endpoints

So this page belongs in the kiosk branch, but more as an authoring/configuration tool for kiosk presentation than as the kiosk display surface itself.

### `now-playing/controller-kiosk.html` — separate kiosk scaffold/prototype
This appears to be a direct, custom kiosk/controller scaffold rather than a simple redirect shim.

Repo-visible characteristics:
- fixed 1280×400 layout
- three-pane design (sources, list, now playing)
- direct fetches to app-host APIs on `:3101`
- pulls runtime config, now-playing state, queue diagnostics, and playlists
- appears to be a more explicit standalone kiosk/controller experiment or scaffold

This looks different in nature from `kiosk.html`, which acts mainly as a launcher into `controller.html` kiosk mode.

### Specialized `kiosk-*.html` files — redirect shims into controller pages
Several kiosk-named files are currently very thin wrappers that just redirect to controller-family pages with the same query string preserved.

Observed examples:
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-queue.html` → `controller-queue.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-now-playing.html` → `controller-now-playing.html`

This suggests that much of the kiosk family is currently implemented as a kiosk-branded routing layer into controller surfaces, rather than a fully separate kiosk-only codebase for every view.

## Working interpretation

A stronger current interpretation is:
- `kiosk.html` is the main kiosk launch/profile bridge
- `kiosk-designer.html` is the configuration/preview/push tool for kiosk presentation
- `controller-kiosk.html` is a separate standalone kiosk scaffold/prototype
- many of the other `kiosk-*.html` pages are redirect aliases into controller surfaces

That is a much more useful starting model than treating the kiosk branch as one file or one monolithic surface.

## Likely implementation dimensions

Kiosk behavior likely depends on a combination of:
- kiosk-family HTML entrypoints
- display/router-related scripts
- visual/render mode logic
- playback-state and metadata inputs
- artwork and derivative/cache behavior
- runtime-admin and host/display control routes or workflows
- local environment patches, overrides, or host-specific assumptions

When this branch is expanded, it should move toward explicit coverage of:
- what each kiosk-family HTML page is for
- which JS and CSS each one relies on
- which routes/APIs feed each kiosk surface
- which host/runtime control paths affect them
- which local-environment-specific realities materially change kiosk behavior

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

### `kiosk-launch-and-routing.md`
Now serves as the first routing-focused drill-down beneath this page.

It should continue expanding around:
- `kiosk.html` as the launch/profile bridge
- the redirect relationship between kiosk-named pages and controller pages
- profile handoff into kiosk-flavored controller behavior

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
