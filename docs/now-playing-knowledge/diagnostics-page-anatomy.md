# diagnostics page anatomy

## Purpose

This page documents the internal anatomy of `now-playing/diagnostics.html`.

It exists because `diagnostics.html` is one of the most operator-dense pages in the project.
It is not just a status page. It is a live diagnostics console with:
- endpoint selection and execution
- path/method/body editing
- optional track-key injection
- curl and response copy helpers
- favorites
- embedded live UI surface cards
- shell/standalone behavior

This page is meant to help future agents answer questions like:
- “where does the request runner live?”
- “where are the favorites stored and rendered?”
- “which region owns the live preview cards?”
- “where does x-track-key behavior get toggled?”

## Why anatomy matters here

People will ask for changes like:
- improve the request runner
- add or change endpoint favorites
- tweak curl copy behavior
- change the embedded live cards
- adjust track-key testing behavior

Those are anatomy questions, not just “work on diagnostics.html.”

## High-level role of `diagnostics.html`

A good current interpretation is:
- `diagnostics.html` is the browser-side operator/debug console
- it is a bridge between raw API truth and visible UI truth
- it combines request execution and embedded live surface monitoring in one page

So it should be understood as an interactive debugging dashboard, not a passive report.

## Main anatomical regions

The current diagnostics page is best understood as these major regions:

1. shell redirect / page header layer
2. request runner card
3. request body / method / path controls
4. favorites and endpoint selection layer
5. track-key-aware execution controls
6. response / copy / curl helper layer
7. live embedded surface card grid
8. diagnostics script orchestration layer

## 1. Shell redirect / page header layer

### What it is
Like other operator pages, `diagnostics.html` includes shell-entry behavior that determines whether it runs standalone or under:
- `app.html?page=diagnostics.html`

### Why it matters
This matters whenever behavior differs between standalone and shell-hosted execution.

## 2. Request runner card

### What it is
This is the main request-console region.

Key anchors include:
- `#endpointFilter`
- `#endpoint`
- `#method`
- `#path`
- `#body`
- `#runBtn`
- `#status`

### What it does
This region lets the operator:
- choose or filter a known endpoint
- select request method
- edit the path
- provide JSON body for POST requests
- execute the request and inspect result

### Why it matters
This is the core of the diagnostics page. If someone asks to improve diagnostics, this is usually the first place to look.

## 3. Request body / method / path controls

### What they are
These are the request-shaping controls inside the runner card.

Important anchors include:
- `#method`
- `#path`
- `#body`

### What they do
These controls shape the outbound request and determine whether the operator is exercising GET/POST behavior, custom path targets, or raw JSON body submission.

### Why they matter
A lot of “diagnostics behavior” questions are really about this subregion rather than the whole page.

## 4. Favorites and endpoint selection layer

### What it is
This is the endpoint-selection and favorite-management region.

Important anchors include:
- `#endpoint`
- `#favBtn`
- filter-driven endpoint selection behavior

### What it does
This region allows operators to:
- choose from known endpoints
- filter the available list
- mark favorites
- quickly return to common debug paths

### Why it matters
This is one of the most operator-productivity-sensitive parts of the page.

### Companion pages
- `api-service-overview.md`
- `route-ownership-map.md`

## 5. Track-key-aware execution controls

### What they are
These are the controls that determine whether protected requests are executed with track-key support.

Important anchors include:
- `#useTrackKey`

### What they do
This region lets the diagnostics page test both:
- open/unprotected behavior
- track-key-protected behavior

### Why it matters
This is one of the strongest examples of Diagnostics being a true operator tool rather than just an API toy.

### Companion pages
- `backend-change-verification-runbook.md`
- `deployment-and-ops.md`

## 6. Response / copy / curl helper layer

### What it is
This is the helper/output region around request execution.

Important anchors include:
- `#copyBtn`
- `#copyCurlBtn`
- response output/status area

### What it does
This region helps the operator:
- inspect response output
- copy raw response
- copy an equivalent curl command

### Why it matters
This is one of the parts of Diagnostics most likely to be used during real troubleshooting or cross-checking outside the UI.

## 7. Live embedded surface card grid

### What it is
This is one of the most distinctive parts of the page: embedded live view cards.

Current visible regions include live cards for:
- now-playing view
- player view
- peppy view
- controller view
- kiosk view

### What they do
These cards let the operator compare:
- API truth
- against visible UI truth

without leaving the diagnostics page.

### Why they matter
This is one of the most valuable anatomy distinctions in the page.
A lot of “diagnostics” power actually lives in this side-by-side embedded-surface behavior.

### Companion pages
- `display-surface-troubleshooting.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`

## 8. Diagnostics script orchestration layer

### What it is
Most of the page behavior appears to be driven by:
- `scripts/diagnostics.js`

### What it does
This script likely orchestrates:
- endpoint catalog/filtering
- favorite handling
- request execution
- track-key attachment
- curl generation
- response copy logic
- embedded-card refresh behavior
- shell/live-surface sync behavior

### Why it matters
A request to improve diagnostics behavior usually belongs here rather than in the page markup alone.

## Practical “where do I start?” map

### If asked to improve endpoint execution flow
Open first:
- `#endpointFilter`
- `#endpoint`
- `#method`
- `#path`
- `#body`
- `#runBtn`
- `scripts/diagnostics.js`

### If asked to improve favorites
Open first:
- `#endpoint`
- `#favBtn`
- favorites logic in `scripts/diagnostics.js`

### If asked to improve track-key testing
Open first:
- `#useTrackKey`
- request execution logic in `scripts/diagnostics.js`

### If asked to improve curl copy or response copy behavior
Open first:
- `#copyCurlBtn`
- `#copyBtn`
- response/curl helper logic in `scripts/diagnostics.js`

### If asked to improve the embedded live cards
Open first:
- embedded surface card markup in `diagnostics.html`
- refresh/reload logic in `scripts/diagnostics.js`
- the relevant target surface if the issue is really in the child page

## Anatomy rule for future agents

For `diagnostics.html`, do not assume a requested change belongs only to:
- page markup
- request execution logic
- or embedded preview cards

Always classify the target first:
- request-runner behavior
- request-shaping controls
- favorites/selection behavior
- track-key/protected execution behavior
- response/curl helper behavior
- embedded live-surface behavior

That classification step should prevent wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `diagnostics-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `api-service-overview.md`
- `route-ownership-map.md`
- `backend-change-verification-runbook.md`
- `display-surface-troubleshooting.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`

## Current status

At the moment, this page gives the wiki its seventh real page-anatomy reference.

Its main job is making explicit that `diagnostics.html` is not just a diagnostics readout.
It is a multi-region debugging console with:
- request execution
- endpoint selection/favorites
- track-key-aware testing
- copy/curl helpers
- and embedded live surface monitoring.
