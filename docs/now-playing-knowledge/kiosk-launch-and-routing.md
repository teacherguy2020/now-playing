---
title: kiosk-launch-and-routing
page_type: child
topics:
  - kiosk
  - display
  - controller
  - runtime
confidence: high
---

# kiosk launch and routing

## Purpose

This page documents how kiosk mode is actually entered and handed off in the current repo.

It exists because the kiosk family looks larger and more independent than it really is.
Direct file inspection shows that much of the kiosk path is:
- profile resolution
- localStorage synchronization
- redirect handoff into `controller.html`
- very thin kiosk-named alias pages that immediately redirect into controller-family pages

So this page should explain the real launch/routing path, not just the filename pattern.

## Why this page matters

If an agent treats kiosk as one standalone surface family, it will make wrong first guesses.

The stronger current truth is:
- `kiosk.html` is a redirect bridge into `controller.html`
- many `kiosk-*.html` pages are one-line aliases into controller pages
- the visible kiosk experience is largely controller-backed
- kiosk behavior depends heavily on profile sync and controller query parameters

That is a more precise and more useful model.

## 1. `kiosk.html` — profile-sync and redirect bridge

### What it actually is
Direct file inspection shows that `kiosk.html` has no visible kiosk UI of its own.
It is effectively just a script-only handoff page.

The whole page is:
- minimal shell/background styling
- one immediately invoked script
- `location.replace(...)` into `controller.html`

So `kiosk.html` is not the kiosk shell itself.
It is a launcher/bridge.

### Local storage keys it uses
The page explicitly references:
- `nowplaying.kiosk.profile.v1`
- `nowplaying.mobile.profile.v2`

Constants in file:
- `KIOSK_PROFILE_KEY = 'nowplaying.kiosk.profile.v1'`
- `CONTROLLER_PROFILE_KEY = 'nowplaying.mobile.profile.v2'`

That is stronger than the earlier doc wording: these are not just likely profile keys, they are directly in the file.

### What query params it reads
The page reads these incoming params from `location.search`:
- `theme`
- `colorPreset`
- `recentSource`
- `primaryThemeColor`
- `secondaryThemeColor`
- `primaryTextColor`
- `secondaryTextColor`

Then it merges those with any saved kiosk profile values from localStorage.

### Resolution model
The file builds:
- `incoming`
- `saved`
- `resolved`
- `effective`

The practical model is:
1. read explicit URL overrides
2. read saved kiosk profile
3. prefer incoming values when present
4. fall back to saved kiosk profile values
5. synthesize defaults if still missing

Observed defaults in `effective`:
- `theme: 'dark'`
- `colorPreset: 'ocean'`
- `recentSource: 'albums'`
- `customColors: null` unless custom color params are present

So the page is a deterministic profile resolver, not just a blind redirect.

### What it writes back to localStorage
It writes a normalized kiosk profile to:
- `nowplaying.kiosk.profile.v1`

Then it also writes a synchronized controller/mobile profile to:
- `nowplaying.mobile.profile.v2`

Observed controller profile payload includes:
- `devicePreset: 'mobile'`
- `theme`
- `layout: 'home-rail'`
- `showRecent: true`
- `recentSource`
- `colorPreset`
- `recentCount: 18`
- `customColors`

That means `kiosk.html` is explicitly synchronizing kiosk-facing choices into the controller profile model before redirecting.
This is not speculation anymore; it is literal file behavior.

### Redirect target and params
The redirect target is:
- `controller.html`

Before redirect, the file sets these query params on the destination URL:
- `kiosk=1`
- `preview=1`
- `rev=20260329-motion-art-fix`

And conditionally forwards:
- `theme`
- `colorPreset`
- `recentSource`
- `primaryThemeColor`
- `secondaryThemeColor`
- `primaryTextColor`
- `secondaryTextColor`

So kiosk launch is concretely:
- resolve kiosk/controller profile state
- set kiosk/controller query params
- redirect into `controller.html`

### What `rev=20260329-motion-art-fix` means in practice
The inline comment says:
- cache-bust controller shell on moOde so kiosk nav fixes apply immediately

So this is a deliberate cache-busting handoff parameter for the controller shell, not arbitrary noise.

### Best current interpretation
A precise interpretation is:
- `kiosk.html` is a profile-sync + redirect bridge into `controller.html`
- it persists kiosk-resolved choices locally
- it keeps the controller profile aligned with kiosk launch settings
- it does not itself implement the live kiosk UI

That is much stronger and cleaner than calling it a generic “launcher.”

## 2. `controller.html` — actual kiosk-backed destination

### What direct file inspection confirms
The page is extremely large, but direct inspection already confirms kiosk-specific behavior in `controller.html` itself.

Observed evidence includes:
- `IS_PREVIEW = __u.searchParams.get('preview') === '1'`
- kiosk detection from query params:
  - `kiosk=1`
  - `profile=1280x400`
  - `layout=1280x400`
- kiosk CSS/body-class behavior:
  - `body.kiosk1280`
  - `body.kioskEditor`
- `#kioskPane` and `#kioskPaneFrame`
- message handling for:
  - `np-kiosk-hide-pane`

The page also reads and applies query-driven profile/theme state such as:
- `theme`
- `colorPreset`
- `recentSource`
- `primaryThemeColor`
- `secondaryThemeColor`
- `primaryTextColor`
- `secondaryTextColor`

So the current evidence strongly supports the claim that the practical kiosk shell is controller-backed.

### What this means
The handoff path is not just stylistic.
The redirected destination really does contain:
- kiosk-specific layout rules
- kiosk pane infrastructure
- preview-aware behavior
- query-driven theme/profile application

That makes the current kiosk architecture much less speculative than before.

## 3. Kiosk alias pages — pure redirect shims into controller surfaces

Direct file inspection shows that several kiosk-named pages are nothing more than one-line redirect shims.

Observed exact mappings:
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-queue.html` → `controller-queue.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-now-playing.html` → `controller-now-playing.html`

The implementation pattern is literally:
- HTML doctype/meta tags
- inline script:
  - `location.replace("controller-*.html" + location.search);`

That means these pages are not “kiosk implementations.”
They are route aliases preserving the query string while switching to controller-family pages.

This is one of the most important truths in the kiosk branch and should stay explicit.

## 4. `controller-kiosk.html` — separate scaffold/prototype path

Direct file inspection shows that `controller-kiosk.html` is not part of the same redirect bridge model.

It is a standalone scaffold page with:
- fixed 1280×400 layout
- three-pane structure
- hardcoded source buttons (Library, Playlists, Radio, Podcasts, YouTube, Queue)
- a Now Playing panel fed from `/now-playing`
- placeholder action buttons:
  - Append
  - Crop
  - Replace
- explicit comments like:
  - `1280x400 kiosk scaffold (phase 1)`
  - `Load ... wiring next`
  - `... action wiring in phase 2`

So this file should still be treated as:
- scaffold/prototype path
- not the main live kiosk handoff path

That distinction is now very concrete.

## Working routing model

A stronger, file-backed routing model is:

1. open `kiosk.html`
2. resolve incoming theme/recent-source/custom-color parameters
3. merge with saved kiosk profile from localStorage
4. write normalized kiosk profile
5. sync controller/mobile profile state
6. redirect into `controller.html?kiosk=1&preview=1&rev=...`
7. let `controller.html` provide the actual kiosk-backed shell/layout behavior
8. for child surfaces, rely heavily on kiosk-named alias pages that redirect into controller-family views

That is the clearest current model the files support.

## Key distinctions to preserve

### `kiosk.html` vs `controller.html`
- `kiosk.html` = profile-sync + redirect bridge
- `controller.html` = actual controller-backed kiosk shell destination

### kiosk alias pages vs real kiosk implementations
- many `kiosk-*.html` pages = redirect aliases only
- they are not independent kiosk UI implementations

### `controller-kiosk.html` vs main kiosk path
- `controller-kiosk.html` = scaffold/prototype path
- `kiosk.html` → `controller.html` = main live handoff path

## What this page is now confident about

Direct file inspection now supports these strong claims:
- `kiosk.html` is a script-only redirect bridge
- it explicitly syncs kiosk state into `nowplaying.mobile.profile.v2`
- it explicitly redirects into `controller.html` with `kiosk=1` and `preview=1`
- the redirect includes a cache-busting `rev=20260329-motion-art-fix`
- multiple kiosk-named pages are pure controller redirect aliases
- `controller.html` really does contain kiosk-specific shell/pane logic
- `controller-kiosk.html` really is a scaffold/prototype path

## Relationship to other pages

This page should stay linked with:
- `kiosk-interface.md`
- `controller-kiosk-mode.md`
- `controller-kiosk-scaffold.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `kiosk-shell-anatomy.md`

## Current status

At the moment, this page is much less guessy than before.

The current truth is:
- the main kiosk entrypoint is a profile-sync + redirect bridge
- the live kiosk shell is largely controller-backed
- many kiosk-named files are aliases, not independent implementations
- the separate scaffold/prototype path is `controller-kiosk.html`
