# embedded pane contracts

## Purpose

This page describes the practical contract between controller-side kiosk right-pane routing and the child pages loaded inside that pane.

It exists because right-pane routing is not just an iframe trick. The embedded child pages appear to cooperate with the parent shell through:
- query parameters
- embedded-specific CSS/layout behavior
- postMessage signals
- theme/color/profile propagation

That means there is a real interface contract here, even if it is informal.

## Parent-side setup

From controller-side kiosk routing, embedded pane pages are typically loaded with query parameters such as:
- `embedded=1`
- `theme=<theme>`
- `colorPreset=<preset>`
- `cols=7` in some iPad-landscape contexts

This suggests the parent shell expects child pages to:
- recognize embedded mode
- compact their layout appropriately
- adopt the intended theme/palette
- behave differently from full-page navigation mode

## Common embedded-mode pattern in child pages

Direct repo inspection shows that many controller-family pages do in fact respond to `embedded=1`.

Observed examples include:
- `controller-playlists.html`
- `controller-artists.html`
- `controller-albums.html`
- `controller-genres.html`
- `controller-podcasts.html`
- `controller-radio.html`
- `controller-queue-wizard.html`
- `controller-queue.html`
- `controller-now-playing.html`
- `visualizer.html`

## Embedded layout adaptation

A common pattern is:
- detect `embedded=1`
- add `body.embedded`
- optionally add `embeddedWide` when `cols=7`

This gives the child page a mode switch for compact rendering.

Observed effects include:
- transparent backgrounds
- reduced padding
- smaller title/meta text
- tighter grids
- hidden or reduced controls in some views
- pane-friendly dimensions and spacing

So one major contract is:

> when loaded with `embedded=1`, child pages should render like pane content rather than like full standalone pages.

## Theme and color propagation

Many of the embedded-capable child pages also read query parameters such as:
- `theme`
- `colorPreset`

And some also reconcile those with stored/shared profile state.

This implies another contract:

> the parent shell owns the pane’s intended look-and-feel, and child pages should honor that look by applying the incoming theme/palette settings.

This is visible across pages such as playlists, artists, albums, podcasts, radio, queue-wizard, and queue.

## Close-the-pane contract

A very common embedded behavior is:
- when a child page would normally go “back” or finish navigation, it posts:
  - `window.parent?.postMessage({ type:'np-kiosk-hide-pane' }, '*')`

This appears in multiple controller-family pages.

That means a core contract is:

> embedded child pages should ask the parent kiosk shell to close the pane instead of navigating the whole page away.

This is one of the clearest signs that the embedded pane system is an intentional architecture, not an accidental embedding.

## Richer child-to-parent messages

Some embedded pages send messages beyond simple close requests.

Observed examples include:
- `controller-genres.html`
- `controller-albums.html`

These can post messages such as:
- `np-kiosk-pane-genre`

This suggests the parent/child relationship may support pane-internal drill-down coordination, not just open/close behavior.

A good working interpretation is:
- some child pages can tell the parent shell to refine or redirect pane content based on a selected entity such as genre

That should be explored further later.

## `controller-now-playing.html` special behavior

`controller-now-playing.html` shows a slightly different embedded pattern.

Observed clues include:
- embedded checks in its own UI mode logic
- a back/close path that posts `np-kiosk-hide-pane` when embedded
- an internal iframe load of `controller-queue.html?embedded=1`

This suggests that some child pages are themselves capable of embedding other child pages, or at least reusing the same embedded contract for subviews.

## `visualizer.html` special behavior

`visualizer.html` has distinct embedded handling.

Observed behavior includes:
- treating `embedded=1` as a force-pure-visual mode trigger
- reducing or changing HUD/controls behavior in embedded mode
- using embedded mode as part of kiosk/display logic
- allowing a click/tap in embedded mode to open the full-screen visualizer

So visualizer participates in the embedded contract, but with a more display-specific interpretation than the controller list/grid pages.

## Working embedded-pane contract

A useful current summary of the contract is:

### Parent shell responsibilities
- decide when pane mode is active
- map kiosk pages to child targets
- load child targets with `embedded=1`
- pass along theme/color/layout hints
- listen for child messages such as `np-kiosk-hide-pane`

### Child page responsibilities
- detect `embedded=1`
- switch to pane-appropriate layout/styling
- honor theme/color/layout hints
- avoid full-page back navigation when embedded
- notify the parent when the pane should close
- in some cases, send richer pane-control messages

## Why this matters

This page matters because it changes how the kiosk system should be understood.

The right-pane flow is not just:
- parent opens iframe

It is more like:
- parent and child pages participate in a lightweight embedded-surface protocol

That makes the embedded contract one of the more important hidden architectural layers in kiosk mode.

## Relationship to other pages

This page should stay linked with:
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`
- `kiosk-interface.md`
- future page-specific drill-down docs for child pages loaded in the pane

## Things still to verify

Future deeper verification should clarify:
- whether all embedded-capable pages implement the same close/navigation rules
- whether there are more parent/child message types beyond the ones already observed
- whether embedded mode affects data loading semantics, not just layout
- whether embedded child pages expect more parent-side CSS or post-load DOM mutation than currently documented
- whether there is a stable enough pattern to formalize this as a reusable interface guideline

## Current status

At the moment, this page establishes that kiosk pane embedding already behaves like a real cross-page contract.

That is a useful architectural insight because it means future changes to kiosk mode should be evaluated not only page-by-page, but also in terms of whether they preserve the parent/child pane contract.
