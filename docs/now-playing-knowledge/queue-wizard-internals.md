---
title: queue-wizard-internals
page_type: companion
topics:
  - queue
  - playback
  - controller
  - integration
confidence: high
---

# queue-wizard internals

## Purpose

This page documents the current internal model of Queue Wizard in the `now-playing` system.

The wiki no longer needs to talk about Queue Wizard as a vague advanced feature.
Current evidence already supports a stronger statement:
- Queue Wizard is a real queue-shaping layer
- it sits above raw queue mutation
- it uses preview/apply semantics
- it is called by substantive controller/now-playing surfaces
- it intersects with Last.fm / Vibe-driven queue creation

## Scope

What this page now treats as established:
- Queue Wizard is the queue-shaping and queue-curation layer of the system
- it is not the same thing as the queue page
- preview/apply is one of its defining patterns
- album-level and feature-driven queue generation belong here

What still needs deeper code-first proof elsewhere:
- the exact complete route list
- the exact owning route file(s)
- the exact helper/service chain behind every Queue Wizard action
- the full request/response contract family

So this page documents Queue Wizard as a structurally understood layer, while leaving deeper endpoint ownership proof to companion pages.

## Why Queue Wizard matters

Queue Wizard is one of the strongest signs that `now-playing` is not merely a thin MPD remote.

It shows that the system can:
- compute or assemble a candidate queue change
- preview that change before committing it
- apply richer queue logic than simple append/play/replace primitives
- connect discovery or curation features to queue mutation

That makes Queue Wizard one of the main app-side intelligence layers in the playback model.

## High-level role

Queue Wizard is the queue-shaping and queue-curation layer of the system.

It sits above:
- raw transport
- raw queue mutation

It is where feature-side intent becomes a deliberate queue plan.

This makes it the natural companion to:
- `queue-and-playback-model.md`
- `api-playback-and-queue-endpoints.md`
- `controller-queue-interface.md`

## Queue Wizard versus raw queue mutation

## Raw queue mutation
Raw queue mutation means operations like:
- append item(s)
- replace queue
- crop queue

These are direct queue-changing actions.

## Queue Wizard
Queue Wizard adds a richer layer on top.

Its job is queue shaping, including:
- previewing queue changes before apply
- album-level queue planning
- structured queue shaping rather than one raw append call
- feature-driven queue generation from discovery/curation flows

This should stay explicit:
Queue Wizard is not merely another label for “add to queue.”
It is a higher-order control path.

For the retrieval-oriented distinction between Queue Wizard and the queue interface surface, see:
- `queue-interface-vs-queue-wizard.md`

## Current known semantics

## 1. Preview / apply pattern
This is the strongest current signal.

Queue Wizard computes or assembles a candidate queue change, supports preview, and apply commits the change.

That is exactly the pattern that separates it from raw queue primitives.

## 2. Album-level queue actions
Current wiki work already references queue-wizard preview/apply behavior for album actions.

That means Queue Wizard is one of the places where media/library structures become queue plans.

## 3. Feature-driven queue shaping
Queue Wizard is connected to features beyond plain playback control.

The config/Last.fm work already shows:
- when Last.fm is enabled/configured, Vibe tools are available in Queue Wizard

That means Queue Wizard is also part of discovery/curation-driven queue generation, not just deterministic local album actions.

## Current known caller surfaces

Based on current wiki work, Queue Wizard clearly intersects with these surface families.

## 1. Substantive `controller-now-playing*` pages
Current evidence already shows queue-wizard preview/apply behavior in the substantive `controller-now-playing*` family.

Those pages are some of the clearest known callers of Queue Wizard behavior.

## 2. Controller-side queue and now-playing interactions more broadly
Current controller/now-playing documentation already makes it clear that queue shaping is a first-class controller behavior.

Queue Wizard belongs in the same practical branch as queue display and playback control, but it owns a different layer.

## 3. Last.fm / Vibe discovery tooling
The config branch already shows that Last.fm/Vibe configuration unlocks Queue Wizard-adjacent tools.

That means Queue Wizard is part of discovery-driven queue creation as well as local-library queue construction.

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
That is why it feels more app-like and less like a thin playback remote.

## Current route knowledge

The wiki already supports the existence of:
- a Queue Wizard route family
- preview/apply semantics
- album-level actions

The remaining gap is not whether Queue Wizard is real.
The remaining gap is:
- the exact route names
- exact request/response shapes
- exact owning file/module chain

So the right current statement is:
- Queue Wizard is structurally understood
- its route/file ownership still needs deeper tracing

## Relationship to YouTube queueing

Current YouTube work shows direct queue submission through:
- `POST /youtube/queue`

That is direct feature-specific queue mutation.
Queue Wizard is the broader queue-shaping and curation layer.

They can overlap conceptually, but they should not be treated as identical.

## Relationship to embedded queue surfaces

Current controller work shows embedded queue loading through:
- `controller-queue.html`

That page is primarily queue inspection/control UI.
Queue Wizard is the higher-order queue-shaping logic that determines what the queue should become.

Again:
- queue page = inspect/control current queue
- Queue Wizard = plan/shape candidate queue

## What still needs proof

The deeper engineering follow-up should answer:
- what exact routes belong to Queue Wizard?
- which route module owns them?
- which helper/service files implement preview/apply behavior?
- which controller surfaces call which Queue Wizard endpoints?
- how do Last.fm/Vibe tools connect into Queue Wizard at the route level?

## Relationship to other pages

This page should stay linked with:
- `queue-and-playback-model.md`
- `playback-authority-by-mode.md`
- `api-playback-and-queue-endpoints.md`
- `controller-queue-interface.md`
- `config-lastfm-and-scrobbling.md`
- `youtube-interface.md`
- `queue-interface-vs-queue-wizard.md`

## Current status

This page now gives the wiki a sharper internal model of Queue Wizard:
- it is the queue-shaping layer
- it uses preview/apply semantics
- it is called by substantive controller/now-playing surfaces
- it intersects with discovery/curation features like Last.fm / Vibe
- its exact route/file contract is the next deeper proofing target, not a vague open question about what Queue Wizard is
