# moOde AirPlay metadata recovery

This runbook covers the moOde-side AirPlay metadata path used by Sonuvi.
Audio playback is owned by Shairport Sync; metadata and cover art travel
through its named FIFO to aplmeta.py, which writes aplmeta.txt.

## Observed failure

After the September 2026 moOde upgrade, aplmeta.txt stopped changing on
September 9. The live host had:

- shairport-sync.service active with an AirPlay TCP session;
- shairport-sync.conf advertising metadata support and
  /tmp/shairport-sync-metadata;
- an enabled, untracked aplmeta-reader.service waiting for that FIFO;
- the tracked airplay-json.service and airplay-json-watchdog.timer disabled;
- no /tmp/shairport-sync-metadata FIFO and no fresh metadata events.

This was service drift after the upgrade: the live reader owner no longer
matched the tracked service/watchdog pair, and the metadata producer/consumer
path had no verified single owner. Audio remained healthy, which made the
failure look like a display problem.

## Required service ownership

Keep exactly one reader:

- airplay-json.service
- /var/www/daemon/aplmeta-reader.sh
- airplay-json-watchdog.timer

The service runs as root because aplmeta.py atomically replaces the
moOde-owned /var/local/www/aplmeta.txt and writes cover files. Do not run a
second aplmeta-reader.service in parallel.

After installing the tracked overrides:

    sudo systemctl disable --now aplmeta-reader.service 2>/dev/null || true
    sudo systemctl daemon-reload
    sudo systemctl enable --now airplay-json.service
    sudo systemctl enable --now airplay-json-watchdog.timer

Do not restart Shairport Sync while an AirPlay session is playing unless a
brief audio interruption is explicitly acceptable. Stop and start AirPlay
from the source device to create a fresh session and metadata FIFO.

## Verification

While a newly started AirPlay track is playing:

    systemctl is-active shairport-sync.service airplay-json.service airplay-json-watchdog.timer
    test -p /tmp/shairport-sync-metadata
    stat /var/local/www/aplmeta.txt
    cat /var/local/www/aplmeta.txt
    curl -s http://127.0.0.1/command/?cmd=get_currentsong

The metadata timestamp must be from the current AirPlay session, and its
title, artist, album, duration, and cover path must change for a newly played
track. A reachable aplmeta.txt with an old timestamp is not success.

From the repository/admin machine, run the non-destructive end-to-end check:

    ./integrations/moode/health-check.sh moode-pi http://sonuvi.local:3101

Use the configured SSH host and Sonuvi API URL when those names differ. The
check verifies all of the following without changing the host:

- `airplay-json.service` and `airplay-json-watchdog.timer` are active;
- the known duplicate `aplmeta-reader.service` is not active;
- exactly one `shairport-sync-metadata-reader` process is active;
- `/tmp/shairport-sync-metadata` exists as a named pipe;
- `/var/local/www/aplmeta.txt` is fresh;
- Sonuvi `/now-playing` reports `isAirplay: true`, `state: play`, matching
  metadata, and an artwork URL.

It performs no enable/disable, restart, stop, write, or Shairport audio
configuration operation. Run it after playing or changing to a fresh AirPlay
track; an idle session cannot prove that new metadata reaches Sonuvi.

The Sonuvi API records the AirPlay-session boundary and rejects an aplmeta.txt
response whose Last-Modified predates the current session. That prevents
stale moOde metadata from being displayed if the host pipeline fails again.
