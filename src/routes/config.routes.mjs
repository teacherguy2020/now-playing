// src/routes/config.routes.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

// ----------------------------
// Config helpers
// ----------------------------

function pickPublicConfig(cfg) {
  const c = cfg || {};
  const n = c.notifications || {};
  const tn = n.trackNotify || {};
  const po = n.pushover || {};

  const cfgLastfm = String(c.lastfmApiKey || '').trim();
  const envLastfm = String(process.env.LASTFM_API_KEY || '').trim();

  return {
    projectName: c.projectName || 'now-playing',
    trackKey: String(process.env.TRACK_KEY || c.trackKey || '1029384756'),
    environment: c.environment || 'home',
    timezone: c.timezone || 'America/Chicago',
    ports: c.ports || { api: 3101, ui: 8101 },
    lastfm: {
      configured: Boolean(envLastfm || cfgLastfm),
    },
    alexa: {
      enabled: Boolean(c.alexa?.enabled ?? true),
      publicDomain: String(c.alexa?.publicDomain || ''),
      skillId: String(c.alexa?.skillId || ''),
      webhookPath: String(c.alexa?.webhookPath || '/alexa'),
      artistAliases: c.alexa?.artistAliases || {},
      albumAliases: c.alexa?.albumAliases || {},
      playlistAliases: c.alexa?.playlistAliases || {},
      unresolvedArtists: Array.isArray(c.alexa?.unresolvedArtists) ? c.alexa.unresolvedArtists : [],
      heardArtists: Array.isArray(c.alexa?.heardArtists) ? c.alexa.heardArtists : [],
      unresolvedAlbums: Array.isArray(c.alexa?.unresolvedAlbums) ? c.alexa.unresolvedAlbums : [],
      heardAlbums: Array.isArray(c.alexa?.heardAlbums) ? c.alexa.heardAlbums : [],
      unresolvedPlaylists: Array.isArray(c.alexa?.unresolvedPlaylists) ? c.alexa.unresolvedPlaylists : [],
      heardPlaylists: Array.isArray(c.alexa?.heardPlaylists) ? c.alexa.heardPlaylists : [],
    },
    notifications: {
      trackNotify: {
        enabled: !!tn.enabled,
        pollMs: Number(tn.pollMs || 3000),
        dedupeMs: Number(tn.dedupeMs || 15000),
        alexaMaxAgeMs: Number(tn.alexaMaxAgeMs || 21600000),
      },
      pushover: {
        token: String(po.token || ''),
        userKey: String(po.userKey || ''),
      },
    },
    paths: c.paths || {},
    mpd: {
      host: String(c.mpd?.host || ''),
      port: Number(c.mpd?.port || 6600),
    },
    moode: {
      sshHost: String(c.moode?.sshHost || ''),
      sshUser: String(c.moode?.sshUser || ''),
      baseUrl: String(c.moode?.baseUrl || ''),
    },
    runtime: {
      publicBaseUrl: String(c.runtime?.publicBaseUrl || ''),
      trackCacheDir: String(c.runtime?.trackCacheDir || ''),
      artCacheDir: String(c.runtime?.artCacheDir || ''),
      artCacheLimit: Number(c.runtime?.artCacheLimit || 0),
    },
    features: {
      podcasts: Boolean(c.features?.podcasts ?? true),
      ratings: Boolean(c.features?.ratings ?? true),
      radio: Boolean(c.features?.radio ?? true),
    },
  };
}

function withEnvOverrides(cfg) {
  const out = pickPublicConfig(cfg);
  const cfgLastfm = String((cfg || {}).lastfmApiKey || '').trim();
  const envLastfm = String(process.env.LASTFM_API_KEY || '').trim();

  if (process.env.TRACK_NOTIFY_ENABLED != null) {
    out.notifications.trackNotify.enabled = /^(1|true|yes|on)$/i.test(String(process.env.TRACK_NOTIFY_ENABLED));
  }
  if (process.env.TRACK_NOTIFY_POLL_MS) {
    out.notifications.trackNotify.pollMs =
      Number(process.env.TRACK_NOTIFY_POLL_MS) || out.notifications.trackNotify.pollMs;
  }
  if (process.env.TRACK_NOTIFY_DEDUPE_MS) {
    out.notifications.trackNotify.dedupeMs =
      Number(process.env.TRACK_NOTIFY_DEDUPE_MS) || out.notifications.trackNotify.dedupeMs;
  }
  if (process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) {
    out.notifications.trackNotify.alexaMaxAgeMs =
      Number(process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) || out.notifications.trackNotify.alexaMaxAgeMs;
  }

  if (process.env.PUSHOVER_TOKEN) out.notifications.pushover.token = String(process.env.PUSHOVER_TOKEN);
  if (process.env.PUSHOVER_USER_KEY) out.notifications.pushover.userKey = String(process.env.PUSHOVER_USER_KEY);

  if (process.env.MPD_HOST) out.mpd.host = String(process.env.MPD_HOST);
  if (process.env.MPD_PORT) out.mpd.port = Number(process.env.MPD_PORT) || out.mpd.port;
  if (process.env.MOODE_SSH_HOST) out.moode.sshHost = String(process.env.MOODE_SSH_HOST);
  if (process.env.MOODE_SSH_USER) out.moode.sshUser = String(process.env.MOODE_SSH_USER);
  if (process.env.MOODE_BASE_URL) out.moode.baseUrl = String(process.env.MOODE_BASE_URL);
  if (process.env.PUBLIC_BASE_URL) out.runtime.publicBaseUrl = String(process.env.PUBLIC_BASE_URL);

  out.lastfm = { configured: Boolean(envLastfm || cfgLastfm) };

  return out;
}

function validateConfigShape(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') errors.push('config must be an object');
  if (!cfg.ports || typeof cfg.ports.api !== 'number' || typeof cfg.ports.ui !== 'number') {
    errors.push('ports.api and ports.ui must be numbers');
  }
  if (cfg.alexa?.enabled && !String(cfg.alexa?.publicDomain || '').trim()) {
    errors.push('alexa.publicDomain is required when alexa.enabled=true');
  }
  return errors;
}

// ----------------------------
// MPD parsing helpers (kept for compatibility)
// ----------------------------

function parseMpdBlocks(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line0 of lines) {
    const line = String(line0 || '').trim();
    if (!line || line === 'OK' || line.startsWith('ACK')) continue;
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'file') {
      if (cur && cur.file) out.push(cur);
      cur = { file: v, genres: [] };
      continue;
    }
    if (!cur) cur = { genres: [] };
    if (k === 'genre') cur.genres.push(v);
    cur[k] = v;
  }
  if (cur && cur.file) out.push(cur);
  return out;
}

// ----------------------------
// SSH helpers (for collage preview temp artifacts)
// ----------------------------

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
  return `'${v.replace(/'/g, `'\"'\"'`)}'`;
}

async function sshBashLc({ user, host, script, timeoutMs = 20000, maxBuffer = 10 * 1024 * 1024 }) {
  return execFileP('ssh', [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(String(script || ''))], {
    timeout: timeoutMs,
    maxBuffer,
  });
}

async function sshCatBase64({ user, host, remotePath, timeoutMs = 20000, maxBuffer = 50 * 1024 * 1024 }) {
  const pQ = shQuoteArg(remotePath);

  // BusyBox base64: avoid "--", strip newlines.
  const cmd =
    'set -euo pipefail; ' +
    `p=${pQ}; ` +
    'if [ ! -s "$p" ]; then echo "ERROR: preview file missing or empty: $p" >&2; exit 2; fi; ' +
    'if command -v base64 >/dev/null 2>&1; then base64 "$p" | tr -d "\\n"; exit 0; fi; ' +
    'if command -v openssl >/dev/null 2>&1; then openssl base64 -A -in "$p"; exit 0; fi; ' +
    'echo "ERROR: neither base64 nor openssl available on remote host" >&2; exit 127;';

  const { stdout } = await execFileP(
    'ssh',
    [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(cmd)],
    { timeout: timeoutMs, maxBuffer }
  );

  return String(stdout || '').trim();
}

function makeVibeJobId() {
  return `vibe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ----------------------------
// Routes
// ----------------------------

export function registerConfigRoutes(app, deps) {
  const { requireTrackKey, log, mpdQueryRaw, getRatingForFile, setRatingForFile, mpdStickerGetSong } = deps;
  const vibeJobs = new Map();

  const configPath =
    process.env.NOW_PLAYING_CONFIG_PATH || path.resolve(process.cwd(), 'config/now-playing.config.json');

  async function resolveLastfmApiKey() {
    const envKey = String(process.env.LASTFM_API_KEY || '').trim();
    if (envKey) return envKey;
    try {
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      return String(cfg?.lastfmApiKey || '').trim();
    } catch {
      return '';
    }
  }

  // --- runtime config ---
  app.get('/config/runtime', async (req, res) => {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return res.json({ ok: true, configPath, config: withEnvOverrides(cfg), fullConfig: cfg });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime/check-env', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const mpdHost = String(req.body?.mpdHost || MPD_HOST || '10.0.0.254').trim();
      const mpdPort = Math.max(1, Math.min(65535, Number(req.body?.mpdPort || 6600) || 6600));
      const sshHost = String(req.body?.sshHost || MOODE_SSH_HOST || mpdHost || '10.0.0.254').trim();
      const sshUser = String(req.body?.sshUser || MOODE_SSH_USER || 'moode').trim();
      const paths = req.body?.paths || {};

      let sshOk = false;
      let mpdOk = false;
      let sshError = '';
      let mpdError = '';

      try {
        await sshBashLc({ user: sshUser, host: sshHost, script: 'echo ok', timeoutMs: 8000 });
        sshOk = true;
      } catch (e) {
        sshError = e?.message || String(e);
      }

      try {
        await execFileP('mpc', ['-h', mpdHost, '-p', String(mpdPort), 'status'], { timeout: 8000 });
        mpdOk = true;
      } catch (e) {
        mpdError = e?.message || String(e);
      }

      const checks = [
        ['musicLibraryRoot', String(paths.musicLibraryRoot || '')],
        ['moodeUsbMount', String(paths.moodeUsbMount || '')],
        ['piMountBase', String(paths.piMountBase || '')],
        ['podcastRoot', String(paths.podcastRoot || '')],
      ].filter(([, p]) => !!p.trim());

      const pathChecks = [];
      for (const [name, p] of checks) {
        let exists = false;
        try {
          const { stdout } = await sshBashLc({ user: sshUser, host: sshHost, script: `if [ -d ${shQuoteArg(p)} ] || [ -f ${shQuoteArg(p)} ]; then echo YES; else echo NO; fi`, timeoutMs: 6000 });
          exists = String(stdout || '').includes('YES');
        } catch (_) {}
        pathChecks.push({ name, path: p, exists });
      }

      return res.json({ ok: true, sshOk, mpdOk, sshError, mpdError, pathChecks, mpdHost, mpdPort, sshHost, sshUser });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime/ensure-podcast-root', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const sshHost = String(req.body?.sshHost || MOODE_SSH_HOST || MPD_HOST || '10.0.0.254').trim();
      const sshUser = String(req.body?.sshUser || MOODE_SSH_USER || 'moode').trim();
      const podcastRoot = String(req.body?.podcastRoot || '').trim();
      if (!podcastRoot) return res.status(400).json({ ok: false, error: 'podcastRoot is required' });

      const pQ = shQuoteArg(podcastRoot);
      const script = [
        `sudo install -d -m 0775 ${pQ}`,
        `if [ -d ${pQ} ]; then echo OK; else echo FAIL; fi`,
      ].join('; ');

      const { stdout } = await sshBashLc({ user: sshUser, host: sshHost, script, timeoutMs: 12000 });
      const ok = String(stdout || '').includes('OK');
      if (!ok) return res.status(500).json({ ok: false, error: `Unable to create ${podcastRoot}` });
      return res.json({ ok: true, podcastRoot, created: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/alexa/check-domain', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      let domain = String(req.body?.domain || '').trim();
      if (!domain) return res.status(400).json({ ok: false, error: 'domain is required' });

      if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
      let u;
      try { u = new URL(domain); } catch { return res.status(400).json({ ok: false, error: 'invalid domain/url' }); }

      const target = `${u.origin}/now-playing`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);

      let reachable = false;
      let statusCode = 0;
      let errMsg = '';
      try {
        const r = await fetch(target, { method: 'GET', signal: ctrl.signal });
        statusCode = Number(r.status || 0);
        reachable = r.ok || (statusCode >= 200 && statusCode < 500);
      } catch (e) {
        errMsg = e?.message || String(e);
      } finally {
        clearTimeout(t);
      }

      return res.json({ ok: true, domain: u.hostname, url: target, reachable, statusCode, error: errMsg || '' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

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

  // --- queue wizard options (artists/genres) ---
  app.get('/config/queue-wizard/options', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%artist%\t%albumartist%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });

      const artists = new Set();
      const genres = new Set();

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [artist = '', albumArtist = '', genreRaw = ''] = ln.split('\t');

        const a = String(artist || albumArtist || '').trim();
        if (a) artists.add(a);

        for (const g of String(genreRaw || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim())
          .filter(Boolean)) {
          genres.add(g);
        }
      }

      return res.json({
        ok: true,
        moodeHost: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
        genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        artists: Array.from(artists).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- queue wizard preview track list (filter + sample tracks) ---
  app.post('/config/queue-wizard/preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const wantedGenres = Array.isArray(req.body?.genres)
        ? req.body.genres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const wantedArtists = Array.isArray(req.body?.artists)
        ? req.body.artists.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const excludeGenres = Array.isArray(req.body?.excludeGenres)
        ? req.body.excludeGenres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];

      const minRating = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const maxTracks = Math.max(1, Math.min(5000, Number(req.body?.maxTracks || 250)));

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%albumartist%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });

      const tracks = [];

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;

        const [file = '', artist = '', title = '', album = '', albumartist = '', genreRaw = ''] = ln.split('\t');

        const f = String(file || '').trim();
        if (!f) continue;

        const genreTokens = String(genreRaw || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim().toLowerCase())
          .filter(Boolean);

        const a = String(artist || '').trim().toLowerCase();
        const aa = String(albumartist || '').trim().toLowerCase();

        if (wantedGenres.length && !wantedGenres.some((g) => genreTokens.includes(g))) continue;
        if (wantedArtists.length && !(wantedArtists.includes(a) || wantedArtists.includes(aa))) continue;
        if (excludeGenres.length && excludeGenres.some((g) => genreTokens.includes(g))) continue;

        if (minRating > 0 && typeof getRatingForFile === 'function') {
          let rating = 0;
          try {
            rating = Number(await getRatingForFile(f)) || 0;
          } catch (_) {}
          if (rating < minRating) continue;
        }

        tracks.push({
          file: f,
          artist: String(artist || ''),
          title: String(title || ''),
          album: String(album || ''),
          albumartist: String(albumartist || ''),
          genre: String(genreRaw || ''),
        });

        if (tracks.length >= maxTracks) break;
      }

      return res.json({ ok: true, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- queue wizard preview track list ---
app.post('/config/queue-wizard/collage-preview', async (req, res) => {
    let remoteTracks = '';
    let remoteOut = '';
    let remoteRunner = '';
    let localTracks = '';
    let localRunner = '';

    const moodeUser = String(MOODE_SSH_USER || 'moode');
    const moodeHost = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
    const remoteScript = String(
        process.env.MOODE_PLAYLIST_COVER_REMOTE_SCRIPT || '/home/moode/moode-playlist-cover.sh'
    );

    try {
        if (!requireTrackKey(req, res)) return;

        const playlistName = String(req.body?.playlistName || '').trim() || null;

        const tracksIn = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
        const tracks = tracksIn
            .map((x) => String(x ?? ''))
            .map((s) => s.replace(/\r/g, '').trim())
            .map((s) => s.replace(/^"(.*)"$/, '$1'))
            .filter(Boolean);

        const forceSingle = Boolean(req.body?.forceSingle);

        if (!tracks.length) {
            return res.status(400).json({
                ok: false,
                reason: 'bad_request',
                error: 'tracks[] is required',
            });
        }

        const ts = Date.now();
        localTracks = path.join('/tmp', `qw-preview-tracks-${process.pid}-${ts}.txt`);
        localRunner = path.join('/tmp', `qw-preview-run-${process.pid}-${ts}.sh`);

        remoteTracks = `/tmp/qw-preview-tracks-${process.pid}-${ts}.txt`;
        remoteOut = `/tmp/qw-preview-${process.pid}-${ts}.jpg`;
        remoteRunner = `/tmp/qw-preview-run-${process.pid}-${ts}.sh`;

        await fs.writeFile(localTracks, tracks.join('\n') + '\n', 'utf8');

        // Build a tiny runner script to execute on moOde.
        // IMPORTANT: keep stdout = base64 ONLY. Any status goes to stderr.
        const runner = [
            '#!/usr/bin/env bash',
            'set -euo pipefail',
            'set -o pipefail',
            `rt=${shQuoteArg(remoteTracks)}`,
            `ro=${shQuoteArg(remoteOut)}`,
            `script=${shQuoteArg(remoteScript)}`,
            '',
            'chmod 0644 -- "$rt" >/dev/null 2>&1 || true',
            '',
            // Capture ALL script output to a variable so it can't pollute stdout
            'preview_out="$("$script" --preview --tracks-file "$rt" --out "$ro" ' +
                (forceSingle ? '--single' : '') +
                ' 2>&1)"',
            'rc=$?',
            'if [ "$rc" -ne 0 ]; then printf "%s\\n" "$preview_out" >&2; exit "$rc"; fi',
            '',
            'if [ ! -s "$ro" ]; then echo "ERROR: preview file missing/empty: $ro" >&2; exit 2; fi',
            '',
            // JPEG magic check (FF D8 FF)
            'magic="$(dd if="$ro" bs=1 count=3 2>/dev/null | od -An -tx1 | tr -d \' \\n\')"',
            'if [ "$magic" != "ffd8ff" ]; then echo "ERROR: preview output not JPEG (magic=$magic) $ro" >&2; exit 3; fi',
            '',
            // stdout must be base64 only
            'base64 "$ro" 2>/dev/null | tr -d "\\r\\n"',
            '',
        ].join('\n');

        await fs.writeFile(localRunner, runner, 'utf8');

        // scp both files to moOde
        await execFileP(
            'scp',
            [
                '-q',
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=6',
                localTracks,
                `${moodeUser}@${moodeHost}:${remoteTracks}`,
            ],
            { timeout: 20000 }
        );

        await execFileP(
            'scp',
            [
                '-q',
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=6',
                localRunner,
                `${moodeUser}@${moodeHost}:${remoteRunner}`,
            ],
            { timeout: 20000 }
        );

        // run the runner on moOde
        let stdout = '';
        let stderr = '';
        let rc = 0;

        try {
            const r = await execFileP(
                'ssh',
                [
                    ...sshArgsFor(moodeUser, moodeHost),
                    'bash', '--noprofile', '--norc', '-c',
                    // run runner as a file; avoid quoting giant scripts
                    `chmod 0755 -- ${shQuoteArg(remoteRunner)} >/dev/null 2>&1 || true; ` +
                    `bash --noprofile --norc ${shQuoteArg(remoteRunner)}`,
                ],
                { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }
            );

            stdout = String(r.stdout || '');
            stderr = String(r.stderr || '');
            rc = 0;
        } catch (e) {
            stdout = String(e?.stdout || '');
            stderr = String(e?.stderr || e?.message || '');
            rc = typeof e?.code === 'number' ? e.code : 1;

            return res.status(200).json({
                ok: false,
                reason: 'preview_failed',
                playlistName,
                message: 'Preview generation / readback failed on moOde.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    rc,
                    stdoutHead: stdout.slice(0, 400),
                    stdoutLen: stdout.length,
                    stderrHead: stderr.slice(0, 1200),
                    stderrLen: stderr.length,
                },
            });
        }

        const b64 = stdout.trim();

        if (!b64) {
            return res.status(200).json({
                ok: false,
                reason: 'base64_empty',
                playlistName,
                message: 'Remote command succeeded but produced empty base64.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    stderrHead: (stderr || '').slice(0, 1200),
                },
            });
        }

        if (!b64.startsWith('/9j/')) {
            return res.status(200).json({
                ok: false,
                reason: 'base64_not_jpeg',
                playlistName,
                message: 'Remote stdout was not JPEG base64.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    b64Head: b64.slice(0, 220),
                    stderrHead: (stderr || '').slice(0, 1200),
                },
            });
        }

        return res.json({
            ok: true,
            playlistName,
            mimeType: 'image/jpeg',
            dataBase64: b64,
        });
    } catch (e) {
        return res.status(500).json({
            ok: false,
            reason: 'server_error',
            error: e?.message || String(e),
            remoteTracks,
            remoteOut,
            remoteRunner,
        });
    } finally {
        if (localTracks) await fs.unlink(localTracks).catch(() => {});
        if (localRunner) await fs.unlink(localRunner).catch(() => {});

        // remote cleanup (best effort)
        if (remoteTracks || remoteOut || remoteRunner) {
            const rm = [
                'rm -f --',
                remoteTracks ? shQuoteArg(remoteTracks) : '',
                remoteOut ? shQuoteArg(remoteOut) : '',
                remoteRunner ? shQuoteArg(remoteRunner) : '',
                '>/dev/null 2>&1 || true',
            ].join(' ').trim();

            await sshBashLc({ user: moodeUser, host: moodeHost, timeoutMs: 10000, script: rm }).catch(() => {});
        }
    }
});

  // --- apply route ---
  app.post('/config/queue-wizard/apply', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
      if (!['replace', 'append'].includes(mode)) {
        return res.status(400).json({ ok: false, error: 'mode must be replace|append' });
      }

      const shuffle = Boolean(req.body?.shuffle);
      const generateCollage = Boolean(req.body?.generateCollage);

      const keepNowPlaying =
        req.body?.keepNowPlaying === true ||
        req.body?.crop === true ||
        String(req.body?.keepNowPlaying || '').toLowerCase() === 'true' ||
        String(req.body?.crop || '').toLowerCase() === 'true';

      const tracks = Array.isArray(req.body?.tracks)
        ? req.body.tracks.map((x) => String(x || '').trim()).filter(Boolean)
        : [];

      const playlistName = String(req.body?.playlistName || '').trim();
      if (!tracks.length) return res.status(400).json({ ok: false, error: 'tracks[] is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let didCrop = false;
      let didClear = false;
      let randomTurnedOff = false;

      if (mode === 'replace') {
        if (keepNowPlaying) {
          await execFileP('mpc', ['-h', mpdHost, 'crop']);
          didCrop = true;
        } else {
          await execFileP('mpc', ['-h', mpdHost, 'clear']);
          didClear = true;
        }

        // Always disable random before building a deterministic queue.
        try {
          await execFileP('mpc', ['-h', mpdHost, 'random', 'off']);
          randomTurnedOff = true;
        } catch (_) {}
      }

      let added = 0;
      const failedFiles = [];

      for (const file of tracks) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'add', file]);
          added += 1;
        } catch (_) {
          failedFiles.push(file);
        }
      }

      let playStarted = false;
      // Only auto-play when we replaced the queue and did NOT crop (crop keeps playing).
      if (mode === 'replace' && !didCrop && added > 0) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'play']);
          playStarted = true;
        } catch (_) {}
      }

      let randomEnabled = false;
      if (shuffle) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'random', 'on']);
          randomEnabled = true;
        } catch (_) {}
      }

      let playlistSaved = false;
      let playlistError = '';
      if (playlistName) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'rm', playlistName]);
        } catch (_) {}
        try {
          await execFileP('mpc', ['-h', mpdHost, 'save', playlistName]);
          playlistSaved = true;
        } catch (e) {
          playlistError = e?.message || String(e);
        }
      }

      let collageGenerated = false;
      let collageError = '';
      if (generateCollage && playlistName && playlistSaved) {
        const localScript = String(
          process.env.MOODE_PLAYLIST_COVER_SCRIPT || path.resolve(process.cwd(), 'scripts/moode-playlist-cover.sh')
        );

        try {
          await execFileP(localScript, [playlistName], {
            timeout: 120000,
            env: {
              ...process.env,
              MOODE_SSH_USER: String(MOODE_SSH_USER || 'moode'),
              MOODE_SSH_HOST: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
            },
          });
          collageGenerated = true;
        } catch (e) {
          collageError = e?.message || String(e);
        }
      }

      return res.json({
        ok: true,
        mode,
        keepNowPlaying,
        didCrop,
        didClear,
        shuffle,
        randomTurnedOff,
        randomEnabled,
        generateCollage,
        requested: tracks.length,
        added,
        failedFiles: failedFiles.slice(0, 50),
        playStarted,
        playlistSaved,
        playlistError,
        collageGenerated,
        collageError,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- Vibe from now playing (Queue Wizard) ---
  app.post('/config/queue-wizard/vibe-start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const targetQueueRaw = req.body?.targetQueue;
      const targetQueue = Math.max(10, Math.min(200, Number(targetQueueRaw) || 50));
      const minRating = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let artist = '';
      let title = '';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      if (line) {
        const [a = '', t = ''] = line.split('\t');
        artist = String(a || '').trim();
        title = String(t || '').trim();
      }

      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });

      const indexPath = '/home/moode/moode_library_index.json';
      await fs.access(indexPath);

      const jobId = makeVibeJobId();
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/${jobId}.json`;

      const pyArgs = [
        '--api-key', lastfmApiKey,
        '--seed-artist', artist,
        '--seed-title', title,
        '--target-queue', String(targetQueue),
        '--json-out', jsonTmp,
        '--mode', 'load',
        '--host', mpdHost,
        '--port', '6600',
        '--dry-run',
      ];

      const job = {
        id: jobId,
        status: 'running',
        phase: 'starting',
        targetQueue,
        minRating,
        seedArtist: artist,
        seedTitle: title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        builtCount: 0,
        added: [],
        tracks: [],
        logs: [],
        nextEventId: 1,
        error: '',
        done: false,
        jsonTmp,
        proc: null,
      };

      const child = spawn('python3', [pyPath, ...pyArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.proc = child;
      vibeJobs.set(jobId, job);

      const onLine = (lineIn = '') => {
        const line = String(lineIn || '').trim();
        if (!line) return;
        job.updatedAt = Date.now();
        job.logs.push(line);
        if (job.logs.length > 100) job.logs.shift();

        if (/Last\.fm get similar/i.test(line)) job.phase = 'querying last.fm';
        if (/pick from/i.test(line)) job.phase = 'matching local library';

        const m = line.match(/^\[hop\s+\d+\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i);
        if (m) {
          const label = String(m[1] || '').trim();
          const method = String(m[2] || '').trim();
          const parts = label.split(' — ');
          const titleX = parts[0] || label;
          const artistX = parts.length > 1 ? parts.slice(1).join(' — ') : '';

          job.added.push({
            eventId: job.nextEventId++,
            artist: artistX,
            title: titleX,
            method,
          });
          if (job.added.length > 500) job.added = job.added.slice(-500);
          job.builtCount += 1;
          job.phase = 'adding tracks';
        }
      };

      let outBuf = '';
      child.stdout.on('data', (buf) => {
        outBuf += String(buf || '');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        lines.forEach(onLine);
      });

      let errBuf = '';
      child.stderr.on('data', (buf) => {
        errBuf += String(buf || '');
        const lines = errBuf.split(/\r?\n/);
        errBuf = lines.pop() || '';
        lines.forEach((ln) => onLine(`stderr: ${ln}`));
      });

      child.on('close', async (code) => {
        if (outBuf.trim()) onLine(outBuf.trim());
        if (errBuf.trim()) onLine(`stderr: ${errBuf.trim()}`);

        try {
          const jsonOut = await fs.readFile(jsonTmp, 'utf8');
          const data = JSON.parse(jsonOut);
          const baseTracks = Array.isArray(data?.tracks) ? data.tracks : [];

          if (job.minRating > 0 && typeof getRatingForFile === 'function') {
            const kept = [];
            for (const t of baseTracks) {
              const f = String(t?.file || '').trim();
              let r = 0;
              try { r = Number(await getRatingForFile(f)) || 0; } catch {}
              if (r >= job.minRating) kept.push(t);
            }
            job.tracks = kept;
          } else {
            job.tracks = baseTracks;
          }

          job.builtCount = job.tracks.length || 0;
          await fs.unlink(jsonTmp).catch(() => {});
        } catch (e) {
          if (!job.error) job.error = 'JSON parse/out: ' + (e?.message || String(e));
        }

        if (code !== 0 && !job.error) job.error = `vibe builder exited with code ${code}`;
        job.done = true;
        job.status = job.error ? 'error' : 'done';
        job.phase = job.error ? 'error' : 'complete';
        job.updatedAt = Date.now();
      });

      return res.json({ ok: true, jobId, targetQueue, minRating, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/vibe-status/:jobId', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const jobId = String(req.params?.jobId || '');
      const job = vibeJobs.get(jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Unknown vibe job' });

      const since = Math.max(0, Number(req.query?.since || 0));
      const added = job.added.filter((x) => Number(x.eventId || 0) > since);
      const nextSince = job.added.length ? Number(job.added[job.added.length - 1].eventId || since) : since;

      return res.json({
        ok: true,
        jobId,
        status: job.status,
        phase: job.phase,
        done: !!job.done,
        error: job.error || '',
        targetQueue: job.targetQueue,
        minRating: Number(job.minRating || 0),
        builtCount: Number(job.builtCount || 0),
        seedArtist: job.seedArtist,
        seedTitle: job.seedTitle,
        added,
        nextSince,
        tracks: job.done ? (Array.isArray(job.tracks) ? job.tracks : []) : [],
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/vibe-cancel/:jobId', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const jobId = String(req.params?.jobId || '');
      const job = vibeJobs.get(jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Unknown vibe job' });

      if (!job.done && job.proc?.pid) {
        try { process.kill(job.proc.pid, 'SIGTERM'); } catch (_) {}
      }

      job.done = true;
      job.status = 'cancelled';
      job.phase = 'cancelled';
      job.error = '';
      job.updatedAt = Date.now();

      return res.json({ ok: true, jobId, cancelled: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Backward-compatible one-shot endpoint
  app.get('/config/queue-wizard/vibe-nowplaying', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(10, Math.min(200, Number(req.query?.targetQueue) || 50));
      // Use direct invoke path by spawning inline (kept simple for compatibility)
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/vibe-nowplaying', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(10, Math.min(200, Number(req.body?.targetQueue) || 50));
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health (unchanged from your git) ---
  app.get('/config/library-health', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (
        typeof mpdQueryRaw !== 'function' ||
        typeof getRatingForFile !== 'function' ||
        typeof mpdStickerGetSong !== 'function'
      ) {
        return res.status(501).json({ ok: false, error: 'library-health dependencies not wired' });
      }

      const sampleLimit = Math.max(10, Math.min(500, Number(req.query?.sampleLimit || 100)));
      const scanLimit =
        req.query?.scanLimit != null
          ? Math.max(100, Math.min(200000, Number(req.query.scanLimit || 100)))
          : Number.MAX_SAFE_INTEGER;
      const started = Date.now();

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const pick = (arr, row) => {
        if (arr.length < sampleLimit) arr.push(row);
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%genre%\t%MUSICBRAINZ_TRACKID%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const allFiles = String(stdout || '')
        .split(/\r?\n/)
        .map((ln) => {
          const [file = '', artist = '', title = '', album = '', genre = '', mbid = ''] = ln.split('\t');
          return {
            file: String(file || '').trim(),
            artist: String(artist || '').trim(),
            title: String(title || '').trim(),
            album: String(album || '').trim(),
            genres: String(genre || '').trim() ? [String(genre || '').trim()] : [],
            musicbrainz_trackid: String(mbid || '').trim(),
          };
        })
        .filter((x) => x.file && isAudio(x.file))
        .slice(0, Number.isFinite(scanLimit) ? scanLimit : undefined);

      const summary = {
        totalTracks: 0,
        totalAlbums: 0,
        missingArtwork: 0,
        unrated: 0,
        lowRated1: 0,
        missingMbid: 0,
        missingGenre: 0,
        christmasGenre: 0,
        podcastGenre: 0,
      };
      const genreSet = new Set();
      const genreCounts = new Map();
      const ratingCounts = new Map();

      const samples = {
        unrated: [],
        lowRated1: [],
        missingMbid: [],
        missingGenre: [],
      };

      let scanned = 0;
      for (const b0 of allFiles) {
        const file = String(b0?.file || '').trim();
        if (!file || !isAudio(file)) continue;
        if (scanned >= scanLimit) break;
        scanned += 1;

        summary.totalTracks += 1;

        const b = b0 || { file, genres: [] };

        const artist = String(b.artist || b.albumartist || '').trim();
        const title = String(b.title || '').trim();
        const album = String(b.album || '').trim();

        const genreVals = Array.isArray(b.genres) ? b.genres : [];
        for (const g of genreVals) {
          const raw = String(g || '').trim();
          if (!raw) continue;
          const splitVals = raw.split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean);
          const list = splitVals.length ? splitVals : [raw];
          for (const gg of list) {
            genreSet.add(gg);
            genreCounts.set(gg, Number(genreCounts.get(gg) || 0) + 1);
          }
        }
        const genreBlob = genreVals.join(' | ').trim();

        if (!genreBlob) {
          summary.missingGenre += 1;
          pick(samples.missingGenre, { file, artist, title, album });
        }
        if (/christmas/i.test(genreBlob)) summary.christmasGenre += 1;
        if (/\bpodcast\b/i.test(genreBlob)) summary.podcastGenre += 1;

        const isPodcast = /\bpodcast\b/i.test(genreBlob);

        let rating = 0;
        try {
          rating = Number(await getRatingForFile(file)) || 0;
        } catch (_) {}
        const ratingBucket = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
        ratingCounts.set(String(ratingBucket), Number(ratingCounts.get(String(ratingBucket)) || 0) + 1);

        // User policy: do not count Podcast-genre tracks in unrated tally.
        if (!isPodcast && rating <= 0) {
          summary.unrated += 1;
          pick(samples.unrated, { file, artist, title, album, rating });
        }
        if (rating === 1) {
          summary.lowRated1 += 1;
          pick(samples.lowRated1, { file, artist, title, album, rating });
        }

        const mbTag = String(b.musicbrainz_trackid || '').trim();
        let mbSticker = '';
        if (!mbTag) {
          try {
            mbSticker = String(await mpdStickerGetSong(file, 'mb_trackid') || '').trim();
          } catch (_) {}
        }
        if (!mbTag && !mbSticker) {
          summary.missingMbid += 1;
          pick(samples.missingMbid, { file, artist, title, album });
        }
      }

      // Album artwork coverage summary (folder-level cover.jpg check on API Pi mounts)
      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ]
          .map((x) => String(x || '').replace(/\/+/g, '/'))
          .filter(Boolean);
        for (const c of candidates) {
          try {
            await fs.access(c);
            return c;
          } catch (_) {}
        }
        return '';
      };

      const folderSet = new Set(allFiles.map((r) => folderOf(r.file)).filter((f) => f && f !== '(root)'));
      summary.totalAlbums = folderSet.size;

      for (const folder of folderSet) {
        const localFolder = await resolveLocalFolder(folder);
        if (!localFolder) {
          summary.missingArtwork += 1;
          continue;
        }
        const coverPath = path.join(localFolder, 'cover.jpg');
        try {
          await fs.access(coverPath);
        } catch (_) {
          summary.missingArtwork += 1;
        }
      }

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        summary,
        samples,
        genreCounts: Array.from(genreCounts.entries())
          .map(([genre, count]) => ({ genre, count: Number(count || 0) }))
          .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, undefined, { sensitivity: 'base' })),
        ratingCounts: [0, 1, 2, 3, 4, 5].map((r) => ({ rating: r, count: Number(ratingCounts.get(String(r)) || 0) })),
        genreOptions: Array.from(genreSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        sampleLimit,
        scanLimit,
        scannedTracks: summary.totalTracks,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
  
  
  // --- library health: albums missing BOTH cover.jpg and embedded artwork ---
  app.get('/config/library-health/missing-artwork', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const leafName = (p) => {
        const s = String(p || '');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
      };

      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const resolveLocalPath = async (file) => {
        const f = String(file || '').trim().replace(/^\/+/, '');
        if (!f) return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const hasEmbeddedArtwork = async (files) => {
        const sample = (Array.isArray(files) ? files : []).slice(0, 3);
        for (const f of sample) {
          const local = await resolveLocalPath(f);
          if (!local) continue;
          try {
            const { stdout } = await execFileP(
              'ffprobe',
              [
                '-v', 'error',
                '-show_entries', 'stream=codec_type:stream_disposition=attached_pic',
                '-of', 'json',
                local,
              ],
              { timeout: 1500 }
            );
            const txt = String(stdout || '');
            if (/"attached_pic"\s*:\s*1/.test(txt)) return true;
          } catch (_) {}
        }
        return false;
      };

      const onlyFolder = String(req.query?.folder || '').trim();

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP(
        'mpc',
        ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%', 'listall'],
        { maxBuffer: 64 * 1024 * 1024 }
      );

      const byFolder = new Map();

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', album = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;

        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], album: '', artists: new Set() });

        const row = byFolder.get(folder);
        row.files.push(f);

        const a = String(albumArtist || artist || '').trim();
        if (a) row.artists.add(a);

        if (!row.album) row.album = String(album || '').trim();
      }

      const missing = [];

      for (const [folder, row] of byFolder.entries()) {
        if (!folder || folder === '(root)') continue;
        if (onlyFolder && folder !== onlyFolder) continue;

        // cover.jpg check
        let hasCover = false;
        const localFolder = await resolveLocalFolder(folder);
        if (localFolder) {
          const coverPath = path.join(localFolder, 'cover.jpg');
          try { await fs.access(coverPath); hasCover = true; } catch (_) {}
        }

        if (!hasCover) {
          // embedded artwork check (sample a few tracks)
          const hasEmbedded = await hasEmbeddedArtwork(row.files);
          if (!hasEmbedded) {
            const artists = Array.from(row.artists || []);
            missing.push({
              folder,
              album: row.album || leafName(folder),
              artist: artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist'),
              trackCount: row.files.length,
              files: row.files.slice(0, 200),
            });
          }
        }
      }

      missing.sort((a, b) =>
        `${a.artist} — ${a.album}`.localeCompare(`${b.artist} — ${b.album}`, undefined, { sensitivity: 'base' })
      );

      return res.json({ ok: true, totalMissing: missing.length, filterFolder: onlyFolder || null, albums: missing });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: fetch cover.jpg for a folder (base64) ---
  app.get('/config/library-health/album-art', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const localCandidates = [
        folder.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + folder.slice('USB/SamsungMoode/'.length) : '',
        folder.startsWith('OSDISK/') ? '/mnt/OSDISK/' + folder.slice('OSDISK/'.length) : '',
        '/mnt/SamsungMoode/' + folder,
        '/mnt/OSDISK/' + folder,
      ]
        .map((x) => String(x || '').replace(/\/+/g, '/'))
        .filter(Boolean);

      let coverPath = '';
      for (const c of localCandidates) {
        const p = path.join(c, 'cover.jpg');
        try {
          await fs.access(p);
          coverPath = p;
          break;
        } catch (_) {}
      }

      if (!coverPath) return res.json({ ok: true, folder, hasCover: false });

      const buf = await fs.readFile(coverPath);
      return res.json({
        ok: true,
        folder,
        hasCover: true,
        mimeType: 'image/jpeg',
        dataBase64: buf.toString('base64'),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: set cover.jpg and/or embed artwork into FLACs for a folder ---
  app.post('/config/library-health/album-art', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.body?.folder || '').trim();
      const base64In = String(req.body?.imageBase64 || '').trim();
      const mode = String(req.body?.mode || 'both').trim().toLowerCase();

      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!base64In) return res.status(400).json({ ok: false, error: 'imageBase64 is required' });
      if (!['cover', 'embed', 'both'].includes(mode)) {
        return res.status(400).json({ ok: false, error: 'mode must be cover|embed|both' });
      }

      const b64 = base64In.includes(',') ? base64In.split(',').pop() : base64In;
      let imgBuf = Buffer.from(String(b64 || ''), 'base64');
      if (!imgBuf.length) return res.status(400).json({ ok: false, error: 'invalid imageBase64' });

      const ts = Date.now();
      const tmpPath = path.join('/tmp', `library-health-art-${ts}.jpg`);
      const tmpSquarePath = path.join('/tmp', `library-health-art-square-${ts}.jpg`);
      await fs.writeFile(tmpPath, imgBuf);

      // Normalize to centered square so embeds/covers are consistent.
      try {
        await execFileP('ffmpeg', [
          '-y',
          '-i', tmpPath,
          '-vf', "crop='min(iw,ih)':'min(iw,ih)'",
          '-q:v', '2',
          tmpSquarePath,
        ]);
        imgBuf = await fs.readFile(tmpSquarePath);
      } catch (_) {
        // If ffmpeg fails/unavailable, keep original.
      }

      // Find files in folder via MPD
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      let files = [];
      try {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder]);
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}

      // fallback: listall filter
      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall']);
        files = String(stdout || '')
          .split(/\r?\n/)
          .map((x) => String(x || '').trim())
          .filter((f) => f && f.startsWith(folder + '/'));
      }

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';

        const candidates = [
          file.startsWith('/mnt/') ? file : '',
          file.startsWith('mnt/') ? '/' + file : '',
          file.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length) : '',
          file.startsWith('OSDISK/') ? '/mnt/OSDISK/' + file.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + file,
          '/mnt/OSDISK/' + file,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const doEmbed = mode === 'embed' || mode === 'both';
      const doCover = mode === 'cover' || mode === 'both';

      const isFlac = (f) => /\.flac$/i.test(String(f || ''));

      let updatedTracks = 0;
      let skippedTracks = 0;
      const skipped = [];

      // Embed into FLACs
      if (doEmbed) {
        for (const f of files) {
          const local = await resolveLocalPath(f);
          if (!local || !isFlac(local)) {
            skippedTracks += 1;
            skipped.push(f);
            continue;
          }
          try {
            await execFileP('metaflac', ['--remove', '--block-type=PICTURE', local]);
            await execFileP('metaflac', [`--import-picture-from=${tmpPath}`, local]);
            updatedTracks += 1;
          } catch (_) {
            skippedTracks += 1;
            skipped.push(f);
          }
        }
      }

      // cover.jpg write/update
      let coverUpdated = false;
      let coverCreated = false;

      if (doCover) {
        const localFolders = [
          folder.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + folder.slice('USB/SamsungMoode/'.length) : '',
          folder.startsWith('OSDISK/') ? '/mnt/OSDISK/' + folder.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + folder,
          '/mnt/OSDISK/' + folder,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const lf of localFolders) {
          const cp = path.join(lf, 'cover.jpg');
          try {
            await fs.access(cp);
            await fs.writeFile(cp, imgBuf);
            coverUpdated = true;
            break;
          } catch (_) {
            try {
              await fs.access(lf);
              await fs.writeFile(cp, imgBuf);
              coverCreated = true;
              break;
            } catch (_) {}
          }
        }
      }

      // cleanup + refresh mpd db
      try { await fs.unlink(tmpPath); } catch (_) {}
      try { await fs.unlink(tmpSquarePath); } catch (_) {}
      try { await execFileP('mpc', ['-w', '-h', mpdHost, 'update']); } catch (_) {}

      return res.json({
        ok: true,
        folder,
        mode,
        totalFiles: files.length,
        updatedTracks,
        skippedTracks,
        skipped: skipped.slice(0, 200),
        coverUpdated,
        coverCreated,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: list unique genres present within an album folder ---
  app.get('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let rows = [];
      try {
        const { stdout } = await execFileP(
          'mpc',
          ['-h', mpdHost, '-f', '%file%\t%genre%', 'find', 'base', folder],
          { maxBuffer: 64 * 1024 * 1024 }
        );
        rows = String(stdout || '')
          .split(/\r?\n/)
          .map((ln) => {
            const [file = '', genre = ''] = ln.split('\t');
            return { file: String(file || '').trim(), genre: String(genre || '').trim() };
          })
          .filter((r) => r.file);
      } catch (_) {}

      // fallback: listall filter
      if (!rows.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%', 'listall'], {
          maxBuffer: 64 * 1024 * 1024,
        });
        rows = String(stdout || '')
          .split(/\r?\n/)
          .map((ln) => {
            const [file = '', genre = ''] = ln.split('\t');
            return { file: String(file || '').trim(), genre: String(genre || '').trim() };
          })
          .filter((r) => r.file && r.file.startsWith(folder + '/'));
      }

      const genres = new Set();
      for (const r of rows) {
        for (const g of String(r.genre || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim())
          .filter(Boolean)) {
          genres.add(g);
        }
      }

      return res.json({
        ok: true,
        folder,
        trackCount: rows.length,
        genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
  // --- library health: set GENRE tag for all FLACs in an album folder ---
  app.post('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.body?.folder || '').trim();
      const genre = String(req.body?.genre || '').trim();

      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!genre) return res.status(400).json({ ok: false, error: 'genre is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let files = [];
      try {
        const { stdout } = await execFileP(
          'mpc',
          ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder],
          { maxBuffer: 64 * 1024 * 1024 }
        );
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}

      // fallback: listall filter
      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall'], {
          maxBuffer: 64 * 1024 * 1024,
        });
        files = String(stdout || '')
          .split(/\r?\n/)
          .map((x) => String(x || '').trim())
          .filter((f) => f && f.startsWith(folder + '/'));
      }

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';

        const candidates = [
          file.startsWith('/mnt/') ? file : '',
          file.startsWith('mnt/') ? '/' + file : '',
          file.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length) : '',
          file.startsWith('OSDISK/') ? '/mnt/OSDISK/' + file.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + file,
          '/mnt/OSDISK/' + file,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];

      for (const f of files) {
        const local = await resolveLocalPath(f);
        if (!local || !/\.flac$/i.test(local)) {
          skipped += 1;
          skippedFiles.push(f);
          continue;
        }
        try {
          await execFileP('metaflac', ['--remove-tag=GENRE', `--set-tag=GENRE=${genre}`, local]);
          updated += 1;
          updatedFiles.push(f);
        } catch (_) {
          skipped += 1;
          skippedFiles.push(f);
        }
      }

      try { await execFileP('mpc', ['-w', '-h', mpdHost, 'update']); } catch (_) {}

      return res.json({
        ok: true,
        folder,
        genre,
        requested: files.length,
        updated,
        skipped,
        updatedFiles,
        skippedFiles: skippedFiles.slice(0, 200),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/albums', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const leafName = (p) => {
        const s = String(p || '');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP(
        'mpc',
        ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%', 'listall'],
        { maxBuffer: 64 * 1024 * 1024 }
      );

      const byFolder = new Map();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', album = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;
        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], album: '', artists: new Set() });
        const row = byFolder.get(folder);
        row.files.push(f);
        const aa = String(albumArtist || artist || '').trim();
        if (aa) row.artists.add(aa);
        if (!row.album) row.album = String(album || '').trim();
      }

      const albums = Array.from(byFolder.entries())
        .map(([folder, row]) => {
          const artists = Array.from(row.artists || []);
          const artist = artists.length === 1 ? artists[0] : artists.length > 1 ? 'Various Artists' : 'Unknown Artist';
          const album = String(row.album || leafName(folder) || 'Unknown Album').trim();
          const label = `${artist} — ${album}`;
          return { id: folder, folder, album, artist, label, trackCount: row.files.length };
        })
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

      return res.json({ ok: true, albums });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/genre-folders', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const wantedRaw = String(req.query?.genre || '').trim();
      if (!wantedRaw) return res.status(400).json({ ok: false, error: 'genre is required' });
      const wanted = wantedRaw.toLowerCase();

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const splitGenres = (s) => String(s || '')
        .split(/[;,|/]/)
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%\t%artist%\t%albumartist%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });

      const byFolder = new Map();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', genre = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;

        const tokens = splitGenres(genre);
        const matched = tokens.some((g) => g.toLowerCase() === wanted);
        if (!matched) continue;

        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], artists: new Set() });
        const row = byFolder.get(folder);
        row.files.push(f);
        const a = String(albumArtist || artist || '').trim();
        if (a) row.artists.add(a);
      }

      const folders = Array.from(byFolder.entries())
        .map(([folder, row]) => {
          const artists = Array.from(row.artists || []);
          const artist = artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist');
          return { folder, artist, trackCount: row.files.length, files: row.files };
        })
        .sort((a, b) => a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' }));

      return res.json({ ok: true, genre: wantedRaw, folderCount: folders.length, folders });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/genre-batch', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const files = Array.isArray(req.body?.files) ? req.body.files.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const genre = String(req.body?.genre || '').trim();
      if (!files.length) return res.status(400).json({ ok: false, error: 'files[] is required' });
      if (!genre) return res.status(400).json({ ok: false, error: 'genre is required' });

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';

        const candidates = [];
        if (file.startsWith('mnt/')) candidates.push('/' + file);
        if (file.startsWith('/mnt/')) candidates.push(file);

        if (file.startsWith('USB/SamsungMoode/')) candidates.push('/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length));
        if (file.startsWith('OSDISK/')) candidates.push('/mnt/OSDISK/' + file.slice('OSDISK/'.length));

        // Generic fallbacks: map MPD-relative paths onto mounted roots on API Pi.
        candidates.push('/mnt/SamsungMoode/' + file);
        candidates.push('/mnt/OSDISK/' + file);

        const seen = new Set();
        for (const c0 of candidates) {
          const c = String(c0 || '').replace(/\/+/g, '/');
          if (!c || seen.has(c)) continue;
          seen.add(c);
          try {
            await fs.access(c);
            return c;
          } catch (_) {}
        }
        return '';
      };

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];
      const skippedDetails = [];
      const errors = [];

      for (const file of files) {
        const local = await resolveLocalPath(file);
        if (!local) {
          skipped += 1;
          skippedFiles.push(file);
          skippedDetails.push({ file, reason: 'unmapped_path_prefix' });
          continue;
        }
        if (!/\.flac$/i.test(local)) {
          skipped += 1;
          skippedFiles.push(file);
          skippedDetails.push({ file, reason: 'non_flac' });
          continue;
        }
        try {
          // Replace genre cleanly (avoid leaving old multi-value GENRE tags behind).
          await execFileP('metaflac', ['--remove-tag=GENRE', `--set-tag=GENRE=${genre}`, local]);
          updated += 1;
          updatedFiles.push(file);
        } catch (e) {
          errors.push({ file, error: e?.message || String(e) });
        }
      }

      try {
        const mpdHost = String(MPD_HOST || '10.0.0.254');
        // Wait for DB update to finish so a follow-up health scan reflects new tags.
        await execFileP('mpc', ['-w', '-h', mpdHost, 'update']);
      } catch (_) {}

      return res.json({ ok: true, genre, requested: files.length, updated, skipped, updatedFiles, skippedFiles: skippedFiles.slice(0, 200), skippedDetails: skippedDetails.slice(0, 200), errors: errors.slice(0, 50) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/rating-batch', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (typeof setRatingForFile !== 'function') return res.status(501).json({ ok: false, error: 'rating dependency not wired' });

      const files = Array.isArray(req.body?.files) ? req.body.files.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const ratingNum = Number(req.body?.rating);
      if (!files.length) return res.status(400).json({ ok: false, error: 'files[] is required' });
      if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        return res.status(400).json({ ok: false, error: 'rating must be 0..5' });
      }
      const rating = Math.round(ratingNum);

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];
      const errors = [];

      for (const file of files) {
        if (!file) { skipped += 1; skippedFiles.push(file); continue; }
        try {
          await setRatingForFile(file, rating);
          updated += 1;
          updatedFiles.push(file);
        } catch (e) {
          errors.push({ file, error: e?.message || String(e) });
        }
      }

      return res.json({ ok: true, rating, requested: files.length, updated, skipped, updatedFiles, skippedFiles: skippedFiles.slice(0, 200), errors: errors.slice(0, 50) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const incoming = req.body?.config;
      const fullIncoming = req.body?.fullConfig;
      if ((!incoming || typeof incoming !== 'object') && (!fullIncoming || typeof fullIncoming !== 'object')) {
        return res.status(400).json({ ok: false, error: 'Missing JSON body { config: {...} } or { fullConfig: {...} }' });
      }

      let current = {};
      try {
        current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {}

      const next = (fullIncoming && typeof fullIncoming === 'object')
        ? fullIncoming
        : {
            ...current,
            ...incoming,
            alexa: {
              ...(current.alexa || {}),
              ...(incoming.alexa || {}),
              // Replace alias map when provided so deletions persist.
              artistAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'artistAliases'))
                ? (incoming.alexa.artistAliases || {})
                : ((current.alexa || {}).artistAliases || {}),
              albumAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'albumAliases'))
                ? (incoming.alexa.albumAliases || {})
                : ((current.alexa || {}).albumAliases || {}),
              playlistAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'playlistAliases'))
                ? (incoming.alexa.playlistAliases || {})
                : ((current.alexa || {}).playlistAliases || {}),
              unresolvedArtists: Array.isArray(incoming?.alexa?.unresolvedArtists)
                ? incoming.alexa.unresolvedArtists
                : ((current.alexa || {}).unresolvedArtists || []),
              heardArtists: Array.isArray(incoming?.alexa?.heardArtists)
                ? incoming.alexa.heardArtists
                : ((current.alexa || {}).heardArtists || []),
              unresolvedAlbums: Array.isArray(incoming?.alexa?.unresolvedAlbums)
                ? incoming.alexa.unresolvedAlbums
                : ((current.alexa || {}).unresolvedAlbums || []),
              heardAlbums: Array.isArray(incoming?.alexa?.heardAlbums)
                ? incoming.alexa.heardAlbums
                : ((current.alexa || {}).heardAlbums || []),
              unresolvedPlaylists: Array.isArray(incoming?.alexa?.unresolvedPlaylists)
                ? incoming.alexa.unresolvedPlaylists
                : ((current.alexa || {}).unresolvedPlaylists || []),
              heardPlaylists: Array.isArray(incoming?.alexa?.heardPlaylists)
                ? incoming.alexa.heardPlaylists
                : ((current.alexa || {}).heardPlaylists || []),
            },
            ports: { ...(current.ports || {}), ...(incoming.ports || {}) },
            paths: { ...(current.paths || {}), ...(incoming.paths || {}) },
            notifications: {
              ...(current.notifications || {}),
              ...(incoming.notifications || {}),
              trackNotify: {
                ...((current.notifications || {}).trackNotify || {}),
                ...((incoming.notifications || {}).trackNotify || {}),
              },
              pushover: {
                ...((current.notifications || {}).pushover || {}),
                ...((incoming.notifications || {}).pushover || {}),
              },
            },
          };

      const errs = validateConfigShape(next);
      if (errs.length) return res.status(400).json({ ok: false, error: errs.join('; ') });

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      log.debug('[config/runtime] updated', { configPath });

      const cfgLastfm = String(next?.lastfmApiKey || '').trim();
      if (cfgLastfm) process.env.LASTFM_API_KEY = cfgLastfm;

      return res.json({
        ok: true,
        message: 'Config saved. Restart api with --update-env to apply env-overridden values.',
        config: withEnvOverrides(next),
        fullConfig: next,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  async function handleArtistAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.body?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'Missing artist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedArtists) ? current.alexa.unresolvedArtists : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);

      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = {
          ...prev,
          artist,
          key,
          count: Number(prev.count || 1) + 1,
          updatedAt: now,
          lastSource: source,
        };
      } else {
        unresolved.unshift({
          artist,
          key,
          count: 1,
          createdAt: now,
          updatedAt: now,
          lastSource: source,
        });
      }

      const heard = Array.isArray(current?.alexa?.heardArtists) ? current.alexa.heardArtists : [];
      heard.unshift({ artist, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedArtists: unresolved.slice(0, 200),
          heardArtists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: artist, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardArtist(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.body?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'Missing artist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');

      const heard = Array.isArray(current?.alexa?.heardArtists) ? current.alexa.heardArtists : [];
      heard.unshift({ artist, key, source, status, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardArtists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: artist, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlbumAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.body?.album || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'Missing album' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = album.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedAlbums) ? current.alexa.unresolvedAlbums : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);
      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = { ...prev, album, key, count: Number(prev.count || 1) + 1, updatedAt: now, lastSource: source };
      } else {
        unresolved.unshift({ album, key, count: 1, createdAt: now, updatedAt: now, lastSource: source });
      }

      const heard = Array.isArray(current?.alexa?.heardAlbums) ? current.alexa.heardAlbums : [];
      heard.unshift({ album, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedAlbums: unresolved.slice(0, 200),
          heardAlbums: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: album, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardAlbum(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.body?.album || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'Missing album' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = album.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');
      const resolvedTo = String(req.body?.resolvedTo || '').trim();

      const heard = Array.isArray(current?.alexa?.heardAlbums) ? current.alexa.heardAlbums : [];
      heard.unshift({ album, key, source, status, resolvedTo, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardAlbums: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: album, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  app.post('/config/artist-alias-suggestion', handleArtistAliasSuggestion);
  app.post('/mpd/artist-alias-suggestion', handleArtistAliasSuggestion);
  app.post('/config/album-alias-suggestion', handleAlbumAliasSuggestion);
  app.post('/mpd/album-alias-suggestion', handleAlbumAliasSuggestion);

  async function handlePlaylistAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const playlist = String(req.body?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'Missing playlist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = playlist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedPlaylists) ? current.alexa.unresolvedPlaylists : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);
      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = { ...prev, playlist, key, count: Number(prev.count || 1) + 1, updatedAt: now, lastSource: source };
      } else {
        unresolved.unshift({ playlist, key, count: 1, createdAt: now, updatedAt: now, lastSource: source });
      }

      const heard = Array.isArray(current?.alexa?.heardPlaylists) ? current.alexa.heardPlaylists : [];
      heard.unshift({ playlist, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedPlaylists: unresolved.slice(0, 200),
          heardPlaylists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: playlist, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardPlaylist(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const playlist = String(req.body?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'Missing playlist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = playlist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');
      const resolvedTo = String(req.body?.resolvedTo || '').trim();

      const heard = Array.isArray(current?.alexa?.heardPlaylists) ? current.alexa.heardPlaylists : [];
      heard.unshift({ playlist, key, source, status, resolvedTo, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardPlaylists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: playlist, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  app.post('/config/alexa-heard-artist', handleAlexaHeardArtist);
  app.post('/mpd/alexa-heard-artist', handleAlexaHeardArtist);
  app.post('/config/alexa-heard-album', handleAlexaHeardAlbum);
  app.post('/mpd/alexa-heard-album', handleAlexaHeardAlbum);
  app.post('/config/alexa-heard-playlist', handleAlexaHeardPlaylist);
  app.post('/mpd/alexa-heard-playlist', handleAlexaHeardPlaylist);
  app.post('/config/playlist-alias-suggestion', handlePlaylistAliasSuggestion);
  app.post('/mpd/playlist-alias-suggestion', handlePlaylistAliasSuggestion);

  app.post('/config/restart-api', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      try {
        await execFileP('pm2', ['restart', 'api', '--update-env']);
        return res.json({ ok: true, restarted: true, method: 'pm2' });
      } catch (e) {
        return res.status(501).json({
          ok: false,
          restarted: false,
          error: 'Automatic restart unavailable on this host. Restart your API process manually.',
          detail: e?.message || String(e),
        });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}