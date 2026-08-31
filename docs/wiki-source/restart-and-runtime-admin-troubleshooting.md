# restart and runtime-admin troubleshooting

## Purpose

This runbook helps future agents decide:
- whether a change likely needs only verification or also an API restart
- whether the effect should happen on the app host or the moOde host
- whether a runtime-admin action is a passive config change or an immediate host-side control action

The key lesson: not all config/runtime changes become live the same way.

## Step 1: classify the kind of change

Start by deciding which class of change you are dealing with.

### Frontend / page / style changes
Typical examples:
- top-level HTML changes
- CSS changes
- visual/layout-only JS changes

Usually means:
- often no API restart
- verify the visible result on the relevant surface
- still watch for iframe/runtime/display-state interactions

### Route / service / config / runtime-admin changes
Typical examples:
- route logic changes
- service/helper changes affecting live endpoints
- config shape or config-consuming behavior changes
- runtime-admin endpoint behavior changes

Usually means:
- likely API restart or explicit runtime verification
- verify the relevant endpoints after the change
- verify affected user-facing surfaces too

### Runtime-admin or host-control actions
Typical examples:
- moOde display-mode changes
- browser URL changes
- PeppyMeter / PeppyALSA actions
- mpdscribble control
- host/service checks triggered through runtime-admin routes

Usually means:
- immediate host-side effects are possible
- verify host/service/process state, not just endpoint responses
- treat these as live operational actions

### Host override changes
Typical examples:
- moOde-side override scripts/configs
- material mirrored under `ops/moode-overrides/`
- manual host patches under `integrations/moode/`

Usually means:
- separate host-side apply path
- normal app deploy assumptions do not fully cover these changes
- verify on the real moOde host after applying

## Step 2: decide how the setting is applied

When config or runtime-admin behavior is involved, ask how the changed value becomes active.

### Per-request / disk-read
Signs:
- the handler re-reads config from disk
- the value is interpreted dynamically on each request

Likely action:
- endpoint verification may be enough
- UI verification may still be needed if the change affects visible behavior

### Immediate runtime/env patch
Signs:
- the route updates selected process/runtime state directly
- the route explicitly patches a value into `process.env` or equivalent live state

Likely action:
- verify the affected endpoint/behavior live
- restart may not be necessary for that specific value

### Startup-captured value
Signs:
- the value is derived at boot from module-level config or env initialization
- the route warns that env-overridden values need restart to apply

Likely action:
- plan for API restart plus post-restart verification

Important repo-verified clue:
- `/config/runtime` writes config to disk but warns:
  - **Restart api with --update-env to apply env-overridden values.**

## Step 3: decide where the effect should happen

### App host
In Brian’s current setup, this usually means the primary now-playing app host (`10.0.0.4`).

Typical effects:
- route/service/runtime behavior
- API restart-sensitive changes
- config writes and app-side endpoint behavior

Check first:
- `local-environment.md`
- `deployment-and-ops.md`
- `src/routes/config.runtime-admin.routes.mjs`
- `src/config/load-config.mjs`

### moOde host
In Brian’s current setup, this usually means `moode@10.0.0.254`.

Typical effects:
- display mode changes
- browser URL changes
- PeppyMeter / PeppyALSA behavior
- service/process state changes on the display host

Check first:
- runtime-admin route behavior
- `local-environment.md`
- `integrations/moode/README.md`
- `ops/moode-overrides/README.md`

Important caution:
- not all “runtime changes” happen on the same machine
- some are app-host/API-side only
- some are immediate SSH-backed moOde host actions

## Step 4: choose the verification path

### For frontend/page/style changes
Verify:
- the relevant surface visually
- any visible iframe/top-level differences
- any mode-specific display behavior if affected

### For route/service/config changes
Verify:
- the changed endpoint directly
- the affected user-facing surface
- whether the change behaves live without restart
- whether restart is needed to see the intended effect

### For runtime-admin actions
Verify:
- endpoint response
- host-side state or service/process condition
- user-visible effect on the relevant moOde/display surface

### For host override changes
Verify:
- that the override was actually applied on the real host
- that live behavior matches the intended host-side modification
- that you are not confusing mirrored repo material with already-applied host state

## Step 5: use the current restart path correctly

Repo-verified current restart path:
- `/config/restart-api` attempts:
  - `pm2 restart api --update-env`
  - then falls back to restarting `now-playing.service` via systemd

Practical implication:
- if the change is startup-captured or env-sensitive, use the restart path that refreshes env-backed runtime state
- do not assume writing config alone was sufficient

## Quick heuristics

- If the value is env-overridden, assume restart sensitivity until proven otherwise.
- If the route performs SSH-backed host control, verify the host effect directly.
- If the change touched runtime-admin behavior, do not treat it like a passive config edit.
- If the symptom changed in the UI but the endpoint seems correct, check whether the app surface needs refresh or whether another host is the real effect target.
- If the repo contains mirrored override docs/scripts, do not assume the real host is already in that exact state without checking.

## Best companion pages

- `deployment-and-ops.md`
- `workflows.md`
- `local-environment.md`
- `integrations.md`
- `source-map.md`
- `gotchas-and-lessons.md`
