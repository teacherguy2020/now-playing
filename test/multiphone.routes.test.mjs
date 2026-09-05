import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMultiphoneRoutes } from '../src/routes/multiphone.routes.mjs';

function app() { return { routes: {}, post(p, h) { this.routes[`POST ${p}`] = h; }, get(p, h) { this.routes[`GET ${p}`] = h; } }; }
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } }; }

test('Multiphone selection resolves against the dedicated playlist', async () => {
  const calls = [];
  const instance = app();
  registerMultiphoneRoutes(instance, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ playlistlength: '25' }),
    mpdQueryRaw: async (command) => { calls.push(command); return 'file: first.flac\nfile: requested.flac\n'; },
    multiphonePlaylistName: 'Multiphone Playlist',
  });
  const res = response();
  await instance.routes['POST /integrations/multiphone/selection']({ body: { number: 2, dryRun: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.file, 'requested.flac');
  assert.equal(res.body.playlist, 'Multiphone Playlist');
  assert.deepEqual(calls, ['listplaylist "Multiphone Playlist"']);
});

test('clears a paused ordinary queue and immediately starts the Multiphone selection', async () => {
  const calls = [];
  const instance = app();
  let statusCalls = 0;
  registerMultiphoneRoutes(instance, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => ({
      state: raw.includes('state: pause') ? 'pause' : 'play',
      song: raw.includes('song: 0') ? '0' : '-1',
      songid: raw.includes('songid: 41') ? '41' : '0',
      playlistlength: raw.includes('playlistlength: 1') ? '1' : '3',
    }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'listplaylist "Multiphone Playlist"') return 'file: selected.flac\nOK\n';
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1
          ? 'state: pause\nsong: 0\nsongid: 41\nplaylistlength: 3\nOK\n'
          : 'state: play\nsong: 0\nsongid: 42\nplaylistlength: 1\nOK\n';
      }
      if (command === 'playlistinfo') return 'file: ordinary.flac\npos: 0\nId: 41\n\nfile: next.flac\npos: 1\nId: 43\nOK\n';
      if (command === 'clear') return 'OK\n';
      if (command === 'addid "selected.flac"') return 'Id: 42\nOK\n';
      if (command === 'moveid 42 0') return 'OK\n';
      if (command === 'playlistid 42') return 'file: selected.flac\nArtist: Test Artist\nTitle: Test Title\nId: 42\nOK\n';
      if (command === 'play 0') return 'OK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    multiphonePlaylistName: 'Multiphone Playlist',
  });

  const res = response();
  await instance.routes['POST /integrations/multiphone/selection']({ body: { number: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.queueWasCleared, true);
  assert.equal(res.body.playbackStarted, true);
  assert.equal(res.body.queuedBehindJukebox, false);
  assert.deepEqual(calls, [
    'listplaylist "Multiphone Playlist"',
    'status',
    'playlistinfo',
    'clear',
    'addid "selected.flac"',
    'moveid 42 0',
    'playlistid 42',
    'play 0',
    'status',
  ]);
});

test('can reserve a selection without starting it for a synchronized voice handoff', async () => {
  const calls = [];
  const instance = app();
  let statusCalls = 0;
  registerMultiphoneRoutes(instance, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ state: 'pause', song: '0', songid: '41', playlistlength: '2' }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'listplaylist "Multiphone Playlist"') return 'file: selected.flac\nOK\n';
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1
          ? 'state: pause\nsong: 0\nsongid: 41\nplaylistlength: 2\nOK\n'
          : 'state: pause\nsong: 0\nsongid: 42\nplaylistlength: 1\nOK\n';
      }
      if (command === 'playlistinfo') return 'file: ordinary.flac\npos: 0\nId: 41\n\nfile: next.flac\npos: 1\nId: 43\nOK\n';
      if (command === 'clear') return 'OK\n';
      if (command === 'addid "selected.flac"') return 'Id: 42\nOK\n';
      if (command === 'moveid 42 0') return 'OK\n';
      if (command === 'playlistid 42') return 'file: selected.flac\nArtist: Test Artist\nTitle: Test Title\nId: 42\nOK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    multiphonePlaylistName: 'Multiphone Playlist',
  });

  const res = response();
  await instance.routes['POST /integrations/multiphone/selection']({ body: { number: 1, deferPlayback: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.playbackStarted, false);
  assert.equal(res.body.playbackDeferred, true);
  assert.equal(res.body.mpdSongId, 42);
  assert.equal(calls.includes('play 0'), false);
});

test('pre-empts actively playing ordinary house music', async () => {
  const calls = [];
  const instance = app();
  let statusCalls = 0;
  registerMultiphoneRoutes(instance, {
    requireTrackKey: () => true,
    mpdEscapeValue: (v) => JSON.stringify(String(v)),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: (raw) => ({
      state: 'play',
      song: '0',
      songid: raw.includes('songid: 42') ? '42' : '41',
      playlistlength: raw.includes('playlistlength: 4') ? '4' : '3',
    }),
    mpdQueryRaw: async (command) => {
      calls.push(command);
      if (command === 'listplaylist "Multiphone Playlist"') return 'file: selected.flac\nOK\n';
      if (command === 'status') {
        statusCalls += 1;
        return statusCalls === 1
          ? 'state: play\nsong: 0\nsongid: 41\nplaylistlength: 3\nOK\n'
          : 'state: play\nsong: 1\nsongid: 42\nplaylistlength: 4\nOK\n';
      }
      if (command === 'playlistinfo') return 'file: house-music.flac\npos: 0\nId: 41\n\nfile: next.flac\npos: 1\nId: 43\nOK\n';
      if (command === 'addid "selected.flac"') return 'Id: 42\nOK\n';
      if (command === 'moveid 42 1') return 'OK\n';
      if (command === 'playlistid 42') return 'file: selected.flac\nArtist: Test Artist\nTitle: Test Title\nId: 42\nOK\n';
      if (command === 'play 1') return 'OK\n';
      throw new Error(`unexpected command: ${command}`);
    },
    multiphonePlaylistName: 'Multiphone Playlist',
  });

  const res = response();
  await instance.routes['POST /integrations/multiphone/selection']({ body: { number: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.playbackStarted, true);
  assert.equal(res.body.queueWasCleared, false);
  assert.equal(res.body.queuedBehindJukebox, false);
  assert.equal(res.body.interruptedNormalPlayback, true);
  assert.ok(calls.includes('play 1'));
});
