# Config

![Config tab](./images/01-config.jpg)

The Config tab is the control plane for runtime behavior. Most support issues eventually trace back to values set here.

## What this tab controls
- API/web endpoint wiring
- moOde and MPD connectivity
- feature toggles (Alexa, animated art, etc.)
- maintenance knobs (podcasts, library, ratings)

## Key sections
- **Network & Runtime**: host/port/base URL fields used by API and shell.
- **Public domain / Alexa**: domain and integration toggles used for external Alexa requests.
- **Ratings + Artwork**: enable/disable metadata enrichment and artwork strategy.
- **Persistence**: values saved to `config/now-playing.config.json`.

## Typical workflows
1. Set `trackKey`, MPD host/port, and moOde host.
2. Save, then run any built-in connectivity checks.
3. Restart `api` if core host settings change.

## Troubleshooting hints
- If shell badges are red/unknown, re-check host fields here first.
- If Alexa mode never activates, verify Alexa fields and public domain match this runtime config.
