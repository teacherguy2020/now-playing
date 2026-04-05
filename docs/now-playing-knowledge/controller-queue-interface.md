---
title: controller-queue-interface
page_type: child
topics:
  - queue
  - playback
  - controller
  - runtime
confidence: medium
---

# controller queue interface

## Purpose

This page documents `controller-queue.html` as the queue interface surface in the `now-playing` system.

It exists because the queue page is already clearly important across current wiki work, but until now it has mostly appeared as a supporting detail inside other pages:
- embedded in now-playing modals
- loaded into kiosk right-pane flows
- referenced as evidence that queue inspection/control is a first-class surface

This page makes `controller-queue.html` explicit as its own surface.

## Important scope note

This page is intentionally careful.

What current wiki work already supports well:
- `controller-queue.html` is a real queue UI surface
- it also supports embedded mode via `controller-queue.html?embedded=1`
- it appears inside substantive now-playing surfaces as an embedded queue modal/pane
- it participates in kiosk right-pane routing
- it should be understood as queue inspection/control UI, not as the same thing as Queue Wizard

What is **not yet** fully proven here:
- the exact backend route inventory that powers queue reads/writes
- the exact file/module ownership of those backend contracts
- the exact queue-action list exposed by the page in every mode/layout

So this page focuses on the interface role and architectural placement of `controller-queue.html`.

## Why this page matters

The queue page matters because it is one of the clearest user-facing places where queue state becomes visible and operable.

It sits at an important boundary between:
- queue truth
- controller UI
- embedded kiosk pane behavior
- now-playing-side queue access

Without a dedicated page, queue work stays too abstract.

## High-level role

A good current interpretation is:
- `controller-queue.html` is the main queue inspection/control surface
- it is where the user/operator can view the current queue in a dedicated UI
- it is also the reusable queue UI that other surfaces embed when they need queue access without leaving the current page

That makes it a core queue surface, not just a helper dialog.

## Queue interface versus Queue Wizard

This distinction matters a lot.

## `controller-queue.html`
A good current interpretation is:
- this page is primarily about queue visibility and direct queue interaction
- it answers questions like:
  - what is in the queue?
  - what order is it in?
  - how can the user inspect or manipulate the current queue state from a queue-focused UI?

## Queue Wizard
Queue Wizard is better understood as:
- the higher-order queue-shaping and preview/apply layer
- more about generating or restructuring a candidate queue plan
- less about being the plain dedicated queue page

### Why this distinction matters
Future agents should not blur these concepts.

A useful shorthand is:
- `controller-queue.html` = queue interface surface
- Queue Wizard = queue planning/shaping surface

Related, but not identical.

## Evidence from current surface work

Current wiki work already shows several strong signals about `controller-queue.html`.

## 1. Embedded queue modal in substantive now-playing pages
Current `controller-now-playing*` family work already shows:
- queue modal with embedded `controller-queue.html`
- queue modal with embedded `controller-queue.html?embedded=1`

### Working interpretation
A good current interpretation is:
- the queue page is reusable enough to serve as embedded sub-UI
- now-playing surfaces rely on it instead of duplicating a full separate queue implementation inline
- this makes `controller-queue.html` one of the more important reusable controller child pages

## 2. Embedded-pane contract participation
Current embedded-pane work already lists `controller-queue.html` among pages that respond to:
- `embedded=1`
- theme/color parameters
- pane-style layout adaptation
- parent-driven close/navigation expectations

### Working interpretation
A good current interpretation is:
- `controller-queue.html` is designed to function both as a standalone page and as pane content
- when embedded, it should behave like a compact child surface rather than a full-screen page

That makes it an important participant in the kiosk/controller embedded-surface protocol.

## 3. Kiosk right-pane routing target
Current kiosk-right-pane work already shows:
- `kiosk-queue.html` → `controller-queue.html`
- and embedded load into the kiosk pane with `embedded=1`

### Working interpretation
A good current interpretation is:
- `controller-queue.html` is the controller-backed implementation target for queue access from kiosk mode
- queue access in kiosk mode is therefore controller-backed rather than a separately implemented kiosk queue app

That is important architecturally.

## Standalone versus embedded role

A useful current model is:

## Standalone mode
In standalone mode, `controller-queue.html` is the dedicated queue page.

A good current interpretation is:
- it should present queue state as its primary responsibility
- it likely supports fuller navigation, larger layout, and more queue-focused interaction than an embedded instance

## Embedded mode
In embedded mode, `controller-queue.html?embedded=1` is a reusable queue subview.

A good current interpretation is:
- it appears inside now-playing queue modals and kiosk panes
- it should compact its layout and styling for containment
- it should cooperate with the parent shell’s theme/color/layout expectations
- it may use embedded close/back behavior rather than full navigation semantics

This dual-role behavior is one of the main reasons the page deserves its own wiki entry.

## Queue interface in the broader queue/playback model

Within the broader Phase 2 model, `controller-queue.html` best fits as:

### Layer 3: queue inspection / direct queue UI
Using the layered model already established elsewhere:
- Layer 1 = transport
- Layer 2 = raw queue mutation
- Layer 3 = queue inspection / direct queue interface
- Layer 4 = queue shaping / curation (Queue Wizard)

`controller-queue.html` is the clearest Layer 3 surface currently identified.

## Why this matters
This gives the queue branch a clearer internal structure:
- transport controls are not the queue page
- Queue Wizard is not the queue page
- the queue page is its own dedicated surface with its own job

## Relationship to now-playing surfaces

The queue interface is tightly tied to the `controller-now-playing*` family.

Current wiki work already suggests:
- now-playing surfaces expose queue access through modal/embedded queue loading
- the queue page is one of the most important child views underneath those surfaces

### Practical implication
When documenting or debugging now-playing behavior, queue UI issues may actually belong to:
- `controller-queue.html`
- its embedded-mode behavior
- its backend queue contract

rather than to the top-level now-playing surface itself.

## Relationship to kiosk mode

The queue interface also belongs squarely in the kiosk branch.

Because kiosk right-pane routing maps:
- `kiosk-queue.html` → `controller-queue.html`

A good current interpretation is:
- queue access in kiosk mode is one of the standard embedded pane targets
- queue interface behavior in kiosk mode depends on the same parent/child contract documented for other controller child pages

This keeps queue behavior tied to the real controller implementation rather than to a kiosk-only duplicate.

## Relationship to backend/API proofing

This is one of the key honesty points for the page.

Current wiki work already proves the queue interface surface exists and is important.
But it does **not yet** fully prove:
- which exact routes populate the page
- which exact routes mutate queue state from inside the page
- how much of that logic is MPD-direct versus app-mediated
- which backend module owns the queue interface contract

### Current best interpretation
A good current interpretation is:
- `controller-queue.html` is a first-class queue UI shell over a deeper queue API contract
- that contract almost certainly belongs in the route-heavy app-side control layer
- exact route/file ownership remains one of the next worthwhile proofing tasks

## Things this page helps clarify

This page clarifies several things that were previously easy to blur together.

## 1. Queue UI is a real surface
It is not just a modal fragment.
It has its own page and its own embedded/fullscreen roles.

## 2. Queue UI is not Queue Wizard
Queue Wizard shapes queues.
`controller-queue.html` shows/controls the current queue.

## 3. Queue UI is part of the kiosk embedded ecosystem
It participates in the same embedded-pane contract as other controller child pages.

## 4. Queue UI is important enough to deserve backend route proofing later
The UI surface is already clear even though the backend contract still needs deeper tracing.

## Relationship to other pages

This page should stay linked with:
- `queue-and-playback-model.md`
- `queue-wizard-internals.md`
- `api-playback-and-queue-endpoints.md`
- `now-playing-surface-variants.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`

## What should follow this page

After this page, the next high-value proofing work is probably:
- stronger route ownership mapping for queue interface and Queue Wizard
- a route/file-oriented page such as `route-ownership-map.md`
- later, a more exact queue API contract page if code-first proof is gathered

## Current status

At the moment, this page gives the wiki a needed missing anchor in the playback/queue branch:
- `controller-queue.html` is the queue interface surface
- it has standalone and embedded roles
- it is used by now-playing and kiosk flows
- it is distinct from Queue Wizard
- its backend contract still needs deeper exact proof later

That is enough to make the queue branch feel much more like a real map and less like scattered hints.
