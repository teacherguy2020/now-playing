# Now Playing art surface contract

This runbook records the shared artwork rules for every Now Playing display.
It exists because artwork fixes that were made in one surface previously did
not always reach the other surfaces. The controller was the most reliable
reference implementation; the `NPArt` browser helper now makes its resolution
rules reusable everywhere.

## The contract

The API payload is authoritative. A surface must not independently decide
whether `albumArtUrl`, `altArtUrl`, `stationLogoUrl`, or `displayArtUrl` wins.

`/scripts/now-playing-art.js` exposes `window.NPArt`:

```text
NPArt.source(payload)
  displayArtUrl -> albumArtUrl -> altArtUrl -> stationLogoUrl -> queue-head thumb

NPArt.foreground(payload)
  /art/current.jpg?v=<encoded source>

NPArt.background(payload)
  /art/current_bg_640_blur.jpg?v=<encoded source>
```

Podcasts give a queue-head thumbnail priority when one is present. Empty
source values use the unkeyed current-art route, allowing the backend's
last-good behavior to remain in charge.

The foreground and `bg_blur` paths must use the same logical source. Do not
build a foreground URL from one payload field and a blur URL from another.
This is especially important for radio: when an iTunes/Apple match is absent,
the station logo remains the visible and blurred fallback.

### Alexa exception

Alexa playback is intentionally not synchronized to the MPD queue. During
Alexa Mode, the active Echo track may already be playing while MPD still
reports the queue item that led to the Alexa handoff. Alexa-aware surfaces
must therefore keep using the Alexa-specific payload routes:

- `/alexa/now-playing` for the active Alexa track/art;
- `/alexa/next-up` for Alexa's immediate successor;
- the normal `/now-playing` and MPD queue routes only for ordinary playback
  and fallback state.

The page may then pass the Alexa payload through `NPArt.foreground()` and
`NPArt.background()`, but must not replace it with MPD queue art merely
because MPD is reporting a different current item. `scripts/index-ui.js`,
`scripts/hero-transport.js`, and the controller surfaces already preserve
this separation.

## Surface ownership

| Surface | Primary implementation | Shared-art requirement |
| --- | --- | --- |
| `index.html` | `scripts/index.js` + `scripts/index-ui.js` | Use `NPArt.foreground/background` for current art and blur. |
| `player-render.html` / `player.html` | Same index UI stack | Keep current art and blur on the same contract as `index.html`. |
| `app.html` | `scripts/hero-transport.js` plus app inline queue/hero code | Hero, Alexa fallback, and current queue-head fallbacks use `NPArt`. |
| `controller.html` | Inline controller logic | Current art, blur, Apple link, and motion use `NPArt`. |
| `controller-tablet.html` | Inline tablet logic | Same as controller; blur repaint includes the resolved source. |
| `controller-mobile.html` | Inline mobile logic | Current art and Apple link use `NPArt`. |
| `controller-kiosk.html` | Standalone kiosk controller | Current art uses `NPArt`. |
| `controller-now-playing*.html` | Embedded index UI/modal variants | Modal/current art uses `NPArt`; cache-busters must load the current helper. |
| `kiosk.html` | Redirect/wrapper | Verify the routed controller surface, not only the wrapper. |
| `kiosk-now-playing.html` | Redirect/wrapper | Verify the routed now-playing surface. |
| `peppy.html` | Peppy display logic | Current art, station fallback, Apple link, and motion use `NPArt`. |
| `display.html` | Profile-selected routing | Verify the concrete selected target as well as the route. |

Queue-history thumbnails may use their own item art. The rule above applies
to the current track, current hero, current modal, and all current blurred
backgrounds.

## Animated art

Animated art is a separate enhancement layered over the same resolved static
art:

- local tracks use
  `/config/library-health/animated-art/lookup?artist=&album=`; the Pi
  persists the album match and can serve a local H.264 copy from
  `data/animated-art-h264/`;
- radio tracks use the verified Apple/iTunes URL through the Pi-owned
  `/config/library-health/animated-art/radio-lookup?url=...` route; the Pi
  persists the resolved remote motion URL in `data/animated-art-cache.json`
  and asks `api.aritra.ovh` only on a cache miss. Radio video remains remote
  by default so transient radio tracks do not force Pi-side transcoding;
- podcasts, AirPlay, UPnP, and other stream-only items do not request local
  motion art;
- motion lookups are coalesced and cached on the Pi and in each browser, with
  a short retry window for transient misses;
- the browser preference is `nowplaying.ui.motionArtEnabled`.

If motion art is unavailable, the resolved static foreground and blur must
still render. A motion lookup must never replace the station-logo fallback or
leave the current art blank.

## Radio matching and fallback

The backend should only expose a radio Apple/iTunes link and matching art when
the lookup is verified. For an unmatched or non-music radio item:

1. keep the station logo in `stationLogoUrl`/`altArtUrl`;
2. use that logo through `NPArt.source()` for foreground and blur;
3. do not show an Apple Music action without a verified link;
4. allow motion lookup to fail independently without affecting static art.

This keeps radio, local tracks, and display surfaces on the same fallback
policy instead of repairing each page separately.

## Verification checklist

For any artwork change:

1. Inspect `/now-playing?debug=1` and confirm the art fields and stream kind.
2. Request both `/art/current.jpg` and `/art/current_bg_640_blur.jpg`.
3. Check a matched radio track and an unmatched radio track; the latter must
   show station art everywhere.
4. Check a local track with album art and, if available, animated art.
5. Check `index`, player, app, controller, tablet/mobile, kiosk, and Peppy
   surfaces—or the concrete target selected by `display.html`.
6. Switch radio stations while watching for stale art and stale blur.
7. Confirm that a missing motion match leaves static art intact.
8. Run syntax checks for shared scripts and parse inline scripts on changed
   pages before deployment.

Frontend-only changes normally do not require an API restart, but they must
be deployed to the Pi5 target and verified live. Keep the helper cache-buster
and the page-specific script cache-busters synchronized with the deployed
source.
