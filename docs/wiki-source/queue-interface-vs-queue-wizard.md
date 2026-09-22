---
title: queue interface vs queue wizard
page_type: synthesis
topics:
  - queue
  - playback
confidence: high
---

# Queue interface versus Queue Wizard

These are related but different parts of the system.

## The short answer

- **Queue interface** = viewing and directly interacting with the current queue.
- **Queue Wizard** = previewing, shaping, and curating what the queue should become.

If the current queue list, row controls, or embedded queue surface is wrong,
start with [Controller Queue Interface](controller-queue-interface.md). If
preview/apply behavior or higher-order queue generation is wrong, start with
[Queue Wizard Internals](queue-wizard-internals.md).

## Decision box

| Question | Likely owner | Start here |
| --- | --- | --- |
| Current queue list, embedded queue pane, or queue inspection | `controller-queue.html` | [Controller Queue Interface](controller-queue-interface.md) |
| Preview/apply flow for changing a queue plan | Queue Wizard | [Queue Wizard Internals](queue-wizard-internals.md) |
| Raw queue mutation versus queue shaping | Concept/model distinction | [Queue and Playback Model](queue-and-playback-model.md) |
| Which routes/modules back the behavior | Route ownership | [Route Ownership Map](route-ownership-map.md) |

## Do not confuse

- The queue interface is not Queue Wizard.
- Embedded queue UI is not queue planning.
- Raw queue mutation is not queue shaping.

*Last reviewed: 2026-09-22 America/Chicago*
