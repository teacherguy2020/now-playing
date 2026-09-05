# Operations and testing

## Project layout

```text
Multiphone/
├── operator/
│   ├── main.py              # keyboard numbered-selection client
│   ├── mabel_console.py     # keyboard conversation driver
│   ├── mabel_service.py     # local HTTP/session/TTS bridge
│   ├── mabel_voice.py       # fixed-window microphone fallback
│   └── mabel_realtime.mjs   # live Realtime agent
├── sounds/                  # local call and record-retrieval effects
├── wiki/                    # editable Markdown source
├── site/                    # generated HTML
└── web/
    ├── build-wiki.py
    └── wiki-server.py
```

## Keychain credentials

There are two separate credentials:

| Credential | Keychain service | Account | Used by |
| --- | --- | --- | --- |
| Now Playing track key | `Shyvers Multiphone / Now Playing` | `multiphone-operator` | `main.py`, `mabel_service.py` |
| OpenAI API key | `Shyvers Multiphone / OpenAI` | `mabel-voice` | `mabel_voice.py`, Realtime client |

Set them up with the corresponding `--setup-keychain` or
`--setup-openai-key` command. Keys must not be placed in source files, URLs, or
command examples.

## Safe test sequence

From the project directory:

```sh
cd /Users/brianwis/.openclaw/workspace/Multiphone
python3 operator/main.py --number 1 --dry-run
```

For a real numbered selection, omit `--dry-run`. For a keyboard loop, omit
`--number`.

For the local Mabel bridge and Realtime voice agent, use two terminals:

```sh
# Terminal 1
python3 operator/mabel_service.py --voice nova

# Terminal 2
node operator/mabel_realtime.mjs --input :0
```

The SSL 2 is currently input `:0`. Confirm available AVFoundation devices with:

```sh
ffmpeg -hide_banner -f avfoundation -list_devices true -i ""
```

Realtime call effects are stored locally as:

```text
sounds/
├── phone-ringback-answer-click.m4a
├── high-heels-walk-2s.m4a
└── phone-hangup-click.m4a
```

They play through the Mac's default output with `afplay`. Mabel's microphone
input is suppressed while an effect or response is playing. The heels effect is
triggered after Mabel's brief retrieval acknowledgment for a valid numbered
selection; it is not played for conversational or off-script turns. Mabel's reply waits
for the effect to finish, and playback does not begin until the effect is done.
If the files are stored elsewhere, start Realtime
with `--sounds-dir /path/to/sounds`.

The `mabel_voice.py` fallback can be tested with `--seconds 5` when a longer
capture window is needed.

## Audio routing

Mabel's Realtime audio is played through the Mac's default output. The SSL 2 is
the current microphone interface. SoundSource may be used to apply a telephone
effect to Mabel's output; keep the microphone input pointed at the SSL 2 and
avoid routing Mabel's output back into that input. A practical starting point is
a band-limited telephone sound, but the EQ is an external audio choice rather
than part of the Mabel service.

## Now Playing deployment

The Now Playing API is deployed on the Pi at `10.0.0.4` on port `3101`; it
controls the configured MPD/moOde host. Changes to the Now Playing routes require
restarting the managed `now-playing.service` and verifying that exactly one
current process owns port 3101.

An orphaned old process once held the port while systemd repeatedly restarted the
service. The resulting symptoms included stale route behavior, wrong queue heads,
and apparent queue overflows. When behavior contradicts the deployed source,
check service status, process start time/restart count, listener ownership, and
the actual configured MPD host before changing queue logic.

An alert-only health watcher now checks service status, port ownership, listener
PID, and restart churn every 15 minutes. It does not auto-restart the service or
interrupt playback.

## VIP automation roadmap

VIP mode currently means expanded Mabel music controls from the iPad voice/text
handset. Lighting scenes, Harmony Hub activities, and other room automation
are future integrations. When implemented, test each as a named action with:

1. a validated allow-listed action name;
2. an explicit target/argument schema;
3. a bounded timeout and useful result;
4. a defined cleanup or restore behavior when the session ends.

Keep these actions on the Mac-side bridge. Do not send device credentials to
the iPad or expose the VIP start endpoint beyond the trusted LAN.

## Documentation build

Edit Markdown under `wiki/`, then regenerate the HTML site:

```sh
python3 web/build-wiki.py
python3 -m py_compile web/build-wiki.py web/wiki-server.py operator/*.py
node --check operator/mabel_realtime.mjs
```

The shared LAN wiki server serves this project at:

```text
http://<Mac-LAN-IP>:8765/multiphone/
```

The Seeburg wiki remains at `/wiki/` on the same server.
