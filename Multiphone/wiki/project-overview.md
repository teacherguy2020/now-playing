# Project overview

## Objective

Restore and preserve an original Shyvers Multiphone while creating a reversible
modern equivalent of the central music service it originally accessed.

The intended experience is:

```text
customer inserts nickel
        ↓
Multiphone signals the service
        ↓
Mabel answers and accepts a request
        ↓
catalog number resolves deterministically
        ↓
Now Playing receives a jukebox-priority selection
        ↓
MPD/moOde plays it through the room system
```

## Design boundaries

- The antique unit remains the customer-facing Multiphone.
- The Pico, if used, is an isolated coin-event detector, not the central queue
  manager.
- Mabel must not invent catalog-number mappings.
- The request conversation should be brief; playback continues independently.
- Modern additions should be removable without drilling, cutting, or permanently
  altering original wiring.

## Current state

The Multiphone has been purchased but has not yet arrived. Hardware-dependent
decisions are intentionally deferred. The Mac-side software vertical slice is
working with keyboard and voice simulation:

- A 170-track `Multiphone Playlist` is available in Now Playing.
- The Mac operator can submit numbered selections through a Keychain-authenticated
  client.
- Mabel can run as a local HTTP bridge, use OpenAI Realtime for live conversation,
  and send validated selections to Now Playing.
- A Pico is not required for development. The eventual hardware controller may
  POST a coin event to the Mac at `/shyvers/call`.

The antique unit remains awaiting delivery. Its coin circuit, microphone, speaker,
lamps, and wiring are still unexamined.
