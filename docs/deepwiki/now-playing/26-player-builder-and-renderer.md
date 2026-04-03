# Player Builder & Renderer

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/images/player-sizes/01-player-1280x400.jpg](docs/images/player-sizes/01-player-1280x400.jpg)
- [docs/images/player-sizes/02-player-1024x600.jpg](docs/images/player-sizes/02-player-1024x600.jpg)
- [docs/images/player-sizes/03-player-800x480.jpg](docs/images/player-sizes/03-player-800x480.jpg)
- [docs/images/player-sizes/04-player-480x320.jpg](docs/images/player-sizes/04-player-480x320.jpg)
- [docs/images/player-sizes/05-player-320x240.jpg](docs/images/player-sizes/05-player-320x240.jpg)
- [index.html](index.html)
- [player-render.html](player-render.html)
- [player.html](player.html)
- [scripts/index-ui.js](scripts/index-ui.js)
- [styles/index1080.css](styles/index1080.css)

</details>



## Purpose & Scope

This page documents the **Player Builder** (`player.html`) and **Player Renderer** (`player-render.html`) components. These tools enable a configurable "Now Playing" display composition optimized for various hardware screen sizes (1280x400, 800x480, 1024x600, 480x320, 320x240). Unlike the audio-reactive meters in the [Peppy Builder & Renderer](3.2), the Player system focuses on track metadata, high-quality album art (including motion art), and transport controls [player-render.html:52-153]().

---

## Architecture Overview

The Player system follows a **builder-first design pattern**. The builder UI allows users to select dimensions and themes, which are then persisted as a profile. The renderer reads this profile to apply specific CSS layout rules [player.html:44-51]().

### Player System Data Flow
The following diagram illustrates how the `player.html` builder configures the environment and how `player-render.html` consumes that state.

Title: Player Configuration and Rendering Pipeline
```mermaid
graph TB
    subgraph "Builder Interface (player.html)"
        [sizeSel] -- "Select Dimension" --> [apply_js]
        [themeSel] -- "Select Theme" --> [apply_js]
        [pushPlayerFromTab] -- "postMessage np-display-action" --> [app_html]
    end
    
    subgraph "State Persistence"
        [localStorage] -- "Key: player.profile.v2" --> [Profile_JSON]
        [API_POST] -- "POST /config/moode/browser-url" --> [moOde_xinitrc]
    end
    
    subgraph "Renderer (player-render.html)"
        [Renderer_Body] -- "Add class player-size-WxH" --> [CSS_Grid_Layout]
        [Renderer_JS] -- "Poll /now-playing" --> [Metadata_UI]
    end
    
    [apply_js] --> [localStorage]
    [app_html] --> [API_POST]
    [moOde_xinitrc] --> [Renderer_Body]
    [Profile_JSON] --> [Renderer_Body]
```
Sources: [player.html:35-101](), [player-render.html:52-100](), [scripts/index-ui.js:185-200]()

---

## Player Builder Interface (`player.html`)

The builder provides a design-time environment with a live preview frame [player.html:32]().

### Key Functions
- **`apply(reload)`**: Reads values from the `sizeSel` and `themeSel` dropdowns, updates the preview iframe's `src` with the new parameters, and persists the choice to `localStorage` under the key `player.profile.v2` [player.html:85-93]().
- **`applyScaleOnly()`**: Responsively scales the preview `frame` to fit the current browser window while maintaining the target aspect ratio (e.g., 1280x400) [player.html:46-51]().
- **`refreshTargetHint()`**: Checks the current moOde `browser-url` status via the API and warns the user if the target display is not set to `display.html?kiosk=1` [player.html:64-83]().

### Push Mechanism
When the "Push Player to moOde" button is clicked, it sends a `postMessage` with type `np-display-action` and action `push-player` to the parent window (`app.html`) [player.html:97](). This triggers the backend to update the moOde `.xinitrc` file to point to the player renderer.

Sources: [player.html:35-102]()

---

## Player Renderer (`player-render.html`)

The renderer is the runtime entry point for the hardware display. It is a specialized version of the main `index.html` that uses a **CSS class system** to redefine the layout for specific physical screen resolutions [player-render.html:52-153]().

### Hardware Size Profiles
The renderer uses the `player-size-*` class on the `<body>` tag to switch between different grid definitions [player-render.html:53-100]().

| Class | Target Hardware | Layout Strategy |
| :--- | :--- | :--- |
| `player-size-1280x400` | Waveshare 7.9" / 11.9" | Three-column kiosk layout (Art / Metadata / Controls) |
| `player-size-1024x600` | 7" / 10" Tablets | 2-column grid: 470px Art / 1fr Text [player-render.html:65-76]() |
| `player-size-800x480` | 5" Touchscreens | 2-column grid: 360px Art / 1fr Text [player-render.html:53-64]() |
| `player-size-480x320` | 3.5" RPi Screens | Compact 2-column: 220px Art / 1fr Text [player-render.html:77-88]() |
| `player-size-320x240` | 2.8" Hat Screens | Minimal 2-column: 146px Art / 1fr Text [player-render.html:89-100]() |

### Implementation Detail: Grid and Scaling
For smaller screens (800x480 and below), the renderer disables background blurs (`#background-a`, `#background-b`) and removes border radii to maximize screen real estate [player-render.html:117-122](). It also aggressively scales typography, such as reducing the artist name from 48px (on 1024x600) to 16px (on 320x240) [player-render.html:138, 148]().

Sources: [player-render.html:52-153](), [index.html:55-142](), [styles/index1080.css:22-50]()

---

## Now Playing Runtime Logic (`scripts/index-ui.js`)

The renderer shares the core logic found in `scripts/index-ui.js`, which manages the dynamic content of the player.

### Core Features
- **Double-Buffer Crossfade**: Manages `#background-a` and `#background-b` to provide smooth transitions between album art [scripts/index-ui.js:4-5]().
- **Poll-and-Diff**: Frequently polls the `/now-playing` endpoint and only updates DOM elements if the track metadata has changed [scripts/index-ui.js:195]().
- **Motion Art**: If an animated version of the album art is available, the `#album-art-video` element is shown and the static `#album-art` is hidden [index.html:70](), [scripts/index-ui.js:29]().
- **Pause Screensaver**: If playback is paused for an extended period, the UI enters a screensaver mode to prevent burn-in [scripts/index-ui.js:7]().

### Interaction Map
The following diagram maps UI elements to their corresponding code logic in `index-ui.js`.

Title: UI Interaction and Event Binding Map
```mermaid
graph LR
    subgraph "DOM Elements (index.html)"
        [fav-heart]
        [art-info-hotspot]
        [album-art-wrapper]
        [progress-fill]
    end

    subgraph "Logic (index-ui.js)"
        [bindFavoriteUIOnce] -- "Handles Heart Tap" --> [onToggleFavorite]
        [bindAlbumArtAppleLinkOnce] -- "Art Tap Logic" --> [switchToKioskFromArt]
        [updatePhoneArtBottomVar] -- "Layout Calc" --> [CSS_Vars]
        [ensureIdleOverlay] -- "Queue Empty" --> [np-idle-clock]
    end

    [fav-heart] --> [bindFavoriteUIOnce]
    [album-art-wrapper] --> [bindAlbumArtAppleLinkOnce]
    [art-info-hotspot] --> [onToggleFavorite]
```
Sources: [scripts/index-ui.js:49-161](), [index.html:60-141]()

---

## Theming & Customization

The Player Renderer integrates with the system's global theme token system.

1. **Theme Sync**: The renderer listens for `np-theme-sync` messages from the parent shell to update its CSS custom properties (e.g., `--theme-bg`) [styles/index1080.css:22-40]().
2. **Hires Badge**: Based on the audio bit depth and sample rate returned by moOde, the `#hires-badge` is dynamically updated to show "Hi-Res", "Lossless", or specific kHz/bit info [scripts/index-ui.js:10](), [index.html:120]().
3. **Radio Stabilization**: For radio streams, the renderer attempts to resolve station logos and formats metadata to handle "Composer - Work" patterns often found in classical broadcasts [scripts/index-ui.js:8]().

Sources: [styles/index1080.css:22-50](), [scripts/index-ui.js:1-11](), [index.html:118-122]()
