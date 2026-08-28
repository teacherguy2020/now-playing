---
pageType: source
id: source.display-surface-troubleshooting
title: display surface troubleshooting
sourceType: local-file
sourcePath: /Users/brianwis/.openclaw/workspace/docs/now-playing-knowledge/display-surface-troubleshooting.md
ingestedAt: 2026-04-08T15:58:28.589Z
updatedAt: 2026-04-08T15:58:28.589Z
status: active
---

# display surface troubleshooting

## Source
- Type: `local-file`
- Path: `/Users/brianwis/.openclaw/workspace/docs/now-playing-knowledge/display-surface-troubleshooting.md`
- Bytes: 7741
- Updated: 2026-04-08T15:58:28.589Z

## Content
```text
# display-surface troubleshooting

## Purpose

This runbook helps future agents debug issues involving:
- the wrong page or surface showing up
- visible differences between surfaces
- iframe-vs-top-level display behavior
- moOde display-mode, browser-url, or embedded-surface issues
- confusion about which page actually owns a visible symptom

The key lesson: `now-playing` is not one generic frontend. It has multiple user-facing surfaces with different page owners, support routes, and runtime/display-control dependencies.

## Step 1: identify which surface you are actually looking at

Start by classifying the user-facing surface:

- **Desktop app shell** → `app.html`
- **Tablet controller** → `controller-tablet.html`
- **Phone controller** → `controller-mobile.html`
- **Shared/generic controller base** → `controller.html`
- **display/router/classic now-playing layer** → `display.html`, `index.html`
- **moOde box display surfaces** → routed via `display.html`, including `peppy.html`, `player-render.html` / `player.html`, `index.html`, and kiosk-related flows

If the surface is misidentified, debugging usually starts in the wrong place.

## Step 2: choose the primary page owner

### Desktop app shell
Primary owner:
- `app.html`

Important traits:
- broad control/admin shell
- owns `#appFrame`
- switches among multiple internal tools/pages
- touches many runtime/admin and moOde-control paths

Check first when:
- the bug is in the overall admin shell
- the wrong embedded tool/page loads
- moOde display takeover or Peppy control feels wrong

### Tablet controller
Primary owner:
- `controller-tablet.html`

Important traits:
- richer visual/blurred now-playing behavior
- tablet/kiosk-landscape layout variants
- embedded kiosk pane support (`#kioskPaneFrame`)
- recent/Next Up/action-bar behavior

Check first when:
- the tablet surface looks visually wrong
- recent pane or kiosk pane behavior is wrong
- a bug appears on tablet but not phone

### Phone controller
Primary owner:
- `controller-mobile.html`

Important traits:
- compact/swipe/rail-oriented behavior
- mobile-specific queue/recent interactions
- kiosk preview/push controls
- more constrained interaction model than tablet

Check first when:
- swipe/rail/recent behavior is wrong
- mobile differs from tablet/desktop
- a compact/mobile-only presentation issue appears

### Shared/generic controller base
Primary owner:
- `controller.html`

Important traits:
- generic/shared controller surface
- also carries kiosk-oriented layout modes

Check first when:
- the symptom looks controller-related but not clearly tablet-only or phone-only
- kiosk-like controller behavior seems off

### display/router/classic now-playing layer
Primary owners:
- `display.html`
- `index.html`

Important traits:
- `display.html` is the display router
- `index.html` contains explicit iframe/embed logic
- a lot of classic display-specific visible behavior lives here

Check first when:
- the wrong display mode is selected
- embedded vs top-level behavior differs
- classic now-playing looks wrong even when other surfaces are fine

### moOde box display surfaces
Primary owners:
- `display.html`
- `peppy.html`
- `player-render.html` / `player.html`
- `kiosk.html` (kiosk-oriented flow entry)

Important traits:
- `display.html` routes the surface/mode
- `peppy.html` is both a runtime display surface and a control/readiness page
- `player.html` is a builder/preview surface for `player-render.html`
- `kiosk.html` redirects into a controller-based kiosk preview flow

Check first when:
- the moOde-attached display shows the wrong mode
- Peppy/player/classic display mode routing is wrong
- browser URL or display-mode changes seem ineffective

## Step 3: decide whether the issue is page-owned, route-owned, or host/runtime-owned

### Page-owned symptoms
Signs:
- visible layout or behavior differs by surface
- embedded vs top-level behavior differs
- only one page or one surface looks wrong

Check:
- the relevant top-level HTML page
- page-specific JS/runtime logic
- `scripts/index-ui.js` when display runtime behavior is involved
- relevant CSS for that surface

### Route-owned support behavior
Signs:
- the page renders, but the wrong data/mode/state arrives
- controller profile, diagnostics, browse, art, or queue support behavior seems wrong

Check:
- `src/routes/config.controller-profile.routes.mjs`
- `src/routes/config.runtime-admin.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- `src/routes/config.browse.routes.mjs`
- `src/routes/art.routes.mjs`
- `src/routes/queue.routes.mjs`

### Host/runtime-owned symptoms
Signs:
- browser URL / display-mode actions do not match live display behavior
- moOde display state seems out of sync with app expectations
- PeppyMeter / PeppyALSA / browser display behavior is wrong despite seemingly correct page logic

Check:
- `src/routes/config.runtime-admin.routes.mjs`
- `local-environment.md`
- `deployment-and-ops.md`
- `integrations/moode/README.md`
- `ops/moode-overrides/README.md`

## Step 4: handle iframe-vs-top-level differences explicitly

This is a historically important failure mode.

Important verified owners:
- `index.html`
- `display.html`
- `app.html`
- `scripts/index-ui.js`
- `styles/index1080.css`

When the symptom differs between embedded and top-level rendering:
1. check whether the page explicitly tests embedded state (`window.top !== window.self`)
2. check whether body/background/layer behavior changes when embedded
3. check whether the page is acting as a router/iframe host rather than the real final render target
4. check whether the issue is surface-specific (for example tablet vs display router) rather than global

Important caution:
- do not assume iframe/top-level differences are just CSS
- they may involve page boot logic, page runtime logic, route-backed support behavior, and display/router state

## Step 5: classify whether the display problem is app-host-side or moOde-host-side

### More likely app-host-side
Signs:
- page logic is wrong
- route responses are wrong
- controller/profile/browse/art data is wrong before reaching the remote display host

### More likely moOde-host-side
Signs:
- runtime-admin actions succeed but the real display host behaves differently
- display mode, browser URL, or Peppy behavior is wrong on the moOde box itself
- local host overrides may be changing the real behavior

In Brian’s setup:
- app host logic centers on `10.0.0.4`
- moOde-host-side effects center on `10.0.0.254`

## Step 6: choose verification based on change class

If you change something while debugging:
- page/style-only → surface refresh + visible verification
- route/runtime-admin behavior → endpoint verification + surface verification
- runtime-admin host-control action → endpoint verification + host-side visible verification
- host override change → real moOde host verification after apply

Use these pages together:
- `deployment-and-ops.md`
- `workflows.md`
- `restart-and-runtime-admin-troubleshooting.md`

## Quick heuristics

- If the page is wrong, identify the surface first.
- If the surface is routed, check the router before the render target.
- If the page differs embedded vs top-level, assume page/runtime/route/display interactions until proven otherwise.
- If the display host behaves differently from the app’s expectations, suspect runtime-admin/moOde host state or local overrides.
- If the symptom is only on tablet or only on phone, do not debug from the generic controller model first.

## Best companion pages

- `source-map.md`
- `workflows.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `integrations.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `gotchas-and-lessons.md`

```

## Notes
<!-- openclaw:human:start -->
<!-- openclaw:human:end -->
