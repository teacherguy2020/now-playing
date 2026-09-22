---
title: developer reference
page_type: hub
topics:
  - metadata
  - api
  - runtime
  - controller
confidence: high
---

# Developer Reference

Use this branch when maintaining Now Playing or tracing behavior from a
visible symptom into source code, routes, runtime state, or host integration.

## Architecture and ownership

- System model and boundaries → [architecture.md](architecture.md)
- Broad product scope → [system-overview.md](system-overview.md)
- Source and asset map → [source-map.md](source-map.md)
- Route ownership → [route-ownership-map.md](route-ownership-map.md)
- Fragile behavior ownership → [fragile-behavior-ownership.md](fragile-behavior-ownership.md)
- State authority by playback mode → [playback-authority-by-mode.md](playback-authority-by-mode.md)

## Frontend and controller anatomy

- Dashboard/app shell → [app-shell-anatomy.md](app-shell-anatomy.md)
- Tablet controller → [controller-tablet-anatomy.md](controller-tablet-anatomy.md)
- Mobile controller → [controller-mobile-anatomy.md](controller-mobile-anatomy.md)
- Now Playing variants → [now-playing-surface-variants.md](now-playing-surface-variants.md)
- Embedded pane contracts → [embedded-pane-contracts.md](embedded-pane-contracts.md)
- `index.html` versus `app.html` and transport concepts → the retained [index/app note](https://github.com/teacherguy2020/now-playing/blob/main/docs/09-index-vs-app.md) and [hero-shell note](https://github.com/teacherguy2020/now-playing/blob/main/docs/08-hero-shell.md)

## API reference

Read API pages in this order:

1. [api-service-overview.md](api-service-overview.md)
2. [api-state-truth-endpoints.md](api-state-truth-endpoints.md)
3. [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md)
4. [api-config-and-runtime-endpoints.md](api-config-and-runtime-endpoints.md)
5. [api-youtube-radio-and-integration-endpoints.md](api-youtube-radio-and-integration-endpoints.md)
6. [api-endpoint-catalog.md](api-endpoint-catalog.md)

## Queue and playback semantics

- Queue control versus queue shaping → [queue-and-playback-model.md](queue-and-playback-model.md)
- Queue Wizard internals → [queue-wizard-internals.md](queue-wizard-internals.md)
- Random versus shuffle → the retained [random/shuffle note](https://github.com/teacherguy2020/now-playing/blob/main/docs/10-random-vs-shuffle.md)
- Verification and change workflow → [workflows.md](workflows.md) and [backend-change-verification-runbook.md](backend-change-verification-runbook.md)

## Development workflow

[development.md](development.md) covers code-level development; this page is
the routing layer that helps choose the correct deeper reference. Preserve the
app-host versus moOde-host boundary and verify live behavior after deployment.

*Last reviewed: 2026-09-22 America/Chicago*
