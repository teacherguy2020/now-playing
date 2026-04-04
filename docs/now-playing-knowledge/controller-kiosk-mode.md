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

That is enough to conclude that controller-side behavior is a core part of kiosk mode.

## What this page should eventually explain

A mature version of this page should explain:
- what `controller.html` does when `kiosk=1`
- what `preview=1` changes, if anything
- how controller layout/behavior changes under kiosk mode
- how recent-source, theme, and color settings are applied
- which controller scripts/styles own kiosk-specific behavior
- how controller-based kiosk views differ from ordinary desktop/tablet/mobile controller usage

## Current working interpretation

The current working interpretation is:
- kiosk mode is at least partly a controller mode
- the kiosk branch depends on controller-family implementation more than the filenames alone suggest
- controller-side behavior is probably where much of the real kiosk presentation logic lives

That makes this page necessary even before all details are verified.

## Relationship to other pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- `controller-kiosk-scaffold.md`
- future controller-family pages such as tablet/mobile/desktop controller documentation

## Things still to verify

This page especially needs future code-level verification of:
- how `controller.html` reads kiosk query parameters
- which scripts/styles detect or react to kiosk mode
- whether kiosk mode changes navigation, layout, art treatment, source selection, or queue behavior
- whether there are controller-side assumptions shared with mobile/tablet profiles
- how much of kiosk mode is controlled through localStorage vs query params vs API state

## Current status

At the moment, this page is mostly a placeholder with a strong architectural claim:

> kiosk mode should not be understood only by reading kiosk-branded files; it also requires understanding controller-side mode behavior.

That claim is already well-supported enough to justify the page, even though deeper verification still needs to be done.
