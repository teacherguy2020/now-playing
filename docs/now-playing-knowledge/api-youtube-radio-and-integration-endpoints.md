# api youtube radio and integration endpoints

## Purpose

This page documents the API endpoint families most directly associated with feature-specific integrations currently covered in the wiki.

Right now, the clearest documented families are:
- YouTube integration endpoints
- radio metadata debug/evaluation endpoints
- nearby integration-adjacent podcast automation endpoints

This page exists so those routes are documented in an API-centered way rather than only through UI pages.

## Why this page matters

These routes are where external-content and integration-heavy features become concrete.
They are not generic config-control routes.
They are the routes that:
- search YouTube
- expand playlists
- resolve YouTube metadata
- queue YouTube content into playback workflows
- expose radio metadata transformation logs
- clear radio debug logs
- support integration-adjacent automation like podcast nightly runs

This is the integration-feature side of the API branch.

## Auth / protection model

Current wiki work shows that several of these routes rely on the same app-host auth pattern used elsewhere:
- track key required for protected operations
- sent via:
  - `x-track-key`

This is especially explicit in the YouTube workflows.

## 1. YouTube endpoint family

This is the clearest integration-feature route family currently documented.

### Documented endpoints
- `POST /youtube/search`
- `POST /youtube/playlist`
- `POST /youtube/resolve`
- `POST /youtube/queue`

### What they do

#### `/youtube/search`
Used to search YouTube from the in-app YouTube surface.

Current documented request shape includes fields like:
- `query`
- `limit`
- `playlistsOnly`

Current documented role:
- returns searchable results that can then be used directly or expanded as playlists

#### `/youtube/playlist`
Used to expand a playlist URL into individual selectable items.

Current documented request shape includes fields like:
- `url`
- `limit`

Current documented role:
- returns playlist items for selection/curation before queueing

#### `/youtube/resolve`
Used to resolve a direct YouTube URL into metadata.

Current documented request shape includes:
- `{ url }`

Current documented role:
- resolve title/channel/duration/source metadata before queueing

#### `/youtube/queue`
Used to push one or many YouTube URLs into playback/queue workflows.

Current documented request shape includes fields like:
- `url`
- `urls`
- `mode`

Current documented queue modes include:
- `append`
- `crop`
- `replace`

### Why this family matters
This family is one of the clearest examples of an external-content bridge exposed through the app-host API.

It is not just metadata lookup. It is:
- search
- selection
- playlist expansion
- metadata resolution
- queue submission

## 2. Radio metadata debug / evaluation family

This family is diagnostics-oriented rather than end-user-facing, but it is still a meaningful integration branch because it exposes the quality of radio metadata transformation.

### Documented endpoints
- `GET /debug/radio-metadata-log?limit=<n>`
- `POST /debug/radio-metadata-log/clear`

### What they do

#### `/debug/radio-metadata-log`
Used to retrieve recent radio metadata evaluation rows.

Current documented role:
- expose raw metadata
- expose parsed metadata
- expose lookup/enrichment reason
- support client-side GOOD / PARTIAL / BAD verdicts

#### `/debug/radio-metadata-log/clear`
Used to reset the evaluation sample set.

Current documented role:
- support repeated QA/debug cycles
- clear old rows so new stream tests are easier to inspect

### Why this family matters
This route family is one of the clearest diagnostics windows into a complicated integration problem:
- weak stream metadata
- parsing heuristics
- enrichment attempts
- final display-quality outcomes

So even though these are debug routes, they are central to the radio integration story.

## 3. Podcast automation routes adjacent to integration work

These routes are somewhat special.
They are not external-content integration routes in quite the same way as YouTube, but they are feature-specific automation routes that sit closer to integration behavior than to the core config-control plane.

### Documented endpoints
- `GET /podcasts/nightly-status`
- `POST /podcasts/nightly-run`

### What they do

#### `/podcasts/nightly-status`
Used by Config to verify whether nightly podcast automation has been active.

Current documented role:
- report whether automation is active
- show last-run time when available

#### `/podcasts/nightly-run`
Used as the target of generated cron automation.

Current documented role:
- kick off nightly podcast automation on the API host

### Why this family matters
These routes help show that the API service also exposes feature-specific automation surfaces, not just UI-triggered interactive calls.

## Relationship between these route families

A good current interpretation is:
- `/youtube/*` is the external-content ingestion family
- `/debug/radio-metadata-log*` is the radio metadata QA/inspection family
- `/podcasts/*` is a feature-specific automation family with operational overlap

These routes are different from the config/runtime control-plane routes because they are more tightly bound to specific feature branches.

## Relationship to existing wiki pages

This page should stay linked with:
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `youtube-interface.md`
- `radio-metadata-eval-interface.md`
- `integrations.md`

## Things still to verify later

Future deeper API work should clarify:
- exact response shapes for the YouTube routes
- how `/youtube/queue` maps into downstream playback and queue behavior
- where the radio metadata debug rows are produced in route/service code
- whether additional integration-heavy families should join this page later (for example more podcast or external-media routes)

## Current status

At the moment, this page gives the wiki an API-centered home for the clearest integration-feature endpoint families already documented elsewhere.

That is enough to make the API branch feel more real and less hypothetical.
