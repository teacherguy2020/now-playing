# kiosk shell anatomy

## Purpose

This page documents the anatomy of the live kiosk shell path in the `now-playing` project.

It exists because “kiosk” is easy to misunderstand unless the wiki distinguishes between:
- the kiosk launcher/bridge
- the live kiosk shell behavior
- the right-pane embedded child region
- the kiosk designer/push tool
- the separate `controller-kiosk.html` scaffold path

This page is meant to help future agents answer questions like:
- “where does the live kiosk shell really start?”
- “what owns the right pane?”
- “is this in `kiosk.html`, `controller.html`, or `controller-kiosk.html`?”
- “is this live kiosk behavior or kiosk-designer behavior?”

## Why anatomy matters here

Kiosk is not one page.

It is a compound path with multiple roles:
- launcher/profile bridge
- controller-backed live shell behavior
- embedded pane hosting
- kiosk-branded child routes
- authoring/preview/push tooling
- runtime/display-host-sensitive behavior

That means many real tasks are anatomy questions, not just branch questions.

## The most important structural fact

The first thing a new agent should know is:
- `kiosk.html` is mainly a **launcher/profile bridge**
- it does **not** appear to be the final live kiosk UI
- it redirects into **`controller.html` with kiosk-flavored query params**

So the live kiosk shell path is best understood as:
1. `kiosk.html`
2. local profile/query-param merge
3. redirect into `controller.html?kiosk=1&preview=1&...`
4. controller-backed kiosk shell behavior
5. optional right-pane embedded child pages

That one fact should prevent a lot of wrong guesses.

## Main anatomical regions of the kiosk shell path

The current kiosk shell path is best understood as these main regions/components:

1. launcher/profile bridge (`kiosk.html`)
2. controller-backed live kiosk shell
3. right-pane embedded child region
4. kiosk-branded child-route aliases
5. kiosk designer / preview / push tool
6. separate scaffold/prototype path (`controller-kiosk.html`)
7. runtime/display-host-sensitive push and target behavior

## 1. Launcher/profile bridge (`kiosk.html`)

### What it is
`kiosk.html` is the main kiosk entrypoint, but its primary role is not to render the final kiosk UI directly.

### What it does
Current visible behavior shows it:
- reads incoming query params such as `theme`, `colorPreset`, `recentSource`, and custom theme/text colors
- reads saved kiosk profile from localStorage via:
  - `nowplaying.kiosk.profile.v1`
- synchronizes a controller/mobile profile via:
  - `nowplaying.mobile.profile.v2`
- resolves the effective kiosk profile state
- redirects into `controller.html` with kiosk-related query params such as:
  - `kiosk=1`
  - `preview=1`
  - `rev=...`
  - theme/color/recent-source/custom-color values

### Why it matters
If a new agent is trying to change the live kiosk shell and starts only in `kiosk.html`, they will often be in the wrong place.

`kiosk.html` is mainly the boot/profile handoff layer.

### If asked to improve kiosk launch behavior
Open first:
- `kiosk.html`
- profile/localStorage merge logic
- redirect construction into `controller.html`

## 2. Controller-backed live kiosk shell

### What it is
The actual live kiosk shell appears to be controller-backed, reached after `kiosk.html` redirects into `controller.html` with kiosk-flavored params.

### What it does
This is where the actual kiosk-mode shell behavior likely lives:
- kiosk-aware layout
- recent-source/theme/color application
- right-pane behavior
- controller-backed surface routing
- embedded child surface hosting

### Why it matters
This is the main reason kiosk anatomy cannot be documented only from `kiosk.html`.

The live kiosk shell is a **controller-backed mode**, not just a kiosk-named standalone page.

### Companion pages
- `controller-kiosk-mode.md`
- `tablet-kiosk-shell-differences.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`

## 3. Right-pane embedded child region

### What it is
One of the most important kiosk shell regions is the right-pane embedded child region.

### What it does
This region hosts child pages such as kiosk-branded or controller-backed views inside the live kiosk shell.

Examples from the branch already documented include:
- now-playing
- albums
- artists
- playlists
- radio
- podcasts
- genres
- queue
- queue wizard

### Why it matters
A lot of kiosk tasks that sound like:
- “change the queue pane”
- “fix the albums pane”
- “why does the right pane show the wrong thing?”

are really about this embedded child region and its routing contract.

### Companion pages
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `genre-pane-messaging.md`
- `visualizer-in-embedded-mode.md`

### If asked to improve right-pane behavior
Open first:
- the controller-backed kiosk shell logic
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- the child page actually loaded into the pane

## 4. Kiosk-branded child-route aliases

### What they are
Many `kiosk-*.html` pages are not independent kiosk implementations.
They are kiosk-branded redirect aliases into controller-family pages.

Examples include:
- `kiosk-now-playing.html` → `controller-now-playing.html`
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-queue.html` → `controller-queue.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`

### Why they matter
A new agent should not assume a kiosk-branded filename means the behavior is owned there.
In many cases, the real implementation owner is the controller-family target.

### If asked to improve a kiosk-branded child page
Open first:
- the kiosk-branded alias page only long enough to confirm redirect role
- then the real controller target page

## 5. Kiosk designer / preview / push tool

### What it is
`kiosk-designer.html` is the kiosk-side authoring/preview/push tool.

### What it does
Current visible behavior shows it:
- provides iframe preview of `kiosk.html`
- manages color/preset/custom-theme state
- persists kiosk profile state to localStorage
- supports export/import of presets
- includes “Push to moOde” behavior
- checks moOde target status / app-host runtime state

### Why it matters
This is the biggest place where future agents may confuse:
- live kiosk shell behavior
and
- kiosk designer behavior

They are related, but not the same thing.

### Important rule
If the issue is about:
- preview UI
- preset save/load/import/export
- Push to moOde button
- target-hint/status text

start in `kiosk-designer.html`, not the live kiosk shell.

### Companion pages
- `kiosk-designer.md`
- `display-launch-and-wrapper-surfaces.md`
- `display-issue-triage-runbook.md`

## 6. Separate scaffold/prototype path (`controller-kiosk.html`)

### What it is
`controller-kiosk.html` is a separate kiosk/controller scaffold path.

### What it does
Current visible behavior shows it is:
- a fixed 1280×400 shell
- split into sources/list/now-playing panes
- directly fetches app-host APIs on `:3101`
- includes placeholder append/crop/replace actions

### Why it matters
This page is **not** the same thing as the main live kiosk shell path driven by `kiosk.html` → `controller.html?kiosk=1...`.

### Important rule
If the task is about the currently deployed/live kiosk flow, do not assume `controller-kiosk.html` is the main owner.
Treat it as a separate scaffold/prototype path unless the actual workflow proves otherwise.

### Companion pages
- `controller-kiosk-scaffold.md`
- `kiosk-interface.md`

## 7. Runtime/display-host-sensitive push and target behavior

### What it is
Kiosk behavior depends strongly on runtime/display-host-sensitive control paths.

### What it includes
This includes things like:
- Push to moOde actions
- browser target URL checks
- app-host runtime/admin routes
- moOde-host actual display behavior
- local overrides that change live display behavior

### Why it matters
A kiosk change can appear successful in the browser while still failing on the real moOde-attached display.

### Companion pages
- `display-issue-triage-runbook.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `fragile-behavior-ownership.md`

## Practical “where do I start?” map

### If asked to improve kiosk launch/profile behavior
Open first:
- `kiosk.html`
- localStorage profile merge logic
- redirect construction into `controller.html`

### If asked to improve the live kiosk shell
Open first:
- controller-backed kiosk shell behavior
- `controller-kiosk-mode.md`
- `tablet-kiosk-shell-differences.md`

### If asked to improve the right pane
Open first:
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- the actual child page loaded into the pane

### If asked to improve kiosk preview/push tooling
Open first:
- `kiosk-designer.html`
- preset/custom-color state handling
- preview iframe logic
- push-to-moOde logic

### If asked to improve the 1280×400 scaffold/prototype
Open first:
- `controller-kiosk.html`
- scaffold sources/list/now-playing structure
- direct app-host fetch logic

### If asked to debug “kiosk shows the wrong thing on the real display”
Open first:
- display/runbook pages
- runtime-admin/display-target behavior
- local environment / moOde-host reality

## Anatomy rule for future agents

For kiosk, do not assume a requested change belongs only to:
- `kiosk.html`
- or `controller-kiosk.html`
- or `kiosk-designer.html`

Always classify the target first:
- launcher/profile bridge
- live controller-backed kiosk shell
- right-pane child embedding
- kiosk-branded alias page
- designer/preview/push tool
- separate scaffold/prototype path
- runtime/display-host-sensitive behavior

That classification step is probably the most important thing this page can teach.

## Relationship to other pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `kiosk-designer.md`
- `controller-kiosk-mode.md`
- `controller-kiosk-scaffold.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `display-issue-triage-runbook.md`
- `deployment-and-ops.md`
- `local-environment.md`

## Current status

At the moment, this page gives the wiki its fourth real page-anatomy reference.

Its main job is making explicit that “kiosk” is not a single page.
It is a multi-part shell path with:
- a launcher/profile bridge
- controller-backed live shell behavior
- right-pane child embedding
- kiosk-branded child aliases
- a designer/preview/push tool
- a separate scaffold/prototype path
- and runtime/display-host-sensitive behavior.
