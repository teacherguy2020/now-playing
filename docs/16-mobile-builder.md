# Mobile Builder + Controller Pages

This chapter documents the mobile-first controller stack and the visual builder workflow.

## What this covers

- `mobile.html` — builder UI used to configure preview profile options.
- `controller.html` — mobile home surface.
- Controller-native pages:
  - `controller-now-playing.html`
  - `controller-queue.html`
  - `controller-albums.html`
  - `controller-artists.html`
  - `controller-genres.html`
  - `controller-playlists.html`
  - `controller-radio.html`
  - `controller-podcasts.html`
  - `controller-queue-wizard.html`

## Builder profile model

`mobile.html` writes a profile payload to localStorage and passes it to `controller.html` via query param `profile`.

Current profile controls include:

- Device preset
- Theme mode
- Layout mode
- Show/hide recent rail
- Recent card count
- Color preset (dot palette)

## Color presets

Color dots in `mobile.html` now drive controller visual tokens (icon accent and core backgrounds/lines) via `profile.colorPreset`.

## Screenshots

### Mobile Builder

![Mobile Builder](./images/mobile-builder/builder.jpeg)

### Controller Now Playing / Mobile Surface

![Controller Now Playing](./images/mobile-builder/now-playing.png)

## Notes

- Quick Search interactions in `controller.html` include instant actions (play/add) for artist/album/playlist.
- Recently Added rail is sourced from album inventory and sorted newest → oldest.
- `controller-now-playing.html` is currently based on portrait `index.html` behavior with controller-specific navigation transitions.

## See also

- [Controller Recents + Last.fm (Tablet)](./20-controller-recents-lastfm.md) for row-source customization, Last.fm modes, URL one-time seeding, and recents stability guardrails.
