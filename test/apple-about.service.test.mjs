import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppleAboutService,
  extractAppleCatalogId,
  normalizeEditorialNotes,
} from '../src/services/apple-about.service.mjs';

function response(body, ok = true) {
  return { ok, json: async () => body };
}

const trackUrl = 'https://music.apple.com/us/song/example/123?i=123';
const albumUrl = 'https://music.apple.com/us/album/example/456';

test('Apple catalog IDs are extracted from track and album URLs', () => {
  assert.equal(extractAppleCatalogId(trackUrl, 'track'), '123');
  assert.equal(extractAppleCatalogId(albumUrl, 'album'), '456');
  assert.equal(extractAppleCatalogId('https://example.test/no-id', 'track'), '');
});

test('editorial note normalization prefers standard text and preserves optional fields', () => {
  assert.deepEqual(normalizeEditorialNotes({
    standard: '  Standard editorial text. ',
    short: 'Short text',
    tagline: 'Tagline',
  }, { type: 'track', sourceId: '123' }), {
    type: 'track',
    text: 'Standard editorial text.',
    shortText: 'Short text',
    tagline: 'Tagline',
    source: 'apple',
    sourceId: '123',
    match: { confidence: 'strong' },
  });
});

test('track editorial is returned as normalized About metadata', async () => {
  let calls = 0;
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.match(url, /songs\/123/);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return response({ data: [{ id: '123', attributes: {
        editorialNotes: { standard: 'A substantial track note.' },
      } }] });
    },
  });

  assert.deepEqual(await service.getAbout({ trackUrl, albumUrl, identityKey: 'track-a' }), {
    type: 'track',
    text: 'A substantial track note.',
    source: 'apple',
    sourceId: '123',
    match: { confidence: 'strong' },
  });
  assert.equal(calls, 1);
});

test('album editorial is used when track editorial is absent', async () => {
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async (url) => {
      if (/songs\/123/.test(url)) {
        return response({ data: [{ id: '123', attributes: {}, relationships: {
          albums: { data: [{ id: '456', type: 'albums' }] },
        } }] });
      }
      return response({ data: [{ id: '456', attributes: {
        editorialNotes: { short: 'An album note.' },
      } }] });
    },
  });

  assert.deepEqual(await service.getAbout({ trackUrl, identityKey: 'track-b' }), {
    type: 'album',
    text: 'An album note.',
    shortText: 'An album note.',
    source: 'apple',
    sourceId: '456',
    match: { confidence: 'strong' },
  });
});

test('missing editorial metadata returns no About object', async () => {
  let calls = 0;
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async () => {
      calls += 1;
      return response({ data: [{ id: '123', attributes: {} }] });
    },
  });

  assert.equal(await service.getAbout({ trackUrl, identityKey: 'track-c' }), null);
  assert.equal(await service.getAbout({ trackUrl, identityKey: 'track-c' }), null);
  assert.equal(calls, 1, 'negative result should be cached');
});

test('no accepted Apple identity does not perform a fuzzy or web lookup', async () => {
  let calls = 0;
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async () => { calls += 1; return response({}); },
  });
  assert.equal(await service.getAbout({ identityKey: 'ambiguous' }), null);
  assert.equal(calls, 0);
});

test('provider failure and malformed responses are non-critical', async () => {
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async (url) => /songs\/123/.test(url)
      ? response(null, false)
      : response({ malformed: true }),
  });
  assert.equal(await service.getAbout({ trackUrl, identityKey: 'failure' }), null);
});

test('About cache is identity-specific and cannot leak across track transitions', async () => {
  let calls = 0;
  const service = createAppleAboutService({
    developerToken: 'test-token',
    fetchImpl: async (url) => {
      calls += 1;
      const id = /songs\/(\d+)/.exec(url)?.[1];
      return response({ data: [{ id, attributes: id === '123'
        ? { editorialNotes: { tagline: 'First track' } }
        : {} }] });
    },
  });
  assert.equal((await service.getAbout({ trackUrl, identityKey: 'first' }))?.text, 'First track');
  assert.equal(await service.getAbout({ trackUrl: 'https://music.apple.com/us/song/other/789?i=789', identityKey: 'second' }), null);
  assert.equal(calls, 2);
});

test('missing developer token disables the enrichment without network access', async () => {
  let calls = 0;
  const service = createAppleAboutService({
    fetchImpl: async () => { calls += 1; return response({}); },
  });
  assert.equal(await service.getAbout({ trackUrl }), null);
  assert.equal(calls, 0);
});
