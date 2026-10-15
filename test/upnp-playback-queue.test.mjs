import test from 'node:test';
import assert from 'node:assert/strict';

import { UpnpError } from '../src/lib/upnp-control-point.mjs';
import { UpnpPlaybackQueueManager } from '../src/lib/upnp-playback-queue.mjs';

const RENDERER_ID = 'renderer-1';

function makeItem(number, { durationSeconds = 180 } = {}) {
  const ref = `fixture-selection-reference-${number}`;
  return {
    kind: 'item',
    selectionRef: ref,
    mediaServerId: 'server-1',
    id: `track-${number}`,
    parentId: 'album-1',
    title: `Track ${number}`,
    creator: 'Fixture Artist',
    artist: 'Fixture Artist',
    album: 'Fixture Album',
    trackNumber: number,
    class: 'object.item.audioItem.musicTrack',
    artworkUrl: 'http://10.0.0.254:8200/art/fixture.jpg',
    duration: `00:${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`,
    durationSeconds,
    resources: [{
      uri: `http://10.0.0.254:8200/MediaItems/${number}.flac?token=temporary`,
      protocolInfo: 'http-get:*:audio/flac:*',
      mimeType: 'audio/flac',
      duration: `00:${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`,
      durationSeconds,
      sampleFrequency: 192000,
      bitsPerSample: 24,
      audioChannels: 2,
    }],
  };
}

function makeHarness({ gaplessEnabled = false } = {}) {
  const items = new Map([1, 2, 3, 4].map((number) => {
    const item = makeItem(number);
    return [item.selectionRef, item];
  }));
  const actions = [];
  let sequence = 0;
  let session = null;

  const controlPoint = {
    getTrustedMediaItem(ref) {
      const item = items.get(String(ref));
      if (!item) {
        throw new UpnpError('Unknown fixture item', { code: 'UPNP_ITEM_NOT_FOUND', status: 404 });
      }
      return structuredClone(item);
    },
  };

  const copySession = () => session ? structuredClone({
    active: Boolean(session.ownsAudio),
    sessionId: session.sessionId,
    generation: session.generation,
    state: session.state,
    ownsAudio: session.ownsAudio,
    renderer: { id: session.rendererId },
    item: session.item,
    transport: session.transport,
    transitionedNext: Boolean(session.transitionedNext),
    lastError: session.lastError,
  }) : { active: false, session: null };

  const requireSession = (sessionId) => {
    if (!session || session.sessionId !== sessionId) {
      throw new UpnpError('Fixture session is stale', { code: 'UPNP_OWNERSHIP_LOST', status: 409 });
    }
    return session;
  };

  const playbackSession = {
    snapshot: copySession,
    async approvedRendererCapabilities({ rendererId }) {
      if (rendererId !== RENDERER_ID) {
        throw new UpnpError('Fixture renderer is not approved', {
          code: 'UPNP_UNTRUSTED_RENDERER',
          status: 403,
        });
      }
      return { ok: true };
    },
    async select({ itemRef, rendererId }) {
      const item = controlPoint.getTrustedMediaItem(itemRef);
      session = {
        sessionId: `fixture-session-${String(++sequence).padStart(20, '0')}`,
        generation: `fixture-generation-${String(sequence).padStart(12, '0')}`,
        rendererId,
        item,
        state: 'selected',
        ownsAudio: false,
        lastError: '',
        transport: {
          state: 'STOPPED',
          relativeTime: '00:00:00',
          trackDuration: item.duration,
        },
      };
      actions.push({ action: 'select', itemRef, rendererId });
      return copySession();
    },
    async takeover({ itemRef, rendererId, confirmed }) {
      assert.equal(confirmed, true);
      const item = controlPoint.getTrustedMediaItem(itemRef);
      session = {
        sessionId: `fixture-session-${String(++sequence).padStart(20, '0')}`,
        generation: `fixture-generation-${String(sequence).padStart(12, '0')}`,
        rendererId,
        item,
        state: 'playing',
        ownsAudio: true,
        lastError: '',
        transport: {
          state: 'PLAYING',
          relativeTime: '00:00:01',
          trackDuration: item.duration,
        },
        takeover: {
          confirmed: true,
          stoppedMpd: false,
          stoppedRenderer: true,
        },
      };
      actions.push({ action: 'takeover', itemRef, rendererId });
      return { ...copySession(), takeover: structuredClone(session.takeover) };
    },
    async load(sessionId) {
      const current = requireSession(sessionId);
      current.state = 'loaded';
      current.ownsAudio = true;
      current.transport.state = 'STOPPED';
      actions.push({ action: 'load', sessionId });
      return copySession();
    },
    async play(sessionId) {
      const current = requireSession(sessionId);
      current.state = 'playing';
      current.ownsAudio = true;
      current.transport.state = 'PLAYING';
      actions.push({ action: 'play', sessionId });
      return copySession();
    },
    async pause(sessionId) {
      const current = requireSession(sessionId);
      current.state = 'paused';
      current.ownsAudio = true;
      current.transport.state = 'PAUSED_PLAYBACK';
      actions.push({ action: 'pause', sessionId });
      return copySession();
    },
    async stop(sessionId) {
      const current = requireSession(sessionId);
      current.state = 'stopped';
      current.ownsAudio = false;
      current.preparedNext = null;
      current.transitionedNext = false;
      current.transport.state = 'STOPPED';
      actions.push({ action: 'stop', sessionId });
      return copySession();
    },
    async prepareNext(sessionId, { itemRef, sessionGeneration, currentItemId }) {
      const current = requireSession(sessionId);
      const next = controlPoint.getTrustedMediaItem(itemRef);
      assert.equal(sessionGeneration, current.generation);
      assert.equal(currentItemId, current.item.id);
      current.preparedNext = { next };
      actions.push({ action: 'prepareNext', sessionId, itemRef });
      return { armed: true, nextItemId: next.id };
    },
    async clearPreparedNext(sessionId) {
      const current = requireSession(sessionId);
      current.preparedNext = null;
      current.transitionedNext = false;
      actions.push({ action: 'clearPreparedNext', sessionId });
      return copySession();
    },
    async commitPreparedNext(sessionId, { currentItemId, nextItemId }) {
      const current = requireSession(sessionId);
      assert.equal(current.transitionedNext, true);
      assert.equal(current.item.id, currentItemId);
      assert.equal(current.preparedNext.next.id, nextItemId);
      current.item = current.preparedNext.next;
      current.preparedNext = null;
      current.transitionedNext = false;
      current.state = 'playing';
      current.ownsAudio = true;
      current.transport.state = 'PLAYING';
      actions.push({ action: 'commitPreparedNext', sessionId });
      return copySession();
    },
    async state(sessionId) {
      requireSession(sessionId);
      return copySession();
    },
  };

  const manager = new UpnpPlaybackQueueManager({
    controlPoint,
    playbackSession,
    now: (() => {
      let value = 1_700_000_000_000;
      return () => ++value;
    })(),
    gaplessEnabled,
    log: { debug() {}, warn() {} },
  });

  return {
    manager,
    actions,
    playbackSession,
    setSession(next) { session = next; },
    getSession() { return session; },
  };
}

async function createQueue(harness, refs = [1, 2, 3]) {
  return harness.manager.create({
    rendererId: RENDERER_ID,
    itemRefs: refs.map((number) => `fixture-selection-reference-${number}`),
  });
}

test('queue keeps ordered trusted item identity without persisting resource URLs', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2]);

  assert.equal(created.queue.items.length, 2);
  assert.deepEqual(created.queue.items.map((item) => item.mediaItemId), ['track-1', 'track-2']);
  assert.equal(Object.hasOwn(created.queue.items[0].resource, 'uri'), false);
  assert.equal(created.queue.items[0].selectionRef, 'fixture-selection-reference-1');
  assert.equal(created.queue.persistence, 'memory');

  const added = await harness.manager.addItems(created.queue.queueId, {
    itemRefs: ['fixture-selection-reference-3', 'fixture-selection-reference-3'],
    revision: created.queue.revision,
  });
  assert.equal(added.queue.items.length, 4);
  assert.notEqual(added.queue.items[2].id, added.queue.items[3].id);
});

test('currentState exposes a read-only empty snapshot before queue creation', () => {
  const harness = makeHarness();
  assert.deepEqual(harness.manager.currentState(), { active: false, queue: null });
});

test('queue creation rejects an unapproved renderer before retaining queue state', async () => {
  const harness = makeHarness();
  await assert.rejects(
    () => harness.manager.create({
      rendererId: 'sony-renderer',
      itemRefs: ['fixture-selection-reference-1'],
    }),
    (error) => error.code === 'UPNP_UNTRUSTED_RENDERER',
  );
  assert.deepEqual(harness.manager.currentState(), { active: false, queue: null });
});

test('queue creation remains available while playback ownership is active', async () => {
  const harness = makeHarness();
  harness.playbackSession.preflight = async () => {
    throw new UpnpError('Fixture MPD is active', { code: 'UPNP_MPD_ACTIVE', status: 409 });
  };
  const created = await createQueue(harness, [1]);
  assert.equal(created.queue.items.length, 1);
  assert.equal(created.queue.playbackState, 'stopped');
});

test('currentState exposes the active logical queue without requiring its ID', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1]);
  const current = harness.manager.currentState();
  assert.equal(current.active, false);
  assert.equal(current.queue.queueId, created.queue.queueId);
  assert.equal(current.queue.revision, created.queue.revision);
  assert.equal(current.queue.items[0].selectionRef, 'fixture-selection-reference-1');
});

test('queue mutations require the current revision and preserve the current item while reordering', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2, 3]);
  const playing = await harness.manager.play(created.queue.queueId, {
    index: 1,
    revision: created.queue.revision,
  });
  const currentId = playing.queue.items[1].id;

  await assert.rejects(
    () => harness.manager.addItems(created.queue.queueId, {
      itemRefs: ['fixture-selection-reference-4'],
      revision: playing.queue.revision - 1,
    }),
    (error) => error.code === 'UPNP_QUEUE_REVISION_CONFLICT',
  );
  await assert.rejects(
    () => harness.manager.addItems(created.queue.queueId, {
      itemRefs: ['fixture-selection-reference-4'],
    }),
    (error) => error.code === 'UPNP_QUEUE_REVISION_REQUIRED',
  );

  const reordered = await harness.manager.reorder(created.queue.queueId, {
    itemId: currentId,
    toIndex: 2,
    revision: playing.queue.revision,
  });
  assert.equal(reordered.queue.currentItemId, currentId);
  assert.equal(reordered.queue.currentIndex, 2);
  assert.equal(reordered.queue.items[2].mediaItemId, 'track-2');

  const removed = await harness.manager.removeItem(created.queue.queueId, reordered.queue.items[0].id, {
    revision: reordered.queue.revision,
  });
  assert.equal(removed.queue.items.length, 2);
  assert.equal(removed.queue.currentItemId, currentId);
  assert.equal(removed.queue.currentIndex, 1);
});

test('queue playback supports play, pause, resume, next, previous, and stop', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2, 3]);

  let state = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });
  assert.equal(state.queue.currentIndex, 0);
  assert.equal(state.queue.playbackState, 'playing');
  assert.deepEqual(harness.actions.map((entry) => entry.action), ['select', 'load', 'play']);

  state = await harness.manager.pause(created.queue.queueId, { revision: state.queue.revision });
  assert.equal(state.queue.playbackState, 'paused');
  state = await harness.manager.resume(created.queue.queueId, { revision: state.queue.revision });
  assert.equal(state.queue.playbackState, 'playing');

  state = await harness.manager.play(created.queue.queueId, {
    index: 1,
    revision: state.queue.revision,
  });
  assert.equal(state.queue.currentIndex, 1);
  assert.equal(state.queue.playbackState, 'playing');
  assert.equal(harness.actions.filter((entry) => entry.action === 'select').length, 2);

  state = await harness.manager.next(created.queue.queueId, { revision: state.queue.revision });
  assert.equal(state.queue.currentIndex, 2);
  assert.equal(state.queue.playbackState, 'playing');

  state = await harness.manager.previous(created.queue.queueId, { revision: state.queue.revision });
  assert.equal(state.queue.currentIndex, 1);
  assert.equal(state.queue.playbackState, 'playing');

  state = await harness.manager.stop(created.queue.queueId, { revision: state.queue.revision });
  assert.equal(state.queue.playbackState, 'stopped');
  assert.equal(state.queue.sessionId, '');
  assert.equal(harness.actions.filter((entry) => entry.action === 'play').length, 5);
});

test('repeated Play Now on the current item reuses the active session', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1]);
  const first = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });
  const second = await harness.manager.play(created.queue.queueId, { revision: first.queue.revision });

  assert.equal(second.queue.sessionId, first.queue.sessionId);
  assert.equal(second.queue.playbackState, 'playing');
  assert.equal(harness.actions.filter((entry) => entry.action === 'select').length, 1);
  assert.equal(harness.actions.filter((entry) => entry.action === 'takeover').length, 0);
});

test('active item cannot be removed, while clear stops the owned session before emptying the queue', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2]);
  const playing = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });
  const currentId = playing.queue.items[0].id;

  await assert.rejects(
    () => harness.manager.removeItem(created.queue.queueId, currentId, { revision: playing.queue.revision }),
    (error) => error.code === 'UPNP_QUEUE_CURRENT_ITEM_ACTIVE',
  );

  const cleared = await harness.manager.clear(created.queue.queueId, { revision: playing.queue.revision });
  assert.equal(cleared.queue.items.length, 0);
  assert.equal(cleared.queue.currentIndex, -1);
  assert.equal(cleared.queue.playbackState, 'stopped');
  assert.equal(harness.actions.at(-1).action, 'stop');
});

test('tick advances exactly once after a confirmed end-of-track observation', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2]);
  const playing = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });

  const session = harness.getSession();
  session.state = 'stopped';
  session.ownsAudio = false;
  session.transport.state = 'STOPPED';
  session.transport.relativeTime = session.transport.trackDuration;

  const advanced = await harness.manager.tick();
  assert.equal(advanced.queue.currentIndex, 1);
  assert.equal(advanced.queue.playbackState, 'playing');
  assert.equal(advanced.queue.currentItemId, advanced.queue.items[1].id);
  assert.equal(harness.actions.filter((entry) => entry.action === 'select').length, 2);

  const stable = await harness.manager.tick();
  assert.equal(stable.queue.currentIndex, 1);
  assert.equal(harness.actions.filter((entry) => entry.action === 'select').length, 2);
});

test('feature-flagged gapless preparation commits the renderer transition exactly once', async () => {
  const harness = makeHarness({ gaplessEnabled: true });
  const created = await createQueue(harness, [1, 2]);
  const playing = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });

  const session = harness.getSession();
  session.transport.relativeTime = '00:02:55';
  const armed = await harness.manager.tick();
  assert.equal(armed.queue.currentIndex, 0);
  assert.equal(armed.queue.playbackState, 'playing');
  assert.deepEqual(harness.actions.map((entry) => entry.action), [
    'select',
    'load',
    'play',
    'prepareNext',
  ]);

  session.transitionedNext = true;
  session.transport.relativeTime = '00:00:01';
  const advanced = await harness.manager.tick();
  assert.equal(advanced.queue.currentIndex, 1);
  assert.equal(advanced.queue.currentItemId, advanced.queue.items[1].id);
  assert.equal(advanced.queue.playbackState, 'playing');
  assert.deepEqual(harness.actions.map((entry) => entry.action), [
    'select',
    'load',
    'play',
    'prepareNext',
    'commitPreparedNext',
  ]);

  const stable = await harness.manager.tick();
  assert.equal(stable.queue.currentIndex, 1);
  assert.equal(harness.actions.filter((entry) => entry.action === 'commitPreparedNext').length, 1);
});

test('queue edits clear an armed next resource before changing the logical revision', async () => {
  const harness = makeHarness({ gaplessEnabled: true });
  const created = await createQueue(harness, [1, 2]);
  const playing = await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });
  harness.getSession().transport.relativeTime = '00:02:55';
  await harness.manager.tick();

  const added = await harness.manager.addItems(created.queue.queueId, {
    itemRefs: ['fixture-selection-reference-3'],
    revision: playing.queue.revision,
  });
  assert.equal(added.queue.items.length, 3);
  assert.equal(harness.actions.at(-1).action, 'clearPreparedNext');
});

test('tick fails closed when the renderer session is taken over externally', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2]);
  await harness.manager.play(created.queue.queueId, { revision: created.queue.revision });

  harness.setSession({
    sessionId: 'external-session-0000000000000000',
    generation: 'external-generation',
    rendererId: RENDERER_ID,
    item: makeItem(4),
    state: 'playing',
    ownsAudio: true,
    lastError: '',
    transport: { state: 'PLAYING', relativeTime: '00:00:01', trackDuration: '00:03:00' },
  });

  const observed = await harness.manager.tick();
  assert.equal(observed.queue.playbackState, 'ownership-lost');
  assert.equal(observed.queue.sessionId, '');
  assert.equal(observed.queue.currentIndex, 0);
});

test('takeover is a separately confirmed queue operation with revision and generation checks', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2, 3]);

  await assert.rejects(
    () => harness.manager.takeover(created.queue.queueId, { revision: created.queue.revision }),
    (error) => error.code === 'UPNP_TAKEOVER_CONFIRMATION_REQUIRED',
  );
  await assert.rejects(
    () => harness.manager.takeover(created.queue.queueId, {
      revision: created.queue.revision - 1,
      confirmed: true,
    }),
    (error) => error.code === 'UPNP_QUEUE_REVISION_CONFLICT',
  );

  const taken = await harness.manager.takeover(created.queue.queueId, {
    index: 1,
    revision: created.queue.revision,
    confirmed: true,
  });
  assert.equal(taken.queue.currentIndex, 1);
  assert.equal(taken.queue.playbackState, 'playing');
  assert.equal(taken.queue.revision, created.queue.revision + 1);
  assert.equal(taken.takeover.stoppedRenderer, true);
  assert.equal(harness.actions.at(-1).action, 'takeover');

  await assert.rejects(
    () => harness.manager.takeover(taken.queue.queueId, {
      revision: taken.queue.revision,
      sessionGeneration: 'stale-generation',
      confirmed: true,
    }),
    (error) => error.code === 'UPNP_SESSION_GENERATION_CONFLICT',
  );
});

test('concurrent takeover requests serialize and the stale one cannot take over', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1, 2, 3]);
  const initialRevision = created.queue.revision;

  const first = harness.manager.takeover(created.queue.queueId, {
    index: 1,
    revision: initialRevision,
    confirmed: true,
  });
  const second = harness.manager.takeover(created.queue.queueId, {
    index: 2,
    revision: initialRevision,
    confirmed: true,
  });

  const taken = await first;
  assert.equal(taken.queue.currentIndex, 1);
  await assert.rejects(
    () => second,
    (error) => error.code === 'UPNP_QUEUE_REVISION_CONFLICT',
  );
  assert.equal(harness.actions.filter((entry) => entry.action === 'takeover').length, 1);
  assert.equal(harness.manager.state(created.queue.queueId).queue.currentIndex, 1);
});

test('ordinary queue play still delegates to the normal ownership gate', async () => {
  const harness = makeHarness();
  const created = await createQueue(harness, [1]);
  let takeoverCalls = 0;
  harness.playbackSession.takeover = async () => {
    takeoverCalls += 1;
    throw new Error('takeover must not be used by ordinary play');
  };
  harness.playbackSession.select = async () => {
    throw new UpnpError('Fixture MPD is active', { code: 'UPNP_MPD_ACTIVE', status: 409 });
  };

  await assert.rejects(
    () => harness.manager.play(created.queue.queueId, { revision: created.queue.revision }),
    (error) => error.code === 'UPNP_MPD_ACTIVE',
  );
  assert.equal(takeoverCalls, 0);
  assert.equal(harness.manager.state(created.queue.queueId).queue.playbackState, 'stopped');
});
