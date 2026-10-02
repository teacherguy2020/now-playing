import assert from 'node:assert/strict';
import test from 'node:test';

import { radioStationNameForFile } from '../src/lib/radio-display.mjs';

test('radio station identity comes from the stream alias when song metadata is enriched', async () => {
  assert.equal(
    await radioStationNameForFile('https://knkx-live-a.edge.audiocdn.com/6285_256k'),
    'Jazz24',
  );
});

test('explicit non-generic station metadata remains authoritative', async () => {
  assert.equal(
    await radioStationNameForFile('https://example.test/live.mp3', 'Absolut musicXL'),
    'Absolut musicXL',
  );
});
