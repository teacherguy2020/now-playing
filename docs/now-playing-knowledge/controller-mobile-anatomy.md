# controller mobile anatomy

## Purpose

This page documents the internal anatomy of `now-playing/controller-mobile.html`.

It exists because `controller-mobile.html` should not be understood only as “the phone interface.”
It is a compact controller shell with its own layout priorities, interaction flow, and region-level responsibilities.

This page is meant to help future agents answer questions like:
- “if I need to change the mobile now-playing region, where do I start?”
- “where does quick search live in the mobile shell?”
- “how does queue access show up in controller-mobile?”
- “which parts are mobile-shell behavior versus shared controller behavior?”

## Why anatomy matters here

Mobile tasks tend to be phrased in region-level language, not page-level language.

People are likely to ask for things like:
- improve the compact now-playing block
- tweak the mobile queue entry
- change quick search behavior
- make recent content easier to scan
- alter the category rows
- adjust transport controls

Those are anatomy questions.

## High-level role of `controller-mobile.html`

A good current interpretation is:
- `controller-mobile.html` is the compact controller-first shell for phone usage
- it shares conceptual DNA with the tablet/controller branch
- but it is optimized for reduced simultaneous visibility and direct small-screen interaction
- it likely compresses or restructures features that appear more spaciously in tablet/desktop shells

So this page should be understood as a real shell with its own region-level responsibilities, not merely a smaller tablet layout.

## Main anatomical regions

The current mobile shell is best understood as these major regions:

1. compact now-playing header region
2. integrated transport controls
3. quick search strip
4. library/category list
5. recent-content region
6. queue and queue-adjacent entrypoints
7. modal/workflow regions
8. mobile layout/state orchestration

## 1. Compact now-playing header region

### What it is
This is the mobile shell’s top now-playing region.

Current visible anchors suggest a familiar controller-family structure, including elements like:
- `#npCard`
- `#npArtWrap`
- `#art`
- `#line1`
- `#line2`
- `#line3`

### What it does
This region provides the compact now-playing summary for mobile use:
- art
- title/artist/album identity
- current playback context
- likely immediate access into deeper now-playing behavior

### Why it matters
This is one of the most visible parts of the mobile shell and the place where “make the mobile page better” often really means “change the compact now-playing region.”

### Companion pages
- `controller-now-playing-anatomy.md`
- `playback-authority-by-mode.md`
- `playback-issue-triage-runbook.md`

## 2. Integrated transport controls

### What they are
The mobile shell includes integrated playback controls rather than outsourcing transport behavior entirely.

Current anchors suggest transport clusters such as:
- `#npCtrls`
- `#phone-controls`
- `data-np-act`

### What they do
These controls provide direct transport interaction in the compact mobile shell.

### Why they matter
This is one of the key places where mobile-specific interaction choices become visible:
- what is shown directly
- what is hidden until deeper navigation
- what must remain thumb-friendly and low-friction

### Companion pages
- `queue-and-playback-model.md`
- `api-playback-and-queue-endpoints.md`
- `playback-issue-triage-runbook.md`

## 3. Quick search strip

### What it is
The quick search region appears anchored by:
- `#homeQuickSearch`
- `#homeQuickResults`
- `.quickWrap`

### What it does
This region is the mobile shell’s fast entrypoint into browse/search/jump behavior.

### Why it matters
On mobile, quick search is often more important than broad simultaneous browsing. So changes here can materially alter the usability of the whole shell.

### Companion pages
- `source-map.md`
- future search/browse deeper mapping if added later

## 4. Library/category list

### What it is
The mobile shell includes a category/navigation list anchored by:
- `#libraryList`
- row-level structures such as `data-row-target`
- wrapped row behavior such as `data-row-wrap`

### What it does
This region appears to provide the main browse-entry structure for mobile, likely including familiar controller categories such as playlists, artists, albums, genres, podcasts, radio, queue wizard, live queue, and settings.

### Why it matters
This is one of the most likely places where mobile-specific prioritization differs from tablet and desktop shells.

### Companion pages
- `queue-wizard-internals.md`
- `controller-queue-interface.md`
- `api-playback-and-queue-endpoints.md`

## 5. Recent-content region

### What it is
The mobile shell appears to include a recent-content region, with anchors like:
- `#recentTitle`
- `#recentRail`
- `#recentPeekRail`
- `#railModeBtn`

### What it does
This region likely provides recent-content scanning and quick re-entry into recent albums/playlists/radio/podcasts or related content.

### Why it matters
This is one of the places where mobile can feel either efficient or cramped, so it is a likely future change target.

### Companion pages
- `tablet-interface.md`
- `controller-tablet-anatomy.md`

## 6. Queue and queue-adjacent entrypoints

### What they are
The mobile shell appears to contain queue-adjacent entrypoints through:
- list/category row targets
- queue-related wrapped rows or actions (`data-queue-act`)
- references to queue routes and queue-wizard routes
- likely entry into fuller queue surfaces such as `controller-queue.html`

### What they do
These are the mobile shell’s bridges into queue inspection, queue control, and queue shaping.

### Why they matter
A request like “improve mobile queue access” may belong to:
- a category row
- a quick action
- a modal/workflow region
- or the fuller queue surface opened from the mobile shell

### Companion pages
- `controller-queue-interface.md`
- `queue-wizard-internals.md`
- `queue-and-playback-model.md`
- `fragile-behavior-ownership.md`

## 7. Modal/workflow regions

### What they are
Current visible anchors suggest mobile shell workflow/modal regions overlapping with the controller family, including things like:
- `#audioInfoModal`
- `#recentAlbumModal`
- `#recentArtistModal`
- queue/album-related modal structures

### What they do
These regions likely support drill-down behavior that cannot comfortably fit into the primary compact layout.

### Why they matter
A request to improve mobile behavior may actually be about one of these modal/workflow paths rather than the main shell layout.

## 8. Mobile layout/state orchestration

### What it is
`controller-mobile.html` appears to contain page-level orchestration for compact layout, search/list/recent interplay, and queue/browse/navigation behavior in reduced space.

### Why it matters
This is the main reason a mobile anatomy page is useful: even when mobile shares controller-family concepts with tablet or desktop, the orchestration choices are different enough that the first file/function guess can easily be wrong.

## Practical “where do I start?” map

### If asked to improve the compact now-playing area
Open first:
- `#npCard`
- `#npArtWrap`
- `#art`
- `#line1`, `#line2`, `#line3`

### If asked to improve mobile transport controls
Open first:
- `#npCtrls`
- `#phone-controls`
- `data-np-act` wiring

### If asked to improve quick search
Open first:
- `#homeQuickSearch`
- `#homeQuickResults`
- `.quickWrap`

### If asked to improve category-row navigation
Open first:
- `#libraryList`
- row targets and wrapped row behavior
- any queue-related row actions

### If asked to improve recent-content scanning
Open first:
- `#recentRail`
- `#recentPeekRail`
- `#railModeBtn`

### If asked to improve mobile queue behavior
Open first:
- queue-related rows or quick actions in `controller-mobile.html`
- then `controller-queue.html` if the request really belongs to the fuller queue surface
- then route/queue-wizard companions if the request is really about queue truth or queue shaping

## Anatomy rule for future agents

For `controller-mobile.html`, do not assume a requested change belongs only to:
- CSS/layout
- the fuller now-playing page
- the fuller queue page
- or shared controller behavior

Always classify the target first:
- compact shell summary region
- shell transport region
- shell search/navigation region
- shell recent-content region
- queue entrypoint region
- modal/workflow region

That classification step should save wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `phone-interface.md`
- `controller-now-playing-anatomy.md`
- `controller-queue-interface.md`
- `queue-and-playback-model.md`
- `queue-wizard-internals.md`
- `source-map.md`
- `playback-issue-triage-runbook.md`
- `display-surface-troubleshooting.md`

## Current status

At the moment, this page gives the wiki its fifth real page-anatomy reference.

Its main job is making explicit that `controller-mobile.html` is not just a smaller tablet page.
It is a compact controller shell with its own:
- now-playing summary region
- transport region
- quick search strip
- category navigation
- recent-content area
- queue entrypoints
- and compact modal/workflow behavior.
