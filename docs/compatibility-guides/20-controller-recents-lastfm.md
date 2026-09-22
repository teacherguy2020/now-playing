# Controller Recents + Last.fm (Tablet)

This chapter documents the recent-row customization work in `controller-tablet.html`, including Last.fm row sources and stability guardrails.

## Recent Rows customization

`profile.recentRows` controls the 4 tablet recents rows (top → bottom).

Allowed row values:

- `albums`
- `playlists`
- `podcasts`
- `radio`
- `lastfm-topalbums`
- `lastfm-topartists`
- `lastfm-toptracks`
- `lastfm-recenttracks`

Rules:

- Max 4 rows
- Duplicates are removed
- Any missing slots are filled with defaults in this order: `albums`, `playlists`, `podcasts`, `radio`

## Last.fm row sources

Last.fm sources are exposed via runtime-admin routes:

- `/config/lastfm/top-tracks`
- `/config/lastfm/recent-tracks`
- `/config/lastfm/top-artists`
- `/config/lastfm/top-albums`

When a `lastfm-*` source is selected for a row, row data is fetched from the matching endpoint and rendered with the standard recents card model.

## URL seeding behavior

Controller config params can be passed in URL for one-time setup (for example: `devicePreset`, `colorPreset`, `recentRows`).

Behavior:

1. Read URL overrides
2. Merge into controller profile/localStorage
3. Remove those config params from address bar via `history.replaceState`

This keeps deep links useful while avoiding long-lived query-driven reconfiguration.

## Stability guardrails (important)

To prevent the refresh regressions seen during Alexa/Next-Up timing windows:

- Do not auto-refresh recents on a timer
- Do not trigger recents reload from unrelated events when row config is unchanged
- Do not overwrite non-empty rendered rows with empty live fetch results
- Do not replace row datasets unless incoming data is actually different

These rules are intentional and should be preserved unless there is a deliberate architecture change.

## Notes for future changes

If adding new recents row source types:

- Update allowed source lists in controller profile parsing and settings handlers
- Add row label mapping for headers
- Add fetch strategy + cache key strategy
- Preserve the guardrails above (especially no empty overwrite and change-only replacement)
