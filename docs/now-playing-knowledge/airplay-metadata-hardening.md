---
title: airplay-metadata-hardening
page_type: support
topics:
  - airplay
  - moode
  - ops
  - overrides
confidence: high
---

# airplay metadata hardening

## Purpose

This page documents the moOde-side AirPlay metadata hardening work used in Brian's `now-playing` environment.

It exists because this behavior is not just a generic project feature.
It depends on host-side override logic and should be preserved as an operational recipe, not only as a passing local note.

Use this page when the question is:
- why is AirPlay metadata handling consuming too much CPU?
- what hardening exists for `shairport-sync-metadata-reader` behavior?
- what files/services/timers implement the current mitigation?
- how should the current override be verified or restored?

## Why this page matters

The key lesson in this branch is:
- AirPlay metadata behavior can fail as a host-level operational problem, not just an app-code problem

A browser page or route can look fine while the actual metadata reader on the moOde host is consuming excessive CPU and degrading responsiveness.

That means future debugging must keep separate:
- app-host code behavior
- moOde host override behavior
- live service/timer/watchdog state on the moOde machine

## Problem observed

The observed issue was:
- `shairport-sync-metadata-reader` could peg CPU
- moOde became sluggish or less responsive
- playback control and general host responsiveness could be affected

This is important because the failure mode is not only "metadata is a little wrong".
The failure mode can be broader host degradation.

## Hardening changes applied

Current hardening consists of two major changes.

## 1. Hardened metadata reader wrapper

`airplay-json.service` was changed to use:
- `/var/www/daemon/aplmeta-reader.sh`

Instead of relying on:
- a raw `cat | reader | grep | writer` style pipeline

Practical meaning:
- the metadata-reading path was given a more controlled wrapper layer
- this should be treated as part of the current live-environment truth

## 2. CPU watchdog for metadata-reader runaway behavior

Additional watchdog material was added:
- `/usr/local/bin/airplay-json-watchdog.sh`
- `/etc/systemd/system/airplay-json-watchdog.service`
- `/etc/systemd/system/airplay-json-watchdog.timer`

Practical meaning:
- the moOde host now has a timer-driven supervisory path for AirPlay metadata-reader health

## Watchdog behavior

Current expected watchdog behavior:
- timer interval is every 30 seconds
- watchdog checks CPU usage of `shairport-sync-metadata-reader`
- if CPU stays too high across multiple intervals, watchdog restarts `airplay-json.service`

Documented threshold behavior from source docs:
- sustained high CPU above roughly 40% across multiple intervals triggers remediation behavior

Why this matters:
- this is not just passive monitoring
- the watchdog is part of the actual mitigation strategy

## Verification checks

Useful live checks include:

```bash
systemctl is-active airplay-json.service
systemctl is-active airplay-json-watchdog.timer
journalctl -u airplay-json-watchdog.service -n 20 --no-pager
tail -n 50 /tmp/airplay-json-watchdog.log
```

What these checks tell you:
- whether the primary service is active
- whether the watchdog timer is active
- whether the watchdog has recently intervened
- whether a local log trail exists for diagnosis

## Source-of-truth and mirrored repo material

The live override files are mirrored in the repo at:
- `ops/moode-overrides/`

This repo copy should be treated as:
- audit material
- recovery source
- restore/deploy reference

But an important rule still applies:
- mirrored repo files are not the same thing as confirmed live host state

Always distinguish:
- what the repo says should be applied
- what the moOde host is actually running now

## App-host vs moOde-host ownership

This branch belongs primarily to the moOde-host override layer.

It should not be mentally collapsed into normal app-host deploy work.

Useful split:
- **app-host layer**
  - routes, UI, now-playing API behavior
- **moOde host override layer**
  - service wrapper behavior
  - watchdog timer behavior
  - host-level AirPlay metadata resilience

Why this matters:
- if the symptom is runaway CPU or moOde sluggishness, the first question is often not "which frontend or route changed?"
- the first question may instead be whether the moOde-side watchdog/reader override is present and functioning

## When to suspect this branch first

Suspect this branch early when:
- AirPlay metadata behavior coincides with high CPU
- moOde feels sluggish specifically during AirPlay sessions
- metadata reader processes appear unhealthy
- the live host seems inconsistent with the mirrored override expectations

This is a good example of a problem that may look like a playback or metadata issue but is really a host-service-health issue.

## Recovery interpretation

A useful practical interpretation is:
- this hardening exists to keep AirPlay metadata support from destabilizing the host
- if it disappears, drifts, or stops running, AirPlay regressions may appear even when the app-host code is unchanged

That is why this branch deserves a durable operational page.

## Best companion pages

- `local-environment.md`
- `deployment-and-ops.md`
- `playback-mode-troubleshooting.md`
- `integrations.md`
- `gotchas-and-lessons.md`

## Current status

At the moment, this page should be treated as the operational reference for the moOde-side AirPlay metadata hardening override.

The key truths it preserves are:
- the problem was a host-health issue, not only a metadata-display issue
- the fix includes both a hardened wrapper and a watchdog timer path
- verification should happen on the moOde host
- mirrored repo material is useful, but live host state is the real source of current behavior
