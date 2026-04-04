# controller kiosk scaffold

## Purpose

This page describes `now-playing/controller-kiosk.html`, which appears to be a separate kiosk/controller scaffold rather than the main kiosk launch path.

Unlike `kiosk.html`, which behaves as a launcher/profile bridge into `controller.html`, `controller-kiosk.html` appears to implement its own direct layout and API interactions.

That makes it important to document separately.

## Why this page exists

Repo inspection suggests that `controller-kiosk.html` is architecturally different from both:
- `kiosk.html`
- the thin `kiosk-*.html` redirect shims

It looks more like a standalone or prototype kiosk/controller surface with its own fixed layout and direct runtime calls.

## Observed structure

Repo-visible characteristics include:
- fixed `1280×400` layout
- three-pane design
  - sources pane
  - list pane
  - now playing pane
- direct styling in the page
- direct JavaScript embedded in the page
- direct calls to app-host APIs on `:3101`

This is a different implementation style from a simple redirect or thin launcher page.

## Observed responsibilities

### Source selection
The page visibly includes source buttons such as:
- library
- playlists
- radio
- podcasts
- YouTube
- queue

This suggests it is trying to present a compact kiosk/controller browsing shell.

### List loading
Repo inspection shows that it updates a central list area and currently handles at least:
- queue data
- playlists data

with placeholder text suggesting additional browsing wiring was intended or expected later.

### Now playing display
The page fetches now-playing information and displays:
- title
- artist
- album
- artwork

This makes it both a browse/control surface and a now-playing surface.

### Queue actions
The page visibly includes action buttons such as:
- Append
- Crop
- Replace

That suggests a queue-manipulation role as well, though more verification is needed around the actual button behavior and completeness.

## Observed API usage

Repo inspection shows direct calls to endpoints including:
- `/config/runtime`
- `/now-playing`
- `/config/diagnostics/queue`
- `/config/queue-wizard/playlists`

This is significant because it means the page talks directly to app-host APIs instead of merely routing elsewhere.

## Architectural interpretation

A useful current interpretation is:
- `controller-kiosk.html` is a direct kiosk/controller scaffold or experiment
- it is not the same thing as the main `kiosk.html` launch path
- it may represent either:
  - a prototype/phase implementation
  - a specialized alternative kiosk/controller surface
  - a legacy path that still documents important intent

The page itself even labels part of the UI as:
- `1280x400 kiosk scaffold (phase 1)`

which strongly suggests prototype or scaffold status.

## Relationship to the rest of the kiosk branch

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- future controller-side kiosk behavior documentation

because it helps distinguish:
- launch/routing-based kiosk behavior
from
- direct standalone kiosk/controller implementation

## Things still to verify

Future deeper documentation should verify:
- whether `controller-kiosk.html` is active in the current live workflow
- how complete the source browsing behavior really is
- whether the append/crop/replace actions are fully wired
- whether this scaffold is still evolving, deprecated, or partially superseded by `kiosk.html` + controller routing
- what scripts/routes or future pages replaced or absorbed its intended responsibilities

## Current status

At the moment, this page establishes `controller-kiosk.html` as a distinct kiosk/controller scaffold with direct layout and API behavior.

That distinction matters because otherwise the kiosk branch looks more uniform than it really is.
