# Multiphone Pico trigger

`main.py` runs on the Pico 2 W, watches the optocoupler on GP15, and POSTs
to the Mac's Normal Mabel endpoint when a credit is detected.

Copy `secrets.example.py` to `secrets.py` on the Pico and fill in
`WIFI_SSID` and `WIFI_PASSWORD`. The filled-in `secrets.py` is intentionally
excluded from this repository. Keep it on the device only and never commit
credentials.

The status page is served on port 80. The Mabel endpoint is configured in
`main.py` as the private LAN address used by the Multiphone installation.
