---
title: troubleshooting and technical notes
page_type: hub
topics:
  - ops
  - runtime
  - troubleshooting
  - playback
confidence: high
---

# Troubleshooting and Technical Notes

Use this page when something is broken or when a non-obvious implementation
choice needs explanation. Troubleshooting starts with observed state; a
technical note explains why a stable workaround exists.

## First checks

1. Identify whether the issue is UI, API, MPD/moOde, an external integration,
   or a host/runtime problem.
2. Check `/now-playing` and `/next-up` before trusting a display.
3. Classify playback as local file, AirPlay, UPnP, radio/stream, podcast,
   Alexa, Mills, or another integration mode.
4. Check [local-environment.md](local-environment.md) and
   [deployment-and-ops.md](deployment-and-ops.md) for host and restart scope.

## Runbooks

- Playback mode, art, and metadata authority → [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)
- Playback issue triage → [playback-issue-triage-runbook.md](playback-issue-triage-runbook.md)
- Display and iframe/top-level issues → [display-surface-troubleshooting.md](display-surface-troubleshooting.md)
- Display issue triage → [display-issue-triage-runbook.md](display-issue-triage-runbook.md)
- Restart/runtime-admin issues → [restart-and-runtime-admin-troubleshooting.md](restart-and-runtime-admin-troubleshooting.md)
- Backend change verification → [backend-change-verification-runbook.md](backend-change-verification-runbook.md)
- moOde upgrade recovery → the retained [moOde upgrade runbook](https://github.com/teacherguy2020/now-playing/blob/main/docs/22-moode-upgrade-runbook.md)

## Technical notes

- AirPlay metadata CPU/watchdog hardening → [airplay-metadata-hardening.md](airplay-metadata-hardening.md)
- External display blanking/wake compatibility → the retained [moOde remote-display note](https://github.com/teacherguy2020/now-playing/blob/main/docs/15-moode-remote-display-blanking-fix.md)
- Durable project traps and lessons → [gotchas-and-lessons.md](gotchas-and-lessons.md)
- Rationale and settled decisions → [decisions-and-history.md](decisions-and-history.md)

## Important distinction

Do not “fix” a symptom by changing the wrong authority layer. A display can be
correctly rendering stale or intentionally normalized backend state, while a
radio/art problem can be caused by metadata classification, enrichment, or a
host override rather than by CSS.

*Last reviewed: 2026-09-22 America/Chicago*
