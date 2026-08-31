# tablet kiosk shell differences

## Purpose

This page documents the ways `now-playing/controller-tablet.html` appears to differ from the main `controller.html` kiosk shell.

It exists because code inspection shows that the tablet shell is not merely a resized variant. In several important areas, it appears to implement a richer or more explicit kiosk-pane architecture.

## Why this page matters

Earlier drill-down pages uncovered some ambiguity in the kiosk pane contract:
- some messages were clearly emitted by child pages
- but the main controller shell did not always show equally clear handling for those messages

Inspection of `controller-tablet.html` helps resolve some of that ambiguity.

The tablet shell appears to be a more feature-complete or more explicit implementation in several kiosk-pane areas, including:
- pane message handling
- pane URL synchronization
- pane prewarming
- tablet-specific embedded child parameters
- tablet settings pane support

## Important file

Primary file:
- `now-playing/controller-tablet.html`

Related pages:
- `controller-kiosk-mode.md`
- `kiosk-right-pane-routing.md`
- `embedded-pane-contracts.md`
- `genre-pane-messaging.md`

## Shared foundations with `controller.html`

The tablet shell still shares a lot with the main controller shell.

Observed similarities include:
- `IS_KIOSK_1280`
- `IS_KIOSK_EDITOR`
- `kiosk1280` / `kioskEditor` body-class split
- `#kioskPane` and `#kioskPaneFrame`
- `openPage()` right-pane routing
- editor-mode push controls
- suppression of right-pane behavior when editor mode is active

So this is not a different architecture from scratch.
It is better understood as a tablet-specialized branch of the same general shell concept.

## Important differences

## 1. Explicit handling of `np-kiosk-pane-genre`

This is one of the clearest differences.

In `controller-tablet.html`, the window message handler explicitly handles:
- `np-kiosk-pane-genre`

Observed behavior:
- confirm the message came from the active pane iframe
- confirm the pane is currently open
- if the pane value starts with `kiosk-`, call:
  - `syncPaneUrlParam(pane, { genre })`

This is important because it gives us a confirmed parent-side consumer for the semantic genre message.

That makes the tablet shell a key reference point for understanding how pane messages are intended to work.

## 2. Pane URL synchronization

The tablet shell uses:
- `syncPaneUrlParam(...)`

Observed uses include:
- syncing genre context from pane messages
- clearing pane-related URL state when the pane closes

This suggests the tablet shell treats the pane not only as an iframe, but also as part of the top-level navigable application state.

That is a stronger shell model than “just open a child page.”

## 3. Explicit pane close cleanup

When closing the pane, `controller-tablet.html` does more than hide the iframe.

Observed behavior includes:
- removing the pane open class/state
- clearing nav open state
- calling:
  - `syncPaneUrlParam("", { genre: "" })`

So the tablet shell actively resets pane-related URL state on close.

## 4. Additional embedded child parameters

When loading pane content, the tablet shell passes more context than the main controller shell.

Observed pane query parameters include:
- `embedded=1`
- `cols=7` in tablet-landscape contexts
- `theme`
- `colorPreset`
- `apiBase`

The `apiBase` parameter is especially notable.

It suggests embedded children in the tablet shell may rely on an explicitly injected API base rather than always deriving it implicitly.

That is a meaningful shell-level enhancement.

## 5. Tablet settings pane support

The tablet shell includes an additional pane mapping:
- `kiosk-settings.html` → `controller-tablet-settings.html`

It also passes extra settings-oriented query parameters such as:
- `recentRows`
- `vizPreset`

This suggests the tablet shell has a broader concept of pane-embedded settings/configuration views than the main controller shell path we inspected.

## 6. Pane prewarming

The tablet shell contains explicit prewarming helpers such as:
- `prewarmPaneRoute(page)`
- `prewarmPaneData()`

Observed prewarming behavior includes:
- creating hidden offscreen iframes for pane routes
- prefetching data from endpoints such as:
  - `/config/library-health/albums`
  - `/config/queue-wizard/playlists`
  - `/config/queue-wizard/radio-favorites`
  - `/podcasts`

This is a major difference.

It means the tablet shell is more proactive about perceived speed and responsiveness in pane-based workflows.

## 7. Broader pane routing model

The tablet shell still uses a map from kiosk pages to controller pages, but it appears a bit broader and more mature.

Observed pane mappings include:
- `kiosk-now-playing.html` → `controller-now-playing.html`
- `kiosk-playlists.html` → `controller-playlists.html`
- `kiosk-artists.html` → `controller-artists.html`
- `kiosk-albums.html` → `controller-albums.html`
- `kiosk-genres.html` → `controller-genres.html`
- `kiosk-podcasts.html` → `controller-podcasts.html`
- `kiosk-radio.html` → `controller-radio.html`
- `kiosk-queue-wizard.html` → `controller-queue-wizard.html`
- `kiosk-queue.html` → `controller-queue.html`
- `kiosk-settings.html` → `controller-tablet-settings.html`
- `visualizer.html` → `visualizer.html`

That `kiosk-settings` path is one of the clearest hints that the tablet shell is more operationally expansive.

## 8. Visualizer handling remains rich

As with the main controller shell, the tablet shell includes special visualizer handling.

Observed behavior includes:
- consulting `/peppy/last-profile`
- overriding visualizer params when display mode is `visualizer`
- routing back through pane-aware navigation behavior

So the tablet shell preserves the same visualizer sophistication while adding stronger shell coordination around it.

## Working interpretation

A good current interpretation is:
- `controller-tablet.html` is not just a tablet layout variant
- it appears to be a more explicit or more evolved kiosk-pane shell in some areas
- it provides clearer evidence for how semantic pane messaging is meant to be handled
- it adds shell-level capabilities like prewarming, URL-state sync, and settings-pane support

This makes it a particularly valuable reference file when documenting the kiosk/controller architecture.

## Concrete example: genre pane flow on tablet shell

The tablet shell helps clarify the genre message flow:
1. embedded child emits `np-kiosk-pane-genre`
2. tablet shell verifies the message came from the active pane iframe
3. tablet shell updates pane URL state via `syncPaneUrlParam(...)`
4. pane state therefore becomes more durable/inspectable at the shell level

That is much clearer than the more ambiguous handling in the main controller shell snippet we inspected earlier.

## Architectural implication

This suggests an important documentation rule going forward:

> when documenting kiosk/controller behavior, do not assume `controller.html` and `controller-tablet.html` are interchangeable.

They overlap heavily, but the tablet shell may be the better source of truth for some pane-contract features.

## Relationship to other pages

This page should stay linked with:
- `genre-pane-messaging.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`
- future tablet-interface documentation

## Things still to verify

Future deeper verification should clarify:
- whether the tablet shell is the primary live kiosk shell in current practice
- whether the main controller shell should eventually gain all of the tablet shell’s pane-state behavior
- whether pane prewarming is tablet-only for performance reasons or just implemented there first
- whether `apiBase` is required for only some child pages or is part of a broader tablet-shell contract
- how much the tablet shell differs from `controller-mobile.html` in kiosk/pane behavior

## Current status

At the moment, this page establishes `controller-tablet.html` as an especially important shell variant for understanding advanced kiosk-pane behavior.

That is useful because it gives the wiki a sharper answer when message handling or pane coordination looks ambiguous in the main controller shell: sometimes the tablet shell is where the behavior is currently clearest.
