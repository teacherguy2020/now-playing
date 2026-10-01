import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApnsJwt, createApnsProvider } from '../src/lib/apns.mjs';
import { resolveApnsMediaUrl } from '../src/lib/apns-artwork.mjs';
import {
  createMobilePushTokenStore,
  normalizeMobilePushEnvironment,
  normalizeMobilePushToken,
} from '../src/lib/mobile-push-store.mjs';

test('APNs JWT uses ES256 and the Apple provider claims', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = createApnsJwt({
    keyId: 'ABC123DEFG',
    teamId: 'TEAM123456',
    privateKey: privateKeyPEM,
    nowMs: 1_760_000_000_000,
  });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')), {
    alg: 'ES256',
    kid: 'ABC123DEFG',
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), {
    iss: 'TEAM123456',
    iat: 1_760_000_000,
  });
  assert.equal(
    crypto.verify(
      'sha256',
      Buffer.from(`${header}.${payload}`, 'utf8'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url')
    ),
    true
  );
});

test('APNs provider sends the correct development endpoint and payload headers', async () => {
  const calls = [];
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const provider = createApnsProvider({
    keyId: 'ABC123DEFG',
    teamId: 'TEAM123456',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    topic: 'com.brianwis.sonuvi',
    environment: 'auto',
    request: async (request) => {
      calls.push(request);
      return { status: 200, body: '', headers: { 'apns-id': 'request-id' } };
    },
  });
  const result = await provider.send({
    deviceToken: 'ab'.repeat(32),
    environment: 'development',
    payload: { aps: { alert: { title: 'Test' } } },
  });
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    reason: '',
    apnsId: 'request-id',
    invalidToken: false,
  });
  assert.equal(calls[0].authority, 'https://api.sandbox.push.apple.com');
  assert.equal(calls[0].headers['apns-topic'], 'com.brianwis.sonuvi');
  assert.equal(calls[0].headers['apns-push-type'], 'alert');
  assert.match(calls[0].headers.authorization, /^bearer ey/);
  assert.deepEqual(JSON.parse(calls[0].body), { aps: { alert: { title: 'Test' } } });
});

test('mobile push token store replaces a device token atomically and removes it', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sonuvi-push-'));
  const filePath = path.join(directory, 'tokens.json');
  const store = createMobilePushTokenStore({ filePath });
  const first = 'ab'.repeat(32);
  const second = 'cd'.repeat(32);

  await store.upsert({
    token: first,
    deviceId: 'ipad-brian',
    environment: 'development',
    topic: 'com.brianwis.sonuvi',
  });
  await store.upsert({
    token: second,
    deviceId: 'ipad-brian',
    environment: 'development',
    topic: 'com.brianwis.sonuvi',
  });
  assert.deepEqual((await store.list()).map(({ token, deviceId, environment, topic }) => ({ token, deviceId, environment, topic })), [{
    token: second,
    deviceId: 'ipad-brian',
    environment: 'development',
    topic: 'com.brianwis.sonuvi',
  }]);
  assert.equal((await store.remove({ deviceId: 'ipad-brian' })).removed, 1);
  assert.deepEqual(await store.list(), []);
  assert.equal(normalizeMobilePushToken(first), first);
  assert.equal(normalizeMobilePushToken('nope'), '');
  assert.equal(normalizeMobilePushEnvironment('DEVELOPMENT'), 'development');
  assert.equal(normalizeMobilePushEnvironment('sandbox'), '');
});

test('APNs artwork moves server URLs to the HTTPS mobile base but preserves external URLs', () => {
  assert.equal(
    resolveApnsMediaUrl('http://sonuvi.local:3101/art/current.jpg?x=1', {
      publicBaseUrl: 'http://sonuvi.local:3101',
      mobileBaseUrl: 'https://mobile.example.test',
    }),
    'https://mobile.example.test/art/current.jpg?x=1'
  );
  assert.equal(
    resolveApnsMediaUrl('https://images.example.test/album.jpg', {
      publicBaseUrl: 'http://sonuvi.local:3101',
      mobileBaseUrl: 'https://mobile.example.test',
    }),
    'https://images.example.test/album.jpg'
  );
});
