# Mabel VIP integration

## Purpose

This document defines the boundary between the Now Playing API and Mabel, the
Shyvers Multiphone operator. It records the current VIP music behavior and the
planned path for room automation such as lighting and Harmony Hub activities.

## Current topology

```text
iPad voice/text handset
        ↓
Mac Mabel bridge
        ↓ bounded, authenticated API calls
Now Playing :3101
        ↓
MPD/moOde and other approved integrations
```

The Mac bridge keeps the permanent credentials and conversation state. The
iPad handset receives only a short-lived Realtime credential for voice mode or
ordinary text responses for text mode. The model does not receive unrestricted
HTTP, shell, MPD, or device access.

## Current VIP music actions

Mabel enters VIP/off-script mode when the caller says **“off script”** or when
the iPad handset starts a VIP session. The bridge currently exposes these
bounded actions:

| Capability | API family | Mabel-specific behavior |
| --- | --- | --- |
| Album | `/mpd/play-album` | VIP requests exclude one-star tracks. |
| Artist | `/mpd/play-artist` | Shuffled, capped at 50 tracks, excluding one-star tracks. |
| Playlist | `/mpd/play-playlist` | VIP requests exclude one-star tracks. |
| Multi-artist mix | `/queue/mix` | Physically shuffled with MPD; Random mode remains off; capped and filtered. |
| Current playback | `/now-playing` | Read-only status lookup. |

The bridge starts the resulting queue through a plain MPD queue-start action,
not the moOde `play-file` helper, which can add/select an unintended file.
Successful music-load actions are final VIP transactions: Mabel confirms,
says goodbye, and ends the call.

The one-star rule is intentional: Brian uses a one-star rating as an omission
tool. Ordinary Alexa behavior is unchanged unless it explicitly supplies its
own filtering options.

## Proposed VIP action registry

Lighting, Harmony Hub, and other room controls are **planned**, not currently
implemented in this repository. They should be added behind a Mac-side or
dedicated VIP action registry with an interface like:

```text
action name → validate arguments → execute adapter → return result
```

Example future actions:

```text
activate_lighting_scene("Clem's Place")
start_harmony_activity("Vinyl Listening")
set_room_ambience("VIP")
```

Each action should define:

- an allow-listed name and argument schema;
- a timeout and idempotency behavior;
- a concise success/failure result for Mabel;
- whether it changes persistent state;
- cleanup or restore behavior on hang-up and timeout;
- local credential handling that never reaches the iPad or model.

Named scenes are preferable to exposing arbitrary device commands. For example,
`activate_lighting_scene("Clem's Place")` is safer and easier to narrate than
letting Mabel manipulate individual bulbs or raw Harmony Hub endpoints.

## Security and operational boundary

- Keep VIP start and handset services on the trusted LAN; do not port-forward
  them to the public internet.
- Keep device credentials on the Mac or integration host.
- Require explicit VIP mode before room-control actions are available.
- Log action name, target, result, and duration without logging credentials.
- Make disruptive actions—stopping playback, changing displays, or restoring a
  room scene—explicit and separately validated.
- Keep Now Playing's MPD and queue authority separate from room-automation
  adapters.

## Related documentation

- `ARCHITECTURE.md` — system boundaries and API ownership
- `docs/03-alexa.md` — Alexa capabilities and “play here” behavior
- Multiphone `wiki/mabel-software.md` — Mabel session and VIP behavior
