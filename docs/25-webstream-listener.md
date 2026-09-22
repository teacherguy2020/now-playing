# Webstream listener

The controller can optionally play moOde's current output in the browser running
the controller. This is useful when the browser device is connected to
headphones or AirPods.

## How it works

- The controller's **🎧 Listen on Device** button starts a browser-local
  <audio> element.
- For iOS Safari compatibility, the current controller assigns the direct
  moOde URL http://10.0.0.254:8000 to the audio element. The moOde host is
  installation-specific and should be changed for another installation.
- A same-origin /stream Caddy proxy is also supported for testing and future
  configuration-driven use; it proxies to moOde's MPD HTTP output on port
  8000.
- The browser listener does not change queue state or volume by default. After
  the browser's gesture-sensitive `audio.play()` call starts, the controller
  also requests MPD `play` so a paused moOde stream resumes for Listen on
  Device.
- Controller surfaces also provide a speaker toggle beside the current-track
  rating and playlist controls. It enables/disables moOde's local ALSA output
  only; the HTTP webstream remains enabled.
- Controller Settings provides two optional, device-local webstream behaviors:
  - **Mute moOde local ALSA output while playing on this device** disables the
    ALSA output after the webstream starts and restores it when Listen on
    Device stops. The HTTP Server output remains enabled, and the controller's
    speaker icon follows the resulting local-output state.
  - **Stop moOde playback when stopping Listen on Device** sends the
    authenticated playback `stop` action (`mpc stop`) when the browser listener
    stops.
- These options are stored in the versioned
  `nowplaying.clientSettings.v1` browser/install-local preferences and are off
  by default. The Settings pane requires **Apply** before changed checkbox
  values are saved.
- A browser user gesture is required by iPadOS/Safari before audio can start.
- No metadata, output-control, or MPD-control request is awaited before the
  initial `audio.play()` call.
- MP3 320 is the recommended format. It is reliably playable by Safari and is
  appropriate for AirPods.

## moOde setup

In MPD outputs, enable moOde's **HTTP Server** output:

- Port: 8000
- Encoder: lame
- Bitrate: 320
- Tags: enabled
- Always on: enabled

Verify from the Now-Playing host:

~~~sh
curl --max-time 3 -D - -o /dev/null http://10.0.0.4/stream
~~~

Expected headers include:

~~~text
HTTP/1.1 200 OK
Content-Type: audio/mpeg
X-Upstream: moode:8000
~~~

The request continues until the client disconnects; a curl timeout after
receiving audio is normal.

## Caddy setup

The LAN HTTP and HTTPS sites must route /stream* before the general
Now-Playing static-site handler:

~~~caddy
@moode_stream {
    path /stream*
}
handle @moode_stream {
    reverse_proxy IPOFYOURMOODEBOX:8000 {
        header_down X-Upstream "moode:8000"
    }
}
~~~

Validate and reload Caddy after changing its host-level configuration:

~~~sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
~~~

## UI behavior

The controls are available on the tablet, phone, and computer controller
surfaces. **Listen on Device** means the device running that browser—not the
moOde player. Starting it resumes MPD after the local audio element has been
started. Turning it off stops that browser's listener; it also restores ALSA
and/or stops MPD when the corresponding Settings options are enabled. The
speaker toggle remains independently available for manual local-output
control.

The non-editor 1280×400 kiosk display intentionally hides Listen on Device,
Start on Alexa/Stop on Alexa, playlist-add, and local-output controls. Those are controller
actions and are not needed on the moOde-attached display.

If the button reports that the stream is unavailable, check the MPD HTTP
output first. For the optional proxy path, confirm that Caddy returns
X-Upstream: moode:8000 rather than the normal static-site upstream.

