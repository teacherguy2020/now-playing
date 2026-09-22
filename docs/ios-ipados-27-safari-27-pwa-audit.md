# Now-Playing iOS/iPadOS 27 and Safari 27 Audit

**Status:** tracked implementation assessment and follow-up record
**Audit date:** 2026-09-22
**Scope:** read-only review of the Now-Playing implementation and current Apple/WebKit behavior

This document began as a read-only audit. The later dated sections record the implementation, physical-device testing, deployment, and Git history that followed the initial findings.

## Executive summary

Now-Playing already has a solid iPhone/iPad foundation:

- dedicated tablet, mobile, kiosk, and app surfaces;
- `viewport-fit=cover` and safe-area handling;
- standalone manifests and Apple touch icons;
- installed-app detection;
- visibility/pageshow refresh handling;
- direct, user-gesture-safe local audio playback; and
- network-first live API requests.

The current implementation status is:

1. Stable manifest `id`/`scope` values and direct implementation start URLs are implemented.
2. The installed tablet status-bar vignette is fixed with the smallest effective change: `black` status-bar treatment.
3. Screen Wake Lock is implemented as an opt-in Settings preference, with secure-context gating.
4. Metadata-only MediaSession support is implemented for Play on Device without changing audio startup; action handlers remain deferred.
5. Per-installed-client preferences are stored in a versioned local settings object.
6. Distinct installed-app icon families are implemented for the dashboard, controller, tablet, and mobile surfaces.
7. Online/offline and resume/reconnect coordination remains a follow-up.
8. Removing persistent credential storage remains a separate security follow-up.

A service worker is potentially useful, but should be deferred. It introduces stale-shell and update complexity and is not necessary for live Now-Playing reliability.

## 1. Current implementation

### Layouts and app surfaces

The project uses separate implementations for:

- `app.html` — main hero/queue shell with embedded content;
- `controller.html` — general controller;
- `controller-tablet.html` — primary tablet controller;
- `controller-mobile.html` — phone controller;
- `controller-now-playing.html` and `controller-now-playing-tablet.html`;
- kiosk surfaces; and
- device-alias pages.

The iPad/iPhone-specific pages are mostly redirect shims. This is functional, but it creates unnecessary indirection for installed-app start URLs.

**Assessment:** implemented well, but fragmented. The main opportunity is consolidating shared runtime behavior instead of repeating standalone, orientation, refresh, and profile logic across pages.

### Safari versus installed Home Screen operation

The controllers detect standalone mode using:

- `matchMedia('(display-mode: standalone)')`; and
- legacy `navigator.standalone`.

This currently affects navigation behavior, particularly whether album links open inside the app or in a new browser window.

**Assessment:** implemented, but should be centralized and expanded to recognize `standalone`, `fullscreen`, `minimal-ui`, normal browser mode, and legacy iOS standalone mode. It should be used consistently for display-specific behavior, not only link opening.

### Manifest and icons

The project has multiple manifests, including:

- `manifest.webmanifest`;
- `manifest-controller.webmanifest`;
- `manifest-controller-tablet.webmanifest`; and
- mobile/iPhone variants.

It also has:

- `icons/apple-touch-icon-180.png`;
- 192px and 512px icons;
- a 512px maskable icon; and
- favicon sizes.

The manifests now have explicit stable IDs/scopes, and the iPad/tablet and iPhone/mobile launch paths point directly to their implementation pages. Tablet/iPad intentionally share the `/controller-ipad` identity. The installed surfaces now use separate icon families rather than the original shared icon set.

**Assessment:** implemented. Existing installed apps may need to be removed and re-added for iPadOS to refresh cached manifest/icon presentation.

The current policy is:

- keep stable IDs and scopes;
- keep `apple-touch-icon` links because iPadOS uses them for Home Screen presentation;
- use the mode-specific PNG assets in both manifests and active page heads; and
- leave the small browser favicon set shared unless browser-tab differentiation becomes a separate requirement.

### Viewport and safe areas

The primary pages use `width=device-width`, `initial-scale=1`, and `viewport-fit=cover`. They apply `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to page padding.

**Assessment:** implemented well on the primary surfaces. A secondary audit should confirm that all settings, kiosk, and redirect destinations use the same safe-area policy. The app shell also has special iframe sizing behavior for iOS standalone/orientation changes.

### Storage

Current storage includes `localStorage`, `sessionStorage`, and cookies. There is no IndexedDB or Storage API persistence handling.

Stored values include themes, device profiles, layout preferences, queue settings, debug flags, and display options.

The controller profile API stores one shared server-side profile rather than a per-device profile.

A significant concern is that the configuration UI stores sensitive values in `localStorage`, including values under keys such as:

```text
nowplaying.secret.lastfmApiKey
nowplaying.secret.pushoverToken
nowplaying.secret.pushoverUser
nowplaying.secret.trackKey
```

**Assessment:** implemented and improved. `scripts/client-preferences.js` provides a versioned origin-local settings object and local installation identifier for client preferences. The shared server profile remains distinct from per-device settings. Credential cleanup is still outstanding: secrets should not be kept in persistent browser storage.

### Service workers and caching

There is currently no service worker registration, Cache API usage, application-shell cache, or IndexedDB cache.

Live API requests generally use `cache: 'no-store'`, and versioned script query parameters are used for static cache busting.

**Assessment:** not implemented; potentially useful, but not urgent. This is a reasonable current design for a live controller because it avoids accidentally serving stale queue or playback state.

### Play on Device and audio

`scripts/web-stream.js` intentionally:

- creates one `<audio>` element per document;
- uses `playsinline`;
- assigns the MPD HTTP stream directly;
- calls `audio.play()` immediately inside the user click handler;
- performs no asynchronous work before `play()`; and
- clears the source when stopped.

The current stream is:

```text
http://10.0.0.254:8000
```

The shared stream script now adds MediaSession metadata after playback starts when current-track state is available. The audio element remains persistent for the lifetime of its document, but a full reload creates a new element and does not automatically restore playback.

**Assessment:** implemented well and should be protected. This is the most regression-sensitive part of the application. The HTTP stream and HTTPS UI relationship may be worth investigating separately, but changing it now could break a working local playback path.

### MediaSession

`scripts/web-stream.js` now uses `navigator.mediaSession.metadata` and `MediaMetadata` when supported. It uses Now-Playing’s current-track state for title, artist, album, and artwork, and clears metadata when local playback stops or errors. No MediaSession action handlers are registered; iOS seek buttons are therefore left to the platform and are not treated as useful controls for the continuous web stream.

**Assessment:** metadata-only support implemented additively. The immediate user-gesture `audio.play()` path remains unchanged, and metadata/artwork work is never a prerequisite for starting playback.

### Wake Lock

The tablet Settings pane now exposes an opt-in **Keep display awake** preference. The controller acquires and releases Screen Wake Lock around visibility, focus, pageshow, and orientation transitions when the API is available. The live HTTP deployment disables the setting because Screen Wake Lock requires a secure context.

**Assessment:** implemented with graceful secure-context/unsupported-browser handling.

### Orientation

Orientation is handled using CSS media queries, body classes, `orientationchange`, and delayed rerender/refresh calls. The project does not use `screen.orientation.lock()`.

**Assessment:** implemented adequately. Explicit orientation locking is probably unnecessary and could create more device-specific behavior.

### Live data and reconnect behavior

The browser uses ordinary polling:

- tablet Now Playing refreshes approximately every 3.5 seconds;
- `app.html` has hero/queue refresh intervals;
- other pages use their own intervals;
- fetch requests use no-store behavior; and
- `visibilitychange` and `pageshow` trigger refreshes.

No browser `EventSource`, browser WebSocket, or SSE connection was found.

There is little explicit handling for `online`/`offline`, exponential backoff, connection status, stale response ordering, or centralized polling coordination.

**Assessment:** implemented, but could be improved. The current behavior is functional and appropriately network-first. A small shared lifecycle/polling helper would make resume and reconnect behavior more consistent.

## 2. Apple/WebKit findings

### Add to Home Screen and installability

Safari 26 changed the model significantly:

- websites added to the Home Screen open as web apps by default;
- users can disable “Open as Web App”; and
- a manifest is no longer required for installability.

The manifest remains valuable for name, icons, identity, start URL, scope, display mode, and theme/background colors.

Source: [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

### `display: standalone`

`standalone` remains useful because it controls app-like window presentation, but it is no longer what makes installation possible.

Now-Playing should continue using `standalone`. `fullscreen` is not recommended as the default because it complicates status-bar, safe-area, navigation, and recovery behavior.

### Manifest identity

Manifest `id` support originated with iOS/iPadOS 16.4-era web app support. Stable IDs matter for distinguishing installed web apps and managing their identity.

Now-Playing should give each intentional app surface a deliberate identity rather than relying on implicit URL identity or redirect aliases.

Source: [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

### Storage isolation and persistence

Home Screen web apps operate as separate app contexts from ordinary Safari browsing in important lifecycle and tracking respects. Storage remains origin-scoped and should not be treated as a cross-device synchronization mechanism.

Storage can still be evicted under system pressure. Now-Playing’s small preference set does not justify IndexedDB or persistent-storage complexity yet.

Source: [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

### Service Worker Static Routing

Safari 27 adds Service Worker Static Routing. It allows routing rules to bypass the service worker for selected requests, reducing service-worker overhead.

Source: [WebKit features in Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)

This should be feature-detected and have a normal fallback for older Safari and other browsers.

### Screen Wake Lock

Screen Wake Lock has been available since Safari 16.4-era WebKit support. It can prevent the display from dimming or locking while the page is visible, but it:

- requires a secure context;
- may be rejected or released by the system;
- should be reacquired after visibility changes;
- does not keep JavaScript, polling, or audio alive while backgrounded; and
- consumes battery and may increase heat.

Source: [WebKit features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)

### Screen Orientation API

The API supports orientation type, angle, and change notifications. Explicit locking is less attractive for this project than the current CSS/layout approach.

Source: [Screen Orientation specification](https://www.w3.org/TR/screen-orientation/)

### MediaSession

MediaSession is available on current Safari/WebKit. Safari 27 includes fixes around `setActionHandler`, artwork size parsing, Media Session URL handling, and media behavior while backgrounded.

Source: [WebKit features in Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)

Safari 18.2 also added fallback artwork behavior when sites do not provide MediaSession artwork.

Source: [WebKit features in Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)

### Audio and Home Screen lifecycle

Safari 26.2 fixed an issue where an audio element could fail to play after reopening a Home Screen web app.

Source: [WebKit features in Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)

The existing direct `audio.play()` path is still the right pattern. Background execution and automatic playback after suspension remain subject to iOS lifecycle and user-gesture rules.

### Web Push and Badging

Home Screen web apps can use Push API, Notifications, Service Workers, and the Badging API. Permissions require user interaction, and badging is primarily meaningful for notification-enabled Home Screen apps.

Sources:

- [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Badging for Home Screen Web Apps](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)

These are not currently valuable enough for Now-Playing to justify the infrastructure.

## 3. Capability evaluation

| Capability | Current status | Classification |
|---|---|---|
| iPhone/iPad layouts | Dedicated tablet, mobile, and kiosk surfaces | Implemented well |
| Safari vs standalone detection | Present in several controllers | Implemented, improve centralization |
| Manifest | Multiple manifests, standalone display | Implemented, improve IDs/start URLs |
| Icons | Apple touch icon, PNG, maskable icon | Implemented well |
| Safe areas | Good on primary pages | Implemented well |
| Local preferences | Versioned `nowplaying.clientSettings.v1` store with legacy migration | Implemented |
| Per-device settings | Local `clientId` and display-specific settings | Implemented |
| Cookies/session storage | Used for limited preferences | Implemented, adequate |
| IndexedDB | None | Probably unnecessary |
| Service worker | None | Potentially useful, defer |
| Live API caching | Mostly no-store/network-first | Implemented well |
| Queue/artwork caching | Intentionally live | Implemented well |
| Play on Device | Gesture-safe persistent audio element | Implemented well; protect |
| MediaSession | Metadata-only title/artist/album/artwork; no action handlers | Implemented, additive |
| Screen Wake Lock | Opt-in tablet Settings preference; secure-context gated | Implemented |
| Orientation handling | CSS and orientation events | Implemented well enough |
| Orientation locking | None | Probably unnecessary |
| Reconnect handling | Polling/pageshow/visibility refresh | Implemented, improve |
| Web Push | None | Probably not worth it |
| Badging | None | Probably not worth it |
| Standalone navigation | Partial handling | Implemented, improve |
| Offline app shell | None | Optional, defer |

## 4. Recommendations

### Low-risk / high-value

#### 1. Clean up manifest identity — implemented

Manifests now include stable `id`, explicit `scope`, and direct implementation `start_url` values. iPad and tablet remain intentionally unified under `/controller-ipad`; the compatibility aliases are no longer in the launch path.

The stable IDs should not be casually changed because identity changes can create duplicate Home Screen apps.

#### 2. Add a shared runtime-surface helper

Create one small helper for standalone detection, browser versus installed-app mode, safe feature detection, and optional display-mode diagnostics.

#### 3. Add opt-in Screen Wake Lock — implemented

The tablet Settings pane now provides **Keep display awake**. It is stored locally, acquired only while visible, released while hidden, reacquired on resume, and disabled with an explanation when the page is not in a secure context.

The implementation preserves the original recommendation:

- expose a “Keep display awake” preference;
- default it on only for dedicated display/kiosk profiles;
- acquire while visible;
- release while hidden;
- reacquire on `pageshow` and visibility resume; and
- gracefully degrade when unsupported or rejected.

#### 4. Add MediaSession metadata without touching startup — implemented

The metadata-only experiment is now implemented for Play on Device:

1. Keep the current tap handler exactly as-is.
2. Assign `audio.src`.
3. Call `audio.play()` immediately.
4. After playback succeeds, set MediaSession metadata.
5. Update metadata when the current track changes.
6. Do not register action handlers yet; seek controls are not useful for the continuous stream.
7. Clear metadata when local playback stops.

Do not fetch metadata before calling `play()`. Do not make artwork or API availability a prerequisite for playback.

#### 5. Formalize per-installed-client preferences — implemented

`scripts/client-preferences.js` now provides a versioned local settings object for controller/layout preset, playback/output preferences, display mode, theme-related app settings, Wake Lock, and the last library page.

It generates a local installation/client ID and keeps it local; server synchronization remains intentionally out of scope.

#### 6. Improve lifecycle/reconnect behavior

Add a shared lifecycle layer that refreshes on `pageshow`, refreshes when returning to visibility, reacts to `online`/`offline`, uses modest backoff when the API is unavailable, prevents stale responses from overwriting newer state, and shows a subtle disconnected/stale indicator.

#### 7. Remove secrets from localStorage

The `nowplaying.secret.*` values should not be persisted in localStorage. Prefer server-side configuration, session-only memory, or a deliberate secure credential workflow.

### Optional enhancements

#### Conservative service worker

A service worker could cache only the static application shell:

- HTML shell;
- CSS;
- JavaScript;
- manifests;
- icons; and
- static UI assets.

Recommended routing:

| Request type | Service-worker behavior |
|---|---|
| App shell | Network-first, cached fallback |
| Versioned JS/CSS | Cache-first with explicit revisioning |
| Now-Playing API | Network-only |
| Queue API | Network-only |
| Control commands | Network-only |
| Alexa endpoints | Network-only |
| Dynamic artwork | Network-first or pass-through |
| MPD stream | Never cache |
| SSE/WebSocket | Pass-through |

Safari 27 static routing could bypass the service worker for live routes, but the design must also work on older Safari.

A service worker is origin-scoped, including port. A page on one port cannot intercept API traffic sent to another port or to `10.0.0.254`.

#### Persistent storage request

Not currently necessary. The preference footprint is small. Revisit only if adding substantial offline assets or local history.

#### Web Push or Badging

Potential future uses include queue attention, requested-track completion, or maintenance alerts. They are not recommended for the current household controller.

### Probably not worth it

- full offline Now-Playing mode;
- caching live queue or playback data;
- caching MPD audio;
- automatic audio resume after iOS suspension;
- fullscreen as the default display mode;
- aggressive orientation locking;
- rewriting the audio path using Web Audio or MediaSource;
- native wrapper development solely to improve the current controller;
- push notifications merely to show current playback; and
- service-worker interception of control commands.

## 5. Play-on-Device protection rules

Any implementation must preserve these invariants:

- keep one persistent audio element per document;
- keep direct stream assignment;
- keep `audio.play()` inside the immediate user gesture;
- do not await API metadata before starting playback;
- do not move stream startup behind a service worker;
- do not assume a page resume can automatically restart audio; and
- treat audio failure after backgrounding as a recovery state requiring another gesture if necessary.

MediaSession should be additive only.

## 6. Files likely involved

### Manifest and app presentation

- `manifest.webmanifest`;
- `manifest-controller.webmanifest`;
- `manifest-controller-tablet.webmanifest`;
- `manifest-controller-mobile.webmanifest`;
- `app.html`;
- `controller.html`;
- `controller-tablet.html`; and
- `controller-mobile.html`.

### Shared runtime behavior

Potential new shared scripts:

- `scripts/runtime-surface.js`;
- `scripts/screen-wake-lock.js`; and
- `scripts/live-lifecycle.js`.

### Audio and MediaSession

- `scripts/web-stream.js`.

### Preferences

- controller profile code;
- `config.html`;
- existing theme/profile helpers; and
- `src/routes/config.controller-profile.routes.mjs`, only if server-side per-device profiles are eventually desired.

### Future service worker

- `sw.js`;
- registration in the top-level app/controller shells; and
- deployment/cache-versioning configuration.

## 7. Suggested implementation order

### Historical implementation plan

The following phase list is retained as the original sequencing context. Completed items are recorded in Sections 10–15; the remaining work is lifecycle/reconnect hardening and credential-storage cleanup.

### Phase 1 — Manifest and runtime polish

- add stable manifest IDs and scopes;
- point starts at direct implementation pages;
- consolidate standalone detection;
- audit all primary safe-area handling; and
- leave audio untouched.

### Phase 2 — Dedicated-display behavior

- add local “Keep display awake” preference;
- implement visible-only Wake Lock acquisition;
- add resume/reconnect handling; and
- test portrait, landscape, Safari tab, and installed Home Screen app.

### Phase 3 — MediaSession

- add metadata after successful Play on Device startup;
- add play/pause/stop handlers;
- test lock screen, Control Center, backgrounding, reopening, and stream failure; and
- confirm Alexa playback does not get mislabeled as local playback.

### Phase 4 — Preferences cleanup

- introduce a versioned per-install settings object;
- migrate existing layout/theme preferences;
- remove persistent secret storage; and
- decide whether any settings should synchronize server-side.

### Phase 5 — Optional service worker

Proceed only if startup/offline resilience is a demonstrated need. Cache the static shell only, keep all live/control/audio paths network-only, add revisioned cache management, and use Safari 27 static routing progressively.

## Recommendation

The manifest, installed-app presentation, Wake Lock, MediaSession metadata, preference storage, and icon-family work are complete. The next useful work is lifecycle/reconnect hardening and removal of persistent credential values from browser storage.

Continue to defer the service worker until there is a concrete startup/offline problem to solve; live queue, control, and MPD traffic should remain network-only.

## 8. Additional investigation: dark upper-edge vignette in the installed tablet app

### Question investigated

`controller-tablet.html` appears sharp in an ordinary Safari tab, but the same page launched from the Home Screen shows a dark vignette/gradient at the upper edge. The vignette darkens the first controller row containing Next Up, Listen on Device, Start on Alexa, and Audio Info.

This was investigated without changing the page or the running instance.

### Source audit

The relevant tablet page currently contains:

```html
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#000000" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

The tablet manifest uses:

```json
{
  "id": "/controller-ipad",
  "start_url": "/controller-ipad.html?devicePreset=ipadpro11-landscape",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0c1526",
  "theme_color": "#0c1526"
}
```

The page’s CSS currently has these relevant characteristics:

- `body` has `background: var(--surface)` with an initial dark surface color;
- `html` has no general explicit background declaration outside the kiosk profile;
- the tablet top-card backgrounds use `color-mix()` with the surface and line colors, not a top-edge gradient;
- the general body safe-area padding is later overridden for tablet profiles by `padding: 10px 12px 14px`;
- landscape tablet mode later uses `padding-top: max(28px, env(safe-area-inset-top))`; and
- the page has no standalone-specific CSS that adds a top gradient or vignette.

The tablet page does not load `scripts/index.js`, so it does not receive the shared `.standalone` document class. Its standalone detection is used for navigation behavior only. No standalone-only style rule was found for the affected row.

### Finding

The most likely source is the installed web app’s native status-bar/edge presentation, amplified by a few color and background inconsistencies in the current implementation.

Confidence:

- **High** that the effect is in the installed-app/status-bar presentation rather than a page-level gradient specifically attached to the controller row.
- **Moderate** that the primary trigger is the combination of `black-translucent`, `viewport-fit=cover`, and standalone presentation.
- **Moderate** that the color mismatch between the manifest, HTML theme color, and CSS surface makes the effect more visible.

The ordinary Safari comparison is strong evidence: the same page CSS and row backgrounds render cleanly when Safari owns the browser chrome, while the installed app has a native app/status-bar layer that Safari tabs do not show.

Apple’s archived WebKit meta-tag documentation describes `black-translucent` as making web content occupy the entire screen while being partially obscured by the status bar. That is exactly the mode in which a system status-bar scrim or contrast gradient can overlap the upper content.

Source: [Apple Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)

Safari 27’s public WebKit release notes do not document a new CSS property or manifest member that disables an installed-web-app status-bar contrast treatment. They also do not identify this effect as a web-content gradient. The current iPadOS visual system continues to emphasize Liquid Glass readability and contrast, but the exact status-bar compositing is OS/WebKit-owned rather than exposed as a web setting.

Sources:

- [WebKit features in Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)
- [Apple iPadOS](https://www.apple.com/os/ipados/)

### What each current setting is doing

| Setting | Effect on this issue |
|---|---|
| `viewport-fit=cover` | Allows the page to use the full display and exposes safe-area insets. It does not itself draw a gradient. |
| `env(safe-area-inset-top)` | Provides an inset measurement. It does not draw a gradient. The tablet rules override the generic padding and then use a 28px minimum in landscape. |
| `theme-color` in HTML | Supplies a suggested browser/app chrome color. It is currently `#000000`, unlike the manifest and CSS surface colors. |
| `background_color` in manifest | Used for installed-app launch/background treatment. It is currently `#0c1526`. |
| `theme_color` in manifest | Provides installed-app theme/chrome color. It is currently `#0c1526`. |
| `black-translucent` | Requests translucent black status-bar treatment and allows content beneath/behind the status-bar region. This is the strongest app-controlled candidate. |
| `display: standalone` | Causes Home Screen launch to use the app-like presentation where the native status-bar treatment applies. |
| `html`/`body` backgrounds | The body is dark, but the root does not explicitly paint the same background. This can amplify a transition at the upper edge. |
| Tablet top-row CSS | Contains borders and `color-mix()` backgrounds, but no global upper-edge vignette. |

### Can it be disabled?

There is no documented Safari 27 web API to disable a native installed-app edge/status-bar contrast layer.

The practical controls are:

1. Change `black-translucent` to `black` or `default`. Apple’s documented behavior places content below the status bar in those modes, so this may remove the overlap/gradient but will produce an opaque status-bar band and change vertical geometry.
2. Remove the legacy status-bar-style tag and test the modern standalone behavior. This is not guaranteed to be visually equivalent across iPadOS versions.
3. Stop using standalone presentation. This would recover Safari-like browser rendering but gives up the installed-web-app experience and is not recommended.

Changing `theme-color` alone should not be expected to disable the native effect. It may change its tint or the color sampled by the system.

### Can the page reduce it by painting beneath the safe area?

Probably, but this would reduce or blend the effect rather than remove the native compositing.

The current implementation has three different dark colors in play:

- HTML `theme-color`: `#000000`;
- manifest `theme_color`/`background_color`: `#0c1526`; and
- initial CSS `--surface`: `#0b111c`.

The first low-risk rendering adjustment to test would be to make the document root, body, installed-app theme color, and top-row surface use one coherent color. In particular:

```css
html,
body {
  background-color: var(--surface);
}
```

That will not defeat a system scrim, but it can prevent the system from darkening a visually different or transparent layer at the top of the document.

If the vignette still visibly crosses the row, the next least-invasive option is to increase the top inset so the first row begins below the affected native overlay. That preserves the installed app but changes available vertical space.

### Can installed-app rendering exactly match Safari?

Probably not in every iPadOS version while retaining `black-translucent` edge-to-edge behavior. Safari owns its browser chrome differently from a Home Screen app, so the two modes can have different native compositing even when the document is identical.

The likely best compromise is:

- keep `display: standalone`;
- keep `viewport-fit=cover`;
- align all background/theme colors;
- ensure the safe-area region is painted with the same surface color; and
- place the first actionable row outside the strongest native overlay if necessary.

If exact sharpness is more important than edge-to-edge presentation, `black` or `default` status-bar treatment is the experiment most likely to achieve it, at the cost of an opaque status-bar region and a changed top offset.

### Would manifest cleanup change this?

The previously recommended manifest cleanup should not materially change this behavior if it preserves:

- `display: standalone`;
- the same status-bar meta tags;
- the same viewport policy; and
- the same general theme/background colors.

Adding stable `id`, adding explicit `scope`, and changing a redirect `start_url` to the real tablet implementation should affect identity and navigation, not the status-bar gradient.

Changing `theme_color` or `background_color` can change launch/chrome tint and therefore should be tested separately. Changing `display` or removing standalone behavior would directly change the presentation and must not be bundled into ordinary manifest cleanup.

### Minimal controlled experiment

Do this on a temporary test copy or through Web Inspector/local overrides, not directly in the production source:

#### Baseline A — current behavior

Record a screenshot in Safari and in the installed app with:

- `viewport-fit=cover`;
- `theme-color: #000000`;
- `black-translucent`;
- manifest `theme_color/background_color: #0c1526`; and
- CSS surface `#0b111c`.

#### Experiment B — status-bar style only

Change only:

```html
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
```

Keep standalone, manifest, viewport, and CSS unchanged.

Interpretation:

- gradient replaced by uniform black band: native translucent status-bar layer confirmed;
- row moves down and becomes sharp: same conclusion, with the cost of changed geometry;
- no meaningful change: investigate theme/background mismatch next.

#### Experiment C — root/background alignment only

Keep `black-translucent`, but temporarily align:

- `html` background;
- `body` background;
- HTML `theme-color`; and
- manifest theme/background colors.

Use one sampled surface color, such as the active controller surface. If the gradient remains but becomes visually uniform, the system layer is confirmed and background alignment is the useful mitigation.

#### Experiment D — viewport-fit isolation

As a diagnostic only, temporarily remove `viewport-fit=cover` while leaving the status-bar tag unchanged. If the effect disappears but the page moves below the status bar, the interaction is specifically the edge-to-edge/translucent configuration. This is not proposed as the final fix without checking the resulting tablet layout.

Because the manifest is cached by the installed app, manifest experiments may require a full app quit, cache refresh, or removing and re-adding the test Home Screen app. The A/B comparison should use the same iPad orientation, theme, content, and app-launch path.

### Interim recommendation

Do not change the tablet source yet. First run Experiment B and Experiment C.

The most likely safe eventual fix is coherent root/body/theme-color painting while retaining standalone mode. If that does not make the first row sharp enough, choose explicitly between:

- preserving edge-to-edge standalone mode with a small top inset/visual compromise; or
- using opaque/default status-bar treatment for a sharper row and accepting the status-bar band.

## 9. Controlled A/B test execution status before physical A1 test — 2026-09-22

This section records the state before the physical A1 test and is superseded by the confirmed result in Section 10.

### A0 — Current baseline verified

The current source values are:

| Item | Current value |
|---|---|
| Status-bar style | `black-translucent` |
| Viewport | `width=device-width,initial-scale=1,viewport-fit=cover` |
| HTML theme color | `#000000` |
| Initial CSS `--surface` | `#0b111c` |
| Initial CSS `--bg` | `#070b13` |
| Body background | `var(--surface)`; runtime theme code can replace `--surface` |
| Root background | No general `html` background; only the kiosk selector sets one |
| Manifest `theme_color` | `#0c1526` |
| Manifest `background_color` | `#0c1526` |
| Manifest display | `standalone` |
| Manifest viewport safe area | `viewport-fit=cover` |
| Generic body top padding | `max(10px, env(safe-area-inset-top))` |
| Tablet body top padding | Overridden to `10px 12px 14px` |
| Landscape tablet top padding | `max(28px, env(safe-area-inset-top))` |
| Top-row backgrounds | `color-mix()` surface/line colors; no global vignette |
| Standalone-only CSS | None found in `controller-tablet.html` |

The tablet page contains no CSS gradient or pseudo-element that targets the upper edge or the affected Next Up/action row. Other gradients exist for album-art overlays and controls, but they are scoped to those components. The page does not load `scripts/index.js`, and its standalone detection is used for navigation rather than presentation CSS.

### Visual-test environment limitation

An iPad node is paired with the workspace, but it is currently disconnected and marked `pending-reapproval`. Its last reported platform is iPadOS 26.7.0, not iPadOS 27. A `screen_snapshot` request failed with `node not connected`.

Therefore the following visual results were **not** claimed:

- Safari baseline screenshot;
- installed Home Screen baseline screenshot;
- A1, B1, or C1 visual comparison;
- safe-area/geometry measurement on the physical iPad; or
- portrait/landscape comparison.

No temporary source variant was staged on the live controller because there is no connected target from which to observe the result. The running implementation remains unchanged.

### Planned test matrix

| Configuration | Status-bar style | Viewport | Backgrounds aligned | Safari result | Installed-app result | Geometry changed? |
|---|---|---|---|---|---|---|
| A0 | `black-translucent` | `cover` | No | Not measured in this session | Not measured; node unavailable | Not measured |
| A1 | `black` | `cover` | No | Not run | Not run | Not measured |
| B1 | `black-translucent` | `cover` | Yes | Not run | Not run | Not measured |
| C1 | `black` | `cover` | Yes | Not run | Not run | Not measured |
| D1 | Best prior value | No `cover` | Best prior value | Not run | Not run | Not measured |

### What can already be concluded

The source audit establishes that the page itself is not drawing the reported upper-edge vignette. The strongest application-controlled variable remains `black-translucent`; the current color mismatch is a plausible amplifier, not yet a proven cause.

At the time of this pre-test entry there was no winning configuration yet. The physical A1 test and result are recorded below.

## 10. A1 result — confirmed by physical iPad test — 2026-09-22

The A1 experiment was staged with exactly one application change:

```html
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
```

All other tested variables remained unchanged, including `viewport-fit=cover`, page geometry, safe-area handling, manifest values, and controller backgrounds. The change was made in `controller-tablet.html` and later committed as the permanent production change in commit `d1b86af`.

### Observed result

- Force-quitting and relaunching the existing Home Screen app did **not** change its presentation.
- Opening the controller in Safari and saving that page as a new Home Screen web app produced an excellent sharp presentation with no top-edge vignette clouding the first controller row.
- The reported visual improvement was observed on the physical iPad; no screenshot was captured by the remote workspace tooling.

### Interpretation

The result strongly identifies the status-bar treatment as the controlling variable for the vignette. The effect is generated by the installed-web-app presentation layer associated with `black-translucent`, rather than by a CSS gradient or standalone-only page styling. The existing app retained its prior presentation state, so force-quit/relaunch was insufficient; removing and re-adding the Home Screen app was required to test the new status-bar configuration reliably.

The earlier A0/A1 matrix should therefore be read as:

| Configuration | Status-bar style | Viewport | Backgrounds aligned | Safari result | Installed-app result | Geometry changed? |
|---|---|---|---|---|---|---|
| A0 | `black-translucent` | `cover` | No | Clean | Vignette present | No measured layout change |
| A1 | `black` | `cover` | No | Clean | Sharp; vignette absent in newly created app | No reported meaningful regression |

No B1, C1, or D1 test was needed to establish the smallest effective production change. The background-alignment and `viewport-fit` experiments remain optional follow-up diagnostics, not prerequisites for the fix.

## 11. Screen Wake Lock implementation — 2026-09-22

The next recommended improvement was implemented and deployed as a local device preference:

- The existing Settings pane (`controller-tablet-settings.html`, opened from the Settings row in `controller-tablet.html`) now contains **Keep display awake**.
- The preference is stored in the versioned origin-local `nowplaying.clientSettings.v1` object under `wakeLock`; it is not added to the shared server profile because it is display-specific.
- `controller-tablet.html` owns the Screen Wake Lock lifecycle and releases/reacquires it across hidden/visible, focus, pageshow, and orientation transitions.
- Audio, Play on Device, manifests, and controller geometry were not changed.

The live Now-Playing controller is currently served over `http://10.0.0.4:8101`. Screen Wake Lock is a secure-context API, so the setting is visibly disabled on that HTTP origin with an explanation. The implementation will activate when the controller is served over HTTPS on a browser that supports `navigator.wakeLock.request('screen')`.

## 12. Preference storage cleanup — 2026-09-22

The controller-facing preferences were consolidated into the new shared client-local helper:

- `scripts/client-preferences.js`
- storage key: `nowplaying.clientSettings.v1`
- local installation identifier: `clientId`
- controller profile: `controllerProfile`
- display/player/output placeholders for future local-only preferences
- `wakeLock`
- `lastLibraryPage`

The helper performs a one-time migration from the existing `nowplaying.mobile.profile.v1/v2`, `nowplaying.keepDisplayAwake.v1`, `np.controller.lastLibraryPage.v1/v2`, `np.screenMode`, and `np.peppyMode` values. Existing legacy keys are retained as a rollback/cached-client compatibility fallback, but the current controller pages no longer write those preference keys when the helper is available.

Updated consumers:

- `controller.html`
- `controller-tablet.html`
- `controller-mobile.html`
- `controller-tablet-settings.html`
- `app.html`

`app.html` now routes its shell preferences through the same store: display/player mode, theme mode, theme tokens and presets, active theme preset, Peppy skin/theme, player size, queue collapse, arrow-key preference, and queue rating filter. The old theme keys are mirrored only to keep the embedded `theme.html` editor and older cached pages compatible.

Recent-album data remains in its existing cache keys because it is transient content cache rather than an installed-client preference. Credential cleanup remains a separate follow-up under recommendation 7; this change does not move or expose server configuration secrets.

The helper and inline controller scripts passed syntax checks on the live Node 20 runtime, and the updated pages were served and verified from the live UI host. The implementation was included in commit `1939161` (`Add client preference storage and media metadata`) and pushed to `main`.

## 13. Manifest cleanup — 2026-09-22

Manifest identity and start routing were cleaned up without changing existing installed-app identities:

- Added `id: "/app"` and `scope: "/"` to `manifest.webmanifest`.
- Kept the existing stable controller IDs and explicit root scopes.
- Kept iPad and tablet intentionally unified under the existing `/controller-ipad` identity.
- Changed the iPad and iPhone manifest `start_url` values to point directly to `controller-tablet.html` and `controller-mobile.html`; the compatibility redirect pages are no longer in the installed-app launch path.
- Updated the generic controller shortcut to point directly to the tablet implementation.
- Bumped manifest query versions on the active app/controller shells so the revised manifests are fetched.

All six manifests parse as valid JSON. Live verification confirmed the expected IDs, scopes, direct implementation start URLs, and updated manifest references. No display mode, status-bar style, viewport, or controller geometry was changed.

## 14. MediaSession metadata-only implementation — 2026-09-22

The experimental metadata-only MediaSession support was implemented and deployed without changing the continuous MPD webstream path.

### Preserved audio invariants

- one persistent `<audio>` element per document;
- direct assignment of `http://10.0.0.254:8000`;
- immediate user-gesture `audio.play()` startup; and
- no asynchronous metadata or artwork work before `audio.play()`.

### Metadata behavior

When supported, `scripts/web-stream.js` now uses the current Now-Playing state—not metadata extracted from the HTTP stream—to populate:

- title;
- artist;
- album; and
- current album artwork.

`controller.html` and `controller-tablet.html` dispatch `np-current-track-change` events when their current-track state changes. The shared stream script updates `navigator.mediaSession.metadata` only while Listen on Device is active, and clears it on stop or audio error.

No MediaSession action handlers were added. In particular, seek-backward and seek-forward controls were not made into fake handlers because they do not map meaningfully to a continuous live stream. The implementation was included in commit `1939161` and verified on the live UI host.

## 15. Distinct installed-app icon families — 2026-09-22

The installed web-app surfaces now have distinct, related icon treatments instead of all pointing at the same shared icon files:

| Surface | Icon family | Visual marker |
|---|---|---|
| `app.html` | `icons/app-*` | blue/gold dashboard with play marker |
| `controller.html` | `icons/controller-*` | teal controller/sliders marker |
| `controller-tablet.html` | `icons/controller-tablet-*` | indigo tablet marker |
| `controller-mobile.html` | `icons/controller-mobile-*` | magenta phone marker |

Each family includes 180px Apple touch icons, 192px/512px manifest icons, and a 512px maskable icon. The matching manifest entries and active page icon links were updated. The iPad/tablet aliases intentionally share the tablet family because they share the `/controller-ipad` installed-app identity; the mobile/iPhone compatibility paths use the mobile family.

The small 16px/32px/48px browser favicon set remains shared. The Home Screen identity assets are the mode-specific Apple touch and manifest icons.

The files were committed as `4eb804b` (`Add distinct installed app icons`), pushed to `main`, deployed to `10.0.0.4`, and verified through the live HTTP server. Existing Home Screen apps may need to be removed and re-added before iPadOS refreshes cached icons.
