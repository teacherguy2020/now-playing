import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('Home queue badge requires verified 24-bit audio at 48 kHz or higher', async () => {
  const script = await readFile(new URL('../scripts/source-audio.js', import.meta.url), 'utf8');
  const context = {};
  vm.runInNewContext(script, context);
  const qualifies = context.SonuviSourceAudio.qualifiesForHiResBadge;

  assert.equal(qualifies({ sampleRateHz: 48000, bitDepth: 24 }), true);
  assert.equal(qualifies({ sampleRateHz: 96000, bitDepth: 32 }), true);
  assert.equal(qualifies({ sampleRateHz: 44100, bitDepth: 24 }), false);
  assert.equal(qualifies({ sampleRateHz: 96000, bitDepth: 16 }), false);
  assert.equal(qualifies({ format: 'FLAC' }), false);
  assert.equal(qualifies({ sampleRateHz: 96000, bitDepth: 24, format: 'FLAC' }), true);
});
