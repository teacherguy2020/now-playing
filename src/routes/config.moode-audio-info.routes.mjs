import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MOODE_BASE_URL, MOODE_SSH } from '../config.mjs';
import {
  buildQobuzAudioInfo,
  normalizeAlsaHardwareProbe,
  parseAudioInfoHtml,
} from '../lib/audio-info.mjs';

const execFileP = promisify(execFile);

async function fetchMoodeDeviceMeta() {
  const out = { deviceName: '', piModel: '' };
  const ssh = String(MOODE_SSH || '').trim();
  if (!ssh) return out;
  try {
    const cmd = "bash -lc 'sqlite3 /var/local/www/db/moode-sqlite3.db \"select value from cfg_system where param=\\\"adevname\\\" limit 1;\" 2>/dev/null || true'";
    const r = await execFileP('ssh', ['-o', 'BatchMode=yes', ssh, cmd], { timeout: 2200, maxBuffer: 128 * 1024 });
    out.deviceName = String(r?.stdout || '').trim();
  } catch {}
  try {
    const cmd = "bash -lc 'tr -d \\\"\\0\\\" </proc/device-tree/model 2>/dev/null || cat /proc/device-tree/model 2>/dev/null || true'";
    const r = await execFileP('ssh', ['-o', 'BatchMode=yes', ssh, cmd], { timeout: 2200, maxBuffer: 128 * 1024 });
    out.piModel = String(r?.stdout || '').replace(/\u0000/g, '').trim();
  } catch {}
  return out;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export async function probeAlsaHardware({
  ssh = MOODE_SSH,
  execFileImpl = execFileP,
} = {}) {
  const target = String(ssh || '').trim();
  if (!target) return { available: false, devices: [], activeDevice: null, state: 'unavailable' };

  const script = [
    'for cardDir in /proc/asound/card*; do',
    '  [ -d "$cardDir" ] || continue',
    '  card="${cardDir##*/}"',
    '  id="$(tr -d "\\n" < "$cardDir/id" 2>/dev/null || true)"',
    '  printf "CARD\\t%s\\t%s\\n" "$card" "$id"',
    '  for pcmDir in "$cardDir"/pcm*p; do',
    '    [ -d "$pcmDir/sub0" ] || continue',
    '    statusFile="$pcmDir/sub0/status"',
    '    hwFile="$pcmDir/sub0/hw_params"',
    '    state="$(sed -n "s/^state:[[:space:]]*//p" "$statusFile" 2>/dev/null | head -n 1)"',
    '    stateLc="$(printf "%s" "$state" | tr "[:upper:]" "[:lower:]")"',
    '    [ "$stateLc" != "closed" ] && [ -n "$stateLc" ] || continue',
    '    name="$(sed -n "s/^name:[[:space:]]*//p" "$pcmDir/info" 2>/dev/null | head -n 1)"',
    '    printf "PCM\\t%s\\t%s\\t%s\\t%s\\n" "$pcmDir" "$card" "$id" "$name" "$state"',
    '    while IFS= read -r line; do printf "HW\\t%s\\t%s\\n" "$pcmDir" "$line"; done < "$hwFile" 2>/dev/null || true',
    '    while IFS= read -r line; do printf "STATUS\\t%s\\t%s\\n" "$pcmDir" "$line"; done < "$statusFile" 2>/dev/null || true',
    '  done',
    'done',
  ].join('\n');

  try {
    const result = await execFileImpl(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', target, `bash -lc ${shellQuote(script)}`],
      { timeout: 5000, maxBuffer: 512 * 1024 },
    );
    return normalizeAlsaHardwareProbe(String(result?.stdout || ''));
  } catch {
    return { available: false, devices: [], activeDevice: null, state: 'unavailable' };
  }
}

export function registerConfigMoodeAudioInfoRoutes(app, deps = {}) {
  const requireTrackKey = deps.requireTrackKey;
  const getQobuzNowPlaying = deps.getQobuzNowPlaying;
  const readAlsaHardware = deps.probeAlsaHardware || (() => probeAlsaHardware());
  const getDeviceMeta = deps.fetchMoodeDeviceMeta || fetchMoodeDeviceMeta;

  app.get('/config/moode/audio-info', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const base = String(MOODE_BASE_URL || '').trim().replace(/\/+$/, '');
      const url = `${base}/audioinfo.php`;

      let qobuz = null;
      try {
        qobuz = typeof getQobuzNowPlaying === 'function' ? await getQobuzNowPlaying() : null;
      } catch {}

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4500);
      let r;
      try {
        r = await fetch(url, { cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(t);
      }
      const html = await r.text().catch(() => '');
      if (!r.ok || !html) {
        if (!qobuz?.active) {
          return res.status(502).json({ ok: false, error: `audioinfo fetch failed (${r.status})`, url });
        }
      }

      let rows = parseAudioInfoHtml(html);

      // Enrich fields that are often blank in audioinfo.php depending on moOde session context.
      try {
        const meta = await getDeviceMeta();
        for (const row of rows) {
          const sec = String(row?.section || '').trim();
          const key = String(row?.key || '').trim();
          const val = String(row?.value || '').trim();
          if (sec === 'Audio Device' && key === 'Device' && (!val || val === '—') && meta.deviceName) row.value = meta.deviceName;
          if (sec === 'Audio Device' && key === 'Pi model' && (!val || val === '—') && meta.piModel) row.value = meta.piModel;
        }
      } catch {}

      let audio = null;
      if (qobuz?.active) {
        const alsa = await readAlsaHardware().catch(() => null);
        const enriched = buildQobuzAudioInfo({ moodeRows: rows, qobuz, alsa });
        rows = enriched.rows;
        audio = enriched.audio;
      }

      const sections = rows.reduce((acc, row) => {
        if (!acc[row.section]) acc[row.section] = [];
        const { section: _section, ...rest } = row;
        acc[row.section].push(rest);
        return acc;
      }, {});

      const view = String(req.query?.view || 'sections').trim().toLowerCase();
      const payload = {
        ok: true,
        sourceUrl: url,
        rowCount: rows.length,
        fetchedAt: new Date().toISOString(),
        view,
      };
      if (audio) {
        payload.playback = {
          source: 'qobuz-connect',
          renderer: 'pibuz',
          state: String(qobuz?.state || '').trim().toLowerCase() || 'unknown',
          active: true,
        };
        payload.audio = audio;
      }
      if (view === 'rows') {
        payload.rows = rows;
      } else if (view === 'both' || view === 'all') {
        payload.rows = rows;
        payload.sections = sections;
      } else {
        payload.sections = sections;
      }

      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
