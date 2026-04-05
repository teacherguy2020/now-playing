# app shell anatomy

## Purpose

This page documents the internal anatomy of `now-playing/app.html`.

It exists because `app.html` is one of the most important pages in the project, but it is too large and too mixed in responsibility to be understood only as:
- “the desktop/browser shell”
- or “the page that hosts other pages in an iframe”

That is true, but incomplete.

`app.html` also has its own substantial shell-side UI regions, cards, controls, modals, state synchronization logic, and route-backed behavior.

This page is meant to help future agents answer a question like:
- “where do I start if I need to change the queue card in `app.html`?”

## Why anatomy matters here

`app.html` is not just an outer frame.

It includes:
- shell navigation
- status pills
- hero transport
- a substantial hero queue card
- moOde/Peppy/display actions
- embedded iframe hosting
- shell-to-frame theming/normalization logic
- queue-related modals and subflows

That means many real tasks are not “work on `app.html`” in the abstract.
They are:
- improve the queue card
- tweak the transport strip
- change the status pills
- alter display-push controls
- adjust iframe sizing/normalization

This page exists to make those subregions explicit.

## High-level role of `app.html`

A good current interpretation is:
- `app.html` is the broad desktop/browser shell of the system
- it hosts child surfaces in `#appFrame`
- but it also owns meaningful shell-side UI outside the iframe
- some of that shell-side UI is operationally important and route-backed

So `app.html` should be understood as both:
- a shell/container page
- and a page with its own first-class behavior

## Main anatomical regions

The current page anatomy is best understood as these major regions:

1. hero transport strip
2. hero queue card
3. top tabs / page routing bar
4. display / Peppy / moOde action controls
5. status pill strip
6. iframe-hosted child surface (`#appFrame`)
7. queue modal family
8. shell-to-frame theme / normalization / sizing logic

## 1. Hero transport strip

### What it is
The hero transport strip is the shell-side “Now Playing” summary/control area anchored by:
- `#heroTransport`
- `scripts/hero-transport.js`

### What it appears to do
It presents shell-level playback summary state and likely acts as one of the first visible summaries of what is currently playing.

### Why it matters
This strip is one of the first places where playback truth becomes visible in the shell. It is also one of the places where Alexa-mode and other playback-state interpretation can become visible to the operator.

### Key ownership anchors
- DOM anchor: `#heroTransport`
- supporting script: `scripts/hero-transport.js`
- companion pages:
  - `desktop-browser-interface.md`
  - `playback-authority-by-mode.md`
  - `fragile-behavior-ownership.md`

## 2. Hero queue card

### What it is
The hero queue card is the shell-side queue interface inside `app.html`.

This is one of the most important anatomy discoveries:
- the queue card is not just a link to `controller-queue.html`
- it is a real shell-side queue UI with its own markup, render logic, actions, and modal flows

### Main DOM anchors
Important markup and control anchors include:
- `#heroQueueCard`
- `#heroQueueWrap`
- `#heroQueueNextUp`
- `#heroQueueToggle`
- `#heroQueueShuffle`
- `#heroQueueClear`
- `#heroQueueCrop`
- `#heroQueueSavePlaylist`
- `#heroQueueApplyFilter`
- `#heroQueueSavePresets`
- `#heroQueueRouteAlexa`
- `#heroQueueArrowKeys`
- `#heroQueueConsume`
- `#heroQueueCrossfade`
- `#heroQueueBusyOverlay`

### Main logic center
The main behavioral center of the queue card is:
- `async function syncHeroQueue()`

This is the first function a new agent should read if asked to improve the queue card.

### What `syncHeroQueue()` does
Current evidence shows it:
- fetches runtime track key when needed through `/config/runtime`
- fetches queue truth through `/config/diagnostics/queue`
- fetches playback summary through `/now-playing`
- fetches next-up truth through `/next-up`
- fetches Alexa was-playing state through `/alexa/was-playing`
- handles collapsed vs expanded queue behavior differently
- derives and renders Next Up state
- handles Alexa-mode-specific next-up logic
- renders queue rows inside `#heroQueueWrap`
- manages rating-filter-based queue behavior
- preserves some shell-side queue state/signatures to avoid unnecessary or racey repaint behavior

### Important implication
The queue card is a mixed responsibility region:
- **page-owned UI** in `app.html`
- backed by **route-owned truth** from queue/playback endpoints
- with **fragile behavior overlap** involving Next Up, Alexa mode, and mode-sensitive playback interpretation

### Related modals and drill-down flows
The queue card also owns queue-related modal subflows including:
- `openQueueAlbumModal(...)`
- `openArtistAlbumsModal(...)`
- `openQueueTrackMetaModal(...)`
- queue modal close behavior via `closeQueueAlbumModal()`

### Why this matters
If someone asks to improve the queue card, the change may actually belong to:
- shell-side queue rendering
- queue row interactivity
- Next Up presentation
- queue action buttons
- queue-related modals
- or backend route truth rather than shell rendering

### Companion pages
- `controller-queue-interface.md`
- `queue-and-playback-model.md`
- `queue-wizard-internals.md`
- `api-playback-and-queue-endpoints.md`
- `playback-authority-by-mode.md`
- `fragile-behavior-ownership.md`

### If asked to improve the queue card
Open first:
1. `app.html` and search for `heroQueue`
2. `syncHeroQueue()`
3. the `heroQueue*` button wiring block
4. queue modal helpers (`openQueueAlbumModal`, `openArtistAlbumsModal`, `openQueueTrackMetaModal`)
5. then `controller-queue.html` only if the requested behavior overlaps the fuller queue surface

## 3. Top tabs / page routing bar

### What it is
The top tabs are the shell routing/navigation region anchored by:
- `#appTabs`

Current visible pages include tabs for:
- Config
- Diagnostics
- Alexa
- Library
- Queue Wizard
- Radio
- Podcasts
- YouTube
- Displays
- Theme

### What it does
This region controls which major child page is loaded into the iframe shell.

### Why it matters
This is the clearest region where `app.html` behaves like a page launcher/container rather than a content page.

### Key ownership anchors
- DOM anchor: `#appTabs`
- child frame: `#appFrame`
- companion pages:
  - `desktop-browser-interface.md`
  - `configuration-and-diagnostics-interfaces.md`
  - `display-interface.md`

## 4. Display / Peppy / moOde action controls

### What it is
The shell includes action buttons adjacent to the tabs for pushing or refreshing display-side behavior.

Current visible anchors include:
- `#pushPeppyBtn`
- `#showMoodeUiBtn`
- `#showPlayerBtn`
- `#showVisualizerBtn`
- `#refreshDisplayBtn`
- `#targetUrlHint`

### What it appears to do
This region is the shell-side operational bridge into moOde/display control behavior.

### Why it matters
This region crosses the page/runtime/host boundary. A change here may not be a pure UI change; it may involve runtime-admin routes and real moOde-host effects.

### Companion pages
- `display-launch-and-wrapper-surfaces.md`
- `display-interface.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `backend-change-verification-runbook.md`
- `display-issue-triage-runbook.md`

## 5. Status pill strip

### What it is
The status pill strip is the shell-side operational status region anchored by:
- `#statusInline`

Current pills include:
- `#apiPill`
- `#webPill`
- `#alexaPill`
- `#peppyPill`
- `#peppyAlsaPill`
- `#moodePill`
- `#notifyPill`
- `#scrobblePill`

### What it does
This region appears to summarize live status for important runtime and integration signals.

### Why it matters
It is one of the clearest shell-side operator/status surfaces and likely one of the first places where runtime truth becomes visible to a desktop user/operator.

### Companion pages
- `configuration-and-diagnostics-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `fragile-behavior-ownership.md`

## 6. Iframe-hosted child surface (`#appFrame`)

### What it is
`app.html` hosts other pages in:
- `#appFrame`

### What it does
This is the shell’s embedded content region for the major tab-routed child pages.

### Why it matters
Many tasks that look like “change `app.html`” may actually belong to:
- the child page inside `#appFrame`
- the shell-to-frame normalization layer
- or the shell page itself

### Key ownership distinction
A new agent should always ask:
- is the problem in the shell?
- the child page?
- or the shell-frame contract?

## 7. Queue modal family

### What it is
`app.html` contains a queue-related modal surface anchored by:
- `#queueAlbumModal`
- `#queueAlbumBody`
- `#queueAlbumClose`

### What it does
This modal family supports queue-row drill-down behaviors like:
- album details
- artist albums
- track metadata
- album action buttons

### Why it matters
These are shell-owned subviews, not separate top-level pages.
A request to “improve the queue card” may actually mean improving these modal flows.

## 8. Shell-to-frame theme / normalization / sizing logic

### What it is
`app.html` contains substantial logic for:
- iframe sizing
- iframe normalization
- shell-to-frame theme bridging
- special handling for pages like Config, Theme, Peppy, Visualizer, and Queue Wizard

### Why it matters
This is a major reason `app.html` is more than just a launcher. It actively shapes how child pages behave inside the shell.

### Important functions/areas
Current visible examples include:
- `syncFrameWidth()`
- `requestFrameHeightSync()`
- `enforcePeppyFrameFit()`
- `applyThemeBridgeToFrame()`
- `attachFrameAutoResizeObservers()`
- `normalizeEmbeddedDoc()`

### Companion pages
- `desktop-browser-interface.md`
- `display-interface.md`
- `display-surface-troubleshooting.md`
- `display-issue-triage-runbook.md`

## Practical “where do I start?” map

### If asked to improve the queue card
Open first:
- `app.html` → search `heroQueue`
- `syncHeroQueue()`
- `heroQueue*` controls and button wiring
- queue modal helpers
- then route pages if the issue is clearly data/truth-related

### If asked to improve the transport strip
Open first:
- `#heroTransport`
- `scripts/hero-transport.js`
- playback authority / fragile behavior pages

### If asked to improve the status pills
Open first:
- `#statusInline`
- pill DOM ids
- runtime/integration status logic in `app.html`
- local environment / ops companions

### If asked to improve tab/page behavior
Open first:
- `#appTabs`
- iframe source/routing logic
- frame normalization and resizing helpers

### If asked to improve moOde/Peppy display actions
Open first:
- display action buttons near the tabs
- runtime-admin-related logic in `app.html`
- display/ops/runbook pages

## Anatomy rule for future agents

For `app.html`, do not assume a requested UI change belongs only to:
- the shell page
- or the child page
- or the backend

Always classify the target first:
- shell-only region
- shell region backed by route truth
- iframe child page
- shell-to-frame contract
- shell-owned modal/subview

That classification step is usually the difference between opening the right file first and wasting time.

## Relationship to other pages

This page should stay linked with:
- `desktop-browser-interface.md`
- `user-interfaces.md`
- `controller-queue-interface.md`
- `queue-and-playback-model.md`
- `route-ownership-map.md`
- `source-map.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`

## Current status

At the moment, this page gives the wiki its first real page-anatomy reference.

It makes one especially important fact explicit:
- `app.html` is not just an iframe shell
- and the hero queue card is not just a link to the fuller queue page

That alone should save future agents a lot of wrong first guesses.
