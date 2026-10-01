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
