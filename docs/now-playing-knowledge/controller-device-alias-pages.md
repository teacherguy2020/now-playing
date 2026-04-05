# controller device alias pages

## Purpose

This page documents the thin device-specific controller entry pages:
- `controller-ipad.html`
- `controller-iphone.html`

These pages matter mainly because they exist as stable public/device-flavored entrypoints, not because they contain substantive controller implementations.

They are best understood as alias/redirect pages that normalize older or device-specific URLs into the current controller shells.

## Why this page matters

Without a grouped page like this, these files can look more important than they really are.

Repo inspection shows that they are not standalone controller implementations.
Instead, they:
- redirect immediately
- preserve incoming query params
- enforce a default `devicePreset`
- hand off to the real tablet/mobile controller shells

That means the wiki should document them, but lightly and accurately.

## Files in this family

- `controller-ipad.html`
- `controller-iphone.html`

## Family classification

Both pages are best classified as:
- device-specific alias entrypoints
- redirect shims
- compatibility-friendly wrappers around the real controller shells

They are not implementation centers.

## 1. `controller-ipad.html`

This page is a thin redirect shim into the tablet controller shell.

### Observed behavior
- has a meta refresh to:
  - `/controller-tablet.html?devicePreset=tablet`
- also runs JS redirect logic
- constructs a target URL for:
  - `/controller-tablet.html`
- copies all incoming query params from the original URL
- ensures `devicePreset=tablet` is present if absent
- uses `window.location.replace(...)`
- falls back to a direct replace of:
  - `/controller-tablet.html?devicePreset=tablet`

### Working interpretation
A good current interpretation is:
- `controller-ipad.html` exists so callers can use an iPad-flavored entry URL
- but the real implementation lives in `controller-tablet.html`
- the shim preserves caller intent while normalizing onto the current shell

## 2. `controller-iphone.html`

This page is a thin redirect shim into the mobile controller shell.

### Observed behavior
- has a meta refresh to:
  - `/controller-mobile.html?devicePreset=mobile`
- also runs JS redirect logic
- constructs a target URL for:
  - `/controller-mobile.html`
- copies all incoming query params from the original URL
- ensures `devicePreset=mobile` is present if absent
- uses `window.location.replace(...)`
- falls back to a direct replace of:
  - `/controller-mobile.html?devicePreset=mobile`

### Working interpretation
A good current interpretation is:
- `controller-iphone.html` exists so callers can use an iPhone-flavored entry URL
- but the real implementation lives in `controller-mobile.html`
- the shim preserves caller intent while normalizing onto the current phone/mobile shell

## Shared behavior pattern

These two files share the same structural pattern:

1. provide a device-named URL
2. redirect immediately through meta refresh and JS
3. preserve incoming query parameters
4. force a default device preset when not already supplied
5. hand off to the real controller shell

That pattern strongly suggests intentional compatibility and routing convenience rather than independent feature development.

## Why the query-param preservation matters

The preservation of incoming query parameters is important.

It means these pages are not just hard redirects to a fixed URL.
They act more like normalization wrappers that allow callers to keep:
- mode flags
- theme/profile params
- open/view params
- future device- or controller-specific routing inputs

while still landing in the canonical shell.

## Relationship to the real controller shells

These alias pages should be understood in relation to:
- `tablet-interface.md`
- `phone-interface.md`
- future deeper pages for:
  - `controller-tablet.html`
  - `controller-mobile.html`

That is where the real implementation and behavioral complexity live.

## Working family model

### Thin alias / redirect pages
- `controller-ipad.html`
- `controller-iphone.html`

### Real implementation targets
- `controller-tablet.html`
- `controller-mobile.html`

That distinction is the main thing this page needs to preserve.

## Architectural interpretation

A good current interpretation is:
- these pages are URL normalization helpers for device-specific controller entry
- they preserve compatibility and caller convenience
- they should not be mistaken for separate controller architectures

## Relationship to other pages

This page should stay linked with:
- `tablet-interface.md`
- `phone-interface.md`
- `user-interfaces.md`
- future controller-shell drill-down pages

## Things still to verify

Future deeper verification should clarify:
- whether these pages are actively used by current callers or mostly legacy-friendly entrypoints
- whether `devicePreset` materially changes shell behavior or mainly affects styling/layout assumptions
- whether there are any other device-named controller aliases not yet grouped here

## Current status

At the moment, this page gives these two files a clear place in the wiki without overpromoting them.

That is the right treatment for now:
- document them
- classify them correctly
- point readers toward the real implementation pages
