import assert from 'node:assert/strict';
import test from 'node:test';

import { registerMobileRoutes } from '../src/routes/mobile.routes.mjs';

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
    builtAt: '2026-09-29T00:00:00.000Z',
    tracks: [
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

function registerFixture(fetchInternalJson) {
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'api-secret-for-test',
    trackIdSecret: 'track-secret-for-test',
    enrollmentCode: 'one-time-code',
    getBrowseIndex: async () => fixtureIndex(),
    fetchInternalJson,
    serveArtworkForTrack: async () => {},
  });
  return app;
}

async function sessionHeaders(app) {
  const response = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'one-time-code' },
    body: { deviceId: 'iphone-brian' },
  }), response);
  assert.equal(response.statusCode, 200);
  return { authorization: `Bearer ${response.body.accessToken}` };
}

test('mobile Next Up returns the normal MPD successor as a safe canonical item', async () => {
  const app = registerFixture(async (pathname) => {
    if (pathname === '/now-playing') {
      return { ok: true, json: { modeActive: false } };
    }
    if (pathname === '/alexa/was-playing') {
      return { ok: true, json: { wasPlaying: { modeActive: false } } };
    }
    if (pathname === '/alexa/now-playing?maxAgeMs=21600000') {
      return { ok: true, json: { fresh: false, nowPlaying: { modeActive: false } } };
    }
    if (pathname === '/next-up') {
      return {
        ok: true,
        json: {
          ok: true,
          source: 'mpd-next',
          next: {
            title: 'Second',
            artist: 'Test Artist',
            album: 'Test Album',
            file: 'USB/SamsungMoode/Test Album/02 - Second.flac',
            artUrl: 'https://now-playing.tailnet.test/art/second.jpg',
            isStream: false,
          },
        },
      };
    }
    throw new Error(`unexpected internal route ${pathname}`);
  });
  const headers = await sessionHeaders(app);
  const response = createResponse();
  await app.routes.get('GET /v1/mobile/next-up')?.(request({ headers }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body.ok, true);
  assert.equal(response.body.alexaMode, false);
  assert.equal(response.body.source, 'mpd-next');
  assert.equal(response.body.next.title, 'Second');
  assert.match(response.body.next.track.id, /^trk_/);
  assert.match(response.body.next.artworkUrl, /\/v1\/mobile\/artwork\/trk_/);
  assert.doesNotMatch(JSON.stringify(response.body), /SamsungMoode|Second\.flac/);
});

test('mobile Next Up follows the Alexa successor contract while Alexa Mode is active', async () => {
  const app = registerFixture(async (pathname) => {
    if (pathname === '/now-playing') {
      return { ok: true, json: { modeActive: true, alexaMode: true } };
    }
    if (pathname === '/alexa/next-up') {
      return {
        ok: true,
        json: {
          ok: true,
          source: 'alexa-enqueue',
          next: {
            title: 'Alexa successor',
            artist: 'Alexa Artist',
            file: 'https://stream.example.test/alexa-successor',
            artUrl: '/art/current.jpg',
            isStream: true,
          },
        },
      };
    }
    throw new Error(`unexpected internal route ${pathname}`);
  });
  const headers = await sessionHeaders(app);
  const response = createResponse();
  await app.routes.get('GET /v1/mobile/next-up')?.(request({ headers }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.alexaMode, true);
  assert.equal(response.body.source, 'alexa-enqueue');
  assert.equal(response.body.next.title, 'Alexa successor');
  assert.equal(response.body.next.isStream, true);
  assert.match(response.body.next.artworkUrl, /\/v1\/mobile\/home\/artwork\//);
  assert.doesNotMatch(JSON.stringify(response.body), /stream\.example\.test/);
});

test('mobile Next Up requires the bearer mobile session', async () => {
  const app = registerFixture(async () => ({ ok: true, json: {} }));
  const response = createResponse();
  await app.routes.get('GET /v1/mobile/next-up')?.(request(), response);
  assert.equal(response.statusCode, 401);
});
