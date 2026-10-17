import { createHash } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_STALE_MS = 8000;
const DEFAULT_MAX_JSON_BYTES = 512 * 1024;
const DEFAULT_MAX_ART_BYTES = 2 * 1024 * 1024;
const DEFAULT_EVENT_RETRY_MS = 1000;
const MAX_EVENT_RETRY_MS = 30000;
const MAX_TEXT = 512;

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function positiveInteger(value) {
  const number = positiveNumber(value);
  return number !== null && Number.isSafeInteger(Math.round(number)) ? Math.round(number) : null;
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 && Number.isSafeInteger(Math.round(number)) ? Math.round(number) : null;
}

function booleanOrNull(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || /^true$/i.test(String(value || '').trim())) return true;
  if (value === 0 || value === '0' || /^false$/i.test(String(value || '').trim())) return false;
  return null;
}

function qobuzId(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  return /^\d{1,32}$/.test(raw) ? raw : null;
}

function sampleRateHz(value) {
  const number = positiveNumber(value);
  if (number === null) return null;
  return number < 1000 ? Math.round(number * 1000) : Math.round(number);
}

function rateLabel(value) {
  const rate = sampleRateHz(value);
  if (!rate) return '';
  const khz = rate / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} kHz`;
}

function normalizeHost(value) {
  const raw = text(value, 255);
  if (!raw) throw new Error('PiBuZ host is required');
  const candidate = raw.includes('://') ? raw : `http://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('PiBuZ host is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || !parsed.hostname) {
    throw new Error('PiBuZ host is invalid');
  }
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
  };
}

function normalizePort(value) {
  const port = Number(value || 8182);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PiBuZ port is invalid');
  return port;
}

function safeArtworkUrl(value) {
  const raw = text(value, 2048);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const allowed = host === 'qobuz.com'
      || host.endsWith('.qobuz.com')
      || host === 'qobuz.net'
      || host.endsWith('.qobuz.net');
    if (!['http:', 'https:'].includes(parsed.protocol)
      || !allowed
      || parsed.username
      || parsed.password) return '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function artworkRefFor(url) {
  const value = safeArtworkUrl(url);
  return value ? `qobuz-${createHash('sha256').update(value).digest('hex').slice(0, 24)}` : '';
}

function normalizeTrack(raw, rememberArtwork) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const artworkUrl = safeArtworkUrl(raw.artwork_url || raw.artworkUrl || raw.cover_url || raw.coverUrl);
  const artworkRef = artworkRefFor(artworkUrl);
  if (artworkRef && typeof rememberArtwork === 'function') rememberArtwork(artworkRef, artworkUrl);
  const trackId = qobuzId(raw.id ?? raw.track_id ?? raw.trackId);
  const sampleRate = sampleRateHz(raw.sample_rate ?? raw.sampleRate);
  const bitDepth = positiveInteger(raw.bit_depth ?? raw.bitDepth);
  const durationSec = positiveNumber(raw.duration_secs ?? raw.duration ?? raw.durationSec);
  const title = text(raw.title);
  const artist = text(raw.artist);
  const album = text(raw.album);
  if (!trackId && !title && !artist && !album) return null;
  return {
    qobuzTrackId: trackId,
    title,
    artist,
    album,
    qobuzAlbumId: qobuzId(raw.album_id ?? raw.albumId),
    qobuzArtistId: qobuzId(raw.artist_id ?? raw.artistId),
    durationSec,
    artworkRef: artworkRef || null,
    sampleRateHz: sampleRate,
    bitDepth,
    hires: raw.hires === true,
    version: text(raw.version || raw.album_version || raw.albumVersion),
  };
}

function normalizeState(playback = {}) {
  const explicit = text(playback.state || playback.play_state || playback.playState).toLowerCase();
  if (['play', 'playing', 'resume', 'resumed'].includes(explicit)) return 'play';
  if (['pause', 'paused'].includes(explicit)) return 'pause';
  if (['stop', 'stopped'].includes(explicit)) return 'stop';
  if (booleanOrNull(playback.is_playing ?? playback.isPlaying) === true) return 'play';
  return 'pause';
}

function normalizeStatus(raw) {
  const qconnect = raw?.qconnect && typeof raw.qconnect === 'object' ? raw.qconnect : {};
  const playback = raw?.playback && typeof raw.playback === 'object' ? raw.playback : {};
  return {
    sessionActive: booleanOrNull(qconnect.session_active ?? raw?.session_active),
    receiverActive: booleanOrNull(qconnect.is_active) === true,
    connectionState: text(qconnect.state, 64) || 'unknown',
    deviceName: text(qconnect.device_name, 128),
    enabled: booleanOrNull(qconnect.enabled),
    playback: {
      state: text(playback.state, 32).toLowerCase(),
      isPlaying: booleanOrNull(playback.is_playing ?? playback.isPlaying),
      positionSec: finiteNumber(playback.position),
      durationSec: positiveNumber(playback.duration),
      outputSampleRateHz: sampleRateHz(playback.output_sample_rate ?? playback.outputSampleRate),
      sampleRateHz: sampleRateHz(playback.sample_rate ?? playback.sampleRate),
      bitDepth: positiveInteger(playback.bit_depth ?? playback.bitDepth),
      bitPerfectMode: booleanOrNull(playback.bit_perfect_mode ?? playback.bitPerfectMode),
      volume: finiteNumber(playback.volume),
      muted: booleanOrNull(playback.muted),
      queueLength: nonNegativeInteger(playback.queue_len ?? playback.queueLength),
      shuffle: booleanOrNull(playback.shuffle),
      repeat: text(playback.repeat, 32),
      trackId: qobuzId(playback.track_id ?? playback.trackId),
    },
  };
}

function normalizeQueue(raw, rememberArtwork) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const normalizeList = (value) => (Array.isArray(value)
    ? value.map((item) => normalizeTrack(item, rememberArtwork)).filter(Boolean)
    : []);
  const currentIndex = Number.isSafeInteger(raw.current_index)
    ? raw.current_index
    : (Number.isSafeInteger(Number(raw.currentIndex)) ? Number(raw.currentIndex) : null);
  const totalTracks = Number.isSafeInteger(raw.total_tracks)
    ? raw.total_tracks
    : (Number.isSafeInteger(Number(raw.totalTracks)) ? Number(raw.totalTracks) : null);
  return {
    available: true,
    currentIndex,
    totalTracks,
    repeat: text(raw.repeat, 32) || 'off',
    shuffle: raw.shuffle === true,
    stopAfterTrackId: qobuzId(raw.stop_after_track_id ?? raw.stopAfterTrackId),
    currentTrack: normalizeTrack(raw.current_track || raw.currentTrack, rememberArtwork),
    history: normalizeList(raw.history),
    upcoming: normalizeList(raw.upcoming),
  };
}

function sourceFormat(track) {
  if (!track) return '';
  const quality = track.bitDepth && track.sampleRateHz
    ? `${track.bitDepth}-bit / ${rateLabel(track.sampleRateHz)}`
    : rateLabel(track.sampleRateHz);
  return quality ? `Qobuz ${quality}` : '';
}

function outputFormat(status) {
  const rate = rateLabel(status?.playback?.outputSampleRateHz || status?.playback?.sampleRateHz);
  return rate ? `PCM / ${rate}` : '';
}

async function readLimited(response, maxBytes) {
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value || []);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error('PiBuZ response exceeded the size limit');
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof response?.arrayBuffer === 'function') {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > maxBytes) throw new Error('PiBuZ response exceeded the size limit');
    return body;
  }
  if (typeof response?.text === 'function') {
    const body = Buffer.from(await response.text(), 'utf8');
    if (body.length > maxBytes) throw new Error('PiBuZ response exceeded the size limit');
    return body;
  }
  return Buffer.alloc(0);
}

function eventLineHandler(state, onEvent, line) {
  const trimmed = String(line || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed = null;
    try { parsed = JSON.parse(trimmed); } catch {}
    if (parsed !== null) onEvent('message', parsed);
    return;
  }
  if (line === '') {
    if (!state.data.length) {
      state.event = 'message';
      return;
    }
    const data = state.data.join('\n');
    state.data = [];
    const event = state.event || 'message';
    state.event = 'message';
    let parsed = null;
    try { parsed = JSON.parse(data); } catch {}
    onEvent(event, parsed);
    return;
  }
  if (line.startsWith(':')) return;
  const separator = line.indexOf(':');
  const field = separator >= 0 ? line.slice(0, separator) : line;
  const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : '';
  if (field === 'event') state.event = text(value, 64) || 'message';
  if (field === 'data') state.data.push(value);
}

export function createPibuzQobuzAdapter({
  host,
  port = 8182,
  baseUrl = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_MS,
  maxJsonBytes = DEFAULT_MAX_JSON_BYTES,
  maxArtworkBytes = DEFAULT_MAX_ART_BYTES,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('PiBuZ fetch implementation is unavailable');
  const parsedHost = baseUrl ? normalizeHost(baseUrl) : normalizeHost(host);
  const parsedPort = normalizePort(port);
  const base = `${parsedHost.protocol}//${parsedHost.hostname.includes(':') ? `[${parsedHost.hostname}]` : parsedHost.hostname}:${parsedPort}`;
  const requestTimeoutMs = Math.max(100, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  const maxStaleMs = Math.max(0, Number(staleMs) || DEFAULT_STALE_MS);
  const responseLimit = Math.max(1024, Number(maxJsonBytes) || DEFAULT_MAX_JSON_BYTES);
  const artworkLimit = Math.max(1024, Number(maxArtworkBytes) || DEFAULT_MAX_ART_BYTES);
  const artworkByRef = new Map();
  let lastAuthoritative = null;
  let lastAuthoritativeAt = 0;
  let eventTask = null;
  let eventAbort = null;
  let stopped = false;
  let eventRetryMs = DEFAULT_EVENT_RETRY_MS;
  const eventState = {
    connected: false,
    reconnects: 0,
    revision: 0,
    lastEventAt: null,
    lastEventType: '',
  };

  function rememberArtwork(ref, url) {
    if (!ref || !url) return;
    artworkByRef.set(ref, url);
    while (artworkByRef.size > 256) artworkByRef.delete(artworkByRef.keys().next().value);
  }

  async function request(pathname, { accept = 'application/json', signal, retainSignal = false } = {}) {
    const allowedPath = ['/api/status', '/api/now-playing', '/api/queue', '/api/events'].includes(pathname);
    if (!allowedPath) throw new Error('PiBuZ endpoint is not allowed');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    let response;
    try {
      response = await fetchImpl(`${base}${pathname}`, {
        cache: 'no-store',
        redirect: 'error',
        headers: { accept },
        signal: controller.signal,
      });
      return retainSignal
        ? { response, cleanup: () => signal?.removeEventListener?.('abort', abort) }
        : response;
    } catch (error) {
      signal?.removeEventListener?.('abort', abort);
      throw error;
    } finally {
      clearTimeout(timer);
      if (!retainSignal) signal?.removeEventListener?.('abort', abort);
    }
  }

  async function requestJson(pathname) {
    const response = await request(pathname);
    if (!response?.ok || (Number(response.status) && (response.status < 200 || response.status >= 300))) {
      throw new Error(`PiBuZ ${pathname} returned HTTP ${response?.status || 0}`);
    }
    const body = await readLimited(response, responseLimit);
    if (!body.length) throw new Error(`PiBuZ ${pathname} returned an empty response`);
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw new Error(`PiBuZ ${pathname} returned invalid JSON`);
    }
  }

  function inactive(status, reason = 'inactive') {
    return {
      authoritative: true,
      available: true,
      active: false,
      source: 'qobuz-connect',
      owner: 'pibuz',
      output: 'moode',
      sessionActive: status.sessionActive,
      receiverActive: status.receiverActive,
      connectionState: status.connectionState,
      reason,
      suppressMpdHistory: false,
      eventStream: { ...eventState },
    };
  }

  function remember(value, timestamp) {
    lastAuthoritative = value;
    lastAuthoritativeAt = timestamp;
    return value;
  }

  function unavailable(timestamp, error) {
    const ageMs = lastAuthoritative ? Math.max(0, timestamp - lastAuthoritativeAt) : Infinity;
    if (lastAuthoritative && ageMs <= maxStaleMs) {
      return {
        ...lastAuthoritative,
        authoritative: true,
        available: true,
        stale: true,
        staleAgeMs: ageMs,
        suppressMpdHistory: Boolean(lastAuthoritative.active),
        reason: 'transport-error',
        errorCode: text(error?.message, 80),
        eventStream: { ...eventState },
      };
    }
    if (lastAuthoritative) {
      const hadActiveOwnership = lastAuthoritative.active === true;
      return {
        ...lastAuthoritative,
        authoritative: true,
        available: true,
        active: false,
        stale: true,
        staleAgeMs: ageMs,
        suppressMpdHistory: hadActiveOwnership,
        reason: 'stale-expired',
        errorCode: text(error?.message, 80),
        eventStream: { ...eventState },
      };
    }
    return {
      authoritative: false,
      available: false,
      active: false,
      source: 'qobuz-connect',
      reason: 'unavailable',
      errorCode: text(error?.message, 80),
      eventStream: { ...eventState },
    };
  }

  async function getSnapshot({ includeQueue = false } = {}) {
    const timestamp = now();
    let statusRaw;
    try {
      statusRaw = await requestJson('/api/status');
    } catch (error) {
      return { ...unavailable(timestamp, error), queue: null };
    }

    const status = normalizeStatus(statusRaw);
    if (!status.receiverActive) {
      const result = inactive(status);
      lastAuthoritative = result;
      lastAuthoritativeAt = timestamp;
      return { ...result, queue: null };
    }

    let nowPlayingRaw = null;
    let nowPlayingError = null;
    try {
      nowPlayingRaw = await requestJson('/api/now-playing');
    } catch (error) {
      nowPlayingError = error;
    }
    const rawTrack = nowPlayingRaw?.track || nowPlayingRaw?.current_track || null;
    const track = normalizeTrack(rawTrack, rememberArtwork);
    const playback = {
      ...status.playback,
      positionSec: finiteNumber(nowPlayingRaw?.playback?.position) ?? status.playback.positionSec,
      durationSec: positiveNumber(nowPlayingRaw?.playback?.duration) ?? status.playback.durationSec ?? track?.durationSec,
      outputSampleRateHz: sampleRateHz(nowPlayingRaw?.playback?.output_sample_rate)
        || status.playback.outputSampleRateHz,
      sampleRateHz: sampleRateHz(nowPlayingRaw?.playback?.sample_rate) || status.playback.sampleRateHz,
      bitDepth: positiveInteger(nowPlayingRaw?.playback?.bit_depth) || status.playback.bitDepth || track?.bitDepth,
      isPlaying: booleanOrNull(nowPlayingRaw?.playback?.is_playing) ?? status.playback.isPlaying,
      queueLength: nonNegativeInteger(nowPlayingRaw?.playback?.queue_len) ?? status.playback.queueLength,
      shuffle: booleanOrNull(nowPlayingRaw?.playback?.shuffle) ?? status.playback.shuffle,
      repeat: text(nowPlayingRaw?.playback?.repeat, 32) || status.playback.repeat,
      volume: finiteNumber(nowPlayingRaw?.playback?.volume) ?? status.playback.volume,
    };
    const result = {
      authoritative: true,
      available: true,
      active: true,
      source: 'qobuz-connect',
      owner: 'pibuz',
      output: 'moode',
      sessionActive: status.sessionActive,
      receiverActive: status.receiverActive,
      connectionState: status.connectionState,
      deviceName: status.deviceName,
      state: normalizeState(playback),
      title: track?.title || '',
      artist: track?.artist || '',
      album: track?.album || '',
      durationSec: playback.durationSec,
      ...(playback.positionSec !== null ? { elapsedSec: Math.max(0, playback.positionSec) } : {}),
      artworkUrl: track?.artworkRef ? artworkByRef.get(track.artworkRef) || '' : '',
      sourceFormat: sourceFormat(track),
      outputFormat: outputFormat({ playback }),
      sourceFormatDetails: {
        format: sourceFormat(track),
        codec: '',
        bitDepth: track?.bitDepth || null,
        sampleRateHz: track?.sampleRateHz || null,
        channels: null,
        provenance: 'pibuz-track',
      },
      outputFormatDetails: {
        format: outputFormat({ playback }),
        codec: 'PCM',
        bitDepth: null,
        sampleRateHz: playback.outputSampleRateHz || null,
        channels: null,
        provenance: 'pibuz-playback',
      },
      qobuzTrackId: track?.qobuzTrackId || null,
      qobuzAlbumId: track?.qobuzAlbumId || null,
      qobuzArtistId: track?.qobuzArtistId || null,
      qobuzVersion: track?.version || '',
      artworkRef: track?.artworkRef || null,
      sampleRateHz: track?.sampleRateHz || null,
      bitDepth: track?.bitDepth || null,
      hires: track?.hires === true,
      outputSampleRateHz: playback.outputSampleRateHz,
      bitPerfectMode: playback.bitPerfectMode,
      queueLength: playback.queueLength,
      currentIndex: null,
      shuffle: playback.shuffle,
      repeat: playback.repeat,
      volume: playback.volume,
      muted: playback.muted,
      suppressMpdHistory: true,
      stale: false,
      staleAgeMs: 0,
      ...(nowPlayingError ? { reason: 'metadata-unavailable', errorCode: text(nowPlayingError.message, 80) } : {}),
      eventStream: { ...eventState },
    };
    remember(result, timestamp);

    if (includeQueue) {
      try {
        const queueRaw = await requestJson('/api/queue');
        result.queue = normalizeQueue(queueRaw, rememberArtwork) || {
          available: false,
          reason: 'malformed',
        };
      } catch (error) {
        result.queue = {
          available: false,
          reason: 'unavailable',
          errorCode: text(error?.message, 80),
        };
      }
    } else {
      result.queue = null;
    }
    return result;
  }

  async function getNowPlaying() {
    return getSnapshot({ includeQueue: false });
  }

  async function getQueue() {
    const snapshot = await getSnapshot({ includeQueue: true });
    return {
      ...snapshot,
      queue: snapshot.active ? snapshot.queue : null,
    };
  }

  async function fetchArtwork(ref) {
    const artworkRef = text(ref, 80);
    const url = artworkByRef.get(artworkRef);
    if (!url) return null;
    const response = await requestArtwork(url);
    return response;
  }

  async function requestArtwork(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        redirect: 'error',
        headers: { accept: 'image/*' },
        signal: controller.signal,
      });
      if (!response?.ok || (Number(response.status) && (response.status < 200 || response.status >= 300))) {
        throw new Error(`Qobuz artwork returned HTTP ${response?.status || 0}`);
      }
      const contentType = text(response.headers?.get?.('content-type') || 'image/jpeg', 80).split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) throw new Error('Qobuz artwork was not an image');
      const body = await readLimited(response, artworkLimit);
      return { body, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  async function consumeEvents() {
    const requestResult = await request('/api/events', {
      accept: 'text/event-stream',
      signal: eventAbort?.signal,
      retainSignal: true,
    });
    const response = requestResult.response;
    const cleanup = requestResult.cleanup;
    try {
      if (!response?.ok || (Number(response.status) && (response.status < 200 || response.status >= 300))) {
        throw new Error(`PiBuZ events returned HTTP ${response?.status || 0}`);
      }
      if (!response.body?.getReader) throw new Error('PiBuZ events stream is unavailable');
      eventState.connected = true;
      eventRetryMs = DEFAULT_EVENT_RETRY_MS;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const state = { event: 'message', data: [] };
      const onEvent = (event) => {
        eventState.revision += 1;
        eventState.lastEventAt = new Date(now()).toISOString();
        eventState.lastEventType = text(event, 64);
      };
      while (!stopped) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) eventLineHandler(state, onEvent, line);
      }
      if (buffer) eventLineHandler(state, onEvent, buffer);
      throw new Error('PiBuZ events stream ended');
    } finally {
      cleanup?.();
    }
  }

  async function eventLoop() {
    const waitForRetry = (delayMs) => new Promise((resolve) => {
      let timer = null;
      const abort = () => done();
      const done = () => {
        clearTimeout(timer);
        eventAbort?.signal?.removeEventListener?.('abort', abort);
        resolve();
      };
      eventAbort?.signal?.addEventListener?.('abort', abort, { once: true });
      timer = setTimeout(done, delayMs);
      timer.unref?.();
    });
    while (!stopped) {
      try {
        await consumeEvents();
      } catch {
        eventState.connected = false;
        if (stopped) break;
        eventState.reconnects += 1;
        await waitForRetry(eventRetryMs);
        eventRetryMs = Math.min(MAX_EVENT_RETRY_MS, eventRetryMs * 2);
      }
    }
    eventState.connected = false;
  }

  return {
    getSnapshot,
    getNowPlaying,
    getQueue,
    fetchArtwork,
    getEventState: () => ({ ...eventState }),
    startEvents() {
      if (eventTask) return eventTask;
      stopped = false;
      eventAbort = new AbortController();
      eventTask = eventLoop().finally(() => {
        eventTask = null;
        eventAbort = null;
      });
      eventTask.catch(() => {});
      return eventTask;
    },
    async stopEvents() {
      stopped = true;
      eventAbort?.abort();
      await eventTask?.catch(() => {});
      eventTask = null;
      eventAbort = null;
      eventState.connected = false;
    },
    endpoint: `${base}/api`,
  };
}

export const pibuzQobuzDefaults = {
  timeoutMs: DEFAULT_TIMEOUT_MS,
  staleMs: DEFAULT_STALE_MS,
  maxJsonBytes: DEFAULT_MAX_JSON_BYTES,
  maxArtworkBytes: DEFAULT_MAX_ART_BYTES,
};
