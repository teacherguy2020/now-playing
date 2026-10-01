import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLastfmScrobbler,
  lastfmScrobbleThreshold,
  qualifiesLastfmScrobble,
} from '../src/lib/lastfm-scrobbler.mjs';

test('Last.fm qualification uses the documented half-or-four-minute rule', () => {
  assert.equal(lastfmScrobbleThreshold(300), 150);
  assert.equal(lastfmScrobbleThreshold(1000), 240);
  assert.equal(lastfmScrobbleThreshold(0), 240);
  assert.equal(lastfmScrobbleThreshold(20), Infinity);
  assert.equal(qualifiesLastfmScrobble({
    artist: 'Artist',
    title: 'Track',
    elapsedSec: 150,
    durationSec: 300,
  }), true);
  assert.equal(qualifiesLastfmScrobble({
    artist: 'Artist',
    title: 'Track',
    elapsedSec: 149,
    durationSec: 300,
  }), false);
});

test('non-MPD scrobbler submits one signed request without exposing credentials to clients', async () => {
  let request;
  const scrobbler = createLastfmScrobbler({
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    sessionKey: 'session-key',
    endpoint: 'https://example.test/2.0/',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ scrobbles: { '@attr': { accepted: 1 } } }) };
    },
  });

  assert.equal(scrobbler.configured, true);
  const result = await scrobbler.submit({
    artist: 'Artist',
    title: 'Track',
    album: 'Album',
    durationSec: 300,
    elapsedSec: 180,
    startedAtMs: Date.parse('2026-09-30T12:00:00Z'),
  });

  assert.deepEqual(result, { state: 'submitted', attempted: true });
  assert.equal(request.url, 'https://example.test/2.0/');
  assert.equal(request.options.method, 'POST');
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get('method'), 'track.scrobble');
  assert.equal(body.get('artist'), 'Artist');
  assert.equal(body.get('track'), 'Track');
  assert.equal(body.get('album'), 'Album');
  assert.equal(body.get('sk'), 'session-key');
  assert.ok(body.get('api_sig'));
});

test('Last.fm failure is returned as state and does not throw', async () => {
  const scrobbler = createLastfmScrobbler({
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    sessionKey: 'session-key',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const result = await scrobbler.submit({
    artist: 'Artist',
    title: 'Track',
    durationSec: 300,
    elapsedSec: 180,
  });
  assert.equal(result.state, 'failed');
  assert.equal(result.attempted, true);
  assert.equal(result.error, 'offline');
});

test('MPD is excluded by the caller contract and missing credentials never submit', async () => {
  const scrobbler = createLastfmScrobbler({ fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(scrobbler.configured, false);
  assert.deepEqual(await scrobbler.submit({
    artist: 'Artist',
    title: 'Track',
    durationSec: 300,
    elapsedSec: 180,
  }), { state: 'not-configured', attempted: false });
});
