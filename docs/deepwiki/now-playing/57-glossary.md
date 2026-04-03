# Glossary

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [INSTALLER_PLAN.md](INSTALLER_PLAN.md)
- [README.md](README.md)
- [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)
- [URL_POLICY.md](URL_POLICY.md)
- [app.html](app.html)
- [config.html](config.html)
- [controller-now-playing.html](controller-now-playing.html)
- [controller.html](controller.html)
- [docs/14-display-enhancement.md](docs/14-display-enhancement.md)
- [docs/18-kiosk.md](docs/18-kiosk.md)
- [docs/images/kioskred.jpg](docs/images/kioskred.jpg)
- [docs/images/readme-spectrum.jpg](docs/images/readme-spectrum.jpg)
- [index.html](index.html)
- [moode-nowplaying-api.mjs](moode-nowplaying-api.mjs)
- [peppy.html](peppy.html)
- [player-render.html](player-render.html)
- [player.html](player.html)
- [podcasts.html](podcasts.html)
- [queue-wizard.html](queue-wizard.html)
- [scripts/diagnostics.js](scripts/diagnostics.js)
- [scripts/index-ui.js](scripts/index-ui.js)
- [scripts/index.js](scripts/index.js)
- [scripts/queue-wizard.js](scripts/queue-wizard.js)
- [src/routes/config.diagnostics.routes.mjs](src/routes/config.diagnostics.routes.mjs)
- [src/routes/config.moode-audio-info.routes.mjs](src/routes/config.moode-audio-info.routes.mjs)
- [src/routes/config.routes.index.mjs](src/routes/config.routes.index.mjs)
- [src/routes/config.runtime-admin.routes.mjs](src/routes/config.runtime-admin.routes.mjs)
- [src/routes/track.routes.mjs](src/routes/track.routes.mjs)
- [styles/hero.css](styles/hero.css)
- [styles/index1080.css](styles/index1080.css)
- [theme.html](theme.html)

</details>



This glossary provides technical definitions for codebase-specific terminology, architectural patterns, and jargon used within the **now-playing** system. It serves as a reference for onboarding engineers to understand how natural language concepts map to specific code entities and implementation details.

## Core System Concepts

### moOde Integration
The system is designed to integrate with the [moOde audio player](https://moodeaudio.org/) without modifying the core moOde installation. It communicates primarily via MPD (Music Player Daemon) and SSH commands.
*   **Implementation:** Commands are wrapped in the `sshBashLc` utility which uses `BatchMode=yes` and `ConnectTimeout=6` for non-interactive execution [src/routes/config.runtime-admin.routes.mjs:133-140]().
*   **Data Flow:** The system queries the moOde SQLite database to retrieve radio station metadata and handles station logo aliases [moode-nowplaying-api.mjs:59-69]().

### Track Key
A security token (default: `1029384756`) required for state-changing API requests. It prevents unauthorized playback control or metadata modification.
*   **Implementation:** Defined in environment variables or config [src/routes/config.runtime-admin.routes.mjs:22-22]().
*   **Usage:** Enforced via middleware to protect sensitive operations like rating updates or queue management [moode-nowplaying-api.mjs:5-12]().

### Poll-and-Diff Model
The primary mechanism for keeping the UI in sync with the player state. The UI periodically polls `/now-playing`, generates a "signature" of the metadata, and only triggers expensive DOM updates or crossfades if the signature changes.
*   **Implementation:** Managed in `scripts/index-ui.js` and specialized controllers [scripts/index-ui.js:195-200]().

---

## User Interface & Display

### Application Shell (app.html)
The master container that provides a unified navigation rail and theme context for various sub-pages (iframes).
*   **Key Function:** Manages the `viewWrap` and `heroWrap` to embed interfaces like the Queue Wizard or Library Health [app.html:52-54]().
*   **Theme Bridging:** Uses CSS custom properties (tokens) like `--theme-bg` to maintain visual consistency across embedded frames [app.html:24-49]().

### Brass Ring Controls
A specific UI aesthetic used in mobile and kiosk interfaces, characterized by circular transport buttons with glowing borders indicating active states.
*   **Implementation:** Defined in the `npCtrls` class with `.ctl.on` states for active playback [controller.html:47-55]().

### Kiosk Mode
A dedicated 1280x400 layout designed for wide-aspect hardware displays. It features a grid-based navigation system.
*   **Renderer:** `display.html` acts as a router that detects the `kiosk=1` flag and loads the appropriate renderer [README.md:53-54]().

### Double-Buffer Crossfade
A technique used in the now-playing displays to smoothly transition between tracks. Two layers (`background-a` and `background-b`) are used to fade out the old album art while fading in the new one.
*   **Implementation:** Managed by the UI runtime to ensure seamless background transitions [controller-now-playing.html:19-26]().

---

## Technical Jargon & Abbreviations

| Term | Definition | Code Pointer |
| :--- | :--- | :--- |
| **ALSA FIFO** | A named pipe used to stream raw audio data from moOde to the Peppy API for VU/Spectrum meters. | [README.md:76-85]() |
| **BFCache** | Back-Forward Cache; specific handling in mobile to ensure the UI refreshes when returning to the tab. | [controller-now-playing.html:27-33]() |
| **Hires Badge** | A UI element that appears when the audio stream is lossless or high-resolution (e.g., FLAC). | [scripts/index-ui.js:10-10]() |
| **Optimistic UI** | Updating the UI (e.g., favorites or play state) immediately before the server confirms the change. | [scripts/queue-wizard.js:80-82]() |
| **Radio Holdback** | A policy that delays radio metadata updates to prevent "Now Playing" flickering during station IDs or stream resets. | [moode-nowplaying-api.mjs:45-49]() |
| **Sticker DB** | The MPD "sticker" database used to store track ratings (1-5 stars) as key-value pairs. | [moode-nowplaying-api.mjs:9-12]() |
| **Vibe Job** | An asynchronous process that builds a "Vibe" queue based on a seed track using Last.fm similarity data. | [scripts/queue-wizard.js:123-125]() |

---

## Architectural Mapping

### Natural Language to Code Entity Space: Playback Pipeline
The following diagram bridges the conceptual "Play Music" flow to the specific code entities that handle the request.

```mermaid
graph TD
    "User[User clicks Play]" -->|"/queue/apply"| "API[moode-nowplaying-api.mjs]"
    "API" -->|"/usr/bin/mpc"| "MPC[MPD Client Binary]"
    "MPC" -->|Socket| "MPD[Music Player Daemon]"
    "MPD" -->|Audio Stream| "ALSA[ALSA / FIFO]"
    "ALSA" -->|VU Data| "Peppy[Peppy Bridge (peppy.html)]"
    "Peppy" -->|"/peppy/vumeter"| "API"
```
**Sources:** [moode-nowplaying-api.mjs:1-12](), [peppy.html:76-80](), [README.md:78-83]()

### Natural Language to Code Entity Space: Metadata Enrichment
When a track changes, the system enriches raw MPD data with external assets.

```mermaid
graph LR
    subgraph "Internal State"
        "MPD Snapshot" --> "Signature Check"
    end

    subgraph "Enrichment Engine"
        "Signature Check" --> "iTunes Search API"
        "Signature Check" --> "Animated Art Cache"
        "Signature Check" --> "Sticker DB (Ratings)"
    end

    subgraph "Output"
        "iTunes Search API" --> "art/current.jpg"
        "Animated Art Cache" --> "data/animated-art-cache.json"
        "Sticker DB (Ratings)" --> "Rating JSON"
    end
```
**Sources:** [moode-nowplaying-api.mjs:6-12](), [scripts/index-ui.js:195-200](), [src/routes/config.runtime-admin.routes.mjs:67-72]()

---

## Subsystem Definitions

### Animated Art System
A pipeline that fetches Apple Music motion art and converts it to H264 for web playback.
*   **Storage:** Cache configuration is defined in the runtime settings [src/routes/config.runtime-admin.routes.mjs:67-72]().
*   **Rendering:** The `peppy.html` and `index.html` templates use `<video>` elements to display these motion assets [peppy.html:39-40]().

### Queue Wizard
A multi-source queue builder that allows users to create complex playback sequences from filters, vibes, or podcasts.
*   **Preview-Apply Pipeline:** Users first "build" a list (preview) which is stored in `currentTracks` before "sending" it to moOde [scripts/queue-wizard.js:90-94]().
*   **Vibe Discovery:** Leverages a Python-based vibe builder (lastfm_vibe_radio.py) to find similar tracks [README.md:107-107]().

### Peppy Bridge (peppy.html)
A canvas-based renderer for VU meters and spectrum visualizers that runs in the browser.
*   **Meter Types:** Supports circular VU meters, linear cassettes, and spectrum analyzers [peppy.html:36-37]().
*   **Data Sink:** Receives high-frequency audio data via `PUT /peppy/vumeter` and `PUT /peppy/spectrum` [README.md:80-85]().

**Sources:**
*   `peppy.html`
*   `app.html`
*   `queue-wizard.html`
*   `scripts/queue-wizard.js`
*   `moode-nowplaying-api.mjs`
*   `controller.html`
*   `controller-now-playing.html`
*   `README.md`
*   `scripts/index-ui.js`
*   `src/routes/config.runtime-admin.routes.mjs`
5:["$","$L15",null,{"repoName":"teacherguy2020/now-playing","hasConfig":false,"canSteer":true,"children":["$","$L16",null,{"wiki":{"metadata":{"repo_name":"teacherguy2020/now-playing","commit_hash":"53bc925a","generated_at":"2026-03-27T18:35:39.684061","config":null,"config_source":"none"},"pages":[{"page_plan":{"id":"1","title":"Overview"},"content":"$17"},{"page_plan":{"id":"1.1","title":"System Architecture"},"content":"$18"},{"page_plan":{"id":"1.2","title":"Installation & Setup"},"content":"$19"},{"page_plan":{"id":"1.3","title":"Key Concepts"},"content":"$1a"},{"page_plan":{"id":"2","title":"User Interfaces"},"content":"$1b"},{"page_plan":{"id":"2.1","title":"Application Shell (app.html)"},"content":"$1c"},{"page_plan":{"id":"2.2","title":"Now Playing Displays"},"content":"$1d"},{"page_plan":{"id":"2.2.1","title":"Desktop Display (index.html)"},"content":"$1e"},{"page_plan":{"id":"2.2.2","title":"Mobile Display (controller-now-playing.html)"},"content":"$1f"},{"page_plan":{"id":"2.3","title":"Mobile Controller Dashboard"},"content":"$20"},{"page_plan":{"id":"2.4","title":"Kiosk Mode"},"content":"$21"},{"page_plan":{"id":"2.5","title":"Diagnostics Interface"},"content":"$22"},{"page_plan":{"id":"3","title":"Display Enhancement System"},"content":"$23"},{"page_plan":{"id":"3.1","title":"Overview & Push Model"},"content":"$24"},{"page_plan":{"id":"3.2","title":"Peppy Builder & Renderer"},"content":"$25"},{"page_plan":{"id":"3.3","title":"Player Builder & Renderer"},"content":"$26"},{"page_plan":{"id":"3.4","title":"Display Router (display.html)"},"content":"$27"},{"page_plan":{"id":"3.5","title":"Audio Data Pipeline"},"content":"$28"},{"page_plan":{"id":"3.6","title":"Peppy Skin Assets & Export"},"content":"$29"},{"page_plan":{"id":"4","title":"Queue Management"},"content":"$2a"},{"page_plan":{"id":"4.1","title":"Queue Wizard Interface"},"content":"$2b"},{"page_plan":{"id":"4.2","title":"Filter Builder"},"content":"$2c"},{"page_plan":{"id":"4.3","title":"Vibe Discovery"},"content":"$2d"},{"page_plan":{"id":"4.4","title":"Playlist & Podcast Queues"},"content":"$2e"},{"page_plan":{"id":"4.5","title":"Live Queue Editing"},"content":"$2f"},{"page_plan":{"id":"5","title":"Media Library"},"content":"$30"},{"page_plan":{"id":"5.1","title":"Library Health Dashboard"},"content":"$31"},{"page_plan":{"id":"5.2","title":"Static Album Art"},"content":"$32"},{"page_plan":{"id":"5.3","title":"Animated Art System"},"content":"$33"},{"page_plan":{"id":"5.4","title":"Metadata Inspector"},"content":"$34"},{"page_plan":{"id":"5.5","title":"Podcast Management"},"content":"$35"},{"page_plan":{"id":"5.6","title":"Radio Station Browser"},"content":"$36"},{"page_plan":{"id":"6","title":"Playback Features"},"content":"$37"},{"page_plan":{"id":"6.1","title":"Now Playing System"},"content":"$38"},{"page_plan":{"id":"6.2","title":"Transport Controls"},"content":"$39"},{"page_plan":{"id":"6.3","title":"Ratings & Favorites"},"content":"$3a"},{"page_plan":{"id":"6.4","title":"Progress & State Tracking"},"content":"$3b"},{"page_plan":{"id":"7","title":"External Integrations"},"content":"$3c"},{"page_plan":{"id":"7.1","title":"Alexa Voice Control"},"content":"$3d"},{"page_plan":{"id":"7.2","title":"moOde Integration"},"content":"$3e"},{"page_plan":{"id":"7.3","title":"Last.fm Vibe Discovery"},"content":"$3f"},{"page_plan":{"id":"7.4","title":"YouTube Proxy"},"content":"$40"},{"page_plan":{"id":"7.5","title":"iTunes & Motion Art APIs"},"content":"$41"},{"page_plan":{"id":"8","title":"Theme & Customization"},"content":"$42"},{"page_plan":{"id":"8.1","title":"Theme Token System"},"content":"$43"},{"page_plan":{"id":"8.2","title":"Theme Editor"},"content":"$44"},{"page_plan":{"id":"8.3","title":"Responsive Layouts"},"content":"$45"},{"page_plan":{"id":"8.4","title":"Peppy Skins & Customization"},"content":"$46"},{"page_plan":{"id":"9","title":"Backend API"},"content":"$47"},{"page_plan":{"id":"9.1","title":"API Architecture"},"content":"$48"},{"page_plan":{"id":"9.2","title":"Core Endpoints"},"content":"$49"},{"page_plan":{"id":"9.3","title":"MPD Integration"},"content":"$4a"},{"page_plan":{"id":"9.4","title":"SSH Bridge"},"content":"$4b"},{"page_plan":{"id":"9.5","title":"Cache Systems"},"content":"$4c"},{"page_plan":{"id":"10","title":"Configuration & Administration"},"content":"$4d"},{"page_plan":{"id":"10.1","title":"Configuration Interface"},"content":"$4e"},{"page_plan":{"id":"10.2","title":"Runtime Verification"},"content":"$4f"},{"page_plan":{"id":"10.3","title":"Service Control"},"content":"$50"},{"page_plan":{"id":"10.4","title":"Diagnostics Tools"},"content":"$51"},{"page_plan":{"id":"11","title":"Development"},"content":"$52"},{"page_plan":{"id":"11.1","title":"Development Setup"},"content":"$53"},{"page_plan":{"id":"11.2","title":"API Extension"},"content":"$54"},{"page_plan":{"id":"11.3","title":"UI Component Patterns"},"content":"$55"},{"page_plan":{"id":"11.4","title":"Testing & Debugging"},"content":"$56"},{"page_plan":{"id":"12","title":"Glossary"},"content":"$57"}]},"children":"$L58"}]}]

6:[["$","script",null,{"type":"application/ld+json","dangerouslySetInnerHTML":{"__html":"{\"@context\":\"https://schema.org\",\"@type\":\"TechArticle\",\"headline\":\"Overview\",\"description\":\"This document provides a high-level introduction to the now-playing system, a moOde audio player enhancement suite that adds display customization, queue management, voice control, and library health \",\"image\":\"https://deepwiki.com/teacherguy2020/now-playing/og-image.png\",\"datePublished\":\"2026-03-27T18:35:39.684061\",\"dateModified\":\"2026-03-27T18:35:39.684061\",\"author\":{\"@type\":\"Organization\",\"name\":\"DeepWiki\",\"url\":\"https://deepwiki.com\"},\"publisher\":{\"@type\":\"Organization\",\"name\":\"DeepWiki\",\"logo\":{\"@type\":\"ImageObject\",\"url\":\"https://deepwiki.com/icon.png\"}},\"mainEntityOfPage\":{\"@type\":\"WebPage\",\"@id\":\"https://deepwiki.com/teacherguy2020/now-playing\"}}"}}],["$","$L3",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L4",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]]

e:{"metadata":[["$","title","0",{"children":"teacherguy2020/now-playing | DeepWiki"}],["$","meta","1",{"name":"description","content":"This document provides a high-level introduction to the now-playing system, a moOde audio player enhancement suite that adds display customization, queue management, voice control, and library health "}],["$","meta","2",{"name":"keywords","content":"teacherguy2020/now-playing,teacherguy2020,now-playing,documentation,wiki,codebase,AI documentation,Devin,Overview"}],["$","link","3",{"rel":"canonical","href":"https://deepwiki.com/teacherguy2020/now-playing"}],["$","meta","4",{"property":"og:title","content":"teacherguy2020/now-playing | DeepWiki"}],["$","meta","5",{"property":"og:description","content":"This document provides a high-level introduction to the now-playing system, a moOde audio player enhancement suite that adds display customization, queue management, voice control, and library health "}],["$","meta","6",{"property":"og:url","content":"https://deepwiki.com/teacherguy2020/now-playing"}],["$","meta","7",{"property":"og:site_name","content":"DeepWiki"}],["$","meta","8",{"property":"og:image","content":"https://deepwiki.com/teacherguy2020/now-playing/og-image.png?page=1"}],["$","meta","9",{"property":"og:type","content":"website"}],["$","meta","10",{"name":"twitter:card","content":"summary_large_image"}],["$","meta","11",{"name":"twitter:site","content":"@cognition"}],["$","meta","12",{"name":"twitter:creator","content":"@cognition"}],["$","meta","13",{"name":"twitter:title","content":"teacherguy2020/now-playing | DeepWiki"}],["$","meta","14",{"name":"twitter:description","content":"This document provides a high-level introduction to the now-playing system, a moOde audio player enhancement suite that adds display customization, queue management, voice control, and library health "}],["$","meta","15",{"name":"twitter:image","content":"https://deepwiki.com/teacherguy2020/now-playing/og-image.png?page=1"}],["$","link","16",{"rel":"icon","href":"/favicon.ico","type":"image/x-icon","sizes":"16x16"}],["$","link","17",{"rel":"icon","href":"/icon.png?1ee4c6a68a73a205","type":"image/png","sizes":"48x48"}],["$","link","18",{"rel":"apple-touch-icon","href":"/apple-icon.png?a4f658907db0ab87","type":"image/png","sizes":"180x180"}],["$","$L59","19",{}]],"error":null,"digest":"$undefined"}

13:"$e:metadata"

58:["$","$L3",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L4",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]
