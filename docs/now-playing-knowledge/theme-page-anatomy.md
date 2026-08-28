# theme page anatomy

## Purpose

This page documents the internal anatomy of `now-playing/theme.html`.

It exists because `theme.html` is not just a simple color picker.
It is a client-side shell-theme editor with:
- a token grid
- preset controls
- import/export tools
- save/reset state controls
- localStorage-backed persistence
- postMessage-based shell synchronization
- editor self-theming behavior

This page is meant to help future agents answer questions like:
- “where do I change the token cards?”
- “where does preset loading/saving live?”
- “where is import/export handled?”
- “what part pushes live theme updates into the shell?”
- “where is the export modal controlled?”
- “which part makes the editor theme itself?”

## Why anatomy matters here

People will ask for changes like:
- change the theme token editor layout
- improve preset behavior
- tweak import/export UX
- change save/reset behavior
- fix sync between the editor and app shell
- adjust how the editor styles itself while editing

Those are anatomy questions.

## High-level role of `theme.html`

A good current interpretation is:
- `theme.html` is the operator/designer-facing shell-theme editor
- it edits tokenized shell visual state in the browser
- it persists theme and preset state locally
- it pushes live updates through DOM application and `postMessage`

So it should be understood as a live design tool, not a runtime-API settings page.

## Main anatomical regions

The current page is best understood as these major regions:

1. shell editor header and container
2. token grid / token card region
3. preset workflow region
4. import/export region
5. save/reset/status region
6. export modal region
7. localStorage persistence layer
8. live shell synchronization layer
9. editor self-theming layer

## 1. Shell editor header and container

### What it is
The page starts as a compact editor shell with a single main card and a short explanatory subtitle.

Key anchors include:
- `.wrap`
- `.card`
- `#pickerCardsWrap`

### Why it matters
This is the outer editor frame. Layout, spacing, and editor chrome changes often start here.

## 2. Token grid / token card region

### What it is
This is the main live editing surface.

Key anchors include:
- `#tokenGrid`
- token card elements created by `render()`
- swatch/color-picker/input combinations inside each token card

### What it does
This region appears to:
- render one editor tile per theme token
- show a visual swatch for the current token value
- allow direct color-picker changes
- allow direct raw text/hex input
- update in-memory state live as the user edits

### Why it matters
If someone asks to change “the theme editor itself,” they often mean this token-card region.

### Logic center
Start with:
- `render()`

## 3. Preset workflow region

### What it is
This is the named-preset management region.

Key anchors include:
- `#presetSelect`
- `#savePresetBtn`
- `#deletePresetBtn`

### What it does
This region appears to:
- list starter and user presets
- apply the selected preset
- save the current token state as a new preset
- delete a selected preset
- track the active preset name

### Why it matters
Requests about reusable theme sets or reset defaults usually belong here.

### Logic center
Start with:
- `loadPresets()`
- `savePresets()`
- active-preset logic using `nowplaying.themeActivePreset.v1`

## 4. Import/export region

### What it is
This is the JSON portability workflow.

Key anchors include:
- `#importBtn`
- `#exportBtn`

### What it does
This region appears to:
- import a theme payload from JSON
- export the current theme payload as JSON
- normalize payloads before applying them

### Why it matters
This is the clearest path for moving theme state across sessions or environments without a backend settings API.

### Logic center
Start with:
- `normalizeThemePayload(...)`
- `buildThemePayload(...)`

## 5. Save/reset/status region

### What it is
This is the explicit persistence/control strip.

Key anchors include:
- `#saveBtn`
- `#resetBtn`
- `#statusMsg`

### What it does
This region appears to:
- persist current state locally
- reset the current theme to the canonical baseline preset
- show small workflow/status feedback

### Why it matters
If a request is about “saving,” “resetting,” or status messaging, it belongs here rather than in the token grid itself.

## 6. Export modal region

### What it is
This is the dedicated export/readout modal.

Key anchors include:
- `#exportModal`
- `#exportJsonText`
- `#exportCopyBtn`
- `#exportCloseBtn`

### What it does
This region appears to:
- show exported theme JSON in a modal textarea
- support copy-to-clipboard behavior
- provide explicit close behavior

### Why it matters
This is separate from the main import/export buttons.
If a task is about modal UX, textarea formatting, or copy behavior, start here.

## 7. LocalStorage persistence layer

### What it is
This is the client-side persistence model.

Observed keys include:
- `nowplaying.themeTokens.v1`
- `nowplaying.themePresets.v1`
- `nowplaying.themeActivePreset.v1`

### What it does
This layer appears to:
- load saved token state
- load and merge saved presets with starter presets
- remember the active preset
- persist editor changes locally without depending on runtime config routes

### Why it matters
This is one of the main architectural facts of the page.
A request about persistence, restoration, or preset durability belongs here.

### Logic center
Start with:
- `load()`
- `loadPresets()`
- `savePresets()`

## 8. Live shell synchronization layer

### What it is
This is the outward/inward message-based sync layer between the editor and its shell context.

Observed message types include:
- `np-theme-updated`
- `np-theme-sync`
- `np-theme-load-preset`

### What it does
This layer appears to:
- push token changes outward when the editor state changes
- receive shell mode sync (`light` / `dark`)
- receive preset-load requests from a parent/shell context

### Why it matters
This is the main reason `theme.html` behaves like a shell tool instead of an isolated page.

### Logic center
Start with:
- `push()`
- `window.addEventListener('message', ...)`

## 9. Editor self-theming layer

### What it is
This is the editor-chrome synchronization layer.

Key functions include:
- `applyThemeEditorZones()`
- `applyPickerTileBg()`
- `updateEditorChrome()`

### What it does
This layer appears to:
- recolor the editor frame itself
- recolor token tiles/cards
- keep editor inputs/buttons/chrome visually aligned with the current theme state

### Why it matters
This is a useful design feature, but also a debugging trap.
If the editor looks wrong while the exported tokens are correct, the bug may live here instead of in the shell-consumed theme payload.

## Practical “where do I start?” map

### If asked to change token card layout or controls
Open first:
- `#tokenGrid`
- `render()`
- token-card creation logic in `theme.html`

### If asked to change preset behavior
Open first:
- `#presetSelect`
- `#savePresetBtn`
- `#deletePresetBtn`
- `loadPresets()` / `savePresets()`
- active-preset handling

### If asked to change import/export behavior
Open first:
- `#importBtn`
- `#exportBtn`
- `#exportModal`
- `normalizeThemePayload(...)`
- `buildThemePayload(...)`

### If asked to change save/reset behavior
Open first:
- `#saveBtn`
- `#resetBtn`
- `#statusMsg`
- localStorage write logic

### If asked to fix shell sync
Open first:
- `push()`
- `np-theme-updated`
- `np-theme-sync`
- `np-theme-load-preset`
- `window.addEventListener('message', ...)`

### If asked to fix how the editor itself looks
Open first:
- `updateEditorChrome()`
- `applyThemeEditorZones()`
- `applyPickerTileBg()`

## Anatomy rule for future agents

For `theme.html`, do not assume a request belongs only to “theme state” in the abstract.
Always classify it first:
- token grid problem
- preset problem
- import/export problem
- save/reset/status problem
- export modal problem
- localStorage persistence problem
- shell sync problem
- editor self-theming problem

That classification step should prevent wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `theme-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `desktop-browser-interface.md`
- `display-interface.md`
- `app-shell-anatomy.md`

## Current status

At the moment, this page gives the wiki another important anatomy reference in the operator/design branch.

Its main job is making explicit that `theme.html` is not just a picker.
It is a multi-region live design tool with:
- token editing
- preset management
- import/export
- local persistence
- shell synchronization
- and editor self-theming behavior.
