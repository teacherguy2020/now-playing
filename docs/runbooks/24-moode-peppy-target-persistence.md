# moOde Peppy target persistence

## Problem

moOde upgrades can restore the stock Peppy configuration. For this
installation that reset:

- /etc/peppymeter/config.txt to
  http://localhost:8000/vumeter;
- /etc/peppyspectrum/config.txt without an HTTP target;
- the spectrum FIFO to the obsolete /home/pi/myfifosa path.

The result is a running VU process with no Now Playing feed and a failed
spectrum HTTP bridge.

## Tracked restore

The repository mirrors:

- /usr/local/bin/nowplaying-peppy-targets.sh
- /etc/systemd/system/nowplaying-peppy-targets.service

The service is idempotent and runs at boot before the enabled
peppy-spectrum-bridge.service. It enforces:

~~~text
VU:      http://nowplaying.local:3101/peppy/vumeter
Spectrum http://nowplaying.local:3101/peppy/spectrum
FIFO:    /tmp/peppyspectrum
~~~

It also enables peppymeter's HTTP output. The target can be correct while the
VU feed remains empty if moOde has reset output.http to False.

The first run preserves each original config as
config.txt.bak.nowplaying-peppy.

## Install or restore

~~~bash
sudo install -m 755 ops/moode-overrides/usr/local/bin/nowplaying-peppy-targets.sh \
  /usr/local/bin/nowplaying-peppy-targets.sh
sudo install -m 644 ops/moode-overrides/etc/systemd/system/nowplaying-peppy-targets.service \
  /etc/systemd/system/nowplaying-peppy-targets.service
sudo systemctl daemon-reload
sudo systemctl enable --now nowplaying-peppy-targets.service
sudo systemctl restart peppymeter.service
sudo systemctl restart peppy-spectrum-bridge.service
~~~

## Verification

~~~bash
systemctl is-active nowplaying-peppy-targets.service
systemctl is-active peppymeter.service
systemctl is-active peppy-spectrum-bridge.service
grep -nE 'target.url|update.period|pipe.name' \
  /etc/peppymeter/config.txt /etc/peppyspectrum/config.txt
curl -s http://nowplaying.local:3101/peppy/vumeter
curl -s http://nowplaying.local:3101/peppy/spectrum
~~~

The API responses should become fresh while audio is active. Spectrum should
contain a non-empty bins array once the FIFO producer is active.
