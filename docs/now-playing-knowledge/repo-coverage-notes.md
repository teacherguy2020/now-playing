# repo coverage notes

## Purpose

This page records the current coverage state of the `now-playing` wiki against the actual `now-playing/` repository.

It exists because the wiki is meant to serve as working knowledge, not just prose.
That means it is useful to be explicit about:
- what parts of the repo are already covered well
- what parts are covered strategically rather than exhaustively
- what parts are only lightly covered
- what parts are intentionally not worth documenting in depth

This page is not a promise that every file has its own wiki entry.
It is a coverage map.

## Why this page matters

Without a page like this, future agents can easily make two opposite mistakes:
- assume the wiki is exhaustive when it is not
- assume the wiki is shallow when it actually covers the important parts well

A good knowledge system should say what it knows well and where its boundaries still are.

## Current overall assessment

A good current assessment is:
- the wiki now strongly covers the **surface/interface layer** and the main **architectural/engineering branches**
- it does **not** try to be a file-by-file encyclopedia of the entire repo
- that is mostly the right tradeoff for the project’s current maturity

Practical summary:
- **all important HTML surface families are covered**
- **major architectural branches are covered**
- **route/service/directory coverage is strategic rather than exhaustive**
- **low-value packaging/vendor/artifact areas are intentionally not mapped deeply**

## Strongly covered areas

These are the parts of the repo the wiki now covers well enough that a future agent should be able to navigate and reason about them confidently.

## 1. Top-level HTML surface layer
This is one of the strongest areas in the wiki.

Strongly covered families include:
- controller/browser/display surfaces
- kiosk-family surfaces
- now-playing variants
- config/diagnostics/library-health/theme operator surfaces
- YouTube / Alexa / radio-eval surfaces
- queue/now-playing/device alias/helper/wrapper pages

Practical meaning:
- the visible/page-level app surface area is now broadly covered
- important HTML entrypoints are no longer just filename clutter

## 2. `config/`
Coverage level: **strong**

Why:
- the config branch is one of the strongest branches in the wiki
- the main config surface, major feature breakdown, and important child pages are all documented

This includes:
- runtime/network
- podcasts/library paths
- display/render features
- ratings
- Last.fm/scrobbling
- notifications
- Alexa setup
- advanced JSON

## 3. API / playback / queue / ownership branch
Coverage level: **strong**

Why:
- this was the main Phase 2 target, and it is now substantially complete

Strongly covered pages include:
- `api-service-overview.md`
- `api-config-and-runtime-endpoints.md`
- `api-youtube-radio-and-integration-endpoints.md`
- `api-playback-and-queue-endpoints.md`
- `queue-and-playback-model.md`
- `playback-authority-by-mode.md`
- `queue-wizard-internals.md`
- `controller-queue-interface.md`
- `route-ownership-map.md`
- `fragile-behavior-ownership.md`

Practical meaning:
- the hardest conceptual and ownership-heavy parts of the system now have real engineering-reference coverage

## 4. Runtime / ops / local-environment branch
Coverage level: **strong**

Why:
- runtime reality, host boundaries, restart sensitivity, and verification paths are now explicitly documented

Strongly covered pages include:
- `deployment-and-ops.md`
- `local-environment.md`
- `backend-change-verification-runbook.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`

Practical meaning:
- the wiki now captures much more of the live-system truth, not just the project’s abstract structure

## Strategically covered areas

These parts of the repo are covered in a useful, engineering-practical way, but not at a file-by-file or subdirectory-by-subdirectory level.

## 1. `src/`
Coverage level: **strategically covered**

Why:
- the wiki does not document every file under `src/`
- but it does document many of the important ownership patterns and route/service/helper roles

Current practical coverage includes:
- route-heavy architecture
- route-family ownership for major behaviors
- MPD service role
- browse-index/helper role
- queue/playback/art/runtime-admin ownership patterns

Practical meaning:
- the wiki is useful for navigating `src/`
- it is not yet a full file-level map of `src/`

## 2. `integrations/`
Coverage level: **strategically covered**

Why:
- the integration boundary is well represented conceptually and operationally
- moOde/MPD/YouTube/Alexa/runtime relationships are documented
- local override significance is documented where it matters

Practical meaning:
- future agents can reason about integration behavior and where to look first
- but the directory is not documented exhaustively file by file

## 3. `ops/`
Coverage level: **strategically covered**

Why:
- operational importance and local override relevance are documented
- host-side override reality is represented in the wiki
- but the directory is not deeply enumerated

## 4. `alexa/`
Coverage level: **strategically covered**

Why:
- Alexa setup, Alexa interface behavior, and Alexa/Lambda-related ownership paths are documented
- the directory is represented meaningfully in the architecture/integration story
- but not every file is described individually

## 5. `scripts/`
Coverage level: **strategically covered**

Why:
- important script ownership shows up where relevant
- diagnostics/library-health/theme/index behavior touches script responsibility
- but there is no dedicated scripts map page yet

## Lightly covered areas

These directories or repo areas are represented only lightly or indirectly.

## 1. `styles/`
Coverage level: **lightly covered**

Why:
- styling ownership is mentioned where it matters
- especially in display/embed/troubleshooting paths
- but there is no CSS-by-file branch

## 2. `skins/`
Coverage level: **lightly covered**

Why:
- skins are recognized conceptually
- Peppy skin terminology now exists
- but there is no dedicated skins/display-assets branch yet

## 3. `assets/`
Coverage level: **lightly covered**

Why:
- visual assets are recognized as part of display/presentation behavior
- but not mapped in detail

## 4. `lambda_bundle/` and `lambda_upload/`
Coverage level: **lightly covered**

Why:
- they are represented in the Alexa/Lambda deployment story
- but are not deeply documented as directories in their own right

## 5. `notes/`, `exports/`, `icons/`
Coverage level: **lightly covered**

Why:
- they are visible in repo mapping
- but they are not major knowledge branches right now

## Intentionally low-value or uncovered areas

These areas are not meaningful wiki targets right now, and that is mostly fine.

## 1. `node_modules/`
Coverage level: **intentionally uncovered**

This is correct and should remain so.

## 2. Packaging artifacts, archives, and incidental assets
Examples include:
- deployment zip files
- one-off images
- generated archives
- lockfiles and packaging metadata

Coverage level: **intentionally low-value**

These should only become wiki targets if one becomes operationally important.

## 3. Miscellaneous top-level support files
Examples include:
- `.gitignore`
- transient packaging/support files
- low-value incidental repository artifacts

Coverage level: **intentionally low-value**

## Practical interpretation of the audit

The best practical summary is:
- the wiki now covers the repo well enough to navigate the real system intelligently
- it does not claim that every file has a corresponding page
- the remaining deeper gaps are mostly in subdirectory/file-level implementation mapping, not in top-level system comprehension

That is the right balance for a living internal engineering wiki.

## Highest-value future repo-coverage expansions

If repo coverage needs to deepen later, the most valuable next expansions would likely be:

## 1. `src/` deeper mapping
Especially:
- `src/routes/`
- `src/services/`
- `src/lib/`

## 2. `scripts/` mapping
Especially the scripts that matter for:
- diagnostics
- display/runtime behavior
- library health
- theme/runtime behavior

## 3. `styles/` + `skins/` display asset branch
Especially if display/render work becomes active again.

## What this page should prevent

This page should help prevent two bad future assumptions:
- “the wiki must already document every file”
- “the wiki only covers high-level ideas and is not useful for real navigation”

The truth is in the middle:
- strong on surfaces and architecture
- strong on key engineering-reference branches
- strategic rather than exhaustive on directories and internal files

## Relationship to other pages

This page should stay linked with:
- `README.md`
- `source-map.md`
- `wiki-structure-notes.md`
- `route-ownership-map.md`
- `local-environment.md`

## Current status

At the moment, this page gives the wiki a self-aware coverage map.

That makes the knowledge base more honest and more useful, because future readers can now distinguish between:
- what the wiki knows deeply
- what it maps strategically
- and what it intentionally leaves at low priority.
