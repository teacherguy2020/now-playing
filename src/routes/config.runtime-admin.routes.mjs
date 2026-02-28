import fs from 'node:fs/promises';
import path from 'node:path';
import { lookup as dnsLookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

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
      albumPersonnel: Boolean(c.features?.albumPersonnel ?? true),
      mpdscribbleControl: Boolean(c.features?.mpdscribbleControl ?? false),
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

function parseKvOutput(stdout = '') {
  const out = {};
  String(stdout || '').split(/\r?\n/).forEach((line) => {
    const m = String(line || '').match(/^([A-Z_]+)=(.*)$/);
    if (!m) return;
    out[m[1]] = m[2];
  });
  return out;
}

async function getMpdscribbleStatus({ user, host }) {
  const script = [
    'svc="mpdscribble.service"',
    'if systemctl list-unit-files "$svc" --no-legend >/dev/null 2>&1; then INSTALLED=1; else INSTALLED=0; fi',
    'ACTIVE=$(systemctl is-active "$svc" 2>/dev/null || true)',
    'ENABLED=$(systemctl is-enabled "$svc" 2>/dev/null || true)',
    'echo "INSTALLED=$INSTALLED"',
    'echo "ACTIVE=$ACTIVE"',
    'echo "ENABLED=$ENABLED"',
  ].join('; ');

  const { stdout } = await sshBashLc({ user, host, script, timeoutMs: 12000 });
  const kv = parseKvOutput(stdout);
  const installed = String(kv.INSTALLED || '0') === '1';
  const activeRaw = String(kv.ACTIVE || '').trim().toLowerCase();
  const enabledRaw = String(kv.ENABLED || '').trim().toLowerCase();
  const running = activeRaw === 'active';

  return {
    ok: true,
    service: 'mpdscribble.service',
    manager: 'systemd',
    host,
    user,
    installed,
    running,
    status: installed ? (running ? 'running' : (activeRaw || 'stopped')) : 'not-installed',
    activeRaw,
    enabled: enabledRaw === 'enabled',
    enabledRaw,
  };
}

export function registerConfigRuntimeAdminRoutes(app, deps) {
  const { requireTrackKey, log } = deps;
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || path.resolve(process.cwd(), 'config/now-playing.config.json');

  app.get('/config/runtime', async (req, res) => {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return res.json({ ok: true, configPath, config: withEnvOverrides(cfg), fullConfig: cfg });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime/resolve-host', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const host = String(req.body?.host || '').trim();
      if (!host) return res.status(400).json({ ok: false, error: 'host is required' });
      const r = await dnsLookup(host, { family: 4 });
      return res.json({ ok: true, host, address: String(r?.address || ''), family: Number(r?.family || 4) });
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

  app.get('/config/services/mpdscribble/status', async (req, res) => {
    try {
      let cfg = {};
      try {
        cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {}
      const sshHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '').trim();
      const sshUser = String(cfg?.moode?.sshUser || MOODE_SSH_USER || 'moode').trim();
      if (!sshHost) return res.status(400).json({ ok: false, error: 'moode.sshHost or mpd.host is required in config' });

      const status = await getMpdscribbleStatus({ user: sshUser, host: sshHost });
      return res.json(status);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/services/mpdscribble/action', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const action = String(req.body?.action || '').trim().toLowerCase();
      if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ ok: false, error: 'action must be start|stop|restart' });
      }

      let cfg = {};
      try {
        cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {}

      const controlsEnabled = Boolean(cfg?.features?.mpdscribbleControl ?? false);
      if (!controlsEnabled) {
        return res.status(403).json({ ok: false, error: 'mpdscribble controls are disabled in config features' });
      }

      const sshHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '').trim();
      const sshUser = String(cfg?.moode?.sshUser || MOODE_SSH_USER || 'moode').trim();
      if (!sshHost) return res.status(400).json({ ok: false, error: 'moode.sshHost or mpd.host is required in config' });

      const cmd = `sudo -n systemctl ${action} mpdscribble.service || systemctl ${action} mpdscribble.service`;
      await sshBashLc({ user: sshUser, host: sshHost, script: cmd, timeoutMs: 15000 });
      const status = await getMpdscribbleStatus({ user: sshUser, host: sshHost });
      return res.json({ ok: true, action, ...status });
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

  app.post('/config/restart-api', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      try {
        await execFileP('pm2', ['restart', 'api', '--update-env']);
        return res.json({ ok: true, restarted: true, method: 'pm2', services: ['api'] });
      } catch (_) {}

      try {
        await execFileP('sudo', ['-n', 'systemctl', 'restart', 'now-playing.service']);
        return res.json({ ok: true, restarted: true, method: 'systemd', services: ['now-playing.service'] });
      } catch (e) {
        return res.status(501).json({
          ok: false,
          restarted: false,
          error: 'Automatic restart unavailable on this host. Restart your service manually.',
          detail: e?.message || String(e),
        });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/moode/display/status', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const sshHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '').trim();
      const sshUser = String(cfg?.moode?.sshUser || MOODE_SSH_USER || 'moode').trim();
      if (!sshHost) return res.status(400).json({ ok: false, error: 'moode.sshHost or mpd.host is required in config' });

      const script = "db=/var/local/www/db/moode-sqlite3.db; if [ -f \"$db\" ]; then sqlite3 \"$db\" \"select value from cfg_system where param='peppy_display' limit 1;\"; else echo ''; fi";
      const { stdout } = await sshBashLc({ user: sshUser, host: sshHost, script, timeoutMs: 12000 });
      const raw = String(stdout || '').trim();
      const mode = (raw === '1' || /^on$/i.test(raw)) ? 'peppy' : 'webui';
      return res.json({ ok: true, mode, raw, sshHost, sshUser });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/moode/display', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mode = String(req.body?.mode || '').trim().toLowerCase();
      if (!['peppy', 'webui'].includes(mode)) {
        return res.status(400).json({ ok: false, error: 'mode must be peppy or webui' });
      }

      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const moodeBaseRaw = String(cfg?.moode?.baseUrl || '').trim();
      const mpdHost = String(cfg?.mpd?.host || MPD_HOST || '10.0.0.254').trim();
      let moodeBase = moodeBaseRaw || `http://${mpdHost}`;
      if (!/^https?:\/\//i.test(moodeBase)) moodeBase = `http://${moodeBase}`;
      const cmd = encodeURIComponent(`set_display ${mode}`);
      const baseNoSlash = moodeBase.replace(/\/$/, '');
      const urls = [
        `${baseNoSlash}/command/?cmd=${cmd}`,
        `${baseNoSlash}/command/?cmd=set_display ${mode}`,
        `${baseNoSlash}/command/?cmd=set_display%20${mode}`,
      ];

      let okResp = null;
      const attempts = [];
      for (const url of urls) {
        try {
          const r = await fetch(url, { method: 'GET' });
          const txt = await r.text().catch(() => '');
          attempts.push({ url, status: r.status, body: String(txt || '').slice(0, 200) });
          if (r.ok) {
            okResp = { url, status: r.status, body: txt };
            break;
          }
        } catch (e) {
          attempts.push({ url, status: 0, body: e?.message || String(e) });
        }
      }

      if (!okResp) return res.status(502).json({ ok: false, error: 'moode command failed', moodeBase, attempts });
      return res.json({ ok: true, mode, moodeBase, url: okResp.url, response: String(okResp.body || '').slice(0, 300), attempts });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/moode/browser', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const target = String(req.body?.target || '').trim().toLowerCase();
      if (!['nowplaying', 'webui'].includes(target)) {
        return res.status(400).json({ ok: false, error: 'target must be nowplaying or webui' });
      }

      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const sshHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '').trim();
      const sshUser = String(cfg?.moode?.sshUser || MOODE_SSH_USER || 'moode').trim();
      if (!sshHost) return res.status(400).json({ ok: false, error: 'moode.sshHost or mpd.host is required in config' });

      const hostHdr = String(req.get('host') || '').trim();
      const appHost = hostHdr.replace(/:\d+$/, '') || '10.0.0.233';
      const stamp = Date.now();
      const nowPlayingUrl = `http://${appHost}:8101/index.html?sw=${stamp}`;
      const webUiUrl = `http://localhost/?sw=${stamp}`;
      const url = target === 'nowplaying' ? nowPlayingUrl : webUiUrl;

      const pre = target === 'webui'
        ? `curl -fsS 'http://localhost/command/?cmd=set_display%20webui' >/dev/null 2>&1 || true; `
        : '';
      const post = target === 'webui'
        ? `; curl -sG --data-urlencode 'cmd=restart_local_display' http://localhost/command/ >/dev/null 2>&1 || true`
        : '';
      const script = `${pre}DISPLAY=:0 chromium-browser ${shQuoteArg(url)} >/tmp/chromium-switch.log 2>&1 & disown; sleep 1${post}; tail -n 12 /tmp/chromium-switch.log || true`;
      const { stdout, stderr } = await sshBashLc({ user: sshUser, host: sshHost, script, timeoutMs: 14000 });
      return res.json({ ok: true, target, url, sshHost, sshUser, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/moode/library-update', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const host = String(cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '10.0.0.254').trim();
      const port = Number(cfg?.mpd?.port || 6600) || 6600;
      const { stdout, stderr } = await execFileP('mpc', ['-h', host, '-p', String(port), 'update']);
      return res.json({ ok: true, host, port, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/moode/reboot', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const moodeBaseRaw = String(cfg?.moode?.baseUrl || '').trim();
      const mpdHost = String(cfg?.mpd?.host || MOODE_SSH_HOST || MPD_HOST || '10.0.0.254').trim();
      let moodeBase = moodeBaseRaw || `http://${mpdHost}`;
      if (!/^https?:\/\//i.test(moodeBase)) moodeBase = `http://${moodeBase}`;
      const url = `${moodeBase.replace(/\/$/, '')}/command/?cmd=reboot`;

      const r = await fetch(url, { method: 'GET' });
      const txt = await r.text().catch(() => '');
      if (!r.ok) return res.status(502).json({ ok: false, error: `moode reboot failed (${r.status})`, detail: txt.slice(0, 300), url });
      return res.json({ ok: true, url, response: String(txt || '').slice(0, 300) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/restart-services', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      let systemdDetected = false;
      let pm2Detected = false;
      let systemdDetail = '';
      let pm2Detail = '';

      try {
        await execFileP('systemctl', ['list-unit-files', 'now-playing.service', 'now-playing-web.service', '--no-legend']);
        systemdDetected = true;
      } catch (e) {
        systemdDetail = e?.message || String(e);
      }

      if (systemdDetected) {
        try {
          await execFileP('sudo', ['-n', 'systemctl', 'restart', 'now-playing.service', 'now-playing-web.service']);
          return res.json({ ok: true, restarted: true, method: 'systemd', services: ['now-playing.service', 'now-playing-web.service'] });
        } catch (e) {
          systemdDetail = e?.message || String(e);
        }
      }

      try {
        const { stdout } = await execFileP('pm2', ['jlist']);
        const list = JSON.parse(String(stdout || '[]'));
        const names = new Set((Array.isArray(list) ? list : []).map((x) => String(x?.name || '').trim()).filter(Boolean));
        pm2Detected = names.has('api') || names.has('webserver');
      } catch (e) {
        pm2Detail = e?.message || String(e);
      }

      if (pm2Detected) {
        try {
          await execFileP('pm2', ['restart', 'api', '--update-env']);
        } catch {}
        try {
          await execFileP('pm2', ['restart', 'webserver']);
        } catch {}
        return res.json({ ok: true, restarted: true, method: 'pm2', services: ['api', 'webserver'] });
      }

      return res.status(501).json({
        ok: false,
        restarted: false,
        error: 'Automatic restart unavailable on this host. Restart services manually.',
        detect: { systemdDetected, pm2Detected },
        detail: { systemd: systemdDetail, pm2: pm2Detail },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
