# Alexa Integration

Alexa support is optional. The API remains the source of truth; Alexa clients call your public API domain.

## Prerequisites

1. Amazon Developer account
2. Alexa custom skill
3. Public HTTPS endpoint for this API
4. Valid `TRACK_KEY` shared between Alexa runtime and API

## Key files

- `alexa/skill.js` — core skill handlers
- `alexa/interaction-model.v2.json` — expanded interaction model
- `lambda.alexa.js` / bundle entrypoint — Lambda bridge entry

## API expectations

- Alexa runtime calls your API base (`API_BASE`)
- Queue/control routes are key-protected (`TRACK_KEY`)
- Alexa lifecycle state is exposed via `/alexa/was-playing`

## Required runtime env vars (Lambda/Alexa hosted)

- `API_BASE` (e.g. `https://your-domain.example`)
- `TRACK_KEY`

Optional:

- `PUBLIC_TRACK_BASE`
- `ART_MODE` (`track` or `current`)
- `HTTP_TIMEOUT_MS`

## Interaction model

Use `alexa/interaction-model.v2.json` as the current model source.

## Notes

- Keep Alexa and API track key values in sync.
- Do not commit private domains/tokens.
- After API route changes, re-verify queue advancement and now-playing narration flows.
