import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function sshArgsFor(user, host, extra = []) {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    ...extra,
    `${user}@${host}`,
  ];
}

function shQuoteArg(s) {
  const v = String(s ?? '');
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

async function sshBashLc({ user, host, script, timeoutMs = 20000, maxBuffer = 10 * 1024 * 1024 }) {
  return execFileP('ssh', [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(String(script || ''))], {
    timeout: timeoutMs,
    maxBuffer,
  });
}

export function registerConfigRatingsStickerRoutes(app, deps) {
  const { requireTrackKey } = deps;

  app.get('/config/ratings/sticker-status', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const stickerPath = String(process.env.MPD_STICKER_PATH || '/var/lib/mpd/sticker.sql');
      const pQ = shQuoteArg(stickerPath);
      const script = [
        `if [ -f ${pQ} ]; then sz=$(wc -c < ${pQ} 2>/dev/null || echo 0); echo "FOUND|${stickerPath}|$sz"; exit 0; fi`,
        `if sudo test -f ${pQ} 2>/dev/null; then sz=$(sudo wc -c < ${pQ} 2>/dev/null || echo 0); echo "FOUND|${stickerPath}|$sz"; exit 0; fi`,
        `echo "MISSING|${stickerPath}|0"`,
      ].join('; ');

      const { stdout } = await sshBashLc({ user: String(MOODE_SSH_USER || 'moode'), host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'), script, timeoutMs: 12000 });
      const raw = String(stdout || '').trim();
      const line = raw.split(/\r?\n/).map((x) => x.trim()).find((x) => x.startsWith('FOUND|') || x.startsWith('MISSING|')) || raw;
      const [state = 'MISSING', pathOut = stickerPath, sz = '0'] = String(line || '').split('|');

      if (state !== 'FOUND') {
        return res.json({ ok: true, exists: false, path: pathOut || stickerPath, size: 0 });
      }

      const size = Number(sz || 0) || 0;
      return res.json({ ok: true, exists: true, path: pathOut || stickerPath, size });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/ratings/sticker-backup', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const stickerPath = String(process.env.MPD_STICKER_PATH || '/var/lib/mpd/sticker.sql');
      const backupDir = String(process.env.MPD_STICKER_BACKUP_DIR || '/var/lib/mpd/sticker-backups');
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const backupPath = `${backupDir}/sticker-${ts}.sql`;
      const pQ = shQuoteArg(stickerPath);
      const dQ = shQuoteArg(backupDir);
      const bQ = shQuoteArg(backupPath);

      const script = [
        `if [ ! -f ${pQ} ]; then echo "MISSING"; exit 3; fi`,
        `sudo install -d -m 0775 ${dQ}`,
        `sudo cp -a ${pQ} ${bQ}`,
        `echo ${bQ}`,
      ].join('; ');

      const { stdout } = await sshBashLc({ user: String(MOODE_SSH_USER || 'moode'), host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'), script, timeoutMs: 15000 });
      const out = String(stdout || '').trim().replace(/^'+|'+$/g, '');
      if (!out || out === 'MISSING') {
        return res.status(400).json({ ok: false, error: `Sticker DB not found at ${stickerPath}` });
      }

      return res.json({ ok: true, stickerPath, backupPath: out });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/ratings/sticker-backups', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const backupDir = String(process.env.MPD_STICKER_BACKUP_DIR || '/var/lib/mpd/sticker-backups');
      const dQ = shQuoteArg(backupDir);
      const script = [
        `sudo install -d -m 0775 ${dQ}`,
        `for f in $(sudo ls -1t ${dQ}/*.sql 2>/dev/null | head -n 50); do sz=$(sudo wc -c < "$f" 2>/dev/null || echo 0); echo "$f|$sz"; done`,
      ].join('; ');
      const { stdout } = await sshBashLc({ user: String(MOODE_SSH_USER || 'moode'), host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'), script, timeoutMs: 12000 });
      const rows = String(stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const backups = rows.map((ln) => {
        const [pathOut = '', sizeOut = '0'] = String(ln || '').split('|');
        const p = String(pathOut || '').trim();
        const size = Number(sizeOut || 0) || 0;
        return { path: p, name: p.split('/').pop() || p, size };
      }).filter((b) => !!b.path);
      return res.json({ ok: true, backupDir, backups });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/ratings/sticker-restore', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const stickerPath = String(process.env.MPD_STICKER_PATH || '/var/lib/mpd/sticker.sql');
      const backupPath = String(req.body?.backupPath || '').trim();
      if (!backupPath) return res.status(400).json({ ok: false, error: 'backupPath is required' });

      const pQ = shQuoteArg(stickerPath);
      const bQ = shQuoteArg(backupPath);
      const script = [
        `if ! sudo test -f ${bQ}; then echo "MISSING_BACKUP"; exit 3; fi`,
        `sudo cp -a ${bQ} ${pQ}`,
        `sudo chown mpd:audio ${pQ} >/dev/null 2>&1 || true`,
        `sudo chmod 664 ${pQ} >/dev/null 2>&1 || true`,
        `echo OK`,
      ].join('; ');
      const { stdout } = await sshBashLc({ user: String(MOODE_SSH_USER || 'moode'), host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'), script, timeoutMs: 15000 });
      const out = String(stdout || '').trim();
      if (!out.includes('OK')) return res.status(400).json({ ok: false, error: `Restore failed for ${backupPath}` });

      return res.json({ ok: true, stickerPath, backupPath });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
