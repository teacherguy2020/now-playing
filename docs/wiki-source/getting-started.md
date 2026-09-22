---
title: getting started
page_type: hub
topics:
  - ops
  - runtime
  - config
confidence: high
---

# Getting Started

This is the shortest path for a new Now Playing installation. Now Playing is
a moOde-focused enhancement stack: it runs a web UI and API on an app host and
uses MPD, moOde, SSH, and HTTP integrations to provide richer playback,
metadata, queue, display, and controller experiences.

## Recommended topology

Run Now Playing on a separate Linux/Raspberry Pi host from the moOde player.
The split keeps UI/API work independent from the audio host while allowing the
API host to reach moOde over the LAN.

| Role | Typical service | Default port |
| --- | --- | --- |
| Now Playing UI | static HTML/CSS/JavaScript | `8101` |
| Now Playing API | Node/Express service | `3101` |
| moOde MPD | MPD on the player host | `6600` |

## Install

On the Now Playing host, install Node.js, npm, `mpc`, and PM2, then use the
repository installer:

```sh
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/install.sh | bash -s -- --ref main
```

The full installer flags, split-box/single-box choices, upgrade behavior, and
rollback checks are in [install-and-validation.md](install-and-validation.md).

## Configure the first connection

1. Open `config.html` on the Now Playing UI host.
2. Set the moOde/MPD host and port.
3. Set a strong `trackKey` for protected API actions.
4. Configure the optional moOde SSH host/user and required paths.
5. Run **Check SSH + Paths**.
6. Save the configuration and restart the API only if the UI reports that a
   restart is required.

Use [config-interface.md](config-interface.md) for the page model and
[config-network-and-runtime.md](config-network-and-runtime.md) for connection
and path verification details.

## Verify the first run

Check these in order:

1. `GET /now-playing` returns JSON from the API.
2. `GET /next-up` returns the current queue view.
3. `app.html` or a controller page loads from the UI host.
4. MPD transport changes from the controller reach moOde.
5. The display route loads if moOde is configured to use Now Playing.

The operator-facing checks are collected in
[configuration-and-administration.md](configuration-and-administration.md) and
[install-and-validation.md](install-and-validation.md).

## Choose the next path

- Learn the user-facing features → [using-now-playing.md](using-now-playing.md)
- Configure displays → [displays.md](displays.md)
- Connect external systems → [integrations.md](integrations.md)
- Understand the code and API → [developer-reference.md](developer-reference.md)
- Diagnose a failure → [troubleshooting-and-technical-notes.md](troubleshooting-and-technical-notes.md)

*Last reviewed: 2026-09-22 America/Chicago*
