# Alexa

![Alexa tab](./images/03-alexa.jpg)

Alexa tab manages voice lifecycle state and correction maps.

## Core responsibilities
- Alexa integration on/off
- correction dictionaries (artist/album/playlist aliases)
- recent intent history and command outcomes
- helper phrase guidance for users

## Lifecycle model
- Alexa playback can be external to MPD current queue item.
- `/alexa/was-playing` tracks active lifecycle and remembered context.
- Recent work added remembered removed position (`removedPos0/removedPos1`) used for random-off continuity anchoring.

## Notes
- In Alexa mode, queue semantics differ: queue head is effectively queued-next.
- Hero controls are reduced, with Random still available.
