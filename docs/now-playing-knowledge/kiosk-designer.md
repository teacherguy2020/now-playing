---
title: kiosk-designer
page_type: child
topics:
  - kiosk
  - display
  - runtime
  - controller
confidence: high
---

# kiosk designer

## Purpose

This page documents `now-playing/kiosk-designer.html`.

`kiosk-designer.html` is the kiosk authoring, preview, and push console.
It is not the live kiosk shell itself.

Current file-backed repo truth is:
- the page hosts a live iframe preview of `kiosk.html`
- it persists kiosk profile state into localStorage
- it can export and import theme/preset JSON
- it checks moOde browser-target status
- it pushes a kiosk URL into moOde through the app-host API

So this page belongs in the kiosk branch as a designer/helper and deployment surface, not as the kiosk runtime surface.

## Important files

Primary file:
- `now-playing/kiosk-designer.html`

Primary preview/push target:
- `now-playing/kiosk.html`

Key API endpoints used directly by the page:
- `GET /config/runtime`
- `GET /config/moode/browser-url/status`
- `POST /config/moode/browser-url`

## Why this page matters

`kiosk-designer.html` shows that kiosk behavior is not only a runtime display problem.
The project includes a dedicated browser-side workflow for:
- previewing kiosk presentation
- choosing colors/presets
- synchronizing profile state
- checking current moOde browser-target configuration
- pushing the intended kiosk URL into moOde

That makes this page an operational bridge between kiosk design intent and live moOde display behavior.

## What the page actually contains

Direct file inspection shows these main UI elements:
- `#sizeSel`
- `#presetSel`
- `#savePresetBtn`
- `#deletePresetBtn`
- `#exportPresetBtn`
- `#importPresetBtn`
- `#pushBtn`
- `#targetHint`
- `#stat`
- `#primaryThemeColor`
- `#secondaryThemeColor`
- `#primaryTextColor`
- `#secondaryTextColor`
- `#preview`

Important visible structural facts:
- `#sizeSel` currently offers only `kiosk.html` at `1280×400`
- `#preview` is an iframe with `src="kiosk.html"`
- the page includes export modal UI for preset JSON
- Save/Delete preset buttons exist in markup but are hidden in script

That last point matters.
The current page is not acting like a full CRUD preset manager.
Its live behavior is centered on:
- built-in theme presets
- import/export JSON
- local profile persistence
- preview and push behavior

## Key state and storage behavior

### `persistProfile()`
This function writes kiosk design state into localStorage keys:
- `nowplaying.kiosk.profile.v1`
- `nowplaying.mobile.profile.v2`

The stored state includes:
- `theme: 'auto'`
- `colorPreset`
- `recentSource: 'albums'`
- `customColors`

The mobile profile write also includes controller-facing fields such as:
- `devicePreset: 'mobile'`
- `layout: 'home-rail'`
- `showRecent: true`
- `recentCount: 18`

That means `kiosk-designer.html` is not only styling a preview.
It also synchronizes kiosk design choices into the controller/mobile-profile vocabulary used elsewhere in the system.

## Preview URL construction

### `buildRel()`
This function builds the relative kiosk preview/push URL.

Direct file-backed behavior includes:
- starting from the selected size target, which currently resolves to `kiosk.html`
- forcing a cache-busting `pushRev=<timestamp>`
- forcing `theme=auto`
- forcing `recentSource=albums`
- appending `colorPreset`
- appending all custom color query parameters

The returned value is a relative path like:
- `kiosk.html?pushRev=...&theme=auto&recentSource=albums&colorPreset=...&primaryThemeColor=...`

This function is central because both preview reload and moOde push behavior depend on it.

## Preview update contract

### `refreshPreview()`
This function rebuilds the preview URL and reloads the iframe.

It is triggered by:
- size changes
- preset changes
- theme/text color input changes

### `postLiveTheme()`
This function posts a message into the preview iframe with:
- `type: 'np-live-theme-update'`
- `customColors`

That means the designer uses both:
- full iframe reloads through `refreshPreview()`
- message-based live-theme updates through `postLiveTheme()`

So the relationship to `kiosk.html` is a real preview contract, not just a static embed.

## Built-in preset behavior

The page defines a large `THEME_PRESETS` array directly in the file.
Examples include:
- `ocean`
- `violet`
- `mint`
- `amber`
- `black`
- `midnight`
- `slate`
- `sunset`
- `rose`
- `emerald`
- light variants such as `cloud`, `sand`, and `blush`

The current behavior is:
- `refreshPresetList()` populates `#presetSel` from this in-file preset table
- choosing a preset copies its colors into the live color inputs
- choosing a preset persists profile state and refreshes preview

This is built-in preset selection, not a generalized saved-preset subsystem.

## Export/import behavior

The page includes real export/import flows.

### Export
Clicking `#exportPresetBtn`:
- serializes the current preset name and color values into JSON
- places that JSON into `#exportJson`
- opens `#exportModal`
- supports Select All and Copy actions

### Import
Clicking `#importPresetBtn`:
- prompts for pasted preset JSON
- parses color values from that JSON
- updates live inputs
- persists profile state
- posts live theme updates into the preview iframe

So import/export is a real current workflow, not a placeholder.

## moOde target check behavior

### `ensureKey()`
This function calls:
- `GET /config/runtime`

and extracts:
- `config.trackKey`

That track key is then reused for later protected runtime/config calls.

### `refreshTargetHint()`
This function calls:
- `GET /config/moode/browser-url/status`

It computes the expected target as:
- `http(s)://<host>:8101/kiosk.html`

Then it compares the current moOde browser target (`appUrl` or `runUrl`) against that expectation and updates `#targetHint`.

So this page does not blindly push.
It first checks and explains whether moOde is currently pointed at the right display target family.

## Push-to-moOde action flow

The Push button is one of the clearest file-backed action flows in the kiosk branch.

When `#pushBtn` is clicked, the page:
1. disables the button and changes its label to `Pushing…`
2. ensures the runtime track key via `GET /config/runtime`
3. builds the relative kiosk target with `buildRel()`
4. converts that into a full moOde URL:
   - `http://<host>:8101/<relative-target>`
5. POSTs that URL to:
   - `POST /config/moode/browser-url`
6. sends payload fields:
   - `url`
   - `reason: 'kiosk-designer-push'`
7. persists the kiosk profile locally
8. updates `#stat` with success or failure text

This is the important operational truth:
`kiosk-designer.html` is a real deployment/control surface for kiosk presentation on moOde.

## What this page is

`kiosk-designer.html` is:
- the kiosk preview console
- the kiosk theme/color authoring surface
- the local profile sync point for kiosk-related state
- the moOde target verification surface
- the push-to-moOde control page for kiosk browser-target updates

## What this page is not

`kiosk-designer.html` is not:
- the live kiosk shell
- the controller-backed kiosk runtime page
- a generic display-render mode
- a full saved-preset management system in its current live behavior

## Relationship to other pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-mode.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `display-launch-and-wrapper-surfaces.md`

## Current status

This page now has a firm repo-backed definition:
- `kiosk-designer.html` is the authoring, preview, verification, and push surface for kiosk presentation
- it previews `kiosk.html`
- it persists kiosk/controller-facing profile state
- it checks moOde browser-target status
- it pushes live kiosk URLs into moOde through the app-host API
