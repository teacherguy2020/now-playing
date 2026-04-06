---
title: wiki-gap-review-2026-04-06
page_type: support
topics:
  - metadata
  - ops
  - display
  - documentation
confidence: high
---

# wiki gap review (2026-04-06)

## Purpose

This page records a focused comparison between:
- source documentation under `now-playing/docs/`
- the current internal wiki under `docs/now-playing-knowledge/`

It exists to make the current gap state explicit before further wiki expansion work.

This is not a complaint list.
The wiki is already strong.
The point of this page is to identify the highest-value source-doc truths that are still missing, underrepresented, or preserved only indirectly.

## Current overall assessment

Current best assessment:
- the wiki already covers the major architecture, interface families, playback/runtime boundaries, and local-environment realities well
- the main remaining gaps are not whole missing top-level branches
- the main remaining gaps are **concrete operational or design-contract docs** that are either:
  - not represented yet
  - represented only abstractly
  - represented in weaker detail than the source docs

That means the next wiki-expansion phase should favor:
- smaller, high-value child/support pages
- stronger preservation of operational checklists and design invariants
- fewer broad new parent pages

## High-value gaps identified

## 1. Install and validation workflow

Primary source:
- `now-playing/docs/INSTALL_VALIDATION.md`

Current wiki state:
- deployment and ops are covered well in principle
- but installer/public-setup validation is not captured as its own durable wiki page

Why this matters:
- installer behavior is different from ordinary local deploy work
- clean-VM validation, idempotency, `.env` preservation, upgrade behavior, rollback drills, and negative tests are practical truths worth preserving
- this becomes especially important if the project is shared, reinstalled, or prepared for public use

Current gap summary:
- missing dedicated install-validation page
- missing explicit installer smoke-test checklist in the wiki
- missing explicit public-ready gate in the wiki

## 2. Style/token naming canon and background invariants

Primary source:
- `now-playing/docs/style-naming-map.md`

Current wiki state:
- theme and interface structure are documented
- but the explicit canonical vocabulary for surfaces/tokens and the associated background invariants are not preserved in a dedicated wiki page

Why this matters:
- this is exactly the kind of design-system contract that future UI work can accidentally break
- the “background invariants” are historically regression-prone enough that they deserve durable documentation
- surface-name normalization helps future refactors avoid semantic drift

Current gap summary:
- missing dedicated style-naming / token-ownership page
- missing explicit preservation of shell/background invariants in the wiki

## 3. Display enhancement as a builder-first Peppy/Player system

Primary source:
- `now-playing/docs/14-display-enhancement.md`

Current wiki state:
- display branch, visualizer, kiosk, and moOde target routing are covered strongly
- but the Peppy/Player display-enhancement workflow is represented more conceptually than operationally

Why this matters:
- the source doc preserves several concrete truths that are easy to lose if only abstract display pages exist
- these include:
  - ALSA -> HTTP bridge split for VU vs spectrum feeds
  - explicit exclusivity between HTTP bridge mode and native fullscreen spectrum mode
  - boot persistence caveat for moOde-side HTTP targets
  - builder control taxonomy for Peppy mode
  - stable router-target workflow as an intentional system design

Current gap summary:
- missing dedicated display-enhancement child page under the display branch
- missing explicit builder-first Peppy/Player operational model in the wiki

## 4. Deploy/runtime operator checklists in compact operational form

Primary sources:
- `now-playing/docs/11-deploy-pm2-rollback.md`
- `now-playing/docs/12-troubleshooting.md`

Current wiki state:
- deployment and troubleshooting are already strong branches
- but some concise operator-facing source-doc contracts are still more diffuse in the wiki than in the source docs

Why this matters:
- the source docs preserve crisp practical rules such as:
  - one launch owner only
  - durable config-path hardening
  - PM2 vs systemd command examples
  - very short runtime smoke checks
- those are useful retrieval targets during live work

Current gap summary:
- likely best solved by strengthening or companion-linking existing ops pages rather than creating an oversized new branch
- still worth preserving explicitly

## 5. Cross-surface parity and behavior contracts

Primary sources:
- `now-playing/docs/08-hero-shell.md`
- `now-playing/docs/09-index-vs-app.md`
- `now-playing/docs/10-random-vs-shuffle.md`

Current wiki state:
- related themes appear across app-shell, playback, and display pages
- but the specific parity contracts are not yet preserved as strongly as in the source docs

Why this matters:
- these are exactly the subtle rules that regress when they are only “known informally”
- especially:
  - hero transport and next-up card behavior
  - required parity between `index.html` and `app.html`
  - random vs shuffle semantics and policy

Current gap summary:
- underrepresented as explicit invariants
- likely best handled through compact child/support pages or stronger existing branch sections

## 6. Tablet recents and Last.fm behavior contract

Primary source:
- `now-playing/docs/20-controller-recents-lastfm.md`

Current wiki state:
- tablet branch exists
- but current tablet pages are still more hub-oriented than contract-oriented in this area

Why this matters:
- the source doc preserves strong concrete rules around:
  - allowed `recentRows` values
  - one-time URL seeding behavior
  - refresh guardrails
  - no-empty-overwrite and change-only replacement behavior
- those are high-value durable behavioral constraints

Current gap summary:
- should become a dedicated tablet child page
- currently underrepresented in practical detail

## 7. AirPlay metadata hardening as an ops recipe

Primary source:
- `now-playing/docs/21-moode-airplay-metadata-hardening.md`

Current wiki state:
- local-environment notes mention the override
- but the source doc preserves more implementation/verification detail than the wiki currently does

Why this matters:
- host-side override behavior needs recovery-grade documentation
- verification steps and mirrored-source-of-truth guidance are useful during live repair work

Current gap summary:
- should become a dedicated support/ops page or a stronger ops child page

## Areas already covered strongly enough

These source-doc branches appear already well represented in the wiki:
- kiosk branch
- display branch structure
- visualizer behavior
- YouTube interface
- theme editor
- local environment and host-role boundaries
- playback-mode troubleshooting
- moOde remote display blanking fix

This matters because it prevents overreacting and recreating pages that the wiki already covers well.

## Recommended next additions

Highest-value next wiki additions:

1. `install-and-validation.md`
2. `style-token-and-surface-naming.md`
3. `display-enhancement-peppy-player-flow.md`
4. `tablet-recents-and-lastfm.md`
5. `airplay-metadata-hardening.md`

## Recommended integration points

These new pages should be linked from:
- `index.md`
- `README.md`
- `repo-coverage-notes.md`
- their relevant branch parent pages

Likely branch placements:
- `install-and-validation.md` -> supporting / environment / operations pages
- `style-token-and-surface-naming.md` -> supporting / environment / operations pages, and linked from theme/display pages
- `display-enhancement-peppy-player-flow.md` -> display branch
- `tablet-recents-and-lastfm.md` -> tablet branch
- `airplay-metadata-hardening.md` -> supporting / environment / operations pages and local-environment links

## Current status

At the moment, the wiki’s next growth phase should focus on:
- preserving concrete source-doc contracts
- preserving recovery/verification checklists
- preserving design-system invariants
- adding a few strong child/support pages instead of broad new branches

That is the right follow-on move for a wiki that already has strong top-level coverage.