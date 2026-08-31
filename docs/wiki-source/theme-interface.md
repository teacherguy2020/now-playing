# theme interface

## Purpose

This page documents `now-playing/theme.html`, the shell-theme editor in the `now-playing` ecosystem.

This page is intentionally implementation-aware, because `theme.html` appears to be a live, client-side theme editor rather than a conventional server-backed settings page. It is designed for:
- editing core shell color tokens
- previewing changes live
- saving/loading presets
- importing/exporting theme JSON
- synchronizing with the app shell through postMessage

## Why this page matters

`theme.html` is important because it reveals that the shell’s visual configuration is not just hard-coded styling. It is an editable token system with:
- persistent local state
- named presets
- live preview behavior
- shell/editor synchronization messages

That makes it one of the clearest examples of the system exposing a design/configuration surface directly in the browser.

## Relevant source files

This page is branch-oriented rather than file-complete, but these files are especially relevant when grounding Theme & Customization behavior:
- `now-playing/theme.html`
- app-shell pages that consume theme tokens
- styling files and shell token definitions
- kiosk-designer-related pages where customization overlaps display presentation

## Theme and customization at a glance

If you need the compressed branch model first, use this:
- **theme editing** = tokenized shell styling, preset management, import/export, and local persistence
- **style-token ownership** matters because theme regressions often come from semantic layer drift, not only from bad colors
- **customization** extends beyond the shell theme editor into kiosk/display presentation workflows
- **live shell behavior** depends on both theme state and how the rest of the UI consumes those tokens

That is why this branch should be read as Theme & Customization, not only as the `theme.html` editor page.

## Important file

Primary file:
- `now-playing/theme.html`

Related pages:
- [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)
- [desktop-browser-interface.md](desktop-browser-interface.md)
- [display-interface.md](display-interface.md)
- [config-interface.md](config-interface.md)

## Read this branch in this order

If you are trying to understand Theme & Customization as a system, read in this order:
1. [theme-interface.md](theme-interface.md)
2. [theme-page-anatomy.md](theme-page-anatomy.md)
3. [style-token-and-surface-naming.md](style-token-and-surface-naming.md)
4. [kiosk-designer.md](kiosk-designer.md)

Then move into page-specific or renderer-specific pages when the question becomes implementation-specific.

## High-level role

A good current interpretation is:
- `theme.html` is the operator/designer-facing shell-theme editor
- it edits tokenized visual state for the shell and related UI surfaces
- it is primarily client-side and stateful in localStorage rather than runtime-API-centered

This is an important contrast with pages like `config.html`, which revolve around `/config/runtime`.

## Major UI areas visible in the page

Repo-visible structure shows a compact but meaningful design tool.

## 1. Token grid / color picker cards
The main editor surface includes:
- `#tokenGrid`
- one card per theme token
- color swatches and hidden native color pickers
- text inputs for raw token values

This is the central live-editing interface.

## 2. Preset controls
Observed preset controls include:
- `#presetSelect`
- `#savePresetBtn`
- `#deletePresetBtn`

This indicates the page is built around reusable named theme sets, not just one-off edits.

## 3. Import/export controls
Observed controls include:
- `#importBtn`
- `#exportBtn`
- export modal with:
  - `#exportJsonText`
  - `#exportCopyBtn`
  - `#exportCloseBtn`

This suggests theme state is intended to be portable and shareable.

## 4. Save/reset controls
Observed controls include:
- `#saveBtn`
- `#resetBtn`
- `#statusMsg`

This gives the page a clear workflow for applying and persisting theme changes locally.

## Core storage model

One of the most important architectural facts in `theme.html` is that it is localStorage-centered.

Observed keys include:
- `nowplaying.themeTokens.v1`
- `nowplaying.themePresets.v1`
- `nowplaying.themeActivePreset.v1`

This means the theme editor is not primarily driven by backend config APIs.

Instead, it appears to persist and restore theme state entirely on the client side.

## Theme token model

The page defines a large token set with defaults, including categories such as:
- shell/background tokens
- text tokens
- rail/frame tokens
- tab tokens
- hero/card tokens
- pill/progress-related tokens

Observed examples include:
- `--theme-bg`
- `--theme-text`
- `--theme-text-secondary`
- `--theme-rail-bg`
- `--theme-frame-fill`
- `--theme-rail-border`
- `--theme-tab-bg`
- `--theme-tab-active-bg`
- `--theme-hero-card-bg`
- `--theme-hero-card-border`
- `--theme-picker-card-bg`
- `--theme-pill-border`
- `--theme-pill-glow`

So the page is working at the design-token level, not just exposing a couple of colors.

## Key functions / logic blocks

## `load()`
Loads the current theme token state from:
- `nowplaying.themeTokens.v1`

and merges it with defaults.

This appears to be the root state-loader for the editor.

## `loadPresets()` / `savePresets()`
These functions manage named preset storage via:
- `nowplaying.themePresets.v1`

Observed behavior includes:
- loading starter presets
- backfilling them into localStorage
- preserving user-added presets

This suggests presets are a first-class part of the theme editor, not an afterthought.

## `render()`
This appears to build the token editor UI.

Observed behavior includes:
- creating token cards
- wiring each card to a color picker and text input
- updating local state on input
- pushing changes live as the user edits

So `render()` is central to the page’s live-editing nature.

## `push()`
This is one of the most important functions.

Observed behavior includes:
- applying token changes to the current document
- broadcasting a message:
  - `type: 'np-theme-updated'`
- including the current token state in that message

This is the heart of the live-preview mechanism.

It means the theme editor is not waiting for a backend save to produce visible change.

## `applyThemeEditorZones()` and `applyPickerTileBg()`
These functions appear to keep the editor itself visually synced with the current token state.

That means the editor is partially self-themed by the theme it is editing.

This is a useful UI/design detail and also a potential source of debugging complexity.

## Preset-selection behavior

The page includes a meaningful preset workflow.

Observed behavior includes:
- selecting a preset from `#presetSelect`
- applying its tokens to local state
- saving a preset under a prompted name
- deleting a selected preset
- tracking an active preset name

This means presets are a meaningful operator/designer abstraction, not just a static starter list.

## Import/export behavior

The page includes an explicit JSON portability model.

Observed behavior includes:
- export current theme to JSON
- show it in a modal text area
- copy it to the clipboard
- import theme JSON via prompt
- normalize payload format through:
  - `normalizeThemePayload(...)`
  - `buildThemePayload(...)`

This is important because it means theme state can move across sessions or environments without involving runtime config endpoints.

## Live shell synchronization

One of the most interesting architectural features of `theme.html` is its message-based shell integration.

Observed message types include:
- `np-theme-updated`
- `np-theme-sync`
- `np-theme-load-preset`

This strongly suggests:
- the editor can push theme state outward to a shell or parent
- the shell can push mode/preset state back into the editor

That makes `theme.html` a coordinated shell tool, not just an isolated standalone page.

## Reset behavior

Observed control:
- `#resetBtn`

Current visible behavior suggests reset returns the editor to:
- `Slate Medium`

This implies the starter preset set includes a canonical default baseline used as the reset target.

## Starter presets

The page defines a fairly large starter preset set, including examples such as:
- `Slate Medium`
- `Chill Blue`
- `Monotone Gray`
- `Warm Parchment`
- `Muted Merlot`
- `Abyss Graphite`
- `Matrix`
- `Blue Neon`
- `Red Neon`

This is important because it shows the editor is already being treated as a serious theme-selection surface, not just an experimental picker.

## Architectural interpretation

A good current interpretation is:
- `theme.html` is a client-side design-token editor for the shell
- it persists local theme state and presets in the browser
- it propagates changes live through DOM application and postMessage
- it appears to be aimed more at shell/presentation customization than at runtime-server configuration

That makes it a distinctive page in the operator branch: design/configuration-oriented, but not runtime-API-centric.

## Anatomy companion page

- `theme-page-anatomy.md`

This is the anatomy-style companion page for `theme.html`.
Use it when the task is not just about Theme as a surface, but about a specific region such as the token grid, preset controls, import/export tools, save/reset strip, export modal, localStorage persistence layer, shell sync layer, or editor self-theming behavior.

## Relationship to other pages

This page should stay linked with:
- [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)
- [desktop-browser-interface.md](desktop-browser-interface.md)
- [display-interface.md](display-interface.md)
- [theme-page-anatomy.md](theme-page-anatomy.md)
- [style-token-and-surface-naming.md](style-token-and-surface-naming.md)
- [kiosk-designer.md](kiosk-designer.md)
- future pages about app shell behavior and tokenized theming

## Things still to verify

Future deeper verification should clarify:
- exactly which shell pages consume `np-theme-updated`
- how widely tokenized theming is applied across the repo versus only a subset of surfaces
- whether any theme state is ever mirrored into backend/runtime config
- how theme sync behaves across tabs, if at all
- whether some tokens are legacy, duplicated, or partially unused

[theme-page-anatomy.md](theme-page-anatomy.md) matters when the real question is not only “what is `theme.html`?” but “which region inside `theme.html` actually owns the thing I need to change?”

## Current status

At the moment, this page already has enough evidence to be treated as the main Theme & Customization branch surface in the project.

It is not just a color picker. It is a local preset system, token editor, export/import tool, live shell synchronization surface, and the clearest current root for broader customization work.

## Timestamp

Last updated: 2026-04-06 06:34 America/Chicago
