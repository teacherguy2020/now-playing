export const BRIDGE_PROTOCOL_VERSION = 1;
export const MAX_TRACKS = 1000;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 32 * 1024;
export const LOCAL_SOCKET_PATH = '/run/sonuvi-pibuz-bridge.sock';

function exactKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key));
}

function text(value) {
  return String(value ?? '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeVersion(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && exactKeys(value, new Set(['major', 'minor']))
    && Number.isSafeInteger(value.major) && value.major >= 0
    && Number.isSafeInteger(value.minor) && value.minor >= 0;
}

export function validateLoadRequest(value) {
  if (!exactKeys(value, new Set([
    'kind', 'protocol_version', 'operation_id', 'session_uuid',
    'expected_queue_version', 'track_ids', 'start_index', 'intent',
  ]))) throw new Error('bridge request contains unknown fields');
  if (value.kind !== 'load_saved_queue' || value.protocol_version !== BRIDGE_PROTOCOL_VERSION) {
    throw new Error('bridge protocol version is unsupported');
  }
  if (!isUuid(text(value.operation_id))) throw new Error('operation_id is invalid');
  if (!text(value.session_uuid) || text(value.session_uuid).length > 128) {
    throw new Error('session_uuid is invalid');
  }
  if (!safeVersion(value.expected_queue_version)) throw new Error('expected_queue_version is invalid');
  if (!Array.isArray(value.track_ids) || value.track_ids.length === 0 || value.track_ids.length > MAX_TRACKS) {
    throw new Error('track_ids exceeds the saved queue limit');
  }
  if (value.track_ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 0xffffffff)) {
    throw new Error('track_ids contains an invalid Qobuz track ID');
  }
  if (!Number.isSafeInteger(value.start_index) || value.start_index < 0
      || value.start_index >= value.track_ids.length) {
    throw new Error('start_index is outside the saved queue');
  }
  if (value.intent !== 'replace_and_play') throw new Error('saved queue intent is unsupported');
  return {
    kind: 'load_saved_queue',
    protocol_version: BRIDGE_PROTOCOL_VERSION,
    operation_id: text(value.operation_id),
    session_uuid: text(value.session_uuid),
    expected_queue_version: {
      major: value.expected_queue_version.major,
      minor: value.expected_queue_version.minor,
    },
    track_ids: [...value.track_ids],
    start_index: value.start_index,
    intent: 'replace_and_play',
  };
}

export function validateStatusRequest(value) {
  if (!exactKeys(value, new Set(['kind', 'protocol_version', 'operation_id']))) {
    throw new Error('bridge status request contains unknown fields');
  }
  if (value.kind !== 'get_status' || value.protocol_version !== BRIDGE_PROTOCOL_VERSION) {
    throw new Error('bridge protocol version is unsupported');
  }
  if (!isUuid(text(value.operation_id))) throw new Error('operation_id is invalid');
  return {
    kind: 'get_status',
    protocol_version: BRIDGE_PROTOCOL_VERSION,
    operation_id: text(value.operation_id),
  };
}

export function validateOwnershipRequest(value) {
  if (!exactKeys(value, new Set(['kind', 'protocol_version']))) {
    throw new Error('bridge ownership request contains unknown fields');
  }
  if (value.kind !== 'get_ownership' || value.protocol_version !== BRIDGE_PROTOCOL_VERSION) {
    throw new Error('bridge protocol version is unsupported');
  }
  return {
    kind: 'get_ownership',
    protocol_version: BRIDGE_PROTOCOL_VERSION,
  };
}

export function normalizeRequest(value) {
  return value?.kind === 'load_saved_queue'
    ? validateLoadRequest(value)
    : value?.kind === 'get_ownership'
      ? validateOwnershipRequest(value)
      : validateStatusRequest(value);
}

export function requestBytes(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8') + 1;
  if (bytes > MAX_REQUEST_BYTES) throw new Error('bridge request exceeds the size limit');
  return bytes;
}

export function parseResponse(raw, expectedOperationId) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('bridge response exceeds the size limit');
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('bridge returned malformed JSON');
  }
  if (!value || typeof value !== 'object' || value.protocol_version !== BRIDGE_PROTOCOL_VERSION) {
    throw new Error('bridge returned an unsupported response');
  }
  if (value.operation_id !== expectedOperationId) {
    throw new Error('bridge response operation does not match the request');
  }
  if (!['accepted', 'status', 'rejected'].includes(value.kind)) {
    throw new Error('bridge returned an unknown response kind');
  }
  if (value.kind === 'rejected') {
    return {
      kind: 'rejected',
      protocol_version: BRIDGE_PROTOCOL_VERSION,
      operation_id: expectedOperationId,
      code: text(value.code).slice(0, 96) || 'bridge_rejected',
      message: text(value.message).slice(0, 256) || 'saved queue bridge rejected the request',
    };
  }
  return {
    kind: value.kind,
    protocol_version: BRIDGE_PROTOCOL_VERSION,
    operation_id: expectedOperationId,
    ...(value.submitted === undefined ? {} : { submitted: value.submitted === true }),
    ...(value.found === undefined ? {} : { found: value.found === true }),
    ...(value.status && typeof value.status === 'object' ? { status: value.status } : {}),
  };
}

export function parseOwnershipResponse(raw) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('bridge response exceeds the size limit');
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('bridge returned malformed JSON');
  }
  if (!value || typeof value !== 'object' || value.protocol_version !== BRIDGE_PROTOCOL_VERSION
      || value.kind !== 'ownership' || typeof value.active !== 'boolean') {
    throw new Error('bridge returned an unsupported ownership response');
  }
  if (value.active !== true) {
    return {
      kind: 'ownership',
      protocol_version: BRIDGE_PROTOCOL_VERSION,
      active: false,
      session_uuid: null,
      queue_version: null,
    };
  }
  if (typeof value.session_uuid !== 'string' || !value.session_uuid.trim()
      || value.session_uuid.length > 128 || !safeVersion(value.queue_version)) {
    throw new Error('bridge ownership response is invalid');
  }
  return {
    kind: 'ownership',
    protocol_version: BRIDGE_PROTOCOL_VERSION,
    active: true,
    session_uuid: value.session_uuid.trim(),
    queue_version: {
      major: value.queue_version.major,
      minor: value.queue_version.minor,
    },
  };
}
