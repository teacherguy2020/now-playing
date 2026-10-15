import {
  sanitizeMobileNowPlaying,
  sanitizeMobileUpnpBrowse,
  sanitizeMobileUpnpDevice,
  sanitizeMobileUpnpFailure,
  sanitizeMobileUpnpInspection,
  sanitizeMobileUpnpPreflight,
  sanitizeMobileUpnpQueue,
  sanitizeMobileUpnpRendererCapabilities,
  sanitizeMobileUpnpSearch,
  sanitizeMobileUpnpSession,
} from '../lib/mobile-upnp-sanitize.mjs';
import { classifyUpnpReadError } from './upnp.routes.mjs';

const SAFE_ERROR_MESSAGES = new Map([
  ['UPNP_AUTH_REQUIRED', 'UPnP authorization is required.'],
  ['QOBUZ_AUTH_REQUIRED', 'Connect the Qobuz account before browsing this catalog.'],
  ['UPNP_DEVICE_NOT_FOUND', 'The UPnP device is unavailable.'],
  ['UPNP_MEDIA_SERVER_NOT_FOUND', 'The UPnP media server is unavailable.'],
  ['UPNP_RENDERER_NOT_FOUND', 'The approved UPnP renderer is unavailable.'],
  ['UPNP_RENDERER_UNAVAILABLE', 'The approved UPnP renderer is unavailable.'],
  ['UPNP_TIMEOUT', 'The UPnP device did not respond in time.'],
  ['UPNP_QUEUE_NOT_FOUND', 'The UPnP queue is unavailable.'],
  ['UPNP_QUEUE_REVISION_REQUIRED', 'A queue revision is required for this operation.'],
  ['UPNP_QUEUE_REVISION_CONFLICT', 'The UPnP queue changed; refresh it and try again.'],
  ['UPNP_QUEUE_STALE', 'The UPnP queue is stale; refresh it and try again.'],
  ['UPNP_QUEUE_EXISTS', 'An UPnP queue already exists.'],
  ['UPNP_QUEUE_ITEM_NOT_FOUND', 'The UPnP queue item was not found.'],
  ['UPNP_QUEUE_BAD_STATE', 'The UPnP queue is not in a state for that operation.'],
  ['UPNP_QUEUE_CURRENT_ITEM_ACTIVE', 'Stop the active UPnP item before removing it.'],
  ['UPNP_QUEUE_CHANGED', 'The MPD queue changed during UPnP playback.'],
  ['UPNP_QUEUE_TOO_LARGE', 'The UPnP queue is too large.'],
  ['UPNP_STALE_MEDIA_ITEM', 'The selected media item is stale; browse it again.'],
  ['UPNP_INVALID_MEDIA_ITEM', 'The selected media item is invalid.'],
  ['UPNP_BAD_REQUEST', 'The UPnP request is invalid.'],
  ['UPNP_OWNERSHIP_LOST', 'Sonuvi no longer owns this UPnP playback session.'],
  ['UPNP_OWNERSHIP_UNCERTAIN', 'UPnP playback ownership could not be verified safely.'],
  ['UPNP_QOBUZ_ACTIVE', 'Qobuz Connect currently owns the renderer.'],
  ['UPNP_MPD_ACTIVE', 'MPD is active; UPnP playback takeover was rejected.'],
  ['UPNP_MPD_TAKEOVER_UNSUPPORTED', 'MPD is active but cannot be released safely by this operation.'],
  ['UPNP_RENDERER_ACTIVE', 'The approved renderer is already active.'],
  ['UPNP_RENDERER_TAKEOVER_UNSUPPORTED', 'The approved renderer cannot be released safely by this operation.'],
  ['UPNP_SESSION_ACTIVE', 'Another UPnP playback session is active.'],
  ['UPNP_TAKEOVER_ACTIVE_SESSION', 'Sonuvi already owns an active UPnP playback session.'],
  ['UPNP_TAKEOVER_CONFIRMATION_REQUIRED', 'Confirm the explicit renderer takeover before continuing.'],
  ['UPNP_QOBUZ_TAKEOVER_UNSUPPORTED', 'Release Qobuz Connect from the Sonuvi Config page first; UPnP takeover does not release that session automatically.'],
  ['UPNP_TAKEOVER_STOP_FAILED', 'The active playback owner could not be released safely.'],
  ['UPNP_TAKEOVER_STATE_CHANGED', 'Playback ownership changed; refresh state before trying takeover again.'],
  ['UPNP_TAKEOVER_START_FAILED', 'The current owner was released, but the selected UPnP item could not start.'],
  ['UPNP_SESSION_GENERATION_CONFLICT', 'The UPnP playback session changed; refresh the queue and try again.'],
  ['UPNP_RENDERER_ERROR', 'The approved UPnP renderer reported an error.'],
  ['UPNP_WRONG_DEVICE_ROLE', 'The requested UPnP device is not an approved device type.'],
  ['UPNP_SELECTION_EXPIRED', 'The media selection has expired; browse it again.'],
  ['UPNP_INVALID_SELECTION', 'The media selection is invalid.'],
  ['UPNP_UNSUPPORTED', 'The UPnP operation is not supported.'],
  ['UPNP_ERROR', 'The UPnP operation failed.'],
]);

function text(value, max = 2048) {
  return String(value ?? '').trim().slice(0, max);
}

function boolQuery(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function numberQuery(value, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(number) ? number : fallback;
}

function queueRevision(req) {
  return req.body?.revision ?? req.query?.revision;
}

function queueSessionGeneration(req) {
  return req.body?.sessionGeneration ?? req.query?.sessionGeneration;
}

function queueItemRefs(req) {
  return req.body?.itemRefs ?? req.body?.selectionRefs ?? req.body?.itemRef ?? [];
}

function queueAutoplay(req) {
  if (req.body?.autoplay === undefined) return true;
  return boolQuery(req.body.autoplay, true);
}

function typedError(message, code, status = 400, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function dependencyError(name) {
  return typedError(`mobile UPnP ${name} is not configured`, 'UPNP_MOBILE_NOT_CONFIGURED', 503);
}

function publicMessage(error) {
  const code = text(error?.code, 96).toUpperCase() || 'UPNP_ERROR';
  return SAFE_ERROR_MESSAGES.get(code) || 'The UPnP operation failed.';
}

function publicCode(error) {
  const code = text(error?.code, 96).toUpperCase();
  if (SAFE_ERROR_MESSAGES.has(code)) return code;
  if (/^(?:UPNP|QOBUZ)_[A-Z0-9_:-]+$/.test(code)) return code;
  return 'UPNP_ERROR';
}

function sendMobileUpnpError(res, error) {
  const code = publicCode(error);
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600
    ? Number(error.status)
    : 502;
  const safeDetails = {};
  if (Number.isSafeInteger(error?.details?.currentRevision)) {
    safeDetails.currentRevision = error.details.currentRevision;
  }
  if (typeof error?.details?.currentGeneration === 'string') {
    safeDetails.currentGeneration = text(error.details.currentGeneration, 128);
  }
  for (const key of ['stoppedMpd', 'stoppedRenderer']) {
    if (typeof error?.details?.[key] === 'boolean') safeDetails[key] = error.details[key];
  }
  return res.status(status).json({
    ok: false,
    error: publicMessage(error),
    code: sanitizeMobileUpnpFailure(code).code,
    ...(Object.keys(safeDetails).length ? { details: safeDetails } : {}),
  });
}

function getValue(getter, fallback, name) {
  const value = typeof getter === 'function' ? getter() : fallback;
  if (!value) throw dependencyError(name);
  return value;
}

function isMediaServer(device) {
  return Array.isArray(device?.roles)
    && device.roles.some((role) => String(role).toLowerCase() === 'media-server');
}

function isRenderer(device) {
  return Array.isArray(device?.roles)
    && device.roles.some((role) => String(role).toLowerCase() === 'media-renderer');
}

function hostForUrl(value) {
  try {
    return String(new URL(value).hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

function isApprovedRenderer(device, expectedRendererHost) {
  return isRenderer(device) && hostForUrl(device?.location) === String(expectedRendererHost || '').toLowerCase();
}

function sanitizeFailures(failures) {
  return (Array.isArray(failures) ? failures : []).map((failure) => ({
    ...sanitizeMobileUpnpFailure(failure?.code || failure),
  }));
}

export function registerMobileUpnpRoutes(app, {
  requireEnabled,
  requireSession,
  controlPoint = null,
  getControlPoint = null,
  playbackSession = null,
  getPlaybackSession = null,
  playbackQueue = null,
  getPlaybackQueue = null,
  expectedRendererHost = '10.0.0.254',
} = {}) {
  if (!app) throw new Error('mobile UPnP routes require an app');

  const requireMobileAuth = (req, res) => {
    if (typeof requireEnabled === 'function' && !requireEnabled(res)) return false;
    if (typeof requireSession !== 'function') {
      sendMobileUpnpError(res, dependencyError('authentication'));
      return false;
    }
    return Boolean(requireSession(req, res));
  };

  const getControl = () => getValue(getControlPoint, controlPoint, 'control point');
  const getSession = () => getValue(getPlaybackSession, playbackSession, 'playback session');
  const getQueue = () => getValue(getPlaybackQueue, playbackQueue, 'playback queue');

  const authorized = (handler) => async (req, res) => {
    if (!requireMobileAuth(req, res)) return;
    try {
      return await handler(req, res);
    } catch (error) {
      return sendMobileUpnpError(res, error);
    }
  };

  app.get('/v1/mobile/upnp/devices', authorized(async (req, res) => {
    const result = await getControl().discover({ force: boolQuery(req.query?.refresh) });
    const devices = Array.isArray(result.devices) ? result.devices : [];
    const mediaServers = devices
      .filter(isMediaServer)
      .map((device) => sanitizeMobileUpnpDevice(device));
    const approvedRenderer = devices.find((device) => isApprovedRenderer(device, expectedRendererHost));
    return res.json({
      ok: true,
      discoveredAt: text(result.discoveredAt, 64),
      responseCount: Number.isSafeInteger(result.responseCount) ? result.responseCount : 0,
      failures: sanitizeFailures(result.failures),
      mediaServers,
      approvedRenderer: approvedRenderer
        ? sanitizeMobileUpnpDevice(approvedRenderer, { approved: true })
        : null,
    });
  }));

  app.get('/v1/mobile/upnp/devices/:deviceId', authorized(async (req, res) => {
    const device = await getControl().describeDevice(req.params.deviceId);
    if (!isMediaServer(device) && !isApprovedRenderer(device, expectedRendererHost)) {
      throw typedError('wrong UPnP device role', 'UPNP_WRONG_DEVICE_ROLE', 400);
    }
    return res.json({
      ok: true,
      device: sanitizeMobileUpnpDevice(device, {
        approved: isApprovedRenderer(device, expectedRendererHost),
      }),
    });
  }));

  app.get('/v1/mobile/upnp/media-servers/:deviceId/capabilities', authorized(async (req, res) => {
    const result = await getControl().mediaServerCapabilities(req.params.deviceId);
    return res.json({
      ok: true,
      device: sanitizeMobileUpnpDevice(result.device),
      services: (Array.isArray(result.services) ? result.services : []).map((service) => ({
        serviceType: text(service.serviceType, 256),
        serviceId: text(service.serviceId, 256),
        version: text(service.version, 32),
        actions: Array.isArray(service.actions) ? service.actions.map((action) => text(action, 128)).filter(Boolean) : [],
      })),
      browseSupported: result.browseSupported !== false,
      searchSupported: Boolean(result.searchSupported),
      searchCapabilities: Array.isArray(result.searchCapabilities)
        ? result.searchCapabilities.map((value) => text(value, 256)).filter(Boolean)
        : [],
    });
  }));

  app.get('/v1/mobile/upnp/media-servers/:deviceId/browse', authorized(async (req, res) => {
    let result;
    try {
      result = await getControl().browse(req.params.deviceId, {
        objectId: req.query?.objectId ?? '0',
        browseFlag: req.query?.browseFlag || 'BrowseDirectChildren',
        filter: req.query?.filter || '*',
        startingIndex: numberQuery(req.query?.startingIndex, 0),
        requestedCount: numberQuery(req.query?.requestedCount, 100),
        sortCriteria: req.query?.sortCriteria || '',
      });
    } catch (error) {
      throw classifyUpnpReadError(error, req.query?.objectId);
    }
    return res.json({ ok: true, ...sanitizeMobileUpnpBrowse(result) });
  }));

  app.get('/v1/mobile/upnp/media-servers/:deviceId/search', authorized(async (req, res) => {
    let result;
    try {
      result = await getControl().search(req.params.deviceId, {
        containerId: req.query?.containerId ?? '0',
        searchCriteria: req.query?.searchCriteria || '',
        filter: req.query?.filter || '*',
        startingIndex: numberQuery(req.query?.startingIndex, 0),
        requestedCount: numberQuery(req.query?.requestedCount, 100),
        sortCriteria: req.query?.sortCriteria || '',
      });
    } catch (error) {
      throw classifyUpnpReadError(error, req.query?.containerId);
    }
    return res.json({ ok: true, ...sanitizeMobileUpnpSearch(result) });
  }));

  app.get('/v1/mobile/upnp/media-items/:selectionRef/artwork', authorized(async (req, res) => {
    const result = await getControl().fetchTrustedArtwork(req.params.selectionRef);
    res.set('Content-Type', result.contentType);
    res.set('Cache-Control', 'private, max-age=300');
    return res.status(200).send(result.bytes);
  }));

  app.get('/v1/mobile/upnp/renderers/:deviceId/capabilities', authorized(async (req, res) => {
    const result = await getSession().approvedRendererCapabilities({ rendererId: req.params.deviceId });
    return res.json({ ok: true, ...sanitizeMobileUpnpRendererCapabilities({ ...result, approved: true }) });
  }));

  app.get('/v1/mobile/upnp/preflight', authorized(async (req, res) => {
    const result = await getSession().preflight({ rendererId: req.query?.rendererId });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpPreflight(result),
      playbackMutationAvailable: true,
      mutationExecuted: false,
    });
  }));

  app.get('/v1/mobile/upnp/sessions/:sessionId', authorized(async (req, res) => {
    const result = await getSession().state(req.params.sessionId);
    return res.json({ ok: true, ...sanitizeMobileUpnpSession(result), mutationExecuted: false });
  }));

  app.get('/v1/mobile/upnp/sessions/:sessionId/transport', authorized(async (req, res) => {
    const result = await getSession().state(req.params.sessionId);
    return res.json({ ok: true, ...sanitizeMobileUpnpSession(result), mutationExecuted: false });
  }));

  app.post('/v1/mobile/upnp/queues', authorized(async (req, res) => {
    const result = await getQueue().create({
      rendererId: req.body?.rendererId,
      itemRefs: queueItemRefs(req),
    });
    return res.status(201).json({ ok: true, ...sanitizeMobileUpnpQueue(result), mutationExecuted: false });
  }));

  app.get('/v1/mobile/upnp/queue', authorized(async (req, res) => {
    const result = getQueue().currentState();
    return res.json({ ok: true, ...sanitizeMobileUpnpQueue(result), mutationExecuted: false });
  }));

  app.get('/v1/mobile/upnp/queues/:queueId', authorized(async (req, res) => {
    const result = getQueue().state(req.params.queueId);
    return res.json({ ok: true, ...sanitizeMobileUpnpQueue(result), mutationExecuted: false });
  }));

  app.post('/v1/mobile/upnp/queues/:queueId/items', authorized(async (req, res) => {
    const result = await getQueue().addItems(req.params.queueId, {
      itemRefs: queueItemRefs(req),
      revision: queueRevision(req),
    });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: false,
      mutation: 'QueueAdd',
    });
  }));

  app.delete('/v1/mobile/upnp/queues/:queueId/items/:itemId', authorized(async (req, res) => {
    const result = await getQueue().removeItem(req.params.queueId, req.params.itemId, {
      revision: queueRevision(req),
    });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: false,
      mutation: 'QueueRemove',
    });
  }));

  app.post('/v1/mobile/upnp/queues/:queueId/clear', authorized(async (req, res) => {
    const result = await getQueue().clear(req.params.queueId, { revision: queueRevision(req) });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: true,
      mutation: 'QueueClear',
    });
  }));

  app.post('/v1/mobile/upnp/queues/:queueId/reorder', authorized(async (req, res) => {
    const result = await getQueue().reorder(req.params.queueId, {
      itemId: req.body?.itemId,
      toIndex: req.body?.toIndex,
      revision: queueRevision(req),
    });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: false,
      mutation: 'QueueReorder',
    });
  }));

  app.post('/v1/mobile/upnp/queues/:queueId/takeover', authorized(async (req, res) => {
    const result = await getQueue().takeover(req.params.queueId, {
      itemId: req.body?.itemId,
      index: req.body?.index,
      revision: queueRevision(req),
      sessionGeneration: queueSessionGeneration(req),
      confirmed: req.body?.confirm === true,
    });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: true,
      mutation: 'QueueTakeover',
    });
  }));

  const queueMutation = (mutation, action) => authorized(async (req, res) => {
    const result = await getQueue()[action](req.params.queueId, {
      itemId: req.body?.itemId,
      index: req.body?.index,
      revision: queueRevision(req),
      autoplay: queueAutoplay(req),
    });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: true,
      mutation,
    });
  });

  // Play Now is the one existing mobile action that may carry an explicit
  // takeover intent. Keep ordinary Play fail-closed, but do not drop the
  // literal boolean flag before it reaches the guarded queue takeover path.
  app.post('/v1/mobile/upnp/queues/:queueId/play', authorized(async (req, res) => {
    const takeoverRequested = req.body?.takeover === true;
    const result = takeoverRequested
      ? await getQueue().takeover(req.params.queueId, {
        itemId: req.body?.itemId,
        index: req.body?.index,
        revision: queueRevision(req),
        sessionGeneration: queueSessionGeneration(req),
        confirmed: true,
      })
      : await getQueue().play(req.params.queueId, {
        itemId: req.body?.itemId,
        index: req.body?.index,
        revision: queueRevision(req),
        autoplay: queueAutoplay(req),
      });
    return res.json({
      ok: true,
      ...sanitizeMobileUpnpQueue(result),
      mutationExecuted: true,
      mutation: takeoverRequested ? 'QueueTakeover' : 'QueuePlay',
    });
  }));
  app.post('/v1/mobile/upnp/queues/:queueId/resume', queueMutation('QueueResume', 'resume'));
  app.post('/v1/mobile/upnp/queues/:queueId/pause', queueMutation('QueuePause', 'pause'));
  app.post('/v1/mobile/upnp/queues/:queueId/stop', queueMutation('QueueStop', 'stop'));
  app.post('/v1/mobile/upnp/queues/:queueId/next', queueMutation('QueueNext', 'next'));
  app.post('/v1/mobile/upnp/queues/:queueId/previous', queueMutation('QueuePrevious', 'previous'));

  return {
    paths: [
      '/v1/mobile/upnp/devices',
      '/v1/mobile/upnp/devices/:deviceId',
      '/v1/mobile/upnp/media-servers/:deviceId/capabilities',
      '/v1/mobile/upnp/media-servers/:deviceId/browse',
      '/v1/mobile/upnp/media-servers/:deviceId/search',
      '/v1/mobile/upnp/media-items/:selectionRef/artwork',
      '/v1/mobile/upnp/renderers/:deviceId/capabilities',
      '/v1/mobile/upnp/preflight',
      '/v1/mobile/upnp/sessions/:sessionId',
      '/v1/mobile/upnp/sessions/:sessionId/transport',
      '/v1/mobile/upnp/queues',
      '/v1/mobile/upnp/queue',
      '/v1/mobile/upnp/queues/:queueId',
      '/v1/mobile/upnp/queues/:queueId/items',
      '/v1/mobile/upnp/queues/:queueId/items/:itemId',
      '/v1/mobile/upnp/queues/:queueId/clear',
      '/v1/mobile/upnp/queues/:queueId/reorder',
      '/v1/mobile/upnp/queues/:queueId/takeover',
      '/v1/mobile/upnp/queues/:queueId/play',
      '/v1/mobile/upnp/queues/:queueId/resume',
      '/v1/mobile/upnp/queues/:queueId/pause',
      '/v1/mobile/upnp/queues/:queueId/stop',
      '/v1/mobile/upnp/queues/:queueId/next',
      '/v1/mobile/upnp/queues/:queueId/previous',
    ],
    playbackMutations: true,
  };
}
