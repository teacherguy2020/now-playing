import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createMobileSessionToken } from '../src/lib/mobile-auth.mjs';
import { createMobileVideoCatalog } from '../src/lib/mobile-video-catalog.mjs';
import { registerMobileRoutes } from '../src/routes/mobile.routes.mjs';

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(route, handler) { routes.set(`GET ${route}`, handler); },
    post(route, handler) { routes.set(`POST ${route}`, handler); },
    delete(route, handler) { routes.set(`DELETE ${route}`, handler); },
  };
}

class ResponseStream extends PassThrough {
  constructor() {
    super();
    this.statusCode = 200;
    this.body = null;
    this.headers = {};
  }

  status(code) { this.statusCode = code; return this; }
  set(name, value) { this.headers[name] = value; return this; }
  setHeader(name, value) { this.headers[name] = value; }
  json(value) { this.body = value; return this; }
  send(value) { this.body = value; this.end(value); return this; }
}

function request(token, overrides = {}) {
  return {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
    query: {},
    params: {},
    protocol: 'https',
    get(name) { return name.toLowerCase() === 'host' ? 'sonuvi.test' : ''; },
    ...overrides,
  };
}

function token() {
  return createMobileSessionToken({
    secret: 'video-api-secret',
    deviceId: 'iphone-video-test',
  });
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sonuvi-videos-'));
  await mkdir(path.join(root, 'Clips'), { recursive: true });
  await writeFile(path.join(root, 'Clips', 'one.mp4'), Buffer.from('0123456789'));
  await writeFile(path.join(root, 'Clips', '._one.mp4'), Buffer.from('sidecar'));
  await writeFile(path.join(root, 'Clips', 'unsupported.mkv'), Buffer.from('mkv'));
  await writeFile(path.join(root, 'root.mov'), Buffer.from('abcdefghij'));
  const outside = path.join(root, '..', `outside-${path.basename(root)}.mp4`);
  await writeFile(outside, Buffer.from('outside'));
  await symlink(outside, path.join(root, 'Clips', 'escape.mp4'));
  const catalog = createMobileVideoCatalog({
    root,
    registryPath: path.join(root, 'catalog.json'),
    readMetadata: async (filePath) => ({
      durationSec: filePath.endsWith('one.mp4') ? 12.5 : null,
      metadata: filePath.endsWith('one.mp4') ? { title: 'One Clip' } : {},
    }),
    runThumbnail: async () => Buffer.from('jpeg-bytes'),
  });
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'video-api-secret',
    trackIdSecret: 'video-track-secret',
    videoCatalog: catalog,
  });
  return { root, outside, catalog, app, token: token() };
}

test('video catalog requires a paired mobile session and paginates opaque IDs', async () => {
  const fixture = await setup();
  try {
    const route = fixture.app.routes.get('GET /v1/mobile/catalog/videos');
    const unauthorized = new ResponseStream();
    await route({}, unauthorized);
    assert.equal(unauthorized.statusCode, 401);

    const first = new ResponseStream();
    await route(request(fixture.token, { query: { limit: '1' } }), first);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.schema, 'sonuvi.mobile-video-catalog.v1');
    assert.equal(first.body.count, 1);
    assert.ok(first.body.nextCursor);
    assert.match(first.body.items[0].videoID, /^vid_/);
    const all = new ResponseStream();
    await route(request(fixture.token, { query: { limit: '10' } }), all);
    const oneClip = all.body.items.find((item) => item.title === 'One Clip');
    assert.ok(oneClip);
    assert.equal(oneClip.durationSec, 12.5);
    assert.equal('absolutePath' in first.body.items[0], false);
    assert.equal('relativePath' in first.body.items[0], false);

    const second = new ResponseStream();
    await route(request(fixture.token, { query: { cursor: first.body.nextCursor, limit: '10' } }), second);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.count, 2);
    assert.equal(second.body.items.some((item) => item.format === 'mkv' && !item.playback.available), true);
    assert.equal(second.body.items.some((item) => item.filename === 'escape.mp4'), false);
  } finally {
    await rm(fixture.outside, { force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('video media preserves MIME type and supports byte ranges', async () => {
  const fixture = await setup();
  try {
    const listing = new ResponseStream();
    await fixture.app.routes.get('GET /v1/mobile/catalog/videos')?.(request(fixture.token), listing);
    const video = listing.body.items.find((item) => item.format === 'mp4');
    const response = new ResponseStream();
    const finished = new Promise((resolve) => response.on('finish', resolve));
    await fixture.app.routes.get('GET /v1/mobile/catalog/videos/:videoID/media')?.(request(fixture.token, {
      params: { videoID: video.videoID },
      headers: { authorization: `Bearer ${fixture.token}`, range: 'bytes=2-5' },
    }), response);
    await finished;
    assert.equal(response.statusCode, 206);
    assert.equal(response.headers['Content-Type'], 'video/mp4');
    assert.equal(response.headers['Accept-Ranges'], 'bytes');
    assert.equal(response.headers['Content-Range'], 'bytes 2-5/10');
    assert.equal(response.body, null);
    assert.equal(response.read().toString(), '2345');
  } finally {
    await rm(fixture.outside, { force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('video thumbnail endpoint enforces the size bound', async () => {
  const fixture = await setup();
  try {
    const listing = new ResponseStream();
    await fixture.app.routes.get('GET /v1/mobile/catalog/videos')?.(request(fixture.token), listing);
    const videoID = listing.body.items[0].videoID;
    const original = fixture.catalog.thumbnail;
    fixture.catalog.thumbnail = async () => ({ status: 'too_large' });
    const response = new ResponseStream();
    await fixture.app.routes.get('GET /v1/mobile/catalog/videos/:videoID/thumbnail')?.(request(fixture.token, {
      params: { videoID },
    }), response);
    assert.equal(response.statusCode, 413);
    fixture.catalog.thumbnail = original;
  } finally {
    await rm(fixture.outside, { force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('missing video storage is explicit and does not become an internal error', async () => {
  const root = path.join(os.tmpdir(), `sonuvi-video-missing-${Date.now()}`);
  const catalog = createMobileVideoCatalog({ root, registryPath: path.join(root, 'catalog.json') });
  const app = createApp();
  registerMobileRoutes(app, {
    enabled: true,
    apiSecret: 'video-api-secret',
    trackIdSecret: 'video-track-secret',
    videoCatalog: catalog,
  });
  const response = new ResponseStream();
  await app.routes.get('GET /v1/mobile/catalog/videos')?.(request(token()), response);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { ok: false, error: 'video storage is unavailable' });
});
