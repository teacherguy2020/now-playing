# config network and runtime

## Purpose

This page documents the Network & Runtime portion of `now-playing/config.html`.

It exists because this card is the foundational bootstrap layer for the rest of the Config page. It is not just another settings section. It is the part that establishes:
- where the API lives
- where the UI lives
- how MPD is reached
- how moOde is reached over SSH
- what track key protects privileged actions
- what library/mount paths the system should assume
- whether the runtime environment is valid enough to unlock other modules

## Why this page matters

This is probably the single most important remaining config-owned branch after the feature pages already written.

The UI itself labels this as:
- **Step 1**
- fill it in first
- then click **Check SSH + Paths** to unlock the other modules

That is a strong signal that this card is the operational bootstrap/gating layer of the whole Config experience.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `config-podcasts-and-library-paths.md` (future/adjacent)
- `local-environment.md`
- `deployment-and-ops.md`

## High-level role

A good current interpretation is:
- this card is the environment and bootstrap control plane for the Config page
- it defines the basic runtime assumptions needed for the rest of the feature modules to be trusted
- it also provides active verification, not just passive data entry

## Main visible controls

Observed UI elements include:
- `apiNodeIp`
- `apiPort`
- `uiPort`
- `mpdHost`
- `mpdPort`
- `moodeSshHost`
- `moodeSshUser`
- `moodeBaseUrl`
- `configTrackKey`
- `pathMusicLibraryRoot`
- `pathMoodeUsbMount`
- `pathPiMountBase`
- `checkRuntimeBtn`
- `runtimeCheckStatus`
- `runtimeCheckDetails`
- `sshSetupCmds`

Closely related path/workflow elements also include:
- `pathPodcastRoot`
- podcast-root creation flow when Podcasts is enabled

## 1. API / UI host and port setup

Observed fields include:
- API host (`apiNodeIp`)
- API port (`apiPort`)
- UI port (`uiPort`)

### Defaulting behavior
Observed helper logic includes `applyInitialNetworkPrefills()`.

Observed behavior includes:
- default API port to `3101`
- default UI port to `8101`
- attempt to prefer `nowplaying.local` when reachable
- otherwise fall back to the current page host
- annotate the hints accordingly

### Why it matters
This means the Config page tries to make conservative environment-aware choices rather than leaving everything blank.

It also tells us the system treats:
- API endpoint identity
- UI endpoint identity
as first-class configuration inputs.

## 2. MPD and moOde SSH setup

Observed fields include:
- `mpdHost`
- `mpdPort`
- `moodeSshHost`
- `moodeSshUser`
- `moodeBaseUrl`

### Important distinction
These fields encode multiple different relationships:
- MPD host/port for player control
- SSH host/user for moOde-side verification and maintenance actions
- optional moOde base URL override for direct web-target construction

### Defaults and prefill behavior
Observed behavior includes:
- MPD port default of `6600`
- SSH host can default to MPD host if not separately provided
- moOde base URL can be left blank and derived from SSH/MPD host

### Why it matters
This is one of the clearest examples of Config bridging multiple runtime roles:
- app/API host
- MPD host
- moOde web endpoint
- moOde SSH endpoint

They are related, but not always identical.

## 3. Track key

Observed field includes:
- `configTrackKey`

Observed behavior includes:
- local secret caching under `nowplaying.secret.trackKey`
- used by privileged config and maintenance endpoints via `x-track-key`

### Why it matters
This is the security boundary for privileged actions in Config.
The UI explicitly says it protects config and maintenance endpoints.

Without this field, important actions like runtime checks and restore/maintenance operations fail early.

## 4. Paths and mount assumptions

Observed fields include:
- `pathMusicLibraryRoot`
- `pathMoodeUsbMount`
- `pathPiMountBase`
- `pathPodcastRoot`

### Core meaning
These fields appear to encode:
- music library root in the playback environment
- mount path on the moOde machine
- corresponding mount base on the API host
- podcast root on the API host

### Derived-path behavior
Observed helper logic includes `derivePathsFromMoode()`.

Observed behavior includes:
- read the moOde-side media path
- infer a drive name
- auto-fill:
  - API-host mount base as `/mnt/<drive>`
  - podcast root as `/mnt/<drive>/Podcasts`

### Why it matters
This means the Config page is not just recording independent path fields.
It understands a path relationship model between the moOde host and the API host.

That is a real operational abstraction.

## 5. SSH setup help

Observed helper logic includes `refreshSshSetupHelp()`.

Observed behavior includes generation of one-time setup commands such as:
- `ssh-keygen`
- `ssh-copy-id`
- SSH test command
- sudo non-interactive test command

### Why it matters
This is a strong sign that the Config page is intended to help operators reach a working automation state, not merely save values.

It also captures an important operational assumption:
- unattended or semi-automated SSH access is part of the expected workflow

## 6. Runtime environment verification

This is the most important active workflow in the card.

Observed function includes:
- `checkRuntimeEnv(silent = false)`

### Observed behavior
- requires track key
- reads MPD host/port, SSH host/user, and path fields
- POSTs to:
  - `/config/runtime/check-env`
- includes payload shaped like:
  - `{ mpdHost, mpdPort, sshHost, sshUser, paths }`
- evaluates returned:
  - `sshOk`
  - `mpdOk`
  - path checks
- updates:
  - status text
  - details table
  - pills/lights
  - runtime gating state

### Why it matters
This is not merely a “test connection” button.
It is the gatekeeper for whether the runtime environment is considered ready enough for broader config work.

### Visual feedback behavior
Observed behavior includes:
- updating `moodePill`
- updating `mpdHostLight`
- setting various field lights good/warn/bad
- marking the action button as done when runtime is ready

That means this workflow is central to the operator’s mental model of whether the installation is healthy.

## 7. Runtime gate behavior

Observed behavior includes:
- `runtimeReady` depends on at least SSH and MPD checks succeeding
- `applyRuntimeGate()` is called after runtime verification results
- other feature modules are treated as gated by this readiness state

### Why it matters
This is the strongest sign that Network & Runtime is the Config bootstrap layer rather than just one card among many.

## 8. Podcast-root creation as a runtime-adjacent action

Observed helper includes:
- `ensurePodcastRoot()`

### Observed behavior
- available when Podcasts is enabled and the podcast root is missing
- confirms with the user
- POSTs to:
  - `/config/runtime/ensure-podcast-root`
- includes:
  - `sshHost`
  - `sshUser`
  - `podcastRoot`
- then re-runs runtime verification

### Why it matters
This is a concrete example of the Network & Runtime branch actively fixing an environment problem, not just reporting it.

It also shows that podcast path setup straddles:
- runtime verification
- feature-specific content maintenance

## 9. Preload / load behavior

Observed config-load behavior includes:
- ports from config/runtime
- host values from config/runtime
- path values from config/runtime
- conservative fallback defaults when unset
- hint text that changes depending on whether values came from config or auto-defaulting

### Why it matters
This means the UI does some interpretive work for the operator rather than dumping raw config values without context.

## 10. Save behavior

Observed save assembly includes fields such as:
- `trackKey`
- `apiNodeIp`
- `ports.api`
- `ports.ui`
- `mpd.host`
- `mpd.port`
- `moode.sshHost`
- `moode.sshUser`
- `moode.baseUrl`
- `paths.musicLibraryRoot`
- `paths.moodeUsbMount`
- `paths.piMountBase`
- `paths.podcastRoot`

### Why it matters
This is the config persistence layer for the core environment model.
Many other config features depend on these values being sane.

## Important endpoint surface

Based on current inspection, the key runtime/setup endpoints include:
- `POST /config/runtime/check-env`
- `POST /config/runtime/ensure-podcast-root`

The rest of the field values persist through the broader config save path.

## User/operator workflow model

A useful current workflow model is:

### Initial bootstrap workflow
1. enter API/UI host and port info
2. enter MPD host/port
3. enter moOde SSH host/user
4. set track key
5. set library/mount paths
6. click `Check SSH + Paths`
7. review lights, pills, and details

### Path-normalization workflow
1. enter moOde media path
2. let the page derive API-host mount and podcast paths
3. verify the derived values
4. run runtime check

### Environment-fix workflow
1. run runtime check
2. inspect missing-path table
3. if podcast root is missing, create it
4. rerun runtime check
5. proceed only once runtime is ready

## Architectural interpretation

A good current interpretation is:
- this card is the operational bootstrap layer of Config
- it is both a model of the environment and a verification console
- it mediates between app host, MPD, moOde SSH, and filesystem assumptions
- other config modules depend on it being correct

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `local-environment.md`
- `deployment-and-ops.md`
- future podcast/path-focused config pages

## Things still to verify

Future deeper verification should clarify:
- exactly how `applyRuntimeGate()` blocks/unblocks downstream cards
- what full payload the `check-env` endpoint returns in all scenarios
- whether there are additional runtime-fix endpoints beyond podcast-root creation
- how often Brian’s current deployment relies on `nowplaying.local` auto-prefill vs explicit configured hosts

## Current status

At the moment, this page gives the Network & Runtime card the treatment it deserves.

It is not just a list of host fields.
It is:
- environment bootstrap
- security setup
- path model definition
- SSH help surface
- runtime verification console
- gating/unlocking layer for the broader Config page
