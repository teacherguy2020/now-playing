# Alexa

Purpose: Alexa lifecycle integration and UI overlay behavior.

## Covers
- `/track` and Alexa skill flow
- `/alexa/was-playing` lifecycle state
- Alexa Mode rendering rules

## Important behaviors
- Alexa playback can be external to MPD current item.
- Queue "head" in Alexa mode is the queued-next anchor.
- Lifecycle state now stores `removedPos0/removedPos1` for continuity logic.
