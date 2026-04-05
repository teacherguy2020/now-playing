# now-playing surface variants

## Purpose

This page documents the family of `controller-now-playing*` HTML surfaces in the `now-playing` ecosystem.

It exists because these files are clearly related, but they are not all equal in role. Repo inspection shows a mix of:
- core now-playing surfaces
- layout/device variants
- redirect shims
- alias/legacy-like wrappers

So this branch is best documented as a family first, rather than as a pile of separate unrelated pages.

## Why this page matters

The now-playing family appears to be one of the most visible surface clusters in the system.

These pages likely shape what users actually see when they focus on:
- album art
- title/artist/album identity
- next-up state
- queue access
- playback controls
- album/artist drill-down
- contextual artwork/personnel presentation

That makes this a high-value family to map clearly.

## Files currently in the family

Repo-visible files in this family include:
- `controller-now-playing.html`
- `controller-now-playing-tablet.html`
- `controller-now-playing-grid.html`
- `controller-now-playing-ipad.html`
- `controller-now-playing-iphone.html`
- `controller-nowplaying-iphone.html`

## Family classification

## 1. Core page: `controller-now-playing.html`

This currently appears to be the main canonical controller-now-playing surface.

Observed characteristics include:
- large integrated now-playing UI
- album art, artist, title, album, next-up, progress, controls
- embedded-mode handling via `embedded=1`
- queue modal with embedded `controller-queue.html`
- queue-wizard preview/apply calls for album actions
- direct playback control calls via `/config/diagnostics/playback`
- album/artist drill-down behavior
- iPhone-specific behavior when `iphone=1`
- art flip/personnel behavior in the iPhone-specific mode

This is clearly a real, substantial surface rather than a thin wrapper.

## 2. Tablet variant: `controller-now-playing-tablet.html`

This appears to be a device/layout variant of the same conceptual surface.

Observed characteristics include:
- very similar core structure and behavior to `controller-now-playing.html`
- queue modal with embedded `controller-queue.html`
- runtime config reads
- queue-wizard preview/apply calls
- album/artist drill-down behavior
- embedded pane close behavior via `np-kiosk-hide-pane`

But also:
- stronger larger-screen layout assumptions
- a more tablet-oriented presentation footprint
- less obvious iPhone-specific art-flip specialization than the iPhone path

So this looks like a true variant, not a redirect shim.

## 3. Grid variant: `controller-now-playing-grid.html`

This appears to be another substantive surface, not just a redirect.

Observed characteristics include:
- a now-playing surface with grid-like phone-layout logic
- queue modal and embedded queue loading
- runtime config read for track key
- playback and queue-wizard interactions
- album/artist drill-down behavior
- embedded mode awareness

This likely represents a layout/interaction variant rather than a separate conceptual feature.

## 4. Redirect shim: `controller-now-playing-ipad.html`

This file appears to be a thin redirect page.

Observed behavior:
- meta refresh to `controller-now-playing-tablet.html`
- JS redirect to the same target

So this is best treated as a compatibility/device-alias shim, not a primary implementation page.

## 5. Redirect shim: `controller-now-playing-iphone.html`

This file also appears to be a thin redirect page.

Observed behavior:
- meta refresh to `controller-now-playing.html?iphone=1`
- JS redirect to the same target

So the iPhone-specific now-playing experience is not implemented in this file directly.
Instead, it appears to be implemented as a mode of `controller-now-playing.html`.

## 6. Alias/typo shim: `controller-nowplaying-iphone.html`

This file appears to be a simple redirect alias.

Observed behavior:
- redirects to `controller-now-playing-iphone.html`

This is likely a spelling/backward-compatibility shim for callers using the older or alternate filename.

## Working family model

A good current interpretation is:

### Real substantive pages
- `controller-now-playing.html`
- `controller-now-playing-tablet.html`
- `controller-now-playing-grid.html`

### Redirect/alias pages
- `controller-now-playing-ipad.html`
- `controller-now-playing-iphone.html`
- `controller-nowplaying-iphone.html`

That distinction is useful because it prevents the wiki from over-documenting thin wrappers as if they were main implementation centers.

## Important shared behaviors across substantive variants

Across the substantive now-playing pages, repo inspection shows recurring patterns such as:
- album art and background art layering
- embedded mode handling
- queue modal with embedded `controller-queue.html?embedded=1`
- runtime config fetch for track key
- queue-wizard preview/apply flows for album-level actions
- direct playback control through `/config/diagnostics/playback`
- artist drill-down into `controller-artists.html`
- close-back behavior that posts `np-kiosk-hide-pane` when embedded

This suggests the family shares a lot of behavior even when layout differs.

## Important variant differences

### `controller-now-playing.html`
This appears to contain the richest iPhone-specific branch.

Observed clues include:
- `iphone=1` handling
- art flip card behavior
- personnel/back-face presentation in place of modal-heavy interaction

So this page may be doing double duty as:
- the main now-playing page
- the iPhone-specialized now-playing page via query-param mode

### `controller-now-playing-tablet.html`
This appears to be a larger-screen/device-specific adaptation with similar core interactions but more tablet-oriented layout assumptions.

### `controller-now-playing-grid.html`
This appears to emphasize a grid-style composition variant while still keeping much of the same underlying operational behavior.

## Relationship to kiosk and embedded behavior

This family intersects directly with the kiosk/embedded branch because:
- substantive now-playing pages honor `embedded=1`
- embedded close behavior uses `np-kiosk-hide-pane`
- queue access can happen inside an embedded modal/iframe flow
- these pages may be opened inside right-pane kiosk workflows

So this family should stay linked to:
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `controller-kiosk-mode.md`

## Relationship to queue and album drill-down behavior

These now-playing surfaces also intersect with:
- queue flows
- album-level track fetching
- album queue application
- artist navigation

That means they should eventually cross-link with future pages on:
- queue and playback control
- media library / album drill-down
- controller child page relationships

## Candidate future drill-down pages

The next likely branch pages from this family are:

### `controller-now-playing-core.md`
For the main substantive logic in:
- `controller-now-playing.html`

### `controller-now-playing-tablet-variant.md`
For tablet-specific layout and behavior differences.

### `controller-now-playing-grid-variant.md`
For the grid-specific layout variant.

### `controller-now-playing-iphone-mode.md`
For the `iphone=1` path inside `controller-now-playing.html`, especially the art-flip/personnel behavior.

## Architectural interpretation

A good current interpretation is:
- the `controller-now-playing*` family is a substantial, shared behavioral cluster with multiple presentation variants
- some filenames are implementation centers, while others are only routing aliases
- the family is tightly tied to queue access, embedded behavior, and album/artist drill-down flows

This makes it one of the more important families to keep organized as a group.

## Relationship to other pages

This page should stay linked with:
- `tablet-interface.md`
- `phone-interface.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- future queue/control pages
- future media-library pages

## Things still to verify

Future deeper verification should clarify:
- the exact behavioral delta between the main, tablet, and grid variants
- how much code is duplicated versus intentionally specialized across these files
- whether `controller-now-playing-grid.html` is actively used in live workflows or more experimental
- whether `controller-now-playing-tablet.html` is the main tablet now-playing path in practice
- how much of the iPhone behavior should be documented as part of `controller-now-playing.html` versus split into its own page

## Current status

At the moment, this page gives the now-playing family a clear structural map:
- substantive pages versus shims
- shared behaviors versus variant-specific behavior
- likely next drill-down pages

That is already enough to make the family much less confusing than a raw filename list.
