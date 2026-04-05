# integrations

## Purpose

This page records the major external systems and integration patterns documented for the `now-playing` project.

It is meant to help future agents answer questions like:
- what outside systems does this project depend on?
- what protocols or request patterns show up repeatedly?
- where should I look first when debugging integration behavior?

## Documented integrations

The DeepWiki material explicitly documents or strongly centers these integration areas:

- **MPD**
  - documented via `MPD_Integration.md`
  - likely central to playback/control behavior
- **YouTube**
  - documented via `YouTube_Integration.md`
  - relevant where remote/online content sources are involved
- **moOde**
  - documented via `moOde_Display_Control.md`
  - important for display behavior and local playback/display ecosystem coordination
- **HTTP/API request flows**
  - documented via `GET_request.md`, `POST_request.md`, and `Using_header_auth_instead_of_query_param.md`
  - important wherever the system talks to external or adjacent services

## Related integration surfaces

- `youtube-interface.md`
- `radio-metadata-eval-interface.md`
- `alexa-interface.md`

`youtube-interface.md` is the most direct current wiki page for the repo-visible YouTube ingress surface.

`radio-metadata-eval-interface.md` is the most direct current wiki page for inspecting radio metadata parsing and enrichment quality.

`alexa-interface.md` is the most direct current wiki page for Alexa correction, recently-heard review, and voice-command guidance.

## Request and API patterns

The docs explicitly indicate these request/interaction patterns:

- HTTP GET request flows are documented
- HTTP POST request flows are documented
- header-based authentication is documented as an alternative to query-parameter auth
- API-host-related behavior is important enough to have dedicated operational documentation

Implication for future work:
- request behavior is part of the project’s operating surface, not just an implementation detail
- changes to routes, request auth, or external calls should be treated as integration work, not purely local code changes

## Display and playback ecosystem

The documented ecosystem connects playback, display, and control concerns:

- **MPD** is part of the playback/control side
- **moOde** is part of the display/runtime side
- **YouTube** is part of the external content side
- **Display Pages**, **Mobile Controller**, **Transport Controls**, and related surfaces sit on top of these lower-level integrations

Integration distinctions that should stay explicit:
- playback integration is not the same thing as display/runtime integration
- request/API flows are not the same thing as user-facing control surfaces
- some integration behavior is likely static/documented, while some is clearly runtime- and environment-dependent
- the live MPD/moOde boundary is mixed rather than cleanly layered

Repo-verified refinement:
- MPD primitives are exposed through reusable app-side helpers like `src/services/mpd.service.mjs`
- some route modules mix MPD-side and moOde-side truth directly (for example queue, rating, and art/current-song behavior)
- runtime-admin routes separately own SSH-backed moOde/display/browser/peppy host control
- host overrides remain a distinct layer: documented as manual/opt-in under `integrations/moode/` and mirrored as tracked live-system overrides under `ops/moode-overrides/`
- current-song / art / status authority depends on playback mode rather than one universal source:
  - local file playback tends to resolve art via moOde `coverart.php`
  - AirPlay tends to resolve art via `aplmeta.txt` / AirPlay-cover logic
  - UPnP has its own branch: moOde current-song/status plus UPnP-specific resolution logic that may try to resolve stream-like items back to local-file cover/art truth when possible
  - radio/stream behavior may prefer station-logo or enrichment-driven fallbacks
  - unresolved cases may fall back through cache-backed `/art/current.jpg` behavior

Practical implication:
- future agents should ask which content mode is active before deciding what the authoritative playback/art/status source is
- radio/stream handling is its own nuanced branch, not just a generic fallback bucket:
  - strict stations can apply metadata holdback to avoid flashing stale track info
  - lookup guardrails can intentionally suppress enrichment when metadata looks too weak or misleading
  - station-logo, iHeart cleanup, Mother Earth metadata, iTunes/Apple-style enrichment, and final cache/coverurl fallbacks all participate in the live result
- the project is not just a static UI; it coordinates live playback state, display state, request/API flows, and external/media-system behavior
- display and playback behavior may be tightly coupled in real deployments

## Operational cautions

- integration behavior may depend on local environment details, not only generic project docs
- request/auth behavior should be treated carefully, especially where header-auth and endpoint behavior are involved
- moOde-related runtime behavior may be affected by local patches and overrides; check `local-environment.md`
- when playback/display behavior looks wrong, the issue may live in the integration boundary rather than only in frontend code
- changes to integration logic should be verified against runtime behavior, not only code review

Triage distinctions that should stay explicit:
- playback integration is distinct from display/runtime integration
- request/API flows are distinct from user-facing control surfaces
- some integration issues are mostly app-side, some are mostly request/contract-side, and some are mostly environment/override-side

Checks future agents should make when touching integrations:
- verify whether the behavior belongs primarily to playback, display/runtime, request/API flow, or a combination
- check `local-environment.md` before assuming generic integration behavior holds in Brian’s setup
- check `source-map.md` before making file-level assumptions about where the integration logic lives
- verify auth/request expectations before changing request-facing behavior

Signals an integration issue is probably app-side:
- the failure looks like app-side coordination or state-handling logic
- the symptom appears in how the system handles or propagates external state, not just in the external call itself

Signals an integration issue is probably request/contract-side:
- the issue looks tied to request formatting, auth style, or request/response expectations
- the problem appears at the boundary between an external service and the local app

Signals an integration issue is probably environment/override-side:
- behavior differs across hosts or environments
- local overrides, watchdog behavior, runtime-admin side effects, or runtime state could plausibly explain the symptom
- the same code appears to behave differently under Brian’s specific setup

## Open questions

- Which repo files and services map most directly to each documented integration area?
- Which integration paths are most active in current real-world use versus only historically documented?
- Which moOde- and MPD-related behaviors are local-environment-specific versus project-wide?
- What are the most important request endpoints or routes future agents should know first?
- Which integration areas deserve dedicated mapping tables or runbooks later?
