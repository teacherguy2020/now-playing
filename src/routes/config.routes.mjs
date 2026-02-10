import fs from 'node:fs/promises';
import path from 'node:path';

function pickPublicConfig(cfg) {
  const c = cfg || {};
  const n = c.notifications || {};
  const tn = n.trackNotify || {};
  const po = n.pushover || {};

  return {
    projectName: c.projectName || 'now-playing',
    trackKey: String(process.env.TRACK_KEY || '1029384756'),
    environment: c.environment || 'home',
    timezone: c.timezone || 'America/Chicago',
    ports: c.ports || { api: 3101, ui: 8101 },
    alexa: c.alexa || { enabled: true, publicDomain: '', skillId: '', webhookPath: '/alexa' },
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
  };
}

function withEnvOverrides(cfg) {
  const out = pickPublicConfig(cfg);

  if (process.env.TRACK_NOTIFY_ENABLED != null) {
    out.notifications.trackNotify.enabled = /^(1|true|yes|on)$/i.test(String(process.env.TRACK_NOTIFY_ENABLED));
  }
  if (process.env.TRACK_NOTIFY_POLL_MS) out.notifications.trackNotify.pollMs = Number(process.env.TRACK_NOTIFY_POLL_MS) || out.notifications.trackNotify.pollMs;
  if (process.env.TRACK_NOTIFY_DEDUPE_MS) out.notifications.trackNotify.dedupeMs = Number(process.env.TRACK_NOTIFY_DEDUPE_MS) || out.notifications.trackNotify.dedupeMs;
  if (process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) out.notifications.trackNotify.alexaMaxAgeMs = Number(process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) || out.notifications.trackNotify.alexaMaxAgeMs;

  if (process.env.PUSHOVER_TOKEN) out.notifications.pushover.token = String(process.env.PUSHOVER_TOKEN);
  if (process.env.PUSHOVER_USER_KEY) out.notifications.pushover.userKey = String(process.env.PUSHOVER_USER_KEY);

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

export function registerConfigRoutes(app, deps) {
  const { requireTrackKey, log } = deps;

  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || path.resolve(process.cwd(), 'config/now-playing.config.json');

  app.get('/config/runtime', async (req, res) => {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return res.json({ ok: true, configPath, config: withEnvOverrides(cfg) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const incoming = req.body?.config;
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing JSON body { config: {...} }' });
      }

      let current = {};
      try {
        current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {}

      const next = {
        ...current,
        ...incoming,
        alexa: { ...(current.alexa || {}), ...(incoming.alexa || {}) },
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

      return res.json({ ok: true, message: 'Config saved. Restart api with --update-env to apply env-overridden values.', config: pickPublicConfig(next) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
