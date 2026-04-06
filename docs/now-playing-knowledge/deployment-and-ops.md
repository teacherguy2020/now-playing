---
title: deployment-and-ops
page_type: support
topics:
  - ops
  - runtime
  - environment
  - controller
confidence: high
---

# deployment and ops

## Purpose

This page explains what “deployment and operations” concretely means for the `now-playing` project.

The older version was too abstract.
A better current interpretation is:
- deployment = getting changed code/config/runtime behavior onto the actual app host and, when relevant, the moOde host
- ops = understanding which machine or service a change affects, how that effect becomes live, and what must be verified afterward

So this page should answer questions like:
- what am I actually deploying?
- where does it run?
- when does a change need only refresh/verification versus API restart?
- when is the real effect on the app host versus the moOde host?
- what pages should I read next for specific operational scenarios?

## Why this page matters

This project is operationally easy to misunderstand because the visible system spans more than one runtime surface.
A change may affect:
- static/browser-facing files
- app-host route or service logic
- runtime-admin control paths
- moOde-host browser-target behavior
- host-specific overrides outside the main app tree

That means “deploy the change” is not a single action category.
It depends on what changed.

## Concrete operational model

A useful current model is:

### 1. App-host code and static pages
This includes things like:
- HTML pages under `now-playing/`
- JS/CSS used by those pages
- route files under `src/routes/`
- services/helpers used by the API
- app-host entry logic like `moode-nowplaying-api.mjs`

These changes primarily affect the app host.
In Brian’s current setup, the main live app target is documented in `local-environment.md`.

### 2. moOde-host display/runtime effects
This includes things like:
- browser target changes pushed into moOde
- display mode selection behavior
- Peppy/PeppyMeter/browser-target actions
- host-side display/runtime results triggered through runtime-admin routes

These changes may be *initiated* from the app-host API but their visible effect happens on the moOde host.

### 3. Host override material
This includes things like:
- moOde-side override scripts/configs
- mirrored recovery/audit material under ops/integrations docs
- local host patches that are not automatically implied by app deploys

These require separate host awareness and should not be treated like ordinary app-file deploys.

## What usually gets deployed

## Frontend/static surface changes
Examples:
- `app.html`
- `controller.html`
- `kiosk.html`
- `visualizer.html`
- CSS or browser-side JS changes

Practical meaning:
- the changed files need to be present on the app host
- visible behavior may change immediately once the host serves the new files
- API restart is often unnecessary if the change is truly frontend-only

But you still need to verify the relevant surface in its real operating context:
- standalone
- embedded
- kiosk
- moOde-pushed browser target

## Backend / route / service changes
Examples:
- `src/routes/*.mjs`
- service helpers
- config/runtime-admin route logic
- app-host state-truth endpoints like `/now-playing`

Practical meaning:
- changed code must be present on the app host
- the running API/service process may need restart to pick up the change
- route behavior should be verified directly, not only through a UI

## Runtime-admin changes
Examples:
- `/config/runtime/*`
- `/config/moode/*`
- `/config/services/*`
- `/config/restart-*`

Practical meaning:
- these are not passive docs/settings concepts
- they can trigger immediate live actions
- some effects are on the app host, some on the moOde host, some on both

## What “ops” concretely means in this project

In this project, ops usually means one or more of:
- deciding which host a change really affects
- deciding whether restart is needed
- deciding whether a browser refresh is enough
- deciding whether the moOde host should visibly change
- verifying the correct endpoint and the correct surface after the change
- distinguishing mirrored repo material from real host state

So “ops” is not a vague umbrella. It is the practical question of how a change becomes live and how to verify it.

## Concrete decision rules

## If the change is frontend-only
Typical examples:
- HTML/CSS changes
- browser-side JS changes
- purely visual/layout changes

Usually means:
- deploy/update the app-host files
- API restart often not required
- verify in the real affected surface

But do not stop at a local browser check if the change is meant for:
- embedded mode
- kiosk mode
- moOde browser target
- controller-right-pane behavior

## If the change is route/service logic
Typical examples:
- route handlers
- API behavior
- service/helper changes
- state-truth changes

Usually means:
- deploy/update the app-host code
- likely restart or at least explicit runtime verification
- verify the endpoint directly
- then verify affected surfaces

## If the change is config/runtime-admin logic
Typical examples:
- runtime-config behavior
- display push actions
- service-control behavior
- moOde host actions

Usually means:
- verify which machine is the real effect target
- verify endpoint response
- verify host-side visible effect or service/process condition
- do not assume config write alone means live behavior changed

## If the change is host override material
Typical examples:
- moOde-side override scripts
- mirrored recovery docs/scripts
- manual patches on the live moOde host

Usually means:
- normal app deploy assumptions are not sufficient
- check `local-environment.md`
- verify the real host state explicitly

## App host vs moOde host

This distinction is one of the most important operational facts in the project.

## App host
The app host primarily owns:
- API routes
- controller/display page serving
- config/runtime state handling
- state-truth endpoints like `/now-playing`
- queue/playback mediation logic

If you changed:
- page files
- route files
- services
- API handlers

start by thinking about the app host.

## moOde host
The moOde host is where display-target actions often become visibly real.
It is the practical target for things like:
- browser URL changes
- display-mode target switching
- host-side display behavior
- some service/process actions initiated through runtime-admin routes

If the endpoint says success but the real screen still looks wrong, do not stop at the app host.
Ask whether the real effect should have occurred on the moOde host.

## Restart reality

A useful current operational truth is:
- not all changes become live the same way

### Often no restart needed
- frontend-only page/style changes
- some browser-side logic changes once the new files are served/refreshed

### Often restart-sensitive
- route logic
- service helpers
- startup-captured config/env behavior
- API-process changes

The exact restart details are covered more concretely in:
- `restart-and-runtime-admin-troubleshooting.md`
- `backend-change-verification-runbook.md`

This page should stay at the level of:
- what kinds of changes usually imply restart-sensitive behavior
- and which operational question to ask next

## Verification model after deployment

A useful concrete verification pattern is:

### 1. Verify the correct layer
- endpoint if backend/route logic changed
- page/surface if frontend logic changed
- host-side visible effect if runtime-admin or moOde-target behavior changed

### 2. Verify the correct context
- standalone
- embedded
- kiosk
- moOde browser target
- local file playback vs AirPlay/radio/stream mode when relevant

### 3. Verify the real symptom, not just a nearby symptom
Examples:
- endpoint correct but visible display wrong
- page looks correct locally but wrong on moOde host
- queue truth fixed but Next Up still wrong
- config saved but runtime behavior unchanged until restart

## Best companion pages by operational question

### If the question is “do I need restart or only verification?”
Start with:
- `restart-and-runtime-admin-troubleshooting.md`
- `backend-change-verification-runbook.md`

### If the question is “which host actually owns the live effect?”
Start with:
- `local-environment.md`
- `config-network-and-runtime.md`
- `restart-and-runtime-admin-troubleshooting.md`

### If the question is “how do I verify a display-side change?”
Start with:
- `display-issue-triage-runbook.md`
- `display-surface-troubleshooting.md`

### If the question is “how do I verify playback-side truth after a change?”
Start with:
- `playback-issue-triage-runbook.md`
- `playback-authority-by-mode.md`
- `api-state-truth-endpoints.md`

### If the question is “what is real in Brian’s live environment?”
Start with:
- `local-environment.md`

## What this page is now confident about

A stronger current operational summary is:
- deployment in this project is not one thing
- app-host changes, moOde-host effects, and host-override work are distinct categories
- frontend-only changes often differ operationally from route/service/runtime-admin changes
- runtime-admin routes can produce immediate live effects and must be verified as operations, not just config writes
- the app host and moOde host should be kept separate mentally when triaging live behavior

## Relationship to other pages

This page should stay linked with:
- `local-environment.md`
- `config-network-and-runtime.md`
- `backend-change-verification-runbook.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`
- `deployment-and-ops.html` rendered companion

## Current status

At the moment, this page should be read as the concrete operational map for the project.

Its job is no longer to gesture at “operational themes.”
Its job is to explain:
- what gets deployed
- where it runs
- what kind of change you are making
- which host should visibly change
- and which verification path should follow.
