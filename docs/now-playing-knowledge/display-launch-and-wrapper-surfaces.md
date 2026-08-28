---
title: display-launch-and-wrapper-surfaces
page_type: child
topics:
  - display
  - kiosk
  - controller
  - runtime
confidence: high
---

# display launch and wrapper surfaces

## Purpose

This page documents a small but important family of display-oriented helper pages that are not the core renderers themselves, but still control how display surfaces are launched, wrapped, or redirected.

Current pages in this family:
- `displays.html`
- `controller-visualizer.html`
- `index1080.html`

These pages matter because they sit one layer above the actual display implementations.
They are about:
- selecting a display target
- pushing a browser URL into moOde
- wrapping a child display page in a controller-friendly host
- preserving a legacy entrypoint

## Why this page matters

This family is operationally important even though it is not where most visual rendering logic lives.

The strongest example is `displays.html`, which is a real operator console for pushing browser-display targets into moOde.
`controller-visualizer.html` is a real adapter shell for `visualizer.html`.
`index1080.html` is only a redirect shim.

Those are three very different roles, and the wiki should keep them distinct.

## 1. `displays.html` — display target launcher and moOde push console

This is the most important page in the family.

### What it actually is
Direct file inspection shows that `displays.html` is a small operator console with two card groups:

#### Now Playing Displays
- Player
- Peppy
- Visualizer
- Index Display

#### Control Displays
- Mobile Controller
- Kiosk Controller 1280×400

Each card provides either:
- an **Open Designer** link
- a **Push to moOde** action
- or both

So this is not a passive menu.
It is a live launcher/push surface.

### Open Designer links
The page links directly to:
- `app.html?page=player.html`
- `app.html?page=peppy.html`
- `app.html?page=visualizer.html&ui=1`
- `index.html`
- `app.html?page=mobile.html`
- `app.html?page=kiosk-designer.html`

That means `displays.html` is effectively a curated jump surface into the design/configuration pages for major display/control targets.

### Runtime host model
The page computes:
- `host = location.hostname || 'nowplaying.local'`
- `base = ${location.protocol}//${host}:3101`

So its control-plane API target is always the app-host on port `3101` for the current hostname.

### Track-key bootstrap
The page has an inline helper:
- `ensureKey()`

What it does:
- `GET ${base}/config/runtime`
- extracts `config.trackKey`
- caches it in local script state

That track key is then used as `x-track-key` for privileged POST requests.

So `displays.html` is tightly coupled to runtime config and app-host authorization.

### Core push helper
The main operational helper is:
- `pushUrl(url, reason, statusEl, btnEl)`

What it does:
- POSTs to `${base}/config/moode/browser-url`
- sends JSON `{ url, reason }`
- includes `x-track-key` when available
- updates a per-card status element on success/failure
- temporarily changes button text to `Pushing…`

This is the main reason the page matters: it is a UI wrapper around changing moOde’s browser target.

### Player / Peppy / Visualizer push behavior
The three display-mode push buttons do more than just call `pushUrl(...)`.

Before pushing, they also POST to:
- `${base}/peppy/last-profile`

Observed payloads:
- Player push:
  - `{ url, displayMode: 'player', playerSize }`
- Peppy push:
  - `{ url, displayMode: 'peppy' }`
- Visualizer push:
  - `{ url, displayMode: 'visualizer' }`

Then all three push the same browser target:
- `${location.protocol}//${host}:8101/display.html?kiosk=1`

with different `reason` values:
- `displays-player-push`
- `displays-peppy-push`
- `displays-visualizer-push`

That means the selected render mode is not encoded in the pushed browser URL itself.
Instead, the page updates `peppy/last-profile`, then points moOde’s browser at the common `display.html?kiosk=1` entrypoint.

That is a very important architectural fact.

### Player-specific size behavior
Player push has one extra behavior:
- reads `localStorage['player.profile.v2']`
- parses `size`
- falls back to `1280x400`
- includes that as `playerSize` when POSTing `/peppy/last-profile`

So `displays.html` is also part of the path that bridges saved designer state into live moOde display activation.

### Kiosk push behavior
The kiosk control card behaves differently.

It pushes:
- `${location.protocol}//${host}:8101/kiosk.html`

with reason:
- `displays-kiosk-push`

It does **not** update `/peppy/last-profile` first.

That makes sense because kiosk is a shell/presentation mode, not one of the display modes routed through the `display.html` + `peppy/last-profile` mechanism.

### Index Display behavior
The Index Display card has only:
- `Open Designer` → `index.html`

There is no push button.

So in the current file, `index.html` is treated as directly openable, but not as one of the push-to-moOde targets wired through this console.
That is worth preserving explicitly in the docs.

### What `displays.html` is not
It is not:
- the main display renderer
- the place where Player/Peppy/Visualizer visuals are implemented
- a generic routing shell

It is specifically:
- a launch console
- a browser-target pusher
- a mode-selection bridge into `display.html` / `kiosk.html`

### Most important API calls
Direct file inspection confirms:
- `GET /config/runtime`
- `POST /config/moode/browser-url`
- `POST /peppy/last-profile`

### Best current interpretation
A better, less speculative interpretation is:
- `displays.html` is the operator-facing launcher for live display target selection on the moOde browser display
- it chooses between common display/control targets
- for Player/Peppy/Visualizer, it records mode/profile state through `/peppy/last-profile` and then pushes a shared `display.html?kiosk=1` URL
- for kiosk, it pushes `kiosk.html` directly

That is much more precise than just calling it a “display launcher.”

## 2. `controller-visualizer.html` — thin wrapper host for `visualizer.html`

### What it actually is
Direct file inspection shows that `controller-visualizer.html` is a very small wrapper page around an iframe:
- top bar with back button and title
- iframe `#vizFrame`
- a short inline script that builds the visualizer child URL

This is a host shell, not a visualizer implementation page.

### Standalone vs embedded behavior
The page reads:
- `embedded` from query params

If truthy (`1/true/yes/on`):
- adds `body.embedded`
- hides the top bar
- makes the iframe fill the full page height

Otherwise:
- shows the top bar
- keeps a back button that returns to `controller.html`

So this file exists to adapt `visualizer.html` into controller-style navigation contexts.

### Child URL construction
The script creates:
- `new URL('visualizer.html', location.href)`

Then it passes through only a known param set:
- `preset`
- `energy`
- `motion`
- `glow`
- `ui`
- `kiosk`
- `theme`
- `colorPreset`

So it is not a fully generic pass-through wrapper.
It is a curated adapter for specific visualizer controls.

### Default overrides
If absent, it forces:
- `ui=0`
- `kiosk=1`

That means `controller-visualizer.html` intentionally normalizes the visualizer into a no-toolstrip, kiosk-style child display by default.

### Frame loading behavior
It finally sets:
- `vizFrame.src = visualizerChildUrl`

So the page’s center of gravity is simply:
- construct normalized `visualizer.html?...`
- host it in an iframe
- optionally provide controller back-navigation

### Best current interpretation
A precise interpretation is:
- `controller-visualizer.html` is a controller-friendly host shell for `visualizer.html`
- it normalizes query params for kiosk-style usage
- it supports both standalone and embedded framing modes
- it is a wrapper/adaptor page, not a visualizer logic page

## 3. `index1080.html` — pure redirect shim

### What it actually is
Direct file inspection shows:
- a meta refresh to `/index.html`
- a fallback body link to `/index.html`

There is no logic beyond redirecting.
No scripts.
No display-specific adaptation.

### Best current interpretation
This page is just:
- a compatibility / legacy entrypoint
- a resolution-named shim that now redirects to `index.html`

It should be documented lightly and not overinterpreted.

## Working family model

A more source-grounded family model is:

### Real operator console
- `displays.html`
  - chooses target surfaces
  - fetches track key
  - updates browser-target URL in moOde
  - updates peppy/display profile state

### Real wrapper/adaptor page
- `controller-visualizer.html`
  - hosts `visualizer.html` in controller contexts
  - normalizes params
  - supports embedded and standalone framing

### Pure redirect shim
- `index1080.html`
  - redirects to `index.html`

## Key distinctions to preserve

### `displays.html` vs `display.html`
- `displays.html` = operator launch/push console
- `display.html` = actual shared display target entrypoint pushed into moOde for Player/Peppy/Visualizer flows

### `controller-visualizer.html` vs `visualizer.html`
- `controller-visualizer.html` = host shell / iframe wrapper
- `visualizer.html` = actual visualizer implementation

### `index1080.html` vs `index.html`
- `index1080.html` = redirect shim
- `index.html` = real page

## Relationship to the broader display branch

This page should stay linked with:
- `display-interface.md`
- `visualizer-in-embedded-mode.md`
- `kiosk-designer.md`
- `controller-kiosk-mode.md`
- `api-config-and-runtime-endpoints.md`
- `api-state-truth-endpoints.md`

Because this family is part of the workflow for:
- taking visible state from app-host truth surfaces
- choosing a presentation target
- pushing a browser display target into moOde
- wrapping child display surfaces in controller-friendly shells

## Things now much less speculative

Direct file inspection now supports these stronger claims:
- `displays.html` really is a live moOde browser-target push console
- Player/Peppy/Visualizer pushes all target the shared `display.html?kiosk=1` entrypoint
- the selected render mode is carried through `/peppy/last-profile`, not by unique pushed URLs
- kiosk push is distinct and goes directly to `kiosk.html`
- `controller-visualizer.html` really is just a thin host around `visualizer.html`
- `index1080.html` really is just a redirect shim

## Current status

At the moment, this page is much less inferential than before.

It now describes this family as:
- one concrete operator launch/push console
- one concrete wrapper host
- one redirect shim

That is a cleaner and more source-grounded explanation of what these files are doing in the display branch.
