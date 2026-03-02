# moOde Display Enhancement (Peppy + Player)

This chapter documents the custom display flow hosted on the API/Web server (`:8101`) and pushed to moOde's Chromium target.

## Overview

When **moOde Display Enhancement** is enabled in `config.html`, the app exposes:

- `peppy.html` (custom peppy builder/view)
- `player.html` (builder)
- `player-render.html` (actual player renderer)
- `display.html` (stable router URL for moOde)

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
