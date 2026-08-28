# controller now-playing anatomy

## Purpose

This page documents the internal anatomy of `now-playing/controller-now-playing.html`.

It exists because the `controller-now-playing*` family is one of the most visible surface clusters in the project, and the main `controller-now-playing.html` page is dense enough that branch-level documentation is not enough.

This page is meant to help future agents answer a question like:
- “if I need to change the next-up bar in `controller-now-playing.html`, where do I start?”

## Why anatomy matters here

`controller-now-playing.html` is not just “the now-playing page.”
It is a composite page with:
- album-art/flip-card behavior
- title/artist/album info region
- next-up bar
- progress bar
- integrated phone-style transport controls
- podcast seek affordances
- queue modal embedding
- album modal workflows
- personnel/artist-detail overlays
- embedded-mode back/close behavior

That means many real tasks are anatomy questions, not just branch questions.

## High-level role of `controller-now-playing.html`

A good current interpretation is:
- this is the main canonical controller-now-playing surface
- it is also the base page behind iPhone-mode behavior (`?iphone=1`)
- it behaves differently when embedded versus top-level
- it owns meaningful shell-side modal and queue-opening behavior itself

So this page should be understood as a substantive now-playing UI surface, not just a thin wrapper.

## Main anatomical regions

The current page anatomy is best understood as these major regions:

1. album art / art flip / favorite hotspot region
2. title / artist / album / file-info text stack
3. next-up bar
4. progress bar
5. integrated phone-style transport controls
6. artist-details / personnel overlay region
7. podcast modal family
8. album modal family
9. embedded queue modal family
10. embedded/top-level back navigation logic

## 1. Album art / art flip / favorite hotspot region

### What it is
This is the main visual now-playing region anchored by:
- `#album-art-wrapper`
- `#album-art`
- `#album-art-bg`
- `#art-info-hotspot`
- `#fav-heart`
- `#artBackText`

### What it does
This region presents the main art, supports art flip behavior for personnel/back text, and contains favorite/info affordances.

### Why it matters
This is one of the most visible regions in the page and one of the clearest places where now-playing truth, art behavior, personnel behavior, and phone-mode layout all meet.

### Important behavioral notes
Current visible logic shows:
- art-size forcing and runtime clamping
- art-flip behavior instead of modal behavior in iPhone mode
- favorite-heart display gating by mode
- different handling for radio / AirPlay / UPnP / podcast / pause states

### Companion pages
- `now-playing-surface-variants.md`
- `playback-authority-by-mode.md`
- `fragile-behavior-ownership.md`

## 2. Title / artist / album / file-info text stack

### What it is
This is the main textual now-playing stack, including:
- `#track-title`
- `#artist-link`
- `#album-link`
- `#file-info`
- `#file-info-text`
- `#mode-status`
- `#hires-badge`

### What it does
This region presents the text identity of the current item and likely reflects mode-sensitive playback truth.

### Why it matters
Many “now-playing looks wrong” issues actually surface here first rather than in the art itself.

### Companion pages
- `playback-authority-by-mode.md`
- `playback-issue-triage-runbook.md`

## 3. Next-up bar

### What it is
The next-up bar is anchored by:
- `#next-up`
- `#next-up-img-wrap`
- `#next-up-img`
- `#next-up-text`
- `#nextUpSpin`

### What it does
It provides the page’s visible Next Up summary region.

### Why it matters
This is one of the most likely anatomy regions to be affected by:
- queue truth
- Next Up truth
- Alexa-mode/path differences
- art fallback behavior
- queue modal opening behavior

### Important behavioral note
In the current page, clicking this region opens the queue modal by loading:
- `controller-queue.html?embedded=1`
into the queue iframe modal.

### Companion pages
- `controller-queue-interface.md`
- `queue-and-playback-model.md`
- `fragile-behavior-ownership.md`
- `playback-issue-triage-runbook.md`

### If asked to improve the next-up bar
Open first:
- `#next-up`
- queue modal opener logic
- Next Up render/update logic in the page/runtime scripts
- then queue/playback companion pages

## 4. Progress bar

### What it is
The progress region is anchored by:
- `#progress-bar-wrapper`
- `#progress-fill`

### What it does
It provides the page-level playback progress visualization.

### Why it matters
This is one of the clearest transport/progress regions and likely one of the first places where stream/podcast/local-file differences become visible.

## 5. Integrated phone-style transport controls

### What it is
The page includes a dedicated phone-style control cluster anchored by:
- `#phone-controls`
- `#activeCtlRing`
- `#activeCtlSymbol`
- `#btn-repeat`
- `#btn-prev`
- `#btn-play`
- `#btn-next`
- `#btn-shuffle`
- `#btn-seek-back`
- `#btn-seek-fwd`
- `#btn-seek-back-inline`
- `#btn-seek-fwd-inline`

### What it does
This region provides integrated playback controls directly inside the now-playing page.

### Why it matters
This is one of the strongest reasons the page is a substantive controller surface and not just a passive now-playing display.

### Important behavioral notes
Current visible structure shows:
- phone portrait layout assumptions
- special podcast seek affordances
- active control ring/symbol treatment
- repeat/shuffle on-state styling

### Companion pages
- `api-playback-and-queue-endpoints.md`
- `queue-and-playback-model.md`
- `playback-issue-triage-runbook.md`

## 6. Artist-details / personnel overlay region

### What it is
This region is anchored by:
- `#artist-details-container`
- `#artist-details`
- `#personnel-info`

### What it does
It appears to handle personnel or artist-details overlay behavior, especially in phone mode.

### Why it matters
This region overlaps with art flip/personnel behavior and can easily be confused with modal behavior elsewhere in the page.

## 7. Podcast modal family

### What it is
This modal family is anchored by:
- `#modalOverlay`
- `#modalThumb`
- `#modalTitle`
- `#modalSub`
- `#modalHint`
- `#epList`
- `#modalCount`
- `#modalRefresh`
- `#modalDeleteSelected`

### What it does
This appears to be the page’s podcast/episode modal workflow.

### Why it matters
A request to improve the now-playing page may actually be about this modal flow rather than the main now-playing card.

## 8. Album modal family

### What it is
The album modal family is anchored by:
- `#npAlbumModal`
- `#npAlbumCloseBtn`
- `#npAlbumArt`
- `#npAlbumTitle`
- `#npAlbumMeta`
- `#npAlbumTracks`
- `#npAlbumAppendBtn`
- `#npAlbumCropBtn`
- `#npAlbumReplaceBtn`

### What it does
This region provides album drill-down and album queue-action behavior directly from the now-playing page.

### Important behavioral notes
Current visible logic shows it uses:
- `/config/runtime` to obtain track key
- `/config/diagnostics/playback` for fallback album actions
- `/config/queue-wizard/preview` to fetch album tracks
- `/config/queue-wizard/apply` for album queue application modes

### Why it matters
This region is one of the strongest examples of the page bridging now-playing UI and queue-wizard behavior directly.

### Companion pages
- `queue-wizard-internals.md`
- `controller-queue-interface.md`
- `api-playback-and-queue-endpoints.md`

## 9. Embedded queue modal family

### What it is
The queue modal is anchored by:
- `#npQueueModal`
- `#npQueueCloseBtn`
- `#npQueueFrame`

### What it does
It opens the fuller queue UI by embedding:
- `controller-queue.html?embedded=1`

### Why it matters
This is the clearest structural bridge between the now-playing page and the fuller queue surface.

### Important implication
A request to improve queue behavior from the now-playing page may belong to:
- this modal opener behavior
- embedded queue presentation
- the queue surface itself
- or the route-backed truth behind both

## 10. Embedded/top-level back navigation logic

### What it is
The page includes explicit back/close logic tied to:
- `#cnpBack`
- `embedded=1`
- postMessage with `np-kiosk-hide-pane`

### What it does
This region determines whether the page navigates back normally or tells the parent kiosk/controller shell to hide the pane.

### Why it matters
This is one of the most important embedded-vs-top-level anatomy distinctions in the page.

### Companion pages
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `display-surface-troubleshooting.md`

## Practical “where do I start?” map

### If asked to improve album art / flip behavior
Open first:
- `#album-art-wrapper`
- `#art-info-hotspot`
- `#fav-heart`
- art flip/personnel wiring

### If asked to improve title/artist/album info
Open first:
- `#track-title`
- `#artist-link`
- `#album-link`
- `#file-info`

### If asked to improve the next-up bar
Open first:
- `#next-up`
- queue modal opener logic
- queue/playback companion pages

### If asked to improve progress or controls
Open first:
- `#progress-bar-wrapper`
- `#phone-controls`
- `#btn-play`, `#btn-prev`, `#btn-next`, `#btn-repeat`, `#btn-shuffle`
- podcast seek button logic if relevant

### If asked to improve album queue actions
Open first:
- `#npAlbumModal`
- `#npAlbumAppendBtn`
- `#npAlbumCropBtn`
- `#npAlbumReplaceBtn`
- queue-wizard preview/apply logic in the page

### If asked to improve queue opening behavior
Open first:
- `#npQueueModal`
- `#npQueueFrame`
- opener logic for `controller-queue.html?embedded=1`

## Anatomy rule for future agents

For `controller-now-playing.html`, do not assume a requested change belongs only to one of these:
- pure now-playing display logic
- queue logic
- transport logic
- embedded behavior
- modal behavior

Always classify the target first:
- page-owned display region
- page-owned transport region
- page-owned modal/workflow
- embedded child queue surface
- embedded-vs-top-level contract behavior

That classification step should save a lot of wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `now-playing-surface-variants.md`
- `controller-queue-interface.md`
- `queue-and-playback-model.md`
- `queue-wizard-internals.md`
- `api-playback-and-queue-endpoints.md`
- `playback-authority-by-mode.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `playback-issue-triage-runbook.md`
- `display-surface-troubleshooting.md`

## Current status

At the moment, this page gives the wiki its third real page-anatomy reference.

Its main job is making explicit that `controller-now-playing.html` is not just “the now-playing page.”
It is a multi-region controller surface with:
- art/personnel behavior
- text identity stack
- next-up bar
- progress and controls
- podcast/album modal workflows
- embedded queue modal behavior
- and embedded-vs-top-level navigation logic.
