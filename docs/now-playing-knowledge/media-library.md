---
title: media-library
page_type: parent
topics:
  - library
  - browsing
  - inventory
  - health
confidence: medium
---

# media library

## Purpose

This page documents the media-library branch of the `now-playing` project.

It exists because library-related behavior is currently represented across several useful pages, but not yet gathered under one clear top-level parent.

A better current interpretation is:
- the media-library branch is not just a health/audit tool
- it also includes browsing structure, inventory understanding, genre/album relationships, and the practical condition of the underlying music library
- library health and library browsing are related parts of one branch, not unrelated features

So this page should act as the umbrella for media-library behavior rather than forcing the reader to infer that branch from scattered child pages.

## Relevant source files

This page is branch-oriented rather than file-complete, but these areas are especially relevant when grounding media-library behavior:
- `library-health.html`
- controller-family browse surfaces for albums, artists, genres, playlists, radio, and podcasts
- browse and library-related routes under `src/routes/`
- library-supporting helpers and indexing logic under `src/lib/` and `src/services/`

## Media library at a glance

If you need the compressed branch model first, use this:
- **library browsing** = how albums, artists, genres, playlists, and adjacent content are surfaced to users
- **library health** = how inventory condition, scan state, missing/fragile metadata, and repair flows are inspected
- **genre/album relationships** = how higher-level browse choices feed child album/detail views
- **library truth** is partly structural and partly operational, because stale indexes, missing scans, or inventory drift can change visible behavior

That is why the library branch should be read as both a browsing branch and a health/inventory branch.

## Why this page matters

Without a parent page like this, it is easy to make one of two bad assumptions:
- that library behavior is just another controller browse surface
- or that library knowledge is mostly the `library-health` tool

Both are too narrow.

The media-library branch matters because it sits between:
- user-facing browsing behavior
- backend indexing/inventory truth
- health/audit/repair flows

## Read this branch in this order

If you are trying to understand the media-library branch as a system, read in this order:
1. [media-library.md](media-library.md)
2. [library-health-interface.md](library-health-interface.md)
3. [library-health-page-anatomy.md](library-health-page-anatomy.md)
4. [genre-pane-messaging.md](genre-pane-messaging.md)
5. [source-map.md](source-map.md) for repo ownership and nearby browse/library code

Then move into more specific controller or route pages when the question becomes browse-surface-specific or implementation-specific.

## Strong current sub-branches

### 1. Library health and audit branch
Current strongest pages:
- [library-health-interface.md](library-health-interface.md)
- [library-health-page-anatomy.md](library-health-page-anatomy.md)

This branch covers:
- inventory inspection
- scan and refresh behavior
- maintenance-oriented surface structure
- audit/repair-style workflows

### 2. Browse relationship branch
Current strongest page:
- [genre-pane-messaging.md](genre-pane-messaging.md)

This branch matters because it preserves a real browse relationship inside the library system:
- higher-level genre choice
- child album/filter behavior
- parent/child messaging contracts

### 3. Code ownership and adjacent implementation branch
Current strongest page:
- [source-map.md](source-map.md)

This branch matters because some library questions are really code-ownership questions, especially when trying to locate:
- browse routes
- library services/helpers
- controller-family browse surfaces

## What this branch still needs later

The current parent page is intentionally modest.
It establishes the branch, but it does not yet claim that the entire browse/library hierarchy is fully mapped.

Likely future improvements:
- more explicit browse hierarchy page for albums/artists/genres/playlists relationships
- stronger mapping of browse routes and controller browse entry surfaces
- clearer distinction between media library, queue-building, and playback-state branches where they overlap

## Relationship to other pages

This page should stay closely linked with:
- [user-interfaces.md](user-interfaces.md)
- [library-health-interface.md](library-health-interface.md)
- [genre-pane-messaging.md](genre-pane-messaging.md)
- [source-map.md](source-map.md)
- [integrations.md](integrations.md)

## Current status

At the moment, this page establishes Media Library as a real top-level branch in the local wiki.

That matters because the underlying content already existed, but the branch identity was still weaker than the DeepWiki model.

## Timestamp

Last updated: 2026-04-06 06:24 America/Chicago
