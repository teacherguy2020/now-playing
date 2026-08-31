# config page anatomy

## Purpose

This page documents the internal anatomy of `now-playing/config.html`.

It exists because `config.html` is one of the densest pages in the entire project.
It is not just a generic settings page.
It is a multi-card operator console with:
- runtime/bootstrap setup
- environment verification
- feature toggles
- integration setup
- service controls
- database maintenance actions
- notification settings
- raw JSON editing
- save/reload/restart workflows

This page is meant to help future agents answer questions like:
- “where is the runtime card?”
- “which block owns Alexa setup?”
- “where do ratings backup/restore actions live?”
- “is this a display enhancement setting or a push action?”
- “where does the raw JSON editor start?”

## Why anatomy matters here

`config.html` is exactly the kind of page where people will ask for:
- “the runtime card”
- “the podcasts block”
- “the Last.fm section”
- “the ratings backup thing”
- “the advanced JSON editor”
- “the Alexa domain checker”

Those are anatomy questions.

## High-level role of `config.html`

A good current interpretation is:
- `config.html` is the main operator-facing configuration console
- it is also a maintenance and verification surface
- it mixes structured configuration, environment checks, feature toggles, service controls, and raw-config editing
- some cards are pure configuration surfaces, while others are action-heavy maintenance tools

So the page should be understood as a multi-card operator shell, not just a settings form.

## Main anatomical regions

The current page anatomy is best understood as these main regions:

1. shell redirect / top action strip
2. runtime/network bootstrap card
3. podcasts and library-path card
4. radio artwork and display/render feature card(s)
5. mpdscribble service-control card
6. Last.fm / Vibe card
7. Alexa setup card
8. ratings maintenance card
9. track notifications / Pushover card
10. animated art and album personnel card(s)
11. advanced JSON editor card
12. save / reload / restart workflow layer

## 1. Shell redirect / top action strip

### What it is
This is the page’s top-level shell/entry behavior plus top action controls.

Important anchors include:
- shell redirect logic into `app.html?page=config.html`
- `#saveBtnTop`
- `#reloadBtn`
- `#saveBtn`
- `#modalRestartBtn`

### What it does
This layer determines whether the page runs standalone or inside the app shell, and provides the page-level save/reload/restart entrypoints.

### Why it matters
A request like “change how Config saves” may belong here rather than inside any one card.

## 2. Runtime/network bootstrap card

### What it is
This is the foundational Step 1 card for runtime/bootstrap setup.

Key anchors include:
- `#apiNodeIp`
- `#apiPort`
- `#uiPort`
- `#mpdHost`
- `#mpdPort`
- `#moodeSshHost`
- `#moodeSshUser`
- `#moodeBaseUrl`
- `#configTrackKey`
- `#pathMusicLibraryRoot`
- `#pathMoodeUsbMount`
- `#pathPiMountBase`
- `#checkRuntimeBtn`
- `#runtimeCheckStatus`
- `#runtimeCheckDetails`
- `#sshSetupCmds`

### What it does
This card defines:
- app-host connection assumptions
- MPD connection assumptions
- moOde SSH/runtime assumptions
- track-key protection baseline
- path/mount assumptions
- environment verification / unlock behavior

### Main logic center
Important functions include:
- `applyInitialNetworkPrefills()`
- `checkRuntimeEnv()`
- `ensurePodcastRoot()`
- `refreshSshSetupHelp()`

### Why it matters
This is the true bootstrap card for the page. Many later cards assume this card is correct.

### Companion pages
- `config-network-and-runtime.md`
- `backend-change-verification-runbook.md`
- `deployment-and-ops.md`
- `local-environment.md`

## 3. Podcasts and library-path card

### What it is
This region covers podcast enablement and related path/nightly automation controls.

Key anchors include:
- `#podcastsEnabled`
- `#podcastsRoot`
- `#podcastsCronEnabled`
- `#podcastsCronTime`

### What it does
It controls podcast-specific storage/path behavior and scheduled background activity.

### Why it matters
This is one of the places where config state and runtime environment assumptions meet.

### Companion pages
- `config-podcasts-and-library-paths.md`
- `config-network-and-runtime.md`

## 4. Radio artwork and display/render feature card(s)

### What they are
These regions cover visible presentation-related feature toggles.

Key anchors include:
- `#radioArtworkEnabled`
- `#moodeDisplayEnhanced`
- display-target/check helpers such as `checkDisplayTakeoverTargetNow()`

### What they do
These cards govern:
- radio per-track artwork behavior
- moOde display enhancement / takeover behavior
- some display-mode enabling and target-check workflows

### Why they matter
These are easy to mistake for pure UI settings, but some of them overlap directly with live display/runtime behavior.

### Companion pages
- `config-display-and-render-features.md`
- `display-interface.md`
- `display-issue-triage-runbook.md`

## 5. mpdscribble service-control card

### What it is
This is the mpdscribble service-control region.

Key anchors include:
- `#mpdscribbleEnabled`
- `#mpdscribbleRefreshBtn`
- `#mpdscribbleStartBtn`
- `#mpdscribbleStopBtn`

### What it does
This card provides service-adjacent visibility and action controls for mpdscribble.

### Why it matters
This is one of the clearest examples of Config being an operational console, not just a config form.

### Companion pages
- `config-lastfm-and-scrobbling.md`
- `deployment-and-ops.md`

## 6. Last.fm / Vibe card

### What it is
This is the Last.fm/Vibe feature block.

Key anchors include:
- `#lastfmEnabled`
- `#lastfmApiKey`
- `#lastfmUser`
- `#lastfmRowsMode`
- related Vibe/row-mode options

### What it does
This card configures Last.fm-backed enrichment and Vibe-oriented row behavior.

### Why it matters
This card overlaps with Queue Wizard and curation behavior, not just standalone Last.fm settings.

### Companion pages
- `config-lastfm-and-scrobbling.md`
- `queue-wizard-internals.md`

## 7. Alexa setup card

### What it is
This is the Alexa setup/provisioning card.

Key anchors include:
- `#alexaEnabled`
- `#alexaPublicDomain`
- `#checkAlexaDomainBtn`
- `#alexaRouteWebhookUrl`

### What it does
This card governs Alexa enablement, public-domain assumptions, route/webhook setup, and domain health verification.

### Why it matters
It is easy to confuse this card with the separate Alexa corrections/review surface. They are related but not the same thing.

### Companion pages
- `config-alexa-setup.md`
- `alexa-interface.md`

## 8. Ratings maintenance card

### What it is
This is the ratings DB management region.

Key anchors include:
- `#ratingsEnabled`
- `#ratingsDbStatus`
- `#ratingsBackupBtn`
- `#ratingsRestoreBtn`

### What it does
It provides ratings feature enablement plus database status, backup, and restore workflows.

### Why it matters
This is a distinctly operational/maintenance card, not just a feature toggle.

### Companion pages
- `config-ratings.md`
- `backend-change-verification-runbook.md`

## 9. Track notifications / Pushover card

### What it is
This is the notifications block.

Key anchors include:
- `#notifyEnabled`
- `#notifyPushoverToken`
- `#notifyPushoverUser`
- `#notifyAlexaMaxAgeMs`

### What it does
It configures notification behavior, Pushover credentials, background monitor behavior, and timing-related notification assumptions.

### Why it matters
This card overlaps with event freshness and Alexa-related state assumptions rather than being only generic notifications.

### Companion pages
- `config-notifications.md`

## 10. Animated art and album personnel card(s)

### What they are
These are smaller but still important presentation-facing cards.

Key anchors include:
- `#animatedArtEnabled`
- `#albumPersonnelEnabled`

### What they do
They govern animated Apple Music artwork behavior and album-personnel feature visibility.

### Why they matter
These cards are small, but they affect visible playback presentation and can overlap with host/runtime dependency assumptions.

### Companion pages
- `config-display-and-render-features.md`

## 11. Advanced JSON editor card

### What it is
This is the raw config editor region.

Key anchors include:
- `#fullJson`
- `#saveFullBtn`
- `#formatJsonBtn`

### What it does
It provides direct full-config editing and formatting, bypassing the structured field-by-field card UI.

### Main logic center
Important functions include:
- `saveFullCfg()`

### Why it matters
This is the clearest “power user / raw config” region of the page.
A request to improve JSON editing should start here, not in the runtime/bootstrap card.

### Companion pages
- `config-advanced-json.md`

## 12. Save / reload / restart workflow layer

### What it is
This is the cross-card workflow layer that ties the page together.

Important functions include:
- `loadCfg()`
- `saveCfg()`
- `saveFullCfg()`
- `restartServicesNow()`

Important anchors include:
- `#saveBtnTop`
- `#saveBtn`
- `#reloadBtn`
- `#modalRestartBtn`

### What it does
This layer loads runtime config, saves structured config, saves raw config, and coordinates restart-services workflow after config changes.

### Why it matters
This is where page-level config lifecycle lives. A change to save/reload/restart behavior belongs here, not to any one card.

## Practical “where do I start?” map

### If asked to change runtime/bootstrap behavior
Open first:
- `#apiNodeIp`, `#mpdHost`, `#moodeSshHost`, `#configTrackKey`
- `checkRuntimeEnv()`
- `config-network-and-runtime.md`

### If asked to change podcast setup behavior
Open first:
- `#podcastsEnabled`
- `#podcastsRoot`
- `#podcastsCronEnabled`

### If asked to change display enhancement settings
Open first:
- `#moodeDisplayEnhanced`
- display-target check helpers
- display companion pages

### If asked to change Last.fm / Vibe behavior in Config
Open first:
- `#lastfmEnabled`
- `#lastfmApiKey`
- `#lastfmRowsMode`

### If asked to change Alexa setup behavior
Open first:
- `#alexaEnabled`
- `#alexaPublicDomain`
- `#checkAlexaDomainBtn`

### If asked to change ratings backup/restore behavior
Open first:
- `#ratingsDbStatus`
- `#ratingsBackupBtn`
- `#ratingsRestoreBtn`

### If asked to change the raw JSON editor
Open first:
- `#fullJson`
- `#saveFullBtn`
- `#formatJsonBtn`
- `saveFullCfg()`

### If asked to change save/restart flow
Open first:
- `#saveBtnTop`
- `#saveBtn`
- `#reloadBtn`
- `#modalRestartBtn`
- `saveCfg()`
- `restartServicesNow()`

## Anatomy rule for future agents

For `config.html`, do not assume a requested change belongs only to:
- generic settings UI
- runtime bootstrap logic
- one feature card
- or raw JSON editing

Always classify the target first:
- bootstrap/runtime card
- feature-specific config card
- service-control card
- maintenance/backup card
- raw editor card
- cross-card save/restart workflow

That classification step should prevent a lot of wrong first guesses.

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `config-network-and-runtime.md`
- `config-podcasts-and-library-paths.md`
- `config-display-and-render-features.md`
- `config-lastfm-and-scrobbling.md`
- `config-ratings.md`
- `config-notifications.md`
- `config-alexa-setup.md`
- `config-advanced-json.md`
- `backend-change-verification-runbook.md`

## Current status

At the moment, this page gives the wiki its sixth real page-anatomy reference.

Its main job is making explicit that `config.html` is not just “the Config page.”
It is a multi-card operator console with:
- bootstrap/runtime setup
- feature modules
- service controls
- maintenance actions
- raw JSON editing
- and cross-card save/restart workflows.
