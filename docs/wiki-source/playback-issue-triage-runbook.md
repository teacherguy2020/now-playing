# playback issue triage runbook

## Purpose

This runbook gives a practical triage order for playback-side problems in `now-playing`.

It is meant for issues like:
- wrong current song
- wrong art
- wrong metadata
- wrong status/transport truth
- queue head / Next Up disagreement
- AirPlay / UPnP / radio behavior that does not match expectations
- playback symptoms that may actually be caused by route mediation, fallback logic, or host/runtime reality

The goal is to answer practical questions like:
- what playback mode am I actually in?
- which authority chain should I trust first?
- which layer probably owns this symptom?
- when is the problem really playback truth versus display interpretation?

## Why this page matters

Playback issues are easy to debug badly in this project because:
- there is not one universal truth source
- visible behavior is often app-mediated rather than raw
- queue truth, playback truth, and display truth overlap without being identical
- some modes depend on local-environment realities or host-side override behavior

So “now playing is wrong” is not a useful first diagnosis.

## Core rule

When a playback issue appears, triage in this order:
1. **classify the playback mode**
2. **identify the likely authority chain**
3. **decide whether the symptom belongs to transport, queue, art/metadata, or presentation interpretation**
4. **check historically fragile playback paths**
5. **verify on the layer that should actually own the truth**

## Step 1: classify the playback mode first

Before reading code, decide which playback mode is active.

## A. Local file playback
Use this classification when:
- the system is playing a local library file
- MPD/library truth should align most directly
- the issue looks like a classic file/album/art path problem

## B. AirPlay
Use this classification when:
- the current playback comes through AirPlay
- the symptom may depend on `aplmeta` or AirPlay-specific metadata/art handling

## C. UPnP
Use this classification when:
- playback starts from UPnP-like streamish input
- the system may be trying to recover local-library truth from a stream-like source

## D. Radio / stream
Use this classification when:
- playback depends on station metadata
- enrichment, holdback, cleanup, or logo fallback may be involved

## E. Unresolved / fallback-driven case
Use this classification when:
- the system appears degraded or only partially resolved
- cache-backed or last-good behavior may be carrying the visible result

## Important guardrail
If the mode is misclassified, the rest of the debugging path is usually wrong.

## Step 2: choose the matching authority chain

After the mode is classified, identify what source of truth should be trusted first.

## If local file
Trust first:
- MPD playback/queue truth
- local file/library identity
- moOde/local-file cover-art path

Typical owners to inspect first:
- `src/services/mpd.service.mjs`
- `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`

## If AirPlay
Trust first:
- moOde current-song/status as interpreted for AirPlay
- `aplmeta.txt` / AirPlay metadata path
- AirPlay-specific art/metadata handling

Typical owners to inspect first:
- `moode-nowplaying-api.mjs`
- AirPlay metadata reader/handling path
- `src/routes/art.routes.mjs`
- local override layer if `airplay-json` behavior may matter

## If UPnP
Trust first:
- moOde current-song/status
- UPnP-specific resolution logic
- any successful recovery of local-library truth

Typical owners to inspect first:
- `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- `src/services/mpd.service.mjs` where low-level playback truth matters

## If radio / stream
Trust first:
- stream/radio interpretation path, not just raw metadata
- holdback/cleanup/enrichment/guardrail behavior
- station-logo or fallback path when confidence is low

Typical owners to inspect first:
- `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- radio support/config material such as aliases or eval surfaces

## If unresolved / fallback-driven
Trust first:
- last-good-render assumptions
- cache-backed art/current-state fallback
- whatever minimal authoritative state still survives

Typical owners to inspect first:
- fallback handling in `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- the relevant display/runtime logic if visible preservation is involved

## Step 3: decide what kind of playback symptom this is

Not all playback symptoms belong to the same subproblem.

## A. Transport truth problem
Examples:
- play/pause/next behavior is wrong
- the underlying playback state is wrong
- MPD/action truth looks inconsistent

Check first:
- `src/services/mpd.service.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- `moode-nowplaying-api.mjs`

## B. Queue truth problem
Examples:
- queue head is wrong
- Next Up disagrees with reality
- queue/head/playback relationship looks inconsistent

Check first:
- `src/routes/queue.routes.mjs`
- `moode-nowplaying-api.mjs`
- `src/services/mpd.service.mjs`
- relevant controller queue/Next Up surfaces afterward

## C. Art / metadata truth problem
Examples:
- wrong art shows while playback is otherwise correct
- metadata is missing, stale, or misleading
- mode-sensitive enrichment/fallback behavior seems wrong

Check first:
- playback mode classification
- `src/routes/art.routes.mjs`
- `moode-nowplaying-api.mjs`
- relevant support/diagnostics paths for the active mode

## D. Presentation interpretation problem
Examples:
- backend truth may be acceptable, but the visible surface interprets it badly
- fallback/last-good behavior seems too aggressive or too weak
- a display surface is making a playback issue look worse or different than the route truth

Check first:
- route truth first
- then page/runtime logic on the relevant surface
- then display-side fallback/last-good behavior

## Important guardrail
Do not treat every playback symptom as a low-level transport bug.
Many important playback-visible problems in this project are route/interpreter/fallback problems instead.

## Step 4: check the historically fragile playback paths

These are the playback-side paths most likely to waste time if not recognized early.

## Fragile path A: Next Up / Alexa-mode behavior
Check when:
- queue preview differs from real queue head
- Alexa-mode state appears to distort visible playback/queue truth
- controller cards or queue views disagree with underlying state

Start with:
- `moode-nowplaying-api.mjs`
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- relevant controller surface

Guardrails:
- treat Alexa/Next Up as historically sensitive immediately
- check queue-head truth and Alexa-side state together
- do not assume the visible card/page alone owns the problem

## Fragile path B: mode-sensitive art/current-song/status truth
Check when:
- art or metadata differs by mode
- a fix that seems right for one mode might break another
- fallback art looks stale or suspicious

Start with:
- playback mode classification
- `playback-authority-by-mode.md`
- `src/routes/art.routes.mjs`
- `moode-nowplaying-api.mjs`

Guardrails:
- do not make cross-mode assumptions
- classify the mode first, then choose the authority chain

## Fragile path C: radio metadata guardrails
Check when:
- radio output seems delayed, sparse, or conservative
- enrichment appears missing
- the system shows station logo instead of per-track art

Start with:
- radio holdback/cleanup/guardrail logic
- `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- diagnostics/eval surfaces

Guardrails:
- do not assume raw station metadata should become visible output directly
- conservative fallback may be correct behavior

## Fragile path D: last-good / fallback-preservation behavior
Check when:
- the visible state seems stale but stable
- refresh failures are transient
- fallback art/current-state paths may be active

Start with:
- fallback handling assumptions
- `src/routes/art.routes.mjs`
- relevant page/runtime logic if visible preservation is in play

Guardrails:
- do not aggressively clear good-enough state just because one refresh failed
- distinguish degraded-but-correct from truly wrong

## Fragile path E: AirPlay local override reality
Check when:
- AirPlay metadata or art behavior looks pathological
- CPU/metadata-reader issues may be involved
- app behavior looks wrong but the root cause may be in local override/service behavior

Start with:
- AirPlay mode classification
- local environment / override docs
- AirPlay metadata reader path
- app-side art/current-song handling afterward

Guardrails:
- do not assume stock behavior when Brian’s local overrides may be the actual explanation

## Step 5: decide which layer to inspect first

After classifying the mode and symptom type, choose the most likely owning layer.

## Route/bootstrap layer
Start here when:
- the symptom depends on `/now-playing`, `/next-up`, `/art/*`, diagnostics, queue, or runtime-admin-backed playback behavior

Check first:
- `moode-nowplaying-api.mjs`
- `src/routes/art.routes.mjs`
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`

## Service layer
Start here when:
- the issue looks like low-level playback/transport truth
- MPD command/state mismatch is suspected

Check first:
- `src/services/mpd.service.mjs`

## Page/runtime layer
Start here when:
- backend truth may already be correct
- the visible page seems to be interpreting/clearing/rendering playback state badly

Check first:
- relevant top-level HTML entrypoint
- `scripts/index-ui.js`
- page-specific runtime logic

## Local runtime/override layer
Start here when:
- AirPlay or display-host-side behavior may explain the playback symptom
- moOde/runtime-admin/host-side state seems involved

Check first:
- `src/routes/config.runtime-admin.routes.mjs`
- `local-environment.md`
- override docs/material in `integrations/moode/` and `ops/moode-overrides/`

## Step 6: use the minimum verification set that matches the symptom

## Symptom type: transport/control wrong
Verify:
- direct route/diagnostics behavior
- actual playback state after the action
- one affected surface afterward

## Symptom type: queue head / Next Up wrong
Verify:
- queue/head route truth
- `/next-up` behavior if relevant
- one controller queue/now-playing surface
- Alexa-mode difference if that path could be involved

## Symptom type: art/metadata wrong
Verify:
- playback mode classification
- art/current route truth
- fallback/guardrail behavior for that mode
- one visible surface after refresh

## Symptom type: degraded or stale-looking output
Verify:
- whether last-good/fallback behavior is intentionally active
- whether the result is degraded-but-correct
- whether a transient failure is being mistaken for bad state

## Step 7: declare success only when the right truth source and visible result agree

A playback issue is not really solved when:
- one page looks better but the underlying truth is still wrong
- one route returns 200 but the wrong authority chain is still being trusted
- a fix works for one mode while silently breaking another mode

A playback issue is solved when:
- the playback mode is correctly classified
- the correct authority chain is identified
- the owning route/service layer behaves correctly
- the visible surface reflects that truth correctly

## Quick heuristics

- If playback looks wrong, classify the mode before reading code.
- If queue truth looks wrong, separate queue truth from playback transport truth.
- If art looks wrong, ask whether the issue is local-file, AirPlay, UPnP, radio, or fallback-specific.
- If radio looks “less rich” than expected, ask whether suppression/guardrails are intentional.
- If AirPlay behaves weirdly, widen into local override reality early.
- If the visible surface is wrong but route truth looks right, shift to presentation/runtime interpretation instead of changing transport logic.

## Best companion pages

- `playback-mode-troubleshooting.md`
- `playback-authority-by-mode.md`
- `backend-change-verification-runbook.md`
- `fragile-behavior-ownership.md`
- `route-ownership-map.md`
- `display-issue-triage-runbook.md`
- `local-environment.md`

## Current status

At the moment, this page gives the wiki a more explicit playback-side triage sequence.

It turns “now playing is wrong” into a better debugging order:
- classify the playback mode
- identify the likely authority chain
- decide what kind of playback symptom this is
- check historically fragile playback paths
- verify on the layer that should actually own the truth
