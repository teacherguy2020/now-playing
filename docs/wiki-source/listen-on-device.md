---
title: listen on device
page_type: child
topics:
  - playback
  - controller
  - integration
confidence: high
---

# Listen on Device

**Listen on Device** plays moOde's current output in the browser running the
controller. It is useful when that device is connected to headphones or
AirPods. The browser listener is not the moOde player; it is a second local
listener of moOde's HTTP stream.

## User behavior

- Tap **Listen on Device** on a tablet, phone, or computer controller.
- The page starts one persistent direct `<audio>` element from moOde's MPD HTTP
  output.
- A gesture is required by iPadOS/Safari.
- After the immediate `audio.play()` call, the controller requests MPD `play`
  so a paused moOde stream resumes.
- Stopping the listener stops that browser's audio. Optional Settings can also
  restore ALSA and send MPD stop.

Controller Settings provides two device-local options:

- **Mute moOde local ALSA output while playing on this device** disables the
  ALSA output after the stream starts, leaves the HTTP Server output enabled,
  and restores ALSA when listening stops. The speaker icon follows the output
  state.
- **Stop moOde playback when stopping Listen on Device** sends authenticated
  MPD stop when the browser listener stops.

Both options are off by default, stored in
`nowplaying.clientSettings.v1`, and require **Apply** in the Settings pane.

## Startup invariant

Do not put metadata lookup, artwork fetching, MPD control, mute control, or
other asynchronous work before the gesture-sensitive `audio.play()` call.
The direct stream and persistent audio element are deliberately protected from
service-worker or Web Audio rewrites.

## moOde setup

Enable moOde's **HTTP Server** MPD output:

- port `8000`
- encoder `lame`
- bitrate `320`
- tags enabled
- always on enabled

Verify from the Now Playing host:

```sh
curl --max-time 3 -D - -o /dev/null http://<now-playing-host>/stream
```

The request continuing until the client disconnects is normal; a curl timeout
after audio has started is not by itself a failure.

## Optional Caddy proxy

The LAN HTTP/HTTPS sites can route `/stream*` before the static-site handler:

```caddy
@moode_stream {
    path /stream*
}
handle @moode_stream {
    reverse_proxy <moode-host>:8000 {
        header_down X-Upstream "moode:8000"
    }
}
```

Validate and reload Caddy after host-level changes. Confirm the response has
`X-Upstream: moode:8000` rather than the normal static-site upstream.

## API bridge

The shared `scripts/web-stream.js` helper uses authenticated control requests:

- `POST /config/diagnostics/playback {"action":"play"}` after local audio
  startup;
- optional `POST /config/diagnostics/playback {"action":"stop"}` on stop; and
- `GET`/`POST /mpd/local-output` for optional ALSA mute/restore.

The speaker icon reflects the shared MPD output-0 state and is refreshed
periodically, so it also shows the automatic mute applied while Alexa Mode is
active. Listen on Device's optional browser-side ALSA restore cannot override
that Alexa Mode mute; output 0 is re-enabled when Alexa Mode is turned off.

The HTTP Server output remains enabled for the browser stream. The non-editor
1280×400 kiosk display intentionally hides these controller actions.

## Related pages

- [using-now-playing.md](using-now-playing.md)
- [tablet-interface.md](tablet-interface.md)
- [api-playback-and-queue-endpoints.md](api-playback-and-queue-endpoints.md)
- [playback-mode-troubleshooting.md](playback-mode-troubleshooting.md)

*Last reviewed: 2026-09-22 America/Chicago*
