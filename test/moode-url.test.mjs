import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoodeBaseUrl } from '../src/lib/moode-url.mjs';

test('normalizes HTTPS moOde URLs to HTTP', () => {
  assert.equal(normalizeMoodeBaseUrl('https://moode.local'), 'http://moode.local');
  assert.equal(normalizeMoodeBaseUrl('https://10.0.0.254/'), 'http://10.0.0.254');
});

test('adds HTTP to a bare moOde host and preserves a path', () => {
  assert.equal(normalizeMoodeBaseUrl('moode.local'), 'http://moode.local');
  assert.equal(normalizeMoodeBaseUrl('https://moode.local/api/'), 'http://moode.local/api');
});

test('derives HTTP from the configured fallback host', () => {
  assert.equal(normalizeMoodeBaseUrl('', '10.0.0.254'), 'http://10.0.0.254');
  assert.equal(normalizeMoodeBaseUrl('not a URL', '10.0.0.254'), 'http://10.0.0.254');
});
