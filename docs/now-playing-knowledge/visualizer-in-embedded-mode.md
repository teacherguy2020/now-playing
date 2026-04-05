# visualizer in embedded mode

## Purpose

This page documents how `now-playing/visualizer.html` behaves when used inside the kiosk right-pane flow.

This page is intentionally more code-aware than earlier structural drill-down pages, because visualizer behavior clearly depends on:
- query parameters
- mode flags
- user interactions
- API calls
- handoff between embedded, fullscreen kiosk, and controller-shell contexts

## Why this page matters

`visualizer.html` is not just another embedded child page.

It has special behavior in kiosk architecture because:
- it can be opened in the right pane from controller-side kiosk mode
- embedded mode changes it into a pure-visual surface
- clicking/tapping it can escalate into fullscreen kiosk visualizer mode
- clicking/tapping fullscreen kiosk visualizer can return to controller kiosk mode with visualizer reopened in the pane
- it participates in moOde push and saved visualizer-profile workflows

That makes it one of the clearest examples of a multi-mode display surface in the system.

## Important file

Primary file:
- `now-playing/visualizer.html`

Related parent-shell pages:
- `now-playing/controller.html`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`

## Core query-parameter inputs

Repo inspection shows `visualizer.html` reads and reacts to query parameters including:
- `embedded`
- `pure`
- `kiosk`
- `ui`
- `preset`
- `energy`
- `motion`
- `glow`

These are central to how the page decides whether it is:
- embedded pane content
- fullscreen kiosk content
- editable/designer-style content

## Key mode logic

### Embedded mode
`visualizer.html` defines:
- `embeddedOn`

This becomes true when `embedded=1` (or equivalent truthy value).

### Pure mode
It also defines:
- `pureOn`

Current repo-visible behavior:
- embedded mode forces pure mode
- pure mode hides HUD/controls

This is reinforced by CSS such as:
- `body.pure .hud{display:none !important}`
- `body.pure .ctl{display:none !important}`

So the embedded pane contract for visualizer is:

> embedded visualizer should behave as a pure visual surface, not as a control-heavy designer UI.

### UI mode
The page also computes:
- `uiOn`

Current visible behavior suggests:
- UI controls are shown in designer-like contexts
- kiosk + embedded/pure combinations suppress them

## Embedded → fullscreen handoff

One of the most important code-level behaviors is:
- when visualizer is embedded, a tap/click opens fullscreen visualizer mode

Current repo-visible logic:
- in embedded mode, a pointer-up handler:
  - removes `embedded`
  - removes `pure`
  - sets `kiosk=1`
  - sets `ui=0`
  - navigates the top window to the resulting target

This means the embedded visualizer is effectively a preview/portal into fullscreen kiosk visualizer mode.

## Fullscreen kiosk visualizer → controller return path

The opposite direction also exists.

Current repo-visible behavior:
- when `kioskOn && !embeddedOn && !uiOn`
- a pointer-up handler sends the user back to:
  - `controller.html?kiosk=1&preview=1&open=visualizer.html&vpreset=...&venergy=...&vmotion=...&vglow=...`

This is extremely important architecturally.

It means fullscreen kiosk visualizer is not a dead-end display mode. It knows how to return to the controller kiosk shell and reopen the visualizer pane with the current settings preserved.

That gives us a real round-trip flow:

1. controller kiosk shell opens embedded visualizer pane
2. embedded visualizer tap opens fullscreen kiosk visualizer
3. fullscreen kiosk visualizer tap returns to controller kiosk shell with visualizer state encoded in query params

## Important state values preserved across the round trip

The fullscreen return URL preserves at least:
- `vpreset`
- `venergy`
- `vmotion`
- `vglow`

These values are then used by controller-side kiosk routing when it reopens the visualizer pane.

So the visualizer flow is not just visual. It also carries a parameterized display-state handoff.

## Designer/preset behavior in `visualizer.html`

The page also contains a substantial designer/preset layer.

Observed UI elements and state include:
- `presetSel`
- `savedPresetSel`
- `energySel`
- `motionSel`
- `glowSel`
- `applyBtn`
- `savePresetBtn`
- `deletePresetBtn`
- `exportPresetBtn`
- `importPresetBtn`
- `pushMoodeBtn`

It also stores local presets under:
- `nowplaying.visualizer.presets.v1`

This means the visualizer page is both:
- a runtime display surface
- a designer/configuration surface

depending on mode.

## Push to moOde behavior

One of the most important concrete action flows is the “Push to moOde” action.

Current repo-visible function:
- `pushToMoode()`

Observed behavior includes:
1. fetch runtime config from:
   - `/config/runtime`
2. extract the track key
3. build a visualizer URL like:
   - `/visualizer.html?kiosk=1&preset=...&energy=...&motion=...&glow=...`
4. POST saved visualizer state to:
   - `/peppy/last-profile`
5. POST the display target URL to:
   - `/config/moode/browser-url`
6. report success/failure in UI status text

This is a major integration point because it ties together:
- visualizer designer state
- saved profile state
- moOde browser target configuration

## Relevant API calls

Based on repo inspection, important API interactions include:

### Read
- `GET /config/runtime`
- `GET /peppy/last-profile`

### Write
- `POST /peppy/last-profile`
- `POST /config/moode/browser-url`

These are central to how visualizer settings become durable and live-targeted.

## Special embedded-mode rendering differences

A few additional code clues matter:
- embedded mode forces pure visual mode
- intro timing in at least one scene (`aeon`) changes in embedded mode:
  - `introLeadInMs` becomes `0` when embedded
- low-power rendering behavior can also treat embedded mode specially in some visual calculations

This suggests embedded visualizer is not just cosmetically embedded — some motion/render timing behavior also changes.

## Relationship to controller-side kiosk routing

This page depends heavily on `controller.html` behavior.

Controller-side kiosk routing:
- may open `visualizer.html` in the right pane
- injects `embedded=1`
- injects theme/palette-related parameters
- may override visualizer state from `/peppy/last-profile`
- supports reopening the pane via `open=visualizer.html`

So `visualizer.html` should be understood as one side of a larger two-part system:
- parent controller kiosk shell
- child visualizer surface

## Working interpretation

A good current interpretation is:
- `visualizer.html` is a multi-mode surface
- in embedded mode, it becomes a pure pane-embedded visual surface
- in kiosk fullscreen mode, it becomes a full display surface
- in designer contexts, it exposes control/preset/push UI
- it also participates in a bidirectional handoff between controller kiosk shell and fullscreen visualizer display

That makes it one of the most sophisticated mode-dependent pages in this branch.

## Relationship to other pages

This page should stay linked with:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`
- `kiosk-designer.md`
- future pages around peppy/display-mode persistence

## Things still to verify

Future deeper verification should clarify:
- exactly how controller-side `vpreset` / `venergy` / `vmotion` / `vglow` are reapplied during return-to-pane flow
- whether all visualizer scenes behave equally well in embedded pane mode
- how much of visualizer state is authoritative in URL params versus `/peppy/last-profile`
- whether the fullscreen tap-back behavior is always desirable in live kiosk use
- how visualizer relates to peppy and other display-mode selection mechanisms at the runtime level

## Current status

At the moment, this page establishes the visualizer as a first-class multi-mode display surface with explicit code-level handoffs between:
- embedded pane mode
- fullscreen kiosk mode
- designer/preset mode
- moOde-targeted push behavior

That is exactly the kind of page where code, user interaction, and runtime integration all have to be documented together.
