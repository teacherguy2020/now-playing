# moOde “Now Playing” Architecture

Distributed now-playing system for moOde with clear separation of concerns.

## One-line model

- **Pi #2 Port 3000 = data** (JSON, metadata logic, art generation)
- **Pi #2 Port 8000 = pixels** (HTML/JS UI)

The display never talks directly to moOde. It talks only to the API node.

## Topology

1. **Pi #1 — moOde Player (audio authority)**
   - MPD/moOde playback + library
   - `/command/?cmd=get_currentsong`
   - `/command/?cmd=status`
   - `/var/local/www/aplmeta.txt` (AirPlay metadata/art)

2. **Pi #2 — API + Web Host (brains)**
   - `moode-nowplaying-api.mjs` (Node/Express)
   - Metadata normalization (local/radio/UPnP/AirPlay)
   - Artwork resolution/caching
   - JSON API on `:3000`
   - Static UI on `:8000`
   - Optional Alexa integration endpoint

3. **Pi #3 — Display/Kiosk (optional)**
   - Chromium kiosk
   - Loads `http://<PI2_IP>:8000/index.html` (legacy `/index1080.html` redirects)
   - No metadata logic, no playback logic

## Primary files

- `moode-nowplaying-api.mjs` — API aggregation + control
- `index.html` — fullscreen display shell (`index1080.html` kept as redirect alias)
- `script1080.js` — UI polling/render/animation logic
- `lambda.alexa.js` / `alexa/*` — optional Alexa skill runtime

## API contracts (Pi #2)

### Public
- `GET /now-playing`
- `GET /next-up`
- `GET /art/current.jpg`
- `GET /art/current_bg_640_blur.jpg`

### Key-protected (Alexa/control)
- `GET /track?file=&k=&t=`
- `POST /queue/advance` (songid preferred, pos0 fallback)
- `POST /rating/current`
- `POST /favorites/toggle`

## Playback mode behavior

- **Local files**: full metadata, ratings/progress shown
- **Radio**: iTunes enrichment if possible; safe fallback to station metadata/art
- **UPnP**: stream-like behavior, limited metadata reliability
- **AirPlay**: uses `aplmeta.txt` + LAN/public art fallbacks

## Radio enrichment design

Radio streams are enriched in real time via iTunes lookup:
- parse stream title
- match candidate artist/title
- pull album art/name/year when confidence is good
- gracefully fallback to native moOde/station metadata if lookup fails

This is read-only, requires no API key, and should never break playback.

## Guardrails

- Do not serve UI from port 3000
- Do not point UI directly at moOde
- Do not open UI via `file://`
- Ratings are local-file-only (MPD stickers)

## Alexa integration principles

- Alexa never talks directly to moOde
- Pi #2 mediates queue coordination
- MPD remains authoritative
- Queue alignment and metadata consistency are preserved
