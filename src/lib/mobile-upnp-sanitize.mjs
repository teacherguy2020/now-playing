function text(value, max = 2048) {
  return String(value ?? '').trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeStrings(values, max = 256) {
  return (Array.isArray(values) ? values : [])
    .map((value) => text(value, max))
    .filter(Boolean);
}

function safeErrorCode(value) {
  const code = text(value, 96).toUpperCase();
  return /^[A-Z0-9_:-]+$/.test(code) ? code : '';
}

export function sanitizeMobileUpnpService(service = {}) {
  return {
    serviceType: text(service.serviceType, 256),
    serviceId: text(service.serviceId, 256),
    version: text(service.version, 32),
    actions: safeStrings(service.actions, 128),
    descriptionError: safeErrorCode(service.descriptionError) || null,
  };
}

export function sanitizeMobileUpnpDevice(device = {}, { approved = false } = {}) {
  return {
    id: text(device.id, 256),
    udn: text(device.udn, 512),
    parentUdn: text(device.parentUdn, 512),
    deviceType: text(device.deviceType, 256),
    version: text(device.version, 32),
    roles: safeStrings(device.roles, 64),
    friendlyName: text(device.friendlyName, 512),
    manufacturer: text(device.manufacturer, 512),
    modelDescription: text(device.modelDescription, 512),
    modelName: text(device.modelName, 512),
    modelNumber: text(device.modelNumber, 256),
    discoveredAt: text(device.discoveredAt, 64) || null,
    available: device.available !== false,
    ...(approved ? { approved: true } : {}),
    ...(Array.isArray(device.services)
      ? { services: device.services.map(sanitizeMobileUpnpService) }
      : {}),
  };
}

export function sanitizeMobileUpnpResource(resource = {}) {
  return {
    protocolInfo: text(resource.protocolInfo, 1024),
    mimeType: text(resource.mimeType, 256),
    duration: text(resource.duration, 64),
    durationSeconds: numberOrNull(resource.durationSeconds),
    size: numberOrNull(resource.size),
    bitrate: numberOrNull(resource.bitrate),
    sampleFrequency: numberOrNull(resource.sampleFrequency),
    bitsPerSample: numberOrNull(resource.bitsPerSample),
    audioChannels: numberOrNull(resource.audioChannels),
    resolution: text(resource.resolution, 128),
  };
}

export function sanitizeMobileUpnpItem(item = {}) {
  return {
    kind: text(item.kind, 32),
    id: text(item.id, 1024),
    parentId: text(item.parentId, 1024),
    refId: text(item.refId, 1024),
    restricted: Boolean(item.restricted),
    title: text(item.title, 512),
    creator: text(item.creator, 512),
    artist: text(item.artist, 512),
    artists: safeStrings(item.artists, 512),
    albumArtist: text(item.albumArtist, 512),
    album: text(item.album, 512),
    trackNumber: Number.isSafeInteger(item.trackNumber) ? item.trackNumber : null,
    class: text(item.class, 256),
    duration: text(item.duration, 64),
    durationSeconds: numberOrNull(item.durationSeconds),
    selectionRef: text(item.selectionRef, 256),
    mediaServerId: text(item.mediaServerId, 256),
    mediaServerUdn: text(item.mediaServerUdn, 512),
    artworkAvailable: Boolean(item.artworkUrl || item.artworkAvailable),
    resources: (Array.isArray(item.resources) ? item.resources : []).map(sanitizeMobileUpnpResource),
  };
}

export function sanitizeMobileUpnpBrowse(result = {}) {
  return {
    device: sanitizeMobileUpnpDevice(result.device),
    objectId: text(result.objectId, 512),
    browseFlag: text(result.browseFlag, 64),
    startingIndex: Number.isSafeInteger(result.startingIndex) ? result.startingIndex : 0,
    requestedCount: Number.isSafeInteger(result.requestedCount) ? result.requestedCount : 0,
    numberReturned: Number.isSafeInteger(result.numberReturned) ? result.numberReturned : 0,
    totalMatches: Number.isSafeInteger(result.totalMatches) ? result.totalMatches : 0,
    updateId: text(result.updateId, 128),
    items: (Array.isArray(result.items) ? result.items : []).map(sanitizeMobileUpnpItem),
  };
}

export function sanitizeMobileUpnpSearch(result = {}) {
  return {
    device: sanitizeMobileUpnpDevice(result.device),
    containerId: text(result.containerId, 512),
    searchCriteria: text(result.searchCriteria, 2048),
    startingIndex: Number.isSafeInteger(result.startingIndex) ? result.startingIndex : 0,
    requestedCount: Number.isSafeInteger(result.requestedCount) ? result.requestedCount : 0,
    numberReturned: Number.isSafeInteger(result.numberReturned) ? result.numberReturned : 0,
    totalMatches: Number.isSafeInteger(result.totalMatches) ? result.totalMatches : 0,
    updateId: text(result.updateId, 128),
    items: (Array.isArray(result.items) ? result.items : []).map(sanitizeMobileUpnpItem),
  };
}

function sanitizeProtocolInfo(value = {}) {
  return {
    available: Boolean(value.available),
    source: safeStrings(value.source, 512),
    sink: safeStrings(value.sink, 512),
    ...(safeErrorCode(value.error) ? { error: safeErrorCode(value.error) } : {}),
  };
}

function sanitizeRendererState(state = {}) {
  const media = state.media || {};
  return {
    transport: {
      state: text(state.transport?.state, 64),
      status: text(state.transport?.status, 64),
      speed: text(state.transport?.speed, 32),
    },
    position: {
      track: numberOrNull(state.position?.track),
      trackDuration: text(state.position?.trackDuration, 64),
      relativeTime: text(state.position?.relativeTime, 64),
      absoluteTime: text(state.position?.absoluteTime, 64),
    },
    media: {
      numberOfTracks: numberOrNull(media.numberOfTracks),
      mediaDuration: text(media.mediaDuration, 64),
      currentUriPresent: Boolean(media.currentUri || media.currentUriPresent),
      nextUriPresent: Boolean(media.nextUri || media.nextUriPresent),
      currentMetadataPresent: Boolean(media.currentMetadataPresent),
      nextMetadataPresent: Boolean(media.nextMetadataPresent),
    },
    currentActions: safeStrings(state.currentActions, 64),
    ...(safeErrorCode(state.transportError) ? { transportError: safeErrorCode(state.transportError) } : {}),
    ...(safeErrorCode(state.positionError) ? { positionError: safeErrorCode(state.positionError) } : {}),
    ...(safeErrorCode(state.mediaError) ? { mediaError: safeErrorCode(state.mediaError) } : {}),
    ...(safeErrorCode(state.currentActionsError)
      ? { currentActionsError: safeErrorCode(state.currentActionsError) }
      : {}),
  };
}

export function sanitizeMobileUpnpInspection(result = {}) {
  const inspection = result.inspection || result;
  return {
    device: sanitizeMobileUpnpDevice(inspection.device || result.device),
    services: (Array.isArray(inspection.services) ? inspection.services : [])
      .map(sanitizeMobileUpnpService),
    readOnly: true,
    playbackMutationAvailable: false,
    protocolInfo: sanitizeProtocolInfo(inspection.protocolInfo),
    readOnlyState: sanitizeRendererState(inspection.readOnlyState || {}),
    avTransportActions: safeStrings(result.avTransportActions, 128),
    connectionManagerActions: safeStrings(result.connectionManagerActions, 128),
  };
}

export function sanitizeMobileUpnpRendererCapabilities(result = {}) {
  return {
    ...sanitizeMobileUpnpInspection(result),
    approved: result.approved === true,
  };
}

export function sanitizeMobileUpnpPreflight(result = {}) {
  const renderer = result.renderer || {};
  const mpd = result.mpd || {};
  return {
    qobuz: {
      active: Boolean(result.qobuz?.active),
      suppressMpdHistory: Boolean(result.qobuz?.suppressMpdHistory),
    },
    mpd: {
      state: text(mpd.state, 32),
      playlistLength: numberOrNull(mpd.playlistLength),
      playlistVersion: text(mpd.playlistVersion, 128),
    },
    renderer: {
      id: text(renderer.id, 256),
      device: sanitizeMobileUpnpDevice(renderer.device),
      transport: {
        state: text(renderer.transport?.state, 64),
        status: text(renderer.transport?.status, 64),
        speed: text(renderer.transport?.speed, 32),
      },
      media: {
        numberOfTracks: numberOrNull(renderer.media?.numberOfTracks),
        mediaDuration: text(renderer.media?.mediaDuration, 64),
        currentUriPresent: Boolean(renderer.media?.currentUri || renderer.media?.currentUriPresent),
        nextUriPresent: Boolean(renderer.media?.nextUri || renderer.media?.nextUriPresent),
      },
      loadedMedia: Boolean(renderer.loadedMedia),
      currentActions: safeStrings(renderer.currentActions, 64),
      protocolInfo: sanitizeProtocolInfo(renderer.protocolInfo),
      avTransportActions: safeStrings(renderer.avTransportActions, 128),
    },
  };
}

function sanitizeRendererIdentity(renderer = {}) {
  return {
    id: text(renderer.id, 256),
    udn: text(renderer.udn, 512),
    friendlyName: text(renderer.friendlyName, 512),
  };
}

function sanitizeSessionError(value) {
  return safeErrorCode(value) || null;
}

export function sanitizeMobileUpnpSession(snapshot = {}) {
  return {
    active: Boolean(snapshot.active),
    sessionId: text(snapshot.sessionId, 256),
    generation: text(snapshot.generation, 128),
    state: text(snapshot.state, 64),
    ownsAudio: Boolean(snapshot.ownsAudio),
    createdAt: text(snapshot.createdAt, 64),
    expiresAt: text(snapshot.expiresAt, 64),
    renderer: snapshot.renderer ? sanitizeRendererIdentity(snapshot.renderer) : null,
    item: snapshot.item ? sanitizeMobileUpnpItem(snapshot.item) : null,
    transport: {
      state: text(snapshot.transport?.state, 64),
      status: text(snapshot.transport?.status, 64),
      speed: text(snapshot.transport?.speed, 32),
      relativeTime: text(snapshot.transport?.relativeTime, 64),
      trackDuration: text(snapshot.transport?.trackDuration, 64),
    },
    queueBaseline: {
      length: numberOrNull(snapshot.queueBaseline?.length),
      playlistVersion: text(snapshot.queueBaseline?.playlistVersion, 128),
    },
    queueChanged: Boolean(snapshot.queueChanged),
    mutationCount: numberOrNull(snapshot.mutationCount) || 0,
    lastError: sanitizeSessionError(snapshot.lastError),
  };
}

function sanitizeMobileUpnpQueueItem(item = {}) {
  return {
    queueItemId: text(item.id || item.queueItemId, 256),
    selectionRef: text(item.selectionRef, 256),
    mediaServerId: text(item.mediaServerId, 256),
    mediaItemId: text(item.mediaItemId || item.id, 1024),
    parentId: text(item.parentId, 1024),
    title: text(item.title, 512),
    creator: text(item.creator, 512),
    artist: text(item.artist, 512),
    albumArtist: text(item.albumArtist, 512),
    album: text(item.album, 512),
    trackNumber: Number.isSafeInteger(item.trackNumber) ? item.trackNumber : null,
    class: text(item.class, 256),
    duration: text(item.duration, 64),
    durationSeconds: numberOrNull(item.durationSeconds),
    artworkAvailable: Boolean(item.artworkUrl || item.artworkAvailable),
    resource: item.resource ? sanitizeMobileUpnpResource(item.resource) : null,
  };
}

export function sanitizeMobileUpnpQueue(snapshot = {}) {
  const queue = snapshot.queue;
  const takeover = snapshot.takeover;
  return {
    active: Boolean(snapshot.active),
    queue: queue
      ? {
        queueId: text(queue.queueId, 256),
        revision: Number.isSafeInteger(queue.revision) ? queue.revision : 0,
        rendererId: text(queue.rendererId, 256),
        items: (Array.isArray(queue.items) ? queue.items : []).map(sanitizeMobileUpnpQueueItem),
        currentIndex: Number.isSafeInteger(queue.currentIndex) ? queue.currentIndex : -1,
        currentItemId: text(queue.currentItemId, 256),
        sessionId: text(queue.sessionId, 256),
        sessionGeneration: text(queue.sessionGeneration, 128),
        playbackState: text(queue.playbackState, 64),
        lastConfirmedRendererState: text(queue.lastConfirmedRendererState, 64),
        lastError: sanitizeSessionError(queue.lastError),
        persistence: text(queue.persistence, 32) || 'memory',
      }
      : null,
    ...(takeover && typeof takeover === 'object'
      ? {
        takeover: {
          confirmed: takeover.confirmed === true,
          stoppedMpd: takeover.stoppedMpd === true,
          stoppedRenderer: takeover.stoppedRenderer === true,
        },
      }
      : {}),
  };
}

function sourceForNowPlaying(payload = {}) {
  const explicit = text(payload.source, 64).toLowerCase();
  if (explicit === 'upnp-sonuvi' && text(payload.controller, 64).toLowerCase() === 'sonuvi') {
    return 'upnp-sonuvi';
  }
  if (explicit === 'qobuz-connect' || payload.isQobuz === true) return 'qobuz-connect';
  if (payload.isUpnp === true || text(payload.streamKind, 64).toLowerCase() === 'upnp') {
    return 'external-upnp';
  }
  if (payload.available === false && !payload.title && !payload.artist && !payload.album) return 'unknown';
  return 'mpd';
}

export function sanitizeMobileNowPlaying(payload = {}) {
  const source = sourceForNowPlaying(payload);
  const ownsUpnp = source === 'upnp-sonuvi' && payload.ownsAudio === true;
  const transportState = text(payload.state, 64).toLowerCase();
  return {
    source,
    controller: source === 'upnp-sonuvi'
      ? 'sonuvi'
      : (source === 'qobuz-connect' ? 'qobuz-connect' : ''),
    transport: source === 'upnp-sonuvi' ? 'upnp' : '',
    renderer: source === 'upnp-sonuvi' ? sanitizeRendererIdentity(payload.renderer) : null,
    ownsAudio: ownsUpnp,
    generation: source === 'upnp-sonuvi' ? text(payload.generation, 128) : '',
    transportState,
    queueChanged: source === 'upnp-sonuvi' && payload.queueChanged === true,
    upnpItem: source === 'upnp-sonuvi' && payload.upnpItem
      ? sanitizeMobileUpnpItem(payload.upnpItem)
      : null,
    upnpFormat: source === 'upnp-sonuvi' && payload.upnpFormat
      ? sanitizeMobileUpnpResource(payload.upnpFormat)
      : null,
    controls: {
      allowed: ownsUpnp ? ['play', 'pause', 'resume', 'stop', 'next', 'previous'] : [],
      unsupported: source === 'upnp-sonuvi' ? ['seek', 'repeat', 'shuffle'] : [],
    },
  };
}

export function sanitizeMobileUpnpFailure(value) {
  const code = safeErrorCode(value);
  return code ? { code } : { code: 'UPNP_ERROR' };
}
