# Visualizer

This chapter documents the realtime visualizer display (`visualizer.html`) and its integration with the moOde display router.

## Overview

The visualizer is an audio-reactive display mode driven by the existing spectrum/VU data pipeline:

- input feed: `GET /peppy/spectrum`
- optional track metadata: `GET /now-playing`
- render target: `visualizer.html`

It is available through:

- direct URL: `http://<WEB_HOST>:8101/visualizer.html`
- router mode: `displayMode=visualizer` via `display.html?kiosk=1`

## Scenes and presets

Current scene family includes:

- `classic` (mapped to a fast particle-forward style)
- `aeon`
- `fireworks`
- `sphere`
- `moire`
- `ambient`

Designer controls include:

- Preset
- Energy (1–10)
- Motion (1–10)
- Glow (1–10)

Embedded kiosk pane mode uses pure-visual rendering (no HUD/tool strip). Tapping the embedded pane promotes to fullscreen visualizer.

## Push flow

From the Visualizer designer or Displays tab:

- push saves `displayMode: "visualizer"` plus visualizer parameters into `/peppy/last-profile`
- moOde local display URL remains stable (`display.html?kiosk=1`)
- router resolves and loads `visualizer.html` with pushed parameters

This keeps mode switching centralized while preserving a single stable moOde target URL.

## Kiosk integration

In kiosk controller (1280x400), Col2 includes a **Visualizer** row.
Selecting it opens `visualizer.html` in Col3 pane.

## Performance notes

Moiré is the heaviest scene. Low-power safeguards are applied for kiosk/embedded paths:

- reduced detail density
- reduced blur/glow cost
- frame-thinning behavior in constrained mode

If hardware still struggles, prefer `classic`, `sphere`, or `ambient` presets for long-running displays.
