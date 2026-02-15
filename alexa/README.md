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

## Notes

- Keep Alexa and API track key values in sync.
- Do not commit private domains/tokens.
- After API route changes, re-verify queue advancement and now-playing narration flows.
