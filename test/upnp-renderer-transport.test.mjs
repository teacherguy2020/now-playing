import assert from 'node:assert/strict';
import test from 'node:test';

import { UpnpPlaybackSessionManager } from '../src/lib/upnp-playback-session.mjs';

const RENDERER = {
  id: 'renderer-1',
  udn: 'uuid:moode-renderer',
  friendlyName: 'Moode UPNP',
};

function inspectionFor({
  state = 'PLAYING',
  track = 1,
  numberOfTracks = 8,
  uri = 'http://10.0.0.68:5001/ums/track-1.flac',
  relativeTime = '00:00:12',
  actions = ['Play', 'Pause', 'Stop', 'Seek', 'Next', 'Previous'],
} = {}) {
  return {
    device: RENDERER,
    services: [{
      serviceType: 'urn:schemas-upnp-org:service:AVTransport:1',
      actions: ['SetAVTransportURI', 'Play', 'Pause', 'Stop', 'Seek', 'Next', 'Previous'],
    }],
    protocolInfo: { available: true, source: [], sink: ['http-get:*:audio/flac:*'] },
    readOnlyState: {
      transport: { state, status: 'OK', speed: '1' },
      position: { track, relativeTime, trackDuration: '00:03:21' },
      media: {
        numberOfTracks,
        mediaDuration: '00:26:48',
        currentUri: uri,
      },
      currentActions: actions,
    },
  };
}

function makeHarness(options = {}) {
  let inspection = inspectionFor(options);
  const actions = [];
  const controlPoint = {
    async rendererPlaybackCapabilities() {
      return {
        device: RENDERER,
        inspection: structuredClone(inspection),
        avTransportActions: ['SetAVTransportURI', 'Play', 'Pause', 'Stop', 'Seek', 'Next', 'Previous'],
      };
    },
    async transportAction(_rendererId, action, args) {
      actions.push({ action, args: structuredClone(args) });
      if (options.confirm === false) return {};
      if (action === 'Pause') inspection.readOnlyState.transport.state = 'PAUSED_PLAYBACK';
      if (action === 'Play') inspection.readOnlyState.transport.state = 'PLAYING';
      if (action === 'Stop') inspection.readOnlyState.transport.state = 'STOPPED';
      if (action === 'Seek') inspection.readOnlyState.position.relativeTime = args.Target;
      if (action === 'Next') {
        inspection.readOnlyState.position.track += 1;
        inspection.readOnlyState.media.currentUri = `http://10.0.0.68:5001/ums/track-${inspection.readOnlyState.position.track}.flac`;
      }
      if (action === 'Previous') {
        inspection.readOnlyState.position.track -= 1;
        inspection.readOnlyState.media.currentUri = `http://10.0.0.68:5001/ums/track-${inspection.readOnlyState.position.track}.flac`;
      }
      return {};
    },
  };
  const manager = new UpnpPlaybackSessionManager({
    controlPoint,
    readMpdSnapshot: async () => ({
      status: { state: options.mpdState || 'stop' },
      song: structuredClone(options.mpdSong || {}),
      queue: [],
    }),
    getQobuzState: async () => structuredClone(options.qobuz || { active: false, suppressMpdHistory: false }),
    expectedRendererHost: '10.0.0.254',
    sessionTtlMs: 60_000,
    now: () => 1_700_000_000_000,
    log: { warn() {} },
  });
  return { manager, actions, controlPoint, inspection: () => inspection };
}

test('external renderer capabilities expose safe transport controls without queue ownership', async () => {
  const { manager } = makeHarness();
  const result = await manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(result.source, 'external-upnp');
  assert.equal(result.owner, 'external');
  assert.equal(result.queueAuthority, 'renderer');
  assert.equal(result.capabilities.pause, true);
  assert.equal(result.capabilities.resume, false);
  assert.equal(result.capabilities.stop, true);
  assert.equal(result.capabilities.seek, true);
  assert.equal(result.capabilities.next, true);
  assert.equal(result.capabilities.previous, true);
  assert.equal(result.capabilities.queueEdit, false);
  assert.equal(result.transport.numberOfTracks, 8);
  assert.equal(result.transport.currentMediaPresent, true);
  assert.equal(result._currentMediaUri, 'http://10.0.0.68:5001/ums/track-1.flac');
});

test('external pause, resume, seek, next, previous, and stop are confirmed without touching MPD', async () => {
  const { manager, actions } = makeHarness();

  const paused = await manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' });
  assert.equal(paused.verified, true);
  assert.equal(paused.action, 'pause');

  const resumed = await manager.rendererTransport({ rendererId: RENDERER.id, action: 'resume' });
  assert.equal(resumed.verified, true);
  assert.equal(resumed.action, 'resume');

  const sought = await manager.rendererTransport({
    rendererId: RENDERER.id,
    action: 'seek',
    positionSeconds: 42,
  });
  assert.equal(sought.verified, true);
  assert.equal(actions[2].action, 'Seek');
  assert.deepEqual(actions[2].args, { InstanceID: 0, Unit: 'REL_TIME', Target: '00:00:42' });

  const next = await manager.rendererTransport({ rendererId: RENDERER.id, action: 'next' });
  assert.equal(next.verified, true);
  const previous = await manager.rendererTransport({ rendererId: RENDERER.id, action: 'previous' });
  assert.equal(previous.verified, true);
  const stopped = await manager.rendererTransport({ rendererId: RENDERER.id, action: 'stop' });
  assert.equal(stopped.verified, true);
  assert.equal(stopped.transport.state, 'STOPPED');
  assert.deepEqual(actions.map(({ action }) => action), ['Pause', 'Play', 'Seek', 'Next', 'Previous', 'Stop']);
});

test('next and previous reject a renderer with no authoritative multi-track queue', async () => {
  const { manager, actions } = makeHarness({ numberOfTracks: 1, actions: ['Pause', 'Stop', 'Next', 'Previous'] });
  const capabilities = await manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(capabilities.source, 'external-upnp');
  assert.equal(capabilities.queueAuthority, 'unavailable');
  assert.equal(capabilities.capabilities.next, false);
  assert.equal(capabilities.capabilities.previous, false);
  await assert.rejects(
    () => manager.rendererTransport({ rendererId: RENDERER.id, action: 'next' }),
    (error) => error.code === 'UPNP_EXTERNAL_QUEUE_UNAVAILABLE',
  );
  assert.deepEqual(actions, []);
});

test('Qobuz ownership and Sonuvi queue ownership remain protected', async () => {
  const qobuz = makeHarness({ qobuz: { active: true, suppressMpdHistory: true } });
  const qobuzCapabilities = await qobuz.manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(qobuzCapabilities.source, 'qobuz-connect');
  assert.deepEqual(qobuzCapabilities.controlsAllowed, []);
  await assert.rejects(
    () => qobuz.manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
    (error) => error.code === 'UPNP_QOBUZ_ACTIVE',
  );
  assert.deepEqual(qobuz.actions, []);

  const owned = makeHarness();
  owned.manager.session = {
    ownsAudio: true,
    rendererId: RENDERER.id,
    resource: { uri: 'http://10.0.0.68:5001/ums/track-1.flac' },
  };
  const ownedCapabilities = await owned.manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(ownedCapabilities.source, 'upnp-sonuvi');
  assert.equal(ownedCapabilities.queueAuthority, 'sonuvi');
  assert.equal(ownedCapabilities.queueRouteRequired, true);
  await assert.rejects(
    () => owned.manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
    (error) => error.code === 'UPNP_QUEUE_AUTHORITY_REQUIRED',
  );
  assert.deepEqual(owned.actions, []);
});

test('uncertain renderer state and unconfirmed actions fail closed', async () => {
  const uncertain = makeHarness({ state: 'TRANSITIONING' });
  const uncertainCapabilities = await uncertain.manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(uncertainCapabilities.source, 'unknown');
  await assert.rejects(
    () => uncertain.manager.rendererTransport({ rendererId: RENDERER.id, action: 'stop' }),
    (error) => error.code === 'UPNP_TRANSPORT_BAD_STATE',
  );

  const unconfirmed = makeHarness({ confirm: false });
  await assert.rejects(
    () => unconfirmed.manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
    (error) => error.code === 'UPNP_TRANSPORT_UNCONFIRMED',
  );
  assert.deepEqual(unconfirmed.actions.map(({ action }) => action), ['Pause']);
});

test('active ordinary MPD or AirPlay playback blocks source-independent renderer control', async () => {
  const localMpd = makeHarness({
    mpdState: 'play',
    mpdSong: { file: '/var/lib/mpd/music/ordinary.flac' },
  });
  const localCapabilities = await localMpd.manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(localCapabilities.source, 'unknown');
  await assert.rejects(
    () => localMpd.manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
    (error) => error.code === 'UPNP_TRANSPORT_BAD_STATE',
  );
  assert.deepEqual(localMpd.actions, []);

  const airplay = makeHarness({
    mpdState: 'play',
    mpdSong: { file: 'AirPlay active', encoded: 'airplay' },
  });
  const airplayCapabilities = await airplay.manager.rendererTransportCapabilities({ rendererId: RENDERER.id });
  assert.equal(airplayCapabilities.source, 'unknown');
  assert.deepEqual(airplay.actions, []);
});

test('concurrent renderer commands serialize through the session mutation lock', async () => {
  const { manager, actions } = makeHarness();
  const results = await Promise.allSettled([
    manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
    manager.rendererTransport({ rendererId: RENDERER.id, action: 'pause' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected')[0].reason.code, 'UPNP_TRANSPORT_UNSUPPORTED');
  assert.deepEqual(actions.map(({ action }) => action), ['Pause']);
});
