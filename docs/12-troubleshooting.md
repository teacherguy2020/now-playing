# Troubleshooting

## Quick checks
- API up: `GET /config/runtime`
- UI up: load `app.html`
- key issues: verify `x-track-key`
- Alexa lifecycle: `GET /alexa/was-playing`

## Known classes
- stale deploy copy / wrong host
- cache-busted but old proxy path
- UI parity drift (index vs app)
- transient next-up unknown during state races
