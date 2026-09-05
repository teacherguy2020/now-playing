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
  return { file: values.file, artist: values.artist, title: values.title, id: values.id };
}

test('queue mix physically shuffles the complete mix instead of enabling random mode', async () => {
  const mpdCommands = [];
  const mpcCommands = [];
  const instance = app();

  registerQueueRoutes(instance, {
    requireTrackKey: () => true,
    mpdPlaylistInfoById: async () => ({}),
    mpdDeleteId: async () => {},
    mpdDeletePos0: async () => {},
    mpdQueryRaw: async (command) => {
      mpdCommands.push(command);
      if (command === 'status') return 'state: stop\nsong: -1\nsongid: -1\nplaylistlength: 2\nrandom: 0\nOK\n';
      return 'OK\n';
    },
    parseMpdKeyVals: parseKeyVals,
    parseMpdFirstBlock: parseFirstBlock,
    mpdPrimeIfIdle: async () => {},
    fetchJson: async (url) => (url.includes('get_currentsong') ? { file: 'sting.flac' } : 'song: -1\nsongid: -1\n'),
    MOODE_BASE_URL: 'http://moode.local',
    moodeValByKey: (raw, key) => parseKeyVals(raw)[key],
    decodeHtmlEntities: (value) => value,
    log: { debug() {} },
    execFileP: async (_command, args) => {
      mpcCommands.push(args);
      const artist = args[4] || '';
      if (args.includes('Christmas')) return { stdout: '' };
      return { stdout: Array.from({ length: 120 }, (_, i) => `${artist.toLowerCase()}-${i}.flac`).join('\n') };
    },
    MPD_HOST: 'localhost',
  });

  const res = response();
  await instance.routes['POST /queue/mix']({
    body: { artists: ['Sting', 'John Mayer', 'Steely Dan'], clearFirst: true, random: false, shuffle: true, startPlayback: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.shuffle, true);
  assert.equal(res.body.random, false);
  assert.ok(mpdCommands.includes('clear'));
  assert.ok(mpdCommands.includes('random 0'));
  assert.ok(mpdCommands.includes('shuffle'));
  assert.ok(mpdCommands.includes('play'));
  assert.equal(mpdCommands.some((command) => command.startsWith('move ')), false);
  assert.equal(mpcCommands.length > 0, true);
  assert.equal(res.body.added, 300);
  assert.deepEqual(res.body.byArtist, { Sting: 100, 'John Mayer': 100, 'Steely Dan': 100 });
});
