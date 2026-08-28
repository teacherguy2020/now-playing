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

test('queues one selected track and leaves playback stopped', async () => {
  const calls = [];
  const app = makeApp();
  let statusCalls = 0;
  registerSeeburgRoutes(app, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => ({ playlistlength: raw.includes('playlistlength: 1') ? '1' : '0' }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1 ? 'state: stop\nplaylistlength: 0\nOK\n' : 'state: stop\nplaylistlength: 1\nOK\n';
      }
      if (command.startsWith('listplaylist')) return 'file: selected.flac\nOK\n';
      if (command.startsWith('add ')) return 'OK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    seeburgPlaylistName: 'Seeburg Playlist',
  });

  const res = makeResponse();
  await app.routes['POST /integrations/seeburg/selection']({ body: { number: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.queued, true);
  assert.equal(res.body.playbackStarted, false);
  assert.deepEqual(calls, [
    'listplaylist "Seeburg Playlist"',
    'status',
    'add "selected.flac"',
    'status',
  ]);
});
