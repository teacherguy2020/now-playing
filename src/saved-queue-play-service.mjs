import { randomUUID } from 'node:crypto';

import {
  validateSavedQobuzQueueRecord,
} from './lib/saved-qobuz-queues.mjs';
import {
  MAX_SAVED_QUEUE_OCCURRENCES,
  validateSavedQueueSnapshot,
} from './lib/saved-qobuz-queue.mjs';
import {
  BRIDGE_PROTOCOL_VERSION,
  MAX_TRACKS,
} from './protocol.mjs';

const SAVED_QUEUE_ID_PATTERN = /^sq_[A-Za-z0-9-]{1,120}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OPERATIONS = 32;
const RETENTION_MS = 15 * 60 * 1000;
const MAX_REASON_LENGTH = 96;

const BRIDGE_STATES = new Set([
  'validated',
  'accepted_locally',
  'publication_pending',
  'cloud_confirmed',
  'readback_verified',
  'rejected',
  'timed_out',
  'ambiguous',
]);

const TERMINAL_STATES = new Set(['readback_verified', 'rejected', 'timed_out']);

function text(value) {
  return String(value ?? '').trim();
}

function isUuid(value) {
  return UUID_PATTERN.test(text(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function safeVersion(value) {
  return isObject(value)
    && exactKeys(value, new Set(['major', 'minor']))
    && Number.isSafeInteger(value.major)
    && value.major >= 0
    && Number.isSafeInteger(value.minor)
    && value.minor >= 0;
}

function safeQueueId(value) {
  const id = text(value);
  if (!SAVED_QUEUE_ID_PATTERN.test(id)) throw new Error('savedQueueId is invalid');
  return id;
}

function safeTrackId(value) {
  const id = text(value);
  if (!/^\d+$/.test(id)) throw new Error('saved queue contains an invalid Qobuz track identity');
  const number = Number(id);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 0xffffffff) {
    throw new Error('saved queue contains an invalid Qobuz track identity');
  }
  return number;
}

function validatePlayInput(input) {
  if (!exactKeys(input, new Set(['savedQueueId', 'confirm', 'startIndex']))) {
    throw new Error('saved queue play accepts only savedQueueId, confirm, and startIndex');
  }
  const savedQueueId = safeQueueId(input.savedQueueId);
  if (input.confirm !== true) throw new Error('explicit queue replacement confirmation is required');
  const startIndex = input.startIndex === undefined ? 0 : input.startIndex;
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('startIndex is invalid');
  return { savedQueueId, confirm: true, startIndex };
}

function operationFingerprint({ version, trackIds, startIndex }) {
  let hash = 0xcbf29ce484222325n;
  const feed = (value) => {
    let current = BigInt(value);
    for (let index = 0; index < 8; index += 1) {
      hash ^= current & 0xffn;
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
      current >>= 8n;
    }
  };
  feed(version.major);
  feed(version.minor);
  feed(startIndex);
  for (const trackId of trackIds) feed(trackId);
  return hash.toString();
}

function normalizeSavedRecord(record) {
  try {
    validateSavedQobuzQueueRecord(record);
    validateSavedQueueSnapshot(record.snapshot);
  } catch {
    throw Object.assign(new Error('saved Qobuz queue snapshot is invalid'), {
      code: 'SAVED_QUEUE_SNAPSHOT_INVALID',
    });
  }

  const snapshot = record.snapshot;
  const occurrences = snapshot.queue.occurrences;
  if (!Array.isArray(occurrences)
      || occurrences.length === 0
      || occurrences.length > MAX_SAVED_QUEUE_OCCURRENCES
      || snapshot.queue.currentIndex < 0
      || snapshot.queue.currentIndex >= occurrences.length
      || snapshot.queue.historyCount !== snapshot.queue.currentIndex
      || snapshot.queue.upcomingCount !== occurrences.length - snapshot.queue.currentIndex - 1) {
    throw Object.assign(new Error('saved Qobuz queue snapshot is incomplete'), {
      code: 'SAVED_QUEUE_SNAPSHOT_INVALID',
    });
  }

  const trackIds = occurrences.map((occurrence) => safeTrackId(occurrence.providerTrackId));
  if (trackIds.length > MAX_TRACKS) {
    throw Object.assign(new Error('saved Qobuz queue exceeds the playback limit'), {
      code: 'SAVED_QUEUE_TOO_LARGE',
    });
  }

  // The returned vector deliberately contains repeated values when the saved
  // queue contains duplicate occurrences.  Position and occurrenceKey remain
  // authoritative; a Set-based deduplication here would change playback.
  return {
    snapshot,
    trackIds,
    sourceSnapshotId: snapshot.snapshotId,
  };
}

function normalizeOwnership(ownership) {
  if (!isObject(ownership)
      || ownership.active !== true
      || (ownership.ownershipState !== undefined && ownership.ownershipState !== 'confirmed-active')
      || ownership.receiverActive === false
      || ownership.fresh === false
      || !text(ownership.sessionUuid)
      || text(ownership.sessionUuid).length > 128
      || !safeVersion(ownership.queueVersion)) {
    return null;
  }
  return {
    sessionUuid: text(ownership.sessionUuid),
    queueVersion: {
      major: ownership.queueVersion.major,
      minor: ownership.queueVersion.minor,
    },
  };
}

function sanitizeReason(value) {
  const reason = text(value).slice(0, MAX_REASON_LENGTH);
  return /^[a-z0-9_.:-]+$/i.test(reason) ? reason : null;
}

function sanitizeBridgeStatus(value, operationId) {
  if (!isObject(value)
      || value.operation_id !== operationId
      || !BRIDGE_STATES.has(value.state)
      || !Number.isSafeInteger(value.start_index)
      || value.start_index < 0
      || !Number.isSafeInteger(value.track_count)
      || value.track_count <= 0
      || value.track_count > MAX_TRACKS
      || !/^\d{1,24}$/.test(text(value.track_vector_fingerprint))
      || !safeVersion(value.expected_queue_version)) {
    return null;
  }

  let cloudQueueVersion = null;
  if (value.cloud_queue_version !== null && value.cloud_queue_version !== undefined) {
    if (!safeVersion(value.cloud_queue_version)) return null;
    cloudQueueVersion = {
      major: value.cloud_queue_version.major,
      minor: value.cloud_queue_version.minor,
    };
  }

  const timestamp = (candidate) => (
    Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null
  );
  const createdAtMs = timestamp(value.created_at_ms);
  const updatedAtMs = timestamp(value.updated_at_ms);
  if (createdAtMs === null || updatedAtMs === null) return null;

  return {
    operation_id: operationId,
    state: value.state,
    start_index: value.start_index,
    track_count: value.track_count,
    track_vector_fingerprint: text(value.track_vector_fingerprint),
    expected_queue_version: {
      major: value.expected_queue_version.major,
      minor: value.expected_queue_version.minor,
    },
    cloud_queue_version: cloudQueueVersion,
    reason_code: value.reason_code === null || value.reason_code === undefined
      ? null
      : sanitizeReason(value.reason_code),
    created_at_ms: createdAtMs,
    updated_at_ms: updatedAtMs,
  };
}

function publicState(status) {
  switch (status?.state) {
    case 'cloud_confirmed':
      return 'correlated_confirmation_received';
    case 'readback_verified':
      return 'authoritative_readback_verified';
    default:
      return status?.state || 'unknown';
  }
}

function publicStatus(operation) {
  const status = operation.latestStatus;
  if (!status) return null;
  return {
    operationId: operation.operationId,
    state: publicState(status),
    operationStatus: status,
    cloudAcceptance: 'unverified',
    sourceSnapshotId: operation.sourceSnapshotId,
  };
}

function isTerminal(status) {
  return TERMINAL_STATES.has(status?.state);
}

function mapBridgeRejection(code) {
  switch (text(code)) {
    case 'qconnect_inactive':
      return 'QOBUZ_CONNECT_OWNERSHIP_UNAVAILABLE';
    case 'operation_conflict':
      return 'QOBUZ_OPERATION_CONFLICT';
    case 'registry_full':
      return 'QOBUZ_OPERATION_CAPACITY';
    case 'invalid_request':
      return 'BRIDGE_REQUEST_REJECTED';
    default:
      return 'QOBUZ_QUEUE_LOAD_REJECTED';
  }
}

function storageErrorResult(error) {
  if (error?.code === 'SAVED_QOBUZ_QUEUE_NOT_FOUND') {
    return { status: 404, errorCode: 'SAVED_QUEUE_NOT_FOUND' };
  }
  if (['EACCES', 'EIO', 'ENOSPC', 'EMFILE'].includes(error?.code)) {
    return { status: 503, errorCode: 'SAVED_QUEUE_STORAGE_UNAVAILABLE' };
  }
  if (error?.code === 'SAVED_QUEUE_TOO_LARGE') {
    return { status: 400, errorCode: 'SAVED_QUEUE_TOO_LARGE' };
  }
  return { status: 409, errorCode: 'SAVED_QUEUE_SNAPSHOT_INVALID' };
}

function publicError(errorCode, operationId = undefined, state = undefined) {
  return {
    status: errorCode === 'QOBUZ_QUEUE_LOAD_TIMED_OUT' ? 504
      : errorCode === 'QOBUZ_QUEUE_LOAD_REJECTED' ? 409
        : errorCode === 'QOBUZ_CONNECT_OWNERSHIP_UNAVAILABLE' ? 409
          : errorCode === 'QOBUZ_QUEUE_VERSION_CONFLICT' ? 409
            : errorCode === 'SAVED_QUEUE_OPERATION_IN_FLIGHT' ? 409
              : errorCode === 'BRIDGE_PROTOCOL_INVALID' || errorCode === 'BRIDGE_UNAVAILABLE' ? 502
                : 400,
    ...(operationId ? { operationId } : {}),
    errorCode,
    ...(state ? { state } : {}),
  };
}

function statusErrorCode(status) {
  if (status?.reason_code === 'queue_version_stale' || status?.reason_code === 'queue_version_conflict') {
    return 'QOBUZ_QUEUE_VERSION_CONFLICT';
  }
  if (status?.state === 'timed_out') return 'QOBUZ_QUEUE_LOAD_TIMED_OUT';
  if (status?.state === 'rejected') return 'QOBUZ_QUEUE_LOAD_REJECTED';
  return null;
}

function responseForStatus(operation, status, { submitted = true } = {}) {
  const code = statusErrorCode(status);
  if (code) {
    return publicError(code, operation.operationId, publicState(status));
  }
  const result = publicStatus(operation);
  return {
    status: status.state === 'readback_verified' ? 200 : submitted ? 202 : 200,
    ...result,
  };
}

function prune(operations, now, activeOperationId) {
  for (const [operationId, operation] of operations) {
    if (now - operation.createdAt > RETENTION_MS && operationId !== activeOperationId) {
      operations.delete(operationId);
    }
  }
}

/**
 * Server-side application adapter for the future mobile play route.
 *
 * `savedQueueStore.load()` is the Phase A storage API. `adapter` must be the
 * B5 local Unix-socket client; this module has no SSH, shell, host, key, or
 * filesystem-path input from the mobile request.
 */
export function createSavedQueuePlayService({
  savedQueueStore,
  loadSavedQueue,
  getFreshQobuzOwnership,
  adapter,
  now = () => Date.now(),
  id = randomUUID,
} = {}) {
  const loadRecord = savedQueueStore?.load
    ? ({ savedQueueId }) => savedQueueStore.load(savedQueueId)
    : loadSavedQueue;
  if (typeof loadRecord !== 'function'
      || typeof getFreshQobuzOwnership !== 'function'
      || !adapter
      || typeof adapter.loadSavedQueue !== 'function'
      || typeof adapter.getStatus !== 'function') {
    throw new Error('saved queue play service dependencies are incomplete');
  }

  const operations = new Map();
  let activeOperationId = null;

  function releaseIfTerminal(operation) {
    if (activeOperationId === operation.operationId && isTerminal(operation.latestStatus)) {
      activeOperationId = null;
    }
  }

  async function play({ userId, input }) {
    const principal = text(userId);
    if (!principal) return { status: 401, errorCode: 'MOBILE_AUTH_REQUIRED' };

    prune(operations, now(), activeOperationId);
    if (activeOperationId) {
      const active = operations.get(activeOperationId);
      if (active && !isTerminal(active.latestStatus)) {
        return publicError('SAVED_QUEUE_OPERATION_IN_FLIGHT', active.operationId, publicState(active.latestStatus));
      }
      activeOperationId = null;
    }

    let request;
    try {
      request = validatePlayInput(input);
    } catch {
      return publicError('SAVED_QUEUE_REQUEST_INVALID');
    }

    let record;
    try {
      record = await loadRecord({ userId: principal, savedQueueId: request.savedQueueId });
    } catch (error) {
      return storageErrorResult(error);
    }
    if (!record) return { status: 404, errorCode: 'SAVED_QUEUE_NOT_FOUND' };

    let normalized;
    try {
      normalized = normalizeSavedRecord(record);
    } catch (error) {
      return storageErrorResult(error);
    }
    if (request.startIndex >= normalized.trackIds.length) {
      return { status: 400, errorCode: 'SAVED_QUEUE_START_INVALID' };
    }

    let ownership;
    try {
      ownership = normalizeOwnership(await getFreshQobuzOwnership({ userId: principal }));
    } catch {
      ownership = null;
    }
    if (!ownership) return publicError('QOBUZ_CONNECT_OWNERSHIP_UNAVAILABLE');

    let operationId;
    try {
      operationId = text(id());
    } catch {
      operationId = '';
    }
    if (!isUuid(operationId) || operations.has(operationId)) {
      return publicError('QOBUZ_OPERATION_ID_UNAVAILABLE');
    }

    const bridgeRequest = {
      kind: 'load_saved_queue',
      protocol_version: BRIDGE_PROTOCOL_VERSION,
      operation_id: operationId,
      session_uuid: ownership.sessionUuid,
      expected_queue_version: ownership.queueVersion,
      track_ids: normalized.trackIds,
      start_index: request.startIndex,
      intent: 'replace_and_play',
    };
    const operation = {
      operationId,
      userId: principal,
      createdAt: now(),
      request: bridgeRequest,
      sourceSnapshotId: normalized.sourceSnapshotId,
      expectedFingerprint: operationFingerprint({
        version: ownership.queueVersion,
        trackIds: normalized.trackIds,
        startIndex: request.startIndex,
      }),
      latestStatus: null,
    };
    operations.set(operationId, operation);
    activeOperationId = operationId;

    let bridgeResponse;
    try {
      bridgeResponse = await adapter.loadSavedQueue(bridgeRequest);
    } catch {
      // A transport failure after submission is ambiguous.  It is never
      // retried; the caller must use status-only recovery.
      operation.latestStatus = {
        operation_id: operationId,
        state: 'ambiguous',
        start_index: request.startIndex,
        track_count: normalized.trackIds.length,
        track_vector_fingerprint: operation.expectedFingerprint,
        expected_queue_version: ownership.queueVersion,
        cloud_queue_version: null,
        reason_code: 'transport_lost',
        created_at_ms: operation.createdAt,
        updated_at_ms: now(),
      };
      return publicError('BRIDGE_UNAVAILABLE', operationId, 'ambiguous');
    }

    if (!isObject(bridgeResponse) || bridgeResponse.operation_id !== operationId) {
      operation.latestStatus = { ...operation.latestStatus, state: 'ambiguous' };
      return publicError('BRIDGE_PROTOCOL_INVALID', operationId, 'ambiguous');
    }
    if (bridgeResponse.kind === 'rejected') {
      const errorCode = mapBridgeRejection(bridgeResponse.code);
      const reason = text(bridgeResponse.code);
      if (reason === 'queue_version_stale' || reason === 'queue_version_conflict') {
        operation.latestStatus = {
          operation_id: operationId,
          state: 'rejected',
          start_index: request.startIndex,
          track_count: normalized.trackIds.length,
          track_vector_fingerprint: operation.expectedFingerprint,
          expected_queue_version: ownership.queueVersion,
          cloud_queue_version: null,
          reason_code: 'queue_version_conflict',
          created_at_ms: operation.createdAt,
          updated_at_ms: now(),
        };
        activeOperationId = null;
        return publicError('QOBUZ_QUEUE_VERSION_CONFLICT', operationId, 'rejected');
      }
      operation.latestStatus = {
        operation_id: operationId,
        state: 'rejected',
        start_index: request.startIndex,
        track_count: normalized.trackIds.length,
        track_vector_fingerprint: operation.expectedFingerprint,
        expected_queue_version: ownership.queueVersion,
        cloud_queue_version: null,
        reason_code: sanitizeReason(bridgeResponse.code) || 'bridge_rejected',
        created_at_ms: operation.createdAt,
        updated_at_ms: now(),
      };
      activeOperationId = null;
      return publicError(errorCode, operationId, 'rejected');
    }
    if (bridgeResponse.kind !== 'accepted') {
      operation.latestStatus = { ...operation.latestStatus, state: 'ambiguous' };
      return publicError('BRIDGE_PROTOCOL_INVALID', operationId, 'ambiguous');
    }

    const status = sanitizeBridgeStatus(bridgeResponse.status, operationId);
    if (!status
        || status.track_count !== normalized.trackIds.length
        || status.start_index !== request.startIndex
        || status.track_vector_fingerprint !== operation.expectedFingerprint
        || status.expected_queue_version.major !== ownership.queueVersion.major
        || status.expected_queue_version.minor !== ownership.queueVersion.minor) {
      operation.latestStatus = {
        operation_id: operationId,
        state: 'ambiguous',
        start_index: request.startIndex,
        track_count: normalized.trackIds.length,
        track_vector_fingerprint: operation.expectedFingerprint,
        expected_queue_version: ownership.queueVersion,
        cloud_queue_version: null,
        reason_code: 'readback_mismatch',
        created_at_ms: operation.createdAt,
        updated_at_ms: now(),
      };
      return publicError('BRIDGE_PROTOCOL_INVALID', operationId, 'ambiguous');
    }
    operation.latestStatus = status;
    releaseIfTerminal(operation);
    return responseForStatus(operation, status, { submitted: bridgeResponse.submitted === true });
  }

  async function status({ userId, operationId }) {
    const principal = text(userId);
    const normalizedOperationId = text(operationId);
    if (!principal) return { status: 401, errorCode: 'MOBILE_AUTH_REQUIRED' };
    if (!isUuid(normalizedOperationId)) return { status: 400, errorCode: 'OPERATION_ID_INVALID' };
    const operation = operations.get(normalizedOperationId);
    if (!operation || operation.userId !== principal) return { status: 404, errorCode: 'OPERATION_NOT_FOUND' };

    let bridgeResponse;
    try {
      bridgeResponse = await adapter.getStatus(normalizedOperationId);
    } catch {
      return publicError('BRIDGE_UNAVAILABLE', normalizedOperationId, 'ambiguous');
    }
    if (!isObject(bridgeResponse)
        || bridgeResponse.kind !== 'status'
        || bridgeResponse.operation_id !== normalizedOperationId) {
      return publicError('BRIDGE_PROTOCOL_INVALID', normalizedOperationId, 'ambiguous');
    }
    if (bridgeResponse.found !== true || !bridgeResponse.status) {
      // A process-local B3 registry cannot prove what happened across a
      // restart.  Report no-replay recovery and keep the mutation gate closed.
      return {
        status: 202,
        operationId: normalizedOperationId,
        state: 'unknown',
        restartRecovery: 'no_replay',
        cloudAcceptance: 'unverified',
      };
    }

    const statusValue = sanitizeBridgeStatus(bridgeResponse.status, normalizedOperationId);
    if (!statusValue
        || statusValue.track_count !== operation.request.track_ids.length
        || statusValue.start_index !== operation.request.start_index
        || statusValue.track_vector_fingerprint !== operation.expectedFingerprint
        || statusValue.expected_queue_version.major !== operation.request.expected_queue_version.major
        || statusValue.expected_queue_version.minor !== operation.request.expected_queue_version.minor) {
      operation.latestStatus = {
        ...(operation.latestStatus || {}),
        operation_id: normalizedOperationId,
        state: 'ambiguous',
        reason_code: 'readback_mismatch',
        updated_at_ms: now(),
      };
      return publicError('BRIDGE_PROTOCOL_INVALID', normalizedOperationId, 'ambiguous');
    }
    operation.latestStatus = statusValue;
    releaseIfTerminal(operation);
    return responseForStatus(operation, statusValue, { submitted: false });
  }

  return {
    play,
    status,
    operationFingerprint,
    operationCount: () => operations.size,
  };
}

export { operationFingerprint, normalizeSavedRecord, sanitizeBridgeStatus };
