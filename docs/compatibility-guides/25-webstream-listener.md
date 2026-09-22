# Listen on Device

This stable numbered path remains for existing bookmarks. The canonical
documentation is [Listen on Device](../wiki-source/listen-on-device.md).

## Quick use

1. Enable moOde's MPD **HTTP Server** output on port `8000`.
2. Open a tablet, phone, or computer controller.
3. Tap **Listen on Device** from a user gesture.
4. Use controller Settings → **Apply** to enable optional local ALSA
   mute/restore or MPD stop-on-stop behavior.

The listener uses a persistent direct `<audio>` element. The immediate
gesture-sensitive `audio.play()` call must remain first; MPD resume, metadata,
ALSA, and stop control happen afterward. The browser stream does not replace
MPD playback or disable moOde's HTTP Server output.

## Optional proxy

The LAN Caddy configuration may proxy `/stream*` to moOde port `8000` before
the static-site handler. Verify that the response includes:

```text
X-Upstream: moode:8000
```

For the complete setup, Safari/iPadOS constraints, API bridge, Caddy example,
speaker icon behavior, and troubleshooting, read the canonical page:

[docs/wiki-source/listen-on-device.md](../wiki-source/listen-on-device.md)
