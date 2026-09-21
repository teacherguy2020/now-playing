import {
  ECHO_LINK_ENABLED,
  ECHO_LINK_HOST,
  ECHO_LINK_PORT,
  ECHO_LINK_TIMEOUT_MS,
} from '../config.mjs';

function sidecarUrl(pathname) {
  const host = ECHO_LINK_HOST.includes(':') && !ECHO_LINK_HOST.startsWith('[')
    ? `[${ECHO_LINK_HOST}]`
    : ECHO_LINK_HOST;
  return `http://${host}:${ECHO_LINK_PORT}${pathname}`;
}

export function parseVolumeBody(body = {}) {
  const value = body?.volume;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('volume must be a number from 0 to 100');
  }
  return { volume: Math.round(value) };
}

export function parseMuteBody(body = {}) {
  if (typeof body?.mute !== 'boolean') throw new Error('mute must be boolean');
  return { mute: body.mute };
}

export function parseStepBody(body = {}) {
  const value = body?.delta;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 100) {
    throw new Error('delta must be a number between -100 and 100');
  }
  return { delta: Math.round(value) };
}

async function requestSidecar(pathname, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ECHO_LINK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(sidecarUrl(pathname), {
      method,
      headers: body == null ? {} : { 'content-type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({ ok: false, error: 'invalid sidecar response' }));
    return { status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

function safeSidecarFailure(error) {
  if (error?.name === 'AbortError') return 'Echo Link sidecar timed out';
  return 'Echo Link sidecar unavailable';
}

export function registerEchoLinkRoutes(app, deps = {}) {
  const requireTrackKey = deps.requireTrackKey;
  const request = deps.requestSidecar || requestSidecar;
  const enabled = deps.enabled ?? ECHO_LINK_ENABLED;

  app.get('/echo-link/status', async (req, res) => {
    if (!requireTrackKey(req, res)) return;
    if (!enabled) return res.json({ ok: true, enabled: false, ready: false });
    try {
      const result = await request('/echo-link/status');
      return res.status(result.status).json({ enabled: true, ...result.payload });
    } catch (error) {
      return res.status(503).json({ ok: false, enabled: true, ready: false, error: safeSidecarFailure(error) });
    }
  });

  const post = (pathname, parser) => async (req, res) => {
    if (!requireTrackKey(req, res)) return;
    if (!enabled) return res.status(503).json({ ok: false, enabled: false, error: 'Echo Link control is disabled' });
    try {
      const body = parser(req.body || {});
      const result = await request(pathname, { method: 'POST', body });
      return res.status(result.status).json({ enabled: true, ...result.payload });
    } catch (error) {
      if (error?.message?.startsWith('volume ') || error?.message?.startsWith('delta ') || error?.message === 'mute must be boolean') {
        return res.status(400).json({ ok: false, error: error.message });
      }
      return res.status(503).json({ ok: false, enabled: true, error: safeSidecarFailure(error) });
    }
  };

  app.post('/echo-link/volume', post('/echo-link/volume', parseVolumeBody));
  app.post('/echo-link/mute', post('/echo-link/mute', parseMuteBody));
  app.post('/echo-link/step', post('/echo-link/step', parseStepBody));
}
