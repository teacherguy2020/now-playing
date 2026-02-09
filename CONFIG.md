# Master Config (Now Playing)

Use a single config file for user-specific setup.

## Files

- `config/now-playing.config.example.json` → template
- `config/now-playing.config.json` → your real config (create from template)

## Quick start

```bash
cd now-playing
cp config/now-playing.config.example.json config/now-playing.config.json
# edit config/now-playing.config.json
```

## Key sections

1. `nodes`
   - Number of Pis
   - IPs and roles (`api`, `display`, `both`)
2. `ports`
   - API/UI ports
3. `alexa`
   - Enable/disable Alexa integration
   - Public domain (required if enabled)
4. `paths`
   - `musicLibraryRoot` (MPD library root, e.g. `/var/lib/mpd/music`)
   - `moodeUsbMount` (moOde-visible mount, e.g. `/media/SamsungMoode`)
   - `piMountBase` (local Pi mount base, e.g. `/mnt/SamsungMoode`)
   - Podcast/storage paths
5. `features`
   - Feature toggles per install

## Notes

- Do not commit secrets in config.
- Use env vars for sensitive values.
- Use `NOW_PLAYING_CONFIG_PATH` to point to a non-default config path.
