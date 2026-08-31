---
title: style-token-and-surface-naming
page_type: support
topics:
  - ui
  - theme
  - styling
  - invariants
confidence: high
---

# style, token, and surface naming

## Purpose

This page preserves the canonical style vocabulary and token/surface ownership rules for the `now-playing` UI layer.

It exists because visual regressions in this project have often come from semantic drift rather than from obviously broken code.
A class name, background layer, or token can still "work" while violating the system's intended ownership model.

Use this page when the question is:
- which surface name should I use for this UI layer?
- which token is supposed to paint this region?
- what background rules must not be broken?
- how should naming be normalized during CSS or markup refactors?

## Why this page matters

One of the most important design-system lessons in this project is:
- surface naming and token ownership are not cosmetic details
- they are behavioral contracts

If those contracts drift, the typical result is not a compile error.
The typical result is:
- shell/background mismatches
- iframe/top-level inconsistencies
- theme controls painting the wrong layer
- regressions that only appear in some pages, themes, or embedding contexts

So this page should be treated as a guardrail page, not as optional style commentary.

## Canonical surface vocabulary

These are the preferred semantic surface names.
They exist to normalize meaning across pages even when legacy classes still remain in use.

## 1. Shell rail surface

Canonical name:
- `rail`

Typical existing classes:
- `.heroRail`
- `.heroRailTop`

Role:
- top shell container
- shell surround
- tabs/pills band context

## 2. Shell content wrapper

Canonical name:
- `shell-wrap`

Typical existing classes:
- `.heroWrap`
- `.viewWrap`

Role:
- bounded width content wrapper inside shell/rail context

## 3. Page wrapper

Canonical name:
- `page-wrap`

Typical existing classes:
- `.wrap`
- `.cfgWrap`
- `.subsWrap`

Role:
- page-local horizontal bounds inside an individual surface

## 4. Panel or card surface

Canonical name:
- `surface-card`

Typical existing classes:
- `.card`
- `.panel`
- `.cfgCard`
- `.stationCard`
- `.heroQueueCard`

Role:
- visible content container
- card/panel-like region that sits above page/shell backgrounds

## 5. Section container

Canonical name:
- `section`

Typical existing classes:
- `.section`
- `.stationCluster`

Role:
- grouped rows/cards or grouped content block

## Naming interpretation rule

The important rule is:
- legacy class names may still exist
- but future reasoning should prefer the canonical semantic names

This helps separate:
- historical CSS naming
- current conceptual ownership

## Canonical theme-token vocabulary

These tokens define the intended painting/ownership model.
They should be treated as semantic contracts.

## Core shell/background tokens

- `--theme-bg`
  - app background plane
  - the backmost canvas/background plane

- `--theme-rail-bg`
  - shell wrapper / rail-adjacent surface tint
  - not the same thing as app background

- `--theme-frame-fill`
  - split-shell/body filler area
  - used where shell/body/frame join regions need fill ownership

- `--theme-rail-border`
  - shell/frame border color
  - linked border ownership token

## Core text tokens

- `--theme-text`
  - primary text

- `--theme-text-secondary`
  - secondary or meta text

## Tab-family tokens

- `--theme-tab-*`
  - tabs and tab-like controls

## Hero/card tokens

- `--theme-hero-card-*`
  - major hero-card surfaces
  - progress/accent behavior tied to hero-card family

## Pill/chip tokens

- `--theme-pill-*`
  - pills and chip-like controls

## Ownership rule

The key rule is:
- each major visible layer should have an explicit token owner
- do not reuse a token for a nearby layer just because the colors happen to look similar in one theme

That is how visual regressions creep in.

## Background invariants

These are high-value regression guardrails.
They are project-critical.
They should not be changed casually.

## 1. `.heroRail` uses app background

Rule:
- `.heroRail` uses `--theme-bg`

Why this matters:
- the shell surround should read as the app background plane
- if this changes, shell/background separation breaks

## 2. `.heroWrap` must not use app background

Rule:
- `.heroWrap` must **not** use `--theme-bg`
- it uses `--theme-rail-bg`

Why this matters:
- the content wrapper is a distinct shell surface, not the backmost canvas
- collapsing these layers causes shell-depth and theme-boundary regressions

## 3. `#appFrame` base background uses app background unless explicitly overridden

Rule:
- `#appFrame` base background should be `--theme-bg`
- unless a specific page-level override is genuinely required

Why this matters:
- iframe/base-plane mismatches have historically caused display inconsistencies
- changing this casually can reintroduce top-level versus embedded rendering bugs

## 4. App background picker controls only the backmost app/shell and iframe base planes

Rule:
- the app background picker should not be allowed to silently retake ownership of wrapper or card layers

Why this matters:
- if the picker paints too many layers, theme editing becomes misleading and breaks surface separation

## 5. Do not reintroduce `.heroRail::before` underlay backgrounds

Rule:
- keep pseudo underlay backgrounds disabled unless there is a deliberate, reviewed reason to restore them

Why this matters:
- hidden underlay layers are a common source of "why is this surface dark here but not there?" regressions

## Practical consequence of the invariants

The design-system lesson is:
- the shell has multiple visual planes on purpose
- collapsing them into one background owner may feel simpler, but it usually creates harder bugs later

## Compatibility and alias decisions

Some naming and token bridges already exist for compatibility.
They should be preserved until deliberate migration is complete.

Known example:
- `--theme-frame-border` is linked to `--theme-rail-border`

Practical meaning:
- the system already treats shell/frame border ownership as a shared concept
- compatibility aliases are acceptable when they preserve semantics rather than muddy them

## Migration strategy

The safe migration strategy is incremental.

## Phase 1: semantic normalization without visual change

Rules:
1. keep old class names in place
2. introduce canonical aliases in docs and bridge selectors
3. clarify token ownership before renaming markup aggressively

Goal:
- improve reasoning without forcing a risky visual rewrite

## Phase 2: gradual markup/class migration

Rules:
1. migrate page by page
2. keep aliases for a transition cycle
3. remove aliases only after regression checks

Goal:
- reach cleaner naming without losing stability

## Existing page inventory examples

Current naming appears across pages such as:
- `app.html`
  - `.heroRail`, `.heroRailTop`, `.heroWrap`, `.viewWrap`, `.heroQueueCard`
- `config.html`
  - `.cfgWrap`, `.cfgCard`, `.panel`
- `radio.html`
  - `.wrap`, `.card`
- `podcasts.html`
  - `.subsWrap`, `.panel`
- `queue-wizard.html`
  - `.wrap`, `.card`
- `theme.html`
  - `.wrap`, `.card`

This is one reason canonical semantic vocabulary is useful.
The visible system already spans several naming dialects.

## Recommended non-breaking alias direction

A useful lightweight alias direction is:
- `.page-wrap` aliases `.wrap`, `.cfgWrap`, `.subsWrap`
- `.surface-card` aliases `.card`, `.panel`, `.cfgCard`, `.heroQueueCard`, `.stationCard`
- `.shell-rail` aliases `.heroRail`
- `.shell-rail-top` aliases `.heroRailTop`

This is the right kind of migration move because it improves semantic clarity without demanding a full rewrite first.

## Best companion pages

- `theme-interface.md`
- `theme-page-anatomy.md`
- `app-shell-anatomy.md`
- `display-interface.md`
- `gotchas-and-lessons.md`

## Current status

At the moment, this page should be treated as a design-system guardrail page.

The key truths it preserves are:
- surface naming should be semantic, not purely historical
- token ownership matters by layer
- background-plane invariants are deliberate and fragile
- migration should normalize meaning first, then rename incrementally
