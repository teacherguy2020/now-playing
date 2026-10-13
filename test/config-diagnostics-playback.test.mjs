import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichQueueSourceAudio, registerConfigDiagnosticsRoutes } from '../src/routes/config.diagnostics.routes.mjs';

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader() {},
    set() {},
    end() {},
  };
}

test('queue source audio enrichment exposes only verified local source metadata', async () => {
  const localHiRes = 'USB/SamsungMoode/Music/hi-res.flac';
  const localLowRes = 'USB/SamsungMoode/Music/cd-quality.flac';
  const stream = 'https://radio.example.test/live';
  const calls = [];
  const items = [
    { file: localHiRes, isStream: false },
    { file: localLowRes, isStream: false },
    { file: stream, isStream: true },
    { file: 'USB/SamsungMoode/Music/missing.flac', isStream: false },
  ];

  const enriched = await enrichQueueSourceAudio(items, async (file) => {
    calls.push(file);
    if (file === localHiRes) return { sampleRateHz: 48000, bitDepth: 24, channels: 2 };
    if (file === localLowRes) return { sampleRateHz: 96000, bitDepth: 16, channels: 2 };
    return null;
  });

  assert.deepEqual(calls, [localHiRes, localLowRes, 'USB/SamsungMoode/Music/missing.flac']);
  assert.deepEqual(enriched[0].sourceAudio, { sampleRateHz: 48000, bitDepth: 24, channels: 2 });
  assert.deepEqual(enriched[1].sourceAudio, { sampleRateHz: 96000, bitDepth: 16, channels: 2 });
  assert.equal(Object.hasOwn(enriched[2], 'sourceAudio'), false);
  assert.equal(Object.hasOwn(enriched[3], 'sourceAudio'), false);
});

test('diagnostics playback sends moOde toggle_play_pause and rejects hidden command errors', async () => {
  const app = createApp();
  registerConfigDiagnosticsRoutes(app, {
    requireTrackKey: () => true,
    getRatingForFile: async () => null,
    setRatingForFile: async () => {},
    getAlexaWasPlaying: () => null,
    clearAlexaWasPlayingState: async () => {},
    setAlexaModeState: async () => null,
    getYoutubeNowPlayingHint: () => null,
    getYoutubeQueueHint: () => null,
  });

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response('{"state":"play"}', { status: 200 });
  };

  try {
    const response = createResponse();
    await app.routes.get('POST /config/diagnostics/playback')?.({
      headers: {},
      body: { action: 'toggle' },
      query: {},
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.command, 'toggle_play_pause');
    assert.match(calls[0], /cmd=toggle_play_pause$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnostics playback rejects MPD controls while Qobuz owns the renderer', async () => {
  const app = createApp();
  registerConfigDiagnosticsRoutes(app, {
    requireTrackKey: () => true,
    getRatingForFile: async () => null,
    setRatingForFile: async () => {},
    getAlexaWasPlaying: () => null,
    clearAlexaWasPlayingState: async () => {},
    setAlexaModeState: async () => null,
    getYoutubeNowPlayingHint: () => null,
    getYoutubeQueueHint: () => null,
    getQobuzNowPlaying: async () => ({ active: true, source: 'qobuz-connect', state: 'play' }),
  });

  const response = createResponse();
  await app.routes.get('POST /config/diagnostics/playback')?.({
    headers: {},
    body: { action: 'toggle' },
    query: {},
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.unavailable, true);
  assert.equal(response.body.source, 'qobuz-connect');
  assert.match(response.body.error, /Qobuz Connect/);
});
