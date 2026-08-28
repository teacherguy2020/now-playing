# kiosk editor mode

## Purpose

This page documents the editor/designer branch of controller-side kiosk mode.

It exists because `controller.html` does not treat all kiosk mode the same way. There is a meaningful split between:
- normal kiosk runtime mode
- kiosk editor mode

That split changes:
- layout behavior
- control visibility
- right-pane behavior
- push-to-moOde interactions

## Why this page matters

Without this page, it is easy to think `kiosk=1` is a single mode.

But repo inspection shows that controller-side kiosk behavior is explicitly divided into:
- `IS_KIOSK_1280`
- `IS_KIOSK_EDITOR`

And editor mode materially changes how the page behaves.

## Important file

Primary file:
- `now-playing/controller.html`

Related pages:
- `controller-kiosk-mode.md`
- `kiosk-designer.md`
- `kiosk-right-pane-routing.md`

## Key mode detection

Current repo-visible logic in `controller.html` defines:
- `IS_KIOSK_1280` when:
  - `kiosk=1`, or
  - `profile=1280x400`, or
  - `layout=1280x400`
- `IS_KIOSK_EDITOR` when kiosk mode is active and either:
  - `edit=1`, or
  - `designer=1`

So editor mode is not a separate page. It is a specialized branch of controller kiosk mode.

## Body classes

When kiosk mode is active, controller adds:
- `kiosk1280`

When editor mode is also active, controller additionally adds:
- `kioskEditor`

This matters because the CSS differentiates strongly between:
- `body.kiosk1280`
- `body.kiosk1280:not(.kioskEditor)`

## Layout difference between runtime kiosk and editor kiosk

### Runtime kiosk mode
When kiosk mode is active but editor mode is not:
- the page collapses to a tighter runtime display form
- `.kioskCtl` is hidden
- `#kioskCanvas` becomes the main full display area
- user selection/touch-callout is suppressed more aggressively

### Editor kiosk mode
When editor mode is active:
- `.kioskCtl` remains visible
- the page keeps the extra control/header row
- the kiosk canvas is shown below the controls
- the page behaves more like a configurable staging surface than a pure runtime display surface

So a good summary is:

> runtime kiosk mode is presentation-first; editor kiosk mode is configuration-and-preview-first.

## Important DOM elements in editor mode

Current repo-visible editor controls include:
- `#kioskCtl`
- `#kioskSizeSel`
- `#kioskPushBtn`
- `#kioskPushStat`
- `#kioskCanvas`

The size selector currently includes options such as:
- `controller.html?kiosk=1&edit=1` → `1280×400`
- `controller.html` → `Default`
- `controller-now-playing.html` → `Now Playing`

This means editor mode is not only a visual variant; it is also a control surface for selecting and pushing kiosk-related targets.

## Key function: `initKioskControls()`

The main editor-specific logic is concentrated in:
- `initKioskControls()`

Current repo-visible behavior:
- it exits immediately unless `IS_KIOSK_EDITOR` is true
- it makes `#kioskCtl` visible
- it synchronizes `#kioskSizeSel` with the current page URL
- it wires size changes to navigation
- it wires the Push button to moOde target update behavior

This makes `initKioskControls()` one of the clearest implementation centers for the editor branch.

## Size selection behavior

Inside editor mode:
- changing `#kioskSizeSel` navigates directly to the selected relative URL

That means editor mode can act as a launcher between different display/controller variants while keeping the operator inside the controller surface family.

## Push-to-moOde behavior in editor mode

The editor branch has its own push flow via:
- `#kioskPushBtn`

Observed behavior when the Push button is pressed:
1. disable the button and show `Pushing…`
2. ensure runtime key/config through `ensureKey()`
3. read the selected target from `#kioskSizeSel`
4. build a URL from that target
5. mirror current profile styling into query params:
   - `theme`
   - `colorPreset`
   - `recentSource`
   - `rev=20260329-motion-art-fix`
6. remove editor-specific query params:
   - `edit`
   - `designer`
7. preserve `kiosk=1` when relevant
8. POST the final URL to:
   - `/config/moode/browser-url`
9. use reason:
   - `kiosk-controls-push`
10. update `#kioskPushStat`

This is a very important distinction from ordinary runtime kiosk behavior.

Editor mode is not just for looking. It is a live control surface for selecting what moOde should display.

## Relationship to right-pane behavior

Current repo-visible right-pane logic in `controller.html` uses:
- `shouldOpenInRightPane()`

and returns true for kiosk mode only when:
- `IS_KIOSK_1280 && !IS_KIOSK_EDITOR`

This is critical.

It means:
- normal kiosk runtime mode uses the right-pane model
- editor kiosk mode explicitly does not

So editor mode suppresses one of the main kiosk runtime interaction patterns.

This makes sense: while editing or configuring kiosk state, the page should behave more like a configuration shell than like the final kiosk runtime shell.

## Relationship to auto-open behavior

Controller startup logic also checks:
- `open=<kiosk-page>`

But auto-open of kiosk pane pages happens only when:
- `IS_KIOSK_1280 && !IS_KIOSK_EDITOR`

So editor mode also disables kiosk-pane auto-opening behavior on startup.

Again, that reinforces the separation between:
- runtime kiosk shell behavior
- editor/configuration behavior

## Relationship to kiosk designer

`kiosk-editor-mode` and `kiosk-designer.html` are related, but not identical.

A useful distinction is:
- `kiosk-designer.html` is a dedicated kiosk preview/preset/push console centered around `kiosk.html`
- controller-side kiosk editor mode is an in-controller editing/configuration branch of `controller.html`

They overlap in purpose, especially around pushing targets and previewing kiosk-oriented presentation, but they are different implementation paths.

## Architectural interpretation

A good current interpretation is:
- editor mode is the operator-facing branch of controller kiosk mode
- runtime kiosk mode is the display-facing branch
- both live in `controller.html`, but they differ materially in layout, controls, and navigation behavior

So `edit=1` / `designer=1` are not cosmetic toggles. They mark a real operational mode split.

## Relationship to other pages

This page should stay linked with:
- `controller-kiosk-mode.md`
- `kiosk-designer.md`
- `kiosk-right-pane-routing.md`
- future pages about controller-shell push/config workflows

## Things still to verify

Future deeper verification should clarify:
- whether `edit=1` and `designer=1` are fully equivalent in live use or only mostly equivalent
- how frequently editor mode is used compared to `kiosk-designer.html`
- whether there are controller-side editing affordances beyond size selection and push behavior
- whether editor mode is intended as a durable operator workflow or partly a development scaffold

## Current status

At the moment, this page establishes kiosk editor mode as a real controller-side operational branch with:
- explicit mode detection
- distinct layout rules
- visible control chrome
- target selection
- push-to-moOde behavior
- right-pane suppression

That makes it an important part of the kiosk architecture rather than a side note.
