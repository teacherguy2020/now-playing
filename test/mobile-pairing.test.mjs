import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import test from 'node:test';

import { registerMobileRoutes } from '../src/routes/mobile.routes.mjs';
import {
  MobilePairingError,
  MobilePairingStore,
  pairingProofMessage,
} from '../src/lib/mobile-pairing.mjs';
import {
  createMobileSessionToken,
  verifyMobileToken,
} from '../src/lib/mobile-auth.mjs';

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { return this; },
  };
}

function request(overrides = {}) {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    protocol: 'https',
    get(name) { return name.toLowerCase() === 'host' ? 'nowplaying.local:3101' : ''; },
    ...overrides,
  };
}

function registerPairingFixture() {
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'pairing-api-secret',
    trackIdSecret: 'pairing-track-secret',
    enrollmentCode: 'manual-enrollment-code',
    mobileBaseUrl: 'https://nowplaying.local:3101',
    trackKeyConfigured: true,
    requireTrackKey(req, res) {
      if (req.headers['x-track-key'] !== 'admin-track-key') {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return false;
      }
      return true;
    },
    getBrowseIndex: async () => ({ builtAt: 'pairing-test', tracks: [] }),
    safeIsFile: () => false,
  });
  return app;
}

function keyProof({ challenge, deviceId, deviceName, deviceModel, keyPair }) {
  const message = pairingProofMessage({ challenge, deviceId, deviceName, deviceModel });
  return {
    publicKey: keyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
    signature: sign(null, Buffer.from(message, 'utf8'), keyPair.privateKey).toString('base64url'),
    signatureAlgorithm: 'ed25519',
  };
}

async function createChallenge(app, headers = { 'x-track-key': 'admin-track-key' }) {
  const res = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/challenges')?.(request({ headers }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  return res.body;
}

async function submitDevice(app, challenge, overrides = {}) {
  const keyPair = overrides.keyPair || generateKeyPairSync('ed25519');
  const deviceId = overrides.deviceId || `iphone-${Math.random().toString(36).slice(2, 8)}`;
  const deviceName = overrides.deviceName || 'Brian iPhone';
  const deviceModel = overrides.deviceModel || 'iPhone';
  const proof = keyProof({ challenge, deviceId, deviceName, deviceModel, keyPair });
  const res = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests')?.(request({
    body: {
      challenge,
      deviceId,
      deviceName,
      deviceModel,
      ...proof,
    },
  }), res);
  return { res, keyPair, deviceId, deviceName, deviceModel };
}

test('pairing challenge is admin-protected and QR payload contains no long-lived secret', async () => {
  const app = registerPairingFixture();
  const unauthorized = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/challenges')?.(request(), unauthorized);
  assert.equal(unauthorized.statusCode, 403);

  const body = await createChallenge(app);
  assert.match(body.qrDataUrl, /^data:image\/png;base64,/);
  assert.deepEqual(Object.keys(body.qrPayload).sort(), ['baseUrl', 'challenge', 'expiresAt', 'protocol', 'version']);
  assert.equal(body.qrPayload.protocol, 'now-playing-mobile-pairing');
  assert.equal(body.qrPayload.version, 1);
  assert.equal(body.qrPayload.baseUrl, 'https://nowplaying.local:3101');
  assert.doesNotMatch(JSON.stringify(body.qrPayload), /pairing-api-secret|pairing-track-secret|manual-enrollment-code|accessToken/i);
  assert.ok(body.displayToken);
});

test('an authenticated native device can host the same pairing flow without a Track Key header', async () => {
  const app = registerPairingFixture();
  const hostToken = createMobileSessionToken({
    secret: 'pairing-api-secret',
    deviceId: 'ipad-host',
  });
  const hostHeaders = { authorization: `Bearer ${hostToken}` };

  const challengeResponse = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/challenges')?.(request({
    headers: hostHeaders,
  }), challengeResponse);
  assert.equal(challengeResponse.statusCode, 200);
  assert.ok(challengeResponse.body.displayToken);

  const submitted = await submitDevice(app, challengeResponse.body.challenge, {
    deviceId: 'iphone-from-ipad',
  });
  assert.equal(submitted.res.statusCode, 202);

  const pending = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests')?.(request({
    headers: {
      ...hostHeaders,
      'x-mobile-pairing-display-token': challengeResponse.body.displayToken,
    },
  }), pending);
  assert.equal(pending.statusCode, 200);
  assert.equal(pending.body.requests[0].deviceId, 'iphone-from-ipad');

  const approved = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/approve')?.(request({
    headers: {
      ...hostHeaders,
      'x-mobile-pairing-display-token': challengeResponse.body.displayToken,
    },
    params: { requestId: submitted.res.body.requestId },
    body: { verificationCode: submitted.res.body.verificationCode },
  }), approved);
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.status, 'approved');
});

test('device proof, display approval, and app completion keep tokens on their intended side', async () => {
  const app = registerPairingFixture();
  const challenge = await createChallenge(app);
  const submitted = await submitDevice(app, challenge.challenge, { deviceId: 'iphone-brian' });
  assert.equal(submitted.res.statusCode, 202);
  assert.equal(submitted.res.body.status, 'pending');
  assert.ok(submitted.res.body.pollToken);
  assert.ok(submitted.res.body.verificationCode);
  assert.equal('accessToken' in submitted.res.body, false);

  const list = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
  }), list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.requests.length, 1);
  assert.equal(list.body.requests[0].deviceId, 'iphone-brian');
  assert.equal('pollToken' in list.body.requests[0], false);
  assert.equal('publicKey' in list.body.requests[0], false);

  const wrongCode = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/approve')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
    params: { requestId: submitted.res.body.requestId },
    body: { verificationCode: '000000' },
  }), wrongCode);
  assert.equal(wrongCode.statusCode, 403);

  const approved = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/approve')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
    params: { requestId: submitted.res.body.requestId },
    body: { verificationCode: submitted.res.body.verificationCode },
  }), approved);
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.status, 'approved');
  assert.equal('accessToken' in approved.body, false);

  const completed = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests/:requestId/complete')?.(request({
    headers: { 'x-mobile-pairing-poll-token': submitted.res.body.pollToken },
    params: { requestId: submitted.res.body.requestId },
  }), completed);
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.body.status, 'approved');
  assert.ok(completed.body.accessToken);
  const claims = verifyMobileToken(completed.body.accessToken, {
    secret: 'pairing-api-secret',
    scope: 'mobile-api',
  });
  assert.equal(claims.deviceId, 'iphone-brian');
});

test('first approval wins and later requests cannot complete', async () => {
  const app = registerPairingFixture();
  const challenge = await createChallenge(app);
  const first = await submitDevice(app, challenge.challenge, { deviceId: 'iphone-first' });
  const second = await submitDevice(app, challenge.challenge, { deviceId: 'iphone-second' });
  assert.equal(first.res.statusCode, 202);
  assert.equal(second.res.statusCode, 202);

  const approval = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/approve')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
    params: { requestId: first.res.body.requestId },
    body: { verificationCode: first.res.body.verificationCode },
  }), approval);
  assert.equal(approval.statusCode, 200);

  const secondApproval = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/approve')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
    params: { requestId: second.res.body.requestId },
    body: { verificationCode: second.res.body.verificationCode },
  }), secondApproval);
  assert.equal(secondApproval.statusCode, 409);

  const secondComplete = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests/:requestId/complete')?.(request({
    headers: { 'x-mobile-pairing-poll-token': second.res.body.pollToken },
    params: { requestId: second.res.body.requestId },
  }), secondComplete);
  assert.equal(secondComplete.statusCode, 200);
  assert.equal(secondComplete.body.status, 'rejected');
  assert.equal('accessToken' in secondComplete.body, false);
});

test('display approval requires the existing admin credential and display token', async () => {
  const app = registerPairingFixture();
  const challenge = await createChallenge(app);

  const wrongKey = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests')?.(request({
    headers: { 'x-track-key': 'wrong' },
  }), wrongKey);
  assert.equal(wrongKey.statusCode, 403);

  const missingDisplayToken = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests')?.(request({
    headers: { 'x-track-key': 'admin-track-key' },
  }), missingDisplayToken);
  assert.equal(missingDisplayToken.statusCode, 401);

  const malformed = await submitDevice(app, challenge.challenge, {
    deviceId: 'iphone-malformed',
  });
  assert.equal(malformed.res.statusCode, 202);
  const badProof = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests')?.(request({
    body: {
      challenge: challenge.challenge,
      deviceId: 'iphone-bad',
      deviceName: 'Brian iPhone',
      deviceModel: 'iPhone',
      publicKey: 'not-a-key',
      signature: 'not-a-signature',
      signatureAlgorithm: 'ed25519',
    },
  }), badProof);
  assert.equal(badProof.statusCode, 400);
});

test('reject and cancel invalidate app completion, while manual enrollment remains available', async () => {
  const app = registerPairingFixture();
  const challenge = await createChallenge(app);
  const submitted = await submitDevice(app, challenge.challenge, { deviceId: 'iphone-reject' });
  const rejected = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/requests/:requestId/reject')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': challenge.displayToken,
    },
    params: { requestId: submitted.res.body.requestId },
    body: { verificationCode: submitted.res.body.verificationCode },
  }), rejected);
  assert.equal(rejected.statusCode, 200);

  const rejectedComplete = createResponse();
  await app.routes.get('GET /v1/mobile/pairing/requests/:requestId/complete')?.(request({
    headers: { 'x-mobile-pairing-poll-token': submitted.res.body.pollToken },
    params: { requestId: submitted.res.body.requestId },
  }), rejectedComplete);
  assert.equal(rejectedComplete.body.status, 'rejected');
  assert.equal('accessToken' in rejectedComplete.body, false);

  const cancelledChallenge = await createChallenge(app);
  const cancelled = createResponse();
  await app.routes.get('POST /v1/mobile/pairing/challenges/cancel')?.(request({
    headers: {
      'x-track-key': 'admin-track-key',
      'x-mobile-pairing-display-token': cancelledChallenge.displayToken,
    },
  }), cancelled);
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.body.status, 'cancelled');

  const manual = createResponse();
  await app.routes.get('POST /v1/mobile/session')?.(request({
    headers: { 'x-mobile-enrollment-code': 'manual-enrollment-code' },
    body: { deviceId: 'legacy-iphone' },
  }), manual);
  assert.equal(manual.statusCode, 200);
  assert.ok(manual.body.accessToken);
});

test('pairing store expires challenges and rejects replay/use-after-approval', () => {
  let now = 1_000_000;
  const store = new MobilePairingStore({ ttlMs: 100, retentionMs: 500, now: () => now });
  const challenge = store.createChallenge({ baseUrl: 'https://nowplaying.local:3101' });
  assert.throws(
    () => store.submitRequest({ challenge: 'not-the-challenge', deviceId: 'a', deviceName: 'A', deviceModel: 'iPhone' }),
    (error) => error instanceof MobilePairingError && error.status === 410,
  );
  now += 101;
  assert.deepEqual(store.listPending({ displayToken: challenge.displayToken }).status, 'expired');
  assert.throws(
    () => store.submitRequest({ challenge: challenge.challenge, deviceId: 'a', deviceName: 'A', deviceModel: 'iPhone' }),
    (error) => error instanceof MobilePairingError && error.status === 409,
  );
  store.dispose();
});
