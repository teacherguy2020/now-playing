# config podcasts and library paths

## Purpose

This page documents the podcast- and path-adjacent portions of `now-playing/config.html` that extend beyond the core Network & Runtime bootstrap card.

It exists because podcast behavior in Config sits at the intersection of:
- feature enablement
- API-host filesystem paths
- nightly automation
- runtime verification and folder creation

This makes it more than a small side toggle.

## Why this page matters

The Podcasts block is one of the clearest examples of Config bridging:
- visible feature enablement
- background automation expectations
- host filesystem setup
- runtime environment repair

It also overlaps with the path model established in the Network & Runtime card.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `config-network-and-runtime.md`
- future podcast feature pages

## Main visible controls

Observed UI elements include:
- `featurePodcasts`
- `pathPodcastRoot`
- `podcastsCronHint`
- `podcastsCronInstallHelpBtn`

## 1. Podcasts feature enablement

Observed behavior includes:
- Config loads and saves:
  - `features.podcasts`
- `syncPodcastsUi()` updates the Podcasts section based on whether the feature is enabled

### Why it matters
This is the top-level feature gate for podcast pages and supporting tooling.

The UI explicitly says it enables:
- podcast pages
- background download/subscription tools

## 2. Podcast root path

Observed field includes:
- `pathPodcastRoot`

Observed load/save behavior includes:
- load from `paths.podcastRoot`
- default to `/var/lib/mpd/music/Podcasts`
- save back into `paths.podcastRoot`

### Why it matters
This path is API-host specific and matters only when Podcasts is enabled.
But it is still treated as an important runtime path and participates in the runtime verification flow.

## 3. Podcasts UI gating

Observed helper includes:
- `syncPodcastsUi()`

Observed behavior includes:
- keep the path field visible for convenience even when Podcasts is off
- disable the path field and install button when Podcasts is off
- change hint text depending on whether Podcasts is enabled
- refresh nightly-automation status hint

### Working interpretation
A good current interpretation is:
- the page treats podcast configuration as optional but operationally meaningful once enabled
- it avoids hiding important path context entirely, even when the feature is off

## 4. Nightly automation / cron expectations

Observed helper includes:
- `refreshPodcastsCronHint()`
- `podcastsCronCommand()`
- `showPodcastsCronInstallHelp()`

### Observed behavior
The page checks:
- `GET /podcasts/nightly-status`
- includes `x-track-key`

Then it reports either:
- that nightly automation is active with a last-run time
- or that no nightly run has been recorded yet
- or that verification failed and cron should be installed manually

The generated cron line calls:
- `POST /podcasts/nightly-run`
- with `x-track-key`

### Why it matters
This is a strong sign that Podcasts in Config is not just a UI toggle. It includes an explicit operator workflow for background automation on the API host.

## 5. Runtime verification overlap

The Podcasts path also participates in runtime checking via:
- `checkRuntimeEnv()`

Observed behavior includes:
- `podcastRoot` is included in runtime path checks only when Podcasts is enabled
- missing podcast root can produce a follow-up action to create the folder

### Why it matters
This shows that podcast configuration straddles both:
- feature setup
- environment health verification

## 6. Podcast-root creation

Observed helper includes:
- `ensurePodcastRoot()`

Observed behavior includes:
- prompt for confirmation
- `POST /config/runtime/ensure-podcast-root`
- include:
  - SSH host
  - SSH user
  - podcast root path
- rerun runtime verification afterward

### Why it matters
This is an environment-repair action attached to the podcast feature branch.

## Important endpoints and action surfaces

Based on current inspection, relevant endpoints include:
- `GET /podcasts/nightly-status`
- `POST /podcasts/nightly-run` (through generated cron command)
- `POST /config/runtime/ensure-podcast-root`

## User/operator workflow model

A useful current workflow model is:

### Enablement workflow
1. enable Podcasts
2. confirm or edit podcast root path
3. save config

### Automation workflow
1. inspect nightly automation hint
2. if missing, use the install-cron helper
3. verify cron status later

### Repair workflow
1. run runtime verification
2. if podcast root is missing, create it
3. rerun checks

## Architectural interpretation

A good current interpretation is:
- this branch is a feature-and-operations hybrid
- it uses config to tie podcast UI enablement to filesystem and automation readiness
- it is part of the broader path/runtime model, but distinct enough to deserve its own page

## Current status

At the moment, this page gives the Podcasts block and podcast-root path behavior an honest scope:
- feature enablement
- path ownership
- nightly automation expectations
- runtime repair hooks
