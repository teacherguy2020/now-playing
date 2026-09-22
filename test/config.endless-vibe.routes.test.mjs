import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerConfigEndlessVibeRoutes } from '../src/routes/config.endless-vibe.routes.mjs';

function makeApp() {
  return {
    routes: {},
    get(route, handler) { this.routes[`GET ${route}`] = handler; },
    post(route, handler) { this.routes[`POST ${route}`] = handler; },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Endless Vibe setting defaults off and persists server-side', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'now-playing-endless-vibe-'));
  const settingsPath = path.join(dir, 'endless-vibe.json');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const app = makeApp();
  registerConfigEndlessVibeRoutes(app, {
    settingsPath,
    requireTrackKey: () => true,
  });

  const initial = makeResponse();
  await app.routes['GET /config/endless-vibe']({}, initial);
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.body, { ok: true, enabled: false, configured: false });

  const saved = makeResponse();
  await app.routes['POST /config/endless-vibe']({ body: { enabled: true } }, saved);
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.body, { ok: true, enabled: true, configured: true });

  const reloaded = makeResponse();
  await app.routes['GET /config/endless-vibe']({}, reloaded);
  assert.equal(reloaded.statusCode, 200);
  assert.deepEqual(reloaded.body, { ok: true, enabled: true, configured: true });
  assert.equal(JSON.parse(await fs.readFile(settingsPath, 'utf8')).enabled, true);
});

test('Endless Vibe setting rejects malformed writes and unauthorized writes', async () => {
  const app = makeApp();
  registerConfigEndlessVibeRoutes(app, {
    settingsPath: path.join(os.tmpdir(), `now-playing-endless-vibe-${Date.now()}.json`),
    requireTrackKey: (_req, res) => {
      res.status(403).json({ ok: false, error: 'forbidden' });
      return false;
    },
  });

  const denied = makeResponse();
  await app.routes['POST /config/endless-vibe']({ body: { enabled: true } }, denied);
  assert.equal(denied.statusCode, 403);

  const app2 = makeApp();
  registerConfigEndlessVibeRoutes(app2, {
    settingsPath: path.join(os.tmpdir(), `now-playing-endless-vibe-${Date.now()}-invalid.json`),
    requireTrackKey: () => true,
  });
  const invalid = makeResponse();
  await app2.routes['POST /config/endless-vibe']({ body: { enabled: 'true' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.body, { ok: false, error: 'enabled must be boolean' });
});
