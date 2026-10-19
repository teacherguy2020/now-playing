# Qobuz library and search feasibility

Last reviewed: 2026-10-19 America/Chicago

## Verdict

Qobuz Connect is usable as a mediated renderer/playback transport today.
Qobuz library browsing and search are **not yet an approved implementation
target** in the current PiBuZ codebase. The next milestone should be a
read-only authentication/API spike, not a large provider implementation.

## What exists today

- PiBuZ has an authenticated Qobuz Connect renderer session and can resolve
  the active queue, current track, album artwork reference, and playback
  state.
- The saved-queue Server contract persists opaque Qobuz track IDs, metadata,
  duplicate occurrences, cursor data, and provenance without exposing
  Qobuz credentials or raw provider URLs.
- The existing Qobuz client source contains private/internal account and
  catalog-shaped methods for track, album, artist, playlist, and CMAF
  resolution, but those are not a documented public Sonuvi library contract.

## What is not established

The repository does not currently prove a supported, independently usable
Qobuz catalog API for:

- user favorites (albums, artists, tracks);
- user playlist enumeration and track listing;
- purchased library access;
- catalog search across tracks, albums, artists, and playlists;
- stable pagination, rate-limit, or token-lifecycle guarantees;
- starting playback from an independently authenticated Sonuvi client.

PiBuZ's Connect handoff/session credential is not assumed to be a general
Qobuz account credential. The current source's private login/catalog paths
must not be called or promoted into a product contract without Qobuz
authorization and documented developer access.

## Recommended architecture

Keep catalog access separate from renderer transport. A future Qobuz provider
should implement the same provider-neutral surface as Apple Music and local
sources:

- authentication and token lifecycle;
- browse/search with bounded pagination and caching;
- albums, artists, tracks, playlists, favorites, artwork, and metadata;
- playback-source resolution into a separate Server/PiBuZ or native playback
  path.

The iOS app should not depend on PiBuZ-specific library routes. Qobuz Connect
can remain the existing Server/PiBuZ renderer while a separately authorized
catalog provider is evaluated.

## Minimal next coding milestone

1. Obtain or confirm an authorized Qobuz developer/API path and its permitted
   authentication flow.
2. Build a read-only throwaway probe that records only capability names,
   bounded response shapes, pagination behavior, and error classes—never
   credentials or tokens.
3. Decide whether the first provider slice is favorites, playlists, or
   search based on the supported API surface.
4. Define the provider-neutral contract and tests before adding production
   catalog storage or native iOS UI.

Until that authorization/capability proof exists, the supported Qobuz scope
is Connect playback, queue observation/control, and saved queue persistence.
