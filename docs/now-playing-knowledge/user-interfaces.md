# user interfaces

## Purpose

This page maps the main ways humans and operators interact with the `now-playing` ecosystem.

It is organized by **how the system is actually used and viewed**, not only by file structure. It should help future readers and agents move from a real interface or usage context to the relevant pages, scripts, API routes, and implementation files.

This is not meant to be a user manual. It is a structural index of the major visible and interactive surfaces of the system.

## Relevant source files

This page is branch-oriented rather than file-complete, but these files are especially relevant when grounding the interface families below:
- `app.html`
- `controller.html`
- `controller-mobile.html`
- `controller-tablet.html`
- `kiosk.html`
- `display.html`
- `config.html`
- `diagnostics.html`

## User interfaces at a glance

If you need the compressed interface model first, use this:
- **desktop/browser** = broad browser-oriented access to the system
- **tablet** = pane-rich controller shell with broader orchestration behavior
- **phone** = compact controller-first shell optimized for direct interaction
- **display/kiosk** = room-facing presentation and controller-adjacent display behavior
- **configuration/diagnostics** = operator-facing setup, inspection, and maintenance surfaces

That top-level split is the main reason this page should exist as an umbrella branch page.

## How to use this page

Use this page when you know one of the following:
- the kind of device or screen involved
- the visible surface being discussed
- the interaction mode someone is talking about
- the operational/admin interface being used

Then follow the links into the more specific interface or feature pages.

If you are trying to understand the interface layer as a system, read in this order:
1. [user-interfaces.md](user-interfaces.md)
2. [desktop-browser-interface.md](desktop-browser-interface.md)
3. [tablet-interface.md](tablet-interface.md)
4. [phone-interface.md](phone-interface.md)
5. [display-interface.md](display-interface.md)
6. [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)

Cross-check with:
- [architecture.md](architecture.md) when the question is mainly about system layers or boundaries
- [source-map.md](source-map.md) when the question is mainly about where implementation files live
- [display-surface-troubleshooting.md](display-surface-troubleshooting.md) when the issue is already known to be display/surface-specific
- [deployment-and-ops.md](deployment-and-ops.md) and [local-environment.md](local-environment.md) when live behavior may depend on host/runtime reality

## Interface families

The major visible/interactive parts of the ecosystem can be grouped into these families:

### General browser/controller surfaces
These are the everyday browser-facing interfaces used to browse, control, queue, search, and inspect playback-related state.

Planned drill-down pages:
- `desktop-browser-interface.md`
- `tablet-interface.md`
- `phone-interface.md`

Current anchor pages:
- `desktop-browser-interface.md`
- `tablet-interface.md`
- `phone-interface.md`

Current drill-downs in this family:
- `now-playing-surface-variants.md`
- `controller-device-alias-pages.md`
- `youtube-interface.md`

Likely major surfaces in this family include:
- desktop browser usage around `app.html`
- tablet-oriented controller surfaces
- phone/mobile controller surfaces

### Display-oriented surfaces
These are the surfaces primarily concerned with presentation, display output, and visible rendering rather than full control workflows.

Planned drill-down pages:
- `display-interface.md`
- `display-renderers-and-visual-modes.md`

Current anchor page:
- `display-interface.md`

Current sub-branches in this family:
- `kiosk-interface.md`
- `display-launch-and-wrapper-surfaces.md`

This family should eventually cover things like:
- browser/TV display surfaces such as `display.html`
- kiosk-oriented display behavior
- peppy presentation on moOde
- player presentation on moOde
- visualizer presentation on moOde
- visualizer behavior where it also appears in controller-oriented surfaces

### Media/library and browse surfaces
These are the visible interfaces and flows used to browse, search, filter, and navigate the media collection.

Planned drill-down pages:
- `media-library.md`
- `search-filter-and-browse-flows.md`

This family should eventually cover:
- how the moOde library is represented in different interfaces
- album/artist/library panes
- local browse index JSON and related derived-state support
- art and metadata behavior tied to browse/library views

### Queue, playback, and curation surfaces
These are the visible and interactive parts of the system where playback order, queue shaping, quick actions, and curation features are controlled.

Planned drill-down pages:
- `queue-and-playback-control.md`
- `playlist-and-queue.md`
- `ratings-favorites-and-curation.md`

This family should eventually cover:
- transport controls
- queue building workflows
- queue wizard behavior
- vibe queues
- ratings/favorites/curation flows
- request/playlist shaping behavior where relevant

### Operator/admin surfaces
These are interfaces used to configure, inspect, verify, or administer the live system.

Planned drill-down pages:
- `configuration-and-diagnostics-interfaces.md`
- `runtime-admin-and-config-surfaces.md`

Current anchor page:
- `configuration-and-diagnostics-interfaces.md`

Current drill-downs in this family:
- `config-interface.md`
- `config-feature-breakdown.md`
- `config-network-and-runtime.md`
- `config-podcasts-and-library-paths.md`
- `config-display-and-render-features.md`
- `config-ratings.md`
- `config-lastfm-and-scrobbling.md`
- `config-notifications.md`
- `config-alexa-setup.md`
- `config-advanced-json.md`
- `diagnostics-interface.md`
- `library-health-interface.md`
- `theme-interface.md`
- `radio-metadata-eval-interface.md`
- `alexa-interface.md`

This family should eventually cover:
- configuration interfaces
- diagnostics interfaces
- runtime-admin behavior
- maintenance and verification surfaces

## Coverage philosophy

The goal is to cover the ecosystem exhaustively over time by branching from visible interface families into more specific pages.

A good interface or drill-down page should eventually explain:
- what the surface is for
- where and how it is used
- what major features appear there
- what HTML entrypoints are involved
- what scripts, styles, routes, helpers, and data layers support it
- what local/runtime conditions can affect it
- what related surfaces differ from it
- what known gotchas or fragile assumptions matter

In other words, the wiki should support multiple ways of “looking at” the system:
- by interface
- by feature
- by display/render mode
- by implementation file path
- by operational/runtime behavior

## Relationship to other pages

This page is intended to sit alongside, not replace, the rest of the wiki:

- [README.md](README.md) — broad orientation and entry path into the knowledge base
- [architecture.md](architecture.md) — conceptual and layer-based system structure
- [source-map.md](source-map.md) — file/directory-oriented navigation
- feature pages — capability-oriented drill-downs such as media library, display modes, queues, or integrations
- troubleshooting/runbook pages — debugging-oriented views of known classes of problems

## Initial branch candidates

High-value first branches likely include:
- `display-interface.md`
- `tablet-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `media-library.md`
- `queue-and-playback-control.md`
- `display-renderers-and-visual-modes.md`

These pages can become the first concrete layer of drill-down beneath this interface hub.

## Notes for future expansion

As this page grows, prefer:
- grouping by real usage context instead of just filenames
- linking outward to dedicated pages rather than overloading this hub
- distinguishing interface families from render/display modes when useful
- cross-linking feature pages and interface pages heavily
- including explicit implementation file paths once those are verified

The long-term aim is not just orientation, but a knowledge structure that lets someone move from a visible surface or discussed feature to the exact implementation and operational reality behind it.

## Timestamp

Last updated: 2026-04-06 06:15 America/Chicago
