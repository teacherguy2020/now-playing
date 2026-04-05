# desktop browser interface

## Purpose

This page describes the desktop/browser-oriented interface family in the `now-playing` ecosystem.

It exists because desktop browser usage is likely where the system can afford broader simultaneous visibility, richer layouts, and more exploratory interaction than on phone. At the same time, it may differ from tablet-oriented shells that use pane-rich controller logic or kiosk-adjacent behavior.

So the desktop browser branch deserves its own page rather than being treated as a default catch-all.

## Why the desktop browser interface matters

Desktop browser usage is often where users and operators can:
- see more of the system at once
- tolerate denser controls and richer navigation
- compare views more easily
- perform broader browsing, searching, or management tasks
- use configuration or diagnostics surfaces more comfortably

That means the desktop branch may be one of the best places to understand the system as a broad interactive environment rather than only a compact remote control.

## Important files

Likely important files include:
- `now-playing/app.html`
- `now-playing/controller.html`

Potentially related files over time:
- desktop-accessible controller child pages
- configuration/diagnostics surfaces
- display-adjacent pages when opened in general browsers

## Current working interpretation

At this stage, a good working interpretation is:
- the desktop/browser branch is a broad, flexible access path into the ecosystem
- it may overlap with controller-family logic, but it should not be assumed to behave exactly like tablet or phone shells
- desktop browser usage likely exposes more of the system’s breadth at once than smaller-device branches do

## Likely responsibilities of the desktop browser interface

The desktop branch is likely to be important for:
- broad browsing and orientation
- queue and playback management
- richer visibility into current state
- more spacious library/discovery workflows
- easier access to admin/config/diagnostic surfaces
- opening display-oriented or controller-oriented pages directly in a general browser context

## Relationship to other interface pages

This page should be read alongside:
- `tablet-interface.md`
- `phone-interface.md`
- `display-interface.md`
- `user-interfaces.md`

A useful current distinction is:
- desktop browser = spacious, broad, flexible browser access
- tablet = pane-rich controller shell
- phone = compact controller-first shell
- display = presentation-first surfaces

That distinction will need deeper verification later, but it is a strong starting frame.

## Likely implementation dimensions

The desktop browser branch will likely eventually need documentation for:
- `app.html` and its role
- how desktop browser usage overlaps with `controller.html`
- whether desktop-specific layout behavior is explicit or mostly emergent from responsive design
- which views are most naturally used on larger screens
- what control, browse, queue, search, and diagnostics affordances become more practical on desktop
- how browser-opened display or controller pages differ from dedicated kiosk/display deployments

## What this page should eventually explain in more detail

A mature desktop browser page should eventually explain:
- what the main desktop-facing entrypoints are
- how `app.html` relates to controller-family pages
- what larger-screen affordances materially change usage
- what tasks are easiest or most natural on desktop
- what files/functions/API routes matter most in desktop usage
- how desktop browser usage overlaps with admin/config surfaces

## Immediate follow-up questions for future drill-down

This page suggests several future verification tasks:
- what `app.html` actually does architecturally relative to `controller.html`
- whether desktop browser usage is the main home for any features that are awkward on phone/tablet
- how desktop usage interacts with display-oriented pages like `display.html`
- whether there are desktop-specific shell behaviors worth documenting apart from responsive layout
- which admin/diagnostic surfaces are most naturally part of the desktop branch

## Relationship to the rest of the wiki

This page should remain linked with:
- `user-interfaces.md`
- `architecture.md`
- `source-map.md`
- future pages for `app.html`
- future pages for config/diagnostics surfaces

## See also

- `tablet-interface.md`
- `phone-interface.md`
- `display-interface.md`
- `user-interfaces.md`

## Related branch pages

- `now-playing-surface-variants.md`
- `controller-device-alias-pages.md`
- `youtube-interface.md`
- `api-playback-and-queue-endpoints.md`

This is especially relevant when the desktop/browser question is really about the `controller-now-playing*` family rather than the broader browser shell.

`controller-device-alias-pages.md` is relevant when desktop/browser investigation overlaps with the device-named controller entry shims and how they normalize onto real controller shells.

`youtube-interface.md` is relevant when the browser task is specifically about YouTube search, playlist expansion, or queue ingestion rather than the broader shell.

`api-playback-and-queue-endpoints.md` is relevant when the browser question is really about the control-plane routes behind queue and playback actions rather than only about the shell itself.

## Current status

At the moment, this page is a structural hub for the desktop browser branch rather than a code-heavy implementation guide.

That is intentional.

Its role right now is to give the browser/desktop family an explicit place in the interface map so that future documentation can branch into `app.html`, controller overlap, and larger-screen workflows in an organized way.
