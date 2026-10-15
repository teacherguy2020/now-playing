import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('shared player clears stale animated art when a track has no motion source', async () => {
  const script = await read('scripts/index-ui.js');
  const player = await read('player-render.html');
  const contract = await read('docs/runbooks/26-art-surface-contract.md');

  assert.match(
    script,
    /const src = String\(mp4Url \|\| ''\)\.trim\(\);\s*if \(!src\) \{\s*clearMotionArtVideo\(\);\s*return;\s*\}/,
  );
  assert.match(player, /id="album-art-video"/);
  assert.match(player, /scripts\/index-ui\.js\?v=20261014-upnp-motion1/);
  assert.match(contract, /an empty motion result is an explicit clear operation/);
});

test('UPnP uses the existing provider-neutral matcher with static-art fallback and stale guards', async () => {
  const shared = await read('scripts/now-playing-art.js');
  const index = await read('scripts/index-ui.js');
  const hero = await read('scripts/hero-transport.js');
  const pages = await Promise.all([
    'app.html',
    'index.html',
    'controller-now-playing.html',
    'controller-now-playing-tablet.html',
    'controller-now-playing-grid.html',
    'player-render.html',
  ].map(read));

  assert.match(shared, /function isUpnp\(data = \{\}\)/);
  assert.match(shared, /data\?\.isStream && !upnp/);
  assert.match(shared, /data\?\.animatedArt\?\.appleMusicUrl/);
  assert.match(shared, /resolveLocalMotionMp4\(/);
  assert.match(index, /data\?\.animatedArt\?\.identity/);
  assert.match(index, /motionToken !== motionReqToken/);
  assert.match(index, /!isStream \|\| isUpnp/);
  assert.match(hero, /isMotionRadioOrStream/);
  assert.match(hero, /np\?\.animatedArt\?\.identity/);
  assert.match(hero, /discard stale motion resolve/);
  for (const page of pages) assert.match(page, /now-playing-art\.js\?v=20261014-upnp-motion2/);
});
