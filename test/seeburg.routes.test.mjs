import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistFiles, parseSelectionNumber, registerSeeburgRoutes } from '../src/routes/seeburg.routes.mjs';

test('parses MPD playlist files in order', () => {
  assert.deepEqual(parsePlaylistFiles('OK MPD 0.23.5\nfile: one.flac\nTitle: ignored\nfile: two.flac\nOK\n'), ['one.flac', 'two.flac']);
});

test('accepts only integer selections from 1 through 100', () => {
  assert.equal(parseSelectionNumber(1), 1);
  assert.equal(parseSelectionNumber('36'), 36);
  assert.equal(parseSelectionNumber('1.5'), null);
  assert.equal(parseSelectionNumber(0), null);
  assert.equal(parseSelectionNumber(101), null);
});

function makeApp() {
  return {
    routes: {},
    post(path, handler) { this.routes[`POST ${path}`] = handler; },
    get(path, handler) { this.routes[`GET ${path}`] = handler; },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('dry-run resolves the selected track without adding or starting playback', async () => {
  const calls = [];
  const app = makeApp();
  registerSeeburgRoutes(app, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ playlistlength: '36' }),
    mpdQueryRaw: async (command) => { calls.push(command); return 'file: one.flac\nfile: selected.flac\n'; },
    seeburgPlaylistName: 'Seeburg Playlist',
  });

  const res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 2, dryRun: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.file, 'selected.flac');
  assert.equal(res.body.dryRun, true);
  assert.deepEqual(calls, ['listplaylist "Seeburg Playlist"']);
});

test('inserts the first selection ahead of the ordinary queue and starts it', async () => {
  const calls = [];
  const app = makeApp();
  let statusCalls = 0;
  registerSeeburgRoutes(app, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => ({
      state: raw.includes('state: play') ? 'play' : 'stop',
      playlistlength: raw.includes('playlistlength: 1')
        ? '1'
        : raw.includes('playlistlength: 4') ? '4' : raw.includes('playlistlength: 5') ? '5' : '0',
    }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1 ? 'state: stop\nplaylistlength: 4\nOK\n' : 'state: play\nplaylistlength: 5\nOK\n';
      }
      if (command.startsWith('listplaylist')) return 'file: selected.flac\nOK\n';
      if (command === 'playlistinfo') return 'file: normal.flac\npos: 0\nId: 10\n\nfile: other.flac\npos: 1\nId: 11\nOK\n';
      if (command.startsWith('addid ')) return 'Id: 12\nOK\n';
      if (command === 'moveid 12 0') return 'OK\n';
      if (command === 'play 0') return 'OK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    seeburgPlaylistName: 'Seeburg Playlist',
  });

  const res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.queued, true);
  assert.equal(res.body.playbackStarted, true);
  assert.equal(res.body.queueWasCleared, false);
  assert.equal(res.body.source, 'seeburg');
  assert.equal(res.body.priority, 'jukebox');
  assert.deepEqual(calls, [
    'listplaylist "Seeburg Playlist"',
    'status',
    'playlistinfo',
    'addid "selected.flac"',
    'moveid 12 0',
    'play 0',
    'status',
  ]);
});

test('inserts a first selection after the active ordinary track and starts it', async () => {
  const calls = [];
  const app = makeApp();
  let statusCalls = 0;
  registerSeeburgRoutes(app, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => ({
      state: 'play',
      song: raw.includes('song: 1') ? '1' : '0',
      songid: raw.includes('songid: 21') ? '21' : '20',
      playlistlength: raw.includes('playlistlength: 3') ? '3' : '2',
    }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1 ? 'state: play\nsong: 0\nsongid: 20\nplaylistlength: 2\nOK\n' : 'state: play\nsong: 1\nsongid: 22\nplaylistlength: 3\nOK\n';
      }
      if (command.startsWith('listplaylist')) return 'file: selected.flac\nOK\n';
      if (command === 'playlistinfo') return 'file: current.flac\npos: 0\nId: 20\n\nfile: normal.flac\npos: 1\nId: 21\nOK\n';
      if (command.startsWith('addid ')) return 'Id: 22\nOK\n';
      if (command === 'moveid 22 1') return 'OK\n';
      if (command === 'play 1') return 'OK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    seeburgPlaylistName: 'Seeburg Playlist',
  });

  const res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.playbackStarted, true);
  assert.equal(res.body.queueWasCleared, false);
  assert.deepEqual(calls, [
    'listplaylist "Seeburg Playlist"',
    'status',
    'playlistinfo',
    'addid "selected.flac"',
    'moveid 22 1',
    'play 1',
    'status',
  ]);
});

test('stacks subsequent Seeburg selections immediately behind the active jukebox track', async () => {
  const app = makeApp();
  const queue = [
    { file: 'normal-current.flac', id: 30 },
    { file: 'normal.flac', id: 31 },
  ];
  let nextId = 32;
  let currentId = 30;
  const calls = [];
  registerSeeburgRoutes(app, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => {
      const current = queue.findIndex((x) => x.id === currentId);
      return { state: 'play', song: String(current), songid: String(currentId), playlistlength: String(queue.length) };
    },
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command.startsWith('listplaylist')) return 'file: d6.flac\nfile: a4.flac\nfile: k7.flac\nOK\n';
      if (command === 'status') return `state: play\nsong: ${queue.findIndex((x) => x.id === currentId)}\nsongid: ${currentId}\nplaylistlength: ${queue.length}\nOK\n`;
      if (command === 'playlistinfo') return queue.map((x, i) => `file: ${x.file}\npos: ${i}\nId: ${x.id}`).join('\n\n') + '\nOK\n';
      if (command.startsWith('addid ')) {
        const file = JSON.parse(command.slice(6));
        const id = nextId++;
        queue.push({ file, id });
        return `Id: ${id}\nOK\n`;
      }
      const move = command.match(/^moveid (\d+) (\d+)$/);
      if (move) {
        const from = queue.findIndex((x) => x.id === Number(move[1]));
        const [item] = queue.splice(from, 1);
        queue.splice(Number(move[2]), 0, item);
        return 'OK\n';
      }
      const play = command.match(/^play (\d+)$/);
      if (play) { currentId = queue[Number(play[1])].id; return 'OK\n'; }
      throw new Error(`unexpected command: ${command}`);
    },
    seeburgPlaylistName: 'Seeburg Playlist',
  });

  let res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 1 } }, res);
  assert.equal(res.body.playbackStarted, true);
  assert.deepEqual(queue.map((x) => x.file), ['normal-current.flac', 'd6.flac', 'normal.flac']);

  res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 2 } }, res);
  assert.equal(res.body.playbackStarted, false);
  assert.equal(res.body.queuedBehindJukebox, true);
  assert.equal(res.body.source, 'seeburg');
  assert.equal(res.body.priority, 'jukebox');
  assert.deepEqual(queue.map((x) => x.file), ['normal-current.flac', 'd6.flac', 'a4.flac', 'normal.flac']);

  res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 3 } }, res);
  assert.equal(res.body.playbackStarted, false);
  assert.deepEqual(queue.map((x) => x.file), ['normal-current.flac', 'd6.flac', 'a4.flac', 'k7.flac', 'normal.flac']);
  assert.equal(calls.filter((x) => x.startsWith('moveid')).at(-1), 'moveid 34 3');
});
