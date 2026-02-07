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

- Preflight checks (OS, node, npm, curl, systemctl)
- Create app directory and copy project files
- Install npm deps deterministically (`npm ci` when lockfile exists)
- Generate `.env` from template and prompt for required values
- Create systemd service unit for API process
- Enable + start service
- Run smoke checks (`/healthz`, `/now-playing`, art route)
- Print next steps and troubleshooting pointers

## Required Inputs

- `API_PORT` (default 3101)
- `TRACK_KEY`
- Upstream moOde host/base URL
- Optional public base URL (reverse proxy)

## Deliverables

- `scripts/install.sh` (interactive + non-interactive flags)
- `scripts/uninstall.sh` (safe service removal)
- `.env.example`
- `docs/INSTALL.md` quickstart
- `docs/DEPLOY_MODES.md` split vs single-box

## Guardrails

- Never overwrite existing `.env` without confirmation
- Backup systemd unit before replacing
- Refuse to proceed as root unless explicit `--allow-root`
- Fail fast on missing required env vars

## v1.1 ideas

- Auto-detect reverse proxy and print recommended Caddy/Nginx snippets
- Optional Alexa package build helper
- Optional cron setup for podcast refresh/download
