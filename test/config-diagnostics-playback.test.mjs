import assert from 'node:assert/strict';
import test from 'node:test';

import { registerConfigDiagnosticsRoutes } from '../src/routes/config.diagnostics.routes.mjs';

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

test('diagnostics playback configures repeat off, one, and all using MPD repeat and single modes', async () => {
  const app = createApp();
  const calls = [];
  const state = { repeat: false, single: false };
  registerConfigDiagnosticsRoutes(app, {
    requireTrackKey: () => true,
    getRatingForFile: async () => null,
    setRatingForFile: async () => {},
    getAlexaWasPlaying: () => null,
    clearAlexaWasPlayingState: async () => {},
    setAlexaModeState: async () => null,
    getYoutubeNowPlayingHint: () => null,
    getYoutubeQueueHint: () => null,
    runMpdCommand: async (...args) => {
      calls.push(args);
      if (args[0] === 'status') {
        return {
          stdout: `repeat: ${state.repeat ? 'on' : 'off'}\nsingle: ${state.single ? 'on' : 'off'}\nrandom: off\n`,
        };
      }
      state[args[0]] = args[1] === 'on';
      return { stdout: '' };
    },
  });

  const route = app.routes.get('POST /config/diagnostics/playback');
  for (const [mode, expected] of [
    ['one', { repeat: true, single: true }],
    ['all', { repeat: true, single: false }],
    ['off', { repeat: false, single: false }],
  ]) {
    const response = createResponse();
    await route?.({ headers: {}, body: { action: 'repeat-mode', mode }, query: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.repeatOn, expected.repeat);
    assert.equal(response.body.singleOn, expected.single);
    assert.deepEqual(state, expected);
  }

  assert.deepEqual(calls, [
    ['repeat', 'on'], ['single', 'on'], ['status'],
    ['single', 'off'], ['repeat', 'on'], ['status'],
    ['single', 'off'], ['repeat', 'off'], ['status'],
  ]);
});

test('diagnostics playback rejects an unknown repeat mode without changing MPD', async () => {
  const app = createApp();
  let commandCount = 0;
  registerConfigDiagnosticsRoutes(app, {
    requireTrackKey: () => true,
    getRatingForFile: async () => null,
    setRatingForFile: async () => {},
    getAlexaWasPlaying: () => null,
    clearAlexaWasPlayingState: async () => {},
    setAlexaModeState: async () => null,
    getYoutubeNowPlayingHint: () => null,
    getYoutubeQueueHint: async () => null,
    runMpdCommand: async () => { commandCount += 1; return { stdout: '' }; },
  });

  const response = createResponse();
  await app.routes.get('POST /config/diagnostics/playback')?.({
    headers: {},
    body: { action: 'repeat-mode', mode: 'sometimes' },
    query: {},
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(commandCount, 0);
});
