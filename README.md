# now-playing

A moOde-focused now-playing API + UI stack with optional Alexa integration.

> Recommended topology: run this project on a separate Pi from your moOde host.

## Quick start

1. Install on API/UI host.
2. Open `config.html` and set core fields (`trackKey`, `mpd.host`, `moode.baseUrl`, SSH settings).
3. Run **Check SSH + Paths**.
4. Open `app.html` (shell) or `index.html` (display view).

## Docs (tab-ordered)

See [docs/README.md](./docs/README.md).

- Config
- Diagnostics
- Alexa
- Library Health
- Queue Wizard
- Radio
- Podcasts

Plus cross-cutting chapters for hero shell, index-vs-app parity, random-vs-shuffle, deploy/rollback, and troubleshooting.

## Install (systemd Linux)

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
