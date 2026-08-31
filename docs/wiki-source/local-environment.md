# local environment

## Purpose

Useful companion pages for this branch:
- `deployment-and-ops.md`
- `source-map.md`
- `integrations.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`
- `display-surface-troubleshooting.md`
- `restart-and-runtime-admin-troubleshooting.md`

This page records Brian-specific environment facts for the `now-playing` project.

It is intentionally separate from general project architecture so future agents can distinguish between:
- project-wide truths
- local installation realities

## Current known hosts and roles

- **Primary now-playing host:** `brianwis@10.0.0.4`
- **moOde host:** `moode@10.0.0.254`
- **Pi4 / legacy non-primary host:** `10.0.0.233` unless explicitly requested

Read this section as current role assignment, not just an address list.

## Current deployment assumptions

Useful references for this branch:
- `deployment-and-ops.md`
- `source-map.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`

- **Primary deploy target for active `now-playing` work:** `brianwis@10.0.0.4:/opt/now-playing/`
- Do **not** use `/home/brianwis/apps/now-playing-next` unless explicitly requested
- Current host preference is Pi5 first, not Pi4

These assumptions should stay prominent because deploying to the wrong host/path is an easy way to create confusion.

## Local patches and overrides

Useful references for this branch:
- `integrations.md`
- `source-map.md`
- `display-surface-troubleshooting.md`
- `deployment-and-ops.md`

- moOde local custom patches exist for watchdog/display wake logic
  - remote wake-on-play check was patched to read `http://<host>:3101/now-playing` state instead of querying a nonexistent `get_output_format` endpoint
  - this was done to prevent false-positive wake loops when the local display target is an external URL
- moOde local custom patches exist for `airplay-json` hardening
  - `airplay-json.service` was changed to run a hardened reader wrapper (`aplmeta-reader.sh`) instead of a raw metadata pipeline
  - watchdog support was added for sustained high CPU behavior in the AirPlay metadata reader path
- These overrides are mirrored in the repo at `now-playing/ops/moode-overrides/` for recovery/audit

## Operational guardrails

- Default deploy/push behavior should target the Pi5 host at `10.0.0.4`
- Treat Pi4 as non-primary unless Brian explicitly asks for it
- Treat `moode@10.0.0.254` as a distinct runtime context, not just a generic display host
- Preserve awareness that moOde-specific behavior may depend on local overrides, not just upstream/default behavior
- When behavior seems inconsistent, consider local patched logic before assuming stock behavior
- If debugging display wake or AirPlay metadata behavior, check whether the issue could be explained by the local override layer before changing app code

## App-host vs moOde-host control boundary

Useful references for this branch:
- `deployment-and-ops.md`
- `api-config-and-runtime-endpoints.md`
- `config-network-and-runtime.md`
- `source-map.md`

In the current setup, future agents should distinguish at least three operational categories:

- **App-host changes on the primary now-playing host (`10.0.0.4`)**
  - code deploys
  - route/service/runtime behavior
  - API restart-sensitive changes
- **SSH-backed moOde host control (`10.0.0.254`)**
  - display mode changes
  - browser URL changes
  - PeppyMeter / PeppyALSA actions
  - service/process checks and related host-side effects driven through runtime-admin routes
- **Host override material on the moOde side**
  - local patches and override scripts/configs that are separate from a normal app-code deploy
  - mirrored in-repo for audit/recovery, but still applied on the real moOde host

Practical implication:
- not all “runtime changes” happen on the same machine
- some changes require app-host deploy/restart logic
- some actions immediately affect the moOde host over SSH
- some override-layer changes require explicit host-side application outside the ordinary app deploy path

Useful environment checks to emphasize:
- verify which host role matters before deciding where a change or verification should happen
- verify the deploy target/path before assuming the right system was updated
- verify whether observed behavior could be local-override-driven before treating it as stock project behavior

## Open questions

- Add more precise host-role descriptions if additional machines/services become relevant
- Add any missing environment-specific service paths, restart commands, or verification steps
- Confirm whether more Brian-specific runtime/deploy assumptions should be promoted here from memory or ops notes
