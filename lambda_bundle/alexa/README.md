# Alexa Integration

To use Alexa with this project, you must create your own Amazon developer setup: create an Amazon Developer account, create/configure an Alexa skill for personal/home use, deploy the Lambda handler, and expose your API through a public HTTPS domain reachable by Echo devices.

For Alexa-hosted/Lambda runtime, this code executes in Amazon's environment (not your local repo), so you must provide required values via skill/Lambda environment variables.

The root project config is still the source of truth for your self-hosted API setup, but it is not automatically available inside Alexa runtime unless you explicitly package and load it.

## Files

- `lambda.alexa.js` – Lambda entrypoint shim
- `alexa/skill.js` – core skill logic
- `config/now-playing.config.json` – primary config source (`alexa.enabled`, `alexa.publicDomain`, etc.)

## Prerequisites

1. Amazon Developer account
2. Alexa custom skill created in the developer console
3. Public HTTPS domain for your API (valid cert, internet reachable)
4. Deployed now-playing API endpoint reachable from Alexa runtime

> Note: A separate AWS account is usually needed only if you manage Lambda directly. If you use Alexa-hosted skill flow, parts of hosting/runtime are provisioned from the Alexa console.

## Config model

Set Alexa options in the root project config for your API deployment context:

```json
"alexa": {
  "enabled": true,
  "publicDomain": "moode.YOUR-PUBLIC.DOMAIN.com",
  "skillId": "",
  "webhookPath": "/alexa"
}
```

The API can derive `PUBLIC_BASE_URL` from this domain.

## Lambda environment variables

These are required in Alexa-hosted skill settings / Lambda configuration because local config files are not auto-loaded there.

### Required

- `API_BASE` (e.g. `https://your-public-domain.example`)
- `TRACK_KEY` (must match API `TRACK_KEY`)

### Optional

- `PUBLIC_TRACK_BASE` (defaults to `API_BASE`)
- `ART_MODE` (`track` or `current`, default `track`)
- `HTTP_TIMEOUT_MS` (default `6000`)

## Interaction model (Build tab paste-in)

- Baseline model: see JSON below.
- Expanded v2 model (artist/track/shuffle/repeat/rating intents): `alexa/interaction-model.v2.json`

In Alexa Developer Console → **Build** → **JSON Editor**, you can paste an interaction model like this as a starting point:

```json
{
  "interactionModel": {
    "languageModel": {
      "invocationName": "mood audio",
      "intents": [
        { "name": "AMAZON.CancelIntent", "samples": [] },
        { "name": "AMAZON.HelpIntent", "samples": [] },
        { "name": "AMAZON.StopIntent", "samples": [] },
        { "name": "AMAZON.FallbackIntent", "samples": [] },
        { "name": "AMAZON.PauseIntent", "samples": [] },
        { "name": "AMAZON.ResumeIntent", "samples": [] },
        { "name": "AMAZON.NextIntent", "samples": [] },
        { "name": "AMAZON.NavigateHomeIntent", "samples": [] },
        {
          "name": "NowPlayingIntent",
          "slots": [],
          "samples": [
            "what's playing",
            "what is playing",
            "what song is this",
            "what track is this",
            "what's this",
            "what song is playing",
            "what track is playing",
            "name the song",
            "name the track",
            "who is this",
            "who is singing"
          ]
        },
        {
          "name": "PlayAlbumIntent",
          "slots": [
            { "name": "album", "type": "AMAZON.SearchQuery" }
          ],
          "samples": [
            "play album {album}",
            "play the album {album}",
            "start album {album}",
            "queue album {album}",
            "queue the album {album}",
            "play the album called {album}",
            "start the album called {album}"
          ]
        },
        {
          "name": "PlayPlaylistIntent",
          "slots": [
            { "name": "playlist", "type": "AMAZON.SearchQuery" }
          ],
          "samples": [
            "play playlist {playlist}",
            "play the playlist {playlist}",
            "start playlist {playlist}",
            "start the playlist {playlist}",
            "queue playlist {playlist}",
            "queue the playlist {playlist}",
            "play my playlist {playlist}",
            "start my playlist {playlist}",
            "play the playlist called {playlist}",
            "start the playlist called {playlist}"
          ]
        }
      ],
      "types": []
    }
  }
}
```

## Notes

- Queue advancement uses `/queue/advance` with `songid` preferred and `pos0` fallback.
- Alexa lifecycle writes `/alexa/was-playing` (`active`/`inactive`) so launch UX and UI overlays can reflect what Alexa is actually playing.
- Keep `TRACK_KEY` synchronized between Lambda and API.
- Do not hardcode personal domains or private infrastructure details in committed docs.
