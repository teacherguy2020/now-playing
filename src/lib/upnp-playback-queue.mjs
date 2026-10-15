import { randomBytes } from 'node:crypto';

import { UpnpError } from './upnp-control-point.mjs';

const QUEUE_ID_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;
const QUEUE_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_QUEUE_ITEMS = 500;
const MAX_ADD_ITEMS = 100;

const ACTIVE_QUEUE_STATES = new Set(['loaded', 'playing', 'paused']);
const DEFAULT_GAPLESS_PREPARE_LEAD_SECONDS = 8;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function id(bytes = 18) {
  return randomBytes(bytes).toString('base64url');
}

function boundedString(value, max = 2048) {
  return String(value || '').trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDuration(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(seconds) ? seconds : null;
}

function publicResource(resource) {
  if (!resource) return null;
  return {
    protocolInfo: boundedString(resource.protocolInfo, 1024),
    mimeType: boundedString(resource.mimeType, 256),
    duration: boundedString(resource.duration, 64),
    durationSeconds: numberOrNull(resource.durationSeconds),
    bitrate: numberOrNull(resource.bitrate),
    sampleFrequency: numberOrNull(resource.sampleFrequency),
    bitsPerSample: numberOrNull(resource.bitsPerSample),
    audioChannels: numberOrNull(resource.audioChannels),
    resolution: boundedString(resource.resolution, 128),
  };
}

function queueItemFromTrusted(item) {
  if (!item || item.kind !== 'item' || !item.id || !item.mediaServerId || !item.selectionRef) {
    throw new UpnpError('A trusted UPnP audio item is required', {
      code: 'UPNP_INVALID_MEDIA_ITEM',
      status: 400,
    });
  }
  const resource = (Array.isArray(item.resources) ? item.resources : [])
    .find((candidate) => String(candidate?.mimeType || '').toLowerCase().startsWith('audio/'));
  if (!resource?.uri || !resource.protocolInfo || !resource.mimeType) {
    throw new UpnpError('The UPnP item has no usable audio resource', {
      code: 'UPNP_INVALID_MEDIA_ITEM',
      status: 409,
    });
  }

  // Do not retain the resource URI. UPnP resource URLs may contain expiring
  // tokens; the opaque selection reference is revalidated at playback time.
  return {
    id: id(),
    selectionRef: boundedString(item.selectionRef, 256),
    mediaServerId: boundedString(item.mediaServerId, 256),
    mediaItemId: boundedString(item.id, 1024),
    parentId: boundedString(item.parentId, 1024),
    title: boundedString(item.title, 512),
    creator: boundedString(item.creator, 512),
    artist: boundedString(item.artist, 512),
    albumArtist: boundedString(item.albumArtist, 512),
    album: boundedString(item.album, 512),
    trackNumber: Number.isSafeInteger(item.trackNumber) ? item.trackNumber : null,
    class: boundedString(item.class, 256),
    artworkUrl: boundedString(item.artworkUrl, 2048),
    duration: boundedString(item.duration || resource.duration, 64),
    durationSeconds: numberOrNull(item.durationSeconds ?? resource.durationSeconds),
    resource: publicResource(resource),
  };
}

function publicItem(item) {
  return clone(item);
}

function parseRevision(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function sessionState(snapshot) {
  return String(snapshot?.state || '').trim().toLowerCase();
}

function transportState(snapshot) {
  return String(snapshot?.transport?.state || '').trim().toUpperCase();
}

function currentItem(queue) {
  if (!queue || !Number.isSafeInteger(queue.currentIndex) || queue.currentIndex < 0) return null;
  return queue.items[queue.currentIndex] || null;
}

function queueSnapshot(queue) {
  if (!queue) return { active: false, queue: null };
  return {
    active: Boolean(queue.sessionId && ACTIVE_QUEUE_STATES.has(queue.playbackState)),
    queue: {
      queueId: queue.queueId,
      revision: queue.revision,
      rendererId: queue.rendererId,
      items: queue.items.map(publicItem),
      currentIndex: queue.currentIndex,
      currentItemId: currentItem(queue)?.id || '',
      sessionId: queue.sessionId || '',
      sessionGeneration: queue.sessionGeneration || '',
      playbackState: queue.playbackState,
      lastConfirmedRendererState: queue.lastConfirmedRendererState,
      lastError: queue.lastError,
      persistence: 'memory',
    },
  };
}

export class UpnpPlaybackQueueManager {
  constructor({
    controlPoint,
    playbackSession,
    now = () => Date.now(),
    maxItems = MAX_QUEUE_ITEMS,
    gaplessEnabled = process.env.UPNP_GAPLESS_ENABLED === '1',
    gaplessPrepareLeadSeconds = process.env.UPNP_GAPLESS_PREPARE_LEAD_SECONDS
      || DEFAULT_GAPLESS_PREPARE_LEAD_SECONDS,
    log = console,
  } = {}) {
    if (!controlPoint) throw new Error('UPnP playback queues require a control point');
    if (!playbackSession) throw new Error('UPnP playback queues require a playback session manager');
    this.controlPoint = controlPoint;
    this.playbackSession = playbackSession;
    this.now = now;
    this.maxItems = Math.max(1, Math.min(MAX_QUEUE_ITEMS, Number(maxItems) || MAX_QUEUE_ITEMS));
    this.gaplessEnabled = gaplessEnabled === true || gaplessEnabled === '1';
    this.gaplessPrepareLeadSeconds = Math.max(
      1,
      Math.min(60, Number(gaplessPrepareLeadSeconds) || DEFAULT_GAPLESS_PREPARE_LEAD_SECONDS),
    );
    this.log = log;
    this.queue = null;
    this.mutation = Promise.resolve();
  }

  async _withMutationLock(fn) {
    const previous = this.mutation;
    let release;
    this.mutation = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  _assertQueue(queueId) {
    const key = String(queueId || '').trim();
    if (!QUEUE_ID_PATTERN.test(key) || !this.queue || this.queue.queueId !== key) {
      throw new UpnpError('UPnP queue is unknown or stale', {
        code: 'UPNP_QUEUE_STALE',
        status: 409,
      });
    }
    return this.queue;
  }

  _assertRevision(queue, revision) {
    const expected = parseRevision(revision);
    if (expected === null) {
      throw new UpnpError('A queue revision is required', {
        code: 'UPNP_QUEUE_REVISION_REQUIRED',
        status: 428,
      });
    }
    if (expected !== queue.revision) {
      throw new UpnpError('UPnP queue revision is stale', {
        code: 'UPNP_QUEUE_REVISION_CONFLICT',
        status: 409,
        details: { currentRevision: queue.revision },
      });
    }
  }

  _assertSessionGeneration(queue, generation) {
    const expected = generation == null ? '' : String(generation).trim();
    if (expected !== String(queue.sessionGeneration || '')) {
      throw new UpnpError('UPnP playback session generation is stale', {
        code: 'UPNP_SESSION_GENERATION_CONFLICT',
        status: 409,
        details: { currentGeneration: String(queue.sessionGeneration || '') },
      });
    }
  }

  _bumpRevision(queue) {
    queue.revision += 1;
    queue.updatedAt = this.now();
    queue.gaplessAttempted = null;
  }

  async _invalidatePreparedNext(queue) {
    if (!queue?.preparedNext) return;
    if (typeof this.playbackSession.clearPreparedNext !== 'function') {
      throw new UpnpError('Prepared next-track state cannot be invalidated safely', {
        code: 'UPNP_NEXT_UNSAFE',
        status: 409,
      });
    }
    await this.playbackSession.clearPreparedNext(queue.sessionId);
    queue.preparedNext = null;
  }

  _trustedQueueItems(itemRefs) {
    const refs = Array.isArray(itemRefs)
      ? itemRefs
      : (itemRefs == null ? [] : [itemRefs]);
    if (refs.length > MAX_ADD_ITEMS) {
      throw new UpnpError(`At most ${MAX_ADD_ITEMS} UPnP items may be added at once`, {
        code: 'UPNP_QUEUE_TOO_LARGE',
        status: 413,
      });
    }
    return refs.map((ref) => queueItemFromTrusted(this.controlPoint.getTrustedMediaItem(ref)));
  }

  _sessionSnapshot() {
    return typeof this.playbackSession.snapshot === 'function'
      ? this.playbackSession.snapshot()
      : { active: false, session: null };
  }

  _assertNoForeignSession(queue) {
    const session = this._sessionSnapshot();
    if (!session?.sessionId || session.sessionId === queue.sessionId) return;
    if (!['stopped', 'ownership-lost', 'renderer-unavailable'].includes(session.state)) {
      throw new UpnpError('Another UPnP playback session is active', {
        code: 'UPNP_SESSION_ACTIVE',
        status: 409,
      });
    }
  }

  async create({ rendererId, itemRefs = [] } = {}) {
    return this._withMutationLock(async () => {
      if (this.queue) {
        throw new UpnpError('An UPnP queue already exists', {
          code: 'UPNP_QUEUE_EXISTS',
          status: 409,
        });
      }
      const renderer = boundedString(rendererId, 256);
      if (!renderer) {
        throw new UpnpError('An approved renderer ID is required', {
          code: 'UPNP_BAD_REQUEST',
          status: 400,
        });
      }
      if (typeof this.playbackSession.approvedRendererCapabilities !== 'function') {
        throw new UpnpError('UPnP renderer approval cannot be validated safely', {
          code: 'UPNP_OWNERSHIP_UNCERTAIN',
          status: 409,
        });
      }
      // Queue creation is the point where the renderer becomes the queue's
      // target, but it does not take ownership of audio. Validate the trusted
      // renderer here; MPD/Qobuz/transport ownership gates remain on play.
      await this.playbackSession.approvedRendererCapabilities({ rendererId: renderer });
      const items = this._trustedQueueItems(itemRefs);
      if (items.length > this.maxItems) {
        throw new UpnpError('UPnP queue exceeds its bounded item limit', {
          code: 'UPNP_QUEUE_TOO_LARGE',
          status: 413,
        });
      }
      this.queue = {
        queueId: id(),
        revision: items.length ? 1 : 0,
        rendererId: renderer,
        items,
        currentIndex: -1,
        sessionId: '',
        sessionGeneration: '',
        playbackState: 'stopped',
        lastConfirmedRendererState: '',
        lastError: '',
        createdAt: this.now(),
        updatedAt: this.now(),
        preparedNext: null,
        gaplessAttempted: null,
      };
      return queueSnapshot(this.queue);
    });
  }

  state(queueId) {
    const queue = this._assertQueue(queueId);
    return queueSnapshot(queue);
  }

  /**
   * Read the current logical queue without requiring the browser to know its
   * process-local queue ID first. This is intentionally read-only; a restart
   * returns the same empty snapshot as any other queue read after ownership
   * has been released.
   */
  currentState() {
    return queueSnapshot(this.queue);
  }

  async addItems(queueId, { itemRefs = [], revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const items = this._trustedQueueItems(itemRefs);
      if (!items.length) {
        throw new UpnpError('At least one trusted UPnP item is required', {
          code: 'UPNP_BAD_REQUEST',
          status: 400,
        });
      }
      if (queue.items.length + items.length > this.maxItems) {
        throw new UpnpError('UPnP queue exceeds its bounded item limit', {
          code: 'UPNP_QUEUE_TOO_LARGE',
          status: 413,
        });
      }
      await this._invalidatePreparedNext(queue);
      queue.items.push(...items);
      this._bumpRevision(queue);
      return queueSnapshot(queue);
    });
  }

  async removeItem(queueId, itemId, { revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const key = String(itemId || '').trim();
      if (!QUEUE_ITEM_ID_PATTERN.test(key)) {
        throw new UpnpError('A valid UPnP queue item ID is required', {
          code: 'UPNP_BAD_REQUEST',
          status: 400,
        });
      }
      const index = queue.items.findIndex((item) => item.id === key);
      if (index < 0) {
        throw new UpnpError('UPnP queue item was not found', {
          code: 'UPNP_QUEUE_ITEM_NOT_FOUND',
          status: 404,
        });
      }
      if (index === queue.currentIndex && ACTIVE_QUEUE_STATES.has(queue.playbackState)) {
        throw new UpnpError('The active UPnP queue item must be stopped before removal', {
          code: 'UPNP_QUEUE_CURRENT_ITEM_ACTIVE',
          status: 409,
        });
      }
      await this._invalidatePreparedNext(queue);
      queue.items.splice(index, 1);
      if (!queue.items.length) queue.currentIndex = -1;
      else if (queue.currentIndex > index) queue.currentIndex -= 1;
      else if (queue.currentIndex === index) queue.currentIndex = Math.min(index, queue.items.length - 1);
      this._bumpRevision(queue);
      return queueSnapshot(queue);
    });
  }

  async clear(queueId, { revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      await this._stopSessionUnlocked(queue);
      queue.items = [];
      queue.currentIndex = -1;
      queue.playbackState = 'stopped';
      queue.lastError = '';
      this._bumpRevision(queue);
      return queueSnapshot(queue);
    });
  }

  async reorder(queueId, { itemId, toIndex, revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const key = String(itemId || '').trim();
      const target = Number(toIndex);
      if (!QUEUE_ITEM_ID_PATTERN.test(key) || !Number.isSafeInteger(target)) {
        throw new UpnpError('A queue item ID and integer destination index are required', {
          code: 'UPNP_BAD_REQUEST',
          status: 400,
        });
      }
      const from = queue.items.findIndex((item) => item.id === key);
      if (from < 0 || target < 0 || target >= queue.items.length) {
        throw new UpnpError('UPnP queue reorder target is invalid', {
          code: 'UPNP_QUEUE_ITEM_NOT_FOUND',
          status: 404,
        });
      }
      await this._invalidatePreparedNext(queue);
      const currentId = currentItem(queue)?.id || '';
      const [item] = queue.items.splice(from, 1);
      queue.items.splice(target, 0, item);
      queue.currentIndex = currentId
        ? queue.items.findIndex((candidate) => candidate.id === currentId)
        : queue.currentIndex;
      this._bumpRevision(queue);
      return queueSnapshot(queue);
    });
  }

  _targetIndex(queue, { itemId, index } = {}) {
    if (itemId != null && itemId !== '') {
      const key = String(itemId).trim();
      const found = queue.items.findIndex((item) => item.id === key);
      if (found < 0) {
        throw new UpnpError('UPnP queue item was not found', {
          code: 'UPNP_QUEUE_ITEM_NOT_FOUND',
          status: 404,
        });
      }
      return found;
    }
    if (index != null && index !== '') {
      const parsed = Number(index);
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= queue.items.length) {
        throw new UpnpError('UPnP queue index is invalid', {
          code: 'UPNP_BAD_REQUEST',
          status: 400,
        });
      }
      return parsed;
    }
    if (Number.isSafeInteger(queue.currentIndex) && queue.currentIndex >= 0 && queue.currentIndex < queue.items.length) {
      return queue.currentIndex;
    }
    if (queue.items.length) return 0;
    throw new UpnpError('UPnP queue is empty', {
      code: 'UPNP_QUEUE_EMPTY',
      status: 409,
    });
  }

  _rememberSession(queue, result, playbackState = null) {
    queue.sessionId = String(result?.sessionId || queue.sessionId || '');
    queue.sessionGeneration = String(result?.generation || queue.sessionGeneration || '');
    queue.lastConfirmedRendererState = transportState(result);
    if (playbackState) queue.playbackState = playbackState;
    queue.lastError = String(result?.lastError || '');
  }

  async _stopSessionUnlocked(queue) {
    if (!queue.sessionId) {
      queue.playbackState = 'stopped';
      return null;
    }
    const result = await this.playbackSession.stop(queue.sessionId);
    queue.preparedNext = null;
    queue.lastConfirmedRendererState = transportState(result);
    queue.playbackState = 'stopped';
    queue.sessionId = '';
    queue.sessionGeneration = '';
    queue.lastError = '';
    return result;
  }

  async _playCurrentUnlocked(queue) {
    const item = currentItem(queue);
    if (!item) {
      throw new UpnpError('UPnP queue is empty', { code: 'UPNP_QUEUE_EMPTY', status: 409 });
    }
    this._assertNoForeignSession(queue);
    queue.lastError = '';

    if (queue.sessionId) {
      const existing = this._sessionSnapshot();
      const sameItem = existing.sessionId === queue.sessionId
        && String(existing.item?.selectionRef || '') === item.selectionRef
        && String(existing.item?.mediaServerId || '') === item.mediaServerId
        && String(existing.item?.id || '') === item.mediaItemId;
      if (sameItem && sessionState(existing) === 'playing') {
        queue.lastConfirmedRendererState = transportState(existing);
        queue.playbackState = 'playing';
        queue.lastError = '';
        return existing;
      }
      if (sameItem && ['loaded', 'paused'].includes(sessionState(existing))) {
        const played = await this.playbackSession.play(queue.sessionId);
        this._rememberSession(queue, played, 'playing');
        return played;
      }
      await this._stopSessionUnlocked(queue);
    }

    const selected = await this.playbackSession.select({
      itemRef: item.selectionRef,
      rendererId: queue.rendererId,
    });
    const loaded = await this.playbackSession.load(selected.sessionId);
    const played = await this.playbackSession.play(selected.sessionId);
    this._rememberSession(queue, played, 'playing');
    queue.sessionId = String(played.sessionId || loaded.sessionId || selected.sessionId || '');
    queue.sessionGeneration = String(played.generation || loaded.generation || selected.generation || '');
    return played;
  }

  async play(queueId, { itemId, index, revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const target = this._targetIndex(queue, { itemId, index });
      if (target !== queue.currentIndex) {
        await this._invalidatePreparedNext(queue);
        queue.currentIndex = target;
        this._bumpRevision(queue);
      }
      const result = await this._playCurrentUnlocked(queue);
      return { ...queueSnapshot(queue), playback: clone(result) };
    });
  }

  async takeover(queueId, {
    itemId,
    index,
    revision,
    sessionGeneration,
    confirmed = false,
  } = {}) {
    return this._withMutationLock(async () => {
      if (confirmed !== true) {
        throw new UpnpError('Explicit takeover confirmation is required', {
          code: 'UPNP_TAKEOVER_CONFIRMATION_REQUIRED',
          status: 400,
        });
      }
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      this._assertSessionGeneration(queue, sessionGeneration);
      const target = this._targetIndex(queue, { itemId, index });
      const item = queue.items[target];

      await this._invalidatePreparedNext(queue);

      try {
        const playback = await this.playbackSession.takeover({
          itemRef: item.selectionRef,
          rendererId: queue.rendererId,
          confirmed: true,
        });
        if (target !== queue.currentIndex) {
          queue.currentIndex = target;
          this._bumpRevision(queue);
        }
        this._rememberSession(queue, playback, 'playing');
        return {
          ...queueSnapshot(queue),
          playback: clone(playback),
          takeover: playback?.takeover ? clone(playback.takeover) : { confirmed: true },
        };
      } catch (error) {
        // A failed explicit takeover may have released an external owner even
        // though it did not establish a Sonuvi session. Do not leave a stale
        // queue session handle that ordinary play would try to reuse.
        if (['UPNP_TAKEOVER_STOP_FAILED', 'UPNP_TAKEOVER_STATE_CHANGED', 'UPNP_TAKEOVER_START_FAILED']
          .includes(error?.code)) {
          const observed = this._sessionSnapshot();
          if (!observed?.active) {
            queue.sessionId = '';
            queue.sessionGeneration = '';
            queue.playbackState = 'stopped';
          }
          queue.lastError = String(error.code || 'UPNP_TAKEOVER_FAILED');
        }
        throw error;
      }
    });
  }

  async pause(queueId, { revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      if (!queue.sessionId || queue.playbackState !== 'playing') {
        throw new UpnpError('UPnP queue is not playing', { code: 'UPNP_QUEUE_BAD_STATE', status: 409 });
      }
      const result = await this.playbackSession.pause(queue.sessionId);
      this._rememberSession(queue, result, 'paused');
      return { ...queueSnapshot(queue), playback: clone(result) };
    });
  }

  async resume(queueId, { revision } = {}) {
    return this.play(queueId, { revision });
  }

  async stop(queueId, { revision } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const result = await this._stopSessionUnlocked(queue);
      return { ...queueSnapshot(queue), playback: clone(result) };
    });
  }

  async _move(queue, direction, { autoplay = true } = {}) {
    const target = queue.currentIndex < 0
      ? (direction > 0 ? 0 : -1)
      : queue.currentIndex + direction;
    if (target < 0 || target >= queue.items.length) {
      await this._stopSessionUnlocked(queue);
      queue.playbackState = 'stopped';
      return null;
    }
    await this._stopSessionUnlocked(queue);
    queue.currentIndex = target;
    this._bumpRevision(queue);
    if (!autoplay) {
      queue.playbackState = 'stopped';
      return null;
    }
    return this._playCurrentUnlocked(queue);
  }

  async next(queueId, { revision, autoplay = true } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      const playback = await this._move(queue, 1, { autoplay: autoplay !== false });
      return { ...queueSnapshot(queue), playback: clone(playback) };
    });
  }

  async previous(queueId, { revision, autoplay = true } = {}) {
    return this._withMutationLock(async () => {
      const queue = this._assertQueue(queueId);
      this._assertRevision(queue, revision);
      if (queue.currentIndex <= 0) {
        await this._stopSessionUnlocked(queue);
        if (queue.items.length) {
          queue.currentIndex = 0;
          this._bumpRevision(queue);
        }
        const playback = autoplay === false ? null : await this._playCurrentUnlocked(queue);
        return { ...queueSnapshot(queue), playback: clone(playback) };
      }
      const playback = await this._move(queue, -1, { autoplay: autoplay !== false });
      return { ...queueSnapshot(queue), playback: clone(playback) };
    });
  }

  _trackComplete(queue, observed) {
    const position = observed?.transport || {};
    const elapsed = parseDuration(position.relativeTime);
    const duration = parseDuration(position.trackDuration) ?? numberOrNull(currentItem(queue)?.durationSeconds);
    return elapsed != null && duration != null && duration > 0 && elapsed >= Math.max(0, duration - 2);
  }

  async _maybePrepareNext(queue, observed) {
    if (!this.gaplessEnabled || queue.preparedNext || !queue.sessionId) return;
    if (queue.currentIndex < 0 || queue.currentIndex + 1 >= queue.items.length) return;
    if (sessionState(observed) !== 'playing') return;

    const current = currentItem(queue);
    const next = queue.items[queue.currentIndex + 1];
    if (!current || !next) return;
    const attemptKey = `${queue.revision}:${queue.currentIndex}:${queue.sessionGeneration}`;
    if (queue.gaplessAttempted === attemptKey) return;

    const elapsed = parseDuration(observed?.transport?.relativeTime);
    const duration = parseDuration(observed?.transport?.trackDuration) ?? numberOrNull(current.durationSeconds);
    if (elapsed == null || duration == null || duration <= 0) return;
    if (duration - elapsed > this.gaplessPrepareLeadSeconds) return;

    queue.gaplessAttempted = attemptKey;
    try {
      const result = await this.playbackSession.prepareNext(queue.sessionId, {
        itemRef: next.selectionRef,
        queueRevision: queue.revision,
        sessionGeneration: queue.sessionGeneration,
        currentItemId: current.mediaItemId,
      });
      if (!result?.armed || String(result.nextItemId || '') !== String(next.mediaItemId || '')) {
        throw new UpnpError('Renderer preparation did not return the expected next queue item', {
          code: 'UPNP_NEXT_UNSAFE',
          status: 409,
        });
      }
      queue.preparedNext = {
        sessionId: queue.sessionId,
        sessionGeneration: queue.sessionGeneration,
        queueRevision: queue.revision,
        currentItemId: current.mediaItemId,
        nextItemId: next.mediaItemId,
      };
      queue.lastError = '';
    } catch (error) {
      // Unsupported or failed preparation leaves ordinary completion-driven
      // advancement in charge. A confirmed-but-unsafe state is still fail
      // closed; it must never be treated as armed.
      queue.preparedNext = null;
      queue.lastError = String(error?.code || 'UPNP_NEXT_PREPARE_FAILED');
      if (['UPNP_NEXT_UNSAFE', 'UPNP_NEXT_CLEAR_UNCONFIRMED'].includes(error?.code)) throw error;
      this.log.warn?.('[upnp] next-track preparation unavailable; using normal advancement', {
        code: queue.lastError,
      });
    }
  }

  async _commitPreparedTransition(queue, observed) {
    const prepared = queue.preparedNext;
    const next = queue.items[queue.currentIndex + 1];
    const current = currentItem(queue);
    if (!prepared || !observed?.transitionedNext || !next || !current
      || prepared.sessionId !== queue.sessionId
      || prepared.sessionGeneration !== queue.sessionGeneration
      || prepared.queueRevision !== queue.revision
      || prepared.currentItemId !== current.mediaItemId
      || prepared.nextItemId !== next.mediaItemId) {
      throw new UpnpError('The renderer transitioned with stale or inconsistent prepared queue state', {
        code: 'UPNP_NEXT_UNSAFE',
        status: 409,
      });
    }
    const committed = await this.playbackSession.commitPreparedNext(queue.sessionId, {
      queueRevision: queue.revision,
      sessionGeneration: queue.sessionGeneration,
      currentItemId: current.mediaItemId,
      nextItemId: next.mediaItemId,
    });
    queue.currentIndex += 1;
    queue.preparedNext = null;
    this._bumpRevision(queue);
    const committedState = sessionState(committed);
    if (committed.ownsAudio && ['playing', 'paused', 'loaded'].includes(committedState)) {
      this._rememberSession(queue, committed, committedState);
    } else {
      queue.playbackState = 'stopped';
      queue.sessionId = '';
      queue.sessionGeneration = '';
    }
    return committed;
  }

  async tick() {
    return this._withMutationLock(async () => {
      const queue = this.queue;
      if (!queue || !queue.sessionId || !ACTIVE_QUEUE_STATES.has(queue.playbackState)) return queueSnapshot(queue);
      const previousState = queue.playbackState;
      let observed;
      try {
        observed = await this.playbackSession.state(queue.sessionId);
      } catch (error) {
        if (['UPNP_OWNERSHIP_LOST', 'UPNP_RENDERER_UNAVAILABLE', 'UPNP_STALE_SESSION'].includes(error?.code)) {
          queue.playbackState = error.code === 'UPNP_RENDERER_UNAVAILABLE' ? 'renderer-unavailable' : 'ownership-lost';
          queue.lastError = error.code;
          queue.sessionId = '';
          queue.sessionGeneration = '';
        }
        return queueSnapshot(queue);
      }

      queue.lastConfirmedRendererState = transportState(observed);
      if (observed.transitionedNext) {
        try {
          await this._commitPreparedTransition(queue, observed);
        } catch (error) {
          queue.playbackState = 'ownership-lost';
          queue.lastError = String(error?.code || 'UPNP_NEXT_UNSAFE');
          queue.sessionId = '';
          queue.sessionGeneration = '';
          queue.preparedNext = null;
        }
        return queueSnapshot(queue);
      }
      if (observed.ownsAudio && ['playing', 'paused', 'loaded'].includes(sessionState(observed))) {
        try {
          await this._maybePrepareNext(queue, observed);
        } catch (error) {
          queue.lastError = String(error?.code || 'UPNP_NEXT_PREPARE_FAILED');
          if (['UPNP_NEXT_UNSAFE', 'UPNP_NEXT_CLEAR_UNCONFIRMED'].includes(error?.code)) {
            try {
              await this._stopSessionUnlocked(queue);
            } catch {}
            queue.playbackState = 'ownership-lost';
            queue.sessionId = '';
            queue.sessionGeneration = '';
            queue.preparedNext = null;
            return queueSnapshot(queue);
          }
        }
        queue.playbackState = sessionState(observed);
        if (!queue.preparedNext && !queue.lastError.startsWith('UPNP_NEXT_')) queue.lastError = '';
        return queueSnapshot(queue);
      }

      if (previousState === 'playing' && sessionState(observed) === 'stopped' && this._trackComplete(queue, observed)) {
        if (queue.preparedNext) {
          try {
            await this.playbackSession.clearPreparedNext(queue.sessionId);
            queue.preparedNext = null;
          } catch (error) {
            queue.playbackState = 'ownership-lost';
            queue.lastError = String(error?.code || 'UPNP_NEXT_UNSAFE');
            queue.sessionId = '';
            queue.sessionGeneration = '';
            queue.preparedNext = null;
            return queueSnapshot(queue);
          }
        }
        if (queue.currentIndex + 1 < queue.items.length) {
          queue.sessionId = '';
          queue.sessionGeneration = '';
          queue.currentIndex += 1;
          this._bumpRevision(queue);
          await this._playCurrentUnlocked(queue);
        } else {
          queue.playbackState = 'stopped';
          queue.sessionId = '';
          queue.sessionGeneration = '';
        }
      } else {
        queue.playbackState = 'stopped';
        queue.sessionId = '';
        queue.sessionGeneration = '';
      }
      return queueSnapshot(queue);
    });
  }
}

export function createUpnpPlaybackQueueManager(options) {
  return new UpnpPlaybackQueueManager(options);
}
