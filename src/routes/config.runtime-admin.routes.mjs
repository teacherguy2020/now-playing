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
