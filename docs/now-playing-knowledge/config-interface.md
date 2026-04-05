# config interface

## Purpose

This page documents `now-playing/config.html`, the main operator-facing configuration console in the `now-playing` ecosystem.

This page is intentionally implementation-aware, because `config.html` is clearly not just a static settings form. It acts as a broad operational console for:
- reading runtime config
- editing and saving configuration
- verifying environment assumptions
- driving maintenance actions
- checking integrations and service health

## Why this page matters

`config.html` appears to be one of the central operator surfaces in the project.

It matters because it combines:
- configuration editing
- environment validation
- service/integration maintenance actions
- operator feedback and restart flow
- multiple feature-specific maintenance tools in one place

That makes it one of the highest-value pages to document concretely.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `configuration-and-diagnostics-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `restart-and-runtime-admin-troubleshooting.md`

## High-level role

A good current interpretation is:
- `config.html` is the main broad-spectrum operator console
- it is both a configuration editor and an operational maintenance surface
- it mediates between human-entered settings and runtime/API-backed verification flows

This page is therefore not only about “settings.” It is about turning live system assumptions into visible, testable, editable state.

## Shell / entry behavior

`config.html` contains shell-redirect behavior near the top of the page.

Observed logic:
- if `standalone=1`, remain in standalone mode
- if loaded top-level without `standalone=1`, redirect into:
  - `app.html?page=config.html`
- if already embedded in a shell, do not redirect

This means `config.html` is designed to work in two contexts:
- standalone operator page
- shell-hosted page inside the broader browser app

That is an important architectural fact.

## Major UI areas visible in the page

Repo-visible structure shows that `config.html` includes a large number of operator-facing areas, including:
- network & runtime configuration
- podcasts controls
- mpdscribble service controls
- Alexa configuration and alias/correction management
- ratings DB maintenance
- full raw JSON editing
- restart-services modal flow
- pre-hero status pills for API/Web/Alexa/moOde visibility

So this page is more like a control console than a narrow settings form.

## Key DOM/action centers

Important operator-facing elements include:
- `#checkRuntimeBtn`
- `#saveBtnTop`
- `#saveBtn`
- `#saveFullBtn`
- `#reloadBtn`
- `#modalRestartBtn`
- `#mpdscribbleRefreshBtn`
- `#mpdscribbleStartBtn`
- `#mpdscribbleStopBtn`
- `#checkAlexaDomainBtn`
- `#checkRatingsDbBtn`
- `#backupRatingsDbBtn`
- `#restoreRatingsDbBtn`
- `#formatJsonBtn`

This is a useful clue: `config.html` is action-heavy, not just field-heavy.

## Runtime config as the center of gravity

One of the clearest architectural facts in `config.html` is that the page revolves around:
- `GET /config/runtime`
- `POST /config/runtime`

These appear to be the core read/write endpoints for the page.

Observed high-level functions include:
- loading current config from runtime
- populating UI fields from returned config
- constructing a config payload from UI values
- saving that payload back to runtime

This makes `/config/runtime` one of the most important API surfaces in the operator UI.

## Key functions / logic blocks

## `loadCfg()`
This appears to be the main config-loading function.

Observed responsibilities include:
- fetch runtime config from `/config/runtime`
- populate many feature fields from the returned object
- hydrate saved track key state
- populate network/runtime/path values
- populate feature toggles and integration sections
- render alias/correction tables
- load the full raw JSON editor

This is a major function because it turns raw runtime config into the whole visible page state.

## `saveCfg()`
This appears to be the main structured save path.

Observed behavior includes:
- validate presence of a track key
- validate required host values such as MPD host
- gather many UI values into a structured config object
- POST to `/config/runtime`
- update saved-state baseline and trigger save-complete UX

This is likely the main “normal save” path for the page.

## `saveFullCfg()`
This is a more powerful/raw save path.

Observed behavior includes:
- read JSON directly from the full JSON editor
- validate/parse it
- POST it to `/config/runtime`

This is important because it means `config.html` offers both:
- structured form-based editing
- raw full-config editing

That is a powerful operator affordance and a real risk surface if used casually.

## `saveArtistCorrectionsOnly()`
This is one example of a narrower targeted save path.

Observed role:
- save artist/album/playlist correction structures back through runtime config
- supports the alias/correction-management sections without requiring a full-page save workflow each time

This reinforces that `config.html` includes feature-specific maintenance tools, not just one monolithic form.

## `checkRuntimeEnv()`
This is one of the most important operational functions.

Observed behavior includes:
- require a track key
- gather MPD/SSH/path/runtime values from the page
- POST to:
  - `/config/runtime/check-env`
- update runtime status UI
- unlock or block downstream config cards based on result

This is especially important because the page explicitly treats runtime verification as:
- Step 1
- a gate before other modules are fully trusted/usable

That is a very strong operator-workflow signal.

## `ensurePodcastRoot()`
Observed behavior includes:
- POST to:
  - `/config/runtime/ensure-podcast-root`

This suggests `config.html` includes environment-fixing actions, not just environment inspection.

## `restartServicesNow()`
Observed behavior includes:
- POST to:
  - `/config/restart-services`

This is connected to the save/restart modal flow and shows that `config.html` crosses directly into operational service control.

## `refreshMpdscribbleStatus()` and mpdscribble actions
Observed endpoints include:
- `GET /config/services/mpdscribble/status`
- `POST /config/services/mpdscribble/action`

This means the page includes direct service-management actions for mpdscribble.

## `checkAlexaDomain()`
Observed behavior includes:
- POST to:
  - `/config/alexa/check-domain`

This is an example of integration-specific operational verification inside the page.

## Ratings DB maintenance flows
Observed endpoints include:
- `GET /config/ratings/sticker-status`
- `GET /config/ratings/sticker-backups`
- `POST /config/ratings/sticker-backup`
- `POST /config/ratings/sticker-restore`

This is a substantial maintenance/admin sub-feature living inside `config.html`.

## Important API calls

Based on current inspection, important API endpoints used by `config.html` include:

### Runtime/config center
- `GET /config/runtime`
- `POST /config/runtime`
- `POST /config/runtime/check-env`
- `POST /config/runtime/ensure-podcast-root`

### Service/admin actions
- `POST /config/restart-services`
- `GET /config/services/mpdscribble/status`
- `POST /config/services/mpdscribble/action`

### Alexa/integration checks
- `POST /config/alexa/check-domain`

### Ratings maintenance
- `GET /config/ratings/sticker-status`
- `GET /config/ratings/sticker-backups`
- `POST /config/ratings/sticker-backup`
- `POST /config/ratings/sticker-restore`

### Podcast maintenance
- `GET /podcasts/nightly-status`

This is a lot of operational surface area for one page, which is precisely why documenting it matters.

## Track key handling

`config.html` places strong emphasis on the track key.

Observed behavior includes:
- storing/retrieving a local cached track key
- syncing it into visible fields
- requiring it before many runtime or save actions
- using it in protected config/maintenance requests

This suggests the track key is one of the central operator credentials for the page’s write/maintenance capabilities.

## Alias and correction management

The page also includes substantial correction-management UI for things like:
- artist aliases
- album aliases
- playlist aliases
- unresolved heard values and promotion/dismiss flows

This matters because it shows `config.html` is also part of the “voice/input cleanup and correction” workflow, not merely static runtime config editing.

## Save / reload / restart model

A useful current model for the page’s operator workflow is:

1. load runtime config
2. edit structured fields or raw JSON
3. optionally run environment verification
4. save config via structured or raw path
5. optionally restart services through the modal flow

So the page embodies a real operator lifecycle rather than isolated button actions.

## Architectural interpretation

A good current interpretation is:
- `config.html` is the broad operational front-end for runtime config
- it bundles together multiple admin and maintenance sub-workflows
- it is one of the strongest bridges between UI, runtime API, and live environment assumptions

This makes it one of the most important pages in the operator/admin branch.

## Related branch pages

- `config-feature-breakdown.md`
- `config-ratings.md`
- `config-lastfm-and-scrobbling.md`
- `config-notifications.md`
- `config-alexa-setup.md`
- `alexa-interface.md`

`config-feature-breakdown.md` is the current feature-level decomposition of the major modules inside `config.html`.

`config-ratings.md` is the dedicated drill-down for the ratings setup and sticker-DB maintenance block inside Config.

`config-lastfm-and-scrobbling.md` is the dedicated drill-down for mpdscribble, Last.fm, and Vibe-related Config behavior.

`config-notifications.md` is the dedicated drill-down for the Pushover-backed track notifications block and its monitor/timing controls.

`config-alexa-setup.md` is the dedicated drill-down for Alexa enablement, domain setup, route webhook configuration, and domain reachability checks inside Config.

This is the most direct current wiki page for the Alexa corrections/review surface that complements the main Config page.

## Relationship to other pages

This page should stay linked with:
- `configuration-and-diagnostics-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `restart-and-runtime-admin-troubleshooting.md`
- future `diagnostics-interface.md`
- future `library-health-interface.md`
- future `theme-interface.md`

## Things still to verify

Future deeper verification should clarify:
- the exact structure of the config payloads sent by `saveCfg()`
- which config changes are live-applied versus restart-sensitive
- how much of the page is still actively used versus legacy/admin overflow
- whether some sub-features should be split into dedicated operator pages over time
- how `app.html?page=config.html` changes the effective experience compared with standalone mode

## Current status

At the moment, this page already has enough evidence to be treated as one of the core operator-console pages in the system.

It is not just a settings page. It is a runtime config editor, environment validator, maintenance panel, and service-control surface all in one.
