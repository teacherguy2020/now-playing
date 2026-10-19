function text(value, max = 512) {
  return String(value ?? '').trim().slice(0, max);
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveInteger(value) {
  const number = positiveNumber(value);
  return number !== null && Number.isSafeInteger(Math.round(number)) ? Math.round(number) : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(Math.round(number))
    ? Math.round(number)
    : null;
}

function safeId(value) {
  const raw = text(value, 64);
  return /^\d{1,32}$/.test(raw) ? raw : null;
}

function safeQueueFingerprint(value) {
  const raw = text(value, 80);
  return /^qobuz-queue-[a-f0-9]{32}$/i.test(raw) ? raw : null;
}

function artworkUrl(baseUrl, artworkRef) {
  const root = text(baseUrl).replace(/\/+$/, '');
  const ref = text(artworkRef, 80);
  return root && ref ? `${root}/v1/mobile/qobuz-connect/artwork/${encodeURIComponent(ref)}` : null;
}

export function sanitizeMobilePibuzTrack(track, { baseUrl = '' } = {}) {
  if (!track || typeof track !== 'object') return null;
  const qobuzTrackId = safeId(track.qobuzTrackId);
  const title = text(track.title);
  const artist = text(track.artist);
  const album = text(track.album);
  if (!qobuzTrackId && !title && !artist && !album) return null;
  const artworkRef = text(track.artworkRef, 80) || null;
  return {
    qobuzTrackId,
    title,
    artist,
    album,
    qobuzAlbumId: safeId(track.qobuzAlbumId),
    qobuzArtistId: safeId(track.qobuzArtistId),
    version: text(track.version),
    durationSec: positiveNumber(track.durationSec),
    artworkAvailable: Boolean(artworkRef),
    artworkUrl: artworkUrl(baseUrl, artworkRef),
    sampleRateHz: positiveInteger(track.sampleRateHz),
    bitDepth: positiveInteger(track.bitDepth),
    hires: track.hires === true,
    source: 'qobuz-connect',
  };
}

function sanitizePlayback(playback = {}) {
  return {
    state: text(playback.state, 32) || 'unknown',
    isPlaying: playback.isPlaying === true,
    positionSec: positiveNumber(playback.positionSec),
    durationSec: positiveNumber(playback.durationSec),
    outputSampleRateHz: positiveInteger(playback.outputSampleRateHz),
    sampleRateHz: positiveInteger(playback.sampleRateHz),
    bitDepth: positiveInteger(playback.bitDepth),
    bitPerfectMode: typeof playback.bitPerfectMode === 'boolean' ? playback.bitPerfectMode : null,
    queueLength: nonNegativeInteger(playback.queueLength),
    shuffle: playback.shuffle === true,
    repeat: text(playback.repeat, 32) || 'off',
    muted: playback.muted === true,
  };
}

function sanitizeCapabilities(capabilities, active) {
  const source = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
    ? capabilities
    : {};
  const booleanOr = (field, fallback) => typeof source[field] === 'boolean' ? source[field] : fallback;
  return {
    readOnly: booleanOr('readOnly', true),
    play: booleanOr('play', false),
    pause: booleanOr('pause', false),
    stop: booleanOr('stop', false),
    seek: booleanOr('seek', false),
    next: booleanOr('next', false),
    previous: booleanOr('previous', false),
    queueEdit: booleanOr('queueEdit', false),
    repeat: booleanOr('repeat', false),
    shuffle: booleanOr('shuffle', false),
    volume: typeof source.volume === 'boolean' ? source.volume : null,
    control: typeof source.control === 'boolean'
      ? source.control
      : (active === true && source.readOnly === false ? true : null),
    verification: text(source.verification, 32) || null,
  };
}

function sanitizeQueue(queue, { baseUrl = '' } = {}) {
  if (!queue || typeof queue !== 'object') return null;
  if (queue.available === false) {
    return {
      availability: 'unavailable',
      reason: text(queue.reason, 64) || 'unavailable',
      currentIndex: null,
      totalTracks: null,
      currentTrack: null,
      history: [],
      upcoming: [],
    };
  }
  return {
    availability: 'available',
    currentIndex: Number.isSafeInteger(queue.currentIndex) ? queue.currentIndex : null,
    totalTracks: Number.isSafeInteger(queue.totalTracks) ? queue.totalTracks : null,
    queueFingerprint: safeQueueFingerprint(queue.queueFingerprint),
    repeat: text(queue.repeat, 32) || 'off',
    shuffle: queue.shuffle === true,
    stopAfterTrackId: safeId(queue.stopAfterTrackId),
    currentTrack: sanitizeMobilePibuzTrack(queue.currentTrack, { baseUrl }),
    history: (Array.isArray(queue.history) ? queue.history : [])
      .map((track) => sanitizeMobilePibuzTrack(track, { baseUrl }))
      .filter(Boolean),
    upcoming: (Array.isArray(queue.upcoming) ? queue.upcoming : [])
      .map((track) => sanitizeMobilePibuzTrack(track, { baseUrl }))
      .filter(Boolean),
  };
}

export function sanitizeMobilePibuzSnapshot(snapshot = {}, { baseUrl = '', includeQueue = true } = {}) {
  const available = snapshot.available !== false;
  const active = snapshot.active === true;
  const requestedOwnership = text(snapshot.ownershipState, 32);
  const ownershipState = ['confirmed-active', 'confirmed-inactive', 'unknown'].includes(requestedOwnership)
    ? requestedOwnership
    : (active ? 'confirmed-active' : (available ? 'confirmed-inactive' : 'unknown'));
  const playback = sanitizePlayback({
    ...snapshot,
    positionSec: snapshot.elapsedSec,
    isPlaying: snapshot.state === 'play',
  });
  return {
    version: 'qobuz-connect.v1',
    available,
    active,
    ownershipState,
    source: 'qobuz-connect',
    owner: 'pibuz',
    output: 'moode',
    sessionActive: typeof snapshot.sessionActive === 'boolean' ? snapshot.sessionActive : null,
    receiverActive: snapshot.receiverActive === true,
    connectionState: text(snapshot.connectionState, 32) || 'unknown',
    deviceName: text(snapshot.deviceName, 128) || null,
    state: text(snapshot.state, 32) || (active ? 'unknown' : 'inactive'),
    reason: text(snapshot.reason, 64) || null,
    stale: snapshot.stale === true,
    staleAgeMs: positiveNumber(snapshot.staleAgeMs),
    timingStable: snapshot.timingStable === true,
    playback,
    currentTrack: sanitizeMobilePibuzTrack(snapshot, { baseUrl }),
    capabilities: sanitizeCapabilities(snapshot.capabilities, active),
    eventStream: {
      connected: snapshot.eventStream?.connected === true,
      reconnects: positiveInteger(snapshot.eventStream?.reconnects) || 0,
      revision: positiveInteger(snapshot.eventStream?.revision) || 0,
      lastEventAt: text(snapshot.eventStream?.lastEventAt, 64) || null,
      lastEventType: text(snapshot.eventStream?.lastEventType, 64) || null,
    },
    ...(includeQueue
      ? {
        queue: active
          ? sanitizeQueue(snapshot.queue, { baseUrl })
          : (available
            ? { availability: 'inactive' }
            : { availability: 'unavailable', reason: text(snapshot.reason, 64) || 'unavailable' }),
      }
      : {}),
  };
}

export function sanitizeMobilePibuzQueue(snapshot = {}, { baseUrl = '' } = {}) {
  const safe = sanitizeMobilePibuzSnapshot(snapshot, { baseUrl, includeQueue: true });
  return {
    version: safe.version,
    available: safe.available,
    active: safe.active,
    ownershipState: safe.ownershipState,
    source: safe.source,
    owner: safe.owner,
    output: safe.output,
    sessionActive: safe.sessionActive,
    receiverActive: safe.receiverActive,
    connectionState: safe.connectionState,
    queue: safe.queue,
  };
}
