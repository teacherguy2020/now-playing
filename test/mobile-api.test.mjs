import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMobileRoutes } from '../src/routes/mobile.routes.mjs';
import { verifyMobileToken } from '../src/lib/mobile-auth.mjs';

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
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { return this; },
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
    builtAt: '2026-09-25T00:00:00.000Z',
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
        file: 'USB/SamsungMoode/Test Album/02 - Second.flac',
        artist: 'Test Artist',
        albumArtist: 'Test Artist',
        album: 'Test Album',
        title: 'Second',
        track: '2',
        genre: 'Test',
        durationSec: 234,
        mbTrackId: 'track-two',
        mbAlbumId: 'album-one',
        mbArtistId: 'artist-one',
      },
    ],
  };
}

function registerFixture(extra = {}) {
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'api-secret-for-test',
    trackIdSecret: 'track-secret-for-test',
    enrollmentCode: 'one-time-code',
    getBrowseIndex: async () => fixtureIndex(),
    getMobilePlaylists: async () => [
      {
        name: 'Road Trip',
        files: [
          'USB/SamsungMoode/Test Album/01 - First.mp3',
          'USB/SamsungMoode/Test Album/01 - First.mp3',
          'USB/SamsungMoode/Missing/99 - Unavailable.mp3',
        ],
        updatedAt: '2026-09-25T00:00:00.000Z',
      },
      {
        name: 'Podcasts - Recent Episodes',
        files: ['USB/SamsungMoode/Podcasts/Example/episode.mp3'],
      },
      {
        name: 'Downloaded Audio',
        files: ['USB/SamsungMoode/Podcasts/Example/episode-2.mp3'],
      },
    ],
    mpdFileToLocalPath: (file) => `/tmp/${file.split('/').at(-1)}`,
    safeIsFile: (file) => file.endsWith('.mp3'),
    serveArtworkForTrack: async () => {},
    servePlaylistArtwork: async (res, name) => res.json({ ok: true, name }),
    ...extra,
  });
  return app;
}

test('mobile session enrollment uses its own credential and issues a scoped token', async () => {
  const app = registerFixture();
  const res = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request(), res);
  assert.equal(res.statusCode, 403);

  const authorized = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), authorized);
  // The fake app stores routes under the method-qualified key.
  assert.equal(authorized.statusCode, 200);
});

test('mobile catalog returns opaque IDs and never returns the MPD file path', async () => {
  const app = registerFixture();
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const token = sessionRes.body.accessToken;

  const res = createResponse();
  await app.routes.get('GET /v1/mobile/catalog/albums')?.(request({
    headers: { authorization: `Bearer ${token}` },
    query: { limit: 10 },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 1);
  assert.match(res.body.items[0].id, /^alb_/);
  assert.doesNotMatch(JSON.stringify(res.body), /SamsungMoode|01 - First|\.flac/);
});

test('mobile album catalog exposes safe added timestamps from the existing library metadata', async () => {
  const app = registerFixture({
    fetchInternalJson: async (pathname) => pathname === '/config/library-health/albums'
      ? {
        ok: true,
        json: {
          albums: [{ artist: 'Test Artist', album: 'Test Album', addedTs: 1234567890 }],
        },
      }
      : null,
  });
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);

  const res = createResponse();
  await app.routes.get('GET /v1/mobile/catalog/albums')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    query: { limit: 10 },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].addedAt, 1234567890);
  assert.doesNotMatch(JSON.stringify(res.body), /sampleFile|folder|SamsungMoode/);
});

test('mobile media authorization binds the ticket to the requested track', async () => {
  const app = registerFixture();
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;

  const catalogRes = createResponse();
  await app.routes.get('GET /v1/mobile/catalog/tracks/:trackId')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    params: { trackId: 'trk_invalid' },
  }), catalogRes);
  assert.equal(catalogRes.statusCode, 404);

  const searchRes = createResponse();
  await app.routes.get('GET /v1/mobile/search')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    query: { q: 'First' },
  }), searchRes);
  const trackId = searchRes.body.items[0].id;

  const authRes = createResponse();
  await app.routes.get('POST /v1/mobile/media-authorizations')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    body: { trackId, format: 'mp3' },
  }), authRes);

  assert.equal(authRes.statusCode, 200);
  assert.doesNotMatch(authRes.body.url, /SamsungMoode|First\.mp3/);
  const ticket = new URL(authRes.body.url).searchParams.get('ticket');
  const claims = verifyMobileToken(ticket, { secret: 'api-secret-for-test', scope: 'mobile-media' });
  assert.equal(claims.trackId, trackId);
  assert.equal(claims.deviceId, 'iphone-brian');
});

test('mobile canonical track rating is bearer-scoped and never exposes the source file', async () => {
  const calls = [];
  const app = registerFixture({
    getRatingForFile: async (file) => file.endsWith('First.mp3') ? 4 : 0,
    ratingsEnabled: async () => true,
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      return {
        ok: true,
        status: 200,
        json: { ok: true, rating: options.body?.rating, disabled: false },
      };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const authHeaders = { authorization: `Bearer ${sessionRes.body.accessToken}` };

  const searchRes = createResponse();
  await app.routes.get('GET /v1/mobile/search')?.(request({
    headers: authHeaders,
    query: { q: 'First' },
  }), searchRes);
  const trackId = searchRes.body.items[0].id;

  const readRes = createResponse();
  await app.routes.get('GET /v1/mobile/catalog/tracks/:trackId/rating')?.(request({
    headers: authHeaders,
    params: { trackId },
  }), readRes);
  assert.deepEqual(readRes.body, { ok: true, rating: 4, ratingDisabled: false, disabled: false });

  const writeRes = createResponse();
  await app.routes.get('POST /v1/mobile/catalog/tracks/:trackId/rating')?.(request({
    headers: authHeaders,
    params: { trackId },
    body: { rating: 5 },
  }), writeRes);
  assert.deepEqual(writeRes.body, { ok: true, rating: 5, ratingDisabled: false, disabled: false });
  assert.deepEqual(calls.map((call) => call.pathname), ['/rating']);
  assert.deepEqual(calls[0].options.body, {
    file: 'USB/SamsungMoode/Test Album/01 - First.mp3',
    rating: 5,
  });
  assert.doesNotMatch(JSON.stringify(readRes.body), /SamsungMoode|First\.mp3/);
  assert.doesNotMatch(JSON.stringify(writeRes.body), /SamsungMoode|First\.mp3/);
});

test('local-source manifest maps canonical track IDs without exposing absolute server paths', async () => {
  const manifestIndex = fixtureIndex();
  manifestIndex.tracks = manifestIndex.tracks.map((track) => ({
    ...track,
    file: track.file.replace(
      'USB/SamsungMoode/',
      'USB/SamsungMoode/Ondesoft/'
    ),
  }));
  const app = registerFixture({
    getBrowseIndex: async () => manifestIndex,
    musicLibraryRoot: '/tmp/music',
    mpdFileToLocalPath: (file) => `/tmp/music/${file.replace('USB/SamsungMoode/', '')}`,
    safeIsFile: () => true,
    statLocalFile: async () => ({ size: 1234 }),
  });
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);

  const res = createResponse();
  await app.routes.get('GET /v1/mobile/local-source/manifest')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schema, 'now-playing.mobile-local-source-manifest.v1');
  assert.equal(res.body.entries.length, 2);
  assert.ok(res.body.entries.every((entry) => entry.trackId.startsWith('trk_')));
  assert.ok(res.body.entries.every((entry) => !entry.relativePath.startsWith('/')));
  assert.ok(res.body.entries.every((entry) => !JSON.stringify(entry).includes('/tmp/')));
  assert.ok(res.body.entries.every((entry) => entry.sizeBytes === 1234));
  assert.equal(res.body.entries[0].relativePath, 'Ondesoft/Test Album/01 - First.mp3');
  assert.equal(res.body.entries[0].contentPath, 'Test Album/01 - First.mp3');
});

test('native playback events resolve the canonical track and feed shared history', async () => {
  let observed = null;
  const app = registerFixture({
    listeningHistory: {
      observe: async (event) => {
        observed = event;
        return { recorded: true, reason: 'recorded' };
      },
    },
  });
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const searchRes = createResponse();
  await app.routes.get('GET /v1/mobile/search')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    query: { q: 'First' },
  }), searchRes);
  const trackId = searchRes.body.items[0].id;

  const res = createResponse();
  await app.routes.get('POST /v1/mobile/playback/events')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    body: {
      trackId,
      sessionId: 'device-session-1',
      state: 'progress',
      elapsedSec: 78,
      durationSec: 123,
      startedAtMs: Date.now() - 60_000,
      file: '/client/should-not-be-used.mp3',
    },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.trackId, trackId);
  assert.equal(res.body.recorded, true);
  assert.equal(observed.source, 'ios-device');
  assert.equal(observed.sessionId, 'mobile:device-session-1');
  assert.equal(observed.song.file, 'USB/SamsungMoode/Test Album/01 - First.mp3');
  assert.equal(observed.song.title, 'First');
  assert.equal(observed.status.elapsedSec, 78);
});

test('native playback events reject unknown canonical IDs instead of creating local identities', async () => {
  const app = registerFixture({
    listeningHistory: { observe: async () => ({ recorded: false }) },
  });
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);

  const res = createResponse();
  await app.routes.get('POST /v1/mobile/playback/events')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    body: {
      trackId: 'portable-ssd:track:missing.flac',
      sessionId: 'device-session-2',
      state: 'start',
    },
  }), res);

  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /track not found/);
});

test('mobile radio stream authorization keeps the station URL behind a scoped ticket', async () => {
  const app = registerFixture({
    fetchInternalRequest: async (pathname) => {
      if (pathname === '/config/queue-wizard/radio-preview') {
        return {
          ok: true,
          json: {
            tracks: [{
              file: 'https://radio.example.test/live.mp3',
              stationName: 'Example Radio',
              genre: 'Jazz',
              format: 'mp3',
              bitrate: '128',
            }],
          },
        };
      }
      return { ok: true, json: {} };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;

  const stationsRes = createResponse();
  await app.routes.get('GET /v1/mobile/radio')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
  }), stationsRes);
  assert.equal(stationsRes.statusCode, 200);
  const stationId = stationsRes.body.items[0].id;

  const authRes = createResponse();
  await app.routes.get('POST /v1/mobile/radio/stream-authorizations')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    body: { stationId },
  }), authRes);

  assert.equal(authRes.statusCode, 200);
  assert.doesNotMatch(authRes.body.url, /radio\.example\.test/);
  const ticket = new URL(authRes.body.url).searchParams.get('ticket');
  const claims = verifyMobileToken(ticket, { secret: 'api-secret-for-test', scope: 'mobile-radio' });
  assert.equal(claims.stationId, stationId);
  assert.equal(claims.deviceId, 'iphone-brian');
});

test('mobile radio station artwork uses the catalog logo name behind an opaque URL', async () => {
  let artworkDescriptor = null;
  const streamFile = 'https://stream.revma.ihrhls.com/zc6784';
  const app = registerFixture({
    fetchInternalRequest: async (pathname) => pathname === '/config/queue-wizard/radio-preview'
      ? {
        ok: true,
        json: {
          tracks: [{
            file: streamFile,
            stationName: 'Rat Pack Radio',
            logoName: 'iHeart Rat Pack Radio',
            genre: 'Jazz',
            format: 'aac',
            bitrate: '128',
          }],
        },
      }
      : { ok: true, json: {} },
    serveHomeArtwork: async (res, descriptor) => {
      artworkDescriptor = descriptor;
      return res.json({ ok: true, descriptor });
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const stationsRes = createResponse();
  await app.routes.get('GET /v1/mobile/radio')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), stationsRes);

  assert.equal(stationsRes.statusCode, 200);
  const artworkURL = stationsRes.body.items[0].artworkUrl;
  assert.match(artworkURL, /\/v1\/mobile\/home\/artwork\/har_/);
  assert.doesNotMatch(artworkURL, /zc6784|Rat%20Pack/);

  const artworkId = artworkURL.split('/').at(-1);
  const artworkRes = createResponse();
  await app.routes.get('GET /v1/mobile/home/artwork/:artworkId')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    params: { artworkId },
  }), artworkRes);

  assert.equal(artworkRes.statusCode, 200);
  assert.deepEqual(artworkDescriptor, { kind: 'radio', reference: 'iHeart Rat Pack Radio' });
});

test('mobile direct radio metadata returns enriched art and a safe Apple Music link', async () => {
  const app = registerFixture({
    fetchInternalRequest: async (pathname) => pathname === '/config/queue-wizard/radio-preview'
      ? {
        ok: true,
        json: {
          tracks: [{
            file: 'https://radio.example.test/live.mp3',
            stationName: 'Example Radio',
            genre: 'Jazz',
            format: 'mp3',
            bitrate: '128',
          }],
        },
      }
      : { ok: true, json: {} },
    enrichRadioMetadata: async ({ artist, title }) => ({
      matched: true,
      artist,
      title,
      album: 'Kind of Blue',
      year: '1959',
      artworkUrl: 'https://images.example.test/kind-of-blue.jpg',
      trackUrl: 'https://music.apple.com/us/song/blue-in-green/268443106',
      reason: 'matched',
    }),
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;

  const stationsRes = createResponse();
  await app.routes.get('GET /v1/mobile/radio')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
  }), stationsRes);
  const stationId = stationsRes.body.items[0].id;

  const response = createResponse();
  await app.routes.get('POST /v1/mobile/radio/metadata')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    body: {
      stationId,
      artist: 'Miles Davis',
      title: 'Blue in Green',
    },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.matched, true);
  assert.equal(response.body.album, 'Kind of Blue');
  assert.equal(response.body.year, '1959');
  assert.equal(response.body.appleMusicUrl, 'https://music.apple.com/us/song/blue-in-green/268443106');
  assert.match(response.body.artworkUrl, /\/v1\/mobile\/home\/artwork\/har_/);
});

test('mobile animated-art lookup reuses the server cache without exposing admin paths', async () => {
  const lookupPaths = [];
  const app = registerFixture({
    fetchInternalJson: async (pathname) => {
      lookupPaths.push(pathname);
      return {
        ok: true,
        json: {
          ok: true,
          hit: {
            mp4: 'http://127.0.0.1:3101/config/library-health/animated-art/media/0123456789abcdef0123456789abcdef01234567.mp4',
          },
        },
      };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;

  const unauthorized = createResponse();
  await app.routes.get('GET /v1/mobile/animated-art')?.(request({
    query: { artist: 'Test Artist', album: 'Test Album' },
  }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const local = createResponse();
  await app.routes.get('GET /v1/mobile/animated-art')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    query: { artist: 'Test Artist', album: 'Test Album' },
  }), local);
  assert.equal(local.statusCode, 200);
  assert.equal(local.body.ok, true);
  assert.equal(local.body.hasMotion, true);
  assert.match(local.body.mediaUrl, /^https:\/\/now-playing\.tailnet\.test\/config\/library-health\/animated-art\/media\//);
  assert.doesNotMatch(local.body.mediaUrl, /127\.0\.0\.1|track-key|SamsungMoode|\.flac/);
  assert.match(lookupPaths[0], /^\/config\/library-health\/animated-art\/lookup\?/);

  const radio = createResponse();
  await app.routes.get('GET /v1/mobile/animated-art')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    query: { appleMusicUrl: 'https://music.apple.com/us/album/sob-rock/1568819304' },
  }), radio);
  assert.equal(radio.statusCode, 200);
  assert.equal(radio.body.hasMotion, true);
  assert.match(lookupPaths[1], /^\/config\/library-health\/animated-art\/radio-lookup\?/);

  const malformed = createResponse();
  await app.routes.get('GET /v1/mobile/animated-art')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
    query: { artist: 'Test Artist' },
  }), malformed);
  assert.equal(malformed.statusCode, 400);
});

test('mobile playlists require a bearer session and preserve opaque ordered entries', async () => {
  const app = registerFixture();

  const unauthenticated = createResponse();
  await app.routes.get('GET /v1/mobile/playlists')?.(request(), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const trackKeyOnly = createResponse();
  await app.routes.get('GET /v1/mobile/playlists')?.(request({
    headers: { 'x-track-key': 'admin-track-key' },
  }), trackKeyOnly);
  assert.equal(trackKeyOnly.statusCode, 401);

  const invalidBearer = createResponse();
  await app.routes.get('GET /v1/mobile/playlists')?.(request({
    headers: { authorization: 'Bearer not-a-valid-mobile-token' },
  }), invalidBearer);
  assert.equal(invalidBearer.statusCode, 401);

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);
  const token = sessionRes.body.accessToken;

  const listRes = createResponse();
  await app.routes.get('GET /v1/mobile/playlists')?.(request({
    headers: { authorization: `Bearer ${token}` },
  }), listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.total, 1);
  const summary = listRes.body.items[0];
  assert.match(summary.id, /^pl_[A-Za-z0-9_-]+$/);
  assert.match(summary.revision, /^rev_[A-Za-z0-9_-]+$/);
  assert.equal(summary.name, 'Road Trip');
  assert.equal(summary.trackCount, 3);
  assert.equal(summary.updatedAt, '2026-09-25T00:00:00.000Z');
  assert.match(summary.artworkUrl, /^https:\/\/now-playing\.tailnet\.test\/v1\/mobile\/playlists\/pl_[A-Za-z0-9_-]+\/artwork$/);
  assert.doesNotMatch(JSON.stringify(listRes.body), /SamsungMoode|Unavailable/);

  const rawName = createResponse();
  await app.routes.get('GET /v1/mobile/playlists/:playlistId')?.(request({
    headers: { authorization: `Bearer ${token}` },
    params: { playlistId: 'Road Trip' },
  }), rawName);
  assert.equal(rawName.statusCode, 404);

  const detailRes = createResponse();
  await app.routes.get('GET /v1/mobile/playlists/:playlistId')?.(request({
    headers: { authorization: `Bearer ${token}` },
    params: { playlistId: summary.id },
  }), detailRes);
  assert.equal(detailRes.statusCode, 200);
  assert.equal(detailRes.body.playlist.id, summary.id);
  assert.deepEqual(detailRes.body.entries.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(detailRes.body.entries[0].track.id, detailRes.body.entries[1].track.id);
  assert.equal(detailRes.body.entries[0].available, true);
  assert.equal(detailRes.body.entries[2].available, false);
  assert.equal(detailRes.body.entries[2].track, null);
  assert.equal(detailRes.body.entries[2].unavailableReason, 'track is unavailable in the mobile catalog');
  assert.doesNotMatch(JSON.stringify(detailRes.body), /SamsungMoode|First\.mp3|Unavailable/);

  const artworkRes = createResponse();
  await app.routes.get('GET /v1/mobile/playlists/:playlistId/artwork')?.(request({
    headers: { authorization: `Bearer ${token}` },
    params: { playlistId: summary.id },
  }), artworkRes);
  assert.equal(artworkRes.statusCode, 200);
  assert.deepEqual(artworkRes.body, { ok: true, name: 'Road Trip' });
});

test('mobile home discovery rows require a bearer session, not a Track Key', async () => {
  const app = registerFixture();

  const unauthenticated = createResponse();
  await app.routes.get('GET /v1/mobile/home/rows')?.(request(), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const trackKeyOnly = createResponse();
  await app.routes.get('GET /v1/mobile/home/rows')?.(request({
    headers: { 'x-track-key': 'admin-track-key' },
  }), trackKeyOnly);
  assert.equal(trackKeyOnly.statusCode, 401);
});

test('mobile home shelf settings save ordered row sources through the bearer boundary', async () => {
  const calls = [];
  const currentProfile = {
    devicePreset: 'tablet',
    theme: 'auto',
    layout: 'home-rail',
    showRecent: true,
    recentSource: 'albums',
    recentRows: ['albums', 'playlists', 'podcasts', 'radio'],
    colorPreset: 'violet',
    recentCount: 18,
    customColors: {
      primaryThemeColor: '#123456',
      secondaryThemeColor: '#234567',
      primaryTextColor: '#fefefe',
      secondaryTextColor: '#ababab',
    },
  };
  const app = registerFixture({
    fetchInternalJson: async (pathname) => {
      assert.equal(pathname, '/config/controller-profile');
      return { ok: true, status: 200, json: { ok: true, profile: currentProfile } };
    },
    fetchInternalRequest: async (pathname, options) => {
      calls.push({ pathname, options });
      return { ok: true, status: 200, json: { ok: true, profile: options.body.profile } };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('POST /v1/mobile/home/profile')?.(request({
    headers: { authorization: "Bearer " + sessionRes.body.accessToken },
    body: { recentRows: ['lastfm-toptracks', 'lastfm-topartists', 'albums', 'radio'] },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.profile.recentRows, [
    'lastfm-toptracks',
    'lastfm-topartists',
    'albums',
    'radio',
  ]);
  assert.equal(response.body.profile.colorPreset, 'violet');
  assert.deepEqual(calls.map((call) => call.pathname), ['/config/controller-profile']);
  assert.deepEqual(calls[0].options.body.profile.customColors, currentProfile.customColors);
});

test('mobile now-playing returns safe metadata and proxies raw artwork behind bearer auth', async () => {
  const app = registerFixture({
    fetchInternalJson: async (pathname) => {
      assert.equal(pathname, '/now-playing');
      return {
        ok: true,
        status: 200,
        json: {
          state: 'play',
          title: 'First',
          artist: 'Test Artist',
          album: 'Test Album',
          displayTitle: 'First',
          displayArtist: 'Test Artist',
          displayLine3: 'Test Album',
          duration: 123,
          elapsed: 12,
          queueTrack: 3,
          queueTotal: 9,
          albumArtUrl: 'http://moode.local/coverart.php/secret-file.jpg',
          isStream: false,
          isPodcast: false,
          isRadio: false,
          personnel: ['Test Musician (piano)', 'Test Ensemble'],
        },
      };
    },
  });

  const unauthenticated = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request(), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body.available, true);
  assert.equal(response.body.title, 'First');
  assert.equal(response.body.artist, 'Test Artist');
  assert.equal(response.body.isPlaying, true);
  assert.equal(response.body.queueTrack, 3);
  assert.equal(response.body.queueTotal, 9);
  assert.deepEqual(response.body.personnel, ['Test Musician (piano)', 'Test Ensemble']);
  assert.equal(response.body.appleMusicUrl, null);
  assert.equal(response.body.radioYear, null);
  assert.match(response.body.artworkUrl, /\/v1\/mobile\/home\/artwork\/har_/);
  assert.match(response.body.backgroundArtworkUrl, /\/v1\/mobile\/home\/artwork\/har_/);
  assert.doesNotMatch(JSON.stringify(response.body), /coverart|secret-file|SamsungMoode/);
});

test('mobile now-playing follows the fresh Alexa current-track authority', async () => {
  const app = registerFixture({
    fetchInternalJson: async (pathname) => {
      if (pathname === '/now-playing') {
        return {
          ok: true,
          status: 200,
          json: {
            state: 'pause',
            title: 'Slow Hot Wind',
            artist: 'Pat Metheny',
            album: "What's It All About",
            file: 'USB/SamsungMoode/Test Album/01 - Slow Hot Wind.flac',
          },
        };
      }
      if (pathname === '/alexa/was-playing') {
        return {
          ok: true,
          status: 200,
          json: {
            fresh: true,
            wasPlaying: {
              active: true,
              modeActive: false,
              playbackTarget: 'echo',
              playbackMode: 'alexa',
            },
            nowPlaying: {
              state: 'play',
              active: true,
              modeActive: false,
              alexaMode: false,
              playbackTarget: 'echo',
              playbackMode: 'alexa',
              title: 'Alfie',
              artist: 'Pat Metheny',
              album: "What's It All About",
              file: 'USB/SamsungMoode/Test Album/02 - Second.flac',
              albumArtUrl: 'http://moode.local/coverart.php/secret-alexa.jpg',
              rating: 4,
              ratingDisabled: false,
            },
          },
        };
      }
      throw new Error(`unexpected internal route ${pathname}`);
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.title, 'Alfie');
  assert.equal(response.body.artist, 'Pat Metheny');
  assert.equal(response.body.album, "What's It All About");
  assert.equal(response.body.state, 'play');
  assert.equal(response.body.isPlaying, true);
  assert.equal(response.body.queueTrack, null);
  assert.equal(response.body.queueTotal, null);
  assert.equal(response.body.rating, 4);
  assert.match(response.body.artworkUrl, /\/v1\/mobile\/home\/artwork\/har_/);
  assert.doesNotMatch(JSON.stringify(response.body), /secret-alexa|SamsungMoode/);
});

test('mobile audio info requires bearer auth and strips internal source metadata', async () => {
  const app = registerFixture({
    fetchInternalJson: async (pathname) => {
      assert.equal(pathname, '/config/moode/audio-info?view=rows');
      return {
        ok: true,
        status: 200,
        json: {
          sourceUrl: 'http://moode.local/audioinfo.php',
          fetchedAt: '2026-09-30T12:00:00.000Z',
          rows: [
            { section: 'Audio Device', key: 'Device', value: 'Test DAC' },
            { section: 'Audio Device', key: 'Sample rate', value: '192 kHz' },
            { section: '', key: '', value: 'discarded' },
          ],
        },
      };
    },
  });

  const unauthenticated = createResponse();
  await app.routes.get('GET /v1/mobile/audio-info')?.(request(), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/audio-info')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.rows, [
    { section: 'Audio Device', key: 'Device', value: 'Test DAC' },
    { section: 'Audio Device', key: 'Sample rate', value: '192 kHz' },
  ]);
  assert.equal(response.body.fetchedAt, '2026-09-30T12:00:00.000Z');
  assert.equal(response.body.sourceUrl, undefined);
});

test('mobile now-playing replaces a generic radio fallback with the resolved queue station', async () => {
  const streamFile = 'https://live.amperwave.net/manifest/audacy-wscramaac-hlsc.m3u8';
  const app = registerFixture({
    mpdQueryRaw: async (command) => {
      if (command === 'playlistinfo') {
        return `file: ${streamFile}\npos: 0\nid: 44\nOK\n`;
      }
      if (command === 'status') {
        return 'state: play\nsong: 0\nsongid: 44\nplaylistlength: 1\nOK\n';
      }
      return 'OK\n';
    },
    fetchInternalJson: async (pathname) => {
      if (pathname === '/now-playing') {
        return {
          ok: true,
          status: 200,
          json: {
            state: 'play',
            displayTitle: 'Live Radio',
            displayArtist: 'Radio',
            displayConfidence: 'fallback',
            isStream: true,
            isRadio: true,
          },
        };
      }
      assert.equal(pathname, '/config/diagnostics/queue');
      return {
        ok: true,
        status: 200,
        json: {
          items: [{
            position: 1,
            file: streamFile,
            stationName: '670 The Score',
            title: '',
            artist: '',
            album: '',
            thumbUrl: '/art/radio-logo.jpg?name=670%20The%20Score',
          }],
        },
      };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.title, 'Live Radio');
  assert.equal(response.body.stationName, '670 The Score');
  assert.equal(response.body.artist, '670 The Score');
  assert.match(response.body.artworkUrl, /\/v1\/mobile\/home\/artwork\/har_/);
  assert.doesNotMatch(JSON.stringify(response.body), /amperwave|audacy-wscr|serverSongId|songid/i);
});

test('mobile now-playing prefers canonical matched radio artwork over the queue station logo', async () => {
  const streamFile = 'https://radio.example.test/670-score.mp3';
  const matchedArtwork = 'https://images.example.test/fragile.jpg';
  const app = registerFixture({
    mpdQueryRaw: async (command) => {
      if (command === 'playlistinfo') {
        return `file: ${streamFile}\npos: 0\nid: 44\nOK\n`;
      }
      if (command === 'status') {
        return 'state: play\nsong: 0\nsongid: 44\nplaylistlength: 1\nOK\n';
      }
      return 'OK\n';
    },
    fetchInternalJson: async (pathname) => {
      if (pathname === '/now-playing') {
        return {
          ok: true,
          status: 200,
          json: {
            state: 'play',
            displayTitle: 'Fragile',
            displayArtist: 'Sting',
            displayLine3: '...Nothing Like the Sun',
            displayArtUrl: matchedArtwork,
            radioTrackUrl: 'https://music.apple.com/us/song/fragile/123456',
            isStream: true,
            isRadio: true,
          },
        };
      }
      assert.equal(pathname, '/config/diagnostics/queue');
      return {
        ok: true,
        status: 200,
        json: {
          items: [{
            position: 1,
            file: streamFile,
            stationName: '670 The Score',
            thumbUrl: 'https://images.example.test/670-score-logo.jpg',
          }],
        },
      };
    },
    serveHomeArtwork: async (res, descriptor) => res.json({ ok: true, descriptor }),
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.appleMusicUrl, 'https://music.apple.com/us/song/fragile/123456');
  const artworkId = response.body.artworkUrl.split('/').at(-1);
  const artworkResponse = createResponse();
  await app.routes.get('GET /v1/mobile/home/artwork/:artworkId')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    params: { artworkId },
  }), artworkResponse);
  assert.equal(artworkResponse.statusCode, 200);
  assert.equal(artworkResponse.body.descriptor.reference, matchedArtwork);
});

test('mobile now-playing exposes only safe Apple Music radio matches', async () => {
  const app = registerFixture({
    fetchInternalJson: async () => ({
      ok: true,
      status: 200,
      json: {
        state: 'play',
        displayTitle: 'Blue in Green',
        displayArtist: 'Miles Davis',
        displayLine3: 'Kind of Blue',
        radioYear: '1959',
        radioItunesUrl: 'https://music.apple.com/us/album/kind-of-blue/268443094',
        radioTrackUrl: 'https://music.apple.com/us/song/blue-in-green/268443106',
        isStream: true,
        isRadio: true,
        albumArtUrl: 'https://images.example.test/station.jpg',
      },
    }),
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;

  const response = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${sessionToken}` },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.title, 'Blue in Green');
  assert.equal(response.body.artist, 'Miles Davis');
  assert.equal(response.body.album, 'Kind of Blue');
  assert.equal(response.body.radioYear, '1959');
  assert.equal(response.body.appleMusicUrl, 'https://music.apple.com/us/song/blue-in-green/268443106');

  const unsafeApp = registerFixture({
    fetchInternalJson: async () => ({
      ok: true,
      status: 200,
      json: {
        state: 'play',
        title: 'Talk',
        artist: 'Station',
        isStream: true,
        isRadio: true,
        radioTrackUrl: 'https://evil.example.test/redirect',
      },
    }),
  });
  const unsafeSession = createResponse();
  await unsafeApp.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'ipad-brian' },
  }), unsafeSession);
  const unsafeResponse = createResponse();
  await unsafeApp.routes.get('GET /v1/mobile/now-playing')?.(request({
    headers: { authorization: `Bearer ${unsafeSession.body.accessToken}` },
  }), unsafeResponse);
  assert.equal(unsafeResponse.body.appleMusicUrl, null);
});

test('mobile playlist detail rejects an unknown opaque ID after bearer authentication', async () => {
  const app = registerFixture();
  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);

  const res = createResponse();
  await app.routes.get('GET /v1/mobile/playlists/:playlistId')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    params: { playlistId: 'pl_not-a-real-playlist' },
  }), res);
  assert.equal(res.statusCode, 404);
});

test('mobile now-playing uses canonical metadata for controls and mutations', async () => {
  const fragileFile = 'USB/SamsungMoode/Fragile/01 - Fragile.flac';
  const calls = [];
  const app = registerFixture({
    getBrowseIndex: async () => ({
      ...fixtureIndex(),
      tracks: [
        ...fixtureIndex().tracks,
        {
          file: fragileFile,
          artist: 'Test Artist',
          albumArtist: 'Test Artist',
          album: 'Fragile',
          title: 'Fragile',
          track: '1',
          genre: 'Test',
          durationSec: 321,
          mbTrackId: 'track-fragile',
          mbAlbumId: 'album-fragile',
          mbArtistId: 'artist-one',
        },
      ],
    }),
    fetchInternalJson: async (pathname) => {
      assert.equal(pathname, '/now-playing');
      return {
        ok: true,
        json: {
          state: 'play',
          title: 'Fragile',
          artist: 'Test Artist',
          album: 'Fragile',
          file: fragileFile,
          isStream: false,
          isAirplay: false,
          isFavorite: true,
          rating: 5,
          ratingDisabled: false,
        },
      };
    },
    fetchInternalRequest: async (pathname, options = {}) => {
      calls.push({ pathname, options });
      if (pathname === '/rating/current') {
        return {
          ok: true,
          status: 200,
          json: { ok: true, file: 'https://radio.example.test/stale', rating: 0, disabled: true },
        };
      }
      if (pathname === '/favorites/toggle') {
        return {
          ok: true,
          status: 200,
          json: { ok: true, file: fragileFile, isFavorite: !!options.body?.favorite },
        };
      }
      if (pathname === '/rating' && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: { ok: true, file: fragileFile, rating: options.body?.rating, disabled: false },
        };
      }
      throw new Error(`unexpected internal route: ${pathname}`);
    },
  });

  for (const [method, route, body] of [
    ['get', 'GET /v1/mobile/now-playing', undefined],
    ['post', 'POST /v1/mobile/now-playing/favorite', { favorite: true }],
    ['post', 'POST /v1/mobile/now-playing/rating', { rating: 5 }],
  ]) {
    const unauthorized = createResponse();
    await app.routes.get(route)?.(request({ headers: { 'x-track-key': 'admin-track-key' }, body }), unauthorized);
    assert.equal(unauthorized.statusCode, 401);
  }

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const sessionToken = sessionRes.body.accessToken;
  const authHeaders = { authorization: `Bearer ${sessionToken}` };

  const current = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({ headers: authHeaders }), current);
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.isFavorite, true);
  assert.equal(current.body.rating, 5);
  assert.equal(current.body.ratingDisabled, false);
  assert.doesNotMatch(JSON.stringify(current.body), /SamsungMoode|Fragile\.flac/);

  const favorite = createResponse();
  await app.routes.get('POST /v1/mobile/now-playing/favorite')?.(request({
    headers: authHeaders,
    body: { favorite: true },
  }), favorite);
  assert.equal(favorite.statusCode, 200);
  assert.deepEqual(favorite.body, { ok: true, isFavorite: true, disabled: false });

  const rating = createResponse();
  await app.routes.get('POST /v1/mobile/now-playing/rating')?.(request({
    headers: authHeaders,
    body: { rating: 5 },
  }), rating);
  assert.equal(rating.statusCode, 200);
  assert.deepEqual(rating.body, { ok: true, rating: 5, ratingDisabled: false, disabled: false });
  assert.doesNotMatch(JSON.stringify(favorite.body), /SamsungMoode|Fragile\.flac/);
  assert.doesNotMatch(JSON.stringify(rating.body), /SamsungMoode|Fragile\.flac/);

  assert.deepEqual(calls.map((call) => call.pathname), [
    '/favorites/toggle',
    '/rating',
  ]);
  assert.deepEqual(calls[0].options.body, { file: fragileFile, favorite: true });
  assert.deepEqual(calls[1].options.body, { file: fragileFile, rating: 5 });
});

test('mobile now-playing controls are disabled no-ops for streams', async () => {
  let internalCalls = 0;
  const app = registerFixture({
    getCurrentFile: async () => 'https://radio.example.test/live.mp3',
    fetchInternalJson: async () => ({
      ok: true,
      json: {
        state: 'play',
        file: 'https://radio.example.test/live.mp3',
        title: 'Live Song',
        artist: 'Example Radio',
        isStream: true,
        isRadio: true,
      },
    }),
    fetchInternalRequest: async () => {
      internalCalls += 1;
      return { ok: true, json: {} };
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const authHeaders = { authorization: `Bearer ${sessionRes.body.accessToken}` };

  const current = createResponse();
  await app.routes.get('GET /v1/mobile/now-playing')?.(request({ headers: authHeaders }), current);
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.isFavorite, false);
  assert.equal(current.body.rating, 0);
  assert.equal(current.body.ratingDisabled, true);

  const favorite = createResponse();
  await app.routes.get('POST /v1/mobile/now-playing/favorite')?.(request({
    headers: authHeaders,
    body: { favorite: true },
  }), favorite);
  assert.deepEqual(favorite.body, { ok: true, isFavorite: false, disabled: true });

  const rating = createResponse();
  await app.routes.get('POST /v1/mobile/now-playing/rating')?.(request({
    headers: authHeaders,
    body: { rating: 5 },
  }), rating);
  assert.deepEqual(rating.body, { ok: true, rating: 0, ratingDisabled: true, disabled: true });
  assert.equal(internalCalls, 0);
});

test('mobile now-playing controls are disabled for an unsupported local item', async () => {
  const unsupportedFile = 'USB/SamsungMoode/Unknown Album/01 - Unknown.mp3';
  const app = registerFixture({
    getCurrentFile: async () => unsupportedFile,
    fetchInternalJson: async () => ({
      ok: true,
      json: { state: 'play', title: 'Unknown', file: unsupportedFile, isStream: false, isAirplay: false },
    }),
    fetchInternalRequest: async () => {
      throw new Error('unsupported item must not reach a mutation route');
    },
  });

  const sessionRes = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), sessionRes);
  const res = createResponse();
  await app.routes.get('POST /v1/mobile/now-playing/favorite')?.(request({
    headers: { authorization: `Bearer ${sessionRes.body.accessToken}` },
    body: { favorite: true },
  }), res);
  assert.deepEqual(res.body, { ok: true, isFavorite: false, disabled: true });
});
