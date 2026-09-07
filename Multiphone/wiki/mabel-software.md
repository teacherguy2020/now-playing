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
confirmation digits play at 1.2x so they sound like a quick operator exchange
rather than slow, robotic recitation. Affectionate forms of
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

The bridge persists the completion time of the last call in the user's local
Mabel state file. If a new call begins within five minutes, the Realtime client
uses one of five brief “back so soon?” greetings. The elapsed time is calculated locally;
it is not sent to the model as a separate lookup or exposed as a timestamp.

The bridge and handset have persistent user LaunchAgents. The Mabel bridge is
configured as an interactive Aqua-session job so endpoint-launched capture
receives the SSL 2 signal just as the terminal process does:

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

The current input is an SSL 2 at AVFoundation device `:0`. The client converts
the capture stream to mono 24 kHz PCM and uses the GA Realtime WebSocket API
with 24 kHz PCM input/output and the `sage` voice.
Mabel response PCM is buffered into temporary WAV files and played locally with
macOS `afplay`; this is more reliable than leaving a raw streaming player open
between turns. The OpenAI key is read from Keychain, never from the command
line.

Before a number is supplied, work-related questions such as “How's it going?”
receive one brief, period-style joke about Mabel's busy record-room shift,
followed immediately by a clear “Number, please,” “What number, please,” or
“Which number, please?” redirect. Other casual conversation gets the shorter
number redirect without the joke.

### Deterministic normal-line state machine

Normal numbered calls are deliberately handled locally rather than allowing
the model to invent a second number or bypass confirmation:

```text
greeting
  → completed caller transcript
  → digit-by-digit confirmation
  → affirmative signal, or correction and reconfirmation
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

Explicit request phrasing is recognized locally as well, including “Play me
122,” “I'd like to hear 143,” and “How about number one twenty-nine?” These
forms always enter digit-by-digit confirmation; Mabel must never say that she
is connecting, routing, or putting the caller through before confirmation.
Before a number is selected, any clear utterance containing “choose” or
“surprise” enters the local surprise flow, with a small guard for explicit
negation such as “I don't want a surprise.” Numeric requests are evaluated
first, so a number-containing request cannot be mistaken for a surprise pick.

After recognizing a possible number, Mabel repeats each digit as one connected
phrase and asks a real yes-or-no question with the digits last, for example:

```text
You’re requesting one-five-eight?
Just confirming one-five-eight?
That’s number one-five-eight?
```

The confirmation must always end with a clearly audible high-rising question
intonation on the final digit, followed by a tiny beat so the caller can hear
that Mabel is waiting for a reply. It must never fall into a statement or
directive. There are no trailing “okay?”, “right?”, or “yeah?” and no pauses
between the digits. A clear affirmative signal—“yes,” “yeah,” “yep,” “yup,”
“sure,” “sure am,” “that’s what I said,” “that’s the one,” “that’s it,”
“correct,” “affirmative,” or “uh-huh”—anywhere in the caller's confirmation
turn starts retrieval. A bare
“please” is also treated as an affirmative fallback in confirmation mode, to
recover a clipped “yes, please.” An
explicit “no”/“nope,” a correction, or a different number takes precedence if
both appear in one transcript; a repeated pending number with an affirmative
still confirms. Anything else stays in the confirmation loop. A correction is
briefly embarrassed and then repeated in the same digit-by-digit form; no heels
or playback begin before confirmation. Short VAD fragments such as “what’s,”
“wait,” or “hold on” are held without starting another model reply.

Numbers above 170 are rejected before confirmation with a redirect to a valid
number from 1 through 170. They are never silently reduced to a nearby record.
Once a number is confirmed, the microphone stays closed until the call ends.

### Timing and no-response behavior

The initial greeting-to-listening delay is effectively 0 ms after local audio
drains. Normal prompts use a short 200 ms early-answer tail so a caller can
begin naturally as Mabel finishes speaking. Confirmation prompts use no tail
buffer: the microphone opens only after Mabel's confirmation audio drains,
preventing her spoken digits from being re-transcribed as the caller's
correction.

If Mabel is waiting and hears nothing, she uses a strict two-second escalation:

1. “Number, please,” “What number, please?” or “Which number, please?”
2. An increasingly concerned “Are you there?” reminder, sometimes using
   buddy, pal, sailor, sweetie, honey, or another approved address.
3. Microphone guidance: “Just talk into the top of the Multiphone…”
4. A final bad-connection warning.

Each reminder is fully spoken, cannot say “You got it,” “Sure thing,” or any
switchboard phrase, and cannot invent a device or phone number. After the final
two-second window, the call exits cleanly.

### Retrieval and playback handoff

After confirmation Mabel generates one brief, businesslike acknowledgment in
the voice of an operator fetching the exact record from the shelf. The prompt
allows natural variation, but tightly limits the role: she may say she is
fetching, grabbing, or taking the record from the shelf. She must not describe
or imply a connection, transfer, routing, dialing, or putting anyone through;
ask whether the caller wants anything else; introduce a new topic; mention
record facts; or say goodbye. The local client owns the subsequent effects,
record reservation, and service result.

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

When the service reports that a record started immediately, Mabel varies only
the approved playback wording: “It's playing now,” “It's spinning now,” “I
just dropped the needle on it,” “That one's on the turntable now,” “Your record
is spinning,” or “The music is underway.” The code owns the playback fact; the
phrasing cannot change it.

Every successful numbered request is a one-call transaction: announce the
record, give one configured goodbye, play the hang-up click, release the
session, and exit. Mabel does not reopen listening for another request.

## Surprise picks

The terminal has a separate deterministic surprise route for requests such as:

- “You pick”;
- “You pick one for me”;
- “Surprise me”;
- “I'll let you surprise me”;
- “I'll let you choose” or “I'll let you pick one”;
- “You choose”;
- “It's up to you”;
- “Your choice,” “you decide,” “dealer's choice,” “whatever you like,” or
  “I'll leave it to you.”

Artist-constrained forms such as “Pick me one by Frank Sinatra” are supported.
Before a number is selected, any clear utterance containing “choose” or
“surprise” enters the deterministic surprise route, with a small negation guard
for phrases such as “I don't want a surprise.”
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
  → one-favorite opinion based only on the local catalog result
  → goodbye and hang-up
```

Surprise announcements use only the local Multiphone catalog result for the
number, title, and artist, plus one brief subjective reaction. Mabel does not
perform external song lookups or add outside biographical, chart, popularity,
or musical facts.

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
use the call's other applicable effects. Mabel's voice plays at 1.1x and
confirmation responses at 1.2x. Effects retain their natural speed. The
terminal ducks the Denon with 40 rapid `VolumeDown` presses at 0 ms spacing,
then restores the exact successfully sent count at 5 ms spacing, beginning
four seconds after final wrap-up starts; shutdown restoration remains the
fallback.

### Realtime cost controls

The client deliberately leaves `max_output_tokens` unset. Artificially small
caps previously cut generated audio off mid-sentence. Affordability comes from
keeping number parsing, confirmation state, queueing, playback handoff, and
call termination local; closing the microphone while Mabel speaks; using local
effects; and ending the session promptly. Realtime is used for brief
personality-rich phrasing, while code remains authoritative for numbers,
catalog facts, queue positions, and service results. Stable tone and safety
rules live in the session instructions so they can benefit from cached input.
At shutdown, the terminal prints the aggregate usage reported by Realtime,
including response count, input/output/total tokens, cached input tokens, and
audio-token subtotals when the API supplies them.

During recent audio debugging, disabling heels, SoundSource processing, and
alternate `ffplay` playback did not resolve truncation; removing the explicit
output-token caps did. Keep `afplay` as the active player unless new evidence
shows a regression. The optional `--footsteps off` flag remains useful for
isolating future tests.

All local effects and voice playback use a serialized audio path. Microphone
input is suppressed during Mabel's speech and effects to prevent SoundSource,
Bose, or other routing from feeding Mabel back into OpenAI. `afplay` operations
have timeouts and shutdown cleanup so a stuck sound cannot strand FFmpeg capture
or prevent a later call from opening its microphone. Use `--sounds-dir` to point
the client at another asset directory and `--ambience-volume` to adjust the
office bed.

When the terminal call starts, Mabel ducks the Denon AVR4520CI by 40 discrete
`VolumeDown` presses rapidly through the generic Harmony Hub client. The WebSocket
client reconnects or retries if needed, and the number of successfully sent
presses is restored with matching `VolumeUp` presses four seconds after Mabel
begins her final spoken wrap-up; shutdown retains a fallback restore if final
audio is missing.
Use `--duck-steps 0` to disable ducking for a test call, or change the default
with `--duck-steps N`. Ducking uses a zero-delay burst by default and can be
slowed with `--duck-inter-press-ms N`. Fade-up restoration remains 5 ms by
default and can be adjusted independently with `--restore-inter-press-ms N`.

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
