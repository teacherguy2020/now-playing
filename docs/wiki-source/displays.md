---
title: displays
page_type: hub
topics:
  - display
  - kiosk
  - controller
  - ops
confidence: high
---

# Displays

Now Playing has several display and presentation paths. They share playback
truth, but they do not share identical layout, routing, or lifecycle behavior.

## Display families

- **Now Playing display** — `index.html` and related render variants.
- **Player/Peppy display** — room-facing views routed through `display.html`.
- **Visualizer** — visualizer scenes and presets, including embedded and
  fullscreen behavior.
- **Kiosk** — presentation-oriented browsing and controller panes.
- **Browser controllers** — desktop, tablet, and phone control surfaces that
  may also be installed as Home Screen web apps.

Start with [display-interface.md](display-interface.md) for the runtime model,
then use the branch pages below.

## Configure and push a display

- Builder-first Peppy/Player/Visualizer flow →
  [display-enhancement-peppy-player-flow.md](display-enhancement-peppy-player-flow.md)
- Display router and wrapper ownership →
  [display-launch-and-wrapper-surfaces.md](display-launch-and-wrapper-surfaces.md)
- Kiosk use and launch routing → [kiosk-interface.md](kiosk-interface.md) and
  [kiosk-launch-and-routing.md](kiosk-launch-and-routing.md)
- Kiosk authoring and push actions → [kiosk-designer.md](kiosk-designer.md)
- Visualizer embedded/fullscreen behavior →
  [visualizer-in-embedded-mode.md](visualizer-in-embedded-mode.md)

## iPhone and iPad presentation

The tablet controller is the direct implementation target for the iPad Home
Screen app. Its safe-area geometry remains `viewport-fit=cover`; its opaque
`black` status-bar treatment avoids the installed-app vignette observed with
`black-translucent`. Distinct manifest identities and icon families are
documented in [user-interfaces.md](user-interfaces.md).

## When a display is wrong

1. Determine whether the URL is a router, wrapper, controller, or final render
   target.
2. Check whether the page is embedded or top-level.
3. Check `/now-playing`, `/next-up`, and the active playback mode.
4. Check moOde's local-display target and host-side overrides.

Use [display-surface-troubleshooting.md](display-surface-troubleshooting.md),
[display-issue-triage-runbook.md](display-issue-triage-runbook.md), and
[local-environment.md](local-environment.md) for the operational path.

*Last reviewed: 2026-09-22 America/Chicago*
