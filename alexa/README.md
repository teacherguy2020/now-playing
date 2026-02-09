# Alexa Integration

To use Alexa with this project, you must create your own Amazon developer setup: create an Amazon Developer account, create/configure an Alexa skill for personal/home use, deploy the Lambda handler, and expose your API through a public HTTPS domain reachable by Echo devices.

This project now treats the main project config as the source of truth for Alexa-related settings, with Lambda env vars used only where needed.

## Files

- `lambda.alexa.js` – Lambda entrypoint shim
- `alexa/skill.js` – core skill logic
- `config/now-playing.config.json` – primary config source (`alexa.enabled`, `alexa.publicDomain`, etc.)

## Prerequisites

1. Amazon Developer account
2. AWS account (for Lambda)
3. Alexa custom skill created in the developer console
4. Public HTTPS domain for your API (valid cert, internet reachable)
5. Deployed now-playing API endpoint reachable from Alexa/Lambda

## Config model

Set Alexa options in the root project config:

```json
"alexa": {
  "enabled": true,
  "publicDomain": "your-public-domain.example",
  "skillId": "",
  "webhookPath": "/alexa"
}
```

The API can derive `PUBLIC_BASE_URL` from this domain.

## Lambda environment variables

### Required

- `API_BASE` (e.g. `https://your-public-domain.example`)
- `TRACK_KEY` (must match API `TRACK_KEY`)

### Optional

- `PUBLIC_TRACK_BASE` (defaults to `API_BASE`)
- `ART_MODE` (`track` or `current`, default `track`)
- `HTTP_TIMEOUT_MS` (default `6000`)

## Notes

- Queue advancement uses `/queue/advance` with `songid` preferred and `pos0` fallback.
- Keep `TRACK_KEY` synchronized between Lambda and API.
- Do not hardcode personal domains or private infrastructure details in committed docs.
