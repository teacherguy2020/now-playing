import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMuteBody,
  parseStepBody,
  parseVolumeBody,
  registerEchoLinkRoutes,
} from '../src/routes/echo-link.routes.mjs';

test('Echo Link volume payload rounds a valid percentage', () => {
  assert.deepEqual(parseVolumeBody({ volume: 34.6 }), { volume: 35 });
  assert.deepEqual(parseVolumeBody({ volume: 0 }), { volume: 0 });
  assert.deepEqual(parseVolumeBody({ volume: 100 }), { volume: 100 });
});

test('Echo Link volume payload rejects invalid values', () => {
  for (const volume of [-1, 101, '35', Number.NaN, true]) {
    assert.throws(() => parseVolumeBody({ volume }));
  }
});

test('Echo Link mute payload requires a boolean', () => {
  assert.deepEqual(parseMuteBody({ mute: true }), { mute: true });
  assert.throws(() => parseMuteBody({ mute: 'true' }));
});

test('Echo Link step payload accepts bounded signed deltas', () => {
  assert.deepEqual(parseStepBody({ delta: -4.6 }), { delta: -5 });
  assert.deepEqual(parseStepBody({ delta: 100 }), { delta: 100 });
  assert.throws(() => parseStepBody({ delta: 101 }));
});

test('authenticated proxy forwards status and rejects missing track key', async () => {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
  const requireTrackKey = (req, res) => {
    if (req.headers?.['x-track-key'] !== 'test-key') {
      res.status(403).json({ ok: false, error: 'forbidden' });
      return false;
    }
    return true;
  };
  let sidecarCall = null;
  registerEchoLinkRoutes(app, {
    enabled: true,
    requireTrackKey,
    requestSidecar: async (path, options) => {
      sidecarCall = { path, options };
      return { status: 200, payload: { ok: true, ready: true, desiredVolume: 30 } };
    },
  });

  const response = () => ({
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const authorized = response();
  await routes.get('GET /echo-link/status')({ headers: { 'x-track-key': 'test-key' } }, authorized);
  assert.equal(authorized.code, 200);
  assert.deepEqual(authorized.body, { enabled: true, ok: true, ready: true, desiredVolume: 30 });
  assert.equal(sidecarCall.path, '/echo-link/status');

  const denied = response();
  await routes.get('GET /echo-link/status')({ headers: {} }, denied);
  assert.equal(denied.code, 403);
  assert.deepEqual(denied.body, { ok: false, error: 'forbidden' });
});
