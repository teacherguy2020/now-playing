import { UpnpError } from '../lib/upnp-control-point.mjs';

export const QOBUZ_ROOT_OBJECT_PREFIX = '0$qobuz$';

function boolQuery(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function numberQuery(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(n) ? n : fallback;
}

function sendUpnpError(res, error) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600
    ? Number(error.status)
    : 502;
  return res.status(status).json({
    ok: false,
    error: error?.message || String(error),
    code: error?.code || 'UPNP_ERROR',
    ...(error?.details ? { details: error.details } : {}),
  });
}

export function classifyUpnpReadError(error, objectId) {
  const id = String(objectId || '').trim();
  if (error?.code === 'UPNP_TIMEOUT' && id.startsWith(QOBUZ_ROOT_OBJECT_PREFIX)) {
    return new UpnpError('Qobuz account authorization is required before this catalog can be browsed.', {
      code: 'QOBUZ_AUTH_REQUIRED',
      status: 424,
      details: { reason: 'Qobuz account authorization has not been verified.' },
    });
  }
  return error;
}

export function registerUpnpRoutes(app, {
  controlPoint,
  playbackSession = null,
  playbackQueue = null,
  requireTrackKey,
} = {}) {
  if (!app || !controlPoint) throw new Error('UPnP routes require an app and control point');

  const authorize = (req, res) => {
    if (typeof requireTrackKey !== 'function') return true;
    return requireTrackKey(req, res) !== false;
  };

  const queueRevision = (req) => req.body?.revision ?? req.query?.revision;
  const queueItemRefs = (req) => req.body?.itemRefs ?? req.body?.selectionRefs ?? req.body?.itemRef ?? [];
  const queueAutoplay = (req) => {
    if (req.body?.autoplay === undefined) return true;
    return boolQuery(req.body.autoplay, true);
  };

  app.get('/upnp/devices', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const result = await controlPoint.discover({ force: boolQuery(req.query?.refresh) });
      return res.json({
        ok: true,
        discoveredAt: result.discoveredAt,
        responseCount: result.responseCount,
        failures: result.failures,
        devices: result.devices,
      });
    } catch (error) {
      return sendUpnpError(res, error);
    }
  });

  app.get('/upnp/devices/:deviceId', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const device = await controlPoint.describeDevice(req.params.deviceId);
      return res.json({ ok: true, device });
    } catch (error) {
      return sendUpnpError(res, error);
    }
  });

  app.get('/upnp/media-servers/:deviceId/capabilities', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const capabilities = await controlPoint.mediaServerCapabilities(req.params.deviceId);
      return res.json({ ok: true, ...capabilities });
    } catch (error) {
      return sendUpnpError(res, error);
    }
  });

  app.get('/upnp/media-servers/:deviceId/browse', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const browse = await controlPoint.browse(req.params.deviceId, {
        objectId: req.query?.objectId ?? '0',
        browseFlag: req.query?.browseFlag || 'BrowseDirectChildren',
        filter: req.query?.filter || '*',
        startingIndex: numberQuery(req.query?.startingIndex, 0),
        requestedCount: numberQuery(req.query?.requestedCount, 100),
        sortCriteria: req.query?.sortCriteria || '',
      });
      return res.json({ ok: true, ...browse });
    } catch (error) {
      return sendUpnpError(res, classifyUpnpReadError(error, req.query?.objectId));
    }
  });

  app.get('/upnp/media-servers/:deviceId/search', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const result = await controlPoint.search(req.params.deviceId, {
        containerId: req.query?.containerId ?? '0',
        searchCriteria: req.query?.searchCriteria || '',
        filter: req.query?.filter || '*',
        startingIndex: numberQuery(req.query?.startingIndex, 0),
        requestedCount: numberQuery(req.query?.requestedCount, 100),
        sortCriteria: req.query?.sortCriteria || '',
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendUpnpError(res, classifyUpnpReadError(error, req.query?.containerId));
    }
  });

  app.get('/upnp/media-items/:selectionRef/artwork', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const result = await controlPoint.fetchTrustedArtwork(req.params.selectionRef);
      res.set('Content-Type', result.contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.status(200).send(result.bytes);
    } catch (error) {
      return sendUpnpError(res, error);
    }
  });

  app.get('/upnp/renderers/:deviceId/capabilities', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const approvedOnly = boolQuery(req.query?.approved);
      const result = approvedOnly && playbackSession
        ? await playbackSession.approvedRendererCapabilities({ rendererId: req.params.deviceId })
        : await controlPoint.inspectRenderer(req.params.deviceId, {
          probeState: !Object.prototype.hasOwnProperty.call(req.query || {}, 'probeState')
            || boolQuery(req.query?.probeState, true),
        });
      return res.json({ ok: true, ...result, ...(approvedOnly ? { approved: true } : {}) });
    } catch (error) {
      return sendUpnpError(res, error);
    }
  });

  if (playbackSession) {
    app.get('/upnp/preflight', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackSession.preflight({ rendererId: req.query?.rendererId });
        return res.json({ ok: true, ...result, playbackMutationAvailable: true, mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    // The selection body contains only an opaque reference returned by a
    // recent Browse/Search call. It never accepts a media URL or SOAP input.
    app.post('/upnp/sessions', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackSession.select({
          itemRef: req.body?.itemRef,
          rendererId: req.body?.rendererId,
        });
        return res.status(201).json({ ok: true, ...result, mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.get('/upnp/sessions/:sessionId', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackSession.state(req.params.sessionId);
        return res.json({ ok: true, ...result, mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.get('/upnp/sessions/:sessionId/transport', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackSession.state(req.params.sessionId);
        return res.json({ ok: true, ...result, mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    const mutation = (method, action) => async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackSession[action](req.params.sessionId);
        return res.json({ ok: true, ...result, mutationExecuted: true, mutation: method });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    };

    app.post('/upnp/sessions/:sessionId/load', mutation('SetAVTransportURI', 'load'));
    app.post('/upnp/sessions/:sessionId/play', mutation('Play', 'play'));
    app.post('/upnp/sessions/:sessionId/pause', mutation('Pause', 'pause'));
    app.post('/upnp/sessions/:sessionId/stop', mutation('Stop', 'stop'));
  }

  if (playbackQueue) {
    app.post('/upnp/queues', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue.create({
          rendererId: req.body?.rendererId,
          itemRefs: queueItemRefs(req),
        });
        return res.status(201).json({ ok: true, ...result, mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.get('/upnp/queues/:queueId', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        return res.json({ ok: true, ...playbackQueue.state(req.params.queueId), mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.get('/upnp/queue', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        return res.json({ ok: true, ...playbackQueue.currentState(), mutationExecuted: false });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.post('/upnp/queues/:queueId/items', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue.addItems(req.params.queueId, {
          itemRefs: queueItemRefs(req),
          revision: queueRevision(req),
        });
        return res.json({ ok: true, ...result, mutationExecuted: false, mutation: 'QueueAdd' });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.delete('/upnp/queues/:queueId/items/:itemId', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue.removeItem(req.params.queueId, req.params.itemId, {
          revision: queueRevision(req),
        });
        return res.json({ ok: true, ...result, mutationExecuted: false, mutation: 'QueueRemove' });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.post('/upnp/queues/:queueId/clear', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue.clear(req.params.queueId, { revision: queueRevision(req) });
        return res.json({ ok: true, ...result, mutationExecuted: true, mutation: 'QueueClear' });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    app.post('/upnp/queues/:queueId/reorder', async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue.reorder(req.params.queueId, {
          itemId: req.body?.itemId,
          toIndex: req.body?.toIndex,
          revision: queueRevision(req),
        });
        return res.json({ ok: true, ...result, mutationExecuted: false, mutation: 'QueueReorder' });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    });

    const queueMutation = (method, action) => async (req, res) => {
      if (!authorize(req, res)) return;
      try {
        const result = await playbackQueue[action](req.params.queueId, {
          itemId: req.body?.itemId,
          index: req.body?.index,
          revision: queueRevision(req),
          autoplay: queueAutoplay(req),
        });
        return res.json({ ok: true, ...result, mutationExecuted: true, mutation: method });
      } catch (error) {
        return sendUpnpError(res, error);
      }
    };

    app.post('/upnp/queues/:queueId/play', queueMutation('QueuePlay', 'play'));
    app.post('/upnp/queues/:queueId/resume', queueMutation('QueueResume', 'resume'));
    app.post('/upnp/queues/:queueId/pause', queueMutation('QueuePause', 'pause'));
    app.post('/upnp/queues/:queueId/stop', queueMutation('QueueStop', 'stop'));
    app.post('/upnp/queues/:queueId/next', queueMutation('QueueNext', 'next'));
    app.post('/upnp/queues/:queueId/previous', queueMutation('QueuePrevious', 'previous'));
  }

  return {
    paths: [
      '/upnp/devices',
      '/upnp/devices/:deviceId',
      '/upnp/media-servers/:deviceId/capabilities',
      '/upnp/media-servers/:deviceId/browse',
      '/upnp/media-servers/:deviceId/search',
      '/upnp/media-items/:selectionRef/artwork',
      '/upnp/renderers/:deviceId/capabilities',
      ...(playbackSession ? [
        '/upnp/preflight',
        '/upnp/sessions',
        '/upnp/sessions/:sessionId',
        '/upnp/sessions/:sessionId/transport',
        '/upnp/sessions/:sessionId/load',
        '/upnp/sessions/:sessionId/play',
        '/upnp/sessions/:sessionId/pause',
        '/upnp/sessions/:sessionId/stop',
      ] : []),
      ...(playbackQueue ? [
        '/upnp/queues',
        '/upnp/queue',
        '/upnp/queues/:queueId',
        '/upnp/queues/:queueId/items',
        '/upnp/queues/:queueId/items/:itemId',
        '/upnp/queues/:queueId/clear',
        '/upnp/queues/:queueId/reorder',
        '/upnp/queues/:queueId/play',
        '/upnp/queues/:queueId/resume',
        '/upnp/queues/:queueId/pause',
        '/upnp/queues/:queueId/stop',
        '/upnp/queues/:queueId/next',
        '/upnp/queues/:queueId/previous',
      ] : []),
    ],
    playbackMutations: Boolean(playbackSession || playbackQueue),
  };
}
