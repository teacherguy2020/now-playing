# workflows

## Purpose

This page captures common work patterns for the `now-playing` project.

It is meant to help future agents and humans approach tasks in a way that matches the project’s actual shape:
- display-heavy behavior
- controller and queue flows
- integration-sensitive runtime behavior
- operational verification after changes

## Common workflow types

The documentation implies several recurring workflow categories:

- **Media and queue management**
  - media library work
  - playlist management
  - radio station handling
  - queue wizard / filter-builder flows
- **UI and display behavior**
  - display pages
  - kiosk mode
  - moOde display control
  - animated art / art caching behavior
- **Playback and control behavior**
  - transport controls
  - ratings / favorites
  - mobile controller interactions
- **Integration and request behavior**
  - MPD integration
  - YouTube integration
  - GET/POST request flows
  - header-auth request handling
- **Operational work**
  - installation/setup
  - service control
  - runtime verification
  - configuration management

Important workflow distinctions to keep explicit:
- frontend-only changes vs backend/integration/runtime-sensitive changes
- UI/display work vs runtime/display-state work
- integration debugging vs local-environment debugging
- deploy-sensitive tasks vs non-deploy-sensitive tasks

## UI and display changes

When the task is about visible behavior, the docs suggest this general pattern:

- identify the specific surface first
  - display page
  - mobile controller
  - queue/filter UI
  - kiosk/display behavior
- distinguish presentation changes from runtime/display-state changes
- check whether the behavior is tied to:
  - display pages
  - moOde display control
  - animated art/art caching
  - queue/filter logic
- after changes, verify the visible result in the actual runtime context, not only by reading code

Inferred but strongly supported by the project shape:
- some "UI" changes may actually depend on integration state, display state, or host/runtime conditions

## Integration and runtime debugging

When behavior looks wrong, the docs suggest treating debugging as cross-cutting work:

- check integration boundaries, not just frontend code
- verify request/endpoint behavior when APIs are involved
- inspect service/process state when runtime issues are suspected
- check display/wake/runtime state when output behavior is involved
- consider local-environment overrides before assuming stock project behavior

### Mode-first workflow for playback / current-song / art / status issues

When the symptom involves what is currently playing, what art should show, or what status/UI should be rendered:

1. **Classify the playback mode first**
   - local file
   - AirPlay
   - UPnP
   - radio/stream
   - unresolved/fallback-driven case
2. **Choose the likely authority path for that mode**
   - local file → MPD state + moOde `coverart.php` / current-song data
   - AirPlay → moOde current-song/status + `aplmeta.txt` / AirPlay-cover logic
   - UPnP → moOde current-song/status plus UPnP-specific resolution logic, including attempts to resolve stream-like items back to local-file cover/art truth when possible
   - radio/stream → moOde current-song/status + station-logo / enrichment / fallback logic
   - unresolved case → cache-backed `/art/current.jpg` and related fallback paths
+
+### Radio / stream troubleshooting note
+
+When the active mode is radio/stream, do not assume the displayed metadata is raw pass-through data.
+Check for these layers in order:
+
+- **holdback policy**
+  - some strict stations intentionally hold metadata briefly to avoid flashing stale titles
+- **lookup guardrails**
+  - enrichment can be intentionally skipped when metadata quality looks too weak, generic, or misleading
+- **cleanup / normalization**
+  - iHeart-style blobs, classical formatting, and station/program text may be normalized before display
+- **art / enrichment source**
+  - station logo
+  - Mother Earth metadata
+  - iTunes/Apple-style enrichment
+  - cache-backed or moOde `coverurl` fallback
+
+Practical implication:
+- if radio metadata looks "wrong," first ask whether the system is intentionally holding, suppressing, cleaning, or falling back — not just whether the raw stream metadata was bad
3. **Then inspect the relevant code layers**
   - page/runtime layer if the symptom is primarily visible/UI-facing
   - route layer when the behavior depends on `/art/*`, `/now-playing`, `/next-up`, ratings, queue, or diagnostics endpoints
   - MPD service/helper layer when the problem looks like low-level MPD state/control truth
   - runtime-admin / local-override layer when moOde display/browser/Peppy behavior or host-side state may be involved

Practical implication:
- do not assume there is one universal authoritative source for current-song/art/status truth in this project
- do not treat UPnP as interchangeable with generic radio/stream behavior; it has its own logic branches in the current codebase
- decide which mode you are in first, then debug the matching authority path

Likely first references:
- `integrations.md`
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `gotchas-and-lessons.md`
- `source-map.md`

## Operational verification habits

The DeepWiki material strongly implies that verification is part of normal work.

Checks that should happen before changes:
- verify local context in `local-environment.md` before host-sensitive or runtime-sensitive work
- check `source-map.md` before editing so the likely ownership area is chosen intentionally
- check `deployment-and-ops.md` if the task may affect service/runtime state
- check `integrations.md` if the task involves API calls, playback integration, or cross-system behavior

Checks that should happen after changes:
- confirm what is actually running after changes
- verify runtime endpoints/URLs when request behavior is involved
- verify service/process state when operational changes are made
- verify display or wake behavior after display-sensitive edits
- distinguish frontend-only changes from changes that require runtime/service awareness
- validate against live/runtime expectations, not only static code expectations

### Restart-boundary workflow for config / runtime-admin changes

When a change touches config or runtime-admin behavior:

1. **Classify how the value is applied**
   - read per-request from disk/config
   - patched immediately into selected process env/runtime state
   - captured at API startup through module-level config/env initialization
2. **Choose the likely verification path**
   - per-request / disk-read → endpoint check may be enough
   - immediate runtime/env patch → verify the affected endpoint/behavior live
   - startup-captured → plan for API restart plus post-restart verification
3. **Then decide the operational action**
   - no restart, just endpoint + UI verification
   - API restart required (`/config/restart-api` / PM2 / systemd path)
   - host-side verification also required if the change touches moOde/browser/Peppy/service control

Practical implication:
- do not assume all config writes become live immediately
- ask whether the changed setting is read dynamically, patched into runtime state, or frozen at startup

## Boundaries and cautions

- do not assume every issue lives in one layer of the system
- do not assume documentation alone reflects the current local environment
- treat runtime-sensitive work as something to verify, not just implement
- check `local-environment.md` before host-targeted or deploy-related changes
- use `source-map.md` to find likely code areas before making broad edits

Signals a task is probably code-first:
- the change is clearly about static structure, presentation, or isolated app-side logic
- the behavior can be explained without invoking host/runtime state
- the task fits cleanly into known code areas from `source-map.md`

Signals a task is probably runtime/environment-first:
- the issue involves playback errors, integration failures, or incorrect live output behavior
- the issue involves display wake/state, service/process health, or host-specific behavior
- local overrides may plausibly explain the observed behavior

Signals a task is probably cross-layer:
- a visible/UI symptom appears tied to playback, integration, or runtime state
- a code change has observable effects that depend on live service or host conditions
- the issue resembles known iframe-vs-top-level, Next Up, or local-override-sensitive behavior

## Open questions

- Which workflow patterns are most common in current live maintenance work?
- Which changes are usually safe as frontend-only edits versus needing runtime verification?
- Which UI surfaces are most tightly coupled to integrations or host-specific behavior?
- Which workflows deserve explicit step-by-step runbooks in a later pass?
- Which tasks should be explicitly tagged as deploy-sensitive in a later version of this wiki?
- Which pivot decisions should become explicit runbooks first?
