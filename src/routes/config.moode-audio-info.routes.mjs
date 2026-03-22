import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MOODE_BASE_URL, MOODE_SSH } from '../config.mjs';

const execFileP = promisify(execFile);

function stripTags(s = '') {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s = '') {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeValue(key = '', value = '') {
  const k = String(key || '').toLowerCase();
  const v = String(value || '').trim();
  if (!v) return '—';
  if (v.toLowerCase() === 'not playing') return 'Not playing';
  if (k === 'crossfade' && /^seconds$/i.test(v)) return 'Off';
  if (k === 'crossfeed' && /^hz\s+db$/i.test(v)) return 'Off';
  return v;
}

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

function parseAudioInfoHtml(html = '') {
  const out = [];
  const src = String(html || '');
  if (!src) return out;

  let section = 'General';
  const tokenRe = /<div\s+class="h5">([\s\S]*?)<\/div>|<li[^>]*>[\s\S]*?<\/li>/gi;
  let m;
  while ((m = tokenRe.exec(src))) {
    if (m[1] != null) {
      section = decodeEntities(stripTags(m[1])) || section;
      continue;
    }
    const li = m[0] || '';
    const lm = li.match(/<span\s+class="left">([\s\S]*?)<\/span>/i);
    const rm = li.match(/<span\s+class="right">([\s\S]*?)<\/span>/i);
    if (!lm || !rm) continue;
    const key = decodeEntities(stripTags(lm[1] || ''));
    const value = normalizeValue(key, decodeEntities(stripTags(rm[1] || '')));
    if (!key) continue;
    out.push({ section, key, value });
  }
  return out;
}

export function registerConfigMoodeAudioInfoRoutes(app, deps = {}) {
  const requireTrackKey = deps.requireTrackKey;

  app.get('/config/moode/audio-info', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const base = String(MOODE_BASE_URL || '').trim().replace(/\/+$/, '');
      const url = `${base}/audioinfo.php`;

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
        return res.status(502).json({ ok: false, error: `audioinfo fetch failed (${r.status})`, url });
      }

      const rows = parseAudioInfoHtml(html);

      // Enrich fields that are often blank in audioinfo.php depending on moOde session context.
      try {
        const meta = await fetchMoodeDeviceMeta();
        for (const row of rows) {
          const sec = String(row?.section || '').trim();
          const key = String(row?.key || '').trim();
          const val = String(row?.value || '').trim();
          if (sec === 'Audio Device' && key === 'Device' && (!val || val === '—') && meta.deviceName) row.value = meta.deviceName;
          if (sec === 'Audio Device' && key === 'Pi model' && (!val || val === '—') && meta.piModel) row.value = meta.piModel;
        }
      } catch {}

      const sections = rows.reduce((acc, row) => {
        if (!acc[row.section]) acc[row.section] = [];
        acc[row.section].push({ key: row.key, value: row.value });
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
