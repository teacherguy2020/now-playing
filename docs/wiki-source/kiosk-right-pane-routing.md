---
title: kiosk-right-pane-routing
page_type: child
topics:
  - kiosk
  - display
  - controller
  - runtime
confidence: high
---

# kiosk right-pane routing

## Purpose

This page describes the right-pane kiosk routing behavior inside `now-playing/controller.html`.

This is an important drill-down because controller-side kiosk mode does not simply navigate away to every destination. In at least some contexts, it opens kiosk-related subviews inside an embedded right-side pane.

That makes right-pane routing a core part of how kiosk mode actually works in practice.

## Why this page matters

Without this page, it is easy to think kiosk navigation is just:
- open kiosk page
- redirect to controller page
- done

But repo inspection shows a more nuanced behavior:
- some kiosk targets open in a dedicated right-side pane
- some remap to controller pages before loading
- some navigate directly instead
- behavior depends on kiosk mode and device/layout context

## Core decision: open in right pane or not

`controller.html` defines:

- `shouldOpenInRightPane()`

Current repo-visible behavior:
- returns true when:
  - `IS_KIOSK_1280 && !IS_KIOSK_EDITOR`, or
  - `document.body.classList.contains('ipad11Landscape')`

This means right-pane routing is specifically associated with:
- active 1280×400 kiosk mode outside editor mode
- iPad 11 landscape behavior

So the right pane is not a universal controller behavior. It is a mode-sensitive layout behavior.

## Main entrypoint: `openPage(page)`

The central logic appears to live in:
- `openPage(page)`

This function governs what happens when a row with a `data-page` target is activated.

## Toggle behavior

If right-pane mode is active and the same kiosk row is clicked again:
- the pane closes instead of reloading the same content

This is implemented by checking whether:
- the pane is already open
- the clicked row is already marked as open

That means kiosk right-pane navigation acts partly like a toggleable side panel.

## Behavior when right-pane mode is NOT active

If right-pane mode is not active and the target page starts with `kiosk-`:
- the code navigates with slide transition to the corresponding controller page
- using a `kiosk-` → `controller-` filename rewrite

So outside right-pane contexts, kiosk pages behave more like navigation aliases than embedded panes.

## Behavior when right-pane mode IS active

If right-pane mode is active and the page starts with `kiosk-` — or is `visualizer.html` — controller mode loads content into the right pane.

Observed mapping table includes:
- `kiosk-now-playing.html` → `controller-now-playing.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-queue.html` → `controller-queue.html`
- `visualizer.html` → `visualizer.html`

This confirms that the right pane is largely controller-backed, even when the user interacts with kiosk-named rows.

## Right-pane loading mechanism

The pane appears to use:
- `#kioskPane`
- `#kioskPaneFrame`

Controller builds a URL for the mapped target and then adds query parameters such as:
- `embedded=1`
- `cols=7` for iPad landscape
- `theme=<profile theme>`
- `colorPreset=<profile color preset>`

Then it loads the resulting URL into `#kioskPaneFrame`.

This is important because it shows the pane is not just generic navigation. It is embedding a presentation-configured subview.

## Special handling for visualizer

`visualizer.html` gets special treatment.

Controller-side logic attempts to populate visualizer parameters such as:
- `preset`
- `energy`
- `motion`
- `glow`

And it may prefer the latest designer-applied profile from:
- `/peppy/last-profile`

This makes the right pane not only a navigation container, but also a place where display-mode-specific state is injected into embedded content.

## Pane-open state management

When opening a right-pane target, controller-side logic also:
- marks the relevant nav row as open
- adds `paneOpen` to `recentWrap`
- opens `#kioskPane`
- sets `aria-hidden="false"`

When closing the pane, it:
- removes the `open` class
- restores `aria-hidden="true"`
- removes `paneOpen` from `recentWrap`
- clears the open-row state
- resets the iframe to `about:blank` after a short delay

So the right pane has a distinct UI lifecycle, not just a one-off iframe load.

## Message-based pane closing

`controller.html` also listens for window messages and closes the pane when it receives:
- `type: 'np-kiosk-hide-pane'`

This suggests embedded pane content can request that the outer kiosk shell close the pane.

That is a meaningful integration contract between controller-shell kiosk mode and embedded subviews.

## Deep-linking behavior

On startup, controller-side code also checks for:
- `open=<kiosk-page>`

If kiosk 1280 mode is active and not in editor mode, it can auto-open a kiosk pane page shortly after load.

This means right-pane routing is also part of deep-link and startup behavior, not only click navigation.

## Working interpretation

A good current interpretation is:
- the right pane is one of the main ways kiosk mode composes subviews
- kiosk-named rows often become embedded controller-backed subpages
- the controller shell manages pane lifecycle, row state, theming, and embedding parameters
- this is one of the clearest places where kiosk mode becomes a true controller-shell experience rather than a simple redirect workflow

## Relationship to other pages

This page should stay linked with:
- `controller-kiosk-mode.md`
- `kiosk-launch-and-routing.md`
- `kiosk-interface.md`
- `embedded-pane-contracts.md`
- future detailed pages for `controller-now-playing`, queue, artists, albums, and visualizer behavior

## Things still to verify

Future deeper verification should clarify:
- exactly which contexts prefer full navigation over pane embedding
- how embedded child pages react to `embedded=1`
- whether all mapped controller pages are designed equally well for pane mode
- how much styling/layout compaction comes from the parent shell versus the embedded child page
- whether the right-pane model is central to the live workflow or only one of several kiosk interaction patterns

## Current status

At the moment, this page establishes the right-pane flow as a first-class part of kiosk-mode architecture.

That matters because it shows that kiosk navigation is not merely a list of redirects — it is also a pane-based controller shell with embedded subviews and mode-aware routing.
