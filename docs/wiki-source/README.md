---
title: Now Playing documentation
page_type: hub
topics:
  - metadata
  - ops
  - runtime
  - documentation
confidence: high
---

# Now Playing documentation

This is the canonical editable documentation source for the `now-playing`
project. Now Playing is a moOde-centered enhancement stack for playback state,
metadata, queue control, displays, controllers, integrations, and operations.

## Start by audience

### New user

1. [Getting Started](getting-started.md)
2. [Using Now Playing](using-now-playing.md)
3. [Displays](displays.md)
4. [Integrations](integrations.md)

### Existing user

- Playback, queue, library, radio, podcasts, YouTube, Alexa, and Listen on
  Device → [Using Now Playing](using-now-playing.md)
- Controller/tablet/phone surfaces → [User Interfaces](user-interfaces.md)
- Displays, kiosk, Peppy, Player, and Visualizer → [Displays](displays.md)
- Configuration and maintenance → [Configuration and Administration](configuration-and-administration.md)
- Diagnosis by symptom → [Troubleshooting and Technical Notes](troubleshooting-and-technical-notes.md)

### Maintainer or developer

1. [Developer Reference](developer-reference.md)
2. [Core Concepts](core-concepts.md)
3. [Architecture](architecture.md)
4. [API Service Overview](api-service-overview.md)
5. [Source Map](source-map.md)
6. [Workflows](workflows.md)

## Canonical documentation categories

| Category | Entry page | What it answers |
| --- | --- | --- |
| Getting Started | [getting-started.md](getting-started.md) | What is it, how do I install it, and how do I verify first run? |
| Using Now Playing | [using-now-playing.md](using-now-playing.md) | How do I use playback, queues, browsing, radio, podcasts, YouTube, Alexa, and webstream listening? |
| Displays | [displays.md](displays.md) | Which display/router/kiosk path should I configure or debug? |
| Integrations | [integrations.md](integrations.md) | What owns moOde/MPD, Alexa, Mabel, jukebox, Last.fm, AirPlay, and other boundaries? |
| Configuration and Administration | [configuration-and-administration.md](configuration-and-administration.md) | How do I configure, inspect, deploy, update, back up, and validate the system? |
| Developer Reference | [developer-reference.md](developer-reference.md) | Where do architecture, APIs, state authority, source ownership, and implementation details live? |
| Troubleshooting and Technical Notes | [troubleshooting-and-technical-notes.md](troubleshooting-and-technical-notes.md) | How do I diagnose failures and understand unusual compatibility behavior? |
| Vocabulary | [glossary.md](glossary.md) | What do project-specific terms mean? |

## Important feature pages

- [Listen on Device](listen-on-device.md)
- [Radio Interface](radio-interface.md)
- [Podcasts Interface](podcasts-interface.md)
- [Mabel Integration](mabel-integration.md)
- [Jukebox Priority Model](jukebox-priority-model.md)
- [Media Library](media-library.md)
- [Playback Features](playback-features.md)
- [Queue and Playback Model](queue-and-playback-model.md)
- [Queue Interface versus Queue Wizard](queue-interface-vs-queue-wizard.md)
- [Kiosk Queue Shell versus Content Owner](kiosk-queue-shell-vs-content-owner.md)
- [Core Concepts](core-concepts.md)
- [Theme Interface](theme-interface.md)
- [Alexa Interface](alexa-interface.md)
- [YouTube Interface](youtube-interface.md)

## Developer and operator branches

- API: [api-service-overview.md](api-service-overview.md),
  [api-state-truth-endpoints.md](api-state-truth-endpoints.md),
  [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md),
  [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md),
  [api-endpoint-catalog.md](api-endpoint-catalog.md)
- Configuration: [config-interface.md](config-interface.md),
  [config-feature-breakdown.md](config-feature-breakdown.md),
  [diagnostics-interface.md](diagnostics-interface.md),
  [install-and-validation.md](install-and-validation.md)
- Frontend anatomy: [app-shell-anatomy.md](app-shell-anatomy.md),
  [controller-tablet-anatomy.md](controller-tablet-anatomy.md),
  [controller-mobile-anatomy.md](controller-mobile-anatomy.md),
  [now-playing-surface-variants.md](now-playing-surface-variants.md)
- Operations: [deployment-and-ops.md](deployment-and-ops.md),
  [local-environment.md](local-environment.md),
  [backend-change-verification-runbook.md](backend-change-verification-runbook.md)

## Documentation source and publication rules

Edit `docs/wiki-source/`. It is the only authoritative editable source for
substantive Now Playing documentation.

- `docs/wiki-site/` is generated browseable HTML. Do not hand-edit it.
- The GitHub Wiki is a published copy. Do not author feature documentation
  directly there; use `scripts/publish_github_wiki.py`. The publisher
  intentionally excludes installation-local host maps such as
  `local-environment.md` and redacts known installation-specific host/path
  values in public operational copies.
- `docs/compatibility-guides/` contains retained numbered compatibility and
  feature guides. `docs/runbooks/` contains selected standalone operational
  and recovery procedures. Neither directory is the documentation hierarchy
  for new work.
- `docs/references/` contains provenance and supporting reference material.
- `docs/wiki-source/sources/`, `reports/`, and structured metadata folders are
  support material for the wiki tooling, not alternate authoring locations.

See [documentation-sources-audit.md](documentation-sources-audit.md) for the
source comparison and numbered-guide disposition.

## Wiki maintenance

- [Documentation index](index.md)
- [Wiki operations](wiki-operations.md)
- [Wiki structure notes](wiki-structure-notes.md)
- [Wiki lint and health](wiki-lint-and-health.md)
- [Repository coverage notes](repo-coverage-notes.md)
- [Decisions and history](decisions-and-history.md)
- [Gotchas and lessons](gotchas-and-lessons.md)
- [Open questions](open-questions.md)

*Last reviewed: 2026-09-22 America/Chicago*
