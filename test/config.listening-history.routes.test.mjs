import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerConfigListeningHistoryRoutes } from '../src/routes/config.listening-history.routes.mjs';
import { registerConfigRuntimeAdminRoutes } from '../src/routes/config.runtime-admin.routes.mjs';

function appFixture() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(path, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request() {
  return {
    protocol: 'https',
    query: { limit: '2', period: '1month' },
    get(name) { return String(name).toLowerCase() === 'host' ? 'nowplaying.local:8101' : ''; },
  };
}

test('local listening-history route uses track-key auth and returns row-compatible items', async () => {
  const app = appFixture();
  let received;
  registerConfigListeningHistoryRoutes(app, {
    requireTrackKey: () => true,
    trackKey: 'track-key',
    getItems: async (options) => {
      received = options;
      return [{ kind: 'lastfm-track', title: 'First', file: 'USB/Test/First.mp3' }];
    },
  });

  const res = response();
  await app.routes.get('/config/listening-history/top-tracks')(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'local-history');
  assert.equal(res.body.items[0].title, 'First');
  assert.equal(received.kind, 'top-tracks');
  assert.equal(received.limit, 2);
  assert.equal(received.baseUrl, 'https://nowplaying.local:8101');
  assert.equal(received.trackKey, 'track-key');
});

test('local listening-history route rejects unauthorized requests', async () => {
  const app = appFixture();
  registerConfigListeningHistoryRoutes(app, {
    requireTrackKey: () => false,
    getItems: async () => [{ title: 'should not be returned' }],
  });

  const res = response();
  await app.routes.get('/config/listening-history/top-artists')(request(), res);
  assert.equal(res.body, null);
});

test('local listening-history diagnostics expose persisted qualification status', async () => {
  const app = appFixture();
  let received;
  registerConfigListeningHistoryRoutes(app, {
    requireTrackKey: () => true,
    getItems: async () => [],
    getEvents: async (options) => {
      received = options;
      return [{ sessionId: 'mobile:test', source: 'ios-device', lastfmScrobbleState: 'submitted' }];
    },
  });
  const res = response();
  await app.routes.get('/config/listening-history/events')(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.events[0].lastfmScrobbleState, 'submitted');
  assert.equal(received.limit, 2);
});

test('existing Last.fm row endpoints fall back to local history when unconfigured', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'now-playing-runtime-config-'));
  const configPath = path.join(dir, 'config.json');
  const previousConfigPath = process.env.NOW_PLAYING_CONFIG_PATH;
  await fs.writeFile(configPath, JSON.stringify({ lastfm: {} }), 'utf8');
  process.env.NOW_PLAYING_CONFIG_PATH = configPath;

  try {
    const app = appFixture();
    let received;
    registerConfigRuntimeAdminRoutes(app, {
      requireTrackKey: () => true,
      trackKey: 'track-key',
      log: { debug() {} },
      getLocalHistoryItems: async (options) => {
        received = options;
        return [{ kind: 'lastfm-album', title: 'Local Album', file: 'USB/Test/Album.mp3' }];
      },
    });

    const req = {
      protocol: 'http',
      query: { limit: '4', period: '1month' },
      get(name) { return String(name).toLowerCase() === 'host' ? 'nowplaying.local:8101' : ''; },
    };
    const res = response();
    await app.routes.get('/config/lastfm/top-albums')(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, 'local-history');
    assert.equal(res.body.items[0].title, 'Local Album');
    assert.equal(received.kind, 'top-albums');
    assert.equal(received.period, '1month');
  } finally {
    if (previousConfigPath === undefined) delete process.env.NOW_PLAYING_CONFIG_PATH;
    else process.env.NOW_PLAYING_CONFIG_PATH = previousConfigPath;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
