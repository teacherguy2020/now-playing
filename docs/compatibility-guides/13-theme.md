# Theme

Theme editing is token-based and single-path (no light/dark mode split behavior).

## Current model

- Themes are **token sets**.
- Presets are named only (no `(light)` / `(dark)` suffix handling).
- Applying a preset updates shell + iframe pages through the theme bridge.

## Core workflow

- Open `Theme` tab.
- Pick a preset from dropdown (auto-loads on selection).
- Adjust tokens in the grid.
- Save as preset if desired.
- Use **Reset to Slate Medium** to return to default baseline.

## Import / Export

- **Import theme** accepts:
  - v2 payload (`{ version, name, tokens, ... }`), or
  - raw token object.
- **Export theme** opens terminal-style modal (black/green), editable JSON, with copy button.
- After copy, status message remains visible in Theme card.

## Starter presets

Seeded on load (and merged into local storage if missing):

- Slate Medium (default reset target)
- Chill Blue
- Monotone Gray
- Warm Parchment
- Muted Merlot
- Abyss Graphite
- Matrix
- Blue Neon
- Red Neon

## Quick switcher (Hero)

A subtle quick preset dropdown exists in hero header (top-right):

- near-invisible at rest
- visible on hover/focus
- selecting a preset applies instantly

## Token notes

Notable mappings in current build:

- `--theme-pill-border` is used as **Stars** color.
- `--theme-card-secondary-fill` is used for secondary card zones on pages that need extra fill control.
- Border unification links shell/card/tab border families to shared border ownership.

## Known caveats

- iOS Web Share from iframe contexts remains unreliable under current local HTTP setup.
- Export uses in-app modal + copy path for reliability.
