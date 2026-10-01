# config notifications

## Purpose

This page documents the track-notification portion of `now-playing/config.html`
and the delivery paths used by the Now Playing monitor.

The monitor can deliver the same track-change event through:

- **Apple Push Notifications (APNs)** to paired Sonuvi iPhone/iPad devices
- **Pushover** for the web/operator workflow

APNs is the native-app path. Pushover remains available for the existing web
app and does not need to be installed on a Sonuvi device. Sonuvi no longer
generates a separate local track-change notification; the Settings switch
controls APNs permission and token registration.

## Important files

Primary files:

- `config.html`
- `src/config.mjs`
- `src/lib/apns.mjs`
- `src/lib/mobile-push-store.mjs`
- `src/routes/mobile.routes.mjs`
- `moode-nowplaying-api.mjs`

Related pages:

- `config-interface.md`
- `config-feature-breakdown.md`
- `integrations.md`
- `native-app.md`

## High-level role

The Config block is the operator control panel for the background track-change
monitor. It controls:

- whether the monitor runs
- polling and deduplication timing
- Alexa recency filtering
- optional Pushover credentials

Paired Sonuvi devices register their APNs device tokens through the authenticated
mobile API. APNs provider credentials are deliberately not entered in the web
Config form.

## Main visible controls

The current UI includes:

- `featurePushover` — the track-notification feature gate
- `notifyEnabled` — whether the background monitor runs
- `pollMs`
- `dedupeMs`
- `alexaMaxAgeMs`
- `pushoverToken`
- `pushoverUser`

The legacy element IDs retain `Pushover` in their names for compatibility with
existing saved settings and scripts. The visible card is now labeled
**Track Notifications (Apple Push + Pushover)**.

## 1. Feature enablement

The feature gate is considered enabled when the runtime config has an active
track monitor, Pushover credentials, or a configured APNs provider.

This gate controls the existing monitor form behavior. It does not disable APNs
registration in the Sonuvi app; a paired app can register its token whenever the
user enables native playback notifications.

## 2. Background monitor

`notifications.trackNotify.enabled` controls whether the server monitor runs.
The monitor reads this at process startup, so changing it requires the normal
API restart path before the new state is active.

The monitor:

1. observes the authoritative current track, including fresh Alexa playback
2. waits briefly for radio metadata enrichment when needed
3. deduplicates repeated track observations
4. sends APNs and/or Pushover independently

A failed delivery through one provider does not prevent the other provider from
being attempted. A successful delivery through either provider satisfies the
monitor's deduplication decision.

## 3. Polling, deduplication, and Alexa age

The visible tuning fields map to:

- `notifications.trackNotify.pollMs`
- `notifications.trackNotify.dedupeMs`
- `notifications.trackNotify.alexaMaxAgeMs`

`alexaMaxAgeMs` prevents an old Alexa event from overriding a newer
Home/moOde or native playback observation.

## 4. APNs provider configuration

APNs credentials are server-side secrets. Configure them through the service
environment or a protected environment file:

- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_PRIVATE_KEY_PATH` — preferred; points to the Apple `.p8` file
- `APNS_PRIVATE_KEY` — supported for deployments that inject the key directly
- `APNS_TOPIC` — defaults to `com.brianwis.sonuvi`
- `APNS_ENVIRONMENT` — `development`, `production`, or `auto`
- `MOBILE_PUSH_TOKENS_PATH` — optional protected token-registry path

The default token registry is:

`var/mobile-push-tokens.json`

The registry contains only APNs device tokens, device IDs, environment, topic,
and timestamps. It is written atomically with restrictive file permissions.
Private Apple credentials are never returned by the public runtime-config API.

The app's Debug entitlement/environment is development. A production-signed
distribution build must use the production APNs entitlement/environment.

## 5. Mobile registration API

After authenticated mobile session enrollment, Sonuvi registers its APNs token:

- `POST /v1/mobile/push-tokens`
- `DELETE /v1/mobile/push-tokens`

The server scopes registration to the bearer session's device ID and ignores a
caller-supplied device ID. Re-registering the same device/topic replaces its
old token. Invalid or rejected tokens are removed after APNs reports them as
unregistered.

## 6. Notification payload and artwork

The payload contains a normal alert with title, artist subtitle, and album/body
metadata plus a stable track identifier. For artwork, the server includes
`media-url` and marks the notification mutable. The Sonuvi notification service
extension downloads that image and attaches it before presentation.

Artwork delivery works best when the configured public artwork URL is reachable
from Apple's notification service over HTTPS. If artwork cannot be fetched, the
text notification still arrives.

Home/moOde radio notifications retain the station-logo preference used by the
server monitor and avoid playing a notification sound. Direct native radio
playback is different: the initial radio event is accepted for shared history,
then APNs waits for `/v1/mobile/radio/metadata`. A verified iTunes/Apple Music
match sends the matched external album artwork, song metadata, and safe Apple
Music URL; a miss falls back to a public station-art route. The Sonuvi UI still
receives its bearer-protected artwork URL. Music notifications use the normal
default sound.

## 7. Pushover delivery

Pushover fields remain optional and are labeled as web/operator delivery in the
Config page. Existing Pushover behavior, credentials, and deduplication remain
supported for users who want notifications outside the native app.

## User/operator workflow

### Native Sonuvi setup

1. Configure the APNs provider environment on the server.
2. Enable native playback notifications in Sonuvi.
3. Allow iOS notification permission.
4. Keep the app paired/enrolled; it registers or refreshes its APNs token.
5. Enable the background monitor in Config.

### Web/operator setup

1. Enter the Pushover token and user key if desired.
2. Enable the track-notification feature.
3. Ensure the background monitor is running.
4. Save and restart the API when prompted.

## Security boundaries

- Apple `.p8` material stays in protected server configuration.
- APNs tokens are bearer-like device identifiers and are stored only in the
  server-side registry.
- Mobile token registration is bearer-session scoped.
- The public runtime-config response exposes APNs configured/topic/environment
  status, never the key ID, team ID, private key, or token registry contents.

## Current status

The notification subsystem is dual-delivery:

- APNs for native Sonuvi devices
- Pushover for the existing web/operator workflow

The providers share monitor selection, radio enrichment, and deduplication, but
each delivery attempt is isolated so one provider can be unavailable without
blocking the other. Native radio enrichment also uses the APNs provider
directly, after the verified metadata response is available, so the native
notification does not race the station's initial ICY title.

Last reviewed: 2026-10-01 13:15 America/Chicago
