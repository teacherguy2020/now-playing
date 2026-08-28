# youtube interface

## Purpose

This page documents `now-playing/youtube.html`, the YouTube bridge surface in the `now-playing` ecosystem.

This page is intentionally implementation-aware, because `youtube.html` is not just a link-entry form. It is a focused operator/user bridge for:
- searching YouTube
- selecting search results
- expanding playlist URLs into individual items
- resolving a URL into canonical metadata
- queueing one or many items into moOde/MPD workflows

## Why this page matters

`youtube.html` is important because it exposes a concrete content-ingestion pathway into the system.

It matters because it bridges:
- external YouTube content
- queueing workflows
- track-key-protected API operations
- user selection of search results and playlist items

That makes it a strong example of a feature-specific intake surface rather than a generic controller or display page.

## Important file

Primary file:
- `now-playing/youtube.html`

Related pages:
- `integrations.md`
- `queue-and-playback-control.md` (future/expanding)
- `desktop-browser-interface.md`
- `phone-interface.md`

## High-level role

A good current interpretation is:
- `youtube.html` is a focused YouTube intake and queueing console
- it is designed to help an operator or user turn YouTube URLs/searches/playlists into queue actions quickly
- it is narrower than broad controller pages, but highly operational within its feature area

## Major UI areas visible in the page

Repo-visible structure shows four major workflow areas.

## 1. Search area
Observed elements include:
- `#ytSearch`
- `#ytPlaylistsOnly`
- `#ytSearchBtn`
- `#results`

This supports searching YouTube directly from the page.

## 2. Playlist expansion / multi-select area
Observed elements include:
- `#ytSelectAll`
- `#playlistRows`

This supports expanding playlist URLs and selecting multiple items at once.

## 3. URL and queue-mode area
Observed elements include:
- `#ytUrl`
- `#ytMode`
- queue modes:
  - `append`
  - `crop`
  - `replace`

This is the core action area for sending selected YouTube content into the queue.

## 4. Action/status area
Observed action controls include:
- `#ytResolve`
- `#ytExpandUrl`
- `#ytSend`
- `#status`
- `#meta`

This means the page supports several distinct operator actions, not just one “send” button.

## Core supporting state

The page builds an app-host API base as:
- `${location.protocol}//${location.hostname||'nowplaying.local'}:3101`

It also caches the runtime track key in local state via:
- `key`

This means the page depends on the normal app-host API surface, not on a separate provider-side integration path.

## Key functions / logic blocks

## `ensureKey()`
This function is one of the most important building blocks.

Observed behavior includes:
- fetch runtime config from `/config/runtime`
- extract `config.trackKey`
- cache it locally

This is important because most write or protected YouTube operations depend on having a track key available.

## `resolveOnly()`
This is the URL-resolution workflow.

Observed behavior includes:
- require a pasted URL
- ensure the track key
- POST to:
  - `/youtube/resolve`
- include body:
  - `{ url }`
- render metadata such as:
  - title
  - channel
  - duration
  - source link

This is effectively the metadata-confirmation step for a direct YouTube URL.

## `doSearch()`
This is the search workflow.

Observed behavior includes:
- require a search query
- ensure the track key
- POST to:
  - `/youtube/search`
- include body:
  - `{ query, limit:12, playlistsOnly:<bool> }`
- render result rows with:
  - title
  - channel
  - duration
  - “Use” button
  - “Expand” button

This makes the page a real search-driven intake surface, not only a URL resolver.

## `loadPlaylist(urlOverride='')`
This is the playlist expansion workflow.

Observed behavior includes:
- determine playlist URL from override or main URL field
- ensure the track key
- POST to:
  - `/youtube/playlist`
- include body:
  - `{ url, limit:150 }`
- render selectable rows in `#playlistRows`
- skip or disable items that are:
  - `[Deleted video]`
  - `[Private video]`
- set “Select all” checked by default

This is one of the page’s most important workflows because it turns one playlist URL into an editable multi-item selection set.

## `sendNow()`
This is the main queueing action.

Observed behavior includes:
- gather selected playlist item URLs if present
- otherwise use the single pasted URL
- ensure the track key
- read queue mode from `#ytMode`
- POST to:
  - `/youtube/queue`
- include body shaped like:
  - `{ url:urls[0], urls, mode }`
- report queued count and first item metadata

This is the main bridge from YouTube content into the now-playing/moOde queue path.

## Important API calls

Based on current inspection, important endpoints include:

### Runtime
- `GET /config/runtime`

### YouTube feature endpoints
- `POST /youtube/search`
- `POST /youtube/playlist`
- `POST /youtube/resolve`
- `POST /youtube/queue`

These are clearly the core contract of the page.

## Queue-mode semantics

The page exposes three queue modes:
- `append`
- `crop`
- `replace`

Even without tracing backend code yet, this is an important operator-facing contract.

It suggests the page is not just adding content — it is explicitly controlling how YouTube content merges with or replaces the existing queue.

## Search-result behavior

Search results support two key actions:
- `Use`
- `Expand`

Current working interpretation:
- `Use` populates the URL field and resolves metadata
- `Expand` loads playlist contents if the result is a playlist-like URL and scrolls the playlist selection area into view

So the page supports both:
- fast single-item selection
- deeper playlist expansion and curation

## Playlist-selection behavior

Once a playlist is expanded:
- rows are rendered with checkboxes
- `#ytSelectAll` can bulk toggle selection
- disabled rows are used for deleted/private videos

This is an example of the page becoming a lightweight playlist curation interface before queue submission.

## User workflow model

A useful current operator/user workflow model is:

### Direct URL workflow
1. paste a YouTube URL
2. optionally resolve metadata
3. choose queue mode
4. send to moOde

### Search workflow
1. search by artist/song/query
2. use a result directly, or expand it if it is a playlist
3. choose queue mode
4. send to moOde

### Playlist workflow
1. paste or select a playlist URL
2. expand playlist contents
3. select desired items
4. choose queue mode
5. send selected items to moOde

That makes the page more capable than its simple appearance suggests.

## Architectural interpretation

A good current interpretation is:
- `youtube.html` is the dedicated YouTube ingress surface for the system
- it combines search, resolution, playlist expansion, and queue submission into one focused tool
- it is one of the clearest feature-specific bridges between external content and internal playback workflows

That makes it an important feature page even if it is not a large shell.

## Relationship to other pages

This page should stay linked with:
- `integrations.md`
- `desktop-browser-interface.md`
- `phone-interface.md`
- future queue/playback-control pages
- future YouTube-specific integration notes

## Things still to verify

Future deeper verification should clarify:
- how `/youtube/queue` maps onto downstream MPD/moOde queue actions
- how `crop` is implemented backend-side compared with `append` and `replace`
- whether search and playlist expansion rely on the same backend extractor path as resolve
- whether there are additional backend validation or rate-limit behaviors not visible from the page alone
- whether this page is primarily desktop-used or also important on smaller devices

## Current status

At the moment, this page already has enough evidence to be treated as the main YouTube intake surface in the project.

It is not just a URL form. It is a compact search, curation, resolution, and queueing console for bringing YouTube content into the live system.
