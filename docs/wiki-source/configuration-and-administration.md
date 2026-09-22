---
title: configuration and administration
page_type: hub
topics:
  - config
  - diagnostics
  - ops
  - runtime
confidence: high
---

# Configuration and Administration

This branch covers setup, inspection, runtime control, deployment, updates,
backup, and rollback. It is the operator path rather than the ordinary
playback path.

## Start here

1. [config-interface.md](config-interface.md) — what the configuration console
   controls.
2. [config-network-and-runtime.md](config-network-and-runtime.md) — host,
   port, SSH, path, and runtime verification.
3. [diagnostics-interface.md](diagnostics-interface.md) — endpoint calls,
   queue inspection, and live previews.
4. [install-and-validation.md](install-and-validation.md) — installation and
   clean-machine verification.

## Administration branches

- Feature configuration and persistence → [config-feature-breakdown.md](config-feature-breakdown.md)
- Advanced JSON/runtime editing → [config-advanced-json.md](config-advanced-json.md)
- Ratings database maintenance → [config-ratings.md](config-ratings.md)
- Podcasts and filesystem paths → [config-podcasts-and-library-paths.md](config-podcasts-and-library-paths.md)
- Display/render features → [config-display-and-render-features.md](config-display-and-render-features.md)
- Alexa setup and reachability → [config-alexa-setup.md](config-alexa-setup.md)
- Notifications and scrobbling → [config-notifications.md](config-notifications.md) and [config-lastfm-and-scrobbling.md](config-lastfm-and-scrobbling.md)

## Runtime and deployment

- Deployment, PM2/systemd, and verification → [deployment-and-ops.md](deployment-and-ops.md)
- Backend change verification → [backend-change-verification-runbook.md](backend-change-verification-runbook.md)
- Live environment assumptions → [local-environment.md](local-environment.md)
- moOde upgrade recovery → the retained [moOde upgrade runbook](https://github.com/teacherguy2020/now-playing/blob/main/docs/runbooks/22-moode-upgrade-runbook.md)

Configuration changes can require different restart scopes. Always verify
whether a change is browser-local, API-runtime, service, or moOde-host state
before restarting anything.

*Last reviewed: 2026-09-22 America/Chicago*
