import assert from 'node:assert/strict';
import test from 'node:test';

import { captureQobuzQueueSnapshot } from '../src/lib/saved-qobuz-queue.mjs';

function track(id) {
  return {
    qobuzTrackId: String(id),
    title: `Track ${id}`,
    artist: 'Test Artist',
    album: 'Test Album',
    qobuzAlbumId: null,
    qobuzArtistId: '123',
    version: '',
    durationSec: 180,
    artworkRef: null,
    sampleRateHz: 44100,
    bitDepth: 16,
    hires: false,
  };
}

function snapshot({ currentIndex, history, current, upcoming, totalTracks }) {
  return {
    active: true,
    ownershipState: 'confirmed-active',
    receiverActive: true,
    timingStable: true,
    state: 'play',
    qobuzTrackId: String(current.qobuzTrackId),
    elapsedSec: 12,
    durationSec: 180,
    queue: {
      available: true,
      currentIndex,
      totalTracks,
      queueFingerprint: 'qobuz-queue-capturetest',
      repeat: 'off',
      shuffle: false,
      stopAfterTrackId: null,
      history,
      currentTrack: current,
      upcoming,
    },
  };
}

test('capture ignores unrelated retained playback history at the start of a replaced queue', () => {
  const captured = captureQobuzQueueSnapshot({
    snapshot: snapshot({
      currentIndex: 0,
      totalTracks: 3,
      history: [track(90), track(91)],
      current: track(10),
      upcoming: [track(20), track(30)],
    }),
  });

  assert.equal(captured.queue.currentIndex, 0);
  assert.equal(captured.queue.historyCount, 0);
  assert.deepEqual(
    captured.queue.occurrences.map((occurrence) => occurrence.providerTrackId),
    ['10', '20', '30'],
  );
});

test('capture restores matching recent-first history to queue order', () => {
  const captured = captureQobuzQueueSnapshot({
    snapshot: snapshot({
      currentIndex: 2,
      totalTracks: 4,
      // PiBuZ sends the most recently played occurrence first.
      history: [track(20), track(10)],
      current: track(30),
      upcoming: [track(40)],
    }),
  });

  assert.equal(captured.queue.historyCount, 2);
  assert.deepEqual(
    captured.queue.occurrences.map((occurrence) => occurrence.providerTrackId),
    ['10', '20', '30', '40'],
  );
});

test('capture rejects an ambiguous nonzero cursor when playback history is not a prefix', () => {
  assert.throws(
    () => captureQobuzQueueSnapshot({
      snapshot: snapshot({
        currentIndex: 1,
        totalTracks: 3,
        history: [track(90), track(91)],
        current: track(10),
        upcoming: [track(20)],
      }),
    }),
    /available queue history/,
  );
});
