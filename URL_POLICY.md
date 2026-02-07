# URL Policy (Canonical + Compatibility)

This project keeps stable canonical URLs while preserving legacy aliases for compatibility.

## Canonical UI URLs

- `/index.html` — canonical now-playing display page
- `/podcasts.html` — podcast management page

## Legacy UI aliases

- `/index1080.html` → redirects to `/index.html`

## Canonical art URLs

- `/art/current.jpg` — canonical current cover endpoint
- `/art/current_640.jpg` — explicit 640 variant
- `/art/current_bg_640_blur.jpg` — blurred background variant
- `/art/track_640.jpg?file=...` — track-specific art

## Legacy art aliases

- `/art/current_320.jpg` — compatibility alias to canonical current art

## Rules for future changes

1. Add new canonical URL first.
2. Keep existing endpoint as alias/redirect for at least one release cycle.
3. Update UI and docs to canonical URL immediately.
4. Avoid resolution-specific names unless they are truly fixed-size outputs.
5. Do not remove aliases until all known clients have migrated.

## Current migration status

- `index1080.html` clients are supported via redirect.
- `current_320.jpg` clients are supported via alias handler.
- New code should use `index.html` and `/art/current.jpg`.
