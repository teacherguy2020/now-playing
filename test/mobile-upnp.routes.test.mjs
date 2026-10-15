import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMobileSessionToken,
  readBearerToken,
  verifyMobileToken,
} from '../src/lib/mobile-auth.mjs';
import { sanitizeMobileNowPlaying } from '../src/lib/mobile-upnp-sanitize.mjs';
import { registerMobileUpnpRoutes } from '../src/routes/mobile-upnp.routes.mjs';

const SECRET = 'mobile-upnp-test-secret';
const TOKEN = createMobileSessionToken({
  secret: SECRET,
  deviceId: 'ios-test-device',
  now: Date.now(),
});

function appFixture() {
  const routes = new Map();
  const add = (method, pathname, handler) => routes.set(`${method} ${pathname}`, handler);
  return {
    routes,
    get(pathname, handler) { add('GET', pathname, handler); },
    post(pathname, handler) { add('POST', pathname, handler); },
    delete(pathname, handler) { add('DELETE', pathname, handler); },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function request({ headers = {}, query = {}, body = {}, params = {} } = {}) {
  return { headers, query, body, params };
}

async function call(app, method, pathname, input = {}) {
  const handler = app.routes.get(`${method} ${pathname}`);
  assert.ok(handler, `missing ${method} ${pathname}`);
  const res = response();
  await handler(request(input), res);
  return res;
}

function requireSession(req, res) {
  const claims = verifyMobileToken(readBearerToken(req), { secret: SECRET, scope: 'mobile-api' });
  if (!claims) {
    res.status(401).json({ ok: false, error: 'mobile session is missing or expired' });
    return null;
  }
  return claims;
}

const mediaServer = {
  id: 'media-server-1',
  udn: 'uuid:media-server-1',
  deviceType: 'urn:schemas-upnp-org:device:MediaServer:1',
  roles: ['media-server'],
  friendlyName: 'Test MediaServer',
  manufacturer: 'Test',
  modelName: 'Fixture',
  location: 'http://10.0.0.254:8200/rootDesc.xml',
  services: [{
    serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1',
    serviceId: 'urn:upnp-org:serviceId:ContentDirectory',
    version: '1',
    scpdUrl: 'http://10.0.0.254:8200/scpd.xml',
    controlUrl: 'http://10.0.0.254:8200/control',
    eventSubUrl: 'http://10.0.0.254:8200/events',
    actions: ['Browse', 'Search'],
  }],
};

const renderer = {
  id: 'renderer-1',
  udn: 'uuid:renderer-1',
  deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1',
  roles: ['media-renderer'],
  friendlyName: 'moOde Renderer',
  location: 'http://10.0.0.254:49152/description.xml',
  services: [{
    serviceType: 'urn:schemas-upnp-org:service:AVTransport:1',
    serviceId: 'urn:upnp-org:serviceId:AVTransport',
    version: '1',
    scpdUrl: 'http://10.0.0.254:49152/scpd.xml',
    controlUrl: 'http://10.0.0.254:49152/control',
    eventSubUrl: 'http://10.0.0.254:49152/events',
    actions: ['Play', 'Pause', 'Stop'],
  }],
};

const browseItem = {
  kind: 'item',
  id: 'track-1',
  parentId: 'album-1',
  title: 'Fixture Track',
  artist: 'Fixture Artist',
  album: 'Fixture Album',
  genre: 'Jazz | Jazz & Blues',
  class: 'object.item.audioItem.musicTrack',
  selectionRef: 'selection-1',
  mediaServerId: mediaServer.id,
  mediaServerUdn: mediaServer.udn,
  artworkUrl: 'http://10.0.0.254:8200/artwork.jpg?token=secret',
  resources: [{
    uri: 'http://10.0.0.254:8200/stream.flac?token=secret',
    protocolInfo: 'http-get:*:audio/flac:*',
    mimeType: 'audio/flac',
    duration: '0:03:21.000',
    durationSeconds: 201,
    sampleFrequency: 96000,
    bitsPerSample: 24,
    audioChannels: 2,
  }],
};

function rendererInspection() {
  return {
    device: renderer,
    services: renderer.services,
    protocolInfo: {
      available: true,
      source: ['http-get:*:audio/flac:*'],
      sink: ['http-get:*:audio/flac:*'],
    },
    readOnlyState: {
      transport: { state: 'STOPPED', status: 'OK', speed: '1' },
      position: { track: 0, trackDuration: '0:00:00', relativeTime: '0:00:00' },
      media: {
        currentUri: 'http://10.0.0.254:8200/stream.flac?token=secret',
        currentMetadataPresent: true,
      },
      currentActions: ['Play', 'Stop'],
    },
  };
}

function queueSnapshot() {
  return {
    active: true,
    queue: {
      queueId: 'queue-1',
      revision: 4,
      rendererId: renderer.id,
      items: [{
        id: 'queue-item-1',
        selectionRef: browseItem.selectionRef,
        mediaServerId: mediaServer.id,
        mediaItemId: browseItem.id,
        title: browseItem.title,
        artist: browseItem.artist,
        album: browseItem.album,
        artworkUrl: browseItem.artworkUrl,
        resource: browseItem.resources[0],
      }],
      currentIndex: 0,
      currentItemId: 'queue-item-1',
      sessionId: 'session-1',
      sessionGeneration: 'generation-1',
      playbackState: 'playing',
      lastConfirmedRendererState: 'PLAYING',
      persistence: 'memory',
    },
  };
}

function configuredApp(overrides = {}) {
  const app = appFixture();
  const calls = { revisions: [], takeovers: [], transports: [] };
  const controlPoint = {
    discover: async () => ({
      discoveredAt: new Date().toISOString(),
      responseCount: 3,
      failures: [{ code: 'UPNP_TIMEOUT', message: 'private network detail' }],
      devices: [mediaServer, renderer, { ...renderer, id: 'other-renderer', location: 'http://10.0.0.99:49152/description.xml' }],
    }),
    describeDevice: async () => mediaServer,
    mediaServerCapabilities: async () => ({
      device: mediaServer,
      services: mediaServer.services,
      browseSupported: true,
      searchSupported: true,
      searchCapabilities: ['dc:title', 'upnp:artist'],
    }),
    browse: async () => ({
      device: mediaServer,
      objectId: '0',
      browseFlag: 'BrowseDirectChildren',
      startingIndex: 0,
      requestedCount: 100,
      numberReturned: 1,
      totalMatches: 1,
      updateId: '7',
      items: [browseItem],
    }),
    search: async () => ({
      device: mediaServer,
      containerId: '0',
      searchCriteria: 'dc:title contains "Fixture"',
      startingIndex: 0,
      requestedCount: 100,
      numberReturned: 1,
      totalMatches: 1,
      updateId: '7',
      items: [browseItem],
    }),
    fetchTrustedArtwork: async () => ({ contentType: 'image/jpeg', bytes: Buffer.from('fixture-image') }),
    ...overrides.controlPoint,
  };
  const session = {
    approvedRendererCapabilities: async () => ({
      device: renderer,
      inspection: rendererInspection(),
      avTransportActions: ['Play', 'Pause', 'Stop'],
      connectionManagerActions: ['GetProtocolInfo'],
    }),
    rendererTransportCapabilities: async () => ({
      renderer,
      source: 'external-upnp',
      owner: 'external',
      queueAuthority: 'renderer',
      queueRouteRequired: false,
      capabilities: {
        pause: true,
        resume: false,
        stop: true,
        seek: true,
        next: true,
        previous: true,
        queueEdit: false,
      },
      transport: {
        state: 'PLAYING',
        status: 'OK',
        speed: '1',
        relativeTime: '0:00:12',
        trackDuration: '0:03:21',
        positionSeconds: 12,
        durationSeconds: 201,
        trackNumber: 1,
        numberOfTracks: 8,
        currentMediaPresent: true,
      },
      approved: true,
      verified: true,
      mutationExecuted: false,
    }),
    rendererTransport: async (args) => {
      calls.transports.push({ ...args });
      return {
        renderer,
        source: 'external-upnp',
        owner: 'external',
        queueAuthority: 'renderer',
        queueRouteRequired: false,
        capabilities: {
          pause: false,
          resume: true,
          stop: true,
          seek: true,
          next: true,
          previous: true,
          queueEdit: false,
        },
        transport: {
          state: args.action === 'stop' ? 'STOPPED' : args.action === 'pause' ? 'PAUSED_PLAYBACK' : 'PLAYING',
          status: 'OK',
          speed: '1',
          relativeTime: '0:00:12',
          trackDuration: '0:03:21',
          positionSeconds: args.positionSeconds ?? 12,
          durationSeconds: 201,
          trackNumber: 1,
          numberOfTracks: 8,
          currentMediaPresent: args.action !== 'stop',
        },
        action: args.action,
        approved: true,
        verified: true,
        mutationExecuted: true,
      };
    },
    preflight: async () => ({
      ok: true,
      qobuz: { active: false, suppressMpdHistory: false },
      mpd: {
        state: 'stop',
        playlistLength: 2,
        playlistVersion: '9',
        queue: [{ file: '/secret/private.flac' }],
        queueHash: 'private-hash',
      },
      renderer: {
        id: renderer.id,
        device: renderer,
        transport: rendererInspection().readOnlyState.transport,
        media: rendererInspection().readOnlyState.media,
        loadedMedia: false,
        currentActions: ['Play', 'Stop'],
        protocolInfo: rendererInspection().protocolInfo,
        avTransportActions: ['Play', 'Pause', 'Stop'],
      },
    }),
    state: async () => ({
      active: true,
      sessionId: 'session-1',
      generation: 'generation-1',
      state: 'playing',
      ownsAudio: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      renderer,
      item: browseItem,
      transport: { state: 'PLAYING', relativeTime: '0:00:12', trackDuration: '0:03:21' },
      queueBaseline: { length: 2, playlistVersion: '9', queue: [{ file: '/secret/private.flac' }] },
      queueChanged: false,
      mutationCount: 1,
      lastError: '',
    }),
    ...overrides.session,
  };
  const queue = {
    currentState: () => queueSnapshot(),
    state: () => queueSnapshot(),
    create: async () => queueSnapshot(),
    addItems: async (queueId, args) => {
      calls.revisions.push({ queueId, ...args });
      return queueSnapshot();
    },
    removeItem: async (queueId, itemId, args) => {
      calls.revisions.push({ queueId, itemId, ...args });
      return queueSnapshot();
    },
    clear: async () => queueSnapshot(),
    reorder: async () => queueSnapshot(),
    play: async () => queueSnapshot(),
    resume: async () => queueSnapshot(),
    pause: async () => queueSnapshot(),
    stop: async () => queueSnapshot(),
    next: async () => queueSnapshot(),
    previous: async () => queueSnapshot(),
    takeover: async (queueId, args) => {
      calls.takeovers.push({ queueId, ...args });
      return {
        ...queueSnapshot(),
        takeover: {
          confirmed: args.confirmed === true,
          stoppedMpd: false,
          stoppedRenderer: true,
        },
      };
    },
    ...overrides.queue,
  };

  registerMobileUpnpRoutes(app, {
    requireEnabled: () => true,
    requireSession,
    getControlPoint: () => controlPoint,
    getPlaybackSession: () => session,
    getPlaybackQueue: () => queue,
    expectedRendererHost: '10.0.0.254',
  });
  return { app, calls };
}

const auth = { authorization: `Bearer ${TOKEN}` };

test('mobile UPnP routes require a bearer session and do not accept Track Key only', async () => {
  let discovered = false;
  const { app } = configuredApp({
    controlPoint: { discover: async () => { discovered = true; return { devices: [] }; } },
  });
  const res = await call(app, 'GET', '/v1/mobile/upnp/devices', {
    headers: { 'x-track-key': 'admin-key' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(discovered, false);
  assert.equal(res.body.error, 'mobile session is missing or expired');

  const takeover = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/takeover', {
    params: { queueId: 'queue-1' },
    body: { confirm: true, revision: 4 },
  });
  assert.equal(takeover.statusCode, 401);
  assert.equal(takeover.body.error, 'mobile session is missing or expired');
});

test('mobile discovery returns only safe media-server and approved-renderer identities', async () => {
  const { app } = configuredApp();
  const res = await call(app, 'GET', '/v1/mobile/upnp/devices', { headers: auth });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mediaServers.length, 1);
  assert.equal(res.body.approvedRenderer.id, renderer.id);
  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /location|scpdUrl|controlUrl|eventSubUrl/);
  assert.doesNotMatch(serialized, /10\.0\.0\.99/);
  assert.equal(res.body.failures[0].code, 'UPNP_TIMEOUT');
});

test('mobile browse and search redact resource and artwork URLs while preserving selection references', async () => {
  const { app } = configuredApp();
  const browse = await call(app, 'GET', '/v1/mobile/upnp/media-servers/:deviceId/browse', {
    headers: auth,
    params: { deviceId: mediaServer.id },
    query: { objectId: '0', startingIndex: '5', requestedCount: '10' },
  });
  assert.equal(browse.statusCode, 200);
  assert.equal(browse.body.items[0].selectionRef, 'selection-1');
  assert.equal(browse.body.items[0].artworkAvailable, true);
  assert.equal(browse.body.items[0].genre, 'Jazz | Jazz & Blues');
  assert.equal(browse.body.items[0].resources[0].mimeType, 'audio/flac');
  const serialized = JSON.stringify(browse.body);
  assert.doesNotMatch(serialized, /artworkUrl|"uri"|token=secret|location|controlUrl/);

  const search = await call(app, 'GET', '/v1/mobile/upnp/media-servers/:deviceId/search', {
    headers: auth,
    params: { deviceId: mediaServer.id },
    query: { containerId: '0', searchCriteria: 'dc:title contains "Fixture"' },
  });
  assert.equal(search.statusCode, 200);
  assert.equal(search.body.items.length, 1);
  assert.equal(search.body.items[0].genre, 'Jazz | Jazz & Blues');
});

test('mobile renderer, preflight, and session responses omit raw renderer and MPD details', async () => {
  const { app } = configuredApp();
  const capabilities = await call(app, 'GET', '/v1/mobile/upnp/renderers/:deviceId/capabilities', {
    headers: auth,
    params: { deviceId: renderer.id },
  });
  const preflight = await call(app, 'GET', '/v1/mobile/upnp/preflight', {
    headers: auth,
    query: { rendererId: renderer.id },
  });
  const session = await call(app, 'GET', '/v1/mobile/upnp/sessions/:sessionId', {
    headers: auth,
    params: { sessionId: 'session-1' },
  });
  for (const res of [capabilities, preflight, session]) {
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(JSON.stringify(res.body), /"currentUri"|queueHash|private\.flac|scpdUrl|controlUrl/);
  }
  assert.equal(preflight.body.mutationExecuted, false);
  assert.equal(session.body.generation, 'generation-1');
});

test('mobile renderer transport is bearer-authenticated, source-aware, and separate from queue control', async () => {
  const { app, calls } = configuredApp();
  const capabilities = await call(app, 'GET', '/v1/mobile/upnp/renderers/:deviceId/transport', {
    headers: auth,
    params: { deviceId: renderer.id },
  });
  assert.equal(capabilities.statusCode, 200);
  assert.equal(capabilities.body.source, 'external-upnp');
  assert.equal(capabilities.body.queueAuthority, 'renderer');
  assert.deepEqual(capabilities.body.controlsAllowed, ['pause', 'stop', 'seek', 'next', 'previous']);
  assert.equal(capabilities.body.transport.numberOfTracks, 8);
  assert.doesNotMatch(JSON.stringify(capabilities.body), /currentUri|location|scpdUrl|controlUrl/);

  const seek = await call(app, 'POST', '/v1/mobile/upnp/renderers/:deviceId/transport/seek', {
    headers: auth,
    params: { deviceId: renderer.id },
    body: { positionSeconds: 42 },
  });
  assert.equal(seek.statusCode, 200);
  assert.equal(seek.body.mutation, 'RendererSeek');
  assert.equal(seek.body.action, 'seek');
  assert.equal(seek.body.mutationExecuted, true);
  assert.equal(calls.transports[0].rendererId, renderer.id);
  assert.equal(calls.transports[0].positionSeconds, 42);

  const unauthorized = await call(app, 'POST', '/v1/mobile/upnp/renderers/:deviceId/transport/stop', {
    params: { deviceId: renderer.id },
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(calls.transports.length, 1);
});

test('mobile queue preserves revision and session identity while redacting queue item URLs', async () => {
  const { app, calls } = configuredApp();
  const read = await call(app, 'GET', '/v1/mobile/upnp/queue', { headers: auth });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.queue.revision, 4);
  assert.equal(read.body.queue.items[0].queueItemId, 'queue-item-1');
  assert.doesNotMatch(JSON.stringify(read.body), /artworkUrl|"uri"|token=secret/);

  const add = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/items', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: { itemRefs: ['selection-1'], revision: 4 },
  });
  assert.equal(add.statusCode, 200);
  assert.equal(calls.revisions[0].revision, 4);
  assert.deepEqual(calls.revisions[0].itemRefs, ['selection-1']);
});

test('mobile takeover is a bearer-authenticated explicit operation with safe result fields', async () => {
  const { app, calls } = configuredApp();
  const res = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/takeover', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: {
      confirm: true,
      itemId: 'queue-item-1',
      revision: 4,
      sessionGeneration: '',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.takeovers[0].confirmed, true);
  assert.equal(calls.takeovers[0].revision, 4);
  assert.equal(res.body.mutation, 'QueueTakeover');
  assert.deepEqual(res.body.takeover, {
    confirmed: true,
    stoppedMpd: false,
    stoppedRenderer: true,
  });
  assert.doesNotMatch(JSON.stringify(res.body), /artworkUrl|"uri"|location|token=secret/);
});

test('mobile Play Now forwards literal takeover intent to the guarded takeover operation', async () => {
  const { app, calls } = configuredApp();
  const res = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/play', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: {
      takeover: true,
      itemId: 'queue-item-1',
      revision: 4,
      sessionGeneration: '',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.takeovers.length, 1);
  assert.equal(calls.takeovers[0].confirmed, true);
  assert.equal(res.body.mutation, 'QueueTakeover');
  assert.equal(res.body.takeover.stoppedRenderer, true);
});

test('mobile ordinary Play without takeover intent remains the normal operation', async () => {
  const { app, calls } = configuredApp();
  const res = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/play', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: { itemId: 'queue-item-1', revision: 4 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.takeovers.length, 0);
  assert.equal(res.body.mutation, 'QueuePlay');
});

test('mobile takeover returns typed stale-generation conflicts without private details', async () => {
  const { app } = configuredApp({
    queue: {
      takeover: async () => {
        const error = new Error('private session internals');
        error.code = 'UPNP_SESSION_GENERATION_CONFLICT';
        error.status = 409;
        error.details = { currentGeneration: 'safe-generation', token: 'do-not-return' };
        throw error;
      },
    },
  });
  const res = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/takeover', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: { confirm: true, revision: 4, sessionGeneration: 'stale' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'UPNP_SESSION_GENERATION_CONFLICT');
  assert.deepEqual(res.body.details, { currentGeneration: 'safe-generation' });
  assert.doesNotMatch(JSON.stringify(res.body), /private session internals|do-not-return/);
});

test('mobile queue preserves typed revision conflicts without forwarding private error text', async () => {
  const { app } = configuredApp({
    queue: {
      addItems: async () => {
        const error = new Error('private queue internals');
        error.code = 'UPNP_QUEUE_REVISION_CONFLICT';
        error.status = 409;
        error.details = { currentRevision: 8, queueHash: 'private-hash' };
        throw error;
      },
    },
  });
  const res = await call(app, 'POST', '/v1/mobile/upnp/queues/:queueId/items', {
    headers: auth,
    params: { queueId: 'queue-1' },
    body: { itemRefs: ['selection-1'], revision: 4 },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'UPNP_QUEUE_REVISION_CONFLICT');
  assert.deepEqual(res.body.details, { currentRevision: 8 });
  assert.doesNotMatch(JSON.stringify(res.body), /private queue internals|queueHash|private-hash/);
});

test('mobile UPnP errors expose typed safe messages without internal details', async () => {
  const { app } = configuredApp({
    controlPoint: {
      browse: async () => {
        const error = new Error('authorization code=do-not-return');
        error.code = 'UPNP_TIMEOUT';
        error.status = 502;
        error.details = { token: 'do-not-return' };
        throw error;
      },
    },
  });
  const res = await call(app, 'GET', '/v1/mobile/upnp/media-servers/:deviceId/browse', {
    headers: auth,
    params: { deviceId: mediaServer.id },
    query: { objectId: '0$qobuz$' },
  });
  assert.equal(res.statusCode, 424);
  assert.equal(res.body.code, 'QOBUZ_AUTH_REQUIRED');
  assert.match(res.body.error, /Connect the Qobuz account/);
  assert.doesNotMatch(JSON.stringify(res.body), /authorization code|do-not-return|token/);
});

test('mobile artwork is bearer-authenticated and returned as bounded binary data', async () => {
  const { app } = configuredApp();
  const res = await call(app, 'GET', '/v1/mobile/upnp/media-items/:selectionRef/artwork', {
    headers: auth,
    params: { selectionRef: 'selection-1' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.equal(res.headers['Cache-Control'], 'private, max-age=300');
  assert.equal(Buffer.isBuffer(res.body), true);
});

test('mobile Now Playing source classification separates owned UPnP, Qobuz Connect, and external UPnP', () => {
  const owned = sanitizeMobileNowPlaying({
    source: 'upnp-sonuvi',
    controller: 'sonuvi',
    ownsAudio: true,
    state: 'playing',
    renderer,
    upnpItem: browseItem,
  });
  assert.equal(owned.source, 'upnp-sonuvi');
  assert.deepEqual(owned.controls.allowed, ['play', 'pause', 'resume', 'stop', 'next', 'previous']);
  assert.deepEqual(owned.controls.unsupported, ['seek', 'repeat', 'shuffle']);
  assert.doesNotMatch(JSON.stringify(owned), /artworkUrl|"uri"|location/);

  const qobuz = sanitizeMobileNowPlaying({ source: 'qobuz-connect', isQobuz: true });
  assert.equal(qobuz.source, 'qobuz-connect');
  assert.deepEqual(qobuz.controls.allowed, []);

  const external = sanitizeMobileNowPlaying({ isUpnp: true, title: 'External' });
  assert.equal(external.source, 'external-upnp');
  assert.deepEqual(external.controls.allowed, []);
});
