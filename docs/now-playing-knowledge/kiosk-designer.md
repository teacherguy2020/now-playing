# kiosk designer

## Purpose

This page describes `now-playing/kiosk-designer.html`, which appears to be a support and authoring tool for kiosk presentation rather than the kiosk display surface itself.

Its role is important because it sits between:
- kiosk presentation design
- live preview
- preset management
- moOde-targeted push/config behavior

That makes it part of the kiosk branch, but on the authoring/operations side rather than the final display side.

## Important file

Primary file:
- `now-playing/kiosk-designer.html`

Primary preview target:
- `now-playing/kiosk.html`

## What `kiosk-designer.html` appears to do

Based on direct repo inspection, `kiosk-designer.html` provides:
- a live iframe preview of `kiosk.html`
- color/theme controls
- preset selection
- export/import actions for preset JSON
- push-to-moOde behavior
- moOde target URL verification/status feedback

This means the page functions as a kiosk design/configuration console.

## Why it matters

`kiosk-designer.html` is important because it reveals that kiosk presentation is not only a runtime display concern. It is also something the system expects to:
- configure
- preview
- persist
- push into a moOde display target workflow

So this page helps explain how kiosk presentation is authored and deployed in practice.

## Observed structure

Repo-visible structure includes:
- top-level control panel/card UI
- an iframe preview pointing at `kiosk.html`
- preset-oriented controls
- JSON export/import modal behavior
- a push button for updating moOde browser URL state

Important DOM elements include:
- `#sizeSel`
- `#presetSel`
- `#primaryThemeColor`
- `#secondaryThemeColor`
- `#primaryTextColor`
- `#secondaryTextColor`
- `#pushBtn`
- `#targetHint`
- `#stat`
- `#preview`

The preview relationship matters because it suggests that `kiosk.html` is the canonical render target being tuned by the designer.

## Key functions and logic blocks

Direct repo inspection shows several important functions/logic blocks inside `kiosk-designer.html`.

### `persistProfile()`
Persists the current kiosk design state into localStorage keys:
- `nowplaying.kiosk.profile.v1`
- `nowplaying.mobile.profile.v2`

Stored values include:
- `colorPreset`
- `recentSource`
- custom theme/text colors
- controller-facing profile fields like `devicePreset`, `layout`, and `recentCount`

This is important because it keeps kiosk design choices and controller-facing profile state aligned.

### `buildRel()`
Builds the relative kiosk preview/target URL.

Observed behavior includes:
- starting from the currently selected size entry (currently `kiosk.html`)
- adding a cache-busting `pushRev`
- forcing `theme=auto`
- forcing `recentSource=albums`
- applying `colorPreset` and custom color query parameters

This function is central because both preview refresh and push-to-moOde behavior rely on the generated URL.

### `postLiveTheme()`
Posts a message into the preview iframe:
- `type: 'np-live-theme-update'`

with custom color data.

This suggests a live-preview contract between the designer and the preview target.

### `refreshPreview()`
Rebuilds the preview URL and reloads the iframe.

This is triggered by:
- size changes
- color input changes
- preset changes

### `ensureKey()`
Fetches runtime config from:
- `/config/runtime`

and extracts the runtime track key.

This is used before privileged config operations.

### `refreshTargetHint()`
Checks:
- `/config/moode/browser-url/status`

and compares the current configured moOde browser target with the expected kiosk target.

It updates `#targetHint` with success/warning text and color.

## Observed kiosk-designer responsibilities

### Previewing kiosk presentation
The page embeds:
- `kiosk.html`

inside an iframe, which strongly suggests that designer changes are intended to be seen against the real kiosk launch path rather than only mocked locally.

### Managing preset state
The page appears to support:
- selecting presets
- exporting preset JSON
- importing preset JSON

Notably, direct repo inspection currently shows:
- save/delete preset buttons exist in the markup
- but those buttons are explicitly hidden in script

So the current live behavior appears to emphasize:
- choosing from built-in theme presets
- exporting/importing JSON

rather than maintaining a larger editable saved-preset system directly in this page.

### Managing theme and color settings
Repo-visible controls include:
- primary theme color
- secondary theme color
- primary text color
- secondary text color
- named theme presets

That suggests kiosk presentation is expected to be customized with a fairly direct color/preset workflow.

### Checking/pushing moOde target configuration
The page appears to call app-host APIs that:
- inspect moOde browser URL status
- compare the configured target URL to an expected URL
- push the expected URL into moOde configuration

This is especially important because it makes the page an operational bridge between:
- kiosk design intent
- actual moOde display target configuration

## Push-to-moOde action flow

One of the most concrete action flows in this page is the Push button.

Observed behavior when `#pushBtn` is pressed:
1. disable the button and show `Pushing…`
2. ensure the runtime track key via `/config/runtime`
3. build the kiosk target URL with `buildRel()`
4. POST that URL to:
   - `/config/moode/browser-url`
5. use reason:
   - `kiosk-designer-push`
6. persist the current profile to localStorage
7. update status text in `#stat`

This is a good example of the richer wiki style we should keep using: user action → code path → API call → resulting system effect.

## Observed API/config interactions

From repo inspection, `kiosk-designer.html` uses app-host APIs around:
- runtime config lookup (`/config/runtime`)
- moOde browser URL status (`/config/moode/browser-url/status`)
- moOde browser URL update (`/config/moode/browser-url`)

These are not incidental. They are central to the page’s operational role.

## Relationship to other kiosk pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- a future `kiosk-on-moode.md`
- `local-environment.md`
- `deployment-and-ops.md`

Why:
- it previews `kiosk.html`
- it pushes settings toward moOde-targeted display behavior
- it depends on runtime config and host-side assumptions

## Working interpretation

A good current interpretation is:
- `kiosk-designer.html` is not the kiosk experience itself
- it is the design/preview/configuration console for kiosk presentation
- it bridges browser-side preview with moOde-targeted deployment/control
- it also acts as a synchronization point between kiosk profile state and controller-facing profile state

That makes it one of the most operationally meaningful pages in the kiosk branch.

## Things still to verify

Future deeper documentation should verify:
- how presets are stored and named
- what exact expected moOde target URL is enforced
- whether preset state is purely localStorage-based or also persisted elsewhere
- what exact contract exists between the designer and `kiosk.html`
- whether the page is actively used in the live workflow or partly transitional

## Current status

At the moment, this page has moved beyond a purely structural description.

It now establishes `kiosk-designer.html` as a first-class kiosk support tool with:
- concrete DOM controls
- identifiable functions
- localStorage profile writes
- preview refresh behavior
- explicit config/API calls
- a real push-to-moOde action flow

It can still be expanded further, but it is already in the richer implementation-aware style that future drill-down pages should increasingly use.
