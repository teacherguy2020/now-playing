# backend change verification runbook

## Purpose

This runbook explains what to verify after backend-facing `now-playing` changes.

It is meant for work involving things like:
- route changes
- service/helper changes
- config/runtime behavior changes
- runtime-admin behavior changes
- host-control or SSH-backed side effects
- backend-supported UI behavior that may look frontend-only at first

The goal is to answer practical questions like:
- does this change need only UI verification, or also endpoint verification?
- does this likely need an API restart?
- is the real effect supposed to happen on the app host or the moOde host?
- what should be checked before declaring success?

## Why this page matters

A recurring project mistake is treating all changes as if they had the same verification path.

They do not.

In this project, these are not equivalent:
- HTML/CSS-only changes
- route/service changes
- config writes
- runtime-admin actions
- host override changes

Success in one layer does not automatically prove success in another.

## Core rule

After a backend-facing change, verify in this order:
1. **what class of change was made**
2. **whether restart sensitivity is likely**
3. **which host should show the real effect**
4. **which endpoints should be checked directly**
5. **which user-facing surfaces should still be verified**

## Step 1: classify the change

Start by deciding what kind of change you actually made.

## A. Frontend / page / style only
Typical examples:
- top-level HTML changes
- CSS changes
- visual/layout-only JS changes

Typical implication:
- often no API restart
- visible verification is still required
- if the affected page depends on embedded/runtime/display logic, surface-specific verification still matters

## B. Route / service / config-consuming backend logic
Typical examples:
- `src/routes/*.mjs` changes
- `src/services/*.mjs` changes
- helper/lib changes used by live endpoints
- config-consuming behavior changes

Typical implication:
- endpoint verification is required
- affected UI/surfaces must still be verified
- API restart may be required depending on how the value/logic becomes live

## C. Runtime-admin or host-control behavior
Typical examples:
- browser URL changes
- display mode changes
- PeppyMeter / PeppyALSA actions
- mpdscribble/service control
- SSH-backed host-side operations driven through runtime-admin routes

Typical implication:
- endpoint success is not enough
- real host-side effect must be verified
- app-host and moOde-host verification may both matter

## D. Host override changes
Typical examples:
- `integrations/moode/` host-side override material
- `ops/moode-overrides/` mirrored override material
- direct moOde-host patch/application work

Typical implication:
- ordinary app deploy assumptions are not sufficient
- verify on the real moOde host after apply
- do not confuse mirrored repo material with applied host state

## Step 2: decide whether restart is likely

Not all backend changes have the same restart sensitivity.

## Cases that often do **not** require restart
Usually restart is less likely when:
- the change is HTML/CSS-only
- the route reads fresh state/config per request
- the route updates a live runtime value directly
- the visible page only needs refresh/reload to show the new behavior

## Cases that often **do** require restart
Usually restart is more likely when:
- route/service module code changed and the running API process has not been refreshed
- behavior depends on module-level startup initialization
- config/env-backed values were captured at process start
- the route itself warns that env-overridden values need restart to apply

## Important current clue
Current repo guidance already says:
- `/config/runtime` writes config to disk but warns that env-overridden values may require restart with `--update-env`

That means a config write should not automatically be treated as “live now.”

## Practical restart rule
If you changed backend code or startup-captured config behavior, assume:
- restart likely required
- then verify again after restart

## Step 3: identify where the real effect should happen

This project has a real host boundary.

## App host (`10.0.0.4`)
Typical effects here:
- API behavior
- route/service/helper logic
- config writes
- app-host endpoint responses
- restart-sensitive backend behavior

If the intended change is app-side, verify here first.

## moOde host (`10.0.0.254`)
Typical effects here:
- browser URL changes
- display mode changes
- PeppyMeter / PeppyALSA actions
- runtime-admin-driven host-side state changes
- override-script-driven behavior

If the intended change is display-host-side, API success on the app host is not sufficient proof.

## Practical guardrail
Always ask:
- where should the real result appear?

If the answer is “on the moOde box,” then you have not finished verification until the moOde-side outcome is checked.

## Step 4: verify the endpoint or direct backend contract

After the change is applied, verify the most relevant backend contract directly.

## For route/service changes
Check:
- the changed endpoint directly
- any nearby diagnostics/support endpoint that exposes the same path
- any route family whose output the UI depends on

Examples include:
- playback/queue endpoints
- `/config/runtime`
- `/config/diagnostics/*`
- runtime-admin routes
- art/current-song support routes

## For runtime-admin changes
Check:
- the route response
- whether the route actually changed host-side state
- whether status endpoints agree with the intended effect

## Important guardrail
A 200 response only proves the route handled the request.
It does **not** always prove the real world now matches the intended state.

## Step 5: verify the user-facing surface anyway

Even when a backend endpoint is correct, the visible surface may still be wrong.

After backend verification, check the relevant user-facing page.

## Common affected surface families
- `app.html`
- `controller-tablet.html`
- `controller-mobile.html`
- `controller.html`
- `display.html`
- `index.html`
- `peppy.html`
- `player-render.html` / `player.html`
- kiosk/controller surfaces when embedded-pane or kiosk flows are involved

## Why this matters
In `now-playing`, backend correctness and visible correctness are related but not identical.
A route can be “fixed” while the page still shows stale, embedded-mode-specific, cached, or mode-sensitive incorrect behavior.

## Step 6: verify the historically fragile areas when relevant

If the changed path touches a known fragile behavior, widen verification immediately.

## If the change touched display/runtime behavior
Also check:
- iframe vs top-level differences
- router page vs final render target behavior
- `display.html` vs direct render target behavior
- moOde host vs app-host expectation mismatch

## If the change touched playback/art/status logic
Also check:
- which playback mode is active
- whether fallback/last-good behavior is still preserved correctly
- whether mode-specific authority rules were accidentally broken

## If the change touched Next Up / queue / Alexa-related behavior
Also check:
- queue-head truth
- `/next-up` behavior
- relevant controller cards/views
- Alexa-mode differences versus non-Alexa playback

## If the change touched radio metadata/enrichment behavior
Also check:
- holdback behavior
- enrichment suppression/guardrails
- fallback logo/art behavior
- whether the new result is actually better, not just noisier

## Step 7: choose the minimum required verification set

Use this as a practical checklist.

## Change type: frontend-only page/style change
Minimum verification:
- refresh the affected surface
- verify visible result
- if embedded or display-routed, verify both the direct surface and routed/embedded context where relevant

## Change type: backend route/service change
Minimum verification:
- verify the changed endpoint directly
- restart if likely required
- verify affected user-facing surface
- verify any obvious paired diagnostics/status endpoint when available

## Change type: runtime-admin / host-control change
Minimum verification:
- verify route response
- verify status endpoint if available
- verify real host-side effect
- verify visible surface affected by the host change

## Change type: host override change
Minimum verification:
- verify the override was actually applied on the real host
- verify the live behavior changed accordingly
- verify the app-side assumption now matches host reality

## Step 8: declare success only when the right layer agrees

A change is only really verified when the relevant layers agree.

## Strong verification patterns

### Good enough for simple frontend change
- page reload shows intended visible behavior
- no backend path should have changed

### Good enough for ordinary backend change
- endpoint response is correct
- restart performed when needed
- affected surface now reflects the change

### Good enough for runtime-admin/host-control change
- endpoint response is correct
- host-side state changed as intended
- affected surface shows the intended result

### Not good enough
- “the code changed”
- “the request returned 200”
- “the config file was written”
- “the surface seems okay in one context but not another”

## Practical examples

## Example 1: route logic changed in `src/routes/art.routes.mjs`
Verify:
- art/current support endpoint behavior directly
- relevant display/controller surface
- fallback/last-good behavior if the change touched degraded-state handling
- at least one mode-sensitive case if the logic is not local-file-only

## Example 2: change in `config.runtime-admin.routes.mjs`
Verify:
- changed runtime-admin endpoint response
- whether the effect belongs on app host or moOde host
- actual moOde-side visible/resulting state if host-side control was involved
- relevant display/controller page afterward

## Example 3: change in queue/playback route logic
Verify:
- endpoint behavior
- queue/head/Next Up visible behavior
- controller queue/now-playing surfaces
- Alexa-mode differences if that path could be affected

## Best companion pages

- `deployment-and-ops.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `display-surface-troubleshooting.md`
- `playback-mode-troubleshooting.md`
- `fragile-behavior-ownership.md`
- `local-environment.md`
- `route-ownership-map.md`

## Current status

At the moment, this page gives the wiki a missing operational layer for backend work.

It turns a vague habit — “check that it works” — into a more reliable sequence:
- classify the change
- decide restart sensitivity
- identify the real effect host
- verify endpoint behavior
- verify visible behavior
- widen verification when the path is historically fragile
