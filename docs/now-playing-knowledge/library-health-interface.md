# library health interface

## Purpose

This page documents `now-playing/library-health.html`, the operator-facing library audit and maintenance console in the `now-playing` ecosystem.

This page is intentionally implementation-aware, because `library-health.html` is clearly not just a passive report. It appears to be a maintenance workbench for:
- scanning library health
- inspecting animated art cache state
- inspecting album metadata
- suggesting and applying performer metadata
- overwriting tags across albums/tracks
- cleaning up collaborative/featured artist tags
- triggering a moOde library update

## Why this page matters

`library-health.html` appears to be one of the most important maintenance pages in the whole operator branch.

It matters because it bridges:
- media-library structure
- cached/derived visual assets
- album metadata quality
- cleanup workflows
- moOde library state

So this page is not just about “health.” It is about actionable maintenance on the library and its metadata/artwork ecosystem.

## Important files

Primary page:
- `now-playing/library-health.html`

Important supporting script:
- `now-playing/scripts/library-health.js`

Related pages:
- `configuration-and-diagnostics-interfaces.md`
- `config-interface.md`
- `tablet-interface.md`
- future `media-library.md`
- future artwork/visual-assets pages

## High-level role

A good current interpretation is:
- `library-health.html` is the operator’s media-library audit and repair surface
- it brings together multiple maintenance workflows that would otherwise be scattered
- it is one of the strongest bridges between library data, metadata quality, and visible display outcomes

That makes it highly relevant both operationally and architecturally.

## Shell / entry behavior

Like other operator pages, `library-health.html` contains shell-redirect behavior.

Observed logic:
- if `standalone=1`, remain standalone
- if top-level without standalone, redirect into:
  - `app.html?page=library-health.html`
- if already embedded, do not redirect

It also contains additional embedded-shell stripping logic that removes shell chrome when hosted inside another page context.

That suggests `library-health.html` is expected to be usable in:
- standalone operator mode
- app-shell mode
- embedded-shell mode

## Major UI areas visible in the page

Repo-visible structure shows several strong maintenance areas.

## 1. Library scan / summary area
Top-level operator actions include:
- `#refreshScan` → refresh full scan
- `#updateMoodeLibraryBtn` → update moOde library
- cards summary region via `#cards`
- status regions for scan and moOde update feedback

This appears to be the main health-summary entry layer.

## 2. Animated art cache section
The page includes:
- `#animatedArtCacheCard`
- `#animatedArtSummary`
- `#animatedArtCacheList`
- `#animatedArtPreview`
- motion / no-motion / all filter radios

This is important because it explicitly connects library-health work to the artwork/animation layer used in presentation surfaces.

## 3. Album metadata inspector
This is one of the richest sub-features in the page.

Observed elements include:
- `#albumPick`
- `#inspectAlbumBtn`
- `#suggestPerformersBtn`
- `#applyPerformersBtn`
- inspector tabs for:
  - overview
  - art
  - genre
  - cleanup
- performer input area
- album tag overwrite tools
- metadata output/status regions

This strongly suggests the page is meant for album-level forensic inspection and repair.

## 4. Tag overwrite workflow
Within the album metadata inspector, visible elements include:
- `#albumTagKey`
- `#albumTagValue`
- `#albumTagClearEmpty`
- `#albumTagFillAllBtn`
- `#albumTagApplyBtn`

This appears to support a hybrid workflow where:
- an album-wide default can be set
- per-track overrides can be edited
- then an overwrite/apply action can be executed

That is a powerful metadata-maintenance tool.

## 5. Featured-artist cleanup workflow
The page includes a dedicated cleanup area for removing collaborative “feat.”-style noise from track artist tags.

Observed elements include:
- `#featAlbumPick`
- `#featScanBtn`
- `#featApplyBtn`
- `#featNormalizeAll`
- `#featStatus`
- `#featOut`

The page text itself explains the intended workflow:
- detect tracks where ARTIST looks collaborative (`feat.`, `featuring`, `with`, `&`, comma-separated names)
- normalize to the primary artist token or album artist
- optionally normalize all tracks on the album

This is a major clue that `library-health.html` is designed for semantically meaningful cleanup, not just low-level inspection.

## Key DOM/action centers

Important visible elements include:
- `#refreshScan`
- `#updateMoodeLibraryBtn`
- `#inspectAlbumBtn`
- `#suggestPerformersBtn`
- `#applyPerformersBtn`
- `#albumTagFillAllBtn`
- `#albumTagApplyBtn`
- `#featScanBtn`
- `#featApplyBtn`

And important data/display areas include:
- `#cards`
- `#sections`
- `#albumMetaOut`
- `#animatedArtCacheList`
- `#animatedArtPreview`
- `#featOut`

This is clearly an action-oriented maintenance page.

## Supporting script as the likely logic center

The page includes:
- `scripts/library-health.js`

That strongly suggests most of the scanning, album inspection, animated-art listing, metadata mutation, and cleanup logic lives in that script rather than inline.

So a deeper future pass should inspect:
- `now-playing/scripts/library-health.js`

in detail.

## Relationship to the media-library and artwork branches

This page is especially important because it sits at the intersection of multiple future wiki branches:
- media library representation
- album metadata quality
- artwork and animated-art caches
- cleanup/curation workflows
- moOde library synchronization

That means `library-health.html` may become one of the strongest practical pages for connecting:
- conceptual library understanding
with
- actual repair and hygiene work

## moOde library update role

The visible presence of:
- `#updateMoodeLibraryBtn`

makes an important point.

This page is not only inspecting local derived state. It is also involved in driving or triggering moOde library refresh/update behavior.

That makes it a bridge between:
- app-host library health understanding
- moOde-side library state

## Album-inspection workflow model

A useful current model for the album inspector workflow is:

1. choose album context
2. inspect metadata
3. review art/genre/cleanup subviews
4. suggest performers or edit them manually
5. apply performer changes
6. optionally use tag-overwrite tools
7. optionally run feat-cleanup tools

This is a meaningful operator workflow, not just a static report.

## Architectural interpretation

A good current interpretation is:
- `library-health.html` is the operator-side maintenance console for library integrity and metadata quality
- it ties together scanning, inspection, cleanup, and sync-oriented actions
- it likely plays a significant role in keeping the visible system sane across controller, display, and artwork surfaces

That makes it one of the highest-value admin pages after config and diagnostics.

## Relationship to other pages

This page should stay linked with:
- `configuration-and-diagnostics-interfaces.md`
- `config-interface.md`
- `deployment-and-ops.md`
- future `media-library.md`
- future artwork/visual-assets pages
- future pages documenting library-health script/API details

## Things still to verify

Future deeper verification should clarify:
- what exact endpoints `scripts/library-health.js` calls for scan, inspect, suggest, apply, and cleanup actions
- how animated art cache data is sourced and refreshed
- how album tag overwrite is applied under the hood
- whether performer suggestions are heuristic, metadata-backed, or externally enriched
- what exactly the moOde library update action triggers on the backend
- which workflows are read-only versus state-mutating versus restart-sensitive

## Current status

At the moment, this page already has enough evidence to be treated as a core maintenance surface.

It is not merely a status page. It is a practical library audit, metadata repair, artwork/cache inspection, and moOde-sync workbench.
