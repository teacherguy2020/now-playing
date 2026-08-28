# open questions

## Purpose

Useful companion pages for this branch:
- `source-map.md`
- `architecture.md`
- `system-overview.md`
- `integrations.md`
- `workflows.md`
- `gotchas-and-lessons.md`
- `deployment-and-ops.md`
- `local-environment.md`

This page records real unresolved questions, ambiguities, and mapping gaps in the `now-playing` knowledge base.

It is not a generic backlog. It should contain things future agents would genuinely need clarified, mapped, or confirmed.

## Questions that are really mapping TODOs

Useful references for this branch:
- `source-map.md`
- `architecture.md`
- `system-overview.md`
- `integrations.md`
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`

- Which remaining route families most need additional file-level proofing beyond the current anchors (especially transport controls and radio/playlist management)?
- Where are the clearest additional route/service/helper handoff examples beyond the queue/playback, display/runtime, and browse/queue-wizard traces already verified?
- Which files or routes own the historically fragile behaviors called out in `gotchas-and-lessons.md` that are not already covered by the current iframe/display, Next Up/Alexa, and playback-mode authority mapping?
- TODO: keep promoting the most important newly verified file-level mappings into `source-map.md`, `architecture.md`, `system-overview.md`, `integrations.md`, `workflows.md`, and `gotchas-and-lessons.md` as they are confirmed.

## Questions that are true runtime or behavior uncertainties

Useful references for this branch:
- `deployment-and-ops.md`
- `local-environment.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`
- `restart-and-runtime-admin-troubleshooting.md`

- Which services/processes should be checked first after backend or integration changes in Brian’s current environment?
- Which restart actions are required for which classes of changes in current live operation, beyond the now-documented restart-boundary model?
- Which local patches and overrides materially affect runtime behavior beyond the moOde watchdog/display-wake and `airplay-json` notes already captured?
- Which environment-specific assumptions are still current and which are only historical?

## Questions that depend on Brian-specific local reality

Useful references for this branch:
- `local-environment.md`
- `display-interface.md`
- `display-surface-troubleshooting.md`
- `now-playing-surface-variants.md`
- `gotchas-and-lessons.md`

- Which user-facing surfaces are still most sensitive to iframe-vs-top-level differences in current live use, beyond the now-verified page/runtime ownership clues?
- Which surfaces are most tightly coupled to local display/runtime state rather than only frontend code?
- Which Alexa-mode / Next Up behaviors are still current concerns versus already fully stabilized?
- Where exactly is last-good-render preservation implemented, and under what failure conditions does it apply?
- Which MPD/moOde/runtime-admin/host-control interactions are most likely to diverge between stock expectations and Brian’s live setup?

## Questions that should probably become runbooks later

Useful references for this branch:
- `workflows.md`
- `playback-mode-troubleshooting.md`
- `display-surface-troubleshooting.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `integrations.md`
- `api-playback-and-queue-endpoints.md`

- Which integration paths are actively used in current practice versus only documented historically?
- Which request endpoints or route families are most important for future agents to know first?
- Which integration failures are common enough to deserve dedicated troubleshooting notes later?
- Which deploy/restart-sensitive route/runtime-admin/moOde-control flows deserve dedicated runbooks later?
- Which playback-mode-specific troubleshooting flows (local file, AirPlay, UPnP, radio/stream, fallback) deserve dedicated runbooks later?
