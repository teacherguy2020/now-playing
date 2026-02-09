# Installer Plan (Draft)

Goal: provide a repeatable, low-friction install path for both deployment models.

## Modes

1. **split** (recommended)
   - moOde Pi handles playback
   - app/API host handles now-playing API + podcast jobs

2. **single-box** (optional)
   - run everything on the moOde Pi
   - apply conservative defaults to protect playback stability

## Scope for v1 Installer

- Preflight checks (OS, node, npm, curl, service manager)
- Create app directory and copy project files
- Install npm deps deterministically (`npm ci` when lockfile exists)
- Generate `config/now-playing.config.json` from template and prompt for required values
- Optionally generate `.env` overrides for secrets/sensitive values
- Create/start runtime service (systemd **or** PM2)
- Run smoke checks (`/healthz`, `/now-playing`, art route)
- Print next steps and troubleshooting pointers

## Required Inputs

- Number of Pis / nodes
- Node IPs + roles (`api`, `display`, `both`)
- `API_PORT` (default 3101) and UI port (default 8101)
- `TRACK_KEY`
- Upstream moOde host/base URL
- Music/podcast paths:
  - `musicLibraryRoot`
  - `moodeUsbMount`
  - `piMountBase`
  - `podcastRoot`
- Alexa enabled (`true/false`)
- Public base URL/domain (required if Alexa enabled)

## Deliverables

- `scripts/install.sh` (interactive + non-interactive flags)
- `scripts/uninstall.sh` (safe service removal)
- `config/now-playing.config.example.json`
- `.env.example` (secrets/overrides only)
- `docs/INSTALL.md` quickstart
- `docs/DEPLOY_MODES.md` split vs single-box

## Guardrails

- Never overwrite existing `config/now-playing.config.json` or `.env` without confirmation
- Validate config before service start (nodes, ports, Alexa domain when enabled)
- Backup service config before replacing (systemd unit or PM2 process config)
- Refuse to proceed as root unless explicit `--allow-root`
- Fail fast on missing required config/env values

## Ratings (MPD sticker) Preflight

If ratings are enabled:

- Verify MPD has `sticker_file` configured
- Verify `sticker_file` parent directory is writable by MPD user
- Run sticker smoke test (set/get/remove on a temporary key)
- If not configured, print exact `mpd.conf` snippet and restart instructions

## v1.1 ideas

- Auto-detect reverse proxy and print recommended Caddy/Nginx snippets
- Optional Alexa package build helper
- Optional cron setup for podcast refresh/download
- Guided sync setup (`scp`/`rsync`) for source-of-truth to Pi deployment
- Optional multi-node rollout helper (push/restart/check across all configured Pis)
