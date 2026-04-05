# phone interface

## Purpose

This page describes the phone-oriented interface family in the `now-playing` ecosystem.

It exists because phone usage should not be treated as just a smaller tablet or desktop experience. A phone-oriented controller surface usually has different constraints around:
- touch density
- navigation depth
- one-handed use
- reduced simultaneous visibility
- when to navigate versus when to embed or layer content

So the phone branch deserves its own interface page even before all implementation details are mapped exhaustively.

## Why the phone interface matters

Phone usage is often the most immediate and practical control path in a live system.

A phone-oriented interface is likely where the system has to make the sharpest tradeoffs around:
- quick access versus depth
- queue/control speed versus browse richness
- compact presentation versus information density
- direct navigation versus multi-pane interaction

That makes the phone interface important not only as a layout variant, but as a different interaction philosophy.

## Important files

Likely primary file(s):
- `now-playing/controller-mobile.html`

Related controller-family files likely relevant over time:
- `controller.html`
- shared controller child pages such as queue, albums, artists, playlists, radio, podcasts, and now-playing views

## Current working interpretation

At this stage, a good working interpretation is:
- the phone interface is a controller-first branch optimized for small-screen direct interaction
- it likely shares substantial implementation DNA with tablet/controller shells
- but it should not be assumed to implement the same pane-rich behavior in the same way

This is especially important because some kiosk and pane contracts may be:
- shared
- partially shared
- or deliberately simplified on phone

## Likely responsibilities of the phone interface

The phone-oriented branch is likely to prioritize:
- now-playing visibility
- transport controls
- queue access
- fast browse entrypoints
- lightweight transitions between controller subviews
- compact settings/profile-aware presentation where needed

It may still overlap with kiosk/controller architecture, but probably with fewer simultaneous visible regions than tablet-oriented shells.

## Relationship to other interface pages

This page should be read alongside:
- `tablet-interface.md`
- `user-interfaces.md`
- future `desktop-browser-interface.md`

A useful conceptual distinction is:
- tablet = pane-rich, broader orchestration shell
- phone = compact, direct, controller-first shell

That distinction should be verified in more detail later, but it is a good starting hypothesis.

## Likely implementation dimensions

The phone interface will likely eventually need documentation for:
- primary shell HTML (`controller-mobile.html`)
- compact layout and mode classes
- profile/theme handling
- how browse pages are reached on small screens
- how queue and now-playing views are prioritized
- whether embedded child behavior is reused or simplified
- how much kiosk-oriented logic is shared with larger controller shells

## What this page should eventually explain in more detail

A mature phone interface page should eventually explain:
- what the main shell regions or modes are
- what the default landing experience is
- how navigation differs from tablet/desktop
- what features are promoted or demoted on phone
- what controller pages or child views it reuses
- what files/functions/API routes matter most for the phone shell
- how phone behavior overlaps with or diverges from kiosk/pane behavior

## Immediate follow-up questions for future drill-down

This page suggests several future verification tasks:
- how `controller-mobile.html` differs structurally from `controller-tablet.html`
- whether phone uses pane embedding at all, or favors full navigation
- how profile and theme logic is shared across controller variants
- whether phone-specific queue or now-playing behavior is materially different
- how much of the phone shell is optimized for quick control versus media-library browsing

## Relationship to the rest of the wiki

This page should remain linked with:
- `user-interfaces.md`
- `source-map.md`
- future queue/playback-control pages
- future media-library pages
- future controller-family comparison pages

## See also

- `tablet-interface.md`
- `desktop-browser-interface.md`
- `youtube-interface.md`
- `user-interfaces.md`

## Current status

At the moment, this page is a structural hub for the phone branch rather than a code-heavy implementation guide.

That is intentional.

Its role right now is to establish the phone interface as a first-class part of the interface map, so that future work can drill into it with the same seriousness we have started applying to the tablet and kiosk branches.
