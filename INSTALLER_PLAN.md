# Installer Backlog

The installer is now implemented at:

- `scripts/install.sh` (systemd Linux)

Validation gate is tracked at:

- `docs/INSTALL_VALIDATION.md`

## Current state (implemented)

- GitHub-invoked install flow (`--repo`, `--ref`)
- Sync to install dir + dependency install
- `.env` bootstrap (non-destructive if existing)
- systemd unit creation and enable/start
- basic smoke checks (`/healthz`, `/now-playing`, artwork route)

## Remaining backlog

### High priority

- Add `--dry-run` mode
- Add `--no-start` / `--no-enable` flags
- Improve failure rollback behavior (partial install cleanup guidance)
- Add clearer prereq checks/output for distro package deps

### Medium priority

- Add `scripts/uninstall.sh` (safe service removal, optional data retention)
- Add support for non-systemd environments (or explicit PM2 fallback)
- Add optional reverse-proxy helper examples (nginx/caddy snippets)
- Add optional first-run config wizard/template prompts

### Low priority

- Add launchd support (macOS)
- Add installer telemetry/log bundle option for troubleshooting

## Release criteria

Before major public promotion, ensure:

- `docs/INSTALL_VALIDATION.md` passes on at least one fresh VM
- README installer section matches actual script flags/behavior
- Known limitations remain clearly documented
