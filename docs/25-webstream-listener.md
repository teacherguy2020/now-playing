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
- The browser listener does not change MPD playback, queue state, or volume.
- Controller surfaces also provide a speaker toggle beside the current-track
  rating and playlist controls. It enables/disables moOde's local ALSA output
  only; the HTTP webstream remains enabled.
- A browser user gesture is required by iPadOS/Safari before audio can start.
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
moOde player. Turning it off stops only that browser's listener. The speaker
toggle is independent of Listen on Device and can mute or restore the local
moOde output without starting a browser stream.

The non-editor 1280×400 kiosk display intentionally hides Listen on Device,
Route to Alexa, playlist-add, and local-output controls. Those are controller
actions and are not needed on the moOde-attached display.

If the button reports that the stream is unavailable, check the MPD HTTP
output first. For the optional proxy path, confirm that Caddy returns
X-Upstream: moode:8000 rather than the normal static-site upstream.

