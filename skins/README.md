# Peppy skins (source of truth)

Each skin folder contains:
- `meter.json` — editable canonical params
- local asset files used for export/deploy

Use:
1. `node scripts/export-peppymeter-skins.mjs`
2. `scripts/deploy-peppy-skins-to-moode.sh`

This exports native `meters.txt` blocks + assets for moOde `/opt/peppymeter/1280x400`.
