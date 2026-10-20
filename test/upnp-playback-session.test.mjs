import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UpnpError,
  buildDidlLiteMetadata,
} from '../src/lib/upnp-control-point.mjs';
import { UpnpPlaybackSessionManager } from '../src/lib/upnp-playback-session.mjs';

const RESOURCE = {
  uri: 'http://10.0.0.254:8200/music/track.flac?token=fixture',
  protocolInfo: 'http-get:*:audio/flac:*',
  mimeType: 'audio/flac',
  duration: '00:03:21.500',
  durationSeconds: 201.5,
  sampleFrequency: 192000,
  bitsPerSample: 24,
  audioChannels: 2,
};

const RESOURCE2 = {
  uri: 'http://10.0.0.254:8200/music/track-2.flac?token=***',
  protocolInfo: 'http-get:*:audio/flac:*',
  mimeType: 'audio/flac',
  duration: '00:04:02.000',
  durationSeconds: 242,
  sampleFrequency: 192000,
  bitsPerSample: 24,
  audioChannels: 2,
};

const ITEM = {
  kind: 'item',
  selectionRef: 'fixture-selection-reference-123456',
  mediaServerId: 'server-1',
  id: 'track-1',
  parentId: 'album-1',
  restricted: '1',
  title: 'Track One',
  creator: 'Artist One',
  artist: 'Artist One',
  album: 'Album One',
  trackNumber: 1,
  class: 'object.item.audioItem.musicTrack',
  artworkUrl: 'http://10.0.0.254:8200/art/album.jpg',
  duration: RESOURCE.duration,
  durationSeconds: RESOURCE.durationSeconds,
  resources: [RESOURCE],
};

const ITEM2 = {
  ...ITEM,
  selectionRef: 'fixture-selection-reference-2',
  id: 'track-2',
  title: 'Track Two',
  trackNumber: 2,
  duration: RESOURCE2.duration,
  durationSeconds: RESOURCE2.durationSeconds,
  resources: [RESOURCE2],
};

function makeInspection({
  state = 'STOPPED',
  uri = '',
  nextUri = '',
  actions = ['Play', 'Pause', 'Stop'],
  serviceActions = ['GetTransportInfo'],
} = {}) {
  return {
    device: {
      id: 'renderer-1',
      udn: 'uuid:moode-renderer',
      friendlyName: 'Moode UPNP',
    },
    services: [{
      serviceType: 'urn:schemas-upnp-org:service:AVTransport:1',
      actions: [
        'SetAVTransportURI', 'SetNextAVTransportURI', 'Play', 'Pause', 'Stop',
        ...serviceActions,
      ],
    }],
    protocolInfo: { available: true, source: [], sink: ['http-get:*:audio/flac:*'] },
    readOnlyState: {
      transport: { state, status: 'OK', speed: '1' },
      position: { relativeTime: '00:00:04', trackDuration: RESOURCE.duration },
      media: { currentUri: uri, nextUri },
      currentActions: actions,
    },
  };
}

function makeHarness({
  mpdState = 'stop',
  qobuz = {},
  queue = [],
  renderer = {},
  stopMpdFailure = false,
  startupResponses = {},
  startupUriReadyTimeoutMs,
  startupPollIntervalMs,
  startupSettleMs = 0,
  wait,
} = {}) {
  let inspection = makeInspection(renderer);
  let currentMpdState = mpdState;
  const actions = [];
  const logs = [];
  const probeResponses = structuredClone(startupResponses);
  const stopMpdCalls = [];
  const controlPoint = {
    getTrustedMediaItem(ref) {
      const item = [ITEM, ITEM2].find((candidate) => candidate.selectionRef === ref);
      assert.ok(item, `unknown fixture item ${ref}`);
      return structuredClone(item);
    },
    async rendererPlaybackCapabilities() {
      return {
        device: inspection.device,
        inspection: structuredClone(inspection),
        avTransportActions: ['SetAVTransportURI', 'SetNextAVTransportURI', 'Play', 'Pause', 'Stop'],
      };
    },
    async prepareMediaItemForPlayback(item) {
      const resource = item.id === ITEM2.id ? RESOURCE2 : RESOURCE;
      return {
        item: structuredClone(item),
        resource: structuredClone(resource),
        metadata: buildDidlLiteMetadata(item, resource),
        mediaServer: { id: 'server-1', location: 'http://10.0.0.254:8200/root.xml' },
        renderer: {
          device: structuredClone(inspection.device),
          inspection: structuredClone(inspection),
          avTransportActions: inspection.services[0].actions,
        },
      };
    },
    async inspectRenderer() {
      return structuredClone(inspection);
    },
    async transportAction(_rendererId, action, args) {
      actions.push({ action, args: structuredClone(args) });
      if (['GetMediaInfo', 'GetTransportInfo', 'GetPositionInfo'].includes(action)) {
        const queued = probeResponses[action];
        if (Array.isArray(queued) && queued.length) {
          const result = queued.shift();
          if (result instanceof Error) throw result;
          return structuredClone(result);
        }
        if (action === 'GetMediaInfo') {
          return { CurrentURI: inspection.readOnlyState.media.currentUri };
        }
        if (action === 'GetTransportInfo') {
          return { CurrentTransportState: inspection.readOnlyState.transport.state };
        }
        return {
          TrackDuration: inspection.readOnlyState.position.trackDuration,
          RelTime: inspection.readOnlyState.position.relativeTime,
        };
      }
      if (action === 'SetAVTransportURI') {
        inspection.readOnlyState.media.currentUri = RESOURCE.uri.split('?')[0];
        inspection.readOnlyState.transport.state = 'STOPPED';
      } else if (action === 'SetNextAVTransportURI') {
        inspection.readOnlyState.media.nextUri = args.NextURI;
      } else if (action === 'Play') {
        inspection.readOnlyState.transport.state = 'PLAYING';
      } else if (action === 'Pause') {
        inspection.readOnlyState.transport.state = 'PAUSED_PLAYBACK';
      } else if (action === 'Stop') {
        inspection.readOnlyState.transport.state = 'STOPPED';
      }
      return {};
    },
  };
  const snapshot = { status: { state: currentMpdState, playlist: '7', playlistlength: queue.length }, song: {}, queue };
  const manager = new UpnpPlaybackSessionManager({
    controlPoint,
    readMpdSnapshot: async () => structuredClone({
      ...snapshot,
      status: { ...snapshot.status, state: currentMpdState },
    }),
    getQobuzState: async () => structuredClone(qobuz),
    stopMpd: async () => {
      stopMpdCalls.push('stop');
      if (stopMpdFailure) throw new Error('fixture MPD stop failure');
      currentMpdState = 'stop';
      return { ok: true };
    },
    expectedRendererHost: '10.0.0.254',
    startupUriReadyTimeoutMs,
    startupPollIntervalMs,
    startupSettleMs,
    wait,
    sessionTtlMs: 60_000,
    now: () => 1_700_000_000_000,
    log: {
      info(message, details) { logs.push({ message, details }); },
      warn() {},
    },
  });
  return {
    manager,
    actions,
    logs,
    stopMpdCalls,
    snapshot,
    controlPoint,
    setInspection: (next) => { inspection = next; },
    setMpdState: (next) => { currentMpdState = next; },
  };
}

test('DIDL metadata is generated from the trusted normalized item', () => {
  const xml = buildDidlLiteMetadata(ITEM, RESOURCE);
  assert.match(xml, /<dc:title>Track One<\/dc:title>/);
  assert.match(xml, /protocolInfo="http-get:\*:audio\/flac:\*"/);
  assert.match(xml, /track\.flac\?token=fixture/);
  assert.doesNotMatch(xml, /<soap|CurrentURI/);
});

test('single-track session selects without mutation and gates every transport command', async () => {
  const harness = makeHarness({
    queue: [{ pos: '0', id: '10', file: 'music/existing.flac' }],
  });
  const selected = await harness.manager.select({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
  });
  assert.equal(selected.state, 'selected');
  assert.equal(selected.ownsAudio, false);
  assert.equal(selected.mutationCount, 0);
  assert.equal(harness.actions.length, 0);
  assert.equal(selected.queueBaseline.length, 1);
  assert.ok(selected.queueBaseline.hash);

  const loaded = await harness.manager.load(selected.sessionId);
  assert.equal(loaded.state, 'loaded');
  assert.equal(harness.actions[0].action, 'SetAVTransportURI');
  assert.equal(harness.actions[0].args.CurrentURI, RESOURCE.uri);
  assert.match(harness.actions[0].args.CurrentURIMetaData, /Track One/);

  const playing = await harness.manager.play(selected.sessionId);
  assert.equal(playing.state, 'playing');
  assert.equal(harness.actions[1].action, 'Play');
  assert.equal(harness.manager.shouldSuppressMpdHistory(), true);
  const nowPlaying = await harness.manager.getNowPlaying();
  assert.equal(nowPlaying.source, 'upnp-sonuvi');
  assert.equal(nowPlaying.ownsAudio, true);
  assert.equal(nowPlaying.generation, selected.generation);
  assert.equal(nowPlaying.animatedArt.source, 'upnp-sonuvi');
  assert.equal(nowPlaying.animatedArt.eligible, true);
  assert.match(nowPlaying.animatedArt.identity, /^sha256:[a-f0-9]{24}$/);
  const paused = await harness.manager.pause(selected.sessionId);
  assert.equal(paused.state, 'paused');
  assert.equal(harness.actions[2].action, 'Pause');

  const stopped = await harness.manager.stop(selected.sessionId);
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.ownsAudio, false);
  assert.equal(stopped.transport.state, 'STOPPED');
  assert.equal(harness.manager.shouldSuppressMpdHistory(), false);
  assert.equal(harness.actions[3].action, 'Stop');
  await assert.rejects(() => harness.manager.play(selected.sessionId), (error) => error.code === 'UPNP_OWNERSHIP_LOST');
});

test('startup confirms the expected renderer URI before sending Play', async () => {
  const harness = makeHarness({
    renderer: { serviceActions: ['GetMediaInfo', 'GetTransportInfo', 'GetPositionInfo'] },
    startupResponses: {
      GetMediaInfo: [{ CurrentURI: RESOURCE.uri }],
      GetTransportInfo: [{ CurrentTransportState: 'STOPPED' }],
      GetPositionInfo: [{ TrackDuration: RESOURCE.duration }],
    },
  });
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });

  await harness.manager.load(selected.sessionId);
  const playBeforeExplicitRequest = harness.actions.some((entry) => entry.action === 'Play');
  assert.equal(playBeforeExplicitRequest, false);
  assert.ok(harness.logs.some((entry) => entry.details.event === 'renderer_uri_ready'));

  await harness.manager.play(selected.sessionId);
  const setUriIndex = harness.actions.findIndex((entry) => entry.action === 'SetAVTransportURI');
  const readyProbeIndex = harness.actions.findIndex((entry) => entry.action === 'GetMediaInfo');
  const playIndex = harness.actions.findIndex((entry) => entry.action === 'Play');
  assert.ok(setUriIndex < readyProbeIndex);
  assert.ok(readyProbeIndex < playIndex);
});

test('startup polls through delayed URI and transport readiness', async () => {
  const harness = makeHarness({
    renderer: { serviceActions: ['GetMediaInfo', 'GetTransportInfo', 'GetPositionInfo'] },
    startupUriReadyTimeoutMs: 1_000,
    startupPollIntervalMs: 50,
    wait: async () => {},
    startupResponses: {
      GetMediaInfo: [
        { CurrentURI: 'http://10.0.0.254:8200/previous.flac' },
        { CurrentURI: RESOURCE.uri },
      ],
      GetTransportInfo: [
        { CurrentTransportState: 'TRANSITIONING' },
        { CurrentTransportState: 'STOPPED' },
      ],
      GetPositionInfo: [{ TrackDuration: RESOURCE.duration }],
    },
  });
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });

  await harness.manager.load(selected.sessionId);

  assert.equal(harness.actions.filter((entry) => entry.action === 'GetMediaInfo').length, 2);
  const ready = harness.logs.find((entry) => entry.details.event === 'renderer_uri_ready');
  assert.equal(ready.details.attempt, 2);
  assert.equal(ready.details.transportState, 'STOPPED');
  assert.equal(harness.logs.some((entry) => entry.details.event === 'renderer_uri_readiness_fallback'), false);
});

test('startup readiness timeout falls back to the existing Play flow', async () => {
  const harness = makeHarness({
    renderer: { serviceActions: ['GetMediaInfo'] },
    startupUriReadyTimeoutMs: 100,
    startupPollIntervalMs: 50,
    wait: async () => {},
    startupResponses: {
      GetMediaInfo: Array(3).fill({ CurrentURI: 'http://10.0.0.254:8200/previous.flac' }),
    },
  });
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });

  await harness.manager.load(selected.sessionId);
  const fallback = harness.logs.find((entry) => entry.details.event === 'renderer_uri_readiness_fallback');
  assert.equal(fallback.details.reason, 'uri_not_confirmed');
  assert.equal(fallback.details.uriMatched, false);

  const playing = await harness.manager.play(selected.sessionId);
  assert.equal(playing.state, 'playing');
  assert.equal(harness.actions.filter((entry) => entry.action === 'Play').length, 1);
});

test('incomplete transport probes do not block playback after the URI is confirmed', async () => {
  const harness = makeHarness({
    renderer: { serviceActions: ['GetMediaInfo', 'GetTransportInfo'] },
    startupResponses: {
      GetMediaInfo: [{ CurrentURI: RESOURCE.uri }],
      GetTransportInfo: [{ CurrentTransportState: 'UNKNOWN' }],
    },
  });
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });

  await harness.manager.load(selected.sessionId);
  const ready = harness.logs.find((entry) => entry.details.event === 'renderer_uri_ready');
  assert.equal(ready.details.reason, 'expected_uri_state_unavailable');
  assert.equal(harness.actions.some((entry) => entry.action === 'GetTransportInfo'), true);
  assert.equal((await harness.manager.play(selected.sessionId)).state, 'playing');
});

test('ambiguous Play response does not issue a duplicate command when the renderer is active', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  await harness.manager.load(selected.sessionId);
  const transportAction = harness.controlPoint.transportAction.bind(harness.controlPoint);
  harness.controlPoint.transportAction = async (rendererId, action, args) => {
    if (action === 'Play') {
      await transportAction(rendererId, action, args);
      const error = new Error('fixture SOAP response timed out');
      error.code = 'ETIMEDOUT';
      throw error;
    }
    return transportAction(rendererId, action, args);
  };

  await assert.rejects(() => harness.manager.play(selected.sessionId), (error) => error.code === 'ETIMEDOUT');
  const retry = await harness.manager.play(selected.sessionId);

  assert.equal(retry.state, 'playing');
  assert.equal(harness.actions.filter((entry) => entry.action === 'Play').length, 1);
  assert.ok(harness.logs.some((entry) => entry.details.event === 'play_not_resent_renderer_already_active'));
});

test('ambiguous Play response is not retried when the renderer reports STOPPED', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  await harness.manager.load(selected.sessionId);
  const transportAction = harness.controlPoint.transportAction.bind(harness.controlPoint);
  harness.controlPoint.transportAction = async (rendererId, action, args) => {
    if (action === 'Play') {
      harness.actions.push({ action, args: structuredClone(args) });
      const error = new Error('fixture SOAP response timed out before state changed');
      error.code = 'ETIMEDOUT';
      throw error;
    }
    return transportAction(rendererId, action, args);
  };

  await assert.rejects(() => harness.manager.play(selected.sessionId), (error) => error.code === 'ETIMEDOUT');
  await assert.rejects(
    () => harness.manager.play(selected.sessionId),
    (error) => error.code === 'UPNP_PLAYBACK_UNCERTAIN',
  );

  assert.equal(harness.actions.filter((entry) => entry.action === 'Play').length, 1);
});

test('startup timing diagnostics record first transport change and position without media URLs', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  await harness.manager.load(selected.sessionId);
  await harness.manager.play(selected.sessionId);
  await harness.manager.state(selected.sessionId);

  const events = harness.logs.map((entry) => entry.details.event);
  assert.ok(events.includes('set_av_transport_uri_sent'));
  assert.ok(events.includes('set_av_transport_uri_completed'));
  assert.ok(events.includes('media_http_request_not_observable'));
  assert.ok(events.includes('play_sent'));
  assert.ok(events.includes('play_completed'));
  assert.ok(events.includes('first_transport_state_change'));
  assert.ok(events.includes('first_nonzero_playback_position'));
  assert.doesNotMatch(JSON.stringify(harness.logs), /http:|token=fixture/);
});

test('late startup observations from an old session are ignored', async () => {
  const harness = makeHarness();
  const first = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  await harness.manager.load(first.sessionId);
  await harness.manager.play(first.sessionId);
  const oldSession = harness.manager.session;
  await harness.manager.stop(first.sessionId);
  const replacement = await harness.manager.select({ itemRef: ITEM2.selectionRef, rendererId: 'renderer-1' });
  const eventCountBefore = harness.logs.filter((entry) => entry.details.event === 'first_transport_state_change').length;

  harness.manager._recordStartupObservation(oldSession, makeInspection({
    state: 'PLAYING',
    uri: RESOURCE.uri,
  }));

  assert.equal(harness.manager.snapshot().generation, replacement.generation);
  assert.equal(harness.logs.filter((entry) => entry.details.event === 'first_transport_state_change').length, eventCountBefore);
});

test('next-track preparation is confirmed and committed without a second load/play sequence', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
  });
  await harness.manager.load(selected.sessionId);
  await harness.manager.play(selected.sessionId);
  const firstNowPlaying = await harness.manager.getNowPlaying();
  const firstAnimatedArtIdentity = firstNowPlaying.animatedArt.identity;

  const armed = await harness.manager.prepareNext(selected.sessionId, {
    itemRef: ITEM2.selectionRef,
    queueRevision: 4,
    sessionGeneration: selected.generation,
    currentItemId: ITEM.id,
  });
  assert.equal(armed.armed, true);
  assert.equal(armed.nextItemId, ITEM2.id);
  assert.deepEqual(harness.actions.map((entry) => entry.action), [
    'SetAVTransportURI',
    'Play',
    'SetNextAVTransportURI',
  ]);

  harness.setInspection(makeInspection({
    state: 'PLAYING',
    uri: RESOURCE2.uri,
    nextUri: '',
    actions: ['Play', 'Pause', 'Stop'],
  }));
  const transitioned = await harness.manager.state(selected.sessionId);
  assert.equal(transitioned.ownsAudio, true);
  assert.equal(transitioned.transitionedNext, true);

  const committed = await harness.manager.commitPreparedNext(selected.sessionId, {
    queueRevision: 4,
    sessionGeneration: selected.generation,
    currentItemId: ITEM.id,
    nextItemId: ITEM2.id,
  });
  assert.equal(committed.item.id, ITEM2.id);
  assert.equal(committed.transitionedNext, false);
  const nextNowPlaying = await harness.manager.getNowPlaying();
  assert.equal(nextNowPlaying.title, 'Track Two');
  assert.equal(nextNowPlaying.animatedArt.eligible, true);
  assert.notEqual(nextNowPlaying.animatedArt.identity, firstAnimatedArtIdentity);
  assert.deepEqual(harness.actions.map((entry) => entry.action), [
    'SetAVTransportURI',
    'Play',
    'SetNextAVTransportURI',
  ]);
});

test('approved renderer inspection enforces the configured renderer host', async () => {
  const harness = makeHarness();
  let receivedExpectedHost = '';
  harness.controlPoint.rendererPlaybackCapabilities = async (_rendererId, options) => {
    receivedExpectedHost = options?.expectedHost || '';
    return { approved: true };
  };
  const result = await harness.manager.approvedRendererCapabilities({ rendererId: 'renderer-1' });
  assert.deepEqual(result, { approved: true });
  assert.equal(receivedExpectedHost, '10.0.0.254');
});

test('natural renderer stop preserves the last active position for completion detection', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
  });
  await harness.manager.load(selected.sessionId);
  await harness.manager.play(selected.sessionId);

  const playing = makeInspection({ state: 'PLAYING', uri: RESOURCE.uri });
  playing.readOnlyState.position.relativeTime = RESOURCE.duration;
  harness.setInspection(playing);
  await harness.manager.state(selected.sessionId);

  const stopped = makeInspection({ state: 'STOPPED', uri: RESOURCE.uri });
  stopped.readOnlyState.position.relativeTime = '00:00:00';
  stopped.readOnlyState.position.trackDuration = '00:00:00';
  harness.setInspection(stopped);
  const observed = await harness.manager.state(selected.sessionId);

  assert.equal(observed.state, 'stopped');
  assert.equal(observed.ownsAudio, false);
  assert.equal(observed.transport.state, 'STOPPED');
  assert.equal(observed.transport.relativeTime, RESOURCE.duration);
  assert.equal(observed.transport.trackDuration, RESOURCE.duration);
});

test('selection rejects active MPD or Qobuz ownership before any transport action', async () => {
  for (const options of [
    { mpdState: 'play' },
    { qobuz: { active: true, suppressMpdHistory: true } },
  ]) {
    const harness = makeHarness(options);
    await assert.rejects(
      () => harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' }),
      (error) => error instanceof UpnpError && ['UPNP_MPD_ACTIVE', 'UPNP_QOBUZ_ACTIVE'].includes(error.code),
    );
    assert.equal(harness.actions.length, 0);
  }
});

test('selection rejects an active renderer and load rejects a changed MPD queue', async () => {
  const active = makeHarness({ renderer: { state: 'PLAYING', uri: 'http://10.0.0.254:8200/other.flac' } });
  await assert.rejects(
    () => active.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' }),
    (error) => error.code === 'UPNP_RENDERER_ACTIVE',
  );

  const harness = makeHarness({ queue: [{ pos: '0', id: '10', file: 'music/existing.flac' }] });
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  harness.snapshot.queue.push({ pos: '1', id: '11', file: 'music/changed.flac' });
  await assert.rejects(
    () => harness.manager.load(selected.sessionId),
    (error) => error.code === 'UPNP_QUEUE_CHANGED',
  );
  assert.equal(harness.actions.length, 0);
});

test('unexpected renderer URI loses ownership and stale session commands fail closed', async () => {
  const harness = makeHarness();
  const selected = await harness.manager.select({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' });
  await harness.manager.load(selected.sessionId);
  harness.setInspection(makeInspection({ state: 'PLAYING', uri: 'http://10.0.0.254:8200/other.flac' }));
  await assert.rejects(
    () => harness.manager.play(selected.sessionId),
    (error) => error.code === 'UPNP_OWNERSHIP_LOST',
  );
  const state = harness.manager.snapshot();
  assert.equal(state.state, 'ownership-lost');
  assert.equal(state.ownsAudio, false);
});

test('explicit takeover stops active MPD before establishing a Sonuvi session', async () => {
  const harness = makeHarness({ mpdState: 'play' });
  const result = await harness.manager.takeover({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
    confirmed: true,
  });

  assert.equal(harness.stopMpdCalls.length, 1);
  assert.deepEqual(harness.actions.map((entry) => entry.action), ['SetAVTransportURI', 'Play']);
  assert.equal(result.state, 'playing');
  assert.equal(result.ownsAudio, true);
  assert.deepEqual(result.takeover, {
    confirmed: true,
    stoppedMpd: true,
    stoppedRenderer: false,
  });
});

test('explicit takeover also releases paused MPD without manual user stop', async () => {
  const harness = makeHarness({ mpdState: 'pause' });
  const result = await harness.manager.takeover({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
    confirmed: true,
  });

  assert.equal(harness.stopMpdCalls.length, 1);
  assert.equal(result.state, 'playing');
  assert.equal(result.takeover.stoppedMpd, true);
});

test('explicit takeover from idle MPD does not issue an unnecessary MPD stop', async () => {
  const harness = makeHarness({ mpdState: 'stop' });
  const result = await harness.manager.takeover({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
    confirmed: true,
  });

  assert.equal(harness.stopMpdCalls.length, 0);
  assert.equal(result.state, 'playing');
  assert.equal(result.takeover.stoppedMpd, false);
});

test('explicit takeover can release an active approved renderer but never Qobuz Connect', async () => {
  const renderer = makeHarness({
    renderer: { state: 'PLAYING', uri: 'http://10.0.0.254:8200/other.flac' },
  });
  const rendererResult = await renderer.manager.takeover({
    itemRef: ITEM.selectionRef,
    rendererId: 'renderer-1',
    confirmed: true,
  });
  assert.equal(rendererResult.state, 'playing');
  assert.deepEqual(renderer.actions.map((entry) => entry.action), ['Stop', 'SetAVTransportURI', 'Play']);

  const qobuz = makeHarness({ qobuz: { active: true, suppressMpdHistory: true } });
  await assert.rejects(
    () => qobuz.manager.takeover({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1', confirmed: true }),
    (error) => error.code === 'UPNP_QOBUZ_TAKEOVER_UNSUPPORTED',
  );
  assert.equal(qobuz.stopMpdCalls.length, 0);
  assert.equal(qobuz.actions.length, 0);
});

test('takeover reports a typed stop failure without starting Sonuvi playback', async () => {
  const harness = makeHarness({ mpdState: 'play', stopMpdFailure: true });

  await assert.rejects(
    () => harness.manager.takeover({
      itemRef: ITEM.selectionRef,
      rendererId: 'renderer-1',
      confirmed: true,
    }),
    (error) => error.code === 'UPNP_TAKEOVER_STOP_FAILED'
      && error.details?.stoppedMpd === false
      && error.details?.stoppedRenderer === false,
  );
  assert.equal(harness.stopMpdCalls.length, 1);
  assert.deepEqual(harness.actions, []);
  assert.deepEqual(harness.manager.snapshot(), { active: false, session: null });
});

test('takeover requires explicit confirmation and reports a typed start failure after release', async () => {
  const unconfirmed = makeHarness();
  await assert.rejects(
    () => unconfirmed.manager.takeover({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1' }),
    (error) => error.code === 'UPNP_TAKEOVER_CONFIRMATION_REQUIRED',
  );

  const failed = makeHarness();
  failed.controlPoint.prepareMediaItemForPlayback = async () => {
    throw new UpnpError('fixture start failure', { code: 'UPNP_STALE_MEDIA_ITEM', status: 409 });
  };
  await assert.rejects(
    () => failed.manager.takeover({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1', confirmed: true }),
    (error) => error.code === 'UPNP_TAKEOVER_START_FAILED'
      && error.details?.stoppedMpd === false
      && error.details?.stoppedRenderer === false,
  );
  assert.deepEqual(failed.manager.snapshot(), { active: false, session: null });
});

test('takeover start-failure cleanup does not stop a new renderer owner', async () => {
  const harness = makeHarness();
  const originalTransportAction = harness.controlPoint.transportAction;
  harness.controlPoint.transportAction = async (rendererId, action, args) => {
    if (action === 'Play') {
      harness.setInspection(makeInspection({
        state: 'PLAYING',
        uri: 'http://10.0.0.254:8200/other-owner.flac',
      }));
      throw new UpnpError('fixture renderer start failure', {
        code: 'UPNP_RENDERER_ERROR',
        status: 409,
      });
    }
    return originalTransportAction(rendererId, action, args);
  };

  await assert.rejects(
    () => harness.manager.takeover({ itemRef: ITEM.selectionRef, rendererId: 'renderer-1', confirmed: true }),
    (error) => error.code === 'UPNP_TAKEOVER_START_FAILED',
  );
  assert.deepEqual(harness.actions.map((entry) => entry.action), ['SetAVTransportURI']);
});
