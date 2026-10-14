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
  assert.match(player, /scripts\/index-ui\.js\?v=20261014-motion-clear1/);
  assert.match(contract, /an empty motion result is an explicit clear operation/);
});
