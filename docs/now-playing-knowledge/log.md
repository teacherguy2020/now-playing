---
title: log
page_type: support
topics:
  - metadata
  - ops
  - runtime
confidence: medium
---

# log

## Purpose

This page is the chronological record of major wiki evolution milestones.

It is not meant to replace git history.
Instead, it gives humans and agents a readable timeline of how the wiki has grown, what major phases happened, and which maintenance moves materially changed retrieval or coverage.

Use this page when the question is:
- what changed recently in the wiki?
- what major branch or retrieval layer was added when?
- how did the wiki evolve from broad coverage into a real knowledge system?

For the page catalog, use `index.md`.
For the maintenance workflow, use `wiki-operations.md`.

## Major milestones

## [2026-04-06] source-doc gap fill phase

- Added `wiki-gap-review-2026-04-06.md` to record the comparison between `now-playing/docs/` and the current wiki, with prioritized remaining gaps.
- Added `install-and-validation.md` to preserve clean-machine installer validation, idempotency, upgrade, rollback, and public-ready checks.
- Added `style-token-and-surface-naming.md` to preserve canonical UI surface vocabulary, token ownership, and historically fragile background invariants.
- Added `display-enhancement-peppy-player-flow.md` to preserve the builder-first Peppy/Player/Visualizer display-enhancement model, stable router target, HTTP bridge flow, and boot/bridge guardrails.
- Added `tablet-recents-and-lastfm.md` to preserve tablet recents-row rules, Last.fm row-source mapping, URL seeding behavior, and recents stability guardrails.
- Added `airplay-metadata-hardening.md` to preserve moOde-side AirPlay metadata hardening, watchdog behavior, and recovery/verification guidance.
- Wired the new pages into `README.md` and `index.md` so they are part of the reachable source hierarchy.
- Updated `repo-coverage-notes.md` to reflect the improved coverage of source-doc operational/design-contract areas.

## [2026-04-05] start/search and retrieval-system phase

- Added `theme-page-anatomy.md` and its rendered companion.
- Expanded rendered quick search from nav-label filtering toward a real retrieval layer.
- Added generated shared search data for rendered pages.
- Added section-aware quick-search results and heading-jump behavior.
- Propagated quick-search UX to major rendered hubs, branch pages, operator pages, and engineering-reference pages.
- Added `search-and-navigation.html` as a rendered search-first landing page.
- Added `agent-start.html` as a question-first rendered landing page for agents.
- Added synthesis/decision pages to reduce recurring confusion:
  - `kiosk-queue-shell-vs-content-owner.*`
  - `queue-interface-vs-queue-wizard.*`
- Added `wiki-operations.md` / `.html` to make ingest/query/lint maintenance behavior explicit.

## [2026-04-05] anatomy-layer phase

- Added page-anatomy references so future work can target specific cards/regions/modules instead of entire pages abstractly.
- Created anatomy pages for:
  - `app-shell-anatomy`
  - `controller-tablet-anatomy`
  - `controller-now-playing-anatomy`
  - `kiosk-shell-anatomy`
  - `controller-mobile-anatomy`
  - `config-page-anatomy`
  - `diagnostics-page-anatomy`
  - `library-health-page-anatomy`
  - `theme-page-anatomy`

## [2026-04-05] playback/queue and route-proofing phase

- Added the higher-confidence Phase 2 engineering-reference branch:
  - `queue-and-playback-model`
  - `playback-authority-by-mode`
  - `queue-wizard-internals`
  - `controller-queue-interface`
  - `route-ownership-map`
  - `fragile-behavior-ownership`
- Added runbook cluster:
  - `backend-change-verification-runbook`
  - `display-issue-triage-runbook`
  - `playback-issue-triage-runbook`
- Added `wiki-structure-notes` as a governance/maintenance page for the wiki.

## [2026-04-05] rendered-wiki usability phase

- Reworked rendered hub navigation toward grouped/collapsible browse structure.
- Fixed broken/non-clickable rendered links on key hub pages.
- Performed multiple rendered-site polish passes across hubs, config/operator pages, display/controller pages, and straggler pages.
- Added `repo-coverage-notes` as a self-audit of wiki completeness and limits.

## [2026-04-05] config and API branch expansion phase

- Deepened Config from one page into a real branch with subsystem pages.
- Added API branch pages for service overview and route families.
- Wired those branches into core hub pages so they became part of the reachable hierarchy.

## [2026-04-05] interface and surface coverage phase

- Established the wiki as interface-first rather than file-tree-first.
- Built out major interface/surface pages across desktop, tablet, phone, display, kiosk, config/diagnostics, and integration-adjacent areas.
- Created the first rendered live wiki pages in `docs/now-playing-knowledge-site/` as a browseable companion to the markdown source.

## [2026-04-05] framing and recovery phase

- Reframed the wiki around `now-playing` as a moOde-centered enhancement ecosystem.
- Recovered the README after accidental overwrite and re-established the canonical wiki location.

## Current status

At the moment, the wiki has moved through several recognizable phases:
- broad surface coverage
- deeper config/API/playback proofing
- rendered browseability and search
- anatomy and synthesis layers
- explicit maintenance workflow

That progression is part of the wiki’s knowledge too, because future agents should understand not only what the wiki says, but how and why it reached its current shape.
