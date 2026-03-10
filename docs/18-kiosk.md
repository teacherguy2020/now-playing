# 18) Kiosk Mode

Kiosk mode is the 1280×400 control surface optimized for always-on display use.

---

## Pages and roles

- `kiosk-designer.html`
  - Design-time page with controls (theme, recents source, swatches, push)
  - Used for iteration and applying changes to moOde browser display
- `kiosk.html`
  - Runtime entrypoint for display use
  - Redirects into controller kiosk runtime with persisted profile
- `controller.html?kiosk=1`
  - Core kiosk runtime layout and interactions

---

## Layout model (1280×400)

Kiosk runtime uses 3 columns:

1. **Now Playing** (art + text)
2. **Library nav list** (Playlists, Artists, Albums, etc.)
3. **Recents / Internal pane**

Column 3 behavior:

- Default: recents rail (albums/podcasts/playlists/radio)
- On list selection: recents are hidden and an embedded internal page is shown in-place
- Internal page back/title sends a message to parent to hide pane and restore recents

---

## Internal page naming convention

Kiosk routes follow `kiosk-*.html` naming for parity with controller pages:

- `kiosk-now-playing.html`
- `kiosk-playlists.html`
- `kiosk-artists.html`
- `kiosk-albums.html`
- `kiosk-genres.html`
- `kiosk-podcasts.html`
- `kiosk-radio.html`
- `kiosk-queue-wizard.html`
- `kiosk-queue.html`

Current implementation uses thin wrappers to corresponding `controller-*.html` pages.

---

## Transport interactions in kiosk

Now Playing art gestures:

- **Single tap** → Player display mode push flow
- **Double tap** → Peppy display mode push flow

In Peppy/Player, tapping art routes back to kiosk runtime.

---

## Theme/palette persistence

Kiosk profile keys:

- `nowplaying.kiosk.profile.v1`
- `nowplaying.mobile.profile.v1`

`kiosk.html` syncs/uses these so runtime returns with the same applied theme/color/recents context.

Designer behavior:

- Control changes update preview
- Push to moOde acts as apply/commit point for persisted profile

---

## Embedded page theming

Embedded controller pages in kiosk pane resolve palette from:

1. URL params (`theme`, `colorPreset`)
2. Local persisted profile
3. Server profile fallback

This prevents color mismatch between kiosk surface and embedded internal pages.

---

## Kiosk-specific UI refinements

- Non-selectable runtime text (`user-select: none`)
- No extra wrapper chrome around runtime canvas
- Recents spacing tuned for 1280×400 readability
- Embedded albums/podcasts/radio support denser 4-across layout
- `kiosk-albums` excludes podcast entries
