# Development

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [INSTALLER_PLAN.md](INSTALLER_PLAN.md)
- [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)
- [URL_POLICY.md](URL_POLICY.md)
- [docs/04-library-health.md](docs/04-library-health.md)
- [docs/11-deploy-pm2-rollback.md](docs/11-deploy-pm2-rollback.md)
- [docs/21-moode-airplay-metadata-hardening.md](docs/21-moode-airplay-metadata-hardening.md)
- [docs/README.md](docs/README.md)
- [notes/refactor-endpoint-inventory.md](notes/refactor-endpoint-inventory.md)
- [scripts/deploy-pi4-safe.sh](scripts/deploy-pi4-safe.sh)
- [scripts/index.js](scripts/index.js)
- [scripts/install.sh](scripts/install.sh)
- [scripts/uninstall.sh](scripts/uninstall.sh)
- [src/routes/config.alexa-alias.routes.mjs](src/routes/config.alexa-alias.routes.mjs)
- [src/routes/track.routes.mjs](src/routes/track.routes.mjs)

</details>



This page is a guide for developers extending or customizing the now-playing system. It covers development setup, API extension patterns, UI component architecture, and testing workflows.

The system is designed for extensibility through modular route registration, dependency injection, and iframe-based UI composition. Developers can add new API endpoints, custom UI pages, and display modes without modifying core files.

---

## Development Setup

### Prerequisites

The system requires the following runtime dependencies:

| Dependency | Purpose | Installation |
|------------|---------|--------------|
| Node.js 16+ | JavaScript runtime | `node -v && npm -v` |
| mpc | MPD command-line client | `sudo apt install -y mpc` |
| PM2 | Process manager (Optional) | `sudo npm install -g pm2` |
| SSH access | moOde integration | SSH key or password |

Optional dependencies for specific features:

- `python3-mpd`, `python3-requests`, `python3-mutagen` â Required for Last.fm vibe discovery.
- `ffmpeg` â Required for podcast art embedding and motion art transcoding [src/routes/track.routes.mjs:73-104]().
- `yt-dlp` â Required for YouTube stream resolution.

**Sources:** [ARCHITECTURE.md:21-35](), [src/routes/track.routes.mjs:73-104]()

### Installation Flags

The installation script `scripts/install.sh` supports several flags for customization:

```bash
./scripts/install.sh --ref main --port 3101 --mode split
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--ref <branch\|tag\|sha>` | `main` | Git reference to install [scripts/install.sh:29]() |
| `--repo <url>` | GitHub repo | Custom repository URL [scripts/install.sh:28]() |
| `--install-dir <path>` | `/opt/now-playing` | Installation directory [scripts/install.sh:26]() |
| `--port <number>` | `3101` | API server port [scripts/install.sh:27]() |
| `--mode <split\|single-box>` | `split` | Topology mode [scripts/install.sh:25]() |
| `--fresh` | `false` | Destructive refresh: do NOT preserve runtime state [scripts/install.sh:32]() |

The `--mode` flag configures whether the API/UI servers run on a separate Pi (`split`) or on the moOde host itself (`single-box`).

**Sources:** [scripts/install.sh:20-35](), [scripts/install.sh:61-84]()

### PM2 and systemd Management

The system manages two core services. The installer defaults to systemd unit files [scripts/install.sh:210-245](), but PM2 is supported for process management and log rotation [docs/11-deploy-pm2-rollback.md:17-23]().

```mermaid
graph LR
    subgraph "Process Management"
        PM2["PM2 / systemd"]
    end
    
    subgraph "Service Entities"
        API["now-playing.service<br/>moode-nowplaying-api.mjs<br/>Port 3101"]
        WEB["now-playing-web.service<br/>python3 -m http.server<br/>Port 8101"]
    end

    PM2 --> ["now-playing.service"]
    PM2 --> ["now-playing-web.service"]
```

**Title:** Service Architecture

Common commands for development:

```bash
# systemd restart
sudo systemctl restart now-playing.service

# View logs
journalctl -u now-playing.service -n 100 --no-pager
```

For details on service management and Raspberry Pi specific deployment, see [Development Setup](#11.1).

**Sources:** [docs/11-deploy-pm2-rollback.md:1-31](), [scripts/install.sh:210-245]()

---

## API Extension

The API follows a modular registration pattern. All routes are centralized in `moode-nowplaying-api.mjs` but implemented in discrete modules under `src/routes/`.

### Route Registration Pattern

Modules export a registration function that receives the Express `app` and a `deps` object containing shared utilities and configuration.

```javascript
export function registerMyFeatureRoutes(app, deps) {
  const { requireTrackKey } = deps;
  
  app.get('/my-feature', async (req, res) => {
    if (!requireTrackKey(req, res)) return; // Auth gate [src/routes/config.alexa-alias.routes.mjs:10]()
    // Logic here
  });
}
```

For a guide on adding new routes and using the `URL_POLICY.md` for stable naming, see [API Extension](#11.2).

**Sources:** [src/routes/config.alexa-alias.routes.mjs:4-10](), [src/routes/track.routes.mjs:106-117](), [URL_POLICY.md:1-67]()

---

## UI Component Patterns

The UI is built on a "Shell and Frame" architecture. `app.html` acts as the primary container, embedding specialized pages via iframes [URL_POLICY.md:9]().

### Communication Protocol

Communication between the shell and iframes uses `postMessage`:

- `np-theme-sync`: Propagates CSS theme tokens across frames.
- `np-frame-height`: Notifies the shell of dynamic content height changes.
- `np-queue-busy`: Signals long-running queue operations to the UI.

For details on `normalizeEmbeddedDoc` and hero transport integration, see [UI Component Patterns](#11.3).

**Sources:** [URL_POLICY.md:9-38](), [ARCHITECTURE.md:48-52]()

---

## Testing & Debugging

### Diagnostics Interface

The `diagnostics.html` page is the central hub for API testing. It provides a request builder, endpoint catalog, and live iframe previews [URL_POLICY.md:31]().

```mermaid
graph TD
    subgraph "Natural Language Space"
        NP["Now Playing"]
        QW["Queue Wizard"]
        LH["Library Health"]
    end

    subgraph "Code Entity Space"
        NP --> ["GET /now-playing"]
        QW --> ["POST /config/queue-wizard/apply"]
        LH --> ["GET /config/library-health"]
    end
    
    ["diagnostics.html"] --> ["src/routes/config.diagnostics.routes.mjs"]
```

**Title:** Bridging UI Intent to API Routes

### Troubleshooting

Common issues include stale deployments or cache-busted proxy failures. The `TESTING_CHECKLIST.md` provides a manual verification gate for releases.

- **Check Syntax**: `node --check moode-nowplaying-api.mjs` [TESTING_CHECKLIST.md:7]()
- **Smoke Test**: `GET /healthz` [TESTING_CHECKLIST.md:14]()
- **Auth Test**: Verify `x-track-key` requirements [TESTING_CHECKLIST.md:21]()

For the full troubleshooting playbook and debugging steps, see [Testing & Debugging](#11.4).

**Sources:** [TESTING_CHECKLIST.md:1-58](), [docs/12-troubleshooting.md]() (referenced via README).
