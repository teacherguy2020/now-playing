import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import {
  handleMobileJsonError,
  MOBILE_INVALID_JSON_REQUEST_CODE,
} from '../src/lib/mobile-http.mjs';

test('malformed mobile JSON returns a structured error before route dispatch', async (t) => {
  const app = express();
  app.use(express.json());
  app.use(handleMobileJsonError);
  app.post('/v1/mobile/vibe/preview', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/mobile/vibe/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"trackId":',
  });

  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') || '', /^application\/json/i);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'request body must be valid JSON',
    code: MOBILE_INVALID_JSON_REQUEST_CODE,
  });
});
