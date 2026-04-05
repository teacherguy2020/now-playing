# config alexa setup

## Purpose

This page documents the Alexa setup portion of `now-playing/config.html`.

It exists because the Config page owns the provisioning/setup side of the Alexa integration, while the separate `alexa.html` page owns the correction/review side.

This page is about the setup layer:
- enablement
- public domain
- route webhook URL
- domain reachability checks
- setup-state visual feedback

## Why this page matters

Alexa support in this system is not only a matter of turning a feature on.
It also depends on:
- whether Alexa support is enabled
- whether a public domain is configured
- whether that public domain is actually reachable
- whether route-to-Alexa actions know what webhook URL to use

That makes the Config page the provisioning/control-plane side of Alexa.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `alexa-interface.md`
- `integrations.md`

## High-level role

A good current interpretation is:
- `config.html` owns Alexa setup/provisioning state
- `alexa.html` owns Alexa corrections, recently-heard review, and operator guidance
- both pages are part of the Alexa branch, but they serve different jobs

That split is one of the most important things to preserve in the wiki.

## Main visible controls

Observed Alexa setup UI elements include:
- `featureAlexaSkill`
- `alexaDomain`
- `checkAlexaDomainBtn`
- `alexaDomainCheckStatus`
- `alexaRouteWebhookUrl`
- `alexaDomainLight`

There is also wider shell-level health feedback through:
- `alexaHint`
- `alexaPill`

## 1. Alexa enablement

Observed behavior includes:
- Config loads enable state from:
  - `c.alexa?.enabled`
- Save assembly persists:
  - `alexa.enabled`

### Why it matters
This is the top-level switch for whether Alexa integration is active in the config model.

## 2. Public domain configuration

Observed field includes:
- `alexaDomain`

Observed save behavior persists this to:
- `alexa.publicDomain`

### Why it matters
The public domain appears to be a core requirement for Alexa reachability.
The page also uses domain presence/absence as a major signal in its status lights and pill state.

### Health-state behavior from config load
Observed behavior includes:
- if Alexa is disabled:
  - hint becomes `disabled`
  - Alexa pill is `off`
  - domain light is neutral
- if enabled but domain missing:
  - hint becomes `missing domain`
  - Alexa pill is `warn`
  - domain light is bad
- if enabled and domain present:
  - hint becomes masked domain text like `moode.••••••••.com`
  - Alexa pill becomes good
  - domain light becomes good

This means the Config page is actively interpreting Alexa setup state, not merely storing values.

## 3. Route webhook URL

Observed field includes:
- `alexaRouteWebhookUrl`

Observed save behavior persists this to:
- `alexa.routeWebhookUrl`

### Why it matters
The UI hint explicitly says this value is:
- used by “Route to Alexa” buttons in Live Queue / Hero Transport

So this field is not abstract setup metadata.
It is a live integration endpoint used by user-facing route-to-Alexa actions elsewhere in the system.

## 4. Domain reachability check

This is one of the most important active setup workflows in the Config page.

Observed function includes:
- `checkAlexaDomain()`

### Observed behavior
- requires track key
- requires a public domain value
- disables the check button while running
- updates `alexaDomainCheckStatus`
- sends:
  - `POST /config/alexa/check-domain`
- includes:
  - `Content-Type: application/json`
  - `x-track-key`
  - `{ domain }`
- reports either:
  - reachable URL + status code
  - not reachable result
  - or explicit failure state

### Why it matters
This is a real verification workflow, not just a config field.
It gives the operator direct feedback on whether the configured Alexa domain appears externally reachable.

## 5. Setup-state UI helpers

Observed logic includes:
- `syncAlexaCardVisibility()`
- `syncAlexaDomainUi()`

### Working interpretation
These helper functions appear to manage:
- whether Alexa setup fields should be visually emphasized or gated
- whether the domain-check button should be visible
- whether the current input state should change the domain-light appearance

This means the page is trying to guide operators through setup states rather than present a static form.

## Automatic verification behavior

Observed config-load behavior includes:
- when Alexa is enabled
- and a public domain exists
- and a track key is available
- the page auto-runs `checkAlexaDomain()` after load

### Why it matters
That means the page is not waiting passively for the operator to ask for verification.
It proactively checks the configured domain when conditions are right.

This is a useful quality-of-life behavior and an important part of how the setup flow actually feels.

## Explicit handoff to the dedicated Alexa page

The Alexa section in Config explicitly says:
- Alexa corrections and misheard review moved to the dedicated `alexa.html` page
- Config is the source of truth for enable/domain setup
- the Alexa page focuses on corrections and misheard review

### Why it matters
This is the strongest explicit evidence of the intended split.

A good wiki distinction is therefore:
- `config-alexa-setup.md` = provisioning/setup/control-plane view
- `alexa-interface.md` = correction/review/usage-guidance view

## Hidden compatibility elements

The Alexa block keeps several legacy IDs in hidden markup for script compatibility, including alias/review-related containers and JSON textarea fields.

### Working interpretation
This suggests the Alexa configuration surface evolved over time:
- earlier versions likely mixed setup and correction features more directly on Config
- newer structure has moved correction/review work into the dedicated Alexa page
- some hidden compatibility markup remains to avoid breaking existing script logic

That is historically interesting and practically relevant.

## Important API surface

The key explicit Alexa setup endpoint visible here is:
- `POST /config/alexa/check-domain`

The rest of the Alexa setup behavior appears to be persisted through the broader config save path rather than separate Alexa-only save endpoints.

## User/operator workflow model

A useful current setup workflow is:

### Initial provisioning workflow
1. enable Alexa support
2. enter public domain
3. enter route webhook URL if route-to-Alexa actions are needed
4. save config
5. verify domain reachability

### Verification workflow
1. review Alexa pill/hint state
2. inspect domain light and status text
3. run or re-run domain check
4. correct domain if it is missing or unreachable

### Ongoing maintenance workflow
1. keep enable/domain/webhook values current in Config
2. use the dedicated Alexa page for corrections and misheard cleanup

## Architectural interpretation

A good current interpretation is:
- this Config block is the Alexa provisioning layer
- it exposes both configuration fields and validation feedback
- it should be treated as the setup/control-plane half of the Alexa branch

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `alexa-interface.md`
- `integrations.md`

## Things still to verify

Future deeper verification should clarify:
- exactly how the backend uses `routeWebhookUrl` for route-to-Alexa actions
- what URL/path the domain checker probes behind the scenes
- whether additional Alexa provisioning requirements exist outside what Config currently exposes
- whether the hidden legacy Alexa DOM elements can eventually be removed or are still functionally required

## Current status

At the moment, this page gives the Alexa setup block in Config the right scope.

It is not the corrections page.
It is the provisioning page for:
- enablement
- public domain
- route webhook setup
- reachability verification
- setup-state feedback
