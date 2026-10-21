import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMobileRoutes } from '../src/routes/mobile.routes.mjs';
import { createMobileSessionToken } from '../src/lib/mobile-auth.mjs';
import { buildMobileCatalog } from '../src/lib/mobile-track-identity.mjs';

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    protocol: 'https',
    get(name) { return name.toLowerCase() === 'host' ? 'now-playing.tailnet.test' : ''; },
    ...overrides,
  };
}

function fixtureIndex() {
  return {
    builtAt: '2026-10-20T00:00:00.000Z',
    tracks: [
      {
        file: 'USB/SamsungMoode/Test Album/01 - First.mp3',
        artist: 'Test Artist',
        albumArtist: 'Test Artist',
        album: 'Test Album',
        title: 'First',
        track: '1',
        genre: 'Test',
        durationSec: 123,
        mbTrackId: 'track-one',
        mbAlbumId: 'album-one',
        mbArtistId: 'artist-one',
      },
      {
        file: 'USB/SamsungMoode/Test Album/02 - Second.mp3',
        artist: 'Test Artist',
        albumArtist: 'Test Artist',
        album: 'Test Album',
        title: 'Second',
        track: '2',
        genre: 'Test',
        durationSec: 124,
        mbTrackId: 'track-two',
        mbAlbumId: 'album-one',
        mbArtistId: 'artist-one',
      },
    ],
  };
}

function registerFixture(mpdQueryRaw = async () => 'OK\n', extra = {}) {
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'api-secret-for-test',
    trackIdSecret: 'track-secret-for-test',
    enrollmentCode: 'one-time-code',
    getBrowseIndex: async () => fixtureIndex(),
    getMobilePlaylists: async () => [],
    mpdQueryRaw,
    mpdFileToLocalPath: (file) => `/tmp/${file.split('/').at(-1)}`,
    safeIsFile: () => true,
    serveArtworkForTrack: async () => {},
    ...extra,
  });
  return app;
}

function sessionHeaders() {
  const token = createMobileSessionToken({
    secret: 'api-secret-for-test',
    deviceId: 'ipad-brian',
  });
  return { authorization: `Bearer ${token}` };
}

test('Home mobile controls require bearer auth and use the typed diagnostics bridge', async () => {
  const calls = [];
  const app = registerFixture(async () => 'OK\n', {
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      return {
        ok: true,
        status: 200,
        json: { ok: true, repeatOn: options.body?.action === 'repeat' },
      };
    },
  });
  const route = app.routes.get('POST /v1/mobile/now-playing/control');

  const unauthorized = createResponse();
  await route(request({
    headers: { 'x-track-key': 'legacy-track-key' },
    body: { action: 'play' },
  }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(calls, []);

  const malformed = createResponse();
  await route(request({
    headers: sessionHeaders(),
    body: { action: 'play', rendererUrl: 'http://renderer.invalid' },
  }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, 'MOBILE_CONTROL_INVALID_REQUEST');
  assert.deepEqual(calls, []);

  const actions = [
    [{ action: 'play' }, { action: 'play' }],
    [{ action: 'pause' }, { action: 'pause' }],
    [{ action: 'stop' }, { action: 'stop' }],
    [{ action: 'next' }, { action: 'next' }],
    [{ action: 'previous' }, { action: 'prev' }],
    [{ action: 'repeat' }, { action: 'repeat' }],
    [{ action: 'seekRelative', seconds: -30 }, { action: 'seekrel', seconds: -30 }],
    [{ action: 'seekPercent', percent: 37.5 }, { action: 'seekpct', percent: 38 }],
  ];

  for (const [body, expectedInternal] of actions) {
    const response = createResponse();
    await route(request({ headers: sessionHeaders(), body }), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.action, body.action);
    if (body.action === 'repeat') assert.equal(response.body.repeatOn, true);
    if (body.action === 'seekRelative') assert.equal(response.body.seconds, -30);
    if (body.action === 'seekPercent') assert.equal(response.body.percent, 38);
    assert.deepEqual(calls.at(-1), {
      pathname: '/config/diagnostics/playback',
      options: { method: 'POST', body: expectedInternal },
    });
    assert.doesNotMatch(JSON.stringify(response.body), /renderer|command|status|path|Track Key/i);
  }
});

test('Home mobile seek bounds and Qobuz ownership fail closed without releasing Qobuz', async () => {
  const calls = [];
  const app = registerFixture(async () => 'OK\n', {
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      return {
        ok: false,
        status: 409,
        json: {
          ok: false,
          source: 'qobuz-connect',
          error: 'private internal ownership detail',
        },
      };
    },
  });
  const route = app.routes.get('POST /v1/mobile/now-playing/control');

  for (const body of [
    { action: 'seekRelative', seconds: 0 },
    { action: 'seekRelative', seconds: 601 },
    { action: 'seekRelative', seconds: -601 },
    { action: 'seekPercent', percent: -0.1 },
    { action: 'seekPercent', percent: 100.1 },
    { action: 'seekPercent', percent: '50' },
  ]) {
    const response = createResponse();
    await route(request({ headers: sessionHeaders(), body }), response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'MOBILE_SEEK_OUT_OF_BOUNDS');
  }
  assert.deepEqual(calls, []);

  const conflict = createResponse();
  await route(request({
    headers: sessionHeaders(),
    body: { action: 'pause' },
  }), conflict);
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.body, {
    ok: false,
    error: 'Home playback is owned by Qobuz Connect; release Qobuz before controlling Home playback',
    code: 'HOME_PLAYBACK_OWNERSHIP_CONFLICT',
    source: 'qobuz-connect',
  });
  assert.deepEqual(calls, [{
    pathname: '/config/diagnostics/playback',
    options: { method: 'POST', body: { action: 'pause' } },
  }]);
  assert.equal(calls.some(({ pathname }) => pathname.includes('release')), false);
});

test('mobile Vibe resolves an explicit canonical trackId and preserves Queue Wizard seed options', async () => {
  const calls = [];
  const app = registerFixture(async () => 'OK\n', {
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      return {
        ok: true,
        status: 202,
        json: { ok: true, accepted: true, jobId: 'vibe-p0-job' },
      };
    },
  });
  const route = app.routes.get('POST /v1/mobile/queue-wizard/vibe');
  const catalog = buildMobileCatalog(fixtureIndex(), { trackIdSecret: 'track-secret-for-test' });
  const trackId = catalog.tracks[0].id;

  const unauthorized = createResponse();
  await route(request({ body: { trackId } }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(calls, []);

  const invalid = createResponse();
  await route(request({
    headers: sessionHeaders(),
    body: { trackId, file: '/private/path/song.mp3' },
  }), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.code, 'MOBILE_VIBE_INVALID_REQUEST');
  assert.deepEqual(calls, []);

  const unknown = createResponse();
  await route(request({
    headers: sessionHeaders(),
    body: { trackId: 'trk_not-in-catalog' },
  }), unknown);
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.code, 'MOBILE_TRACK_NOT_FOUND');

  const response = createResponse();
  await route(request({
    headers: sessionHeaders(),
    body: {
      trackId,
      targetQueue: 12,
      playNow: true,
      keepPlaying: true,
    },
  }), response);
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, {
    ok: true,
    accepted: true,
    jobId: 'vibe-p0-job',
    trackId,
    targetQueue: 12,
  });
  assert.deepEqual(calls, [{
    pathname: '/config/queue-wizard/vibe-seed-start',
    options: {
      method: 'POST',
      body: {
        targetQueue: 12,
        playNow: true,
        keepPlaying: true,
        seedArtist: 'Test Artist',
        seedTitle: 'First',
      },
    },
  }]);
  assert.doesNotMatch(JSON.stringify(response.body), /SamsungMoode|First\.mp3|Track Key/i);
});

test('the pre-existing current-track mobile Vibe adapter remains compatible', async () => {
  const calls = [];
  const app = registerFixture(async () => 'OK\n', {
    startMobileVibe: async (body) => {
      calls.push(body);
      return { accepted: true, jobId: 'legacy-mobile-vibe-job', targetQueue: body.targetQueue };
    },
  });
  const response = createResponse();
  await app.routes.get('POST /v1/mobile/queue-wizard/vibe')?.(request({
    headers: sessionHeaders(),
    body: { targetQueue: 10, minRating: 2, keepPlaying: true },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    accepted: true,
    jobId: 'legacy-mobile-vibe-job',
    targetQueue: 10,
  });
  assert.deepEqual(calls, [{ targetQueue: 10, minRating: 2, keepPlaying: true }]);
});

test('mobile queue actions expose physical shuffle undo through the existing guarded path', async () => {
  const calls = [];
  const commands = [];
  const app = registerFixture(async (command) => {
    commands.push(command);
    if (command === 'status') {
      return 'state: stop\nsong: -1\nplaylistlength: 2\nrandom: off\nrepeat: off\nOK\n';
    }
    if (command === 'playlistinfo') {
      return [
        'file: USB/SamsungMoode/Test Album/01 - First.mp3',
        'artist: Test Artist',
        'album: Test Album',
        'title: First',
        'pos: 0',
        'id: 77',
        'file: USB/SamsungMoode/Test Album/02 - Second.mp3',
        'artist: Test Artist',
        'album: Test Album',
        'title: Second',
        'pos: 1',
        'id: 78',
        'OK',
      ].join('\n');
    }
    return 'OK\n';
  }, {
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      return {
        ok: true,
        status: 200,
        json: { ok: true, action: 'undoshuffle', undoAvailable: false },
      };
    },
  });

  const response = createResponse();
  const unauthorized = createResponse();
  await app.routes.get('POST /v1/mobile/queue/actions')?.(request({
    body: { action: 'undoshuffle' },
  }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const malformed = createResponse();
  await app.routes.get('POST /v1/mobile/queue/actions')?.(request({
    headers: sessionHeaders(),
    body: { action: 'undoshuffle', file: '/private/path/song.mp3' },
  }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, 'MOBILE_SHUFFLE_UNDO_INVALID_REQUEST');

  await app.routes.get('POST /v1/mobile/queue/actions')?.(request({
    headers: sessionHeaders(),
    body: { action: 'undoshuffle' },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.action, 'undoshuffle');
  assert.equal(response.body.undoAvailable, false);
  assert.deepEqual(calls, [{
    pathname: '/config/diagnostics/playback',
    options: { method: 'POST', body: { action: 'undoshuffle' } },
  }]);
  assert.equal(commands.includes('undoshuffle'), false);
  assert.doesNotMatch(JSON.stringify(response.body), /SamsungMoode|First\.mp3|serverSongId|songid/i);
});
