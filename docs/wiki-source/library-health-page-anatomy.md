# library health page anatomy

## Purpose

This page documents the internal anatomy of `now-playing/library-health.html`.

It exists because `library-health.html` is not just a report page.
It is a maintenance workbench with:
- scan and summary actions
- animated-art cache inspection
- album metadata inspection
- performer suggestion/apply workflows
- album tag overwrite tools
- feat/collaboration cleanup workflows
- moOde library update actions

This page is meant to help future agents answer questions like:
- “where is the animated-art cache section?”
- “where does album metadata inspection live?”
- “which part owns tag overwrite?”
- “where is the feat cleanup tool?”
- “where does the moOde library update button live?”

## Why anatomy matters here

People will ask for changes like:
- improve the library scan summary
- change the animated-art cache view
- tweak album metadata inspection
- adjust performer suggestion/apply behavior
- change tag overwrite UX
- improve feat cleanup actions

Those are anatomy questions.

## High-level role of `library-health.html`

A good current interpretation is:
- `library-health.html` is the operator’s media-library maintenance console
- it bridges library audit, metadata cleanup, artwork/cache inspection, and moOde sync-oriented actions
- it is action-heavy, not just informational

So it should be understood as a maintenance workbench, not a passive health dashboard.

## Main anatomical regions

The current page is best understood as these major regions:

1. shell redirect / page header layer
2. library scan / summary region
3. animated-art cache audit region
4. album metadata inspector
5. performer suggestion/apply workflow
6. album tag overwrite tool
7. feat/collaboration cleanup workflow
8. moOde library update action
9. library-health script orchestration layer

## 1. Shell redirect / page header layer

### What it is
Like other operator pages, `library-health.html` includes shell-entry behavior so it can run standalone or inside:
- `app.html?page=library-health.html`

### Why it matters
This matters whenever behavior differs between standalone and shell-hosted execution.

## 2. Library scan / summary region

### What it is
This is the main audit/summary region.

Key anchors include:
- `#refreshScan`
- `#cards`
- `#scanStatus`

### What it does
This region appears to:
- trigger a fresh library-health scan
- render summary cards/results
- provide status output for the scan

### Why it matters
This is the main top-level audit entrypoint for the whole page.

## 3. Animated-art cache audit region

### What it is
This is the animated-art maintenance section.

Key anchors include:
- `#animatedArtCacheCard`
- `#animatedArtSummary`
- `#animatedArtCacheList`
- `#animatedArtPreview`
- filter controls for motion/no-motion/all behavior

### What it does
This region appears to:
- summarize animated-art cache state
- list cached animated-art items
- preview selected animated-art items
- filter by motion/no-motion state

### Why it matters
This is one of the most visually distinct maintenance subregions and one of the easiest places for future agents to start in the wrong file if anatomy is not documented.

### Companion pages
- `config-display-and-render-features.md`
- `display-interface.md`

## 4. Album metadata inspector

### What it is
This is the richest central inspection region of the page.

Key anchors include:
- `#albumPick`
- `#albumInspectBtn`
- `#albumOverviewTab`
- `#albumArtTab`
- `#albumGenreTab`
- `#albumCleanupTab`

### What it does
This region appears to:
- choose an album context
- inspect album metadata
- switch between overview/art/genre/cleanup subviews
- present album-specific metadata and cleanup context

### Why it matters
A lot of requests that sound like “change Library Health” are probably really about this inspector.

## 5. Performer suggestion/apply workflow

### What it is
This workflow sits inside or adjacent to the album metadata inspector.

Key anchors include:
- `#albumPerformerInput`
- `#albumApplyPerformersBtn`

### What it does
This region appears to handle performer suggestion or manual performer editing/apply flows for album metadata.

### Why it matters
This is a specialized maintenance workflow, not just a passive data viewer.

## 6. Album tag overwrite tool

### What it is
This is the tag-overwrite utility region.

Key anchors include:
- `#albumTagKey`
- `#albumTagValue`
- `#albumTagClearEmpty`
- `#albumTagFillAllBtn`
- `#albumTagApplyBtn`

### What it does
This region supports targeted tag overwrite/fill workflows across an album context.

### Why it matters
A request like “change the tag overwrite UX” belongs here, not in the scan summary or animated-art sections.

## 7. Feat/collaboration cleanup workflow

### What it is
This is the feature/collaboration artist cleanup region.

Key anchors include:
- `#featAlbumPick`
- `#featScanBtn`
- `#featApplyBtn`
- `#featNormalizeAll`
- `#featStatus`
- `#featOut`

### What it does
This region appears to:
- scan an album context for feat/collaboration cleanup candidates
- normalize or apply cleanup
- show status/output for the cleanup operation

### Why it matters
This is one of the most specific maintenance tools on the page and a likely future source of “where does that tool live?” questions.

## 8. moOde library update action

### What it is
This is the explicit moOde sync/update action region.

Key anchors include:
- `#updateMoodeLibraryBtn`
- `#moodeUpdateStatus`

### What it does
This region triggers or coordinates a moOde library update workflow after cleanup/maintenance actions.

### Why it matters
This is one of the clearest bridges from local maintenance work into live moOde-side state.

### Companion pages
- `deployment-and-ops.md`
- `local-environment.md`
- `backend-change-verification-runbook.md`

## 9. Library-health script orchestration layer

### What it is
Most page behavior appears to be driven by:
- `scripts/library-health.js`

### What it does
This script likely orchestrates:
- library scan and summary refresh
- animated-art cache loading and preview
- album metadata inspection
- performer apply workflows
- album tag overwrite behavior
- feat cleanup scan/apply behavior
- moOde library update action

### Why it matters
A request to improve library-health behavior usually belongs here rather than in page markup alone.

## Practical “where do I start?” map

### If asked to improve the scan summary
Open first:
- `#refreshScan`
- `#cards`
- `#scanStatus`
- scan-related logic in `scripts/library-health.js`

### If asked to improve animated-art cache behavior
Open first:
- `#animatedArtCacheCard`
- `#animatedArtSummary`
- `#animatedArtCacheList`
- `#animatedArtPreview`
- animated-art logic in `scripts/library-health.js`

### If asked to improve album metadata inspection
Open first:
- `#albumPick`
- `#albumInspectBtn`
- the album tab anchors
- inspection logic in `scripts/library-health.js`

### If asked to improve performer application
Open first:
- `#albumPerformerInput`
- `#albumApplyPerformersBtn`
- performer-related logic in `scripts/library-health.js`

### If asked to improve tag overwrite
Open first:
- `#albumTagKey`
- `#albumTagValue`
- `#albumTagFillAllBtn`
- `#albumTagApplyBtn`
- overwrite logic in `scripts/library-health.js`

### If asked to improve feat cleanup
Open first:
- `#featAlbumPick`
- `#featScanBtn`
- `#featApplyBtn`
- `#featNormalizeAll`
- feat cleanup logic in `scripts/library-health.js`

### If asked to improve moOde library update behavior
Open first:
- `#updateMoodeLibraryBtn`
- `#moodeUpdateStatus`
- moOde update logic in `scripts/library-health.js`
- deployment/ops companions

## Anatomy rule for future agents

For `library-health.html`, do not assume a requested change belongs only to:
- generic library scanning
- metadata inspection
- or moOde update behavior

Always classify the target first:
- scan summary region
- animated-art cache region
- album inspector
- performer workflow
- tag overwrite tool
- feat cleanup workflow
- moOde update action

That classification step should prevent wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `library-health-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `backend-change-verification-runbook.md`
- `config-display-and-render-features.md`

## Current status

At the moment, this page gives the wiki its eighth real page-anatomy reference.

Its main job is making explicit that `library-health.html` is not just a health readout.
It is a multi-region maintenance workbench with:
- scan summary
- animated-art cache audit
- album inspection
- performer workflows
- tag overwrite tools
- feat cleanup workflows
- and moOde library update behavior.
