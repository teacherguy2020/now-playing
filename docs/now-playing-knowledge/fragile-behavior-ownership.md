# fragile behavior ownership

## Purpose

This page maps historically fragile `now-playing` behaviors to the pages, route modules, helper layers, and local-environment realities that most plausibly own them.

It exists because some of the hardest problems in this project are not broad architectural questions anymore.
They are questions like:
- what path tends to break?
- where does that path actually live?
- what guardrail already exists?
- what mistake should future agents avoid repeating?

This page is the Phase 2 bridge from:
- route ownership truth
- playback authority truth
- display/runtime troubleshooting

into:
- failure-prone engineering reality

## Important scope note

This page is intentionally about the highest-value fragile behaviors first.

It is **not** a full bug history.
It is a practical engineering reference for behaviors that are both:
- historically failure-prone
- important enough to justify specific ownership and guardrail notes

## Why this page matters

A lot of wasted time in `now-playing` comes from treating historically fragile behavior as if it were a new generic bug each time.

This page tries to stop that by making several things explicit:
- which fragile path is in play
- which files/routes to inspect first
- what kind of failure shape to expect
- what protective behavior already exists or should be preserved

## Fragile behavior 1: iframe vs top-level rendering

## Why this is fragile
This is one of the clearest cases where visible behavior can differ depending on whether a page is:
- loaded top-level
- embedded in an iframe
- routed through `display.html`
- hosted inside a controller/app shell

Historically, these differences have mattered enough to create misleading debugging paths.

## Main ownership anchors

### Page owners
- `index.html`
- `display.html`
- `app.html`
- relevant controller pages when they embed child surfaces

### Runtime/script owners
- `scripts/index-ui.js`

### Styling owners
- `styles/index1080.css`
- related page-specific CSS when the issue is surface-specific

## Typical failure shapes
- background/layer behavior differs between embedded and top-level render
- iframe-hosted display looks correct while top-level does not, or vice versa
- a router/host page gets blamed even though the final render target owns the bug
- a pure CSS explanation seems plausible, but page boot/runtime logic is actually involved

## Practical guardrails
- do not assume iframe/top-level issues are “just CSS”
- identify whether the page is the router/host or the final render target
- check embedded-state boot logic before making broad visual changes
- preserve working transparent/background/layer assumptions unless you know why they exist

## Why this belongs here
This is a classic example of a fragile behavior that crosses:
- page ownership
- runtime script ownership
- CSS/layer ownership
- surface-classification mistakes

## Fragile behavior 2: Next Up / Alexa-mode path

## Why this is fragile
Current project memory and wiki work already say this path has specific fragility.

The reason is structural:
- it spans controller UI
- queue state
- playback truth
- `/next-up`
- Alexa was-playing state
- YouTube queue hints
- queue-advance behavior

That makes it cross-layer almost by definition.

## Main ownership anchors

### API/bootstrap owners
- `moode-nowplaying-api.mjs`

### Route owners
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`

### Service/support owners
- `src/services/mpd.service.mjs`

### Alexa-side ownership areas
- `alexa/`
- `lambda_bundle/`
- `lambda_upload/` as deployment wrapper material

### Surface owners
- `app.html`
- `controller-tablet.html`
- `controller-mobile.html`
- now-playing/controller pages that expose Next Up

## Typical failure shapes
- Next Up disagrees with the real queue head
- Alexa-mode state causes queue/card behavior to differ from non-Alexa expectations
- stale hint/state contaminates visible queue preview behavior
- a route that looks like diagnostics/support turns out to participate in live visible behavior

## Practical guardrails
- treat Next Up / Alexa mode as a historically sensitive path immediately
- do not assume only the visible controller page owns the problem
- check queue-head truth and Alexa state together
- preserve working logic that prevents Alexa-mode paths from clearing or misrepresenting Next Up too aggressively

## Why this belongs here
This is exactly the kind of fragile path future agents are likely to underestimate because it looks smaller than it is.

## Fragile behavior 3: last-good-render preservation

## Why this is fragile
A common mistake in UI/data-refresh work is to treat any refresh error as permission to clear or invalidate the visible render.

Current project lessons say that is often the wrong behavior here.

In this system, preserving a last-known-good result can be the correct guardrail.

## Main ownership anchors

### Page/runtime owners
- `scripts/index-ui.js`
- relevant now-playing/display surfaces that keep the visible state stable

### Route/support owners
- `src/routes/art.routes.mjs`
- now-playing/support endpoints that feed visible state

### Conceptual ownership companion
- `playback-authority-by-mode.md`

## Typical failure shapes
- transient refresh error causes the visible hero/display to collapse to “unavailable” too quickly
- fallback or cached art gets mistaken for incorrect behavior and is removed
- aggressive clearing destroys a stable user experience that should have survived a temporary fetch problem

## Practical guardrails
- preserve last-good behavior unless there is strong evidence the state is truly invalid
- distinguish transient refresh failure from authoritative content invalidation
- remember that fallback art or cache-backed content may be the correct degraded state

## Why this belongs here
This is a failure of engineering judgment as much as code.
It is exactly the sort of old mistake a serious wiki should prevent.

## Fragile behavior 4: display wake / runtime-admin / moOde-host interaction

## Why this is fragile
This path crosses a hard real-world boundary:
- app host
- runtime-admin routes
- SSH-backed moOde host control
- local moOde override scripts

That means behavior can diverge from “what the app code seems to say” because the live host environment is part of the feature.

## Main ownership anchors

### Route owners
- `src/routes/config.runtime-admin.routes.mjs`

### Bootstrap owner
- `moode-nowplaying-api.mjs`

### Local environment / override owners
- `integrations/moode/`
- `ops/moode-overrides/`
- real moOde host state on `10.0.0.254`

### Surface owners
- `displays.html`
- `kiosk-designer.html`
- controller pages that push display/browser-url state

## Typical failure shapes
- runtime-admin endpoint says success, but the live moOde display behavior still looks wrong
- browser target and real visible target diverge
- wake/display behavior reflects local patched logic rather than stock expectations
- app-side debugging misses the fact that the real problem lives on the moOde host or override layer

## Practical guardrails
- distinguish app-host logic from moOde-host effect
- suspect local override behavior early when wake/display behavior seems strange
- do not treat runtime-admin success as sufficient proof that the real display host is now correct
- verify actual target URL / display host outcome, not only API success

## Why this belongs here
This is one of the strongest cases where “the system” is larger than the app code alone.

## Fragile behavior 5: radio metadata guardrails and enrichment suppression

## Why this is fragile
Radio/stream behavior looks deceptively simple if you assume raw metadata should always become visible output.

But the project already knows that this assumption is dangerous.

The radio path includes quality-control behavior such as:
- holdback
- cleanup/normalization
- enrichment attempts
- enrichment suppression
- station-logo fallback
- cache-backed fallback

That means apparently “missing” metadata can be intentional and correct.

## Main ownership anchors

### Route owners
- `src/routes/art.routes.mjs`
- diagnostics/support route families that expose or evaluate radio behavior

### Conceptual/behavior companions
- `playback-authority-by-mode.md`
- `radio-metadata-eval-interface.md`
- `api-youtube-radio-and-integration-endpoints.md`

### Surface owners
- radio-eval and now-playing/display surfaces that present radio-derived results

## Typical failure shapes
- weak stream metadata gets over-trusted and produces bogus album/year/link output
- holdback is mistaken for lag/bug
- suppression is mistaken for missing feature support
- station logo or fallback art gets replaced with worse guessed data

## Practical guardrails
- do not treat raw stream metadata as final truth by default
- preserve conservative enrichment behavior when confidence is low
- remember that station-logo fallback may be more correct than bad per-track art
- verify whether the system is intentionally suppressing weak metadata before changing radio logic

## Why this belongs here
This fragile path is both user-visible and easy to degrade by trying to make it “more helpful.”

## Fragile behavior 6: mode-sensitive art/current-song/status truth

## Why this is fragile
This is the broader fragility behind several narrower issues.

A lot of bugs happen because someone assumes there is one universal authority for:
- current song
- art
- status

But current wiki work already says that truth is mode-dependent.

## Main ownership anchors

### Route owners
- `src/routes/art.routes.mjs`
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`

### Service/support owners
- `src/services/mpd.service.mjs`
- local moOde/AirPlay/UPnP support paths where relevant

### Conceptual owner page
- `playback-authority-by-mode.md`

## Typical failure shapes
- local-file assumptions applied to AirPlay
- stream assumptions applied to UPnP
- fallback art treated as wrong route behavior rather than degraded correct behavior
- MPD truth assumed to fully explain a mode that also depends on app-side mediation or external metadata paths

## Practical guardrails
- classify playback mode first
- only then decide what authority chain should be trusted
- do not make cross-mode logic changes based on a single-mode failure report

## Why this belongs here
This is one of the deepest recurring causes of incorrect fixes.

## Ownership pattern across fragile behaviors

A useful pattern emerges across nearly all of these cases:

### 1. Fragility is often cross-layer
The most failure-prone paths usually span:
- top-level HTML page ownership
- route module ownership
- support/service layers
- local environment or host realities

### 2. Route modules often own more than expected
A recurring lesson in this repo is that focused route modules often contain real operational logic, not just thin request plumbing.

### 3. Local runtime reality matters
Especially for:
- AirPlay metadata
- display wake
- moOde browser target behavior

future agents should check local overrides and host-role boundaries early.

## Practical “what to inspect first” map

### If the symptom is embedded vs top-level rendering
Start with:
- `index.html`
- `display.html`
- `scripts/index-ui.js`
- `styles/index1080.css`

### If the symptom is Next Up / Alexa-mode weirdness
Start with:
- `moode-nowplaying-api.mjs`
- `src/routes/queue.routes.mjs`
- `src/routes/config.diagnostics.routes.mjs`
- relevant controller page

### If the symptom is stale-but-stable display behavior
Start with:
- last-good-render assumptions in page/runtime logic
- `src/routes/art.routes.mjs`
- current mode classification from `playback-authority-by-mode.md`

### If the symptom is display wake / moOde mismatch
Start with:
- `src/routes/config.runtime-admin.routes.mjs`
- local environment / override docs
- real moOde host verification

### If the symptom is weird radio metadata/art behavior
Start with:
- radio guardrail assumptions
- `src/routes/art.routes.mjs`
- radio diagnostics/eval surfaces
- mode classification before changing enrichment logic

## Relationship to other pages

This page should stay linked with:
- `route-ownership-map.md`
- `playback-authority-by-mode.md`
- `display-surface-troubleshooting.md`
- `gotchas-and-lessons.md`
- `local-environment.md`
- future triage/runbook pages

## What should follow this page

The next natural follow-up pages are:
- `backend-change-verification-runbook.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`

Those runbooks can turn the fragile-behavior ownership map into explicit operational checklists.

## Current status

At the moment, this page gives the wiki a more serious engineering-reference layer for old mistakes and fragile paths.

It does that by making several things explicit:
- fragile behavior is often cross-layer
- route ownership matters, but page and host ownership matter too
- some guardrails are deliberate and should not be casually removed
- mode classification and host-role classification are often the first correct debugging moves
