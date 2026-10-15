import assert from 'node:assert/strict';
import test from 'node:test';

import { registerConfigQobuzAccountRoutes } from '../src/routes/config.qobuz-account.routes.mjs';
import { registerUpnpRoutes } from '../src/routes/upnp.routes.mjs';

function appFixture() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(path, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); },
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

function request(query = {}) {
  return { query, body: {} };
}

const qobuzDevice = {
  id: 'qobuz-device',
  udn: 'uuid:qobuz-device',
  friendlyName: 'Moode UPNP-mediaserver',
  roles: ['media-server'],
  services: [{ serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1' }],
};

test('Qobuz account status reports an advertised server as not connected, never connected', async () => {
  const app = appFixture();
  registerConfigQobuzAccountRoutes(app, {
    requireTrackKey: () => true,
    controlPoint: {
      discover: async () => ({ devices: [qobuzDevice] }),
      browse: async () => ({ items: [{ kind: 'container', id: '0$qobuz$', title: 'Qobuz' }] }),
    },
  });

  const res = response();
  await app.routes.get('/config/qobuz/account/status')(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.state, 'not_connected');
  assert.equal(res.body.mediaServer.discovered, true);
  assert.equal(res.body.authentication.state, 'not_verified');
  assert.equal(res.body.authentication.verified, false);
  assert.equal(res.body.authentication.lastVerifiedAt, null);
  assert.match(res.body.reason, /not been verified/i);
  assert.doesNotMatch(JSON.stringify(res.body), /user_auth_token|password|secret|authorization.?code/i);
});

test('Qobuz account status stays safe when no Qobuz root is discovered', async () => {
  const app = appFixture();
  registerConfigQobuzAccountRoutes(app, {
    requireTrackKey: () => true,
    controlPoint: {
      discover: async () => ({ devices: [{ ...qobuzDevice, id: 'other', udn: 'uuid:other' }] }),
      browse: async () => ({ items: [{ kind: 'container', id: 'music', title: 'Music' }] }),
    },
  });

  const res = response();
  await app.routes.get('/config/qobuz/account/status')(request(), res);
  assert.equal(res.body.state, 'connection_unavailable');
  assert.equal(res.body.mediaServer.discovered, false);
  assert.equal(res.body.authentication.state, 'unknown');
});

test('Qobuz account status requires the existing Track Key', async () => {
  const app = appFixture();
  let browsed = false;
  registerConfigQobuzAccountRoutes(app, {
    requireTrackKey: () => false,
    controlPoint: {
      discover: async () => { browsed = true; return { devices: [] }; },
    },
  });

  const res = response();
  await app.routes.get('/config/qobuz/account/status')(request(), res);
  assert.equal(res.body, null);
  assert.equal(browsed, false);
});

test('Qobuz session release requires the Track Key and confirms inactive ownership', async () => {
  const app = appFixture();
  let releaseCalls = 0;
  let stateReads = 0;
  registerConfigQobuzAccountRoutes(app, {
    requireTrackKey: () => true,
    controlPoint: { discover: async () => ({ devices: [] }) },
    releaseQobuzConnect: async () => {
      releaseCalls += 1;
      return { accepted: true };
    },
    getQobuzNowPlaying: async () => {
      stateReads += 1;
      return stateReads === 1
        ? { active: true, suppressMpdHistory: true }
        : { active: false, suppressMpdHistory: false };
    },
    releaseTimeoutMs: 500,
    releasePollMs: 25,
  });

  const res = response();
  await app.routes.get('POST /config/qobuz/session/release')(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, state: 'released', mutationExecuted: true });
  assert.equal(releaseCalls, 1);
  assert.equal(stateReads, 2);
});

test('Qobuz session release never reports success when inactive state cannot be confirmed', async () => {
  const app = appFixture();
  registerConfigQobuzAccountRoutes(app, {
    requireTrackKey: () => true,
    controlPoint: { discover: async () => ({ devices: [] }) },
    releaseQobuzConnect: async () => ({ accepted: true }),
    getQobuzNowPlaying: async () => ({ active: true, suppressMpdHistory: true }),
    releaseTimeoutMs: 25,
    releasePollMs: 25,
  });

  const res = response();
  await app.routes.get('POST /config/qobuz/session/release')(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'QOBUZ_RELEASE_UNCONFIRMED');
  assert.doesNotMatch(JSON.stringify(res.body), /ssh|token|secret|sessionid/i);
});

test('only a timed-out Qobuz browse is classified as account authorization required', async () => {
  const app = appFixture();
  registerUpnpRoutes(app, {
    requireTrackKey: () => true,
    controlPoint: {
      browse: async () => {
        const error = new Error('internal timeout detail');
        error.code = 'UPNP_TIMEOUT';
        error.status = 502;
        throw error;
      },
      search: async () => {
        const error = new Error('internal timeout detail');
        error.code = 'UPNP_TIMEOUT';
        error.status = 502;
        throw error;
      },
    },
  });

  const qobuzRes = response();
  await app.routes.get('/upnp/media-servers/:deviceId/browse')({
    params: { deviceId: 'qobuz-device' },
    query: { objectId: '0$qobuz$' },
  }, qobuzRes);
  assert.equal(qobuzRes.statusCode, 424);
  assert.equal(qobuzRes.body.code, 'QOBUZ_AUTH_REQUIRED');
  assert.doesNotMatch(qobuzRes.body.error, /internal timeout detail/);

  const genericRes = response();
  await app.routes.get('/upnp/media-servers/:deviceId/browse')({
    params: { deviceId: 'other-device' },
    query: { objectId: '0' },
  }, genericRes);
  assert.equal(genericRes.statusCode, 502);
  assert.equal(genericRes.body.code, 'UPNP_TIMEOUT');
  assert.equal(genericRes.body.error, 'internal timeout detail');

  const qobuzSearchRes = response();
  await app.routes.get('/upnp/media-servers/:deviceId/search')({
    params: { deviceId: 'qobuz-device' },
    query: { containerId: '0$qobuz$' },
  }, qobuzSearchRes);
  assert.equal(qobuzSearchRes.body.code, 'QOBUZ_AUTH_REQUIRED');
});
