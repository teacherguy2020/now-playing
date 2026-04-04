# kiosk launch and routing

## Purpose

This page describes how kiosk mode is entered, routed, and handed off between kiosk-branded entrypoints and controller-family surfaces.

This is the next drill-down beneath `kiosk-interface.md` because repo inspection shows that kiosk is not implemented as one standalone page. Instead, kiosk behavior is substantially shaped by:
- launch/redirect behavior
- local profile handoff
- kiosk-flavored controller routing
- kiosk-branded alias pages that often redirect into controller views

## Why this page exists

The kiosk family can be confusing if it is treated as a flat list of HTML files.

Some kiosk files are:
- actual launch/bridge layers
- support tools
- standalone scaffold/prototype pages
- thin redirect shims into controller pages

This page focuses specifically on the launch/routing part of that picture.

## Primary entrypoint: `now-playing/kiosk.html`

At the moment, `now-playing/kiosk.html` appears to be the main kiosk launcher/bridge.

Repo-visible behavior includes:
- reading incoming query parameters for things like theme/color/recent-source
- reading a saved kiosk profile from localStorage
- resolving an effective kiosk configuration from URL + saved profile
- syncing a controller-facing profile in localStorage
- redirecting into `controller.html` with kiosk-related query parameters

This means `kiosk.html` is important less as a final rendered surface and more as a handoff/orchestration entrypoint.

## Local profile handoff

`kiosk.html` currently appears to use two key localStorage profiles:
- `nowplaying.kiosk.profile.v1`
- `nowplaying.mobile.profile.v2`

Current working interpretation:
- the kiosk profile stores kiosk-oriented preferences/state
- the mobile/controller profile is kept in sync so that kiosk-flavored controller behavior inherits the intended presentation settings

This is an important architectural clue:
- kiosk is not isolated from controller behavior
- it appears to reuse controller-family presentation/control machinery via profile synchronization and redirected launch

## Redirect target: `controller.html`

Repo-visible behavior indicates that `kiosk.html` redirects into `controller.html` with kiosk-related query parameters.

Observed parameters include:
- `kiosk=1`
- `preview=1`
- `rev=20260329-motion-art-fix`
- theme/color/recent-source settings

This strongly suggests that the practical kiosk experience is often delivered by a kiosk-flavored controller route/state rather than by a kiosk-only rendering shell.

That is a major insight for future documentation and debugging.

## Kiosk-branded redirect shims

Several `kiosk-*.html` pages are currently very thin redirect wrappers into controller-family pages.

Observed mappings include:
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-queue.html` → `controller-queue.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-now-playing.html` → `controller-now-playing.html`

This suggests that kiosk naming often acts as:
- a routing alias
- a presentation-mode entry path
- a convenience naming layer over controller-oriented surfaces

Rather than implying a wholly separate kiosk implementation for every view.

## Working routing model

A useful current model is:

1. A kiosk-oriented entrypoint is opened
2. Kiosk-specific preferences are resolved
3. Those preferences are persisted/synchronized into local profile state
4. The user/host is redirected into controller-family surfaces with kiosk-flavored parameters or aliases
5. The visible kiosk experience is therefore often controller-backed, even when entered through kiosk-named files

This model should be treated as provisional but already useful.

## Why this matters architecturally

This launch/routing behavior means:
- kiosk and controller families are more entangled than their filenames initially suggest
- debugging kiosk behavior may require looking at controller pages and controller-state assumptions
- kiosk-specific bugs may actually live in routing, profile sync, or controller rendering behavior rather than in a kiosk-only file
- future documentation should distinguish between:
  - kiosk entrypoints
  - kiosk support tools
  - controller-backed kiosk destinations
  - standalone kiosk-specific implementations

## Relationship to other kiosk pages

This page should stay linked with:
- `kiosk-interface.md` — broader kiosk branch and operational framing
- `display-interface.md` — parent display branch
- future `kiosk-designer.md` — for the preview/push/config side of kiosk work
- future `controller-kiosk-scaffold.md` — for the separate fixed-layout scaffold path

## Things still to verify

This routing model should eventually be tightened with more explicit verification of:
- how `controller.html` interprets `kiosk=1`
- what `preview=1` changes in practice
- whether all kiosk-branded redirect pages are still active/used in the live system
- whether kiosk aliases exist mainly for moOde/browser URL entry, user convenience, or internal structure
- how much of kiosk behavior is ultimately implemented in controller scripts and styles

## Immediate follow-up candidates

The most logical next drill-down pages from here are:
- `kiosk-designer.md`
- `controller-kiosk-scaffold.md`
- a future controller-side page documenting how `controller.html` behaves in kiosk mode

## Current status

At the moment, this page provides a working routing model rather than a finished implementation reference.

Its main value is making clear that kiosk mode is currently best understood as a launch/routing/profile layer sitting on top of controller-family behavior, rather than as one isolated kiosk-only interface.
