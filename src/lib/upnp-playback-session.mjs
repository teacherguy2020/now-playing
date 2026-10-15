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

const SOURCE_INDEPENDENT_TRANSPORT_ACTIONS = new Set([
  'pause',
  'resume',
  'stop',
  'seek',
  'next',
  'previous',
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

function currentMedia(inspection) {
  return inspection?.readOnlyState?.media && typeof inspection.readOnlyState.media === 'object'
    ? inspection.readOnlyState.media
    : {};
}

function currentPosition(inspection) {
  return inspection?.readOnlyState?.position && typeof inspection.readOnlyState.position === 'object'
    ? inspection.readOnlyState.position
    : {};
}

function activeTransportState(state) {
  return state === 'PLAYING' || state === 'PAUSED_PLAYBACK';
}

function formatSeekTarget(seconds) {
  const totalMilliseconds = Math.round(Number(seconds) * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const suffix = milliseconds ? `.${String(milliseconds).padStart(3, '0')}` : '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${suffix}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function mpdBlocksExternalRendererControl(mpd, currentUri) {
  const state = String(mpd?.state || '').trim().toLowerCase();
  if (!['play', 'pause'].includes(state)) return false;
  const song = mpd?.currentSong && typeof mpd.currentSong === 'object' ? mpd.currentSong : {};
  const file = String(song.file || '').trim();
  const encoded = String(song.encoded || '').trim().toLowerCase();
  if (file.toLowerCase() === 'airplay active' || encoded === 'airplay') return true;
  if (!file || !currentUri) return true;
  return !sameUpnpResourceUri(file, currentUri);
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

  _rendererTransportView({ rendererId, qobuz, mpd, renderer } = {}) {
    const id = String(rendererId || '').trim();
    const inspection = renderer?.inspection || {};
    const transport = inspection.readOnlyState?.transport || {};
    const media = currentMedia(inspection);
    const position = currentPosition(inspection);
    const state = currentTransport(inspection);
    const currentUri = String(media.currentUri || '').trim();
    const durationSeconds = parseDuration(position.trackDuration) ?? parseDuration(media.mediaDuration);
    const positionSeconds = parseDuration(position.relativeTime);
    const trackNumber = numberOrNull(position.track);
    const numberOfTracks = numberOrNull(media.numberOfTracks);
    const currentActions = Array.isArray(inspection.readOnlyState?.currentActions)
      ? inspection.readOnlyState.currentActions.map((action) => String(action || '')).filter(Boolean)
      : [];
    const ownsCurrentRenderer = Boolean(
      this.session?.ownsAudio
      && this.session.rendererId === id
      && currentUri
      && sameUpnpResourceUri(currentUri, this.session.resource?.uri),
    );
    const qobuzActive = Boolean(qobuz?.active || qobuz?.suppressMpdHistory);

    let source = 'unknown';
    let owner = 'unknown';
    let queueAuthority = 'unknown';
    if (qobuzActive) {
      source = 'qobuz-connect';
      owner = 'qobuz-connect';
      queueAuthority = 'unavailable';
    } else if (ownsCurrentRenderer) {
      source = 'upnp-sonuvi';
      owner = 'sonuvi';
      queueAuthority = 'sonuvi';
    } else if (currentUri
      && !mpdBlocksExternalRendererControl(mpd, currentUri)
      && ['PLAYING', 'PAUSED_PLAYBACK', 'STOPPED', 'NO_MEDIA_PRESENT', ''].includes(state)) {
      source = 'external-upnp';
      owner = 'external';
      queueAuthority = numberOfTracks == null
        ? 'unknown'
        : numberOfTracks > 1 ? 'renderer' : 'unavailable';
    } else if (['STOPPED', 'NO_MEDIA_PRESENT', ''].includes(state)) {
      source = 'idle';
      owner = 'none';
      queueAuthority = 'none';
    }

    const externalActive = source === 'external-upnp' && activeTransportState(state);
    const rendererQueueAvailable = queueAuthority === 'renderer';
    const capabilities = {
      pause: externalActive && state === 'PLAYING' && currentActionsAllow(inspection, 'Pause'),
      resume: externalActive && state === 'PAUSED_PLAYBACK' && currentActionsAllow(inspection, 'Play'),
      stop: externalActive && currentActionsAllow(inspection, 'Stop'),
      seek: externalActive
        && Boolean(currentUri)
        && durationSeconds != null
        && currentActionsAllow(inspection, 'Seek'),
      next: externalActive && rendererQueueAvailable && currentActionsAllow(inspection, 'Next'),
      previous: externalActive && rendererQueueAvailable && currentActionsAllow(inspection, 'Previous'),
      queueEdit: source === 'upnp-sonuvi',
    };

    return {
      rendererId: id,
      renderer: renderer?.device || null,
      source,
      owner,
      queueAuthority,
      queueRouteRequired: source === 'upnp-sonuvi',
      capabilities,
      controlsAllowed: Object.entries(capabilities)
        .filter(([, allowed]) => allowed)
        .map(([name]) => name),
      transport: {
        state: String(transport.state || ''),
        status: String(transport.status || ''),
        speed: String(transport.speed || ''),
        relativeTime: String(position.relativeTime || ''),
        trackDuration: String(position.trackDuration || ''),
        positionSeconds,
        durationSeconds,
        trackNumber,
        numberOfTracks,
        currentMediaPresent: Boolean(currentUri),
      },
      // This is intentionally retained only for post-command verification.
      // The mobile sanitizer never returns it to clients.
      _currentMediaUri: currentUri,
      currentActions,
      approved: true,
      verified: true,
      mutationExecuted: false,
    };
  }

  async rendererTransportCapabilities({ rendererId } = {}) {
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
      this.approvedRendererCapabilities({ rendererId: id }),
    ]);
    return this._rendererTransportView({ rendererId: id, qobuz, mpd, renderer });
  }

  async _confirmRendererTransport(rendererId, action, before, requestedPosition = null) {
    let latest = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      latest = await this.rendererTransportCapabilities({ rendererId });
      const state = normalizedState(latest.transport?.state);
      const position = numberOrNull(latest.transport?.positionSeconds);
      const trackChanged = latest._currentMediaUri !== before._currentMediaUri
        || (latest.transport?.trackNumber != null
          && before.transport?.trackNumber != null
          && latest.transport.trackNumber !== before.transport.trackNumber);
      const confirmed = action === 'pause'
        ? state === 'PAUSED_PLAYBACK'
        : action === 'resume'
          ? state === 'PLAYING'
          : action === 'stop'
            ? ['STOPPED', 'NO_MEDIA_PRESENT'].includes(state)
            : action === 'seek'
              ? position != null && requestedPosition != null && Math.abs(position - requestedPosition) <= 3
              : trackChanged;
      if (confirmed) {
        return {
          ...latest,
          action,
          verified: true,
          mutationExecuted: true,
        };
      }
      if (attempt < 2) await delay(100);
    }
    throw new UpnpError('The renderer did not confirm the requested transport change', {
      code: 'UPNP_TRANSPORT_UNCONFIRMED',
      status: 409,
      details: { action },
    });
  }

  async rendererTransport({ rendererId, action, positionSeconds } = {}) {
    const requestedAction = String(action || '').trim().toLowerCase();
    if (!SOURCE_INDEPENDENT_TRANSPORT_ACTIONS.has(requestedAction)) {
      throw new UpnpError('Renderer transport action is not supported by this endpoint', {
        code: 'UPNP_BAD_REQUEST',
        status: 400,
      });
    }

    return this._withMutationLock(async () => {
      const before = await this.rendererTransportCapabilities({ rendererId });
      if (before.source === 'qobuz-connect') {
        throw new UpnpError('Qobuz Connect currently owns or may own the renderer', {
          code: 'UPNP_QOBUZ_ACTIVE',
          status: 409,
        });
      }
      if (before.source === 'upnp-sonuvi') {
        throw new UpnpError('Use the Sonuvi UPnP queue control for this playback session', {
          code: 'UPNP_QUEUE_AUTHORITY_REQUIRED',
          status: 409,
        });
      }
      if (before.source !== 'external-upnp') {
        throw new UpnpError('Renderer transport ownership is not safe to control in the current state', {
          code: 'UPNP_TRANSPORT_BAD_STATE',
          status: 409,
        });
      }
      if (!before.capabilities[requestedAction]) {
        if (['next', 'previous'].includes(requestedAction) && before.queueAuthority !== 'renderer') {
          throw new UpnpError('The current renderer queue is not available for this action', {
            code: 'UPNP_EXTERNAL_QUEUE_UNAVAILABLE',
            status: 409,
          });
        }
        throw new UpnpError('The approved renderer does not support that transport action in the current state', {
          code: 'UPNP_TRANSPORT_UNSUPPORTED',
          status: 409,
        });
      }

      let soapAction;
      let args;
      let requestedSeekSeconds = null;
      if (requestedAction === 'resume') {
        soapAction = 'Play';
        args = { InstanceID: 0, Speed: '1' };
      } else if (requestedAction === 'seek') {
        requestedSeekSeconds = Number(positionSeconds);
        const duration = numberOrNull(before.transport?.durationSeconds);
        if (!Number.isFinite(requestedSeekSeconds) || requestedSeekSeconds < 0
          || requestedSeekSeconds > 24 * 60 * 60
          || (duration != null && requestedSeekSeconds > duration)) {
          throw new UpnpError('Seek position is outside the current track', {
            code: 'UPNP_BAD_REQUEST',
            status: 400,
          });
        }
        soapAction = 'Seek';
        args = {
          InstanceID: 0,
          Unit: 'REL_TIME',
          Target: formatSeekTarget(requestedSeekSeconds),
        };
      } else {
        soapAction = requestedAction[0].toUpperCase() + requestedAction.slice(1);
        args = { InstanceID: 0 };
      }

      await this.controlPoint.transportAction(String(rendererId), soapAction, args);
      return this._confirmRendererTransport(String(rendererId), requestedAction, before, requestedSeekSeconds);
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
      preparedNext: null,
      transitionedNext: null,
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
        if (session.preparedNext?.armed
          && currentUri
          && sameUpnpResourceUri(currentUri, session.preparedNext.resource?.uri)) {
          // SetNextAVTransportURI has taken effect and the renderer has moved
          // to the prepared resource. Keep ownership until the queue manager
          // commits the logical transition against its revision/generation.
          session.transitionedNext = session.preparedNext;
        } else {
          session.preparedNext = null;
          session.transitionedNext = null;
          session.state = 'ownership-lost';
          session.ownsAudio = false;
          session.lastError = 'renderer-media-changed';
          throw new UpnpError('Renderer ownership changed outside this Sonuvi session', {
            code: 'UPNP_OWNERSHIP_LOST',
            status: 409,
          });
        }
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

  async _confirmNextUri(rendererId, expectedUri, { cleared = false } = {}) {
    let latest = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      latest = await this.controlPoint.inspectRenderer(rendererId, { probeState: true });
      const actualUri = String(currentMedia(latest).nextUri || '').trim();
      const confirmed = cleared
        ? !actualUri
        : Boolean(actualUri) && sameUpnpResourceUri(actualUri, expectedUri);
      if (confirmed) return latest;
      if (attempt < 3) await delay(100);
    }
    throw new UpnpError(
      cleared
        ? 'The renderer did not confirm clearing its prepared next resource'
        : 'The renderer did not confirm the prepared next resource',
      {
        code: cleared ? 'UPNP_NEXT_CLEAR_UNCONFIRMED' : 'UPNP_NEXT_UNCONFIRMED',
        status: 409,
      },
    );
  }

  async _clearPreparedNextUnlocked(session, { allowTransitioned = false } = {}) {
    if (!session?.preparedNext && !session?.transitionedNext) return false;
    if (session.transitionedNext && !allowTransitioned) {
      throw new UpnpError('The prepared resource has already transitioned and must be adopted first', {
        code: 'UPNP_NEXT_ALREADY_TRANSITIONED',
        status: 409,
      });
    }
    if (session.transitionedNext) {
      session.preparedNext = null;
      session.transitionedNext = null;
      return true;
    }

    const inspection = await this.controlPoint.inspectRenderer(session.rendererId, { probeState: true });
    const currentUri = String(currentMedia(inspection).currentUri || '').trim();
    if (currentUri && !sameUpnpResourceUri(currentUri, session.resource?.uri)) {
      throw new UpnpError('Renderer ownership changed before the prepared next resource could be cleared', {
        code: 'UPNP_OWNERSHIP_LOST',
        status: 409,
      });
    }
    if (!serviceHasAction(inspection, 'SetNextAVTransportURI')) {
      throw new UpnpError('Renderer no longer advertises SetNextAVTransportURI', {
        code: 'UPNP_UNSUPPORTED',
        status: 409,
      });
    }
    await this.controlPoint.transportAction(session.rendererId, 'SetNextAVTransportURI', {
      InstanceID: 0,
      NextURI: '',
      NextURIMetaData: '',
    });
    const confirmed = await this._confirmNextUri(session.rendererId, '', { cleared: true });
    session.lastInspection = confirmed;
    session.preparedNext = null;
    session.transitionedNext = null;
    return true;
  }

  async prepareNext(sessionId, {
    itemRef,
    queueRevision = null,
    sessionGeneration = '',
    currentItemId = '',
  } = {}) {
    return this._withMutationLock(async () => {
      const session = this._assertSession(sessionId);
      if (!session.ownsAudio || !['playing', 'paused'].includes(session.state)) {
        throw new UpnpError('UPnP session is not actively playing a track', {
          code: 'UPNP_BAD_STATE',
          status: 409,
        });
      }
      if (sessionGeneration && String(sessionGeneration) !== String(session.generation)) {
        throw new UpnpError('UPnP playback session generation is stale', {
          code: 'UPNP_SESSION_GENERATION_CONFLICT',
          status: 409,
        });
      }
      if (currentItemId && String(currentItemId) !== String(session.item?.id || '')) {
        throw new UpnpError('The current UPnP item changed before preparation', {
          code: 'UPNP_QUEUE_REVISION_CONFLICT',
          status: 409,
        });
      }

      const before = await this._assertOwned(session);
      if (!serviceHasAction(before, 'SetNextAVTransportURI')) {
        throw new UpnpError('Renderer does not advertise SetNextAVTransportURI', {
          code: 'UPNP_UNSUPPORTED',
          status: 409,
        });
      }
      if (session.preparedNext) {
        return {
          armed: true,
          reused: true,
          sessionId: session.id,
          generation: session.generation,
          rendererId: session.rendererId,
          queueRevision,
          currentItemId: String(currentItemId || ''),
          nextItemId: String(session.preparedNext.item?.id || ''),
          nextSelectionRef: String(session.preparedNext.item?.selectionRef || ''),
        };
      }

      const item = this.controlPoint.getTrustedMediaItem(itemRef);
      const prepared = await this.controlPoint.prepareMediaItemForPlayback(item, session.rendererId, {
        expectedRendererHost: this.expectedRendererHost,
      });
      const after = await this._assertOwned(session);
      const currentBefore = String(currentMedia(before).currentUri || '').trim();
      const currentAfter = String(currentMedia(after).currentUri || '').trim();
      if (!currentBefore || !currentAfter || !sameUpnpResourceUri(currentBefore, currentAfter)) {
        throw new UpnpError('The current renderer resource changed during next-track preparation', {
          code: 'UPNP_OWNERSHIP_LOST',
          status: 409,
        });
      }

      session.preparedNext = {
        item: prepared.item,
        resource: prepared.resource,
        metadata: prepared.metadata,
        mediaServer: prepared.mediaServer,
        queueRevision,
        sessionGeneration: String(session.generation),
        currentItemId: String(currentItemId || session.item?.id || ''),
        preparedAt: this.now(),
        armed: false,
      };
      try {
        await this.controlPoint.transportAction(session.rendererId, 'SetNextAVTransportURI', {
          InstanceID: 0,
          NextURI: prepared.resource.uri,
          NextURIMetaData: prepared.metadata,
        });
        const confirmed = await this._confirmNextUri(session.rendererId, prepared.resource.uri);
        session.lastInspection = confirmed;
        session.preparedNext.armed = true;
      } catch (error) {
        try {
          await this._clearPreparedNextUnlocked(session);
        } catch (clearError) {
          throw new UpnpError('Prepared next resource could not be confirmed or safely cleared', {
            code: 'UPNP_NEXT_UNSAFE',
            status: 409,
            cause: clearError,
          });
        }
        throw error;
      }
      return {
        armed: true,
        reused: false,
        sessionId: session.id,
        generation: session.generation,
        rendererId: session.rendererId,
        queueRevision,
        currentItemId: String(currentItemId || session.item?.id || ''),
        nextItemId: String(prepared.item?.id || ''),
        nextSelectionRef: String(prepared.item?.selectionRef || ''),
      };
    });
  }

  async clearPreparedNext(sessionId) {
    return this._withMutationLock(async () => {
      const session = this._assertSession(sessionId, { allowStopped: true });
      await this._clearPreparedNextUnlocked(session);
      return this.snapshot();
    });
  }

  async commitPreparedNext(sessionId, {
    queueRevision = null,
    sessionGeneration = '',
    currentItemId = '',
    nextItemId = '',
  } = {}) {
    return this._withMutationLock(async () => {
      const session = this._assertSession(sessionId, { allowStopped: true });
      const prepared = session.preparedNext;
      if (!session.transitionedNext || !prepared?.armed) {
        throw new UpnpError('The renderer has not confirmed a prepared next-track transition', {
          code: 'UPNP_NEXT_NOT_TRANSITIONED',
          status: 409,
        });
      }
      if ((sessionGeneration && String(sessionGeneration) !== String(session.generation))
        || (prepared.sessionGeneration && String(prepared.sessionGeneration) !== String(sessionGeneration || session.generation))
        || (prepared.queueRevision != null && queueRevision != null
          && Number(prepared.queueRevision) !== Number(queueRevision))
        || (currentItemId && String(prepared.currentItemId) !== String(currentItemId))
        || (nextItemId && String(prepared.item?.id) !== String(nextItemId))) {
        throw new UpnpError('The prepared next-track transition is stale', {
          code: 'UPNP_QUEUE_REVISION_CONFLICT',
          status: 409,
        });
      }
      session.item = prepared.item;
      session.resource = prepared.resource;
      session.metadata = prepared.metadata;
      session.mediaServer = prepared.mediaServer;
      session.preparedNext = null;
      session.transitionedNext = null;
      const state = currentTransport(session.lastInspection);
      session.ownsAudio = ['PLAYING', 'PAUSED_PLAYBACK'].includes(state);
      session.state = state === 'PAUSED_PLAYBACK'
        ? 'paused'
        : state === 'PLAYING' ? 'playing' : 'stopped';
      session.lastError = '';
      return this.snapshot();
    });
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
      if (session.preparedNext && !session.transitionedNext) {
        await this._clearPreparedNextUnlocked(session);
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
      session.preparedNext = null;
      session.transitionedNext = null;
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
      ownsAudio: true,
      generation: this.session.generation,
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
      transitionedNext: Boolean(session.transitionedNext),
      mutationCount: Number(session.mutationCount || 0),
      lastError: String(session.lastError || ''),
    };
  }
}

export function createUpnpPlaybackSessionManager(options) {
  return new UpnpPlaybackSessionManager(options);
}
