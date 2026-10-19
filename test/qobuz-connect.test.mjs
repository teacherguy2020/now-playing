import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQobuzNowPlayingPayload,
  createQobuzConnectSource,
  hasVerifiedMpdPlaybackEvidence,
  normalizeQobuzMeta,
  parseQobuzFormat,
} from '../src/lib/qobuz-connect.mjs';

const playingMeta = {
  title: "Don't Know Why",
  artist: 'Norah Jones',
  album: 'Come Away With Me',
  duration: '186',
  cover_url: 'https://resources.example.test/cover.jpg?private-token=should-not-leak',
  sformat: 'FLAC 24/192 kHz',
  oformat: 'PCM 32/192 kHz, 2ch',
  playstate: 'Resume',
};

test('Qobuz format parsing preserves source and output resolution', () => {
  assert.deepEqual(parseQobuzFormat('FLAC 24/192 kHz'), {
    format: 'FLAC 24/192 kHz',
    codec: 'FLAC',
    bitDepth: 24,
    sampleRateHz: 192000,
    channels: null,
  });
  assert.deepEqual(parseQobuzFormat('PCM 32/192 kHz, 2ch'), {
    format: 'PCM 32/192 kHz, 2ch',
    codec: 'PCM',
    bitDepth: 32,
    sampleRateHz: 192000,
    channels: 2,
  });
});

test('MPD play plus a current file is the only ownership-recovery evidence', () => {
  assert.equal(hasVerifiedMpdPlaybackEvidence({ state: 'play', file: 'Music/track.flac' }), true);
  assert.equal(hasVerifiedMpdPlaybackEvidence({ state: 'pause', file: 'Music/track.flac' }), false);
  assert.equal(hasVerifiedMpdPlaybackEvidence({ state: 'stop', file: 'Music/track.flac' }), false);
  assert.equal(hasVerifiedMpdPlaybackEvidence({ state: 'play', file: '' }), false);
});

test('Qobuz metadata is normalized without exposing cover query tokens', () => {
  const normalized = normalizeQobuzMeta(playingMeta);
  assert.equal(normalized.title, "Don't Know Why");
  assert.equal(normalized.artist, 'Norah Jones');
  assert.equal(normalized.album, 'Come Away With Me');
  assert.equal(normalized.state, 'play');
  assert.equal(normalized.durationSec, 186);
  assert.equal(normalized.artworkUrl, 'https://resources.example.test/cover.jpg');
  assert.equal(normalized.sourceFormatDetails.sampleRateHz, 192000);
  assert.equal(normalized.outputFormatDetails.channels, 2);
  assert.equal(normalizeQobuzMeta({ title: '', artist: '', album: '' }), null);
});

test('Qobuz source owns play/pause/track transitions and releases on stop', async () => {
  let body = JSON.stringify(playingMeta);
  const source = createQobuzConnectSource({
    metaUrl: 'http://moode.local/command/renderer.php?cmd=get_qbzmeta',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }),
  });

  let current = await source.get();
  assert.equal(current.active, true);
  assert.equal(current.source, 'qobuz-connect');
  assert.equal(current.state, 'play');

  body = JSON.stringify({ ...playingMeta, playstate: 'Pause' });
  current = await source.get();
  assert.equal(current.active, true);
  assert.equal(current.state, 'pause');

  body = JSON.stringify({ ...playingMeta, title: 'Turn Me On', playstate: 'Resume' });
  current = await source.get();
  assert.equal(current.title, 'Turn Me On');
  assert.equal(current.state, 'play');

  body = '';
  current = await source.get();
  assert.equal(current.active, false);
  assert.equal(current.reason, 'stopped');
  assert.equal(current.suppressMpdHistory, false);
});

test('Qobuz stop records release ownership and a later renderer reconnect starts cleanly', async () => {
  let body = JSON.stringify(playingMeta);
  const source = createQobuzConnectSource({
    metaUrl: 'http://moode.local/command/renderer.php?cmd=get_qbzmeta',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }),
  });

  assert.equal((await source.get()).active, true);
  body = JSON.stringify({ ...playingMeta, playstate: 'Stopped' });
  const stopped = await source.get();
  assert.equal(stopped.active, false);
  assert.equal(stopped.reason, 'stopped');
  assert.equal(stopped.suppressMpdHistory, false);

  body = JSON.stringify({ ...playingMeta, title: 'New Renderer Track', playstate: 'Play' });
  const recovered = await source.get();
  assert.equal(recovered.active, true);
  assert.equal(recovered.title, 'New Renderer Track');
  assert.equal(recovered.stale, false);
});

test('Qobuz metadata without an explicit renderer state does not retain ownership', async () => {
  const source = createQobuzConnectSource({
    metaUrl: 'http://moode.local/command/renderer.php?cmd=get_qbzmeta',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...playingMeta, oformat: 'Not playing', playstate: '' }),
    }),
  });

  const current = await source.get();
  assert.equal(current.active, false);
  assert.equal(current.suppressMpdHistory, false);
  assert.equal(current.reason, 'not-rendering');
});

test('Qobuz metadata preserves elapsed position only when the bridge supplies it', () => {
  const withPosition = normalizeQobuzMeta({
    ...playingMeta,
    elapsed: '12.5',
    playstate: 'Play',
  });
  assert.equal(withPosition.elapsedSec, 12.5);
  const payload = buildQobuzNowPlayingPayload({ qobuz: withPosition, publicBaseUrl: 'http://sonuvi.local:3101' });
  assert.equal(payload.progressAvailable, true);
  assert.equal(payload.percent, 7);

  const withoutPosition = normalizeQobuzMeta({ ...playingMeta, playstate: 'Play' });
  assert.equal(Object.hasOwn(withoutPosition, 'elapsedSec'), false);
});

test('Qobuz transport failures are bounded and suppress stale MPD history', async () => {
  let now = 1000;
  let fail = false;
  const source = createQobuzConnectSource({
    metaUrl: 'http://moode.local/command/renderer.php?cmd=get_qbzmeta',
    staleMs: 15000,
    now: () => now,
    fetchImpl: async () => {
      if (fail) throw new Error('renderer unavailable');
      return { ok: true, status: 200, text: async () => JSON.stringify(playingMeta) };
    },
  });

  assert.equal((await source.get()).active, true);
  fail = true;
  now = 10000;
  const stale = await source.get();
  assert.equal(stale.active, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.suppressMpdHistory, true);

  now = 16001;
  const expired = await source.get();
  assert.equal(expired.active, false);
  assert.equal(expired.reason, 'stale-expired');
  assert.equal(expired.suppressMpdHistory, true);
});

test('Qobuz Now Playing payload identifies source and does not invent progress', () => {
  const qobuz = normalizeQobuzMeta(playingMeta);
  const payload = buildQobuzNowPlayingPayload({
    qobuz,
    mpdSong: { volume: '80', mute: '0' },
    mpdStatus: { song: '2', songid: '17', playlistlength: '8', state: 'stop' },
    publicBaseUrl: 'http://sonuvi.local:3101',
  });

  assert.equal(payload.source, 'qobuz-connect');
  assert.equal(payload.isQobuz, true);
  assert.equal(payload.streamKind, 'qobuz-connect');
  assert.equal(payload.artist, 'Norah Jones');
  assert.equal(payload.encoded, 'FLAC 24/192 kHz');
  assert.equal(payload.outrate, 'PCM 32/192 kHz, 2ch');
  assert.match(payload.albumArtUrl, /^http:\/\/sonuvi\.local:3101\/art\/current\.jpg\?qobuz=[a-f0-9]{16}$/);
  assert.equal(payload.elapsed, null);
  assert.equal(payload.percent, null);
  assert.equal(payload.progressAvailable, false);
  assert.equal(JSON.stringify(payload).includes('private-token'), false);
  assert.equal(JSON.stringify(payload).includes('stream_url'), false);
});

test('Qobuz artwork fingerprint changes when the cover changes without exposing the provider URL', () => {
  const first = buildQobuzNowPlayingPayload({
    qobuz: normalizeQobuzMeta(playingMeta),
    publicBaseUrl: 'http://sonuvi.local:3101',
  });
  const second = buildQobuzNowPlayingPayload({
    qobuz: normalizeQobuzMeta({
      ...playingMeta,
      cover_url: 'https://static.qobuz.com/images/covers/other-cover_600.jpg?private-token=***',
    }),
    publicBaseUrl: 'http://sonuvi.local:3101',
  });

  assert.notEqual(first.albumArtUrl, second.albumArtUrl);
  assert.doesNotMatch(first.albumArtUrl, /static\.qobuz\.com|private-token/);
  assert.doesNotMatch(second.albumArtUrl, /static\.qobuz\.com|private-token/);
});

test('Qobuz Now Playing payload preserves native PiBuZ ownership and queue facts', () => {
  const payload = buildQobuzNowPlayingPayload({
    qobuz: {
      active: true,
      state: 'play',
      title: 'Native Track',
      artist: 'Native Artist',
      album: 'Native Album',
      sourceFormat: 'Qobuz 24-bit / 96 kHz',
      outputFormat: 'PCM / 96 kHz',
      qobuzTrackId: '123',
      qobuzAlbumId: '456',
      qobuzArtistId: '789',
      owner: 'pibuz',
      output: 'moode',
      sessionActive: true,
      receiverActive: true,
      currentIndex: 2,
      queueLength: 30,
      elapsedSec: 12,
      durationSec: 298,
      shuffle: false,
      repeat: 'off',
      outputSampleRateHz: 96000,
      outputFormatDetails: { bitDepth: null },
    },
    mpdStatus: { song: '0', playlistlength: '1' },
  });

  assert.equal(payload.playbackOwner, 'pibuz');
  assert.equal(payload.qobuzTrackId, '123');
  assert.equal(payload.qobuzSessionActive, true);
  assert.equal(payload.qobuzReceiverActive, true);
  assert.equal(payload.queueTrack, 3);
  assert.equal(payload.queueTotal, 30);
  assert.equal(payload.outputSampleRateHz, 96000);
});
