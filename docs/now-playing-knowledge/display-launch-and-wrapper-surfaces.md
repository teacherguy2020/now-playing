# display launch and wrapper surfaces

## Purpose

This page documents a small but important family of display-oriented helper pages that are not the core display renderers themselves, but still shape how display surfaces are launched, wrapped, or pushed into live use.

Current pages in this family include:
- `displays.html`
- `controller-visualizer.html`
- `index1080.html`

These pages are related because they act less like primary content surfaces and more like:
- launch consoles
- wrapper hosts
- compatibility/redirect entrypoints

## Why this page matters

The display branch is not only composed of core rendering pages and mode-specific surfaces like `display.html`, `player-render.html`, `peppy.html`, or `visualizer.html`.

There are also helper surfaces that determine:
- how an operator chooses a display mode
- how a display mode gets pushed to moOde
- how an embedded wrapper hosts a display page
- how legacy/resolution-specific entrypoints are normalized

Those are worth documenting because they affect real workflows even if they are not the “main” display implementations.

## Family classification

## 1. `displays.html` — display launcher and push console

This is the strongest and most important page in this family.

`displays.html` appears to be an operator-facing selection and push surface for choosing among display and control outputs.

Observed groups include:
- now playing displays
  - Player
  - Peppy
  - Visualizer
  - Index Display
- control displays
  - Mobile Controller
  - Kiosk Controller 1280×400

This page is clearly more than a static menu.

### Key role
A good current interpretation is:
- `displays.html` is a display-mode launcher and push console
- it helps bridge UI selection into moOde display target updates
- it is one of the most operator-friendly pages for switching what the moOde/browser display should show

### Important actions
Observed actions include:
- “Open Designer” or helper links for:
  - `player.html` — Player designer / preview surface
  - `peppy.html` — Peppy-facing display/config surface
  - `visualizer.html&ui=1` — Visualizer UI/config view
  - `index.html`
  - `mobile.html`
  - `kiosk-designer.html` — Kiosk designer / preview / push surface
- “Push to moOde” actions for:
  - Player display mode
  - Peppy display mode
  - Visualizer display mode
  - Kiosk Controller / kiosk mode

### Important functions / logic
Observed client-side logic includes:
- `ensureKey()`
  - fetches runtime config from `/config/runtime`
  - extracts track key
- `pushUrl(url, reason, statusEl, btnEl)`
  - POSTs to `/config/moode/browser-url`
- Player/Peppy/Visualizer push handlers
  - also POST to `/peppy/last-profile`
  - set `displayMode` appropriately
- kiosk push handler
  - pushes `/kiosk.html` directly with reason `displays-kiosk-push`

### Important API calls
Observed endpoints include:
- `GET /config/runtime`
- `POST /config/moode/browser-url`
- `POST /peppy/last-profile`

That makes `displays.html` one of the more operationally meaningful display-side pages.

## 2. `controller-visualizer.html` — visualizer wrapper host

This page appears to be a wrapper/host around `visualizer.html`, not the visualizer implementation itself.

### Key role
A good current interpretation is:
- `controller-visualizer.html` is a framing shell for `visualizer.html`
- it adds a small top bar/back button in standalone mode
- it hides the top bar in `embedded=1` mode
- it passes through key visualizer query params to the real visualizer page

### Important behavior
Observed logic includes:
- read `embedded` from query params
- add `body.embedded` when appropriate
- construct a URL to `visualizer.html`
- pass through:
  - `preset`
  - `energy`
  - `motion`
  - `glow`
  - `ui`
  - `kiosk`
  - `theme`
  - `colorPreset`
- force defaults when absent:
  - `ui=0`
  - `kiosk=1`
- load the result in `#vizFrame`
- back button navigates to `controller.html`

### Architectural interpretation
This is not the visualizer itself.
It is a small hosting/adapter surface that frames `visualizer.html` for controller-oriented use.

That means it should be understood as a wrapper page, not as the main home of visualizer logic.

## 3. `index1080.html` — redirect/compatibility shim

This page appears to be a very thin redirect shim.

Observed behavior:
- meta refresh to `/index.html`
- body fallback link to `/index.html`

This suggests `index1080.html` is a legacy or compatibility entrypoint rather than a substantive display implementation.

So it should be documented, but only lightly.

## Working family model

A good current family model is:

### Substantive operator helper page
- `displays.html`

### Wrapper host page
- `controller-visualizer.html`

### Redirect shim
- `index1080.html`

### Terminology note
Within this family, it helps to distinguish:
- **display modes**: Player, Peppy, Visualizer
- **presentation/shell mode**: Kiosk
- **designer/helper surfaces**: `player.html`, `kiosk-designer.html`, `displays.html`, wrapper hosts

That distinction is useful because it prevents the wiki from overvaluing thin wrappers and redirects while still acknowledging their operational role.

## Relationship to the broader display branch

This family should stay linked with:
- `display-interface.md`
- future `display-browser-surface.md`
- `visualizer-in-embedded-mode.md`
- `kiosk-designer.md`

Because these pages influence how display surfaces are:
- selected
- launched
- pushed
- hosted

rather than how they render internally.

## Candidate future drill-down pages

The most likely next drill-down pages from this family are:

### `displays-launch-console.md`
For `displays.html` specifically, especially the push flows and display-mode mapping.

### `controller-visualizer-wrapper.md`
For the wrapper/adapter role of `controller-visualizer.html`.

`index1080.html` probably does not need its own dedicated page unless legacy/resolution-specific behavior turns out more important than it currently looks.

## Architectural interpretation

A good current interpretation is:
- this family is made of helper surfaces around the display branch
- they are operationally important even when they are not the core display implementation pages
- they shape real workflows for choosing, pushing, and hosting display content

This makes them worth grouping together instead of leaving them as isolated oddities.

## Relationship to other pages

This page should stay linked with:
- `display-interface.md`
- `desktop-browser-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `visualizer-in-embedded-mode.md`
- future display-browser-surface documentation

## Things still to verify

Future deeper verification should clarify:
- whether `displays.html` is the primary live operator console for choosing moOde display targets
- whether `controller-visualizer.html` is actively used in current workflows or mostly transitional
- whether `index1080.html` exists only for backward compatibility or still matters for deployed callers
- how these helper pages interact with any broader display-router logic not yet fully mapped

## Current status

At the moment, this page gives the display helper surfaces a clean structural home.

That matters because it turns what would otherwise look like random miscellaneous pages into a coherent subfamily:
- one launcher/push console
- one wrapper host
- one redirect shim
