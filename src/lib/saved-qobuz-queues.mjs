import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  captureQobuzQueueSnapshot,
  validateSavedQueueSnapshot,
  QOBUZ_PROVIDER,
} from './saved-qobuz-queue.mjs';

export const SAVED_QOBUZ_QUEUE_RECORD_SCHEMA_VERSION = 1;
export const SAVED_QOBUZ_QUEUE_RECORD_KIND = 'sonuvi.named-qobuz-queue';
export const DEFAULT_SAVED_QOBUZ_QUEUE_DIRECTORY = '/var/lib/sonuvi/saved-qobuz-queues';
export const MAX_SAVED_QOBUZ_QUEUE_RECORDS = 100;

const MAX_TITLE_LENGTH = 200;
const MAX_RECORD_BYTES = 5_000_000;
const SAVED_QUEUE_ID_PATTERN = /^sq_[A-Za-z0-9-]{1,120}$/;
const RECORD_FIELDS = new Set([
  'schemaVersion',
  'kind',
  'savedQueueId',
  'title',
  'provider',
  'sourceSnapshotId',
  'createdAt',
  'updatedAt',
  'snapshot',
]);

function boundedTitle(value, { required = true } = {}) {
  if (typeof value !== 'string') throw new Error('saved queue title must be a string');
  const title = value.trim();
  if (required && !title) throw new Error('saved queue title is required');
  if (title.length > MAX_TITLE_LENGTH) throw new Error('saved queue title is too long');
  return title;
}

function savedQueueId(value) {
  const id = String(value ?? '').trim();
  if (!SAVED_QUEUE_ID_PATTERN.test(id)) throw new Error('savedQueueId is invalid');
  return id;
}

function isoTimestamp(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clockTimestamp(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  return new Date(value).toISOString();
}

function notFoundError(id) {
  const error = new Error(`saved Qobuz queue was not found: ${id}`);
  error.code = 'SAVED_QOBUZ_QUEUE_NOT_FOUND';
  return error;
}

function existsError(id) {
  const error = new Error(`saved Qobuz queue already exists: ${id}`);
  error.code = 'SAVED_QOBUZ_QUEUE_EXISTS';
  return error;
}

function storageLimitError() {
  const error = new Error('saved Qobuz queue storage limit reached');
  error.code = 'SAVED_QOBUZ_QUEUE_STORAGE_LIMIT';
  return error;
}

function summary(record) {
  const occurrences = record.snapshot.queue.occurrences;
  const current = occurrences[record.snapshot.cursor.currentIndex] || null;
  return {
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    savedQueueId: record.savedQueueId,
    title: record.title,
    provider: record.provider,
    sourceSnapshotId: record.sourceSnapshotId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    capturedAt: record.snapshot.capturedAt,
    queueFingerprint: record.snapshot.queue.fingerprint,
    occurrenceCount: record.snapshot.queue.occurrences.length,
    currentIndex: record.snapshot.queue.currentIndex,
    historyCount: record.snapshot.queue.historyCount,
    upcomingCount: record.snapshot.queue.upcomingCount,
    shuffle: record.snapshot.queue.shuffle,
    repeat: record.snapshot.queue.repeat,
    artworkRef: current?.metadata?.artworkRef
      || occurrences.find((occurrence) => occurrence?.metadata?.artworkRef)?.metadata?.artworkRef
      || null,
    cursor: {
      occurrenceKey: record.snapshot.cursor.occurrenceKey,
      currentIndex: record.snapshot.cursor.currentIndex,
      playbackState: record.snapshot.cursor.playbackState,
      elapsedSec: record.snapshot.cursor.elapsedSec,
      durationSec: record.snapshot.cursor.durationSec,
      timingStable: record.snapshot.cursor.timingStable === true,
    },
  };
}

function createRecord({ savedQueueId: id, title, snapshot, createdAt, updatedAt }) {
  validateSavedQueueSnapshot(snapshot);
  const record = {
    schemaVersion: SAVED_QOBUZ_QUEUE_RECORD_SCHEMA_VERSION,
    kind: SAVED_QOBUZ_QUEUE_RECORD_KIND,
    savedQueueId: savedQueueId(id),
    title: boundedTitle(title),
    provider: QOBUZ_PROVIDER,
    sourceSnapshotId: snapshot.snapshotId,
    createdAt: isoTimestamp(createdAt, 'createdAt'),
    updatedAt: isoTimestamp(updatedAt, 'updatedAt'),
    snapshot: clone(snapshot),
  };
  validateSavedQobuzQueueRecord(record);
  return record;
}

export function validateSavedQobuzQueueRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('saved Qobuz queue record must be an object');
  }
  for (const key of Object.keys(record)) {
    if (!RECORD_FIELDS.has(key)) throw new Error(`unexpected saved queue field: ${key}`);
  }
  if (record.schemaVersion !== SAVED_QOBUZ_QUEUE_RECORD_SCHEMA_VERSION) {
    throw new Error('unsupported saved Qobuz queue record schemaVersion');
  }
  if (record.kind !== SAVED_QOBUZ_QUEUE_RECORD_KIND) throw new Error('invalid saved Qobuz queue record kind');
  const id = savedQueueId(record.savedQueueId);
  const title = boundedTitle(record.title);
  if (record.provider !== QOBUZ_PROVIDER) throw new Error('saved Qobuz queue provider is invalid');
  const createdAt = isoTimestamp(record.createdAt, 'createdAt');
  const updatedAt = isoTimestamp(record.updatedAt, 'updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error('updatedAt cannot precede createdAt');
  validateSavedQueueSnapshot(record.snapshot);
  if (record.sourceSnapshotId !== record.snapshot.snapshotId) {
    throw new Error('sourceSnapshotId does not match the saved snapshot');
  }
  return {
    ...record,
    savedQueueId: id,
    title,
    createdAt,
    updatedAt,
  };
}

export function serializeSavedQobuzQueueRecord(record) {
  validateSavedQobuzQueueRecord(record);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error('saved Qobuz queue record is too large');
  }
  return serialized;
}

export function deserializeSavedQobuzQueueRecord(serialized) {
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error('serialized saved Qobuz queue record is too large');
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('serialized saved Qobuz queue record is not valid JSON');
  }
  validateSavedQobuzQueueRecord(parsed);
  return parsed;
}

async function writeAtomic(filePath, payload) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle?.close().catch(() => {});
  }
  try {
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600).catch(() => {});
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export function createSavedQobuzQueueStore({
  directory = DEFAULT_SAVED_QOBUZ_QUEUE_DIRECTORY,
  now = () => Date.now(),
  idFactory = () => randomUUID(),
} = {}) {
  const rawDirectory = String(directory || '').trim();
  if (!path.isAbsolute(rawDirectory)) throw new Error('saved Qobuz queue directory must be absolute');
  const resolvedDirectory = path.resolve(rawDirectory);
  let operation = Promise.resolve();

  const run = (task) => {
    const result = operation.then(task, task);
    operation = result.catch(() => {});
    return result;
  };

  const targetPath = (id) => path.join(resolvedDirectory, `${savedQueueId(id)}.json`);

  const recordCount = async () => {
    let entries;
    try {
      entries = await fs.readdir(resolvedDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return 0;
      throw error;
    }
    return entries.filter((entry) => (
      entry.isFile()
      && entry.name.endsWith('.json')
      && SAVED_QUEUE_ID_PATTERN.test(entry.name.slice(0, -5))
    )).length;
  };

  const readRecord = async (id) => {
    const normalizedId = savedQueueId(id);
    let raw;
    try {
      raw = await fs.readFile(targetPath(normalizedId), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') throw notFoundError(normalizedId);
      throw error;
    }
    return deserializeSavedQobuzQueueRecord(raw);
  };

  const generatedId = () => {
    const candidate = String(idFactory() || '').trim();
    return savedQueueId(candidate.startsWith('sq_') ? candidate : `sq_${candidate}`);
  };

  const save = ({ title, snapshot, savedQueueId: requestedId = null } = {}) => run(async () => {
    const id = requestedId === null ? generatedId() : savedQueueId(requestedId);
    const filePath = targetPath(id);
    try {
      await fs.access(filePath);
      throw existsError(id);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (await recordCount() >= MAX_SAVED_QOBUZ_QUEUE_RECORDS) throw storageLimitError();
    const timestamp = clockTimestamp(now);
    const record = createRecord({
      savedQueueId: id,
      title,
      snapshot,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await writeAtomic(filePath, serializeSavedQobuzQueueRecord(record));
    return clone(record);
  });

  const load = (id) => run(async () => clone(await readRecord(id)));

  const list = () => run(async () => {
    let entries;
    try {
      entries = await fs.readdir(resolvedDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const records = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const id = entry.name.slice(0, -5);
      if (!SAVED_QUEUE_ID_PATTERN.test(id)) continue;
      records.push(await readRecord(id));
    }
    return records
      .map(summary)
      .sort((left, right) => (
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        || left.savedQueueId.localeCompare(right.savedQueueId)
      ));
  });

  const rename = ({ savedQueueId: id, title } = {}) => run(async () => {
    const current = await readRecord(id);
    const updated = createRecord({
      savedQueueId: current.savedQueueId,
      title,
      snapshot: current.snapshot,
      createdAt: current.createdAt,
      updatedAt: clockTimestamp(now),
    });
    await writeAtomic(targetPath(current.savedQueueId), serializeSavedQobuzQueueRecord(updated));
    return clone(updated);
  });

  const remove = ({ savedQueueId: id } = {}) => run(async () => {
    const normalizedId = savedQueueId(id);
    try {
      await fs.unlink(targetPath(normalizedId));
    } catch (error) {
      if (error?.code === 'ENOENT') throw notFoundError(normalizedId);
      throw error;
    }
    return { savedQueueId: normalizedId, deleted: true };
  });

  const captureAndSave = ({ title, adapterSnapshot, capturedAt, snapshotId, savedQueueId: requestedId = null } = {}) => {
    const snapshot = captureQobuzQueueSnapshot({
      snapshot: adapterSnapshot,
      ...(capturedAt === undefined ? {} : { capturedAt }),
      ...(snapshotId === undefined ? {} : { snapshotId }),
    });
    return save({ title, snapshot, savedQueueId: requestedId });
  };

  return {
    directory: resolvedDirectory,
    save,
    load,
    loadById: load,
    list,
    rename,
    remove,
    delete: remove,
    captureAndSave,
    summary,
  };
}
