---
title: tablet-recents-and-lastfm
page_type: child
topics:
  - tablet
  - controller
  - lastfm
  - recents
confidence: high
---

# tablet recents and last.fm

## Purpose

This page documents the recents-row customization and Last.fm row-source behavior in the tablet controller branch.

It exists because the tablet branch is already documented at a hub level, but this part of the system has specific behavioral contracts that are important enough to preserve directly.

Use this page when the question is:
- how are tablet recents rows configured?
- which row-source values are allowed?
- how do Last.fm row sources map into the tablet UI?
- how do URL overrides seed tablet profile state?
- what refresh guardrails should not be broken?

## Why this page matters

This branch matters because it is easy to treat recents rows as a cosmetic configuration detail.
In practice, they are a small but fragile data/rendering system with explicit guardrails.

The most important lesson is:
- recents stability is part of the feature contract
- not just a nice-to-have implementation detail

That means future work should preserve the behavioral rules here unless there is a deliberate architecture change.

## Primary surface

Main file context:
- `now-playing/controller-tablet.html`

Useful companion pages:
- `tablet-interface.md`
- `controller-tablet-anatomy.md`
- `config-lastfm-and-scrobbling.md`
- `embedded-pane-contracts.md`

## Recents row model

Tablet recents are controlled through:
- `profile.recentRows`

This setting determines the four recents rows shown in tablet layout, ordered top to bottom.

## Allowed row values

Current allowed values are:
- `albums`
- `playlists`
- `podcasts`
- `radio`
- `lastfm-topalbums`
- `lastfm-topartists`
- `lastfm-toptracks`
- `lastfm-recenttracks`

These values should be treated as the current supported contract.

## Structural rules

Current rules include:
- maximum of 4 rows
- duplicates are removed
- missing slots are backfilled with defaults

Default fill order:
- `albums`
- `playlists`
- `podcasts`
- `radio`

Practical meaning:
- row configuration should normalize toward a stable four-row layout
- invalid or incomplete user input should not leave the surface in a broken partial state

## Last.fm row-source mapping

Last.fm-derived rows are powered through runtime-admin/config-backed endpoint families.

Current endpoint mapping:
- `lastfm-toptracks` -> `/config/lastfm/top-tracks`
- `lastfm-recenttracks` -> `/config/lastfm/recent-tracks`
- `lastfm-topartists` -> `/config/lastfm/top-artists`
- `lastfm-topalbums` -> `/config/lastfm/top-albums`

Practical meaning:
- when a `lastfm-*` row source is selected, the tablet recents row should fetch from the matching endpoint and render using the standard recents-card model

This is important because Last.fm rows are integrated into the same display system rather than treated as a totally separate visual component.

## URL seeding behavior

The tablet controller supports one-time URL-driven profile seeding for configuration values such as:
- `devicePreset`
- `colorPreset`
- `recentRows`

Expected behavior:
1. read URL overrides
2. merge them into local controller profile state
3. remove those configuration parameters from the address bar using `history.replaceState`

Why this matters:
- deep links remain useful for setup or shareable state
- the controller should not remain permanently query-driven after initialization
- the URL should become cleaner after one-time seeding

This is a subtle but important behavior contract.

## Refresh and stability guardrails

These are the highest-value rules in this branch.
They should be treated as explicit feature guardrails.

## 1. Do not auto-refresh recents on a timer

Rule:
- tablet recents should not be refreshed on an automatic timer loop

Why this matters:
- timer-driven refresh can reintroduce instability and visible churn
- it can also create empty-result races that replace good UI with bad transient state

## 2. Do not reload recents from unrelated events when row config has not changed

Rule:
- unrelated events should not trigger recents reload if the row-source configuration is unchanged

Why this matters:
- this protects the feature from accidental coupling to unrelated refresh or playback events

## 3. Do not overwrite non-empty rendered rows with empty live results

Rule:
- an empty incoming result set should not blindly destroy a non-empty rendered row

Why this matters:
- transient endpoint or timing issues should not erase useful current UI state
- this is one of the branch's key resilience behaviors

## 4. Do not replace row datasets unless incoming data is meaningfully different

Rule:
- replacement should happen only when the new data actually differs from the current rendered data

Why this matters:
- unnecessary replacement increases churn
- it also makes the UI feel unstable even when underlying content has not materially changed

## Stability interpretation

The intended philosophy is:
- preserve stable good output
- avoid churn from weak or empty transient fetches
- treat recents rendering as a stateful presentation layer, not as a firehose that should redraw on every opportunity

That design choice should stay visible in the wiki.

## Adding a new row-source type

If future work adds additional recents row-source types, several places need to evolve together.

Required update areas:
- allowed source list in profile parsing
- allowed source list in settings handlers
- label mapping for row headers
- fetch strategy for the new source
- cache-key strategy for the new source
- preservation of the stability guardrails above

The important rule is:
- new row sources should extend the same contract, not bypass it

## Relationship to Last.fm configuration branch

This page is about how Last.fm-backed data appears inside the tablet recents system.
It is not the same as broader Last.fm feature setup.

For Last.fm enablement and config behavior, also use:
- `config-lastfm-and-scrobbling.md`

Useful split:
- `config-lastfm-and-scrobbling.md` = feature setup and runtime config
- `tablet-recents-and-lastfm.md` = tablet-side row-source behavior and rendering contract

## Best companion pages

- `tablet-interface.md`
- `controller-tablet-anatomy.md`
- `config-lastfm-and-scrobbling.md`
- `gotchas-and-lessons.md`

## Current status

At the moment, this page should be treated as the behavior-contract page for tablet recents and Last.fm row integration.

The key truths it preserves are:
- allowed row-source vocabulary matters
- URL seeding is one-time and self-cleaning
- Last.fm rows map into specific endpoint families
- recents stability guardrails are intentional and should not be casually broken
