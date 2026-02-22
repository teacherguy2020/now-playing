# Random vs Shuffle

Important: these are different.

- **Random** (`mpd random on/off`): does not reorder queue; changes selection behavior.
- **Shuffle** (`mpd shuffle`): reorders queue entries.

## Project policy
- UI button is **Random**.
- Toggle should preserve continuity (no forced jump).
- Alexa-mode random-off may use remembered queue anchor position.
