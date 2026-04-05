# config ratings

## Purpose

This page documents the ratings-related portion of `now-playing/config.html`.

It exists because ratings in this project are not just a small preference toggle. The Config page exposes a real ratings-management subsystem built around the MPD sticker database, including:
- feature enablement
- existence/status checking
- backup listing
- backup creation
- restore-from-backup workflows

## Why this page matters

Ratings are one of the clearer examples of `config.html` acting as an operational maintenance console, not merely a settings form.

The ratings section matters because it combines:
- user-visible feature enablement
- persistence-layer verification
- backup discipline
- destructive restore behavior guarded by confirmation

That is more serious than a checkbox.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `diagnostics-interface.md`
- future ratings/curation pages

## High-level role

A good current interpretation is:
- the Ratings block in Config is the ratings setup and sticker-DB maintenance console
- it exposes the operational state of the ratings persistence layer
- it gives the operator tools to verify, back up, and restore rating data safely

## Main visible controls

Observed ratings UI elements include:
- `featureRatings`
- `checkRatingsDbBtn`
- `backupRatingsDbBtn`
- `ratingsBackupSelect`
- `restoreRatingsDbBtn`
- `ratingsDbStatus`

These correspond to both enablement and database maintenance workflows.

## 1. Ratings feature enablement

Observed behavior includes:
- Config loads feature state from:
  - `c.features?.ratings`
- Save assembly persists:
  - `features.ratings`

### Why it matters
This means ratings can be turned on/off from Config as a first-class feature flag.

But the rest of the ratings card makes clear that enabling ratings is only one part of the story.

## 2. Ratings DB status check

The `Check Ratings DB` action is implemented by `checkRatingsDb()`.

### Observed behavior
- requires a track key via `getTrackKey()`
- updates `ratingsDbStatus` while running
- sends:
  - `GET /config/ratings/sticker-status`
- includes:
  - `x-track-key`
- reports either:
  - found sticker DB path and size
  - or that the DB does not yet exist
  - or an error state

### Important interpretation
The “not found” path is treated as a normal possible condition:
- the sticker DB may be created after the first rating write

That is an important operational nuance.

## 3. Ratings backup listing

The backup selector is populated by `loadRatingsBackups()`.

### Observed behavior
- requires a track key
- sends:
  - `GET /config/ratings/sticker-backups`
- includes:
  - `x-track-key`
- populates `ratingsBackupSelect` with:
  - backup path
  - backup name
  - backup size
- shows fallback text if none or if loading fails

### Why it matters
This means Config is aware of multiple historical ratings DB backups, not just a single snapshot.

## 4. Ratings backup creation

The `Backup Ratings DB` action is implemented by `backupRatingsDb()`.

### Observed behavior
- requires a track key
- disables the button while running
- updates `ratingsDbStatus`
- sends:
  - `POST /config/ratings/sticker-backup`
- includes:
  - `Content-Type: application/json`
  - `x-track-key`
  - empty JSON body
- on success:
  - reports backup path
  - refreshes the backup list

### Why it matters
This is a direct operational safeguard for ratings persistence.
It suggests the intended workflow is to back up before risky changes or before restore operations.

## 5. Ratings restore workflow

The `Restore Selected Backup` action is implemented by `restoreRatingsDb()`.

### Observed behavior
- requires a track key
- requires a selected backup path
- prompts for confirmation before continuing
- warns that restore will overwrite the current sticker DB
- disables the button while running
- sends:
  - `POST /config/ratings/sticker-restore`
- includes:
  - `Content-Type: application/json`
  - `x-track-key`
  - `{ backupPath }`
- on success:
  - reports restored backup path

### Why it matters
This is a destructive maintenance action with explicit confirmation, which is exactly the right shape for a restore flow.

This reinforces that ratings are treated as important persisted state, not disposable UI metadata.

## Track-key protection

All ratings maintenance actions are track-key protected.

Observed behavior includes:
- early refusal when no track key is available
- requests consistently using `x-track-key`

### Why it matters
This means ratings DB operations are treated as privileged maintenance actions.
That is an important security/operational boundary.

## Ratings card visibility / gating

Repo-visible code includes `syncRatingsCardVisibility()` and related feature-toggle listeners.

Observed behavior includes:
- ratings card controls are tied to `featureRatings`
- backup loading is triggered when ratings is enabled
- buttons/selectors are enabled or disabled based on feature state

### Working interpretation
A good current interpretation is:
- ratings maintenance tools are surfaced conditionally as part of the ratings feature lifecycle
- enabling ratings does not just reveal a preference; it reveals a managed persistence subsystem

## Important API endpoints

Based on current inspection, the ratings-related endpoints include:
- `GET /config/ratings/sticker-status`
- `GET /config/ratings/sticker-backups`
- `POST /config/ratings/sticker-backup`
- `POST /config/ratings/sticker-restore`

These appear to be the main ratings-maintenance contract exposed through Config.

## User/operator workflow model

A useful current workflow model is:

### First-time / verification workflow
1. enable Ratings
2. check Ratings DB
3. confirm whether sticker DB already exists or will be created on first write

### Protective maintenance workflow
1. check current ratings DB state
2. create backup
3. verify the backup appears in the backup selector

### Recovery workflow
1. select a known-good backup
2. restore selected backup
3. confirm successful restore message
4. verify ratings behavior afterward

This is a real maintenance runbook embedded inside Config.

## Architectural interpretation

A good current interpretation is:
- ratings in this project are backed by a real persistence layer with maintenance concerns
- Config exposes that layer explicitly
- ratings should therefore be documented as both a feature and a data-stewardship subsystem

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `configuration-and-diagnostics-interfaces.md`
- future ratings/favorites/curation pages

## Things still to verify

Future deeper verification should clarify:
- exactly where the sticker DB lives in the deployed environment
- how ratings writes from user-facing surfaces map onto MPD sticker updates
- what backup naming/path scheme the backend uses
- whether there are migration or schema assumptions beyond basic file backup/restore

## Current status

At the moment, this page gives the ratings block in Config the treatment it deserves.

It is not just “ratings enabled yes/no.”
It is:
- a feature flag
- a persistence check
- a backup workflow
- a restore workflow
- a privileged maintenance subsystem
