# Random vs Shuffle

The product now uses **Shuffle** as the only user-facing queue-randomization
operation.

- **Shuffle** (`mpd shuffle`): physically reorders queue entries. The current
  track and already-played prefix remain fixed when the controller queue
  shuffle path is used.
- **Random** (`mpd random on/off`): is a legacy MPD selection mode. New
  playback controls never enable it. Existing random state is disabled when
  deterministic playback or physical shuffle is requested.

## Project policy

- Web, mobile, Alexa, and Queue Wizard shuffle actions physically reorder the
  queue.
- Shuffle is an action, not an On/Off toggle, so its button is not shown as
  persistently active.
- `randomOn` may remain in diagnostic/status payloads for compatibility and
  observability; normal operation reports it as `false`.
- Legacy request aliases are accepted during migration but resolve to physical
  shuffle rather than enabling MPD random mode.
