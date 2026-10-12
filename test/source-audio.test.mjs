import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSourceAudioProbe, normalizeSourceAudioProbe } from '../src/lib/source-audio.mjs';

test('normalizes verified source-file audio properties and omits unavailable values', () => {
  assert.deepEqual(normalizeSourceAudioProbe({
    streams: [{ sample_rate: '96000', bits_per_raw_sample: '24', channels: 2 }],
  }), { sampleRateHz: 96000, bitDepth: 24, channels: 2 });
  assert.deepEqual(normalizeSourceAudioProbe({
    streams: [{ sample_rate: '44100', bits_per_sample: '16', channels: 2 }],
  }), { sampleRateHz: 44100, bitDepth: 16, channels: 2 });
  assert.equal(normalizeSourceAudioProbe({ streams: [] }), null);
});

test('probes a source file once and reuses the stat-keyed cache', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sonuvi-source-audio-'));
  try {
    const media = path.join(root, 'America Undefined.flac');
    const ffprobe = path.join(root, 'ffprobe-test');
    await writeFile(media, 'test source');
    await writeFile(ffprobe, '#!/bin/sh\nprintf \'{"streams":[{"sample_rate":"96000","bits_per_raw_sample":"24","channels":2}]}\'\n');
    await chmod(ffprobe, 0o755);
    const probe = createSourceAudioProbe({
      resolveFile: async () => media,
      cachePath: path.join(root, 'cache.json'),
      ffprobePath: ffprobe,
    });
    const expected = { sampleRateHz: 96000, bitDepth: 24, channels: 2 };
    assert.deepEqual(await probe.get('America Undefined.flac'), expected);
    assert.deepEqual(await probe.get('America Undefined.flac'), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
