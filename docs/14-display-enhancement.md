# moOde Display Enhancement (Peppy + Player)

This chapter documents the custom display flow hosted on the API/Web server (`:8101`) and pushed to moOde's Chromium target.

## Overview

When **moOde Display Enhancement** is enabled in `config.html`, the app exposes:

- `peppy.html` (custom peppy builder/view)
- `player.html` (builder)
- `player-render.html` (actual player renderer)
- `display.html` (stable router URL for moOde)

## Why this is different (builder-first display design)

This project does not treat meter skins and now-playing text as separate worlds.

The custom flow is intentionally **builder-first**:

- Build a single display composition that combines:
  - meter geometry (`circular` or `linear`)
  - meter skin + theme
  - typography (artist/title/album/metadata)
  - progress style and source behavior
- Push that composition to moOde through a stable router URL.
- Keep app-shell theme independent from peppy/player display theme.

In practice, this lets users design complete display experiences (not just switch meter art):

- classic or modern meter language
- dot-matrix vs modern font behavior
- linear/circular meter families
- metadata visibility choices per use case (local/radio/airplay/upnp/podcast)

The goal is creative control with predictable deployment: **design in-builder, push to moOde, render from one stable target URL**.

## Stable target URL

In moOde, go to:

- **Configure -> Peripherals -> Local display -> Web UI target URL**

Set it to:

- `http://<WEB_HOST>:8101/display.html?kiosk=1`

`display.html` reads saved profile JSON and renders one of:

- `displayMode=peppy` -> `peppy.html`
- `displayMode=player` -> `player-render.html`
- `displayMode=moode` -> `http://moode.local/index.php`

## Push actions

Push actions are now inside each tab/card:

- Peppy tab: **Push Peppy to moOde**
- Player tab: **Push Player to moOde**

These update profile state and refresh moOde display through the stable router URL.

## Config flag

In `config.html`:

- **moOde Display Enhancement**
  - key: `features.moodeDisplayTakeover`

When disabled, Peppy/Player display flows are hidden in app shell navigation.

## Native moOde peppymeter

Custom router mode and native peppymeter are separate display paths.

Advanced control is available via:

- **Native Peppy Takeover** (advanced)

Guardrail: native takeover checks `/etc/peppymeter/config.txt` and blocks if `output.display = False`.

## Peppy built-in preset gallery

Current built-in presets are documented below with captured screenshots from the Peppy builder in Chrome.

### 1) Modern Blue Circular

![Modern Blue Circular](./images/peppy-presets/01-modern-blue-circular.jpg)

### 2) Matrix Classic Needle

![Matrix Classic Needle](./images/peppy-presets/02-matrix-classic-needle.jpg)

### 3) Red Neon Studio

![Red Neon Studio](./images/peppy-presets/03-red-neon-studio.jpg)

### 4) Cassette Linear Classic

![Cassette Linear Classic](./images/peppy-presets/04-cassette-linear-classic.jpg)

### 5) Obsidian Ember Matrix

![Obsidian Ember Matrix](./images/peppy-presets/05-obsidian-ember-matrix.jpg)

### 6) Gray Ghost

![Gray Ghost](./images/peppy-presets/06-gray-ghost.jpg)

### 7) Modern Condensed Linear Theme (S)

![Modern Condensed Linear Theme (S)](./images/peppy-presets/07-modern-condensed-linear-theme-s.jpg)

### 8) Inter Tight Studio Linear (L)

![Inter Tight Studio Linear (L)](./images/peppy-presets/08-inter-tight-studio-linear-l.jpg)

### 9) Montserrat Circular Clean

![Montserrat Circular Clean](./images/peppy-presets/09-montserrat-circular-clean.jpg)

### 10) Warm Parchment Gold Circular

![Warm Parchment Gold Circular](./images/peppy-presets/10-warm-parchment-gold-circular.jpg)

## Verification

SSH check on moOde:

```bash
grep -E -- '--app=' /home/moode/.xinitrc
```

Expected:

```bash
--app="http://<WEB_HOST>:8101/display.html?kiosk=1"
```

Optional runtime check:

```bash
pgrep -af "chromium-browser.*--app="
```
