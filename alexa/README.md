# Alexa Integration

Alexa support is optional. The API remains the source of truth; Alexa clients call your public API domain.

> Important: enabling Alexa in `config.html` does **not** automatically build/upload/deploy the Alexa zip. You must still package and import the skill code into the Developer Console.

## Prerequisites

1. Amazon Developer account
2. Alexa custom skill (create in Alexa Developer Console). Skill does NOT need to be published in order to work.
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

- `API_BASE` (e.g. `https://moode.<yourdomain>.com`)
- `TRACK_KEY`

Optional:

- `PUBLIC_TRACK_BASE`
- `ART_MODE` (`track` or `current`)
- `HTTP_TIMEOUT_MS`

## Interaction model

Use `alexa/interaction-model.v2.json` as the current model source.

## First-time: create the skill in Developer Console

If you are starting from scratch, do this once before uploading code:

1. Go to <https://developer.amazon.com/alexa/console/ask> and click **Create Skill**.
2. Choose a skill name (example: `Moode Audio`) and default language (usually `English (US)`).
3. Choose **Custom** model.
4. Choose provisioning method:
   - **Alexa-hosted (Node.js)** (recommended easiest path), or
   - **Provision your own** if you are wiring your own Lambda.
5. Create the skill.
6. In **Build** tab:
   - Set invocation name (example: `mood audio`).
   - Import/paste `alexa/interaction-model.v2.json` in JSON editor.
   - Save model, then **Build Model**.
7. In **Code** tab:
   - Upload the zip package (steps below), then click **Deploy**.
8. In **Code** → **Environment variables** (or Lambda env vars), set:
   - `API_BASE=https://<your-public-domain>`
   - `TRACK_KEY=<same track key as your API/config.html>`
9. Test in **Test** tab (development stage) with: “open mood audio” and “what’s playing”.

## Public HTTPS with Caddy (recommended)

Alexa must reach your API over valid public HTTPS. A simple Caddy reverse-proxy setup is usually easiest.

Example Caddyfile:

```caddy
moode.YOUR-PUBLIC.DOMAIN.com {
  encode zstd gzip

  # API routes (Node app)
  reverse_proxy 127.0.0.1:3101

  # Optional: static UI from Python web server
  # handle_path /* {
  #   reverse_proxy 127.0.0.1:8101
  # }
}
```

Notes:

- Point DNS `A`/`AAAA` for your domain to your public host.
- Open ports 80/443 to that host.
- Caddy auto-manages TLS certificates.
- Alexa runtime should use `API_BASE=https://moode.YOUR-PUBLIC.DOMAIN.com`.

Quick checks:

```bash
curl -I https://moode.YOUR-PUBLIC.DOMAIN.com/now-playing
curl -I https://moode.YOUR-PUBLIC.DOMAIN.com/alexa/was-playing
```

## Advanced Caddyfile (split routes / multi-upstream)

If you split traffic across multiple upstreams (API, web UI, moOde art/stream), use explicit path matchers.

```caddy
{
  email you@yourdomain.com
}

moode.YOUR-PUBLIC.DOMAIN.com {
  log {
    output file /var/log/caddy/moode_access.log
    format json
  }

  header {
    X-Site moode.YOUR-PUBLIC.DOMAIN.com
  }

  # 1) moOde artwork/static images (strip cookies for Echo safety)
  @moode_art {
    path /coverart.php* /images/*
  }
  handle @moode_art {
    reverse_proxy 10.0.0.254:80 {
      header_down -Set-Cookie
      header_down X-Upstream "moode:80"
    }
  }

  # 2) Node API routes
  @node_api {
    path /now-playing /next-up /favorites/toggle /queue/advance* /queue/play_item* /queue/mix* /mpd/* /track /track/* /art/* /_debug/* /alexa/* /podcasts* /rating* /config*
  }
  handle @node_api {
    reverse_proxy 127.0.0.1:3101 {
      header_down X-Upstream "node:3101"
    }
  }

  # 3) moOde audio stream passthrough
  @moode_stream {
    path /stream*
  }
  handle @moode_stream {
    reverse_proxy 10.0.0.254:8000 {
      header_down X-Upstream "moode:8000"
    }
  }

  # 4) Everything else -> web UI
  handle {
    reverse_proxy 127.0.0.1:8101 {
      header_down X-Upstream "web:8101"
    }
  }
}

:80 {
  redir https://{host}{uri} permanent
}
```

Use this pattern when Alexa + browser + moOde resources must coexist under one public domain.

## Build upload zip (Alexa Developer Console)

From repo root, build a fresh zip for the **Code** tab upload:

```bash
rm -rf /tmp/nowplaying-lambda-staging
mkdir -p /tmp/nowplaying-lambda-staging/lambda
cp -R alexa /tmp/nowplaying-lambda-staging/lambda/
cp lambda_upload/lambda/index.js /tmp/nowplaying-lambda-staging/lambda/index.js

cd /tmp/nowplaying-lambda-staging
zip -qr "$OLDPWD/alexa-devconsole-upload.zip" lambda
```

Then in Alexa Developer Console:

1. Open your skill and press **Code**
2. Click Upload icon and browse to your zip `alexa-devconsole-upload.zip`
3. After the zip is uploaded you must still click **Deploy**

Important: zip root must contain `lambda/` (not loose files).

## How Alexa playback works with moOde

High-level flow:

- Alexa intent handlers call the now-playing API (`API_BASE`) with your `TRACK_KEY`.
- The API is the single source of truth for selection/queue logic and returns the resolved track/path metadata to Alexa.
- Alexa playback is file-based from the resolved path/URL; it is **not** a live audio stream from the MPD queue.
- Alexa responses are conversational wrappers around those API outcomes.
- Alexa playback is intended for use while in a different room than your moOde pi. Therefore moOde (MPD) does not play when the skill is in use.
- You can make changes to the queue while Alexa is playing.
- Alexa will respect shuffle setting (on or off). It tries to faithfully replicate how moOde would behave.


Queue-first behavior (prepped queue):

- If a queue is already active (has a head), opening/starting the skill will typically continue that queue flow.
- In that case, Alexa responds with behavior like **“starting your queue”** and proceeds with queue-driven playback.
- The API advances playback by consuming/removing queue head entries via queue endpoints so Alexa/UI/MPD remain in sync.
- Alexa wants to be in control, so the skill will not be "active" very long. You'll have to say "Alexa open (whatever your invocation name is) to get back to controlling the queue.
- You can pause, resume, and skip without having the skill open.

Empty-queue behavior:

- If the queue is empty, the skill does not have queued content to continue.
- It will typically prompt you for what to play next (artist/album/playlist/mix request).

Direct request behavior (no prepped queue required):

- You can invoke playback directly by voice, such as:
  - play artist
  - play album
  - play playlist
- The skill forwards these to API routes that build/replace MPD queue context and start playback.

“Plus” / mixed requests:

- Multi-artist phrasing using **plus** is supported (for example: “play a mix of artist Miles Davis plus John Coltrane”).
- Best reliability is usually a two-step flow:
  1. “Alexa, open Mood Audio.”
  2. “Play a mix of artist Miles Davis plus John Coltrane.”
- One-shot phrasing (`ask <skill> to ...`) may sometimes launch the skill without passing the tail request, depending on Alexa parsing.
- Parsed artist sets are sent to API queue-building routes, which produce the combined queue/mix.

## Correcting Alexa mis-hears (artist / album / playlist)

When Alexa hears the wrong name, you can teach corrections in `config.html`.

1. Open `http://<your-host>:8101/config.html`
2. Go to the **Alexa** section.
3. Find the "needs correction" lists (artist/album/playlist) populated from recent requests.
4. Enter the correction mapping (what Alexa heard → what your library expects).
5. Save config, then retry the same voice request.
