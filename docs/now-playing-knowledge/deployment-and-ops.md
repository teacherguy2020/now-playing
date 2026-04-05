# deployment and ops

## Purpose

Useful companion pages for this branch:
- `local-environment.md`
- `integrations.md`
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `config-network-and-runtime.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `display-surface-troubleshooting.md`
- `source-map.md`

This page captures the operational side of the `now-playing` project:
- setup and installation themes
- service/runtime control concerns
- verification habits
- deployment assumptions
- where local environment details matter most

It is meant as the bridge between project structure and real running behavior.

## Documented operational areas

The DeepWiki corpus explicitly includes operational/admin topics such as:
- installation and setup
- installing missing runtime dependencies like `mpc`
- installing PM2 if missing
- API-host-specific operation
- configuration management
- service control
- runtime verification
- checking current app URL
- checking running Chromium process
- checking patched endpoints
- verifying wake display configuration
- administration

This strongly suggests that the project should be treated as an actively operated system, not just a code repository.

## Deployment-related themes

Useful references for this branch:
- `local-environment.md`
- `source-map.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`

The documentation points to several deployment-adjacent themes:
- environment preparation matters
- missing host dependencies are a real concern
- service management is part of normal operation
- host-specific behavior exists
- display/runtime state must sometimes be verified directly
- local overrides can materially change what “correct” runtime behavior looks like

Inferred from the doc set and local context:
- deploy success is not only about shipping code; it also depends on the target machine’s runtime state and service/process condition
- configuration and runtime verification are part of the deploy loop
- host selection should be treated as an early operational decision, not an afterthought

Repo-verified refinement:
- current operational control is more route/runtime-admin-centered than old helper-script-centered in several important areas
- some older script assumptions are stale (`scripts/deploy-pi.sh` and `scripts/healthcheck.sh` are not present in the current repo)
- `src/routes/config.runtime-admin.routes.mjs` is a major live operational surface: it owns config writes, restart endpoints, host/runtime checks, and SSH-backed moOde/display/Peppy/mpdscribble control paths

Distinctions that should stay explicit:
- some work is deploy-sensitive because it changes shipped code, routes, dependencies, or service behavior
- some work is verification-sensitive even when it is not a full deploy
- frontend-only changes and backend/integration changes should not be treated as operationally identical
- runtime-admin and host-control changes should not be treated as equivalent to passive frontend/content edits

## Change classes and what they usually imply

### Frontend / page / style changes
Typical examples:
- top-level HTML page edits
- CSS/style tweaks
- visual/layout-only JS changes

Usually implies:
- often no API restart
- verify the visible result on the relevant user-facing surface
- still watch for iframe/runtime/display-state edge cases on affected surfaces

### Route / service / config / runtime-admin changes
Typical examples:
- route logic changes
- service/helper changes that affect live endpoints
- config shape or config-consuming behavior changes
- runtime-admin endpoint behavior changes

Usually implies:
- likely API restart or at least explicit runtime verification
- verify the relevant live endpoints after the change
- verify affected user-facing surfaces, not just code paths

Repo-verified restart-boundary refinement:
- `src/config/load-config.mjs` loads config from disk, but many runtime values in `src/config.mjs` are also shaped by `process.env`
- `config.runtime-admin.routes.mjs` writes config to disk via `/config/runtime`, but explicitly warns: `Restart api with --update-env to apply env-overridden values.`
- some values can become effectively live sooner when route handlers read config from disk on each request or update selected `process.env` values directly (for example `LASTFM_API_KEY`)
- other values remain restart-sensitive because module-level config exports and env-derived constants were already initialized when the API booted
- `/config/restart-api` currently attempts `pm2 restart api --update-env` first, then falls back to restarting `now-playing.service` via systemd

Practical implication:
- do not treat all config writes as immediately live
- ask whether the changed setting is read per-request, patched into process env immediately, or captured at API startup via module-level config/env initialization

### Runtime-admin or host-control actions
Typical examples:
- moOde display-mode changes
- browser URL changes
- PeppyMeter / PeppyALSA actions
- mpdscribble or related service controls

Usually implies:
- immediate host-side state changes are possible
- verify host/service/process state, not just API responses
- treat these as live operational actions, not passive config edits

### Host override changes
Typical examples:
- changes under `integrations/moode/` that require host application
- changes mirrored under `ops/moode-overrides/`

Usually implies:
- separate host-side deployment/apply path
- normal app deploy assumptions do not fully cover these changes
- verify on the real moOde host after applying

## Runtime verification and service control

Useful references for this branch:
- `api-config-and-runtime-endpoints.md`
- `config-network-and-runtime.md`
- `config-lastfm-and-scrobbling.md`
- `config-alexa-setup.md`
- `config-display-and-render-features.md`
- `display-surface-troubleshooting.md`
- `restart-and-runtime-admin-troubleshooting.md`

The docs explicitly support runtime checking and service interaction, including:
- service control workflows
- runtime verification workflows
- checking active Chromium processes
- checking patched endpoints
- verifying wake/display configuration

Operationally, that means future agents should expect to do some combination of:
- verify what is actually running
- confirm runtime endpoints/URLs
- check service/process state
- verify display-specific behavior after changes
- distinguish frontend-only changes from backend/integration changes before deciding what must be restarted or rechecked
- distinguish app-runtime changes from SSH-backed moOde/host-control actions before deciding whether the change is local-app-only, API-restart-sensitive, or host-side immediately stateful

Work that is likely verification-sensitive even if it is not a full deploy:
- checking runtime behavior after a code change
- confirming patched endpoint/runtime behavior after an update
- checking running processes or display-related state after visible/UI changes
- validating display/wake behavior that depends on runtime or host state
- validating host-side effects after runtime-admin actions that touch moOde display mode, browser URL, PeppyMeter, PeppyALSA, mpdscribble, or related services

Checks that deserve explicit emphasis:
- verify the intended target host before operational work
- verify running Chromium/display state when visual behavior matters
- verify patched endpoint/runtime behavior when integration or display-control behavior is involved
- verify local override awareness before assuming stock behavior

## Local-environment dependence

Useful references for this branch:
- `local-environment.md`
- `integrations.md`
- `gotchas-and-lessons.md`
- `source-map.md`

This project has meaningful local-environment dependence.

At minimum, operational behavior depends on:
- which host is primary
- which host owns display/runtime behavior
- local patches and overrides
- the currently preferred deploy target
- whether behavior is coming from stock code or environment-specific modifications

See also:
- `local-environment.md`
- `integrations.md`
- `gotchas-and-lessons.md`

## Operational cautions

- do not assume frontend changes are the whole story; runtime/service state may matter
- do not assume documented behavior is identical to local behavior when local patches exist
- verify before and after changes when touching runtime-sensitive areas
- check local-environment guardrails before deploys or host-targeted changes
- treat display, wake, endpoint, and service issues as potentially cross-cutting problems
- if behavior looks wrong after a deploy, consider host selection, runtime state, and local overrides before assuming the code change itself is bad

## Open questions

- Which deploy/restart/verification commands should be documented here first for Brian’s actual environment?
- Which runtime checks are most important after frontend-only changes versus route/config/runtime-admin changes?
- Which services/processes are the highest priority to verify after operational changes?
- Which parts of the DeepWiki operational guidance are historical versus still current in the local setup?
- Which runtime-admin or host-control flows should become explicit runbooks first?
