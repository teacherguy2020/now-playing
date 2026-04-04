# controller kiosk mode

## Purpose

This page is meant to capture how the controller family behaves when entered in kiosk mode.

It exists because repo inspection strongly suggests that much of the practical kiosk experience is controller-backed, not kiosk-isolated.

In other words, some of the most important kiosk behavior may actually live in controller pages and controller-side state handling rather than in kiosk-branded entrypoints alone.

## Why this page exists

From the current routing model:
- `kiosk.html` resolves kiosk profile state
- `kiosk.html` redirects into `controller.html`
- kiosk-branded aliases often redirect into controller-family pages

That means a complete understanding of kiosk behavior eventually requires documenting what controller pages do differently when kiosk mode is active.

## Current evidence

Current repo-visible evidence includes:
- `kiosk.html` redirecting into `controller.html`
- `kiosk=1` being set in redirected query parameters
- `preview=1` also being set during that launch path
- kiosk-related profile synchronization into controller-facing localStorage
- many kiosk entrypoints redirecting into controller-family pages
- explicit kiosk-mode handling inside `now-playing/controller.html`

That is enough to conclude that controller-side behavior is a core part of kiosk mode.

## Verified controller-side kiosk handling

Direct repo inspection of `now-playing/controller.html` now confirms that controller-side kiosk mode is real and explicit.

### Query-parameter-driven kiosk mode
`controller.html` defines:
- `IS_PREVIEW` when `preview=1`
- `IS_KIOSK_1280` when:
  - `kiosk=1`, or
  - `profile=1280x400`, or
  - `layout=1280x400`
- `IS_KIOSK_EDITOR` when kiosk mode is active and either:
  - `edit=1`, or
  - `designer=1`

This means kiosk behavior is not merely inferred. It is an explicit controller mode.

### Body classes and layout mode
When kiosk mode is active, `controller.html` adds:
- `kiosk1280`
- and optionally `kioskEditor`

The CSS in `controller.html` includes extensive rules for `body.kiosk1280`, including:
- a `1280×400` layout profile
- a hidden controls state when not in editor mode
- a `#kioskCanvas` grid layout
- specialized pane behavior for recent items and kiosk content panes
- right-pane iframe behavior for kiosk-linked pages

So the controller page itself contains substantial kiosk-specific layout logic.

### Controller profile integration
`controller.html` uses:
- `nowplaying.mobile.profile.v2`

and merges URL-driven overrides for things such as:
- `devicePreset`
- `theme`
- `colorPreset`
- `recentSource`
- custom color fields

This matches the kiosk launch path from `kiosk.html`, which synchronizes controller-facing profile state before redirecting.

### Kiosk controls inside `controller.html`
The page contains explicit kiosk UI elements such as:
- `#kioskCtl`
- `#kioskSizeSel`
- `#kioskPushBtn`
- `#kioskPushStat`
- `#kioskCanvas`

This strongly supports the idea that the controller page is not merely tolerating kiosk mode; it actively implements kiosk-specific control and layout behavior.

### Kiosk page routing inside controller mode
`controller.html` includes kiosk-oriented rows and internal routing for pages such as:
- `kiosk-playlists.html`
- `kiosk-artists.html`
- `kiosk-albums.html`
- `kiosk-genres.html`
- `kiosk-podcasts.html`
- `kiosk-radio.html`
- `kiosk-queue-wizard.html`
- `kiosk-queue.html`

It also contains logic that:
- opens kiosk pages in a right-side pane in some contexts
- remaps kiosk pages to controller pages
- loads those pages into `#kioskPaneFrame`
- passes along profile-oriented settings like `colorPreset`

That means controller-side kiosk mode is also a routing shell for kiosk-branded or kiosk-flavored subviews.

### moOde/display-target behavior from controller mode
`controller.html` also contains kiosk-related behavior around pushing display targets, including references to:
- `display.html?kiosk=1`
- moOde browser URL push behavior
- peppy-related start/ensure operations from kiosk interactions

So controller-side kiosk mode reaches beyond layout into runtime/display-target behavior as well.

## What this page should eventually explain

A mature version of this page should explain:
- what `controller.html` does when `kiosk=1`
- what `preview=1` changes, if anything
- how controller layout/behavior changes under kiosk mode
- how recent-source, theme, and color settings are applied
- which controller scripts/styles own kiosk-specific behavior
- how controller-based kiosk views differ from ordinary desktop/tablet/mobile controller usage

## Current working interpretation

The current working interpretation is now stronger:
- kiosk mode is explicitly a controller mode
- `controller.html` contains real kiosk-specific layout, routing, and push behavior
- the kiosk branch depends on controller-family implementation more than the filenames alone suggest
- controller-side behavior appears to be one of the main homes of real kiosk presentation logic

So this page is no longer just a conceptual placeholder. It is already pointing at an important implementation center.

## Relationship to other pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-scaffold.md`
- `kiosk-right-pane-routing.md`
- future controller-family pages such as tablet/mobile/desktop controller documentation

## Things still to verify

This page still needs deeper code-level verification of:
- the full behavioral effect of `preview=1`
- exactly when the right-side kiosk pane opens vs full navigation
- how much kiosk logic is self-contained in `controller.html` vs shared with external scripts
- whether the current live workflow uses all kiosk-mode branches or only a subset
- which controller-side kiosk features are actively used, transitional, or legacy
- how kiosk mode differs across desktop/tablet/mobile controller contexts when the same profile machinery is reused

## Current status

At the moment, this page is mostly a placeholder with a strong architectural claim:

> kiosk mode should not be understood only by reading kiosk-branded files; it also requires understanding controller-side mode behavior.

That claim is already well-supported enough to justify the page, even though deeper verification still needs to be done.
