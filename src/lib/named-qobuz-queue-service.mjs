export function createNamedQobuzQueueService({ store, getQobuzSnapshot } = {}) {
  if (!store || typeof store.captureAndSave !== 'function') {
    throw new Error('named Qobuz queue service requires a persistence store');
  }
  if (typeof getQobuzSnapshot !== 'function') {
    throw new Error('named Qobuz queue service requires a Qobuz snapshot reader');
  }

  async function capture({ title, capturedAt, snapshotId } = {}) {
    const adapterSnapshot = await getQobuzSnapshot({ includeQueue: true });
    return store.captureAndSave({
      title,
      adapterSnapshot,
      ...(capturedAt === undefined ? {} : { capturedAt }),
      ...(snapshotId === undefined ? {} : { snapshotId }),
    });
  }

  return {
    capture,
    list: () => store.list(),
    load: (savedQueueId) => store.load(savedQueueId),
    rename: (input) => store.rename(input),
    remove: (input) => store.remove(input),
    delete: (input) => store.remove(input),
  };
}
