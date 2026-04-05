# configuration and diagnostics interfaces

## Purpose

This page describes the operator-facing configuration, diagnostics, and inspection surfaces in the `now-playing` ecosystem.

It exists because these interfaces are not side trivia. They are a core part of how the live system is understood, verified, and adjusted.

If the user-facing branches explain how humans interact with playback and browsing, this branch explains how operators interact with:
- configuration
- runtime state
- diagnostics
- health and maintenance views
- troubleshooting-oriented UI surfaces

## Why this page matters

A system like `now-playing` is not only experienced through controller and display pages.

It is also experienced through:
- config surfaces
- diagnostics surfaces
- health-check views
- operational/admin pages that explain what the live system is actually doing

These pages are especially important because they often provide:
- sharper ground truth than the main UI surfaces
- operator-facing controls or visibility
- clues for debugging difficult cross-layer behavior

## Important current files

Based on the current repo scan, likely important pages in this branch include:
- `config.html`
- `diagnostics.html`
- `library-health.html`
- `theme.html`

These should be treated as the current core operator/admin surface set until deeper inspection proves otherwise.

## Current working interpretation

At this stage, a good working interpretation is:
- this branch covers the pages used to inspect, configure, validate, and troubleshoot the system
- these pages may overlap with desktop/browser usage more than with phone-oriented usage
- they likely represent one of the best views into operational truth and maintenance workflows

## Likely responsibilities of this branch

The configuration/diagnostics branch is likely to include some combination of:
- system/runtime configuration
- diagnostics and troubleshooting output
- health-state reporting
- theme/config customization support
- operational guidance for fixing or verifying live behavior

This branch should also act as the bridge between:
- interface-level understanding
- runtime/ops understanding
- underlying API/config responsibilities

## Candidate subpages

The most likely next drill-down pages from here are:

### `config-interface.md`
Now serves as the first implementation-aware drill-down in this branch.

It is centered on:
- `config.html`
- configuration controls
- what can be changed from the UI
- what config/API calls it drives

### `diagnostics-interface.md`
Now serves as the diagnostics/live-inspection drill-down in this branch.

It is centered on:
- `diagnostics.html`
- runtime inspection and debugging views
- diagnostic actions and what they reveal

### `library-health-interface.md`
Now serves as the library audit and maintenance drill-down in this branch.

It is centered on:
- `library-health.html`
- library/art/cache/index health information
- maintenance or verification-oriented workflows

### `theme-interface.md`
Now serves as the shell-theme editor drill-down in this branch.

It is centered on:
- `theme.html`
- theme/palette customization or inspection
- how visual configuration is exposed operationally

## Relationship to other interface pages

This page should be read alongside:
- `desktop-browser-interface.md`
- `user-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`

A useful current distinction is:
- desktop/tablet/phone/display pages are how the system is used
- configuration/diagnostics pages are how the system is inspected and steered

That distinction is not perfect, but it is a useful organizing principle.

## Likely implementation dimensions

This branch will likely eventually need documentation for:
- which operator pages exist and why
- what APIs they call
- what state they reveal
- what actions/buttons they expose
- what runtime/config boundaries they cross
- what local-environment realities or permissions they assume

In other words, this branch is likely to become one of the more code-aware and API-aware parts of the wiki.

## What this page should eventually explain in more detail

A mature configuration/diagnostics page should eventually explain:
- what the main admin/operator entrypoints are
- which pages are for configuration versus inspection versus maintenance
- how those pages relate to runtime and deployment workflows
- which files/functions/API routes matter most in each one
- which pages are safest for observation versus which ones can change live state

## Relationship to the rest of the wiki

This page should remain closely linked with:
- `user-interfaces.md`
- `deployment-and-ops.md`
- `local-environment.md`
- `restart-and-runtime-admin-troubleshooting.md`
- `source-map.md`

This branch is especially important for connecting UI-facing understanding to real operational behavior.

## Current status

At the moment, this page is a structural hub rather than a code-heavy implementation guide.

That is intentional.

Its job is to establish operator/admin surfaces as a first-class part of the interface map and to give the wiki a clean place to branch into `config.html`, `diagnostics.html`, `library-health.html`, and `theme.html` next.
