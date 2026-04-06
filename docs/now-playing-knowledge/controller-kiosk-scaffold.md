---
title: controller-kiosk-scaffold
page_type: child
topics:
  - kiosk
  - controller
  - playback
  - runtime
confidence: high
---

# controller kiosk scaffold

## Purpose

This page documents `now-playing/controller-kiosk.html`.

`controller-kiosk.html` is a direct standalone kiosk/controller scaffold page.
It is not the main kiosk launch path.

Current file-backed repo truth is:
- it implements its own fixed `1280×400` layout
- it contains its own inline CSS and inline JavaScript
- it talks directly to the app-host API on port `3101`
- it includes real now-playing refresh behavior
- it includes partially wired source/list browsing behavior
- it still labels itself in-page as `1280x400 kiosk scaffold (phase 1)`

So this page should be treated as a separate scaffold/prototype implementation path inside the kiosk branch, not as the main live kiosk runtime.

## Important file

Primary file:
- `now-playing/controller-kiosk.html`

Direct API endpoints used by the page:
- `GET /config/runtime`
- `GET /now-playing`
- `GET /config/diagnostics/queue`
- `GET /config/queue-wizard/playlists`

## Why this page matters

This page matters because the kiosk branch is not uniform.

There are several distinct kiosk-family realities in the repo:
- `kiosk.html` as profile-sync and redirect bridge
- `controller.html` as the main live kiosk-backed shell
- `kiosk-*.html` alias pages as redirects into controller-family pages
- `controller-kiosk.html` as a direct self-contained scaffold page

Without this page, an agent can easily blur those paths together.

## What the page actually contains

Direct file inspection shows a fixed three-pane layout:
- Sources pane (`320px`)
- List pane (`560px`)
- Now Playing pane (`400px`)

The page root is:
- `#app`

with explicit grid sizing:
- `grid-template-columns: 320px 560px 400px`

This is a self-contained kiosk-sized controller composition, not a redirect or wrapper.

## Sources pane

The Sources pane contains buttons under `#sources` for:
- `library`
- `playlists`
- `radio`
- `podcasts`
- `youtube`
- `queue`

The pane also contains explicit in-page status text:
- `1280x400 kiosk scaffold (phase 1)`

That string is strong evidence for the page’s scaffold/prototype role.

## List pane

The List pane is anchored by:
- `#listTitle`
- `#listBody`

### `loadList(src)`
This function drives the list content.

Its current behavior is concrete and limited:
- if `src === 'queue'`, it fetches `GET /config/diagnostics/queue`
- if `src === 'playlists'`, it fetches `GET /config/queue-wizard/playlists`
- for other sources, it renders placeholder text:
  - `<source> browsing wiring next.`

That means the page is partially wired.
It is not a fully implemented controller shell.

Current strong statement:
- queue and playlists have direct working fetch paths
- library/radio/podcasts/youtube are still scaffold placeholders in this file

## Now Playing pane

The Now Playing pane contains:
- `#art`
- `#title`
- `#artist`
- `#album`

### `refreshNowPlaying()`
This function:
1. ensures a track key via `GET /config/runtime`
2. fetches `GET /now-playing`
3. maps returned fields into visible text using values such as:
   - `title` / `displayTitle`
   - `artist` / `displayArtist`
   - `album`
4. resolves artwork from:
   - `albumArtUrl`
   - `displayArtUrl`
   - fallback `/art/current.jpg`
5. refreshes every 5 seconds via `setInterval(refreshNowPlaying, 5000)`

So this page includes a real live now-playing polling loop, not just a static layout mockup.

## Action buttons

The page includes action buttons:
- `#btnAppend`
- `#btnCrop`
- `#btnReplace`

But direct file inspection shows these are not fully wired queue mutations.
Their current handlers are:
- `alert('Append action wiring in phase 2')`
- `alert('Crop action wiring in phase 2')`
- `alert('Replace action wiring in phase 2')`

That matters a lot.

The right current statement is:
- the page exposes intended queue-action slots
- those actions are still placeholder handlers in this file

So this is a scaffold with real read-side behavior and placeholder write-side behavior.

## Runtime key and API behavior

### `ensureKey()`
This function calls:
- `GET /config/runtime`

and extracts:
- `config.trackKey`

That key is then used in protected follow-up requests.

This is the same general runtime-key acquisition pattern seen in other operational/controller pages.

## What this page is

`controller-kiosk.html` is:
- a direct standalone kiosk/controller scaffold page
- a self-contained `1280×400` three-pane prototype layout
- a partial browser-side implementation with real now-playing and list-loading behavior
- a useful evidence page for earlier kiosk-controller design intent

## What this page is not

`controller-kiosk.html` is not:
- the main kiosk launch bridge (`kiosk.html`)
- the main live kiosk shell owner (`controller.html` in kiosk mode)
- a thin redirect alias page
- a fully completed kiosk controller in its current file state

## Relationship to the rest of the kiosk branch

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-mode.md`
- `kiosk-shell-anatomy.md`

The branch distinction should remain explicit:
- `kiosk.html` = launcher/profile bridge
- `controller.html` = main live kiosk shell
- `controller-kiosk.html` = separate direct scaffold/prototype path

## Current status

This page now has a firmer repo-backed definition:
- `controller-kiosk.html` is a self-contained kiosk/controller scaffold
- it has real now-playing polling and partial list loading
- it directly calls app-host API routes
- it still contains explicit phase-1 scaffold labeling and placeholder action wiring
- it should be treated as a distinct prototype path, not as the main kiosk runtime
