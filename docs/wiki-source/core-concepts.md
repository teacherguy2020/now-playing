---
title: core concepts
page_type: hub
topics:
  - runtime
  - playback
  - integration
confidence: high
---

# Core concepts

This page is the teaching layer between the product overview and the detailed
feature/reference pages. Use it when the question is about how the pieces fit
together rather than how to operate one screen.

## The system boundary

Now Playing is a web UI and API enhancement stack around a moOde/MPD player.
The app host owns normalized state, queue integration, display/controller
surfaces, and integration routes. moOde/MPD remains the ordinary playback
authority unless a documented external or physical mode owns the audio path.

Start with [Getting Started](getting-started.md) for installation or
[Architecture](architecture.md) for the maintainer-level component map.

## The three state questions

When a display or controller looks wrong, separate these questions:

1. **What is actually playing?** Use the state/API truth pages.
2. **Who owns playback right now?** Check the active mode and authority rules.
3. **Which surface is rendering it?** Follow the display/controller shell and
   embedded-pane ownership.

The practical references are [Playback Authority by Mode](playback-authority-by-mode.md),
[API State Truth](api-state-truth-endpoints.md), and
[User Interfaces](user-interfaces.md).

## Queue control versus queue shaping

The current queue and the plan for a future queue are different concepts:

- **Queue control** inspects and directly changes the current queue.
- **Queue shaping** previews, curates, and applies a higher-order queue plan.

Use [Queue and Playback Model](queue-and-playback-model.md),
[Queue Interface vs Queue Wizard](queue-interface-vs-queue-wizard.md), and
[Queue Wizard Internals](queue-wizard-internals.md) to keep those paths
separate.

## Display shell versus content owner

An embedded pane can be opened by a kiosk/controller shell while the child page
owns the actual content. A visual or layout defect therefore needs to be
classified before editing either side. See [Displays](displays.md),
[Kiosk Shell Anatomy](kiosk-shell-anatomy.md), and
[Embedded Pane Contracts](embedded-pane-contracts.md).

## Integration ownership

External systems have explicit boundaries:

- moOde/MPD is the normal playback runtime;
- Alexa uses the custom skill plus the local lifecycle bridge;
- Seeburg and Mabel have bounded integration endpoints;
- Mills has deliberately different physical-session semantics.

The [Integrations](integrations.md) hub and
[Jukebox Priority Model](jukebox-priority-model.md) document the ownership
rules before implementation details.

*Last reviewed: 2026-09-22 America/Chicago*
