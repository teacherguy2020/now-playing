# now-playing

<p align="left"><strong>Now Playing for moOde</strong></p>

A moOde-focused now-playing API + UI stack with optional Alexa integration.
![Now Playing index view](./docs/images/readme-index.jpg)
![Now Playing promo collage](./docs/images/master-best-20260227/_collages/collage-promo-mixed-tabs-themes-normalized.jpg)

![Peppy preset example: Warm Parchment Gold Circular](./docs/images/peppy-presets/10-warm-parchment-gold-circular.jpg)
<img src="./docs/images/mobile-builder/controller.png" alt="Controller mobile view" width="300">


Six ways to use:

1. Browser toolkit/dashboard
2. Display html page
3. Player screen for moOde box
4. Peppymeter+track info screen for moOde box
5. Mobile app
6. Alexa skill

> Recommended topology: run this project on a separate Pi from your moOde host.

## Quick start

1. Install on API/UI host.
2. Open `config.html` and set core fields (`trackKey`, `mpd.host`, `moode.baseUrl`, SSH settings).
3. Run **Check SSH + Paths**.
4. Open `app.html` (shell) or `index.html` (display view) or `player.html` (player view) `controller.html` (mobile view).

### Peppy meter requirement (must configure on moOde)

For meter needles to move, moOde PeppyMeter must post VU data to your now-playing API.
Set the VU target in moOde’s PeppyMeter config file on the moOde box:

- File: `/etc/peppymeter/config.txt`
- Target URL must point to your now-playing host:
  - `http://<your-now-playing-host>:3101/peppy/vumeter`

If this URL is missing or points to the wrong host, album art can still load but needles will stay still.

After updating `config.txt`, restart/reboot moOde.

Quick verify on the now-playing host:

```bash
curl -s http://127.0.0.1:3101/peppy/vumeter
```

You should see fresh timestamps (`fresh: true`) and non-zero levels while music is playing.

## Docs (tab-ordered)

👉 **Start here for full documentation:** [docs/README.md](./docs/README.md)

- Config
- Diagnostics
- Alexa
- Library Health (Album Workbench flow, cached scans + full refresh, inventory sort modes, album-row queue/play actions)
- Queue Wizard
- Radio
- Podcasts
- Theme (for desktop)
- moOde Display Enhancement (custom Peppy/Player push flow)
- Mobile Builder + Controller pages

Plus cross-cutting chapters for hero shell, index-vs-app parity, random-vs-shuffle, deploy/rollback, and troubleshooting.

## Licensing

- Project root license: [Unlicense](./LICENSE), unless otherwise noted.
- Third-party license notices: [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)
- `integrations/moode/aplmeta.py` is moOde-derived and remains licensed under GPL-3.0-or-later (per file header/SPDX).

## Install (systemd Linux)

Prerequisites:
- Node.js must be installed on the target machine (`node` and `npm` available in PATH).
- `mpc` (MPD client) must be installed on the target machine.
- PM2 is strongly recommended for process management and auto-restart.

Quick check:

```bash
node -v && npm -v
mpc --version
pm2 -v
```

If `mpc` is missing (Debian/Raspberry Pi OS):

```bash
sudo apt update
sudo apt install -y mpc
```

If PM2 is missing:

```bash
sudo npm install -g pm2
```

If Node.js is missing (Debian/Raspberry Pi OS), install Node.js first, then run:

```bash
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/install.sh | bash -s -- --ref main
```

Useful flags:
- `--ref <branch|tag|sha>`
- `--repo <url>`
- `--install-dir <path>`
- `--port <number>`
- `--mode <split|single-box>`

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/uninstall.sh | bash
```

Purge:

```bash
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/uninstall.sh | bash -s -- --purge -y
```
