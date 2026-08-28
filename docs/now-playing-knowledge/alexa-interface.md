# alexa interface

## Purpose

This page documents `now-playing/alexa.html`, the Alexa corrections and recently-heard review surface in the `now-playing` ecosystem.

This page is important because `alexa.html` is not the main place where Alexa enablement or public-domain exposure are configured.
Instead, it is a config-adjacent maintenance and review page focused on:
- alias/correction editing
- recently heard Alexa terms
- fast cleanup of misheard artists/albums/playlists
- operator guidance on what voice commands the skill supports

## Why this page matters

Alexa integration is especially sensitive to misrecognition and fuzzy spoken input.

That means a durable Alexa workflow needs more than a simple on/off toggle. It also needs a correction surface where operators can:
- inspect what Alexa heard recently
- add persistent corrections
- clean out stale recently-heard lists
- understand the intended command grammar

`alexa.html` appears to be that surface.

## Important files

Primary files:
- `now-playing/alexa.html`
- `now-playing/scripts/alexa.js`

Related pages:
- `config-interface.md`
- `integrations.md`
- `phone-interface.md`
- `desktop-browser-interface.md`

## High-level role

A good current interpretation is:
- `alexa.html` is the Alexa maintenance/review console
- the Config page remains the source of truth for enablement and public domain
- this page focuses on corrections, recently-heard review, and command guidance

That distinction is important and intentional.

## Shell / routing behavior

One of the first important behaviors appears at the top of `alexa.html`.

Observed shell redirect behavior:
- read query params
- if `standalone=1`, remain on the page directly
- otherwise, if top-level and not embedded in another page, redirect to:
  - `app.html?page=alexa.html`

### Working interpretation
A good current interpretation is:
- `alexa.html` is usually intended to live inside the broader app shell
- `standalone=1` exists as an escape hatch for direct standalone viewing

That makes this page part of the app-shell ecosystem, not purely a free-floating HTML utility page.

## Main visible sections

Repo-visible structure shows four main sections.

## 1. Config handoff / scope note
The first card explicitly says:
- Alexa enable + public domain are managed on the Config page
- this page focuses on corrections and recently-heard review

Hidden fields remain in the DOM for script compatibility:
- `#alexaEnabled`
- `#publicDomain`
- `#saveSettingsBtn`

That strongly suggests the page evolved from a broader config surface into a more focused maintenance page, while preserving script compatibility.

## 2. Corrections / alias JSON editors
Observed fields include:
- `#artistAliases`
- `#albumAliases`
- `#playlistAliases`
- `#saveAliasesBtn`
- `#aliasesSaveNote`

This is the main manual correction area.

The page explicitly frames these as:
- persisted to config JSON
- immediately relevant to fixing misheard Alexa results

## 3. Recently Heard review
Observed containers include:
- `#heardArtists`
- `#heardAlbums`
- `#heardPlaylists`
- clear buttons for each list

This area is especially important because it turns live Alexa usage into actionable correction work.

## 4. Spoken-command help / examples
The page also includes a human-facing helper section describing supported phrases for:
- playback
- local control with `here`
- vibe commands
- controls like shuffle/repeat/pause/resume/next/thumbs up

This makes the page both a maintenance tool and a lightweight operator/user reference.

## Important script logic in `scripts/alexa.js`

## Runtime config loading: `load()`
This is one of the most important functions.

Observed behavior includes:
- fetch runtime config from:
  - `GET /config/runtime`
- store config in local state
- cache `trackKey` in localStorage under:
  - `np_track_key`
- populate Alexa alias JSON fields
- populate recently-heard lists
- update service pills/hints from config
- set status to `Loaded.`

This confirms that the page is tightly tied to runtime config, not to a separate Alexa-only store.

## Runtime config writing: `postRuntime(nextAlexa)`
This is the core write path.

Observed behavior includes:
- read cached track key from localStorage
- POST to:
  - `/config/runtime`
- send payload shaped like:
  - `{ config: { alexa: nextAlexa } }`
- include `x-track-key`

This is the main persistence contract for Alexa corrections and list clearing.

## Alias editing flow: `saveAliases()`
Observed behavior includes:
- parse JSON objects from:
  - `artistAliases`
  - `albumAliases`
  - `playlistAliases`
- merge them into the runtime Alexa config
- persist through `postRuntime(...)`
- show save note and reload the page state

This means manual JSON edits are first-class, not a hidden/debug-only behavior.

## Recently-heard rendering: `renderHeard(...)`
This is one of the most useful logic blocks in the script.

Observed behavior includes:
- read recently-heard rows from config
- filter to entries with real content
- suppress low-value attempt rows if an error row exists for the same item
- classify status visually
- show existing alias mapping if one exists
- show a `Fix` button for error-like entries that do not already have a correction

This is an important operator workflow improvement.
It means the page is not just showing raw heard terms — it is actively guiding correction work.

## Inline correction flow
The document-level click handler for `button[data-fix-type]` provides one of the most important action flows in the page.

Observed behavior includes:
1. click `Fix` on a misheard row
2. prompt for corrected artist/album/playlist value
3. update the corresponding alias JSON map in the textarea
4. call `saveAliases()`
5. persist the correction to runtime config
6. reload and re-render the page

This is likely the fastest real-world operator path for improving Alexa matching.

## Clearing recently-heard lists: `clearHeard(kind)`
Observed behavior includes:
- mutate the appropriate Alexa array in runtime config:
  - `heardArtists`
  - `heardAlbums`
  - `heardPlaylists`
- POST updated config via `/config/runtime`
- reload page state

This supports cleanup and repeated testing cycles.

## Important helper behaviors

## `aliasKey(s)`
This normalizes alias keys by:
- trimming
- lowercasing

That implies alias matching is intended to be case-insensitive at the correction layer.

## `parseJsonField(id)`
This enforces that alias editors must contain JSON objects, not arrays or arbitrary JSON.

That matters because it keeps the alias configuration structurally predictable.

## `withButtonFeedback(...)`
This provides temporary busy/success/failure button states.

It is a small UX detail, but it makes the page more maintainable and operator-friendly.

## Important API calls

Based on current inspection, the key runtime endpoint is:
- `GET /config/runtime`
- `POST /config/runtime`

This page does not appear to use a separate Alexa-specific endpoint for its main actions.
Instead, it operates by reading and rewriting the Alexa subsection of runtime config.

## Service-pill / hint behavior

The script also includes service-pill support via:
- `updateServicePillsFromConfig(cfg)`
- `setPillState(...)`

Observed hints include values for:
- API host/port
- web host/port
- Alexa public-domain state
- moOde host verification

Even if the visible pill elements may depend on broader shell markup, this reinforces that the page participates in a wider config/status UI pattern.

## Command-model guidance embedded in the page

The helper text in `alexa.html` is important because it encodes intended command patterns.

Examples documented in the page include:
- “what’s playing”
- “play artist …”
- “play album …”
- “play playlist …”
- “play songs by …”
- direct artist name requests
- `here` variants that target moOde playback locally
- vibe commands
- transport/control phrases

Two especially important clarifications encoded in the page are:
- invocation name is `mood audio`
- `here` means local moOde playback, not playback on Echo speakers

That is valuable operational documentation, not just UI filler.

## User/operator workflow model

A useful current workflow model is:

### Correction workflow
1. open Alexa page
2. inspect recently-heard artists/albums/playlists
3. click `Fix` on misheard items or edit JSON manually
4. save aliases
5. retry Alexa request

### Cleanup workflow
1. clear recently-heard lists
2. trigger fresh Alexa usage/tests
3. observe what gets heard next
4. add or refine corrections

### Reference workflow
1. open Alexa page
2. review example commands
3. verify how `here`, vibe, and control commands are intended to behave

## Architectural interpretation

A good current interpretation is:
- `alexa.html` is the Alexa correction-and-review layer of the system
- it sits between live voice usage and persistent runtime config
- it is less about provisioning Alexa and more about maintaining voice command quality over time

That makes it a high-value integration-maintenance page.

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `integrations.md`
- `desktop-browser-interface.md`
- `phone-interface.md`
- future Alexa backend/integration pages

## Things still to verify

Future deeper verification should clarify:
- where and how the backend populates `heardArtists`, `heardAlbums`, and `heardPlaylists`
- how alias correction is applied during Alexa intent resolution server-side
- whether the helper command list here fully matches the live Alexa intent grammar
- whether `standalone=1` is used meaningfully in practice or mainly as a development escape hatch

## Current status

At the moment, this page gives `alexa.html` a clear role in the wiki:
- not primary Alexa provisioning
- not general playback UI
- a dedicated correction, review, and guidance surface for the Alexa integration

That is the right frame for now.
