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

## Relevant source files

This page is branch-oriented rather than file-complete, but these files are especially relevant when grounding Configuration and Administration behavior:
- `config.html`
- `diagnostics.html`
- config-related helper logic and route integrations
- runtime-admin and maintenance-related route surfaces

## Configuration and administration at a glance

If you need the compressed branch model first, use this:
- **configuration** = feature setup, environment bootstrap, path/runtime assumptions, persistence, and operator-controlled feature state
- **administration** = diagnostics, runtime checks, maintenance actions, and operational inspection
- **config and diagnostics are closely related**, but they are not the same job
- this branch is the main operator-facing control plane of the project

That is why this branch should be read as Configuration and Administration, not only as two adjacent pages.

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

## Read this branch in this order

If you are trying to understand Configuration and Administration as a system, read in this order:
1. [configuration-and-diagnostics-interfaces.md](configuration-and-diagnostics-interfaces.md)
2. [config-interface.md](config-interface.md)
3. [config-network-and-runtime.md](config-network-and-runtime.md)
4. [config-feature-breakdown.md](config-feature-breakdown.md)
5. [diagnostics-interface.md](diagnostics-interface.md)
6. [backend-change-verification-runbook.md](backend-change-verification-runbook.md)
7. [install-and-validation.md](install-and-validation.md)

Then move into feature-specific config pages or troubleshooting pages when the question becomes narrower.

## Candidate subpages

The most likely next drill-down pages from here are:

### `config-interface.md`
Now serves as the first implementation-aware drill-down in this branch.

It is centered on:
- `config.html`
- configuration controls
- what can be changed from the UI
- what config/API calls it drives

### `config-feature-breakdown.md`
Now serves as the feature-level decomposition of the main Config page.

It is centered on major Config modules such as:
- runtime/network setup
- Last.fm / scrobbling
- Alexa setup
- ratings DB management
- Pushover track notifications
- animated art
- advanced JSON editing

Related child pages now available beneath this branch include:
- `config-network-and-runtime.md`
- `config-podcasts-and-library-paths.md`
- `config-display-and-render-features.md`
- `config-ratings.md`
- `config-lastfm-and-scrobbling.md`
- `config-notifications.md`
- `config-alexa-setup.md`
- `config-advanced-json.md`

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

### `radio-metadata-eval-interface.md`
Now serves as the radio metadata QA/evaluation drill-down in this branch.

It is centered on:
- `radio-eval.html`
- radio metadata logs
- parsing/enrichment verdict review
- live debugging and cleanup workflows

### `alexa-interface.md`
Now serves as the Alexa corrections/review drill-down in this branch.

It is centered on:
- `alexa.html`
- alias/correction editing
- recently-heard review
- operator guidance for Alexa voice commands

## Relationship to other interface pages

This page should be read alongside:
- [desktop-browser-interface.md](desktop-browser-interface.md)
- [user-interfaces.md](user-interfaces.md)
- [deployment-and-ops.md](deployment-and-ops.md)
- [local-environment.md](local-environment.md)

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
- [user-interfaces.md](user-interfaces.md)
- [deployment-and-ops.md](deployment-and-ops.md)
- [local-environment.md](local-environment.md)
- [restart-and-runtime-admin-troubleshooting.md](restart-and-runtime-admin-troubleshooting.md)
- [source-map.md](source-map.md)

This branch is especially important for connecting UI-facing understanding to real operational behavior.

## Current status

At the moment, this page is a structural hub rather than a code-heavy implementation guide.

That is intentional.

Its job is to establish operator/admin surfaces as a first-class part of the interface map and to give the wiki a clean place to branch into `config.html`, `diagnostics.html`, `library-health.html`, and `theme.html` next.

## Timestamp

Last updated: 2026-04-06 06:39 America/Chicago
