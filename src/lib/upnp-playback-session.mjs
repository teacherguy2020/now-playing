import { createHash, randomBytes } from 'node:crypto';

import {
  UpnpError,
  sameUpnpResourceUri,
} from './upnp-control-point.mjs';

const ACTIVE_TRANSPORT_STATES = new Set([
  'PLAYING',
  'PAUSED_PLAYBACK',
  'TRANSITIONING',
]);

const TAKEOVER_STOPPABLE_TRANSPORT_STATES = new Set([
  'PLAYING',
  'PAUSED_PLAYBACK',
]);

const SESSION_STATES = new Set([
  'selected',
  'loaded',
  'playing',
  'paused',
  'ownership-lost',
  'renderer-unavailable',
  'queue-changed',
  'stopped',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

function parsePosition(value) {
  const seconds = parseDuration(value);
  return seconds == null ? 0 : seconds;
}

function normalizedState(value) {
  return String(value || '').trim().toUpperCase();
}

function stateForNowPlaying(value) {
  const state = normalizedState(value);
  if (state === 'PLAYING') return 'play';
  if (state === 'PAUSED_PLAYBACK') return 'pause';
  if (state === 'STOPPED' || state === 'NO_MEDIA_PRESENT') return 'stop';
  return state ? state.toLowerCase() : 'stop';
}

function queueHash(entries) {
  const stable = (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    pos: String(entry?.pos ?? index),
    id: String(entry?.id ?? ''),
    file: String(entry?.file ?? ''),
    title: String(entry?.title ?? ''),
    artist: String(entry?.artist ?? ''),
    album: String(entry?.album ?? ''),
  }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function normalizeQueue(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    pos: String(entry?.pos ?? index),
    id: String(entry?.id ?? ''),
    file: String(entry?.file ?? ''),
    title: String(entry?.title ?? ''),
    artist: String(entry?.artist ?? ''),
    album: String(entry?.album ?? ''),
  }));
}

function publicResource(resource) {
  if (!resource) return null;
  return {
    protocolInfo: String(resource.protocolInfo || ''),
    mimeType: String(resource.mimeType || ''),
    duration: String(resource.duration || ''),
    durationSeconds: numberOrNull(resource.durationSeconds),
    size: numberOrNull(resource.size),
    bitrate: numberOrNull(resource.bitrate),
    sampleFrequency: numberOrNull(resource.sampleFrequency),
    bitsPerSample: numberOrNull(resource.bitsPerSample),
    audioChannels: numberOrNull(resource.audioChannels),
    resolution: String(resource.resolution || ''),
  };
}

function publicItem(item, resource) {
  return {
    selectionRef: String(item?.selectionRef || ''),
    mediaServerId: String(item?.mediaServerId || ''),
    id: String(item?.id || ''),
    parentId: String(item?.parentId || ''),
    title: String(item?.title || ''),
    creator: String(item?.creator || ''),
    artist: String(item?.artist || ''),
    albumArtist: String(item?.albumArtist || ''),
    album: String(item?.album || ''),
    trackNumber: Number.isSafeInteger(item?.trackNumber) ? item.trackNumber : null,
    class: String(item?.class || ''),
    artworkUrl: String(item?.artworkUrl || ''),
    duration: String(item?.duration || resource?.duration || ''),
    durationSeconds: numberOrNull(item?.durationSeconds ?? resource?.durationSeconds),
    resource: publicResource(resource),
  };
}

function serviceHasAction(inspection, action) {
  const wanted = String(action || '').toLowerCase();
  const service = (inspection?.services || []).find((entry) => String(entry?.serviceType || '').toLowerCase().includes(':avtransport:'));
  return (service?.actions || []).some((name) => String(name).toLowerCase() === wanted);
}

function currentActionsAllow(inspection, action) {
  const current = inspection?.readOnlyState?.currentActions;
  if (!Array.isArray(current) || current.length === 0) return serviceHasAction(inspection, action);
  return current.some((name) => String(name).toLowerCase() === String(action).toLowerCase());
}

function currentTransport(inspection) {
  return normalizedState(inspection?.readOnlyState?.transport?.state);
}

export class UpnpPlaybackSessionManager {
  constructor({
    controlPoint,
    readMpdSnapshot,
    getQobuzState,
    stopMpd,
    expectedRendererHost = process.env.UPNP_MOODE_RENDERER_HOST || '10.0.0.254',
    now = () => Date.now(),
    sessionTtlMs = 30 * 60 * 1000,
    log = console,
  } = {}) {
    if (!controlPoint) throw new Error('UPnP playback sessions require a control point');
    this.controlPoint = controlPoint;
    this.readMpdSnapshot = typeof readMpdSnapshot === 'function'
      ? readMpdSnapshot
      : async () => ({ status: {}, song: {}, queue: [] });
    this.getQobuzState = typeof getQobuzState === 'function'
      ? getQobuzState
      : async () => ({ active: false, suppressMpdHistory: false });
    this.stopMpd = typeof stopMpd === 'function' ? stopMpd : null;
    this.expectedRendererHost = expectedRendererHost;
    this.now = now;
    this.sessionTtlMs = Math.max(60_000, Number(sessionTtlMs) || 30 * 60 * 1000);
    this.log = log;
    this.session = null;
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

  _assertSession(sessionId, { allowStopped = false } = {}) {
    const key = String(sessionId || '').trim();
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(key) || !this.session || this.session.id !== key) {
      throw new UpnpError('UPnP playback session is unknown or stale', {
        code: 'UPNP_STALE_SESSION',
        status: 409,
      });
    }
    if (this.session.expiresAt <= this.now()) {
      this.session.state = 'ownership-lost';
      this.session.ownsAudio = false;
      throw new UpnpError('UPnP playback session expired', {
        code: 'UPNP_STALE_SESSION',
        status: 409,
      });
    }
    if (!allowStopped && ['stopped', 'ownership-lost', 'renderer-unavailable'].includes(this.session.state)) {
      throw new UpnpError('UPnP playback session no longer owns the renderer', {
        code: 'UPNP_OWNERSHIP_LOST',
        status: 409,
      });
    }
    return this.session;
  }

  async _readQueueBaseline() {
    let snapshot;
    try {
      snapshot = await this.readMpdSnapshot();
    } catch (error) {
      throw new UpnpError('MPD state could not be read safely', {
        code: 'UPNP_MPD_UNAVAILABLE',
        status: 503,
        cause: error,
      });
    }
    const status = snapshot?.status && typeof snapshot.status === 'object' ? snapshot.status : {};
    const song = snapshot?.song && typeof snapshot.song === 'object' ? snapshot.song : {};
    const queue = normalizeQueue(snapshot?.queue);
    return {
      state: String(status.state || '').trim().toLowerCase(),
      currentSong: clone(song),
      playlistLength: Number(status.playlistlength ?? queue.length) || 0,
      playlistVersion: String(status.playlist || ''),
      songIndex: String(status.song ?? ''),
      songId: String(status.songid ?? ''),
      queue,
      queueHash: queueHash(queue),
      capturedAt: new Date(this.now()).toISOString(),
    };
  }

  async _readQobuzState() {
    let qobuz;
    try {
      qobuz = await this.getQobuzState();
    } catch (error) {
      throw new UpnpError('Qobuz ownership could not be established safely', {
        code: 'UPNP_OWNERSHIP_UNCERTAIN',
        status: 409,
        cause: error,
      });
    }
    return qobuz || { active: false, suppressMpdHistory: false };
  }

  async _qobuzGate() {
    const qobuz = await this._readQobuzState();
    if (qobuz?.active || qobuz?.suppressMpdHistory) {
      throw new UpnpError('Qobuz Connect currently owns or may own the renderer', {
        code: 'UPNP_QOBUZ_ACTIVE',
        status: 409,
      });
    }
    return qobuz;
  }

  async preflight({ rendererId } = {}) {
    const id = String(rendererId || '').trim();
    if (!id) {
      throw new UpnpError('An approved renderer ID is required', { code: 'UPNP_BAD_REQUEST', status: 400 });
    }
    const [qobuz, mpd, renderer] = await Promise.all([
      this._qobuzGate(),
      this._readQueueBaseline(),
      this.controlPoint.rendererPlaybackCapabilities(id, { expectedHost: this.expectedRendererHost }),
    ]);
    const mpdState = String(mpd.state || '').toLowerCase();
    if (mpdState === 'play' || mpdState === 'pause') {
      throw new UpnpError('MPD is active; UPnP playback takeover was rejected', {
        code: 'UPNP_MPD_ACTIVE',
        status: 409,
      });
    }
    const transportState = currentTransport(renderer.inspection);
    const currentUri = String(renderer.inspection?.readOnlyState?.media?.currentUri || '').trim();
    if (ACTIVE_TRANSPORT_STATES.has(transportState)) {
      throw new UpnpError('The approved renderer is actively playing or transitioning', {
        code: 'UPNP_RENDERER_ACTIVE',
        status: 409,
      });
    }
    if (transportState === 'ERROR' || !['STOPPED', 'NO_MEDIA_PRESENT', ''].includes(transportState)) {
      throw new UpnpError('Renderer transport ownership is uncertain', {
        code: 'UPNP_OWNERSHIP_UNCERTAIN',
        status: 409,
      });
    }
    return {
      ok: true,
      qobuz: {
        active: Boolean(qobuz?.active),
        suppressMpdHistory: Boolean(qobuz?.suppressMpdHistory),
      },
      mpd,
      renderer: {
        id,
        device: renderer.device,
        transport: renderer.inspection.readOnlyState?.transport || {},
        media: renderer.inspection.readOnlyState?.media || {},
        loadedMedia: Boolean(currentUri),
        currentActions: renderer.inspection.readOnlyState?.currentActions || [],
        protocolInfo: renderer.inspection.protocolInfo,
        avTransportActions: renderer.avTransportActions,
      },
    };
  }

  /**
   * Inspect only the renderer approved for Sonuvi-controlled playback.
   *
   * This deliberately checks the trusted host and renderer capabilities, but
   * does not apply the playback-ownership gates from preflight(). Discovery
   * should still be able to show the approved renderer while another source is
   * active; mutating operations remain gated by preflight().
   */
  async approvedRendererCapabilities({ rendererId } = {}) {
    const id = String(rendererId || '').trim();
    if (!id) {
      throw new UpnpError('An approved renderer ID is required', {
        code: 'UPNP_BAD_REQUEST',
        status: 400,
      });
    }
    return this.controlPoint.rendererPlaybackCapabilities(id, {
      expectedHost: this.expectedRendererHost,
    });
  }

  _assertNoActiveSession({ takeover = false } = {}) {
    if (this.session && !['stopped', 'ownership-lost', 'renderer-unavailable'].includes(this.session.state)) {
      throw new UpnpError(
        takeover
          ? 'Sonuvi already owns an active UPnP playback session'
          : 'Another UPnP playback session is already selected',
        {
          code: takeover ? 'UPNP_TAKEOVER_ACTIVE_SESSION' : 'UPNP_SESSION_ACTIVE',
          status: 409,
        },
      );
    }
  }

  async _selectUnlocked({ itemRef, rendererId, preflight = null, trustedItem = null } = {}) {
    const item = trustedItem || this.controlPoint.getTrustedMediaItem(itemRef);
    const checkedPreflight = preflight || await this.preflight({ rendererId });
    const prepared = await this.controlPoint.prepareMediaItemForPlayback(item, rendererId, {
      expectedRendererHost: this.expectedRendererHost,
    });
    const id = randomBytes(24).toString('base64url');
    const now = this.now();
    this.session = {
      id,
      generation: randomBytes(16).toString('hex'),
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      rendererId: String(rendererId),
      item: prepared.item,
      resource: prepared.resource,
      metadata: prepared.metadata,
      mediaServer: prepared.mediaServer,
      renderer: prepared.renderer.device,
      baseline: checkedPreflight.mpd,
      state: 'selected',
      ownsAudio: false,
      mutationCount: 0,
      queueChanged: false,
      lastInspection: prepared.renderer.inspection,
      lastError: '',
    };
    return this.snapshot();
  }

  async select({ itemRef, rendererId } = {}) {
    return this._withMutationLock(async () => {
      this._assertNoActiveSession();
      return this._selectUnlocked({ itemRef, rendererId });
    });
  }

  async _takeoverPreflight({ rendererId } = {}) {
    const id = String(rendererId || '').trim();
    if (!id) {
      throw new UpnpError('An approved renderer ID is required', {
        code: 'UPNP_BAD_REQUEST',
        status: 400,
      });
    }
    const [qobuz, mpd, renderer] = await Promise.all([
      this._readQobuzState(),
      this._readQueueBaseline(),
      this.controlPoint.rendererPlaybackCapabilities(id, { expectedHost: this.expectedRendererHost }),
    ]);

    if (qobuz?.active || qobuz?.suppressMpdHistory) {
      throw new UpnpError('Qobuz Connect cannot be released by Sonuvi takeover', {
        code: 'UPNP_QOBUZ_TAKEOVER_UNSUPPORTED',
        status: 409,
      });
    }

    const mpdState = String(mpd.state || '').toLowerCase();
    const mpdActive = mpdState === 'play' || mpdState === 'pause';
    if (mpdActive && !this.stopMpd) {
      throw new UpnpError('MPD is active but its safe stop operation is unavailable', {
        code: 'UPNP_MPD_TAKEOVER_UNSUPPORTED',
        status: 409,
      });
    }

    const transportState = currentTransport(renderer.inspection);
    if (transportState === 'TRANSITIONING' || transportState === 'ERROR' || !transportState) {
      throw new UpnpError('Renderer transport ownership is uncertain', {
        code: 'UPNP_OWNERSHIP_UNCERTAIN',
        status: 409,
      });
    }

    const rendererActive = TAKEOVER_STOPPABLE_TRANSPORT_STATES.has(transportState);
    if (rendererActive && !currentActionsAllow(renderer.inspection, 'Stop')) {
      throw new UpnpError('The active renderer does not currently allow a safe Stop operation', {
        code: 'UPNP_RENDERER_TAKEOVER_UNSUPPORTED',
        status: 409,
      });
    }

    return {
      id,
      qobuz,
      mpd,
      renderer,
      mpdActive,
      rendererActive,
    };
  }

  async _stopTakeoverOwners(preflight) {
    const stopped = { mpd: false, renderer: false };
    try {
      if (preflight.mpdActive) {
        await this.stopMpd();
        stopped.mpd = true;
      }
      if (preflight.rendererActive) {
        await this.controlPoint.transportAction(preflight.id, 'Stop', { InstanceID: 0 });
        stopped.renderer = true;
      }
      return stopped;
    } catch (error) {
      throw new UpnpError('The active playback owner could not be released safely', {
        code: 'UPNP_TAKEOVER_STOP_FAILED',
        status: 409,
        details: {
          stoppedMpd: stopped.mpd,
          stoppedRenderer: stopped.renderer,
        },
        cause: error,
      });
    }
  }

  async _takeoverSettled(rendererId, stopped) {
    try {
      return await this.preflight({ rendererId });
    } catch (error) {
      if (['UPNP_QOBUZ_ACTIVE', 'UPNP_MPD_ACTIVE', 'UPNP_RENDERER_ACTIVE', 'UPNP_OWNERSHIP_UNCERTAIN']
        .includes(error?.code)) {
        throw new UpnpError('Playback ownership changed while takeover was in progress', {
          code: 'UPNP_TAKEOVER_STATE_CHANGED',
          status: 409,
          details: {
            stoppedMpd: Boolean(stopped?.mpd),
            stoppedRenderer: Boolean(stopped?.renderer),
          },
          cause: error,
        });
      }
      throw error;
    }
  }

  async _releaseFailedTakeoverSession() {
    const session = this.session;
    if (!session) return;
    if (session.ownsAudio) {
      try {
        const inspection = await this._refreshActive(session, { invalidateOnConflict: false });
        const currentUri = String(inspection?.readOnlyState?.media?.currentUri || '').trim();
        // A failed start must not stop a different owner that took the
        // renderer between the final preflight and cleanup. Only release the
        // renderer when its URI is still the resource selected by this
        // session.
        if (sameUpnpResourceUri(currentUri, session.resource?.uri)
          && currentActionsAllow(inspection, 'Stop')) {
          await this.controlPoint.transportAction(session.rendererId, 'Stop', { InstanceID: 0 });
        }
      } catch {}
    }
    session.ownsAudio = false;
    session.state = 'stopped';
    session.lastError = 'takeover-start-failed';
  }

  async takeover({ itemRef, rendererId, confirmed = false } = {}) {
    if (confirmed !== true) {
      throw new UpnpError('Explicit takeover confirmation is required', {
        code: 'UPNP_TAKEOVER_CONFIRMATION_REQUIRED',
        status: 400,
      });
    }
    return this._withMutationLock(async () => {
      this._assertNoActiveSession({ takeover: true });

      // Validate the opaque selection before releasing the current owner. The
      // resource URL is still revalidated by _selectUnlocked after the state
      // transition, so no untrusted URL is retained or sent to the renderer.
      const trustedItem = this.controlPoint.getTrustedMediaItem(itemRef);
      const initial = await this._takeoverPreflight({ rendererId });
      const stopped = await this._stopTakeoverOwners(initial);
      const finalPreflight = await this._takeoverSettled(rendererId, stopped);

      try {
        const selected = await this._selectUnlocked({
          trustedItem,
          rendererId,
          preflight: finalPreflight,
        });
        const loaded = await this._loadUnlocked(selected.sessionId);
        const played = await this._playUnlocked(selected.sessionId);
        return {
          ...played,
          takeover: {
            confirmed: true,
            stoppedMpd: Boolean(stopped.mpd),
            stoppedRenderer: Boolean(stopped.renderer),
          },
          selected: {
            sessionId: String(played.sessionId || loaded.sessionId || selected.sessionId || ''),
            generation: String(played.generation || loaded.generation || selected.generation || ''),
          },
        };
      } catch (error) {
        await this._releaseFailedTakeoverSession();
        throw new UpnpError('The current owner was released but the selected UPnP item could not start', {
          code: 'UPNP_TAKEOVER_START_FAILED',
          status: 502,
          details: {
            stoppedMpd: Boolean(stopped.mpd),
            stoppedRenderer: Boolean(stopped.renderer),
          },
          cause: error,
        });
      }
    });
  }

  _queueChanged(session, snapshot) {
    if (!snapshot || !session?.baseline) return false;
    return String(snapshot.queueHash || '') !== String(session.baseline.queueHash || '');
  }

  async _refreshActive(session, { invalidateOnConflict = true } = {}) {
    let inspection;
    try {
      inspection = await this.controlPoint.inspectRenderer(session.rendererId, { probeState: true });
    } catch (error) {
      session.state = 'renderer-unavailable';
      session.ownsAudio = false;
      session.lastError = 'renderer-unavailable';
      throw new UpnpError('UPnP renderer is unavailable', {
        code: 'UPNP_RENDERER_UNAVAILABLE',
        status: 503,
        cause: error,
      });
    }
    const previousInspection = session.lastInspection || {};
    const previousState = currentTransport(previousInspection);
    const state = currentTransport(inspection);
    // Some renderers clear GetPositionInfo immediately when a track reaches
    // the end and enters STOPPED. Keep the last active observation so the
    // queue can distinguish a natural completion from an early external
    // stop, even when the terminal SOAP response reports 00:00:00.
    if (ACTIVE_TRANSPORT_STATES.has(previousState)) {
      session.lastActiveInspection = clone(previousInspection);
    }
    if (ACTIVE_TRANSPORT_STATES.has(state)) {
      session.lastActiveInspection = clone(inspection);
    }
    session.lastInspection = inspection;
    const currentUri = String(inspection?.readOnlyState?.media?.currentUri || '').trim();
    if (invalidateOnConflict && session.ownsAudio) {
      if (!currentUri || !sameUpnpResourceUri(currentUri, session.resource.uri)) {
        session.state = 'ownership-lost';
        session.ownsAudio = false;
        session.lastError = 'renderer-media-changed';
        throw new UpnpError('Renderer ownership changed outside this Sonuvi session', {
          code: 'UPNP_OWNERSHIP_LOST',
          status: 409,
        });
      }
      if (state === 'ERROR') {
        session.state = 'ownership-lost';
        session.ownsAudio = false;
        session.lastError = 'renderer-error';
        throw new UpnpError('Renderer reported a playback error', {
          code: 'UPNP_RENDERER_ERROR',
          status: 409,
        });
      }
    }
    return inspection;
  }

  async _assertOwned(session) {
    await this._qobuzGate();
    return this._refreshActive(session, { invalidateOnConflict: true });
  }

  async _mutationPreflight(session) {
    const preflight = await this.preflight({ rendererId: session.rendererId });
    const currentHash = String(preflight.mpd?.queueHash || '');
    if (currentHash !== String(session.baseline?.queueHash || '')) {
      session.state = 'queue-changed';
      session.ownsAudio = false;
      throw new UpnpError('MPD queue changed after selection; playback was rejected', {
        code: 'UPNP_QUEUE_CHANGED',
        status: 409,
      });
    }
    return preflight;
  }

  async _postMutation(session) {
    session.mutationCount += 1;
    let mpd = null;
    try {
      mpd = await this._readQueueBaseline();
    } catch {}
    if (mpd && this._queueChanged(session, mpd)) {
      session.queueChanged = true;
      this.log.warn?.('[upnp] renderer mutation changed the MPD queue; queue was not restored');
    }
    return mpd;
  }

  async _loadUnlocked(sessionId) {
    const session = this._assertSession(sessionId);
    if (session.state !== 'selected') {
      throw new UpnpError('UPnP session is not ready to load', { code: 'UPNP_BAD_STATE', status: 409 });
    }
    await this._mutationPreflight(session);
    await this.controlPoint.transportAction(session.rendererId, 'SetAVTransportURI', {
      InstanceID: 0,
      CurrentURI: session.resource.uri,
      CurrentURIMetaData: session.metadata,
    });
    await this._postMutation(session);
    session.ownsAudio = true;
    session.state = 'loaded';
    session.lastError = '';
    return this.snapshot();
  }

  async load(sessionId) {
    return this._withMutationLock(() => this._loadUnlocked(sessionId));
  }

  async _playUnlocked(sessionId) {
    const session = this._assertSession(sessionId);
    if (!['loaded', 'paused'].includes(session.state)) {
      throw new UpnpError('UPnP session is not loaded or paused', { code: 'UPNP_BAD_STATE', status: 409 });
    }
    const inspection = await this._assertOwned(session);
    if (!currentActionsAllow(inspection, 'Play')) {
      throw new UpnpError('Renderer does not currently allow Play', { code: 'UPNP_UNSUPPORTED', status: 409 });
    }
    await this.controlPoint.transportAction(session.rendererId, 'Play', { InstanceID: 0, Speed: '1' });
    await this._postMutation(session);
    session.ownsAudio = true;
    session.state = 'playing';
    session.lastError = '';
    return this.snapshot();
  }

  async play(sessionId) {
    return this._withMutationLock(() => this._playUnlocked(sessionId));
  }

  async pause(sessionId) {
    return this._withMutationLock(async () => {
      const session = this._assertSession(sessionId);
      if (session.state !== 'playing') {
        throw new UpnpError('UPnP session is not playing', { code: 'UPNP_BAD_STATE', status: 409 });
      }
      const inspection = await this._assertOwned(session);
      if (!currentActionsAllow(inspection, 'Pause')) {
        throw new UpnpError('Renderer does not currently allow Pause', { code: 'UPNP_UNSUPPORTED', status: 409 });
      }
      await this.controlPoint.transportAction(session.rendererId, 'Pause', { InstanceID: 0 });
      await this._postMutation(session);
      session.state = 'paused';
      session.lastError = '';
      return this.snapshot();
    });
  }

  async stop(sessionId) {
    return this._withMutationLock(async () => {
      const session = this._assertSession(sessionId);
      if (!session.ownsAudio) {
        session.state = 'stopped';
        return this.snapshot();
      }
      const inspection = await this._assertOwned(session);
      if (!currentActionsAllow(inspection, 'Stop')) {
        throw new UpnpError('Renderer does not currently allow Stop', { code: 'UPNP_UNSUPPORTED', status: 409 });
      }
      await this.controlPoint.transportAction(session.rendererId, 'Stop', { InstanceID: 0 });
      await this._postMutation(session);
      try {
        // UpMPD can acknowledge Stop before the prior inspection has been
        // replaced. Refresh the read-only state so callers do not retain a
        // stale PLAYING transport marker after ownership is released.
        session.lastInspection = await this.controlPoint.inspectRenderer(session.rendererId, { probeState: true });
      } catch {}
      session.ownsAudio = false;
      session.state = 'stopped';
      session.lastError = '';
      return this.snapshot();
    });
  }

  async state(sessionId) {
    const session = this._assertSession(sessionId, { allowStopped: true });
    if (session.ownsAudio) {
      try {
        const inspection = await this._refreshActive(session, { invalidateOnConflict: true });
        const transportState = currentTransport(inspection);
        if (transportState === 'PLAYING') session.state = 'playing';
        else if (transportState === 'PAUSED_PLAYBACK') session.state = 'paused';
        else if (transportState === 'STOPPED' || transportState === 'NO_MEDIA_PRESENT') {
          // SetAVTransportURI normally leaves a renderer STOPPED but loaded.
          // Keep the selected session in `loaded` until its explicit Play or
          // Stop operation; a stopped renderer from a playing/paused session
          // releases ownership as a natural end/stop observation.
          if (session.state !== 'loaded') {
            session.state = 'stopped';
            session.ownsAudio = false;
          }
        }
      } catch (error) {
        if (error?.code === 'UPNP_RENDERER_UNAVAILABLE' || error?.code === 'UPNP_OWNERSHIP_LOST') throw error;
      }
    }
    return this.snapshot();
  }

  async getNowPlaying() {
    if (!this.session || !this.session.ownsAudio || !['loaded', 'playing', 'paused'].includes(this.session.state)) return null;
    let snapshot;
    try {
      snapshot = await this.state(this.session.id);
    } catch {
      return null;
    }
    if (!snapshot.ownsAudio || !['loaded', 'playing', 'paused'].includes(snapshot.state)) return null;
    const inspection = this.session.lastInspection || {};
    const position = inspection.readOnlyState?.position || {};
    const elapsed = parsePosition(position.relativeTime);
    const duration = numberOrNull(this.session.item.durationSeconds)
      ?? numberOrNull(this.session.resource.durationSeconds)
      ?? parseDuration(position.trackDuration)
      ?? 0;
    const artworkUrl = String(this.session.item.artworkUrl || '').trim();
    return {
      source: 'upnp-sonuvi',
      transport: 'upnp',
      controller: 'sonuvi',
      provider: '',
      renderer: {
        id: this.session.rendererId,
        udn: this.session.renderer.udn,
        friendlyName: this.session.renderer.friendlyName,
      },
      artist: String(this.session.item.artist || this.session.item.creator || ''),
      title: String(this.session.item.title || ''),
      album: String(this.session.item.album || ''),
      file: 'upnp-sonuvi',
      albumArtUrl: artworkUrl,
      artworkSourceUrl: artworkUrl,
      state: stateForNowPlaying(inspection.readOnlyState?.transport?.state),
      elapsed,
      duration,
      percent: duration > 0 ? Math.round((elapsed / duration) * 100) : 0,
      encoded: '',
      track: Number.isSafeInteger(this.session.item.trackNumber) ? String(this.session.item.trackNumber) : '',
      isStream: true,
      isAirplay: false,
      isYoutube: false,
      isQobuz: false,
      isUpnp: true,
      streamKind: 'upnp',
      isFavorite: false,
      rating: 0,
      ratingDisabled: true,
      ratingFile: '',
      upnpItem: publicItem(this.session.item, this.session.resource),
      upnpFormat: publicResource(this.session.resource),
      queueChanged: Boolean(this.session.queueChanged),
    };
  }

  shouldSuppressMpdHistory() {
    return Boolean(this.session?.ownsAudio && ['loaded', 'playing', 'paused'].includes(this.session.state));
  }

  hasActiveSession() {
    return this.shouldSuppressMpdHistory();
  }

  snapshot() {
    const session = this.session;
    if (!session) return { active: false, session: null };
    const inspection = session.lastInspection || {};
    const transport = inspection.readOnlyState?.transport || {};
    const currentPosition = inspection.readOnlyState?.position || {};
    const terminalState = ['STOPPED', 'NO_MEDIA_PRESENT'].includes(currentTransport(inspection));
    const position = terminalState
      ? (session.lastActiveInspection?.readOnlyState?.position || currentPosition)
      : currentPosition;
    return {
      active: Boolean(session.ownsAudio),
      sessionId: session.id,
      generation: session.generation,
      state: SESSION_STATES.has(session.state) ? session.state : 'ownership-lost',
      ownsAudio: Boolean(session.ownsAudio),
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      renderer: {
        id: session.rendererId,
        udn: session.renderer.udn,
        friendlyName: session.renderer.friendlyName,
      },
      item: publicItem(session.item, session.resource),
      transport: {
        state: String(transport.state || ''),
        status: String(transport.status || ''),
        speed: String(transport.speed || ''),
        relativeTime: String(position.relativeTime || ''),
        trackDuration: String(position.trackDuration || ''),
      },
      queueBaseline: {
        hash: String(session.baseline?.queueHash || ''),
        length: Number(session.baseline?.queue?.length || 0),
        playlistVersion: String(session.baseline?.playlistVersion || ''),
        entries: clone(session.baseline?.queue || []),
      },
      queueChanged: Boolean(session.queueChanged),
      mutationCount: Number(session.mutationCount || 0),
      lastError: String(session.lastError || ''),
    };
  }
}

export function createUpnpPlaybackSessionManager(options) {
  return new UpnpPlaybackSessionManager(options);
}
