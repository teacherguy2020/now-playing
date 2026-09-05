import test from 'node:test';
import assert from 'node:assert/strict';
import { registerQueueRoutes } from '../src/routes/queue.routes.mjs';

function app() {
  return {
    routes: {},
    post(path, handler) { this.routes[`POST ${path}`] = handler; },
  };
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function parseKeyVals(raw) {
  return Object.fromEntries(String(raw || '').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    return match ? [[match[1].toLowerCase(), match[2]]] : [];
  }));
}

function parseFirstBlock(raw) {
  const values = parseKeyVals(raw);
  return { file: values.file, artist: values.artist, title: values.title, album: values.album, id: values.id };
}

test('consumes a completed priority song and clears its priority metadata', async () => {
  const calls = [];
  const instance = app();
  let cleanupArgs;

  registerQueueRoutes(instance, {
    requireTrackKey: () => true,
    mpdPlaylistInfoById: async () => ({ file: 'paid.flac' }),
    mpdDeleteId: async (id) => { calls.push(`deleteid ${id}`); },
    mpdDeletePos0: async (pos) => { calls.push(`delete ${pos}`); },
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'status') return 'state: play\nsong: 0\nsongid: 8\nplaylistlength: 1\nOK\n';
      if (command === 'playlistinfo 0:1') return 'file: house.flac\npos: 0\nId: 8\nOK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    parseMpdKeyVals: parseKeyVals,
    parseMpdFirstBlock: parseFirstBlock,
    mpdPrimeIfIdle: async () => {},
    fetchJson: async () => ({}),
    MOODE_BASE_URL: 'http://moode.local',
    moodeValByKey: () => '',
    decodeHtmlEntities: (value) => value,
    log: { debug() {} },
    execFileP: async () => ({ stdout: '' }),
    MPD_HOST: 'localhost',
    onQueueItemRemoved: async (args) => {
      cleanupArgs = args;
      return { removed: true, priority: 'jukebox' };
    },
  });

  const res = response();
  await instance.routes['POST /queue/advance']({ body: { songid: 7, pos0: 0, file: 'paid.flac' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.consumedPriority, true);
  assert.deepEqual(cleanupArgs, { songid: 7, pos0: 0, file: 'paid.flac' });
  assert.ok(calls.includes('deleteid 7'));
  assert.ok(calls.includes('status'));
});
