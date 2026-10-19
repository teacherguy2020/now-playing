import test from 'node:test';
import assert from 'node:assert/strict';

import { createPibuzQobuzControlAdapter } from '../src/lib/pibuz-qobuz-control.mjs';

function track(id) {
  return {
    qobuzTrackId: String(id),
    title: `Track ${id}`,
    artist: 'Test Artist',
    album: 'Test Album',
    version: '',
    durationSec: 120,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function makeReceiver() {
  const state = {
    active: true,
    index: 0,
    playState: 'play',
    position: 10,
    queueIds: ['11', '12', '12', '13'],
    calls: [],
  };

  function snapshot(includeQueue) {
    const current = track(state.queueIds[state.index]);
    const queue = {
      available: true,
      currentIndex: state.index,
      totalTracks: state.queueIds.length,
      repeat: 'off',
      shuffle: false,
      stopAfterTrackId: null,
      currentTrack: current,
      history: state.queueIds.slice(0, state.index).reverse().map(track),
      upcoming: state.queueIds.slice(state.index + 1).map(track),
    };
    return {
      available: true,
      active: state.active,
      ownershipState: state.active ? 'confirmed-active' : 'confirmed-inactive',
      receiverActive: state.active,
      sessionActive: state.active,
      connectionState: state.active ? 'connected' : 'disconnected',
      state: state.playState,
      qobuzTrackId: current.qobuzTrackId,
      durationSec: 120,
      elapsedSec: state.position,
      ...(includeQueue ? { queue } : {}),
    };
  }

  const adapter = {
    endpoint: 'http://pibuz.test:8182/api',
    getSnapshot: async ({ includeQueue = false } = {}) => snapshot(includeQueue),
    getNowPlaying: async () => snapshot(false),
    getQueue: async () => snapshot(true),
  };

  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    state.calls.push({ route, body });
    if (route.endsWith('/pause')) state.playState = 'pause';
    if (route.endsWith('/play')) state.playState = 'play';
    if (route.endsWith('/next')) {
      state.index = Math.min(state.queueIds.length - 1, state.index + 1);
      state.position = 0;
    }
    if (route.endsWith('/previous')) {
      state.index = Math.max(0, state.index - 1);
      state.position = 0;
    }
    if (route.endsWith('/seek')) state.position = body.position;
    if (route.endsWith('/queue/jump')) {
      state.index = body.index;
      state.position = 0;
      state.playState = 'play';
    }
    return response({ ok: true });
  };

  return { state, adapter, fetchImpl };
}

function controlAdapter(receiver, options = {}) {
  return createPibuzQobuzControlAdapter({
    adapter: receiver.adapter,
    fetchImpl: receiver.fetchImpl,
    verifyMs: 50,
    pollMs: 25,
    ...options,
  });
}

test('augments snapshots with control capabilities and a duplicate-preserving queue fingerprint', async () => {
  const receiver = makeReceiver();
  const adapter = controlAdapter(receiver);
  const snapshot = await adapter.getQueue();

  assert.match(snapshot.queue.queueFingerprint, /^qobuz-queue-[a-f0-9]{32}$/);
  assert.equal(snapshot.capabilities.control, true);
  assert.equal(snapshot.capabilities.play, true);
  assert.equal(snapshot.capabilities.shuffle, false);
  assert.deepEqual(snapshot.queue.upcoming.map((item) => item.qobuzTrackId), ['12', '12', '13']);
});

test('play, pause, seek, next, previous, and duplicate occurrence jump are confirmed', async () => {
  const receiver = makeReceiver();
  const adapter = controlAdapter(receiver);

  const paused = await adapter.control('pause', {
    expectedQobuzTrackId: '11',
    expectedCurrentIndex: 0,
  });
  assert.equal(paused.confirmed, true);
  assert.equal(paused.snapshot.state, 'pause');

  const resumed = await adapter.control('play', { expectedQobuzTrackId: '11' });
  assert.equal(resumed.confirmed, true);
  assert.equal(resumed.snapshot.state, 'play');

  const sought = await adapter.control('seek', {
    positionSec: 42,
    expectedQobuzTrackId: '11',
  });
  assert.equal(sought.confirmed, true);
  assert.equal(sought.snapshot.elapsedSec, 42);

  const next = await adapter.control('next', {
    expectedQobuzTrackId: '11',
    expectedCurrentIndex: 0,
  });
  assert.equal(next.confirmed, true);
  assert.equal(next.snapshot.queue.currentIndex, 1);

  const duplicateNext = await adapter.control('next', {
    expectedQobuzTrackId: '12',
    expectedCurrentIndex: 1,
  });
  assert.equal(duplicateNext.confirmed, true);
  assert.equal(duplicateNext.snapshot.qobuzTrackId, '12');
  assert.equal(duplicateNext.snapshot.queue.currentIndex, 2);

  const previous = await adapter.control('previous', {
    expectedQobuzTrackId: '12',
    expectedCurrentIndex: 2,
  });
  assert.equal(previous.confirmed, true);
  assert.equal(previous.snapshot.queue.currentIndex, 1);

  const queue = await adapter.getQueue();
  const jump = await adapter.control('queue-jump', {
    index: 2,
    targetQobuzTrackId: '12',
    queueFingerprint: queue.queue.queueFingerprint,
    expectedCurrentIndex: queue.queue.currentIndex,
    expectedTotalTracks: queue.queue.totalTracks,
    expectedShuffle: queue.queue.shuffle,
  });
  assert.equal(jump.confirmed, true);
  assert.equal(jump.snapshot.queue.currentIndex, 2);
  assert.equal(jump.snapshot.qobuzTrackId, '12');
  assert.deepEqual(
    receiver.state.calls.filter((call) => call.route.endsWith('/queue/jump')).map((call) => call.body),
    [{ index: 2 }],
  );
});

test('stale queue evidence and stale ownership fail closed without POST', async () => {
  const receiver = makeReceiver();
  const adapter = controlAdapter(receiver);
  const queue = await adapter.getQueue();
  receiver.state.index = 1;
  const callsBefore = receiver.state.calls.length;

  const stale = await adapter.control('queue-jump', {
    index: 2,
    targetQobuzTrackId: '12',
    queueFingerprint: queue.queue.queueFingerprint,
    expectedCurrentIndex: queue.queue.currentIndex,
    expectedTotalTracks: queue.queue.totalTracks,
    expectedShuffle: false,
  });
  assert.equal(stale.errorCode, 'QOBUZ_QUEUE_CHANGED');
  assert.equal(receiver.state.calls.length, callsBefore);

  receiver.state.active = false;
  const inactive = await adapter.control('pause');
  assert.equal(inactive.errorCode, 'QOBUZ_NOT_ACTIVE');
  assert.equal(receiver.state.calls.length, callsBefore);
});
