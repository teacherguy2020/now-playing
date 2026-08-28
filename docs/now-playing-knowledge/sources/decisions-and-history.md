---
pageType: source
id: source.decisions-and-history
title: decisions and history
sourceType: local-file
sourcePath: /Users/brianwis/.openclaw/workspace/docs/now-playing-knowledge/decisions-and-history.md
ingestedAt: 2026-04-08T15:57:23.501Z
updatedAt: 2026-04-08T15:57:23.501Z
status: active
---

# decisions and history

## Source
- Type: `local-file`
- Path: `/Users/brianwis/.openclaw/workspace/docs/now-playing-knowledge/decisions-and-history.md`
- Bytes: 6408
- Updated: 2026-04-08T15:57:23.501Z

## Content
```text
# decisions and history

## Purpose

This page records durable project decisions, historically important lessons, and current default assumptions for the `now-playing` project.

It is meant to preserve context that should survive beyond individual chats or one-off fixes.

Important distinction:
- some items here are current working defaults
- some are lessons learned from prior failures or fixes
- some describe changes over time that matter operationally

## Confirmed durable decisions

- Primary deploy target for active `now-playing` work is the Pi5 at `brianwis@10.0.0.4:/opt/now-playing/`.
- Pi4 / `server-pi` (`10.0.0.233`) is non-primary unless explicitly requested.
- Frontend-only file changes can often be deployed without an API restart.
- Backend route changes may require a service restart.
- Metadata enrichment for likely talk/news/sports streams should be conservative to avoid bogus album/year/link data.
- When transient refresh errors occur, the system should preserve the last-good render rather than collapsing into an unusable state.
- Local moOde watchdog/display-wake and `airplay-json` hardening overrides exist and matter enough to be mirrored in `now-playing/ops/moode-overrides/`.

## Confirmed historical lessons

- Iframe-vs-top-level rendering differences have mattered in real behavior; a display bug was previously traced to differences in body/background handling between embedded and top-level contexts.
- Alexa-mode / Next Up reliability has required specific handling, including not clearing Next Up too aggressively and handling art URLs/fallbacks robustly.
- Preserving last-good render on transient refresh failures is an important reliability lesson.
- Local hardening/override work has been part of the real operational history, not just a theoretical concern.

## Current default assumptions

- Pi5 is the default primary host for active deploy work.
- `/home/brianwis/apps/now-playing-next` should not be used unless explicitly requested.
- Local runtime behavior may reflect local overrides instead of stock/default project behavior.
- Display/runtime bugs should be treated as potentially cross-layer: UI, integration, runtime state, and host-specific behavior may all matter.
- These are current working defaults, not eternal guarantees; they should change only when there is evidence that the operational reality changed.

## Things that changed over time

- The preferred deploy target shifted toward the Pi5 (`10.0.0.4`) and away from Pi4 as the default push target.
- Local operational behavior diverged from stock assumptions as moOde watchdog/display-wake and `airplay-json` hardening overrides were introduced.
- Specific reliability lessons were learned over time around iframe/top-level rendering differences, Alexa-mode / Next Up behavior, and transient refresh handling.
- Phase 1 knowledge-base trust-hardening substantially changed the wiki’s model of the current repo:
  - several previously assumed files were re-checked and found not to exist at the cited paths
  - `moode-nowplaying-api.mjs` was verified as the real API/bootstrap assembly point, while root `index.js` was confirmed to be an Alexa export shim
  - top-level HTML entrypoints were verified as first-class ownership points for user-facing surfaces
  - the project was verified to be more route-heavy than a clean “thin routes, fat services” architecture would suggest
  - representative endpoint-family traces (queue/playback, display/runtime, browse/queue-wizard) made the route/service/helper split more concrete and trustworthy

## Phase 1 trust-hardening milestone

What this milestone accomplished:
- reduced false confidence in the source map by removing or softening stale/nonexistent file claims
- replaced several inferred ownership assumptions with current repo-grounded evidence
- established a stronger user-surface model across desktop, tablet, phone, moOde-box display surfaces, and the display/router/classic now-playing layer
- propagated the strongest findings into `source-map.md`, `architecture.md`, `system-overview.md`, `gotchas-and-lessons.md`, and `open-questions.md`

What it did **not** finish:
- the exact MPD/moOde synchronization boundary
- every remaining route/service/helper handoff example
- the full remaining proofing of transport/radio/playlist ownership details

Practical implication:
- after Phase 1, the wiki is materially more trustworthy as a current source of truth, but it is still improving from “strong orientation + strong source map” toward a more exhaustive operational reference

## Phase 2 operational-boundary milestone

What this milestone accomplished:
- clarified that the MPD/moOde boundary is mixed rather than cleanly layered
- documented that current-song / art / status authority is playback-mode-dependent rather than universal
- elevated UPnP into a distinct bridge mode rather than burying it under generic stream handling
- documented radio/stream metadata handling as an enrichment pipeline with holdback, guardrails, cleanup, station-logo preference, and fallback behavior
- clarified the deploy/restart-sensitive boundary around config writes, env overrides, runtime-admin changes, and API restart behavior
- made the app-host vs moOde-host control boundary explicit in the local environment model
- propagated these operational truths into `integrations.md`, `workflows.md`, `deployment-and-ops.md`, `local-environment.md`, `gotchas-and-lessons.md`, and `open-questions.md`

What it did **not** finish:
- every remaining MPD/moOde edge case
- all remaining route/service/helper handoff examples
- the final proofing of every transport/radio/playlist ownership detail
- the live-role split between `lambda_bundle/` and `lambda_upload/`

Practical implication:
- after Phase 2, the wiki is no longer just stronger at code/source navigation; it is also substantially better at explaining how live behavior, host control, playback modes, and restart-sensitive changes actually work in practice

## Open questions

- Which repo files should be linked here as the most important implementation locations for the confirmed lessons above?
- Which additional historically important fixes deserve promotion from `gotchas-and-lessons.md` into this page over time?
- Which local runtime assumptions are still current versus historical?
- Which entries here still need tighter dating or explicit sourcing later?

```

## Notes
<!-- openclaw:human:start -->
<!-- openclaw:human:end -->
