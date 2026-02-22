# Config

Purpose: runtime setup, feature flags, host/port/keys.

## Covers
- `config.html`
- `GET /config/runtime`
- `POST /config/runtime`

## Key fields
- `trackKey`
- `ports.api`, `ports.ui`
- `mpd.*`
- `moode.*`
- `alexa.*`
- `notifications.*`

## Common workflows
- First-time setup
- Validate SSH + paths
- Restart API after config changes
