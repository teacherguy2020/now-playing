# config display and render features

## Purpose

This page documents the display- and presentation-oriented feature blocks inside `now-playing/config.html`.

It exists because several Config modules directly affect visible rendering and presentation behavior even though they are smaller than the runtime or ratings blocks.

Current feature clusters in this page include:
- Radio Artwork
- moOde Display Enhancement
- Animated Art
- Album Personnel

## Why this page matters

These features are easy to underestimate because their UI is compact.
But they influence what users actually see in live playback and display surfaces.

That makes them important config-owned presentation controls.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `display-interface.md`
- `display-launch-and-wrapper-surfaces.md`
- `visualizer-in-embedded-mode.md`
- `now-playing-surface-variants.md`
- `config-interface.md`

## 1. Radio Artwork

Observed UI includes:
- `featureRadio`

The UI hint describes this as:
- enabling radio per-track artwork behavior in now-playing flows

### Why it matters
This is a presentation-facing feature flag, not just backend radio support.
It affects how radio playback is visually enriched in now-playing surfaces.

## 2. moOde Display Enhancement

Observed UI includes:
- `featureMoodeDisplayTakeover`
- `displayTakeoverTargetHint`

The UI describes this as:
- enabling Now Playing display enhancement on moOde
- making Peppy/Player display tools available
- allowing moOde target URL to be set to this server

### Important active verification
Observed helper includes:
- `checkDisplayTakeoverTargetNow()`

Observed behavior includes:
- inspect whether the current moOde browser target URL points at the expected display URL
- use:
  - `GET /config/moode/browser-url/status`
- require track key
- report whether the moOde target URL is properly set

### Why it matters
This is one of the strongest links between Config and live display-routing behavior.
It means the display enhancement feature is not abstract; it is wired directly into moOde browser-target expectations.

## 3. Animated Art

Observed UI includes:
- `motionArtToggle`

The UI describes this as:
- using animated Apple Music artwork when available
- allowing hero transport and index to swap static radio artwork for animated cover video when resolvable

### Why it matters
This is a presentation/rendering feature with obvious user-visible effect.
It changes how art appears in live hero/index experiences.

## 4. Album Personnel

Observed UI includes:
- `featureAlbumPersonnel`

The UI describes this as:
- controlling whether the personnel block appears on the Now Playing page
- depending on `metaflac` being installed on the player host

### Why it matters
This is another presentation feature with a real environment dependency. It affects visible metadata richness on now-playing surfaces.

## Save/load behavior summary

Observed feature state load/save includes:
- `features.radio`
- `features.moodeDisplayTakeover`
- `features.albumPersonnel`
- `motionArtToggle` behavior via current config/UI state

## Architectural interpretation

A good current interpretation is:
- these features are the rendering/presentation toggles of Config
- they directly shape the visible playback and display experience
- some of them also include live target verification or host dependency checks

## Current status

At the moment, this page gives the smaller display/render feature cards a proper grouped home instead of leaving them scattered as tiny toggles.
