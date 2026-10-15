import assert from 'node:assert/strict';
import test from 'node:test';

import { isQobuzCurrentArtReference } from '../src/lib/qobuz-connect.mjs';

test('Qobuz current-art references require the opaque fingerprint marker', () => {
  assert.equal(isQobuzCurrentArtReference('/art/current.jpg?qobuz=0123456789abcdef'), true);
  assert.equal(isQobuzCurrentArtReference('https://sonuvi.local/art/current.jpg?qobuz=ABCDEF0123456789'), true);
  assert.equal(isQobuzCurrentArtReference('/art/current_320.jpg?qobuz=0123456789abcdef'), true);
  assert.equal(isQobuzCurrentArtReference('/art/current.jpg'), false);
  assert.equal(isQobuzCurrentArtReference('/art/current.jpg?qobuz=first-track'), false);
  assert.equal(isQobuzCurrentArtReference('https://static.qobuz.com/cover.jpg?qobuz=0123456789abcdef'), false);
});
