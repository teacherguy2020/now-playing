# Alexa

![Alexa tab](./images/03-alexa.jpg)

Use this page to manage Alexa integration and voice command behavior.

## What this page is for
- Enabling/disabling Alexa integration
- Managing correction maps (artist/album/playlist spellings)
- Reviewing recent Alexa command outcomes

## What the main controls do
- **Enable Alexa integration**: turns Alexa handling on/off.
- **Save settings**: saves Alexa/domain settings.
- **Save manual JSON edits**: saves correction map edits.
- **Clear** buttons: clear recent history lists.

## Common tasks
### Fix misheard names
1. Add correction in artist/album/playlist aliases
2. Save manual JSON edits
3. Retry voice command

### Confirm Alexa activity
- Check “Recently Heard” lists for command results
- Verify status labels (`ok`, `attempt`, `not-found`)

## Behavior note
In Alexa mode, queue behavior is different from normal playback. The UI treats queue head as queued-next.

## Full phrase coverage
All current Alexa utterance samples are documented in:
- [Alexa phrase reference](./13-alexa-phrases.md)

That file is sourced from `alexa/interaction-model.v2.json` so docs stay aligned with the interaction model.
