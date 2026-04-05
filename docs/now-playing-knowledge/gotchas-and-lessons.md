# gotchas and lessons

## Purpose

Useful companion pages for this branch:
- `deployment-and-ops.md`
- `local-environment.md`
- `integrations.md`
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `display-surface-troubleshooting.md`
- `playback-mode-troubleshooting.md`
- `source-map.md`

This page records project-specific traps, sharp edges, and durable lessons for the `now-playing` project.

It is meant to help future agents avoid repeating known mistakes, especially where local environment details and historically fragile behaviors matter.

## Confirmed lessons from local memory

- Primary deploy target is Pi5 at `brianwis@10.0.0.4:/opt/now-playing/`.
- Do **not** use `/home/brianwis/apps/now-playing-next` unless explicitly requested.
- Pi4 / `server-pi` path is legacy or non-primary unless the user explicitly asks for it.
- Frontend-only changes may not require a backend restart, but backend route changes may require one.
- Iframe vs top-level rendering differences have mattered before.
- Alexa-mode / Next Up behavior has had specific fragility.
- Transient refresh errors should not automatically destroy the last-good render.
- moOde watchdog/display wake behavior and `airplay-json` behavior may differ from stock because of local overrides.

## Likely operational gotchas

Useful references for this branch:
- `deployment-and-ops.md`
- `local-environment.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`

- It is easy to deploy to the wrong host or wrong path if you do not check current deploy guardrails first.
- Frontend and backend changes do not have the same restart requirements.
- Runtime behavior may reflect local overrides rather than upstream/default project behavior.
- Verification after changes matters because “code changed” and “live system behavior changed” are not the same thing in this project.

## Likely integration gotchas

Useful references for this branch:
- `integrations.md`
- `api-service-overview.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`
- `config-lastfm-and-scrobbling.md`
- `config-alexa-setup.md`

- moOde-related behavior may be shaped by local custom patches, not just project code.
- MPD / playback-side behavior and display/runtime behavior may interact in ways that make bugs look like they live in the wrong layer.
- Alexa-mode / Next Up behavior has a history of fragility, so those paths should be treated as sensitive.
- Request/refresh failures should not always be treated as total-state failure if last-good render logic exists.
- Radio/stream metadata can be intentionally non-literal:
  - holdback policy may delay new text briefly
  - lookup guardrails may intentionally suppress enrichment
  - malformed stream metadata may be cleaned before display
  - station logos or fallback art may be preferred over bad enrichment
  - avoiding bogus album/year/link text is sometimes the correct behavior, not a missing-feature bug

## Likely UI/display gotchas

Useful references for this branch:
- `display-interface.md`
- `display-surface-troubleshooting.md`
- `now-playing-surface-variants.md`
- `config-display-and-render-features.md`
- `api-playback-and-queue-endpoints.md`

- Behavior can differ between iframe rendering and top-level page rendering.
- Display-state issues may be rooted in runtime/bootstrap/display-layer interactions rather than simple CSS mistakes.
- Art/display behavior may be affected by caching or fallback logic, not only the visible UI layer.
- What looks like a presentation bug may actually be tied to playback state, integration state, or local display-control logic.
- In this repo, many important behaviors are route-heavy and cross-layer; do not assume visible issues live only in CSS or only in a thin frontend layer.
- Check page entrypoint HTML, page JS/runtime logic, route-backed support endpoints, and runtime-admin/moOde display-control flows together when a symptom spans UI + live behavior.

## Things future agents should check first

Useful references for this branch:
- `deployment-and-ops.md`
- `local-environment.md`
- `workflows.md`
- `source-map.md`
- `display-surface-troubleshooting.md`
- `playback-mode-troubleshooting.md`

- Confirm the correct deploy target before making operational assumptions.
- Determine whether a change is frontend-only or touches backend routes/runtime behavior.
- Check `local-environment.md` before host-targeted, moOde-related, or deploy-sensitive work.
- When display behavior looks wrong, ask whether the issue could be iframe-vs-top-level, local override behavior, or stale runtime state.
- Preserve and respect last-good-render behavior instead of treating transient refresh issues as full invalidation by default.

Practical triage heuristics that should stay explicit:
- if the symptom involves display state, moOde behavior, wake behavior, or AirPlay metadata behavior, suspect local overrides early
- if the symptom involves visible UI plus weird live behavior, suspect a cross-layer problem rather than assuming a pure frontend issue
- if the symptom appears after a deploy or push, verify host/path assumptions before assuming the code itself is wrong
- if Next Up / Alexa-mode behavior is involved, treat it as a historically fragile area and widen the investigation sooner
- if a route family is already known to own substantial operational logic (queue, runtime-admin, browse/queue-wizard, art, ratings), do not assume the important behavior has been abstracted away into a deeper service layer

## Open questions

- Which additional local runtime/service quirks should be promoted here from future work?
- Which fragile behaviors deserve their own dedicated runbooks later?
- Which repo files most directly implement the known fragile paths called out in memory?
