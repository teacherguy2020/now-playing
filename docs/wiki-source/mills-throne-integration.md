---
title: Mills Throne integration
page_type: integration
topics:
  - integration
  - mills-throne
  - jukebox
  - as5600
  - shelly
  - mpd
confidence: medium
---

# Mills Throne integration

## Purpose and authority

This page documents the integration between the 1939 Mills Throne of Music jukebox and Now-Playing/moOde. The original Mills mechanism remains completely authoritative: software observes the machine and makes the modern display/playback system follow what the mechanism physically does.

Source basis: Brian's Mills Throne integration-flow specification and bench-test results, 2026-09-15. The physical selector shaft has not yet been mounted, measured, or calibrated; all angles, tolerances, timing, and final state rules remain experimental.

The project repository is `/projects/mills-throne` (Mac workspace path: `mills-throne/`).

## Ownership boundaries

```text
Mills mechanism       selects, queues, loads, plays, and returns records
AS5600 + Pico 2 W     observes shaft angle, movement, and settled positions
Shelly 1PM Gen4       switches/measures jukebox power; confirms activity
Now-Playing           owns MPD, Harmony/Denon, metadata, and display behavior
```

The Pico must not select records, reproduce the Mills queue, or control the mechanism. Harmony/Denon orchestration belongs in Now-Playing, not in Pico firmware.

## Physical selector behavior

The numbered selector positions are 1–20 and appear evenly spaced around most of the wheel. There is a larger gap between 20 and 1: that gap is the Mills REST position, not a numbered zero position.

A typical session is:

```text
REST
→ mechanism moves to the #20/top-of-stack end
→ stack descends through the mechanically selected positions
→ first depressed selector encountered is selected
→ wheel stops at the selected number
→ record plays and later returns to the stack
→ stack rises toward #20
→ another search occurs if a selection/credit remains
→ final return to REST when the session is finished
```

This is not a FIFO queue. Physical scan order determines priority. A later selection can be played before earlier selections if its physical position is encountered first.

## AS5600 sensing

The bench-tested hardware is a Pico 2 W and AS5600 breakout. A diametrically magnetized magnet is attached to the exposed end of the selector shaft; the stationary AS5600 will be mounted opposite it on an adjustable bracket.

Current wiring:

```text
AS5600 VCC → Pico 3V3 OUT
AS5600 GND → Pico GND
AS5600 SDA → Pico GP4
AS5600 SCL → Pico GP5
```

The sensor is read at I²C address `0x36`. The existing Pico diagnostic program reports raw angle, degrees, movement, stable time, magnet status, AGC, and magnitude. It should retain that diagnostic capability during calibration.

Calibration must record actual installed raw values for:

```text
REST, 1, 2, 3, ... 20
```

Do not assume theoretical equal spacing. The installed bracket must be rigid and preserve magnet centering and air gap; the adjustment should occur before final calibration.

### REST and slot 20

Slot 20 is distinguishable from REST only through sequence context. A stable angle at 20 while returning/resetting means home; a stable angle at 20 after the search phase has begun may mean physical slot 20. The Pico must track movement/phase history rather than classify angle 20 in isolation.

If the mechanism passes through or rests at 20 more than once during reset/search, AS5600 direction and timing must be observed experimentally. Shelly activity and an optional tray switch can provide independent context.

## Intended session flow

When the selector leaves REST and a genuine search/play cycle is established, the Pico reports `MILLS ACTIVE` to Now-Playing. This begins one Mills session that remains active across multiple records.

During a search, transient angles are ignored. Once the wheel stops inside a calibrated position window for the settle interval, the Pico will report a physical slot, for example:

```json
{"slot": 7}
```

Now-Playing accepts that report at the authenticated endpoint:

```text
POST /integrations/mills/selection
X-Track-Key: <track key>
Content-Type: application/json

{"slot": 7}
```

On Mills start, the API snapshots the MPD queue/current track/position/state,
switches the Denon to Phono, and pauses MPD if it was playing. It waits for the
first settled physical slot report; it does not launch a default playlist entry.
The API maps each slot to the matching entry in the exact `Mills Playlist`
playlist, briefly reads that file's MPD tags, and removes the temporary MPD
entry immediately. The digital file is never played or left in the queue.

While Mills is active, Now-Playing exposes the selected record's
artist/title/album/artwork to every display in a display-only `mills` mode. The
normal layout remains unchanged, but the progress bar and time are hidden. The
moOde hardware LED uses a slow-pulsing white indication; it remains visible
even when the display is DPMS-blanked. Duplicate reports for the same slot in
one session are ignored. The Denon remains on Phono, so the physical Mills is
the only audible source.

At a confirmed return to REST, the API switches the Denon to Aux 1 first,
defensively removes any stale Mills entries, and restores the pre-Mills MPD
queue/current track/position/state. A previously playing session resumes,
paused remains paused, and stopped remains stopped. Stop is idempotent and
retryable if the Denon or MPD transition fails.

## Shelly role

The Shelly 1PM Gen4 is useful as:

- jukebox master power control
- power/current/voltage telemetry
- independent activity and idle confirmation
- a diagnostic timeline for correlating mechanism movement and AS5600 readings

Observed preliminary readings:

```text
lights off, idle       ~7 W
lights on, idle        ~53 W
record playing         ~70 W
record stack/motor     >200 W
```

For the current commissioning test, the Shelly thresholds are temporarily
`>55 W` for activity and `<50 W` for idle, with a 5-second idle debounce in
the Pico. These are not production values; hysteresis, lighting state, and
multi-record behavior must be measured over complete cycles.

The Shelly can webhook the Pico at `http://10.0.0.7/integrations/mills/stack-moving` and reset it at `/integrations/mills/idle`. The Pico treats repeated active webhooks idempotently. Shelly events should remain observations; they must not contain Harmony, MPD, or Mills-selection logic.

## Pico software and OTA

The Pico is currently at `10.0.0.7`. The project contains a local OTA endpoint at `POST /ota`, authenticated with the ignored `OTA_TOKEN` in `secrets.py`.

From the Mills project directory, deploy the current `micropicoMills/main.py` with:

```bash
./deploy-pico.sh
```

The updater stages `main.new.py`, validates syntax, preserves `main.backup.py`, installs the new program, reboots, and verifies `/status`. This is important once the sensor is permanently mounted because software changes should not require disturbing calibration alignment.

## Immediate next steps

1. Mount the sensor and magnet with adjustable gap/alignment.
2. Verify magnet detection across complete mechanical travel.
3. Record actual raw values for REST and positions 1–20.
4. Capture movement direction, repeated passes through 20, and stable durations.
5. Log Shelly power alongside AS5600 data for single- and multiple-record sessions.
6. Decide whether AS5600 alone or AS5600 plus Shelly confirms session start/end.
7. Implement calibrated Pico-side slot detection and send slots 1–20 to the
   Now-Playing selection endpoint.

<!-- Last updated: 2026-09-18 -->
