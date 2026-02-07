# Alexa Lambda

`lambda.alexa.js` is the Lambda entrypoint shim.
Core skill logic lives in `alexa/skill.js`.

## Required env vars

- `API_BASE` (e.g. `https://moode.brianwis.com`)
- `TRACK_KEY` (must match API `TRACK_KEY`)

## Optional env vars

- `PUBLIC_TRACK_BASE` (defaults to `API_BASE`)
- `ART_MODE` (`track` or `current`, default `track`)
- `HTTP_TIMEOUT_MS` (default 6000)

## Notes

- Queue advancement uses `/queue/advance` with `songid` preferred and `pos0` fallback.
- Keep `TRACK_KEY` synchronized between Lambda + API service.
