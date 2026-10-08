import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAirplayCurrentSong,
  isFreshAirplayMetadata,
  mergeMoodeAirplaySong,
} from '../src/lib/airplay-state.mjs';

test('recognizes moOde AirPlay current-song marker', () => {
  assert.equal(isAirplayCurrentSong({ file: 'AirPlay Active' }), true);
  assert.equal(isAirplayCurrentSong({ encoded: 'AirPlay' }), true);
  assert.equal(isAirplayCurrentSong({ file: 'USB/Music/song.flac', encoded: '' }), false);
});

test('merges the AirPlay marker without leaking stale MPD metadata', () => {
  assert.deepEqual(
    mergeMoodeAirplaySong(
      { file: 'USB/old.flac', artist: 'Old Artist', title: 'Old Title', album: 'Old Album' },
      { file: 'AirPlay Active', outrate: 'PCM 32/48 kHz, 2ch' },
    ),
    {
      file: 'AirPlay Active',
      artist: '',
      title: '',
      album: '',
      outrate: 'PCM 32/48 kHz, 2ch',
      encoded: 'AirPlay',
    },
  );
});

test('rejects AirPlay metadata older than the current session', () => {
  const sessionStartedAt = Date.parse('2026-10-08T18:00:05Z');
  assert.equal(isFreshAirplayMetadata('Thu, 08 Oct 2026 17:59:55 GMT', sessionStartedAt, sessionStartedAt), false);
  assert.equal(isFreshAirplayMetadata('Thu, 08 Oct 2026 18:00:05 GMT', sessionStartedAt, sessionStartedAt), true);
});
