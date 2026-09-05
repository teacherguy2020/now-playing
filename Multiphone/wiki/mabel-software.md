# Mabel and software architecture

## Current role

Mabel is the modern central operator and record-room attendant for the Shyvers
Multiphone at Clem's Place in Seattle. She is a 22-year-old 1940s telephone
operator and record spinner: brisk, urgent, bright, lightly sassy, playful, and
professionally demure. The telephone-era style is flavor, not a switchboard
simulation. The caller is already connected; Mabel retrieves a real record from
the Multiphone library.

She speaks American English only and uses intelligible 1940s vernacular. Her
delivery is currently about 10% faster than ordinary conversation, while
confirmation digits are played separately at 1.2x so they sound like a quick
operator exchange rather than slow, robotic recitation. Affectionate forms of
address—honey, sugar, sweetheart, doll, sport, dear, kiddo, boss, champ, and
similar terms—are occasional seasoning, not a feature of every line.

Mabel must say **record**, **song**, or **tune**, never “selection.” She must
never say “dialing,” “connecting,” “transferring,” “routing,” or “putting you
through.” Clem's Place is the direct song-line destination/bar; when she says
“Clem's Place,” the intended emphasis is on **Clem's**, with “Place” lighter.

## System architecture

```text
coin event, terminal launch, or iPad handset
             ↓
Mac Mabel bridge :8788
             ↓
OpenAI Realtime or Responses session
       ├─ SSL 2 / browser microphone input
       ├─ generated Mabel audio
       └─ bounded, validated music actions
             ↓
Now Playing API :3101
             ↓
MPD/moOde queue and room playback
```

The Mac owns the OpenAI credential and session orchestration. Now Playing owns
catalog resolution, durable jukebox state, queue mutation, playback priority,
and MPD state. Mabel never receives unrestricted shell, HTTP, or MPD access.

## Local services

`operator/mabel_service.py` is the local bridge. Its current routes are:

| Route | Purpose |
| --- | --- |
| `POST /shyvers/call` | Create a coin/call session. |
| `POST /shyvers/response` | Validate and queue a numbered Multiphone record. |
| `POST /shyvers/surprise` | Choose a real numbered record privately for a surprise request. |
| `POST /shyvers/start-song` | Start a previously reserved MPD song after the heels handoff. |
| `POST /shyvers/offscript` | Execute one bounded VIP music or now-playing action. |
| `POST /shyvers/start` | Launch one iPad-Shortcut off-script Realtime process. |
| `POST /shyvers/start-normal` | Launch one iPad-Shortcut normal numbered Realtime process. |
| `POST /shyvers/speak` | Speak a bridge-generated message through fallback TTS. |
| `POST /shyvers/end` | Release a session. |
| `GET /health` | Bridge health check. |

The bridge validates the numbered range again even when the caller-side client
has already validated it. The current valid range is **1 through 170**. The
bridge retrieves protected Now Playing credentials from macOS Keychain. It also
has a `curl` retry path for transient launchd/network-route failures and avoids
redundant playback-start requests when Now Playing already reports playback.

The bridge and handset have persistent user LaunchAgents:

- `com.brianwis.mabel-service` on `127.0.0.1:8788`;
- `com.brianwis.mabel-handset` on HTTPS port `8790`.

After a reboot, verify `/health` on both services before testing. The Realtime
client still depends on the bridge being available first.

## Authoritative Mac terminal flow

`operator/mabel_realtime.mjs` is the reference experience for normal calls.
Start it with:

```sh
node operator/mabel_realtime.mjs --input :0
```

The current input is an SSL 2 at AVFoundation device `:0`. The client uses the
GA Realtime WebSocket API with 24 kHz PCM input/output and the `sage` voice.
Mabel response PCM is buffered into temporary WAV files and played locally with
macOS `afplay`; this is more reliable than leaving a raw streaming player open
between turns. The OpenAI key is read from Keychain, never from the command
line.

### Deterministic normal-line state machine

Normal numbered calls are deliberately handled locally rather than allowing
the model to invent a second number or bypass confirmation:

```text
greeting
  → completed caller transcript
  → digit-by-digit confirmation
  → explicit yes/right/OK, or correction and reconfirmation
  → short retrieval acknowledgment
  → heels
  → record reservation and playback handoff
  → title/artist announcement and optional reaction
  → goodbye and hang-up
```

The terminal prints completed caller transcription as `You: ...`. It waits for
the completed utterance before deciding a number, so a partial “one” cannot
prematurely replace “one twenty.” It understands digits, spoken digits, and
compound forms such as:

- “one fifty-five” → `155`;
- “one sixty-two” → `162`;
- “one hundred fifty” → `150`;
- “one eleven” → `111`.

After recognizing a possible number, Mabel repeats each digit as one connected
phrase and asks a real yes-or-no question with the digits last, for example:

```text
You’re requesting one-five-eight?
Just confirming one-five-eight?
That’s number one-five-eight?
I heard you say one-five-eight?
```

The confirmation is instructed to use rising question intonation on the final
digit, with no trailing “okay?”, “right?”, or “yeah?” and no pauses between the
digits. A short affirmative—yes, yeah, yep, right, OK, okay, K, “that’s right,”
and similar explicit confirmations—starts retrieval. Anything else stays in
the confirmation loop. A correction is briefly embarrassed and then repeated
in the same digit-by-digit form; no heels or playback begin before confirmation.

Numbers above 170 are rejected before confirmation with a redirect to a valid
number from 1 through 170. They are never silently reduced to a nearby record.
Once a number is confirmed, the microphone stays closed until the call ends.

### Timing and no-response behavior

The initial greeting-to-listening delay is effectively 0 ms after local audio
drains. A 1.4-second early-answer buffer can preserve an answer that starts
while the greeting is finishing, forwarding up to 1.6 seconds once listening
opens. Confirmation prompts have a shorter tail buffer of about 900 ms for the
same reason.

If Mabel is waiting and hears nothing, she uses a strict two-second escalation:

1. “What number, please?”
2. An increasingly concerned “Are you there?” reminder, sometimes using
   buddy, pal, sailor, sweetie, honey, or another approved address.
3. Microphone guidance: “Just talk into the top of the Multiphone…”
4. A final bad-connection warning.

Each reminder is fully spoken, cannot say “You got it,” “Sure thing,” or any
switchboard phrase, and cannot invent a device or phone number. After the final
two-second window, the call exits cleanly.

### Retrieval and playback handoff

After confirmation Mabel gives one short, businesslike acknowledgment, such as
“Lemme grab that off the shelf.” The line is clipped, urgent, slangy, and
unexcited: no exclamation point, pet name, joke, question, or goodbye.

The client then starts the heels cue and reserves the record while the heels
play. It waits for the heels to finish, starts the reserved record through
`/shyvers/start-song`, and only then requests Mabel's final announcement. This
keeps the record from starting before the footsteps and minimizes the pause
after the acknowledgment. A queued record is described as waiting on Mabel's
desk **for Clem's Place**, with the service-supplied number of spins ahead:

> “I added your record to the others waiting here on my desk for Clem's Place.
> It'll be coming up in five spins or so.”

The service's title and artist are authoritative. Mabel may add at most one
short subjective reaction—“Great choice,” “One of my faves,” or “Love this
one”—but she must not invent chart status, request counts, biographical facts,
or musical qualities.

Every successful numbered request is a one-call transaction: announce the
record, give one configured goodbye, play the hang-up click, release the
session, and exit. Mabel does not reopen listening for another request.

## Surprise picks

The terminal has a separate deterministic surprise route for requests such as:

- “You pick”;
- “You pick one for me”;
- “Surprise me”;
- “You choose”;
- “It's up to you”;
- “Your choice,” “you decide,” “dealer's choice,” “whatever you like,” or
  “I'll leave it to you.”

Artist-constrained forms such as “Pick me one by Frank Sinatra” are supported.
Mabel acts pleasantly surprised or flattered, says a brief hold line, and
chooses privately from real catalog data. She does not ask the caller to
confirm or disclose the number before returning. Surprise picks use the same
1–170 ceiling as ordinary calls; records above 170 remain available to other
catalog/controller workflows but are never selected by Mabel.

The surprise sequence is:

```text
flattered acknowledgment
  → heels
  → private catalog choice
  → reserved-record playback handoff
  → “I picked number …” plus title/artist
  → one-favorite opinion and optional factual nugget
  → goodbye and hang-up
```

During the heels, `mabel_service.py` may perform a short Wikipedia lookup for a
song-specific factual note. Notes are cached in
`state/mabel-song-facts.json`, accepted only when the candidate is a reliable
song/tune/recording match, and omitted when lookup is slow or uncertain. The
note is limited to a concise extract; Mabel is forbidden to guess if no note
is supplied.

## VIP and off-script music

The caller can say “off script” or “I'm a VIP” during a terminal call, or start
directly in VIP mode from the iPad. Mabel acknowledges the private line briefly and asks
“Whaddya wanna hear?” without explaining the categories to an advanced caller.
The bounded VIP actions are:

- play an album;
- play an artist, shuffled and capped at 50 tracks;
- play a saved playlist;
- build a multi-artist mix;
- report what is currently playing.

Album, artist, playlist, and mix actions are final transactions: Mabel confirms
the result, says goodbye, and ends the call. A now-playing query may continue
the conversation. All VIP playback actions set `excludeRating1`, treating
one-star tracks as the user's omission tool. Mixes also exclude holiday/
Christmas material by default, physically shuffle the combined queue with MPD
`shuffle`, disable MPD Random mode, and allocate capacity fairly so one artist
cannot consume the entire mix before later requested artists contribute.

The post-confirmation record-retrieval language remains separate from VIP
language. In particular, neither mode may describe a library action as dialing
or connecting a caller.

## iPad handset

`operator/mabel_web.py` serves the HTTPS browser handset at:

```text
https://10.0.0.210:8790/
```

The page provides three controls:

- **Call Mabel**: VIP/off-script voice mode;
- **Call Normal Mabel**: normal numbered mode for testing the 1–170 playlist;
- **Text Mabel**: VIP text mode.

For voice calls, Safari owns the iPad microphone and speaker, so a Bose or
Bluetooth microphone/speaker can travel with the caller. The Mac mints a
short-lived Realtime client secret and proxies bounded music actions; the
permanent OpenAI key never enters the browser. The VIP greeting is deterministic:

> “Thanks for calling the VIP line—Mabel here at Multiphone! Whaddya wanna hear?”

VIP calls skip the public ringback. Normal web calls use the normal greeting,
ringback, number confirmation, heels, record result, goodbye, and hang-up
behavior as far as the browser audio path permits. The terminal remains the
authoritative normal-mode reference; the web normal path is a useful secondary
test surface because Safari has stricter audio-playback and WebRTC timing rules.

Text Mabel uses a server-side Responses API conversation. It does not request
microphone permission or play voice audio; typed messages and Mabel's replies
appear in the page. It uses the same bounded VIP music tools and closes after a
successful music-load transaction.

The handset uses a local self-signed certificate under `state/`; Safari may
require one-time certificate approval. Its automatic goodbye handling waits for
the final audio before calling `/shyvers/end` and closing a voice call.

## Audio design

The terminal client uses these local assets in `sounds/`:

| File | Use | Current level |
| --- | --- | --- |
| `phone-ringback-answer-click.m4a` | Public-line ringback and answer | 12.5% |
| `high-heels-walk-2s.m4a` | Mabel walking to retrieve a record | 25% |
| `phone-hangup-click.m4a` | Call termination | 50% |
| `shyvers-office-ambiance.mp3` | Quiet looping room bed | 8% |

The office bed suggests a busy room of operators and loops beneath normal calls;
it stops before the hang-up click. VIP calls skip the public ringback but still
use the call's other applicable effects. Mabel's voice plays at 1.1x; confirmation
responses play at 1.2x. Effects retain their natural speed.

All local effects and voice playback use a serialized audio path. Microphone
input is suppressed during Mabel's speech and effects to prevent SoundSource,
Bose, or other routing from feeding Mabel back into OpenAI. `afplay` operations
have timeouts and shutdown cleanup so a stuck sound cannot strand FFmpeg capture
or prevent a later call from opening its microphone. Use `--sounds-dir` to point
the client at another asset directory and `--ambience-volume` to adjust the
office bed.

When the terminal call starts, Mabel ducks the Denon AVR4520CI by 20 discrete
`VolumeDown` presses through the generic Harmony Hub client. The WebSocket
client reconnects or retries if needed, and the number of successfully sent
presses is restored with matching `VolumeUp` presses four seconds after Mabel
begins her final spoken wrap-up; shutdown retains a fallback restore if final
audio is missing.
Use `--duck-steps 0` to disable ducking for a test call, or change the default
with `--duck-steps N`. The default inter-press spacing is 45 ms and can be
adjusted with `--duck-inter-press-ms N`.

## Fallback and operational recovery

`operator/mabel_voice.py` remains a fixed-window fallback. It records short
turns with FFmpeg, retries transient AVFoundation failures, transcribes with
OpenAI, uses a bounded conversation, and speaks through the local bridge. Its
normal capture window is three seconds and can be changed with `--seconds`.

For a normal terminal call after a reboot:

```sh
curl http://127.0.0.1:8788/health
node operator/mabel_realtime.mjs --input :0
```

If the bridge is absent, start it directly:

```sh
python3 operator/mabel_service.py --voice nova
```

The persistent LaunchAgents should normally restart the bridge and handset.
When audio is unresponsive, stop only stale Multiphone `ffmpeg`/`afplay`
processes first; if macOS Core Audio itself is frozen, a user-level Core Audio
restart or Mac reboot may be required.

## Hardware boundary and future automation

The eventual Pico/AS6500/magnet interface should report physical events or
state; it should not own conversation or playback control. Future VIP actions
such as lighting scenes, Harmony Hub activities, and room ambience belong behind
named, validated, reversible adapters. Mabel should never receive arbitrary
device or shell access.

The Mills Throne of Music is a separate display-only idea: a magnet on the
mechanical selector wheel can report the stack position to a Pico. An identical
moOde playlist can map that position to digital duplicate metadata and artwork
for bar TVs. The mechanical selection switches remain purely physical; Now
Playing must not attempt to control them.
