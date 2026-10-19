import { randomUUID } from 'node:crypto';

export const SAVED_QUEUE_SCHEMA_VERSION = 1;
export const SAVED_QUEUE_KIND = 'sonuvi.saved-queue';
export const QOBUZ_PROVIDER = 'qobuz';
export const MAX_SAVED_QUEUE_OCCURRENCES = 5_000;

const MAX_TEXT = 2_000;
const SAFE_ARTWORK_REF = /^qobuz-[a-z0-9]+$/i;
const SAFE_FINGERPRINT = /^qobuz-(?:queue-)?[a-z0-9]+$/i;
const NUMERIC_ID = /^\d+$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function text(value, label, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof value !== 'string' || value.length > MAX_TEXT) {
    throw new Error(`${label} must be a bounded string`);
  }
  return value;
}

function numericId(value, label) {
  const normalized = value === null || value === undefined ? '' : String(value);
  if (!NUMERIC_ID.test(normalized)) throw new Error(`${label} must be a numeric Qobuz ID`);
  return normalized;
}

function finiteNumber(value, label, { nullable = true, minimum = 0 } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${label} is required`);
  }
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${label} must be a finite number`);
  return value;
}

function boundedInteger(value, label, { nullable = false, minimum = 0 } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${label} is required`);
  }
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function normalizedPlaybackState(value) {
  if (value === 'play' || value === 'playing') return 'playing';
  if (value === 'pause' || value === 'paused') return 'paused';
  if (value === 'stop' || value === 'stopped') return 'stopped';
  return 'unknown';
}

function safeArtworkRef(value) {
  if (value === null || value === undefined || value === '') return null;
  const ref = text(value, 'artworkRef');
  if (!SAFE_ARTWORK_REF.test(ref)) throw new Error('artworkRef must be a mediated Qobuz artwork reference');
  return ref;
}

function trackMetadata(track) {
  const value = object(track, 'track');
  return {
    title: text(value.title, 'track.title') ?? '',
    artist: text(value.artist, 'track.artist') ?? '',
    album: text(value.album, 'track.album') ?? '',
    qobuzAlbumId: value.qobuzAlbumId === null || value.qobuzAlbumId === undefined
      ? null
      : text(value.qobuzAlbumId, 'track.qobuzAlbumId'),
    qobuzArtistId: value.qobuzArtistId === null || value.qobuzArtistId === undefined
      ? null
      : numericId(value.qobuzArtistId, 'track.qobuzArtistId'),
    durationSec: finiteNumber(value.durationSec, 'track.durationSec'),
    artworkRef: safeArtworkRef(value.artworkRef),
    sampleRateHz: boundedInteger(value.sampleRateHz, 'track.sampleRateHz', { nullable: true }),
    bitDepth: boundedInteger(value.bitDepth, 'track.bitDepth', { nullable: true }),
    hires: value.hires === true,
    version: text(value.version, 'track.version') ?? '',
  };
}

function occurrenceFromTrack(track, position, segment, fingerprint, duplicateOrdinal) {
  const value = object(track, 'queue occurrence');
  return {
    occurrenceKey: `qobuz:${fingerprint}:${position}`,
    position,
    segment,
    duplicateOrdinal,
    provider: QOBUZ_PROVIDER,
    providerTrackId: numericId(value.qobuzTrackId, 'track.qobuzTrackId'),
    metadata: trackMetadata(value),
  };
}

function queueTracks(queue) {
  const value = object(queue, 'queue');
  const history = Array.isArray(value.history) ? value.history : null;
  const upcoming = Array.isArray(value.upcoming) ? value.upcoming : null;
  if (!history || !upcoming || !value.currentTrack) {
    throw new Error('queue must contain history, currentTrack, and upcoming arrays');
  }
  return { value, history, current: value.currentTrack, upcoming };
}

function orderedHistoryForCapture(history, currentIndex) {
  // PiBuZ exposes playback history independently from the current queue
  // cursor, newest first.  After a queue replacement it can legitimately
  // retain older history while currentIndex is zero; those entries are not
  // occurrences in the queue being captured.  When the counts do line up,
  // reverse the recent-first history back into queue order.
  if (currentIndex === 0) return [];
  if (history.length !== currentIndex) {
    throw new Error('queue cursor does not match the available queue history');
  }
  return [...history].reverse();
}

function scanForSensitiveValues(value, path = 'snapshot') {
  if (typeof value === 'string') {
    if (/\b(?:https?|file|ftp):\/\//i.test(value)) {
      throw new Error(`raw URL is not permitted in ${path}`);
    }
    if (/(?:access[_-]?token|refresh[_-]?token|authorization|bearer\s|password|secret|stream[_-]?url)/i.test(value)) {
      throw new Error(`credential-like value is not permitted in ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSensitiveValues(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|password|secret|authorization|sessionId|receiverId|deviceName|artworkUrl|streamUrl)/i.test(key)) {
      throw new Error(`sensitive field ${path}.${key} is not permitted`);
    }
    scanForSensitiveValues(child, `${path}.${key}`);
  }
}

export function captureQobuzQueueSnapshot({ snapshot, capturedAt = new Date().toISOString(), snapshotId = randomUUID() }) {
  const source = object(snapshot, 'adapter snapshot');
  if (source.active !== true || source.ownershipState !== 'confirmed-active' || source.receiverActive !== true) {
    throw new Error('Qobuz Connect must be freshly confirmed-active to capture a queue');
  }
  if (source.timingStable !== true) {
    throw new Error('playback timing is not stable enough to capture a cursor');
  }
  const { value: queue, history, current, upcoming } = queueTracks(source.queue);
  if (queue.available !== true) throw new Error('authoritative Qobuz queue is unavailable');
  const fingerprint = text(queue.queueFingerprint, 'queue.queueFingerprint', { required: true });
  if (!SAFE_FINGERPRINT.test(fingerprint)) throw new Error('queue fingerprint is not a safe Qobuz fingerprint');
  const currentIndex = boundedInteger(queue.currentIndex, 'queue.currentIndex');
  const orderedHistory = orderedHistoryForCapture(history, currentIndex);
  const rawOccurrences = [
    ...orderedHistory.map((track) => ({ track, segment: 'history' })),
    { track: current, segment: 'current' },
    ...upcoming.map((track) => ({ track, segment: 'upcoming' })),
  ];
  if (rawOccurrences.length > MAX_SAVED_QUEUE_OCCURRENCES) {
    throw new Error('saved Qobuz queue has too many occurrences');
  }
  if (queue.totalTracks !== rawOccurrences.length) throw new Error('queue total does not match occurrences');

  const duplicateCounts = new Map();
  const occurrences = rawOccurrences.map(({ track, segment }, position) => {
    const providerTrackId = numericId(track.qobuzTrackId, 'track.qobuzTrackId');
    const duplicateOrdinal = duplicateCounts.get(providerTrackId) ?? 0;
    duplicateCounts.set(providerTrackId, duplicateOrdinal + 1);
    return occurrenceFromTrack(track, position, segment, fingerprint, duplicateOrdinal);
  });
  const currentOccurrence = occurrences[currentIndex];
  if (!currentOccurrence || currentOccurrence.segment !== 'current') throw new Error('current occurrence is missing');
  if (String(source.qobuzTrackId) !== currentOccurrence.providerTrackId) {
    throw new Error('adapter playback identity does not match queue cursor');
  }

  const elapsedSec = finiteNumber(source.elapsedSec, 'snapshot.elapsedSec');
  const durationSec = finiteNumber(source.durationSec, 'snapshot.durationSec') ?? currentOccurrence.metadata.durationSec;
  const normalizedCapturedAt = new Date(capturedAt).toISOString();
  const normalizedSnapshotId = text(snapshotId, 'snapshotId', { required: true });
  const result = {
    schemaVersion: SAVED_QUEUE_SCHEMA_VERSION,
    kind: SAVED_QUEUE_KIND,
    snapshotId: normalizedSnapshotId,
    provider: QOBUZ_PROVIDER,
    capturedAt: normalizedCapturedAt,
    capture: {
      transport: 'qobuz-connect',
      adapter: 'pibuz-read-only',
      ownershipState: 'confirmed-active',
      playbackState: normalizedPlaybackState(source.state),
      timingStable: true,
    },
    queue: {
      fingerprint,
      shuffle: queue.shuffle === true,
      repeat: text(queue.repeat, 'queue.repeat') ?? 'off',
      stopAfterTrackId: queue.stopAfterTrackId === null || queue.stopAfterTrackId === undefined
        ? null
        : numericId(queue.stopAfterTrackId, 'queue.stopAfterTrackId'),
      currentIndex,
      historyCount: orderedHistory.length,
      upcomingCount: upcoming.length,
      occurrences,
    },
    cursor: {
      occurrenceKey: currentOccurrence.occurrenceKey,
      currentIndex,
      playbackState: normalizedPlaybackState(source.state),
      elapsedSec,
      durationSec,
      timingStable: true,
    },
    restoration: {
      sessionIndependent: true,
      requiresFreshQobuzConnect: true,
      occurrenceIdentity: 'snapshot-position',
      queueReplacement: 'not-proven',
      playbackPosition: 'advisory-only',
    },
  };
  validateSavedQueueSnapshot(result);
  return result;
}

export function validateSavedQueueSnapshot(snapshot) {
  const value = object(snapshot, 'saved queue snapshot');
  if (value.schemaVersion !== SAVED_QUEUE_SCHEMA_VERSION) throw new Error('unsupported saved queue schemaVersion');
  if (value.kind !== SAVED_QUEUE_KIND) throw new Error('invalid saved queue kind');
  if (text(value.snapshotId, 'snapshotId', { required: true }) === null) throw new Error('snapshotId is required');
  if (value.provider !== QOBUZ_PROVIDER) throw new Error('saved queue provider must be qobuz');
  if (Number.isNaN(Date.parse(value.capturedAt))) throw new Error('capturedAt must be an ISO timestamp');
  const capture = object(value.capture, 'capture');
  if (capture.transport !== 'qobuz-connect' || capture.adapter !== 'pibuz-read-only') {
    throw new Error('saved queue capture provenance is invalid');
  }
  if (capture.ownershipState !== 'confirmed-active' || capture.timingStable !== true) {
    throw new Error('saved queue was not captured from stable active ownership');
  }
  const queue = object(value.queue, 'queue');
  const fingerprint = text(queue.fingerprint, 'queue.fingerprint', { required: true });
  if (!SAFE_FINGERPRINT.test(fingerprint)) throw new Error('queue.fingerprint is invalid');
  const occurrences = queue.occurrences;
  if (!Array.isArray(occurrences) || occurrences.length === 0) throw new Error('queue.occurrences must be non-empty');
  if (occurrences.length > MAX_SAVED_QUEUE_OCCURRENCES) {
    throw new Error('queue.occurrences exceeds the saved queue limit');
  }
  const currentIndex = boundedInteger(queue.currentIndex, 'queue.currentIndex');
  if (currentIndex >= occurrences.length) throw new Error('queue.currentIndex is out of range');
  if (queue.historyCount !== currentIndex || queue.upcomingCount !== occurrences.length - currentIndex - 1) {
    throw new Error('queue history/upcoming boundaries are inconsistent');
  }
  const seenKeys = new Set();
  occurrences.forEach((occurrence, position) => {
    const item = object(occurrence, `occurrences[${position}]`);
    if (item.position !== position) throw new Error('queue occurrence positions must be contiguous');
    if (item.occurrenceKey !== `qobuz:${fingerprint}:${position}`) throw new Error('queue occurrence identity is invalid');
    if (seenKeys.has(item.occurrenceKey)) throw new Error('duplicate occurrence identity');
    seenKeys.add(item.occurrenceKey);
    const expectedSegment = position < currentIndex ? 'history' : position === currentIndex ? 'current' : 'upcoming';
    if (item.segment !== expectedSegment) throw new Error('queue occurrence segment is invalid');
    if (item.provider !== QOBUZ_PROVIDER) throw new Error('queue occurrence provider is invalid');
    numericId(item.providerTrackId, `occurrences[${position}].providerTrackId`);
    boundedInteger(item.duplicateOrdinal, `occurrences[${position}].duplicateOrdinal`);
    const metadata = object(item.metadata, `occurrences[${position}].metadata`);
    trackMetadata({ ...metadata, qobuzTrackId: item.providerTrackId });
  });
  if (queue.shuffle !== true && queue.shuffle !== false) throw new Error('queue.shuffle must be boolean');
  text(queue.repeat, 'queue.repeat', { required: true });
  if (queue.stopAfterTrackId !== null) numericId(queue.stopAfterTrackId, 'queue.stopAfterTrackId');
  const cursor = object(value.cursor, 'cursor');
  if (cursor.currentIndex !== currentIndex || cursor.occurrenceKey !== occurrences[currentIndex].occurrenceKey) {
    throw new Error('cursor does not match queue current occurrence');
  }
  finiteNumber(cursor.elapsedSec, 'cursor.elapsedSec', { nullable: false });
  finiteNumber(cursor.durationSec, 'cursor.durationSec');
  if (cursor.timingStable !== true) throw new Error('cursor timing must be stable for a captured snapshot');
  const restoration = object(value.restoration, 'restoration');
  if (restoration.sessionIndependent !== true || restoration.requiresFreshQobuzConnect !== true) {
    throw new Error('restoration independence requirements are invalid');
  }
  scanForSensitiveValues(value);
  return true;
}

export function serializeSavedQueueSnapshot(snapshot) {
  validateSavedQueueSnapshot(snapshot);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function deserializeSavedQueueSnapshot(serialized) {
  if (typeof serialized !== 'string' || serialized.length > 2_000_000) {
    throw new Error('serialized saved queue must be a bounded string');
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('serialized saved queue is not valid JSON');
  }
  validateSavedQueueSnapshot(parsed);
  return parsed;
}

export function buildQobuzRestorePlan(
  snapshot,
  { expectedCurrentQueueFingerprint = null, unavailableTrackIds = [] } = {},
) {
  validateSavedQueueSnapshot(snapshot);
  const occurrences = snapshot.queue.occurrences;
  const trackIds = occurrences.map((occurrence) => occurrence.providerTrackId);
  const duplicateOccurrences = trackIds.length - new Set(trackIds).size;
  if (!Array.isArray(unavailableTrackIds)) throw new Error('unavailableTrackIds must be an array');
  const unavailable = [...new Set(unavailableTrackIds.map((id) => numericId(id, 'unavailableTrackIds')))].filter((id) => trackIds.includes(id));
  return {
    schemaVersion: SAVED_QUEUE_SCHEMA_VERSION,
    kind: 'sonuvi.qobuz-restore-plan',
    executable: false,
    blockedReason: unavailable.length > 0
      ? 'one or more saved occurrences are unavailable in the target Qobuz catalog'
      : 'queue replacement is not proven safe through the installed PiBuZ interface',
    provider: QOBUZ_PROVIDER,
    sourceSnapshotId: snapshot.snapshotId,
    requirements: {
      explicitUserConfirmation: true,
      freshOwnershipState: 'confirmed-active',
      expectedCurrentQueueFingerprint,
      trackAvailabilityProof: 'required',
      unavailableTrackIds: unavailable,
      atomicReplace: 'unproven',
      cloudAcknowledgement: 'unverified',
      officialAppVisibility: 'unverified',
      automaticRetry: false,
    },
    abstractOperations: [
      { kind: 'read-current-qobuz-state', mutating: false, required: true },
      { kind: 'resolve-all-track-ids', mutating: false, required: true, count: trackIds.length },
      {
        kind: 'replace-queue',
        mutating: true,
        executable: false,
        protocol: 'qobuz-queue-load',
        trackIds,
        queuePosition: snapshot.cursor.currentIndex,
        autoplayReset: 'must-be-explicitly-proven-false',
      },
      { kind: 'verify-authoritative-queue', mutating: false, required: true },
    ],
    duplicateOccurrences,
    unavailableOccurrences: occurrences
      .map((occurrence, index) => ({ occurrenceKey: occurrence.occurrenceKey, position: index, providerTrackId: occurrence.providerTrackId }))
      .filter((occurrence) => unavailable.includes(occurrence.providerTrackId)),
    cursor: {
      currentIndex: snapshot.cursor.currentIndex,
      elapsedSec: snapshot.cursor.elapsedSec,
      restoration: 'advisory-only; position requires a separate verified seek and must not be assumed',
    },
    partialFailure: {
      automaticRollback: false,
      reason: 'no atomic replacement or proven inverse operation is exposed',
      userAction: 'report the authoritative partial queue and require a new explicit decision',
    },
  };
}
