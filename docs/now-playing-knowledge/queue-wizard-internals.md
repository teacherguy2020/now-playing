---
title: queue-wizard-internals
page_type: companion
topics:
  - queue
  - playback
  - controller
  - integration
confidence: medium
---

# queue-wizard internals

## Purpose

This page documents the current internal model of Queue Wizard in the `now-playing` system.

It exists because Queue Wizard is already one of the most important concepts in the wiki, but until now it has been described mostly indirectly:
- as preview/apply flows
- as album-level queue actions
- as a richer layer above direct queue mutation
- as a feature touched by Last.fm / Vibe configuration

This page turns that into a more explicit internal model.

## Important scope note

This page is intentionally honest about what is known versus what still needs route/file proofing.

What is already well supported by current wiki work:
- Queue Wizard is a real queue-shaping layer above raw queue mutation
- it has preview/apply semantics
- it is used by substantive controller/now-playing surfaces
- it intersects with Last.fm / Vibe features
- it likely owns album-level and related higher-order queue actions

What is **not yet** fully locked down here:
- the exact complete route list
- the exact owning route file(s)
- the exact helper/service chain behind every Queue Wizard action

So this page is an internal model page, not yet the final line-by-line route inventory.

## Why Queue Wizard matters

Queue Wizard appears to be one of the strongest signs that `now-playing` is not merely a thin MPD remote.

It matters because it suggests the system can:
- inspect or infer a candidate queue change
- preview a queue shape before committing it
- apply richer queue logic than simple append/play/replace primitives
- connect discovery or curation features to queue mutation

That makes Queue Wizard one of the main “app-side intelligence” layers in the playback model.

## High-level role

A good current interpretation is:
- Queue Wizard is the queue-shaping and queue-curation layer of the system
- it sits above raw transport and raw queue mutation
- it is where feature-side intent becomes a more deliberate queue plan

This makes it the natural companion to:
- `queue-and-playback-model.md`
- `api-playback-and-queue-endpoints.md`

## Queue Wizard versus raw queue mutation

## Raw queue mutation
Raw queue mutation means operations like:
- append item(s)
- replace queue
- crop queue

These are direct queue-changing actions.

## Queue Wizard
Queue Wizard adds a richer layer on top.

Current wiki work suggests it handles things like:
- previewing queue changes before apply
- album-level queue planning
- structured queue shaping rather than one raw append call
- feature-driven queue generation (for example from discovery/curation flows)

### Why this distinction matters
This means Queue Wizard is not merely another button label for “add to queue.”
It appears to be a higher-order control path.

## Current known semantics

The current wiki already supports several internal semantics.

## 1. Preview / apply pattern
This is the strongest current signal.

Current wiki work repeatedly references:
- queue-wizard preview/apply flows

### Working interpretation
A good current interpretation is:
- Queue Wizard first computes or assembles a candidate queue change
- the system can preview that result before final mutation
- apply then commits the change

This is exactly the kind of app-side queue-shaping behavior that distinguishes Queue Wizard from raw queue primitives.

## 2. Album-level queue actions
Current wiki work already notes:
- queue-wizard preview/apply calls for album actions

### Working interpretation
A good current interpretation is:
- Queue Wizard is especially important for “build queue from this album” style operations
- album-level actions likely need more structure than a single direct item append
- Queue Wizard is therefore one of the places where media/library structures become queue plans

## 3. Feature-driven queue shaping
Queue Wizard is already connected to features beyond plain playback control.

The config/Last.fm work already notes:
- when Last.fm is enabled/configured, Vibe tools are available in Queue Wizard

### Working interpretation
A good current interpretation is:
- Queue Wizard is not just for deterministic local album actions
- it also participates in discovery/curation-oriented queue generation
- Last.fm/Vibe is one example of a feature branch that feeds into Queue Wizard behavior

This reinforces the idea that Queue Wizard is a curation layer.

## Current known caller surfaces

Based on current wiki work, Queue Wizard clearly intersects with these surface families.

## 1. Substantive `controller-now-playing*` pages
Current evidence already shows:
- queue-wizard preview/apply behavior in the substantive `controller-now-playing*` family

This makes those pages some of the clearest known callers of Queue Wizard behavior.

## 2. Controller-side queue and now-playing interactions more broadly
Even where the exact button/route list is not yet fully enumerated, current controller/now-playing documentation makes it clear that:
- queue shaping is a first-class controller behavior
- Queue Wizard belongs in the same practical branch as queue display and playback control

## 3. Last.fm / Vibe discovery tooling
The Config branch already shows that Last.fm/Vibe configuration unlocks Queue Wizard-adjacent tools.

That means Queue Wizard is not only a local-library helper; it is also part of discovery-driven queue creation.

## Queue Wizard in the overall playback model

A useful layered model is:

### Layer 1: transport
- play
- pause
- next
- resume

### Layer 2: raw queue mutation
- append
- replace
- crop

### Layer 3: queue inspection
- queue page / embedded queue
- current queue visibility

### Layer 4: queue shaping / curation
- Queue Wizard
- album-level queue planning
- preview/apply semantics
- feature-driven queue generation

This makes Queue Wizard a Layer 4 concept.

## Why this matters
That layered model explains why Queue Wizard feels more “app-like” and less like a thin remote.

## Current route knowledge

This is where the page must stay careful.

Current wiki work supports the existence of:
- a Queue Wizard route family
- preview/apply semantics
- album-level actions

But current wiki work does **not yet** fully prove:
- the exact route names
- the exact request/response shapes
- the exact owning file/module chain

### Current best interpretation
A good current interpretation is:
- Queue Wizard likely has a dedicated route family of its own
- that family probably sits in or near the route-heavy app-side control layer already seen elsewhere
- the exact ownership still needs deeper route/file tracing

This is one of the next big proofing tasks.

## Relationship to YouTube queueing

Current YouTube work shows direct queue submission through:
- `POST /youtube/queue`

That is clearly queue mutation.

### Important distinction
A good current interpretation is:
- YouTube queueing is a direct feature-specific queue submission path
- Queue Wizard is a more general queue-shaping/curation layer

They may overlap conceptually, but they should not be treated as identical.

## Relationship to embedded queue surfaces

Current controller work shows:
- queue modal / embedded queue loading through `controller-queue.html`

### Important distinction
A good current interpretation is:
- embedded queue surfaces are mainly queue inspection/control UI
- Queue Wizard is the higher-order queue-shaping logic that may feed into what the queue becomes

Again: related, but not the same thing.

## What still needs proof

This page clarifies the model, but the next level of proof should answer:
- what exact routes belong to Queue Wizard?
- which route module owns them?
- which helper/service files implement preview/apply behavior?
- which controller surfaces call which Queue Wizard endpoints?
- how do Last.fm/Vibe tools connect into Queue Wizard at the route level?

That is the deeper engineering task that should follow this page.

## Relationship to other pages

This page should stay linked with:
- `queue-and-playback-model.md`
- `playback-authority-by-mode.md`
- `api-playback-and-queue-endpoints.md`
- `now-playing-surface-variants.md`
- `config-lastfm-and-scrobbling.md`
- `youtube-interface.md`

## Current status

At the moment, this page gives the wiki a much sharper internal model of Queue Wizard:
- it is the queue-shaping layer
- it uses preview/apply semantics
- it is used by substantive controller/now-playing surfaces
- it intersects with discovery/curation features like Last.fm / Vibe
- it still needs exact route/file proofing later

That is enough to move Queue Wizard from “important but vague” to “important and structurally understood.”
