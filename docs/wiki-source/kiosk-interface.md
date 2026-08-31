---
title: kiosk-interface
page_type: parent
topics:
  - kiosk
  - display
  - controller
  - runtime
confidence: high
---

# kiosk interface

## Purpose

This page documents the kiosk branch of the `now-playing` ecosystem.

A stronger current interpretation is:
- kiosk is a presentation/shell mode
- it is not just another renderer alongside Player/Peppy/Visualizer
- the live kiosk path is largely controller-backed
- `kiosk.html` is an entry bridge, not the live shell
- many `kiosk-*.html` pages are redirect aliases into controller-family pages
- `controller-kiosk.html` is a separate scaffold/prototype path

So this page should now act as the parent hub for the kiosk branch, not as a tentative first-pass category page.

## Why this page matters

Kiosk is one of the easiest branches to misunderstand.

A wrong first guess usually looks like one of these:
- treating kiosk as a renderer instead of a shell mode
- treating `kiosk.html` as the live kiosk implementation
- treating kiosk-named child pages as independent kiosk UIs
- missing that the real shell behavior lives in `controller.html`
- missing that right-pane behavior and embedded child surfaces are central to kiosk behavior

This page exists to keep those distinctions explicit.

## What kiosk is in the current repo

A better current branch definition is:
- kiosk is the presentation shell built around a controller-backed 1280×400-style experience
- the entry path resolves profile/theme/recent-source settings and hands off into `controller.html`
- the shell then hosts controller-family child pages, especially through the kiosk right pane
- kiosk designer/editor behavior is a distinct subpath, not the same thing as the live shell

That is the current repo reality.

## Strong current branch map

## 1. Kiosk entry and redirect handoff

Current best anchor page:
- `kiosk-launch-and-routing.md`

What it now proves directly from file inspection:
- `kiosk.html` is a script-only profile-sync + redirect bridge
- it reads and writes kiosk/controller profile state in localStorage
- it redirects into `controller.html?kiosk=1&preview=1&rev=...`
- it forwards theme/recent-source/custom-color settings into the controller-backed destination

That means kiosk launch is a handoff path, not the shell itself.

## 2. Controller-backed live kiosk shell

Current best anchor page:
- `controller-kiosk-mode.md`

What it now proves directly from file inspection:
- `controller.html` explicitly detects kiosk mode and kiosk editor mode
- it owns the kiosk layout shell
- it owns the kiosk right-pane iframe and child-route remapping
- it applies controller-profile/query-driven state during kiosk use

That means the live kiosk shell is materially implemented in `controller.html`.

## 3. Kiosk child-route alias layer

Current best anchor pages:
- `kiosk-launch-and-routing.md`
- `kiosk-right-pane-routing.md`

Current direct file-backed truth:
- many `kiosk-*.html` pages are pure redirect aliases into controller pages
- examples include queue, queue wizard, now playing, artists, albums, genres, podcasts, radio, and playlists

This is an important branch truth.
Kiosk-named route does not imply independent kiosk implementation.

## 4. Right-pane and embedded child behavior

Current best anchor pages:
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`

Current branch truth:
- the kiosk shell uses a controller-owned right pane
- child pages are often hosted in an embedded iframe context
- pane open/close behavior, child-route remapping, and parent/child message behavior are all important to kiosk operation

So kiosk is not only a shell theme.
It is also a parent/child navigation system.

## 5. Kiosk editor/designer paths

Current best anchor pages:
- `kiosk-designer.md`
- `kiosk-editor-mode.md`
- `controller-kiosk-mode.md`

Current branch truth:
- kiosk editor/designer behavior is real and distinct
- `controller.html` has a dedicated kiosk-editor branch
- `controller-kiosk.html` remains a separate scaffold/prototype page and should not be confused with the main live kiosk path

## 6. Kiosk anatomy as a shell path

Current best anchor page:
- `kiosk-shell-anatomy.md`

Current branch truth:
- kiosk should be understood anatomically as a shell path, not as a single page
- entry bridge, live shell, right-pane child surfaces, and designer/scaffold paths all need to stay separate mentally

## What this branch is now confident about

The current repo and wiki support these stronger claims:
- kiosk is a presentation/shell mode, not a display renderer
- `kiosk.html` is a profile-sync + redirect bridge into `controller.html`
- `controller.html` owns real kiosk shell behavior
- many kiosk-named child pages are redirect aliases into controller-family pages
- right-pane and embedded child-page behavior are core kiosk mechanics, not incidental details
- `controller-kiosk.html` is a scaffold/prototype path, not the main live kiosk entry

## High-value starting paths

### If kiosk launch behavior is wrong
Start with:
1. `kiosk-launch-and-routing.md`
2. `controller-kiosk-mode.md`

### If kiosk pane behavior or child-page routing is wrong
Start with:
1. `kiosk-right-pane-routing.md`
2. `embedded-pane-contracts.md`
3. `controller-kiosk-mode.md`

### If the question is “is this really a kiosk page or just a controller alias?”
Start with:
1. `kiosk-launch-and-routing.md`
2. `kiosk-shell-anatomy.md`

### If the question is about kiosk designer/editor behavior
Start with:
1. `kiosk-designer.md`
2. `kiosk-editor-mode.md`
3. `controller-kiosk-mode.md`

## Relationship to other pages

This page should stay linked with:
- `display-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-mode.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `kiosk-shell-anatomy.md`
- `controller-kiosk-scaffold.md`

## Current status

At the moment, this page should be read as the parent hub for the kiosk branch.

It is no longer just a broad “kiosk category” page.
The current wiki already supports a much stronger model:
- kiosk is a controller-backed shell mode
- the entry bridge, live shell, right-pane behavior, alias pages, and scaffold path are now explicitly separated.
