# now-playing project knowledge base

This wiki tracks the architecture, history, and operational realities of the `now-playing` project — a moOde Audio Player add-on and extension ecosystem for richer playback state, metadata, displays, controls, and surrounding operational glue.

`now-playing` should be understood first as a **moOde-centered enhancement and companion system**, not as a generic media platform. It extends a moOde-based playback setup with richer now-playing state, metadata handling, artwork/display surfaces, control flows, and operational glue across the live environment.

moOde is the anchor. Other inputs, protocols, and display paths matter, but they should be understood in relation to that moOde-centered runtime rather than treated as peers in a generic orchestration layer.

## What this is

This directory is the local wiki and knowledge base for the `now-playing` project.

It is meant to help Brian and future agents:
- understand the project quickly
- navigate to the right code or documentation area
- distinguish project-wide structure from Brian-specific local reality
- preserve durable lessons, decisions, and operational knowledge

This wiki is not just a summary. It is meant to become the working reference for real maintenance and future changes.

## What this is not

This is not primarily a generic, source-agnostic media orchestration project. While the system touches multiple protocols, metadata paths, and display surfaces, the practical center of the project is enhancing and supporting a moOde installation and the surrounding user experience.

Current state:
- strong orientation and browseability
- substantially trust-hardened source map
- stronger operational boundary guidance around playback modes, runtime/admin behavior, and restart-sensitive changes
- still improving toward a more exhaustive operational reference

## How to use this wiki

- Use the **knowledge pages** to understand structure, ownership, environment reality, and historical context.
- Use the **runbooks** when you already have a concrete live problem and need a practical troubleshooting path.
- When in doubt, start with the knowledge pages, then drop into the most relevant runbook.

## Read this first

If you want the fastest orientation path, read in this order:

1. **Context** → `system-overview.md`
2. **Structure** → `architecture.md`
3. **Action / where things live** → `source-map.md`
4. **Reality check for the live setup** → `local-environment.md`
5. **Known traps and prior lessons** → `gotchas-and-lessons.md`

Then use `decisions-and-history.md` when you need rationale or historical context.

## Read by task

### Understanding the project
- `system-overview.md`
- `architecture.md`
- `user-interfaces.md`
- `glossary.md`

### Finding code
Start with:
- `source-map.md`

Then use:
- `architecture.md`
- `integrations.md`

### UI and display work
Start with:
- `user-interfaces.md`
- `display-interface.md`
- `workflows.md`
- `source-map.md`
- `display-surface-troubleshooting.md`

Then reality-check with:
- `gotchas-and-lessons.md`
- `local-environment.md` (if runtime/display state may matter)

### Runtime and integration debugging
Start with:
- `local-environment.md`
- `deployment-and-ops.md`

Then check:
- `integrations.md`
- `workflows.md`
- `playback-mode-troubleshooting.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `gotchas-and-lessons.md`

Especially relevant when the question is about:
- app-host vs moOde-host behavior
- restart-sensitive vs live-applied changes
- current-song / art / status authority by playback mode

### Deploy and ops work
Start with:
- `deployment-and-ops.md`
- `local-environment.md`

Then check:
- `workflows.md`
- `decisions-and-history.md`
- `gotchas-and-lessons.md`

Especially relevant when the question is about:
- restart-sensitive vs live-applied config/runtime changes
- app-host vs moOde-host control boundaries
- host-side runtime-admin or override effects

### Vocabulary and history
- `glossary.md`
- `decisions-and-history.md`
- `gotchas-and-lessons.md`

## Knowledge pages

- `system-overview.md` — broad overview of the project, feature areas, and system purpose
- `architecture.md` — major layers, boundaries, and structural relationships
- `user-interfaces.md` — human-visible and operator-visible interface families, organized by how the system is actually used
- `source-map.md` — directory-oriented navigation map for where important code and assets live
- `workflows.md` — common ways work tends to happen in this project
- `display-interface.md` — map of the display-oriented surfaces, modes, and runtime-sensitive presentation paths
- `kiosk-interface.md` — kiosk-style display usage as a presentation mode with host/runtime/display-state dependencies
- `kiosk-launch-and-routing.md` — how kiosk entrypoints hand off into controller-backed kiosk behavior
- `kiosk-designer.md` — preview, preset, and moOde push workflow for kiosk presentation
- `controller-kiosk-scaffold.md` — the separate standalone `controller-kiosk.html` scaffold path
- `controller-kiosk-mode.md` — controller-side behavior when kiosk mode is active
- `kiosk-right-pane-routing.md` — right-pane embedded kiosk/controller subview loading inside controller kiosk mode
- `embedded-pane-contracts.md` — parent/child contract for embedded kiosk pane pages
- `visualizer-in-embedded-mode.md` — code-aware drill-down for embedded/fullscreen/designer visualizer behavior
- `integrations.md` — MPD, moOde, YouTube, request flows, and integration-side cautions
- `deployment-and-ops.md` — runtime, verification, configuration, and operational themes
- `local-environment.md` — Brian-specific hosts, deploy targets, and local overrides
- `glossary.md` — project-specific terms, names, and vocabulary
- `decisions-and-history.md` — durable decisions and historically important lessons
- `gotchas-and-lessons.md` — sharp edges, fragile areas, and high-value lessons
- `open-questions.md` — unresolved gaps that still need mapping or confirmation

## Runbooks

- `playback-mode-troubleshooting.md` — local file, AirPlay, UPnP, radio/stream, and fallback playback-state debugging
- `restart-and-runtime-admin-troubleshooting.md` — restart-sensitive vs live-applied changes, runtime-admin actions, and app-host vs moOde-host control
- `display-surface-troubleshooting.md` — desktop/tablet/phone/display-router/moOde-surface troubleshooting and iframe-vs-top-level issues

## Local environment and reality checks

These pages should stay highly visible because they are the difference between theory and the live system.

Before making operational assumptions, check the pages that reflect local truth:

- `local-environment.md` — current hosts, deploy target, and local override reality
- `deployment-and-ops.md` — operational expectations and runtime verification habits
- `gotchas-and-lessons.md` — known project-specific traps that often matter in live work

In this project, local runtime behavior may differ from generic expectations because of host roles, deployment preferences, and local overrides.

## Where to go next

Go here first based on the problem you have:
- **Where does the code live?** → `source-map.md`
- **What is this system and how is it structured?** → `system-overview.md`, then `architecture.md`, then `user-interfaces.md`
- **Is this a runtime/live-behavior issue?** → `local-environment.md`, then `deployment-and-ops.md`, then `restart-and-runtime-admin-troubleshooting.md`
- **Is this an integration or authority-path issue?** → `integrations.md`, then `playback-mode-troubleshooting.md`, then `workflows.md`
- **Is this a display/UI issue?** → `user-interfaces.md`, then `display-interface.md`, then `display-surface-troubleshooting.md`, then `workflows.md`, then `source-map.md`
- **Do I need prior lessons or rationale?** → `decisions-and-history.md`, then `gotchas-and-lessons.md`
- **Is this still unresolved or poorly mapped?** → `open-questions.md`

## How to maintain this wiki

- Keep project-wide knowledge in the general pages (`system-overview`, `architecture`, `workflows`, `integrations`).
- Keep Brian-specific host and setup details in `local-environment.md`.
- When in doubt, separate **project truth** from **local installation truth** instead of mixing them together.
- Put durable lessons into `gotchas-and-lessons.md` or `decisions-and-history.md`, not only in chat.
- If something is uncertain, put it in `open-questions.md` instead of presenting it as settled fact.
- Update this wiki when major behavior changes, important lessons are learned, or file ownership becomes clearer.
- Let the homepage point toward future expansion, but keep the actual source of truth in the individual pages.
