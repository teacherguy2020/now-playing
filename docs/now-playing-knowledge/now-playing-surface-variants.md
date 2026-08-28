---
title: now-playing-surface-variants
page_type: parent
topics:
  - controller
  - playback
  - display
  - queue
confidence: high
---

# now-playing surface variants

## Purpose

This page documents the `controller-now-playing*` family of HTML surfaces in the `now-playing` ecosystem.

This family is not a pile of equal peers.
Current file-backed repo truth shows a mix of:
- substantive implementation pages
- device/layout variants
- thin redirect shims
- one alias compatibility shim

So the right mental model is a family with clear implementation centers and clear wrapper pages.

## Why this page matters

The now-playing family is one of the most visible controller surface clusters in the system.

These pages own or expose:
- current track identity
- album art and background presentation
- next-up state
- transport controls
- queue access
- album/artist drill-down
- embedded-pane behavior
- iPhone-specific interaction behavior in one major branch

That makes this a high-value family to classify cleanly.

## Files in the family

Current repo-visible files in this family are:
- `controller-now-playing.html`
- `controller-now-playing-tablet.html`
- `controller-now-playing-grid.html`
- `controller-now-playing-ipad.html`
- `controller-now-playing-iphone.html`
- `controller-nowplaying-iphone.html`

## Family classification

## 1. Main implementation page: `controller-now-playing.html`

`controller-now-playing.html` is one of the main now-playing implementation centers in the repo.

Direct file-backed characteristics include:
- large integrated now-playing UI
- embedded preview/iframe guardrails
- background art layering and blur behavior
- queue modal infrastructure
- album modal infrastructure
- transport controls
- next-up UI
- phone-oriented layout branches
- `iphone=1` behavior inside the same file

This is not a wrapper or alias page.
It is a large substantive controller surface.

## 2. Tablet implementation variant: `controller-now-playing-tablet.html`

`controller-now-playing-tablet.html` is also a substantive implementation page.

It is not a redirect shim.

Direct file-backed evidence:
- it is a full HTML document with extensive inline styles and logic
- it loads shared controller CSS such as `styles/index1080.css` and `styles/controller-modals.css`
- it contains the same broad class of now-playing UI concerns as the main page
- it includes explicit embedded-mode fallback behavior
- it contains queue and album modal structures in-file

So this is a real tablet-oriented implementation variant, not just a name alias.

## 3. Grid implementation variant: `controller-now-playing-grid.html`

`controller-now-playing-grid.html` is also a substantive implementation page.

Direct file-backed evidence:
- it is a full HTML document with large inline style and behavior blocks
- it contains a phone/grid-oriented composition branch
- it includes queue modal infrastructure and album modal infrastructure
- it includes embedded-mode fallback behavior
- it includes now-playing art/title/artist/album rendering behavior

So this is another real implementation variant, not a redirect or thin wrapper.

## 4. iPad redirect shim: `controller-now-playing-ipad.html`

`controller-now-playing-ipad.html` is a pure redirect shim.

Direct file-backed behavior:
- meta refresh to `/controller-now-playing-tablet.html`
- JavaScript redirect that preserves query parameters and redirects to `/controller-now-playing-tablet.html`

So the iPad path is implemented in `controller-now-playing-tablet.html`, not in this file.

## 5. iPhone redirect shim: `controller-now-playing-iphone.html`

`controller-now-playing-iphone.html` is also a pure redirect shim.

Direct file-backed behavior:
- meta refresh to `controller-now-playing.html?iphone=1`
- JavaScript redirect to the same target

So the iPhone-specific now-playing experience is implemented as a mode of `controller-now-playing.html`, not as a separate file implementation here.

## 6. Alias shim: `controller-nowplaying-iphone.html`

`controller-nowplaying-iphone.html` is a simple alias redirect.

Direct file-backed behavior:
- meta refresh to `controller-now-playing-iphone.html`
- JavaScript redirect to the same target

So this is a compatibility/alternate-name shim, not an implementation page.

## Working family model

The current family model is:

### Substantive implementation pages
- `controller-now-playing.html`
- `controller-now-playing-tablet.html`
- `controller-now-playing-grid.html`

### Redirect / alias pages
- `controller-now-playing-ipad.html`
- `controller-now-playing-iphone.html`
- `controller-nowplaying-iphone.html`

That distinction should stay explicit so the wiki does not over-document wrappers as if they were implementation centers.

## Shared behaviors across the substantive variants

Across the three substantive pages, the repo shows recurring patterns such as:
- background art / blur presentation
- now-playing text and art rendering
- embedded-mode fallback handling when loaded in iframes
- queue modal infrastructure
- album modal infrastructure
- close/back behavior for embedded contexts
- controller-style CSS/shared visual language

This family clearly shares a large behavioral cluster even though the layouts differ.

## Important variant differences

## `controller-now-playing.html`
This page is the strongest mainline implementation and also carries the iPhone-specialized path through `iphone=1`.

That means it does double duty as:
- a main controller now-playing surface
- the iPhone-mode implementation target

## `controller-now-playing-tablet.html`
This page is the tablet-oriented substantive variant.

Its existence, plus the dedicated iPad redirect shim, makes the tablet role explicit rather than inferred.

## `controller-now-playing-grid.html`
This page is the grid/phone-oriented substantive variant.

It is not just a visual skin.
It is its own implementation page with its own layout branch.

## Relationship to kiosk and embedded behavior

This family intersects directly with the kiosk/embedded branch because the substantive now-playing pages include embedded-mode handling and modal/child-surface behavior that can be used in controller-hosted or kiosk-hosted flows.

This page should stay linked with:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`

## Relationship to queue and album drill-down behavior

These now-playing surfaces intersect directly with:
- queue access
- album modal behavior
- artist navigation
- playback control behavior

So this branch should stay linked with:
- `controller-queue-interface.md`
- `queue-wizard-internals.md`
- `api-playback-and-queue-endpoints.md`

## Anatomy companion page

Companion anatomy page:
- `controller-now-playing-anatomy.md`

Use that page when the real question is not “which now-playing variant is this?” but:
- which region inside `controller-now-playing.html` owns the thing I need to change?

## What this page is now confident about

The current repo supports these stronger statements:
- the now-playing family has three substantive implementation pages
- the iPad and iPhone named pages are redirect shims, not main implementation pages
- `controller-now-playing.html` carries the iPhone mode through `?iphone=1`
- `controller-nowplaying-iphone.html` is just an alias shim
- the family shares real behavioral DNA around art, modals, embedded handling, and controller-side now-playing presentation

## Relationship to other pages

This page should stay linked with:
- `tablet-interface.md`
- `phone-interface.md`
- `desktop-browser-interface.md`
- `controller-now-playing-anatomy.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-queue-interface.md`

## Current status

This page now gives the now-playing family a firmer structural map:
- substantive implementation pages versus shims
- main page versus tablet/grid variants
- iPhone mode as a query-param branch of `controller-now-playing.html`
- alias pages as actual redirects rather than pseudo-surfaces
