# config notifications

## Purpose

This page documents the track-notification portion of `now-playing/config.html`.

It exists because the Config page contains a specific notification feature cluster built around:
- track notifications
- a background monitor
- Pushover credentials
- timing/deduplication tuning
- Alexa-age-related filtering

This is the current notifications-focused config surface visible in `config.html`.

## Why this page matters

Notifications are not represented here as a broad generic provider framework.
Instead, the current Config surface is a focused, operational notification module centered on track-change monitoring and Pushover delivery.

That matters because it combines:
- feature enablement
- credential setup
- background monitoring behavior
- rate/deduplication tuning
- cross-feature interaction with Alexa recency

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- `integrations.md`
- future messaging/notification pages if they are added later

## High-level role

A good current interpretation is:
- this Config block is the track-notification control panel
- it is currently Pushover-oriented
- it governs both whether notifications are available and how the track-monitor loop behaves

## Main visible controls

Observed UI elements include:
- `featurePushover`
- `notifyEnabled`
- `pollMs`
- `dedupeMs`
- `alexaMaxAgeMs`
- `pushoverToken`
- `pushoverUser`

These controls define the current notification feature cluster.

## 1. Feature enablement

Observed behavior includes:
- Config computes `hasPushover` based on whether any of the following exist:
  - Pushover token
  - Pushover user key
  - track-notify enabled state
- `featurePushover` is checked accordingly when config loads

### Why it matters
This is slightly richer than a simple stored boolean.
The UI treats actual notification configuration/state as evidence that the feature is effectively enabled.

## 2. Background monitor running

Observed UI includes:
- `notifyEnabled`
- label: `Background monitor running`

Observed save behavior maps this to:
- `notifications.trackNotify.enabled`

### Why it matters
This is an important distinction:
- `featurePushover` = notification feature/provider enablement layer
- `notifyEnabled` = whether the actual background monitoring loop is running

That means the notifications cluster already distinguishes configuration from active monitoring behavior.

## 3. Polling and deduplication tuning

Observed fields include:
- `pollMs`
- `dedupeMs`

Observed load defaults include:
- `pollMs` default `3000`
- `dedupeMs` default `15000`

Observed save behavior maps these to:
- `notifications.trackNotify.pollMs`
- `notifications.trackNotify.dedupeMs`

### Why it matters
This shows the notification system has a real polling/deduplication model, not just fire-and-forget pushes.

These are operator-facing tuning knobs for balancing:
- responsiveness
- repeat suppression
- noisy/duplicate notifications

## 4. Alexa max age ms

Observed field includes:
- `alexaMaxAgeMs`

Observed load default includes:
- `21600000`

Observed save behavior maps this to:
- `notifications.trackNotify.alexaMaxAgeMs`

### Why it matters
This is one of the more interesting fields in the module.
It indicates that track notifications are not isolated from Alexa-related behavior.

A good current interpretation is:
- the notification monitor includes logic that considers how old Alexa-related activity/data is allowed to be
- Alexa recency is therefore part of notification filtering or eligibility logic

That is a meaningful cross-feature dependency.

## 5. Pushover credentials

Observed fields include:
- `pushoverToken`
- `pushoverUser`

Observed save behavior maps these to:
- `notifications.pushover.token`
- `notifications.pushover.userKey`

### Secret handling
Observed local secret caching includes:
- `nowplaying.secret.pushoverToken`
- `nowplaying.secret.pushoverUser`

### Why it matters
This mirrors the pattern used for other secret-like config values.
The page tries to preserve operator convenience while keeping credentials tied to the notification feature cluster.

## Visibility / gating behavior

Observed code includes `syncPushoverCardVisibility()`.

Observed behavior includes:
- drive card state from `featurePushover`
- disable `notifyEnabled` when notifications are off
- auto-check `notifyEnabled` when notifications are enabled and the monitor was previously off
- backfill token/user from local secret cache when appropriate

### Working interpretation
A good current interpretation is:
- turning on the feature is treated as intent to actually run the background monitor
- the UI tries to reduce half-configured states by nudging the monitor into the “on” state when notifications are enabled

That is a subtle but important product behavior.

## Save/load behavior summary

Observed config-load behavior includes:
- derive feature state from existing config values
- populate monitor/timing values from `notifications.trackNotify`
- populate credentials from `notifications.pushover` or local secret cache

Observed config-save behavior includes:
- `notifications.trackNotify.enabled`
- `notifications.trackNotify.pollMs`
- `notifications.trackNotify.dedupeMs`
- `notifications.trackNotify.alexaMaxAgeMs`
- `notifications.pushover.token`
- `notifications.pushover.userKey`

## Important distinction: current scope is Pushover

Based on current repo-visible evidence, this Config module is specifically a **Pushover-backed** notification configuration surface.

That means the wiki should be careful not to overstate it as:
- a generic push provider abstraction
- a multi-provider notifications matrix

At least in the current visible Config implementation, the notification provider explicitly exposed here is Pushover.

## User/operator workflow model

A useful current workflow model is:

### Initial setup workflow
1. enable notifications
2. enter Pushover token and user key
3. ensure background monitor is running
4. save config

### Tuning workflow
1. adjust poll interval
2. adjust dedupe interval
3. adjust Alexa max age threshold
4. save config
5. observe whether notifications are too noisy, too sparse, or too stale

### Credential maintenance workflow
1. update token/user key as needed
2. save config
3. rely on cached secret convenience where applicable

## Architectural interpretation

A good current interpretation is:
- this module is a background track-notify subsystem with Pushover delivery
- it is not just a credential form
- it exposes important runtime behavior knobs that shape how often and under what conditions notifications are generated

## Relationship to other pages

This page should stay linked with:
- `config-interface.md`
- `config-feature-breakdown.md`
- `integrations.md`
- future notification/messaging pages if they appear

## Things still to verify

Future deeper verification should clarify:
- what exact backend process or route family consumes `notifications.trackNotify.*`
- how `alexaMaxAgeMs` is applied in notification filtering logic
- whether any notification testing or send-now action exists elsewhere in the repo
- whether additional notification providers exist outside the visible Config page

## Current status

At the moment, this page gives the notifications block in Config an honest scope:
- Pushover-backed
- monitor-driven
- timing-tunable
- cross-wired with Alexa recency

That is already enough to treat it as a meaningful subsystem rather than a tiny optional settings card.
