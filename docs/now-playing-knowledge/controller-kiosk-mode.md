---
title: controller-kiosk-mode
page_type: child
topics:
  - kiosk
  - controller
  - display
  - runtime
confidence: high
---

# controller kiosk mode

## Purpose

This page documents what `controller.html` actually does when kiosk mode is active.

It exists because the practical kiosk experience is not owned only by `kiosk.html`.
Direct file inspection shows that `controller.html` is the real implementation center for:
- kiosk layout activation
- kiosk editor mode
- kiosk right-pane hosting
- kiosk child-page remapping
- controller-profile/theme application during kiosk use

So this page should describe `controller.html` as a concrete kiosk-mode implementation surface, not just a conceptual “controller-backed” idea.

## Why this page matters

If `kiosk-launch-and-routing.md` explains how kiosk mode enters the controller family, this page explains what happens after that handoff.

The current code makes this much clearer than older wiki wording did:
- kiosk mode is explicitly detected in `controller.html`
- kiosk editor mode is explicitly detected there too
- kiosk-specific CSS and DOM are built directly into the page
- kiosk child-page routing happens directly in the page
- the right-pane iframe and message lifecycle are owned there

That means `controller.html` is one of the main implementation centers of live kiosk behavior.

## 1. Kiosk mode is explicit in `controller.html`

### Query-param detection
Direct file inspection shows these constants:
- `IS_PREVIEW = __u.searchParams.get('preview') === '1'`
- `IS_KIOSK_1280 = (__u.searchParams.get('kiosk') === '1' || __u.searchParams.get('profile') === '1280x400' || __u.searchParams.get('layout') === '1280x400')`
- `IS_KIOSK_EDITOR = IS_KIOSK_1280 && (__u.searchParams.get('edit') === '1' || __u.searchParams.get('designer') === '1')`

So kiosk behavior is not inferred from CSS filenames or page names.
It is directly activated by controller-side query params.

### Body classes
When kiosk mode is active, the file adds:
- `body.kiosk1280`
- and, when editor/designer mode is active, `body.kioskEditor`

That is concrete file behavior, not a documentation guess.

## 2. `controller.html` contains the kiosk layout itself

### Kiosk layout CSS is embedded directly in the page
Direct file inspection shows extensive CSS for:
- `body.kiosk1280`
- `body.kiosk1280:not(.kioskEditor)`
- `body.kiosk1280 .kioskCtl`
- `body.kiosk1280 #kioskCanvas`
- `body.kiosk1280 .recentWrap`
- `body.kiosk1280 .kPane`

### What the CSS implies concretely
The file directly implements:
- a `1280×400` kiosk landscape profile
- a one-row live mode when not in editor mode
- a taller editor/designer form when `kioskEditor` is active
- a three-zone kiosk canvas with dedicated recent/pane behavior
- a slide-in right pane layered over the recent column

This is strong evidence that the live kiosk shell is materially implemented inside `controller.html`, not merely themed there.

## 3. Kiosk DOM is built directly into `controller.html`

### Concrete kiosk DOM anchors
Direct file inspection shows:
- `#kioskCtl`
- `#kioskSizeSel`
- `#kioskPushBtn`
- `#kioskPushStat`
- `#kioskCanvas`
- `#kioskPane`
- `#kioskPaneFrame`

That means the page contains both:
- kiosk editor controls
- kiosk live-shell pane infrastructure

### Why this matters
This is one of the clearest reasons `controller.html` should be treated as a real kiosk implementation page.
It is not simply a general controller page that happens to tolerate kiosk params.

## 4. Kiosk editor mode is real and separate from live kiosk mode

### `initKioskControls()`
Direct file inspection shows a dedicated initializer:
- `initKioskControls()`

And it begins with:
- `if (!IS_KIOSK_EDITOR) return;`

So the page has an explicit editor/designer branch.

### What the kiosk controls do
Observed behavior from file inspection:
- reveal the kiosk control box only in editor mode
- use `#kioskSizeSel` to switch between kiosk-related targets/pages
- wire `#kioskPushBtn` for live push behavior
- update `#kioskPushStat` with status text

That means controller-side kiosk mode includes both:
- live presentation mode
- a controller-embedded editor/control mode

This should stay distinct in the docs.

## 5. Kiosk mode reuses controller profile machinery

### Controller profile key
Direct file inspection shows:
- `MOBILE_PROFILE_KEY = 'nowplaying.mobile.profile.v2'`
- `MOBILE_DEFAULT_PROFILE = { devicePreset:'mobile', theme:'auto', layout:'home-rail', showRecent:true, recentSource:'albums', colorPreset:'ocean', recentCount:18 }`

### URL-driven override behavior
The page explicitly applies URL/query-driven overrides for:
- `devicePreset`
- `theme`
- `colorPreset`
- `recentSource`
- custom colors via:
  - `primaryThemeColor`
  - `secondaryThemeColor`
  - `primaryTextColor`
  - `secondaryTextColor`

### Server-profile loading
The file also has:
- `loadServerProfile()`

Which fetches:
- `${base}/config/controller-profile`

But it intentionally skips this when:
- `IS_PREVIEW`
- or `USE_LOCAL_PROFILE_ONLY`

That matters because kiosk launch from `kiosk.html` sets `preview=1`, so the redirected kiosk path intentionally avoids pulling the shared server profile and instead relies on the synchronized local profile state.

That is an important controller-side truth and should stay explicit.

## 6. Kiosk right-pane behavior is implemented inside `controller.html`

### Concrete pane infrastructure
Direct file inspection shows:
- `#kioskPane`
- `#kioskPaneFrame`
- `closeKioskPane()`
- window message handling for `np-kiosk-hide-pane`

### Concrete right-pane routing behavior
The relevant controller-side logic does this:
- if `shouldOpenInRightPane()` and the page starts with `kiosk-` (or is `visualizer.html`), treat it as pane content
- map kiosk-named child routes into controller-family pages
- load them into `#kioskPaneFrame`
- close the pane if the same row is tapped again while already open
- navigate directly to controller-family pages instead when not using the right-pane mode

Observed mapping block includes:
- `kiosk-now-playing.html` → `controller-now-playing.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-queue.html` → `controller-queue.html`

So the controller page is not just a generic destination.
It actively owns the kiosk pane lifecycle and child-view remapping logic.

## 7. `preview=1` matters operationally

The earlier wiki treated `preview=1` as important but underspecified.
Direct file inspection now supports a cleaner statement:

### Strong current evidence
`IS_PREVIEW` is explicitly checked in controller logic, including:
- `loadServerProfile()` short-circuiting when preview is active

### What that means practically
A better current interpretation is:
- preview mode is part of the kiosk handoff contract
- in preview mode, controller behavior relies more on query/local profile state and less on shared controller-profile fetches

That is a stronger and more concrete statement than the old page gave.

## What `controller.html` is not

Even though it owns real kiosk behavior, it is still not:
- the initial kiosk entry bridge (`kiosk.html` owns that)
- the separate scaffold/prototype page (`controller-kiosk.html` owns that)
- every embedded child surface itself (`controller-queue.html`, `controller-now-playing.html`, etc. still own their own content)

So the clean split is:
- `kiosk.html` = entry bridge
- `controller.html` = live kiosk shell + pane/routing owner
- controller child pages = actual embedded content surfaces
- `controller-kiosk.html` = separate scaffold/prototype path

## Best current interpretation

A precise, file-backed interpretation is:
- `controller.html` is one of the main real kiosk implementation pages in the repo
- it explicitly detects kiosk and kiosk-editor modes
- it owns the kiosk layout shell, editor controls, right-pane iframe, and child-route remapping
- it applies controller-profile and query-driven theme/source settings during kiosk use
- it is the practical destination for the live kiosk handoff from `kiosk.html`

## Relationship to other pages

This page should stay linked with:
- `kiosk-launch-and-routing.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `controller-kiosk-scaffold.md`
- `kiosk-shell-anatomy.md`

## Current status

At the moment, this page is much less abstract than before.

The current code strongly supports treating `controller.html` as:
- a real kiosk-mode implementation surface
- not just a place kiosk happens to land after redirect
