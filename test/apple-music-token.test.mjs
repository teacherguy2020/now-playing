import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  createAppleMusicDeveloperToken,
  createAppleMusicTokenProvider,
} from '../src/lib/apple-music-token.mjs';

function testPrivateKey() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
}

function decodePart(token, index) {
  return JSON.parse(Buffer.from(token.split('.')[index], 'base64url').toString('utf8'));
}

test('Apple Music developer JWT uses ES256 and six-month-bounded claims', () => {
  const generated = createAppleMusicDeveloperToken({
    keyId: '5FJRLDZ9F7',
    teamId: 'RYAZZCPRQP',
    privateKey: testPrivateKey(),
    nowMs: 1_700_000_000_000,
    ttlSeconds: 99_999_999,
  });
  const header = decodePart(generated.token, 0);
  const payload = decodePart(generated.token, 1);
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, '5FJRLDZ9F7');
  assert.equal(payload.iss, 'RYAZZCPRQP');
  assert.equal(payload.iat, 1_700_000_000);
  assert.equal(payload.exp - payload.iat, 15_777_000);
  assert.equal(generated.expiresAt, payload.exp);
});

test('Apple Music token provider caches and refreshes in memory', async () => {
  const privateKey = testPrivateKey();
  let nowMs = 1_700_000_000_000;
  let reads = 0;
  const provider = createAppleMusicTokenProvider({
    keyId: '5FJRLDZ9F7',
    teamId: 'RYAZZCPRQP',
    privateKeyPath: '/protected/key.p8',
    ttlSeconds: 3600,
    refreshBeforeSeconds: 300,
    now: () => nowMs,
    readFile: async () => { reads += 1; return privateKey; },
  });

  const first = await provider.getToken();
  const second = await provider.getToken();
  assert.equal(first, second);
  assert.equal(reads, 1);

  nowMs += 3_400 * 1000;
  const refreshed = await provider.getToken();
  assert.notEqual(refreshed, first);
  assert.equal(reads, 2);
});
