# config feature breakdown

## Purpose

This page documents the major feature areas inside `now-playing/config.html`.

It exists because `config-interface.md` establishes what the Config page is and how it behaves as a surface, but it does not yet decompose the major feature modules inside that page.

This page is the feature-level breakdown for `config.html`.

## Why this page matters

`config.html` is not a single-purpose settings form.
It is a broad runtime/operator console that combines:
- host/runtime setup
- feature toggles
- credentials/secrets
- integration-specific config
- service-adjacent controls
- diagnostics-adjacent maintenance actions
- advanced raw JSON editing

That makes it important to map the major feature clusters explicitly.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `alexa-interface.md`
- `radio-metadata-eval-interface.md`
- `diagnostics-interface.md`
- `integrations.md`

## High-level structure

Repo inspection shows that `config.html` is organized around several major cards/modules.

## 1. Network & Runtime

This is the foundational setup card and effectively the gate for much of the rest of the page.

Observed fields include:
- API host / API port / UI port
- MPD host / MPD port
- moOde SSH host / SSH user
- moOde base URL override
- track key
- music library root
- moOde USB mount path
- API-host mount base path

Observed actions include:
- `Check SSH + Paths`
- `Save Configuration`

### Why it matters
This card appears to establish the runtime environment assumptions that unlock or validate other feature cards.

The page even labels it as:
- **Step 1**
- fill this card first
- then click **Check SSH + Paths** to unlock other modules

### Working interpretation
A good current interpretation is:
- this is the environment/bootstrap layer of the Config page
- many feature modules depend on its host/path/runtime assumptions being correct

## 2. Podcasts

Observed elements include:
- `featurePodcasts`
- podcast root path on API host
- install nightly cron helper

### Why it matters
This is not just a toggle.
It appears to connect podcast UI enablement with background download/subscription tooling and scheduled maintenance behavior.

## 3. Radio Artwork

Observed elements include:
- `featureRadio`

### Why it matters
This appears to enable radio per-track artwork behavior in now-playing flows.
Even though the visible config is small, the feature likely has meaningful downstream effect on how radio metadata/art presentation behaves.

## 4. moOde Display Enhancement

Observed elements include:
- `featureMoodeDisplayTakeover`
- display takeover target hint

### Why it matters
This is one of the important bridges between the app-host UI and moOde display behavior.
When enabled, Peppy/Player display tools can point moOde’s browser target at this server.

This is a strong example of Config affecting live display-routing behavior, not just local UI preferences.

## 5. mpdscribble controls

Observed elements include:
- `featureMpdscribbleControl`
- status display
- refresh/start/stop controls

### Why it matters
This makes mpdscribble both a configuration concern and a service-control concern.

Observed wording suggests:
- controls can appear in hero UI
- start/stop actions are available from Config

So this module bridges scrobble-related runtime service behavior into the config surface.

## 6. Last.fm / Vibe

Observed elements include:
- `featureLastfm`
- Last.fm API key
- Last.fm username
- `lastfmRecentsReplaceRadio`
- Last.fm row mode:
  - `toptracks`
  - `recenttracks`
  - `topartists`
  - `topalbums`

### Why it matters
This is one of the richer feature areas inside Config.
It affects:
- whether Last.fm/Vibe features are enabled
- what credentials are available
- whether Last.fm content replaces the favorite-radio row
- how that Last.fm row behaves

### Important nuance
The page explicitly notes:
- Vibe tools depend on this configuration
- the Last.fm row relies on scrobble history
- mpdscribble is a common source, but not the only possible scrobble source

So this section is not just “enter API key.” It defines part of the curation/discovery layer.

## 7. Alexa setup

Observed elements include:
- `featureAlexaSkill`
- public domain
- domain check button
- route webhook URL

### Why it matters
This section appears to own:
- whether Alexa skill support is enabled
- what public domain the skill uses
- what webhook URL is used for route-to-Alexa actions

### Important boundary
The page explicitly says:
- Alexa corrections and misheard review moved to the dedicated `alexa.html` page
- Config is still the source of truth for enable/domain setup

So the wiki should distinguish two Alexa layers:
- `config.html` = provisioning/setup layer
- `alexa.html` = correction/review layer

### Important API surface
Observed code also checks Alexa domain health via:
- `POST /config/alexa/check-domain`

That makes this section more than static settings.

## 8. Ratings setup

Observed elements include:
- `featureRatings`
- `Check Ratings DB`
- `Backup Ratings DB`
- `Restore Selected Backup`
- ratings backup selector
- ratings DB status area

### Why it matters
This is much richer than a simple feature toggle.
It includes operational database maintenance around the MPD sticker DB used for ratings.

### Important endpoints
Observed API calls include:
- `POST /config/ratings/sticker-status`
- `POST /config/ratings/sticker-backup`
- `POST /config/ratings/sticker-restore`
- and listing backups via:
  - `/config/ratings/sticker-backups`

### Working interpretation
A good current interpretation is:
- Ratings config includes both enablement and DB stewardship
- this is one of the clearest examples of Config acting as an operational maintenance console

## 9. Track Notifications / Pushover

Observed elements include:
- `featurePushover`
- `notifyEnabled`
- poll ms
- dedupe ms
- Alexa max age ms
- Pushover token
- Pushover user key

### Why it matters
This is the main push-notification feature cluster currently visible in Config.
It appears to control:
- whether notifications are enabled
- whether background track monitoring is active
- polling and dedupe behavior
- how Alexa-related recency gates influence notification logic
- Pushover credentials

### Important clarification
Based on current repo-visible evidence, the current push-notification feature documented here is specifically **Pushover-oriented**, not a broad multi-provider notification framework.

## 10. Animated Art

Observed elements include:
- `motionArtToggle`

### Why it matters
This section controls whether animated Apple Music artwork is used when available.
That makes it a display/presentation feature toggle with direct effect on visible hero/index behavior.

## 11. Album Personnel

Observed elements include:
- `featureAlbumPersonnel`

### Why it matters
This controls whether the personnel block appears on the Now Playing page.
The UI also notes an environment dependency:
- personnel extraction requires `metaflac` on the player host

This is a good example of a user-visible feature with a host-tool dependency.

## 12. Advanced JSON (full config)

Observed elements include:
- full raw config textarea
- `Format JSON`
- `Save Full JSON`

### Why it matters
This is the escape hatch / power-user layer of Config.
It means the page is not limited to structured form inputs.
Operators can also work directly with the full config document.

That is both powerful and risky, and should stay explicit in the wiki.

## Important runtime/write behavior

Repo-visible code indicates that `config.html` does more than render sections.
It also:
- loads runtime config into the form
- caches certain secrets locally
- persists feature state back into runtime config
- performs feature-specific maintenance calls

### Secrets cached locally
Observed secret caching includes:
- Last.fm API key
- Pushover token
- Pushover user key

### Feature flags observed in config assembly
Observed feature toggles include at least:
- podcasts
- radio
- moOde display takeover
- mpdscribble control
- ratings
- Last.fm
- Alexa skill
- Pushover notifications
- album personnel

## Feature relationships worth keeping explicit

## Push notifications vs Alexa
These are related but not the same feature.

Config currently exposes:
- Pushover credentials and track-notify behavior
- Alexa max age ms inside notification settings
- Alexa domain/webhook setup in a separate Alexa section
- correction/review work on the separate Alexa page

So the wiki should not collapse them into one voice/notify blob.

## Last.fm vs mpdscribble
These are strongly related but still distinct.

Config suggests:
- mpdscribble is a controllable scrobble/runtime service layer
- Last.fm is the downstream feature/integration layer used for Vibe and row presentation

That distinction matters when debugging or documenting scrobble-based behavior.

## Ratings vs general preferences
Ratings setup here is not just a visual preference.
It includes persistent database handling and backup/restore workflows.

So ratings should be treated as a substantive feature subsystem.

## Candidate future child pages

This page likely justifies several future config-focused child pages.

### `config-network-and-runtime.md`
For the host/path/runtime bootstrap card.

### `config-lastfm-and-scrobbling.md`
For mpdscribble + Last.fm + Vibe.

### `config-notifications.md`
For Pushover + track notifications.

### `config-ratings.md`
For ratings DB verification, backup, and restore.

### `config-alexa-setup.md`
For Alexa enablement/domain/webhook setup, distinct from the correction page.

## Architectural interpretation

A good current interpretation is:
- `config.html` is really a collection of feature modules, not one monolithic settings form
- some modules are pure feature toggles
- some are integration setup surfaces
- some are operational maintenance tools
- some bridge directly into live runtime or host-side behavior

That makes feature decomposition essential.

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `configuration-and-diagnostics-interfaces.md`
- `integrations.md`
- `alexa-interface.md`
- `diagnostics-interface.md`
- future config feature child pages

## Current status

At the moment, this page gives `config.html` a much more honest representation.

It shows that Config includes at least these major feature clusters:
- runtime/network setup
- podcasts
- radio artwork
- moOde display enhancement
- mpdscribble
- Last.fm / Vibe
- Alexa setup
- ratings DB management
- Pushover track notifications
- animated art
- album personnel
- advanced raw JSON editing

So, yes: `config.html` is much more than a generic settings page.
