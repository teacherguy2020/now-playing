# config advanced json

## Purpose

This page documents the Advanced JSON section of `now-playing/config.html`.

It exists because the full-config JSON editor is the escape hatch and power-user layer of the Config page.

This is where operators can bypass the individual form cards and edit the full config document directly.

## Why this page matters

The Advanced JSON block changes the nature of Config.
It means Config is not only a structured form UI. It is also:
- a raw config editor
- a formatting tool
- a full-save path for the complete config object

That is powerful, but also riskier than the structured modules above it.

## Important file

Primary file:
- `now-playing/config.html`

Related pages:
- `config-interface.md`
- `config-feature-breakdown.md`
- all config child pages that describe the safer structured paths

## Main visible controls

Observed UI elements include:
- `advancedJsonDetails`
- `fullJson`
- `formatJsonBtn`
- `saveFullBtn`

The UI explicitly frames this as:
- edit full `now-playing.config.json` directly
- then Save Full JSON

## 1. Full-config textarea

Observed field includes:
- `fullJson`

Observed load behavior includes:
- populate textarea with the full loaded config as pretty JSON

### Why it matters
This gives operators direct access to the entire config object, not just the parts surfaced in dedicated cards.

## 2. JSON formatting helper

Observed helper includes:
- `formatFullJson()`

Observed behavior includes:
- parse current textarea content as JSON
- rewrite it prettified with indentation
- fail if the JSON is invalid

### Why it matters
This is a quality-of-life feature, but it also nudges operators toward valid structured editing.

## 3. Full save path

Observed helper includes:
- `saveFullCfg()`

Observed behavior includes:
- require track key
- parse the textarea as JSON
- POST to:
  - `/config/runtime`
- send payload shaped like:
  - `{ fullConfig: full }`
- mark config saved on success
- show restart modal on success

### Why it matters
This is the rawest config persistence path visible in the page.
It bypasses the card-by-card assembly logic used by the normal Config save flow.

## Relationship to structured save flow

The standard `saveCfg()` path assembles config from individual controls and known feature modules.

The Advanced JSON path instead:
- takes the full JSON blob
- sends it as `fullConfig`
- trusts the operator to know what they are doing

### Working interpretation
A good current interpretation is:
- structured cards are the safer/default path
- Advanced JSON is the escape hatch for power users, unusual cases, or fields not yet represented cleanly in the UI

## Risk profile

This section is powerful precisely because it is less constrained.
Potential risks include:
- invalid JSON
- writing inconsistent config structures
- changing fields without the benefit of UI hints/gating/defaults

The presence of `formatFullJson()` helps, but it does not remove the underlying risk.

## User/operator workflow model

A useful current workflow model is:

### Safe advanced-edit workflow
1. load current full config
2. make targeted raw JSON edits
3. format JSON
4. save full JSON
5. review save result
6. restart services if prompted/needed

### When to prefer this path
- when a needed field is not exposed in a structured card
- when making multiple coordinated config edits at once
- when debugging config shape directly

### When not to prefer this path
- when a structured card already exists for the change
- when the operator does not need raw config control
- when a safer feature-specific page is available

## Architectural interpretation

A good current interpretation is:
- this block is the Config escape hatch
- it preserves flexibility when the structured UI does not cover every case
- it is important to document because it changes the operational power level of the page

## Current status

At the moment, this page gives the Advanced JSON block a proper role in the wiki:
- raw full-config editing
- formatting helper
- full-save endpoint path
- explicit distinction from safer structured config modules
