import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MAX_TTL_SECONDS = 15_777_000;
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_REFRESH_BEFORE_SECONDS = 24 * 60 * 60;

function text(value) {
  return String(value || '').trim();
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function createAppleMusicDeveloperToken({
  keyId = '',
  teamId = '',
  privateKey = '',
  nowMs = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
} = {}) {
  const normalizedKeyId = text(keyId);
  const normalizedTeamId = text(teamId);
  const key = text(privateKey).replace(/\\n/g, '\n');
  if (!normalizedKeyId || !normalizedTeamId || !key) {
    throw new Error('Apple Music credentials are incomplete');
  }

  const issuedAt = Math.floor(Number(nowMs) / 1000);
  const lifetime = Math.max(60, Math.min(MAX_TTL_SECONDS, Number(ttlSeconds) || DEFAULT_TTL_SECONDS));
  const header = encodeJson({ alg: 'ES256', kid: normalizedKeyId });
  const payload = encodeJson({
    iss: normalizedTeamId,
    iat: issuedAt,
    exp: issuedAt + lifetime,
  });
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { token: `${signingInput}.${signature}`, issuedAt, expiresAt: issuedAt + lifetime };
}

export function createAppleMusicTokenProvider({
  keyId = '',
  teamId = '',
  privateKeyPath = '',
  privateKey = '',
  ttlSeconds = DEFAULT_TTL_SECONDS,
  refreshBeforeSeconds = DEFAULT_REFRESH_BEFORE_SECONDS,
  now = () => Date.now(),
  readFile = fs.readFile,
} = {}) {
  let cached = null;
  let pending = null;

  const getToken = async () => {
    const nowSeconds = Math.floor(Number(now()) / 1000);
    const refreshAt = cached ? cached.expiresAt - Math.max(60, Number(refreshBeforeSeconds) || DEFAULT_REFRESH_BEFORE_SECONDS) : 0;
    if (cached && nowSeconds < refreshAt) return cached.token;
    if (pending) return pending;

    pending = (async () => {
      const key = text(privateKey) || (privateKeyPath ? await readFile(privateKeyPath, 'utf8') : '');
      const generated = createAppleMusicDeveloperToken({
        keyId,
        teamId,
        privateKey: key,
        nowMs: now(),
        ttlSeconds,
      });
      cached = generated;
      return generated.token;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };

  return {
    getToken,
    clear: () => { cached = null; },
    getState: () => cached ? { issuedAt: cached.issuedAt, expiresAt: cached.expiresAt } : null,
  };
}
