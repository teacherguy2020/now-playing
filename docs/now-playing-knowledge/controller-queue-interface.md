---
title: controller-queue-interface
page_type: child
topics:
  - queue
  - playback
  - controller
  - runtime
confidence: high
---

# controller queue interface

## Purpose

This page documents `controller-queue.html` as the queue interface surface in the `now-playing` system.

This is no longer just an inferred role from surrounding pages.
Current wiki evidence already supports a stronger statement:
- `controller-queue.html` is a real queue surface
- it has both standalone and embedded roles
- it is reused by other controller/kiosk flows instead of being a one-off helper fragment

## Scope

What this page now treats as established:
- `controller-queue.html` is the main queue inspection/control page
- `controller-queue.html?embedded=1` is the compact embedded version used inside other shells
- the page participates in kiosk right-pane routing
- the page is distinct from Queue Wizard

What still needs deeper proofing elsewhere:
- the exact full backend route inventory behind every queue action
- the exact owning route/module chain for all read/write behavior
- the exact request/response contract for every page action

So this page documents surface role and branch position with confidence, while leaving deeper API/file proof to companion pages.

## Why this page matters

The queue page is one of the clearest places where queue state becomes visible and operable.

It sits at the boundary between:
- queue truth
- controller UI
- kiosk embedded-pane behavior
- now-playing-side queue access

Without a dedicated page, queue work gets blurred into now-playing surfaces or Queue Wizard logic.

## High-level role

`controller-queue.html` is the queue inspection and direct queue interaction surface.

It answers questions like:
- what is in the queue?
- what order is it in?
- what queue-focused actions are available from a dedicated page?

It is also the reusable queue child surface that other pages embed when they need queue access without navigating away.

That makes it a core queue surface, not a helper dialog.

## Queue interface versus Queue Wizard

This distinction should stay explicit.

## `controller-queue.html`
This page is about:
- queue visibility
- direct queue inspection
- queue-focused interaction in a dedicated surface

## Queue Wizard
Queue Wizard is about:
- queue shaping
- preview/apply workflows
- building or restructuring a queue plan

Useful shorthand:
- `controller-queue.html` = queue interface surface
- Queue Wizard = queue planning/shaping surface

For the retrieval-oriented synthesis version of that distinction, see:
- `queue-interface-vs-queue-wizard.md`

## Evidence already established elsewhere

## 1. Embedded queue modal in substantive now-playing pages
Current `controller-now-playing*` work already shows:
- queue modal with embedded `controller-queue.html`
- queue modal with embedded `controller-queue.html?embedded=1`

This means now-playing surfaces reuse the queue page instead of duplicating a full inline queue implementation.

## 2. Embedded-pane contract participation
Current embedded-pane work already shows `controller-queue.html` participating in:
- `embedded=1`
- theme/color parameter propagation
- compact pane layout adaptation
- parent-driven close/navigation expectations

So `controller-queue.html` is built to function both as a standalone page and as embedded pane content.

## 3. Kiosk right-pane routing target
Current kiosk-right-pane work already shows:
- `kiosk-queue.html` → `controller-queue.html`
- embedded pane loading with `embedded=1`

That means kiosk queue access is controller-backed, not a separate kiosk-only queue implementation.

## Standalone versus embedded role

## Standalone mode
In standalone mode, `controller-queue.html` is the dedicated queue page.

Its primary job is queue state visibility and queue-focused interaction.

## Embedded mode
In embedded mode, `controller-queue.html?embedded=1` acts as a reusable queue subview.

It appears inside:
- now-playing queue modals
- kiosk right-pane flows

In that role it compacts its layout and cooperates with parent-shell theme/color/layout expectations.

This dual-role behavior is one of the main reasons the page deserves its own wiki entry.

## Queue interface in the broader queue/playback model

Within the broader playback branch, `controller-queue.html` fits as:

### Layer 3: queue inspection / direct queue UI
Using the established layered model:
- Layer 1 = transport
- Layer 2 = raw queue mutation
- Layer 3 = queue inspection / direct queue interface
- Layer 4 = queue shaping / curation (Queue Wizard)

`controller-queue.html` is the clearest Layer 3 surface currently identified.

That gives the queue branch a cleaner internal structure:
- transport controls are not the queue page
- Queue Wizard is not the queue page
- the queue page is its own dedicated surface with its own job

## Relationship to now-playing surfaces

The queue interface is tightly tied to the `controller-now-playing*` family.

Current wiki evidence already shows:
- now-playing surfaces expose queue access through embedded queue loading
- the queue page is one of the most important child views under those surfaces

Practical implication:
queue UI issues may actually belong to:
- `controller-queue.html`
- its embedded-mode behavior
- its backend queue contract

rather than to the top-level now-playing surface itself.

## Relationship to kiosk mode

The queue interface also belongs squarely in the kiosk branch.

Because kiosk routing maps:
- `kiosk-queue.html` → `controller-queue.html`

queue access in kiosk mode is standard controller-backed embedded-pane behavior.

For the shell-owner versus content-owner distinction, see:
- `kiosk-queue-shell-vs-content-owner.md`

## Relationship to backend/API proofing

The UI surface is already clear.

What still needs deeper proof is:
- which exact routes populate the page
- which exact routes mutate queue state from inside the page
- how much of that logic is MPD-direct versus app-mediated
- which backend module owns the queue interface contract

So the right current statement is not “the queue page is vague.”
The right statement is:
- the surface role is already clear
- the backend contract still needs sharper route/file proofing

## What this page clarifies

## 1. Queue UI is a real surface
It is not just a modal fragment.
It has its own page and its own standalone/embedded roles.

## 2. Queue UI is not Queue Wizard
Queue Wizard shapes queues.
`controller-queue.html` shows and controls the current queue.

## 3. Queue UI is part of the kiosk embedded ecosystem
It participates in the same embedded-pane contract as other controller child pages.

## 4. Queue UI deserves deeper backend proofing
The interface role is already strong enough to justify deeper route-contract tracing later.

## Relationship to other pages

This page should stay linked with:
- `queue-and-playback-model.md`
- `queue-wizard-internals.md`
- `api-playback-and-queue-endpoints.md`
- `now-playing-surface-variants.md`
- `embedded-pane-contracts.md`
- `kiosk-right-pane-routing.md`
- `queue-interface-vs-queue-wizard.md`

## Current status

This page now gives the wiki a clear anchor in the playback/queue branch:
- `controller-queue.html` is the queue interface surface
- it has standalone and embedded roles
- it is reused by now-playing and kiosk flows
- it is distinct from Queue Wizard
- its backend contract is the next deeper proofing target, not an unresolved question about the page’s role
