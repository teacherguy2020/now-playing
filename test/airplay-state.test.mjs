import test from 'node:test';
import assert from 'node:assert/strict';
import { isAirplayCurrentSong, mergeMoodeAirplaySong } from '../src/lib/airplay-state.mjs';

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
