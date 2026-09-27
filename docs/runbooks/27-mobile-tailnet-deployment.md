---
title: Mobile Tailnet Deployment
page_type: runbook
topics:
  - ios
  - mobile
  - tailscale
  - deployment
  - security
confidence: high
---

# Mobile Tailnet Deployment

This runbook describes the network boundary for native iPhone/iPad playback
from the Now Playing mobile API. It does not expose the home music share,
MPD, or moOde directly to a mobile device.

## Intended topology

```text
iPhone/iPad -- Tailscale + HTTPS --> Now Playing host -- existing LAN mount --> moOde library
                                      |
                                      +-- local mobile API on TCP 3101
                                      +-- Tailscale Serve on tailnet TCP 443
```

The Now Playing host is the only server that needs to be reachable by the
native app. It already resolves opaque track IDs and reads the local mount of
the moOde library. The moOde player host does not need Tailscale for this
path.

## Required server configuration

Keep these values in the host’s private environment, never in the iOS app or
source control:

```text
MOBILE_API_ENABLED=1
MOBILE_API_SECRET=<persistent random signing secret>
MOBILE_TRACK_ID_SECRET=<persistent random ID secret>
MOBILE_PUBLIC_BASE_URL=https://<tailnet-now-playing-name>
MOBILE_TRANSCODE_TRACKS=1
```

The base URL must be the HTTPS MagicDNS hostname supplied by Tailscale Serve;
it must not contain a port, query string, fragment, credential, or raw LAN
filesystem address.

## Tailscale Serve

On the Now Playing host, after the node has been authenticated into the
intended tailnet:

```sh
sudo tailscale up --hostname=nowplaying-pi
sudo tailscale serve --bg 3101
sudo tailscale serve status
```

The expected Serve mapping is:

```text
https://<tailnet-now-playing-name>/
|-- proxy http://127.0.0.1:3101
```

Serve must remain **tailnet only**. Do not enable `tailscale funnel` for this
service. Tailscale manages the trusted HTTPS certificate for the MagicDNS
hostname; no certificate or private key belongs in this repository.

After changing the private environment, restart the Now Playing service using
the normal deployment procedure and verify:

```sh
systemctl is-active tailscaled
systemctl is-active now-playing.service
tailscale status
tailscale serve status
```

## Client requirements

The iPhone/iPad must:

1. Have the Tailscale app installed and connected to the same tailnet.
2. Use the HTTPS base URL supplied in the pairing QR.
3. Complete Now Playing’s pairing approval flow.
4. Store the resulting mobile bearer session in iOS Keychain.

Tailscale connectivity does not replace Now Playing authentication. The app
still uses opaque catalog IDs, bearer sessions, and short-lived media tickets.

## Re-pairing after the transport change

If a client was paired while `MOBILE_PUBLIC_BASE_URL` pointed to the home-LAN
hostname, it retains that old base URL. Generate a new QR from Config or
Controller → Settings and pair the device again. The new QR should contain
the HTTPS Tailscale hostname.

With Tailscale connected, verify the transport before opening the native app:

```text
https://<tailnet-now-playing-name>/config/controller-profile
```

The endpoint should return the normal controller-profile JSON response. It is
an appropriate smoke test because it verifies tailnet routing, certificate
trust, Serve, and the local API proxy without revealing a bearer token.

## Security boundaries

- Never place `MOBILE_API_SECRET`, `MOBILE_TRACK_ID_SECRET`, Track Key,
  enrollment codes, bearer tokens, media tickets, or private keys in a QR
  payload or repository.
- Do not expose SMB/CIFS, MPD, moOde, or the library filesystem to Tailscale
  clients merely to support mobile playback.
- Do not enable Funnel or otherwise publish the mobile API to the Internet.
- Tailnet membership is not sufficient authorization; enforce the mobile
  bearer token and short-lived media ticket at the API.
- A Tailscale node restart or server restart may invalidate in-memory pairing
  challenges; generate a new QR if pairing is interrupted.

## Troubleshooting

- **Safari cannot open the hostname:** confirm Tailscale is connected on the
  device and that the device is approved in the tailnet.
- **The native app still uses the LAN address:** discard the old pairing and
  generate a fresh QR after confirming `MOBILE_PUBLIC_BASE_URL`.
- **Pairing waits indefinitely:** check that the display and native app use
  the same current QR, and that the server’s mobile API and Track Key are
  configured.
- **Media authorization succeeds but audio fails:** inspect the Now Playing
  host’s local library mount and media-ticket logs; do not work around the
  problem by exposing the moOde share.

*Last reviewed: 2026-09-27 America/Chicago*
