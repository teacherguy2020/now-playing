import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPibuzQobuzAdapter,
} from '../src/lib/pibuz-qobuz.mjs';

const status = ({ active = true, sessionActive = true } = {}) => ({
  version: '2.5.1',
  qconnect: {
    is_active: active,
    session_active: sessionActive,
    state: active ? 'connected' : 'disconnected',
    device_name: 'Sonuvi',
  },
  playback: {
    is_playing: active,
    position: 12,
    duration: 298,
    output_sample_rate: 96000,
    sample_rate: 96000,
    bit_depth: 24,
    bit_perfect_mode: true,
    queue_len: 30,
    repeat: 'off',
    shuffle: false,
  },
});

const track = (id = 37937812, artworkUrl = 'https://static.qobuz.com/images/covers/47/05/album.jpg?cache=1') => ({
  id,
  title: '25 or 6 to 4',
  artist: 'Chicago',
  album: 'Chicago II',
  album_id: '0603497870547',
  artist_id: 118769,
  duration_secs: 298,
  artwork_url: artworkUrl,
  sample_rate: 96,
  bit_depth: 24,
  hires: true,
  source: 'qobuz_connect_remote',
});

const nowPlaying = (item = track()) => ({
  playback: {
    is_playing: true,
    position: 12,
    duration: 298,
    output_sample_rate: 96000,
    sample_rate: 96000,
    bit_depth: 24,
    queue_len: 30,
    repeat: 'off',
    shuffle: false,
  },
  track: item,
});

function response(value, { contentType = 'application/json' } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : '' },
    arrayBuffer: async () => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  };
}

function jsonFetch({ statusBody = status(), nowBody = nowPlaying(), queueBody = null } = {}) {
  return async (url) => {
    if (url.endsWith('/api/status')) return response(statusBody);
    if (url.endsWith('/api/now-playing')) return response(nowBody);
    if (url.endsWith('/api/queue')) return response(queueBody || {
      current_index: 2,
      total_tracks: 30,
      repeat: 'off',
      shuffle: false,
      stop_after_track_id: null,
      current_track: track(),
      history: [track(1), track(1)],
      upcoming: [track(2), track(3)],
    });
    throw new Error(`unexpected URL: ${url}`);
  };
}

test('PiBuZ adapter normalizes active Qobuz ownership and quality without inventing output bit depth', async () => {
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    fetchImpl: jsonFetch(),
  });

  const snapshot = await adapter.getNowPlaying();
  assert.equal(snapshot.authoritative, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.sessionActive, true);
  assert.equal(snapshot.receiverActive, true);
  assert.equal(snapshot.state, 'play');
  assert.equal(snapshot.qobuzTrackId, '37937812');
  assert.equal(snapshot.qobuzAlbumId, '0603497870547');
  assert.equal(snapshot.elapsedSec, 12);
  assert.equal(snapshot.sourceFormat, 'Qobuz 24-bit / 96 kHz');
  assert.equal(snapshot.outputFormat, 'PCM / 96 kHz');
  assert.equal(snapshot.outputFormatDetails.bitDepth, null);
  assert.match(snapshot.artworkUrl, /^https:\/\/static\.qobuz\.com\//);
  assert.equal(snapshot.artworkUrl.includes('?'), false);
});

test('PiBuZ inactive ownership is authoritative and distinguishes an authenticated session', async () => {
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    fetchImpl: jsonFetch({ statusBody: status({ active: false, sessionActive: true }) }),
  });

  const snapshot = await adapter.getNowPlaying();
  assert.equal(snapshot.authoritative, true);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.sessionActive, true);
  assert.equal(snapshot.receiverActive, false);
  assert.equal(snapshot.reason, 'inactive');
});

test('PiBuZ queue preserves ordering and duplicate occurrences', async () => {
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    fetchImpl: jsonFetch(),
  });

  const snapshot = await adapter.getQueue();
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.queue.available, true);
  assert.equal(snapshot.queue.currentIndex, 2);
  assert.equal(snapshot.queue.totalTracks, 30);
  assert.deepEqual(snapshot.queue.history.map((item) => item.qobuzTrackId), ['1', '1']);
  assert.deepEqual(snapshot.queue.upcoming.map((item) => item.qobuzTrackId), ['2', '3']);
  assert.match(snapshot.queue.history[0].artworkRef, /^qobuz-[a-f0-9]{24}$/);
});

test('PiBuZ malformed queue is explicitly unavailable rather than an empty queue', async () => {
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    fetchImpl: jsonFetch({ queueBody: [] }),
  });

  const snapshot = await adapter.getQueue();
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.queue.available, false);
  assert.equal(snapshot.queue.reason, 'malformed');
});

test('PiBuZ transport failures are bounded and do not fall back to stale ownership forever', async () => {
  let currentTime = 1000;
  let fail = false;
  const fetchImpl = async (url) => {
    if (fail) throw new Error('receiver unavailable');
    return jsonFetch()(url);
  };
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    fetchImpl,
    staleMs: 8000,
    now: () => currentTime,
  });

  assert.equal((await adapter.getNowPlaying()).active, true);
  fail = true;
  currentTime = 5000;
  const stale = await adapter.getNowPlaying();
  assert.equal(stale.active, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.suppressMpdHistory, true);

  currentTime = 10001;
  const expired = await adapter.getNowPlaying();
  assert.equal(expired.active, false);
  assert.equal(expired.authoritative, true);
  assert.equal(expired.reason, 'stale-expired');
  assert.equal(expired.suppressMpdHistory, true);
});

test('PiBuZ rejects oversized JSON responses', async () => {
  const adapter = createPibuzQobuzAdapter({
    host: '10.0.0.254',
    maxJsonBytes: 1024,
    fetchImpl: async () => response('x'.repeat(2048)),
  });

  const snapshot = await adapter.getNowPlaying();
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.authoritative, false);
  assert.equal(snapshot.reason, 'unavailable');
});

test('PiBuZ event stream records bounded status without retaining event payloads', async () => {
  const encoder = new TextEncoder();
  let eventCalls = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith('/api/events')) {
      eventCalls += 1;
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            let read = false;
            return {
              async read() {
                if (read) return { done: true, value: undefined };
                read = true;
                return { done: false, value: encoder.encode('event: track\ndata: {"secret":"never-return"}\n\n') };
              },
            };
          },
        },
      };
    }
    return jsonFetch()(url);
  };
  const adapter = createPibuzQobuzAdapter({ host: '10.0.0.254', fetchImpl });
  adapter.startEvents();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const state = adapter.getEventState();
  await adapter.stopEvents();
  assert.ok(eventCalls >= 1);
  assert.ok(state.revision >= 1);
  assert.equal(state.lastEventType, 'track');
  assert.equal(JSON.stringify(state).includes('never-return'), false);
});
