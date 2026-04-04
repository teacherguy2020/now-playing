# kiosk designer

## Purpose

This page describes `now-playing/kiosk-designer.html`, which appears to be a support and authoring tool for kiosk presentation rather than the kiosk display surface itself.

Its role is important because it sits between:
- kiosk presentation design
- live preview
- preset management
- moOde-targeted push/config behavior

That makes it part of the kiosk branch, but on the authoring/operations side rather than the final display side.

## What `kiosk-designer.html` appears to do

Based on direct repo inspection, `kiosk-designer.html` appears to provide:
- a live iframe preview of `kiosk.html`
- color/theme controls
- preset selection and preset save/delete/export/import actions
- push-to-moOde behavior
- moOde target URL verification/status feedback

This means the page functions as a kiosk design/configuration console.

## Why it matters

`kiosk-designer.html` is important because it reveals that kiosk presentation is not only a runtime display concern. It is also something the system expects to:
- configure
- preview
- persist
- push into a moOde display target workflow

So this page helps explain how kiosk presentation is authored and deployed in practice.

## Observed structure

Repo-visible structure includes:
- top-level control panel/card UI
- an iframe preview pointing at `kiosk.html`
- preset-oriented controls
- JSON export/import modal behavior
- a push button for updating moOde browser URL state

The preview relationship matters because it suggests that `kiosk.html` is the canonical render target being tuned by the designer.

## Observed kiosk-designer responsibilities

### Previewing kiosk presentation
The page embeds:
- `kiosk.html`

inside an iframe, which strongly suggests that designer changes are intended to be seen against the real kiosk launch path rather than only mocked locally.

### Managing preset state
The page appears to support:
- selecting presets
- saving presets
- deleting presets
- exporting preset JSON
- importing preset JSON

That indicates kiosk appearance/settings are intended to be reusable and portable, at least within this workflow.

### Managing theme and color settings
Repo-visible controls include:
- primary theme color
- secondary theme color
- primary text color
- secondary text color
- named theme presets

That suggests kiosk presentation is expected to be customized with a fairly direct color/preset workflow.

### Checking/pushing moOde target configuration
The page appears to call app-host APIs that:
- inspect moOde browser URL status
- compare the configured target URL to an expected URL
- push the expected URL into moOde configuration

This is especially important because it makes the page an operational bridge between:
- kiosk design intent
- actual moOde display target configuration

## Observed API/config interactions

From repo inspection, `kiosk-designer.html` appears to use app-host APIs around:
- runtime config lookup (`/config/runtime`)
- moOde browser URL status (`/config/moode/browser-url/status`)
- moOde browser URL update (`/config/moode/browser-url`)

This should be verified further later, but it is already enough to place the page architecturally.

## Relationship to other kiosk pages

This page should stay linked with:
- `kiosk-interface.md`
- `kiosk-launch-and-routing.md`
- a future `kiosk-on-moode.md`
- `local-environment.md`
- `deployment-and-ops.md`

Why:
- it previews `kiosk.html`
- it pushes settings toward moOde-targeted display behavior
- it depends on runtime config and host-side assumptions

## Working interpretation

A good current interpretation is:
- `kiosk-designer.html` is not the kiosk experience itself
- it is the design/preview/configuration console for kiosk presentation
- it bridges browser-side preview with moOde-targeted deployment/control

That makes it one of the most operationally meaningful pages in the kiosk branch.

## Things still to verify

Future deeper documentation should verify:
- how presets are stored and named
- what exact expected moOde target URL is enforced
- whether preset state is purely localStorage-based or also persisted elsewhere
- what exact contract exists between the designer and `kiosk.html`
- whether the page is actively used in the live workflow or partly transitional

## Current status

At the moment, this page establishes `kiosk-designer.html` as a first-class kiosk support tool with preview, preset, and moOde push responsibilities.

It should later be expanded into a more explicit implementation and workflow reference.
