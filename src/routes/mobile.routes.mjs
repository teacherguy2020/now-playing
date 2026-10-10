import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import QRCode from 'qrcode';

import { getBrowseIndex } from '../lib/browse-index.mjs';
import { log } from '../lib/log.mjs';
import {
  createMobileMediaTicket,
  createMobileRadioTicket,
  createMobileRefreshToken,
  createMobileSessionToken,
  createMobileTrackId,
  readBearerToken,
  timingSafeEqualText,
  verifyMobileToken,
} from '../lib/mobile-auth.mjs';
import {
  buildMobileCatalog,
  createMobileQueueItemId,
  publicMobileAlbum,
  publicMobileArtist,
  publicMobileTrack,
} from '../lib/mobile-track-identity.mjs';
import {
  createMobilePlaylistId,
  createMobilePlaylistRevision,
  normalizeMobilePlaylistFiles,
  normalizeMobilePlaylistName,
} from '../lib/mobile-playlists.mjs';
import { isPodcastPlaylist } from '../lib/playlist-classification.mjs';
import {
  buildMobileHomeRows,
  mobileHomeSourcePath,
  sanitizeMobileHomeProfile,
} from '../lib/mobile-home-rows.mjs';
import {
  audioContentTypeForPath,
  cacheKeyFor,
  serveFileWithRange,
  transcodeToMp3File,
} from './track.routes.mjs';
import {
  mpdEscapeValue,
  mpdHasACK,
  parseMpdKeyVals,
} from '../services/mpd.service.mjs';
import {
  MobilePairingError,
  MobilePairingStore,
  MOBILE_PAIRING_PROTOCOL_VERSION,
} from '../lib/mobile-pairing.mjs';
import {
  normalizeMobilePushEnvironment,
  normalizeMobilePushToken,
} from '../lib/mobile-push-store.mjs';
import { radioStationNameForFile } from '../lib/radio-display.mjs';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MEDIA_TICKET_TTL_MS = 60 * 60 * 1000;
const RADIO_TICKET_TTL_MS = 30 * 60 * 1000;
const MAX_PAGE_SIZE = 100;

function text(value) {
  return String(value || '').trim();
}

function genericRadioText(value) {
  return /^(?:radio|live radio|radio station|live stream|stream|unknown)$/i.test(text(value));
}

function safeAppleMusicUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || '').toLowerCase();
    const allowedHost = host === 'music.apple.com'
      || host.endsWith('.music.apple.com')
      || host === 'itunes.apple.com'
      || host.endsWith('.itunes.apple.com');
    if (parsed.protocol !== 'https:' || !allowedHost || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeMobileAbout(rawAbout) {
  if (!rawAbout || typeof rawAbout !== 'object') return null;
  const aboutText = text(rawAbout.text);
  if (!aboutText) return null;
  return {
    type: text(rawAbout.type) === 'album' ? 'album' : 'track',
    text: aboutText,
    ...(text(rawAbout.shortText) ? { shortText: text(rawAbout.shortText) } : {}),
    ...(text(rawAbout.tagline) ? { tagline: text(rawAbout.tagline) } : {}),
    source: text(rawAbout.source) || 'apple',
    ...(text(rawAbout.sourceId) ? { sourceId: text(rawAbout.sourceId) } : {}),
    match: { confidence: text(rawAbout.match?.confidence) || 'strong' },
  };
}

function comparableRadioText(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function radioPayloadMatches(payload, {
  artist = '',
  title = '',
  album = '',
  trackUrl = '',
  albumUrl = '',
} = {}) {
  if (!payload || (!Boolean(payload.isRadio) && !Boolean(payload.isStream))) return false;

  const payloadURLs = [payload.radioTrackUrl, payload.radioAlbumUrl, payload.radioItunesUrl]
    .map(safeAppleMusicUrl)
    .filter(Boolean);
  const candidateURLs = [trackUrl, albumUrl]
    .map(safeAppleMusicUrl)
    .filter(Boolean);
  if (payloadURLs.some((url) => candidateURLs.includes(url))) return true;

  const payloadArtist = comparableRadioText(payload.displayArtist || payload.artist);
  const payloadTitle = comparableRadioText(payload.displayTitle || payload.title);
  const payloadAlbum = comparableRadioText(payload.displayLine3 || payload.album);
  const candidateArtist = comparableRadioText(artist);
  const candidateTitle = comparableRadioText(title);
  const candidateAlbum = comparableRadioText(album);
  if (!payloadArtist || !payloadTitle || !candidateArtist || !candidateTitle) return false;
  if (payloadArtist !== candidateArtist || payloadTitle !== candidateTitle) return false;
  return !payloadAlbum || !candidateAlbum || payloadAlbum === candidateAlbum;
}

function parseMpdId(raw) {
  const match = String(raw || '').match(/(?:^|\n)Id:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function parseMpdBlocks(raw) {
  const blocks = [];
  let current = null;
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('OK MPD ')) continue;
    if (line === 'OK' || line.startsWith('ACK')) break;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'file') {
      if (current?.file) blocks.push(current);
      current = { file: value };
      continue;
    }
    if (!current) current = {};
    if (current[key] === undefined) current[key] = value;
  }
  if (current?.file) blocks.push(current);
  return blocks;
}

function mpdBoolean(value) {
  return ['1', 'true', 'on', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function errorResponse(res, status, error) {
  return res.status(status).json({ ok: false, error: String(error || 'request failed') });
}

function pageArgs(query = {}) {
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(query.limit || 50) || 50));
  const offset = Math.max(0, Number(query.offset || query.cursor || 0) || 0);
  return { limit, offset };
}

function page(items, { limit, offset }) {
  const rows = Array.isArray(items) ? items : [];
  const result = rows.slice(offset, offset + limit);
  return {
    offset,
    limit,
    total: rows.length,
    count: result.length,
    nextCursor: offset + result.length < rows.length ? String(offset + result.length) : null,
    items: result,
  };
}

function contentRelativePath(relativePath) {
  const normalized = String(relativePath || '')
    .split(path.sep)
    .filter(Boolean)
    .join('/');
  const segments = normalized.split('/').filter(Boolean);

  // The first component is the server-side library directory (currently
  // `Ondesoft`). It is not part of the music content and must not be required
  // to have the same name on a user-selected portable volume.
  return segments.length > 1 ? segments.slice(1).join('/') : normalized;
}

function requestBaseUrl(req, configuredBaseUrl = '') {
  const configured = text(configuredBaseUrl).replace(/\/+$/, '');
  if (configured) return configured;
  const protocol = text(req?.protocol) || 'http';
  const host = text(req?.get?.('host') || req?.headers?.host) || 'localhost';
  return `${protocol}://${host}`;
}

function requestDeviceId(body = {}) {
  const value = text(body?.deviceId);
  if (!value || value.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(value)) return '';
  return value;
}

function extensionIsSupported(filePath) {
  return audioContentTypeForPath(filePath) !== 'application/octet-stream';
}

function pairingBaseUrl(req, configuredBaseUrl = '') {
  const raw = text(configuredBaseUrl) || requestBaseUrl(req);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MobilePairingError(503, 'invalid_public_base_url', 'Mobile public base URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !parsed.hostname) {
    throw new MobilePairingError(503, 'invalid_public_base_url', 'Mobile public base URL is invalid');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

export function registerMobileRoutes(app, deps = {}) {
  const enabled = Boolean(deps.enabled);
  const apiSecret = text(deps.apiSecret);
  const trackIdSecret = text(deps.trackIdSecret);
  const enrollmentCode = text(deps.enrollmentCode);
  const mpdHost = text(deps.mpdHost) || 'moode.local';
  const mobileBaseUrl = text(deps.mobileBaseUrl);
  const mobileTrackCacheDir = text(deps.mobileTrackCacheDir) || '/tmp/now-playing/mobile-track-cache';
  const transcodeTracks = deps.transcodeTracks !== false;
  const musicLibraryRoot = text(deps.musicLibraryRoot) ? path.resolve(text(deps.musicLibraryRoot)) : '';
  const listeningHistory = deps.listeningHistory && typeof deps.listeningHistory.observe === 'function'
    ? deps.listeningHistory
    : null;
  const pushTokenStore = deps.pushTokenStore && typeof deps.pushTokenStore.upsert === 'function'
    ? deps.pushTokenStore
    : null;
  const apnsTopic = text(deps.apnsTopic) || 'com.brianwis.sonuvi';
  const apnsConfigured = Boolean(deps.apnsConfigured);
  const notifyNativePlayback = typeof deps.notifyNativePlayback === 'function'
    ? deps.notifyNativePlayback
    : null;
  const requireTrackKey = typeof deps.requireTrackKey === 'function' ? deps.requireTrackKey : null;
  // The browser pairing widget authenticates with the existing Track Key.
  // An already-paired native device has an equivalent trusted credential in
  // its bearer session, so it can host the same QR/approval flow without
  // requiring the user to copy the Track Key into that device first.
  const pairingAuthConfigured = Boolean(apiSecret && trackIdSecret && apiSecret !== trackIdSecret);
  const pairingStore = new MobilePairingStore();
  const getIndex = typeof deps.getBrowseIndex === 'function'
    ? deps.getBrowseIndex
    : (host) => getBrowseIndex(host);
  const mpdFileToLocalPath = typeof deps.mpdFileToLocalPath === 'function'
    ? deps.mpdFileToLocalPath
    : () => '';
  const getCurrentFile = typeof deps.getCurrentFile === 'function'
    ? deps.getCurrentFile
    : null;
  const isStreamFile = typeof deps.isStreamPath === 'function'
    ? deps.isStreamPath
    : (file) => Boolean(file && String(file).includes('://'));
  const isAirplayFile = typeof deps.isAirplayFile === 'function'
    ? deps.isAirplayFile
    : (file) => String(file || '').trim().toLowerCase() === 'airplay active';
  const safeIsFile = typeof deps.safeIsFile === 'function'
    ? deps.safeIsFile
    : (filePath) => {
      try { return fs.statSync(filePath).isFile(); } catch { return false; }
    };
  const statLocalFile = typeof deps.statLocalFile === 'function'
    ? deps.statLocalFile
    : async (filePath) => {
      try { return await fs.promises.stat(filePath); } catch { return null; }
    };
  const serveArtworkForTrack = typeof deps.serveArtworkForTrack === 'function'
    ? deps.serveArtworkForTrack
    : null;
  const servePlaylistArtwork = typeof deps.servePlaylistArtwork === 'function'
    ? deps.servePlaylistArtwork
    : null;
  const getMobilePlaylists = typeof deps.getMobilePlaylists === 'function'
    ? deps.getMobilePlaylists
    : null;
  const mpdQueryRaw = typeof deps.mpdQueryRaw === 'function'
    ? deps.mpdQueryRaw
    : null;
  const getRatingForFile = typeof deps.getRatingForFile === 'function'
    ? deps.getRatingForFile
    : null;
  const getFavoriteForFile = typeof deps.getFavoriteForFile === 'function'
    ? deps.getFavoriteForFile
    : null;
  const ratingsEnabled = typeof deps.ratingsEnabled === 'function'
    ? deps.ratingsEnabled
    : null;
  const startMobileVibe = typeof deps.startMobileVibe === 'function'
    ? deps.startMobileVibe
    : null;
  const fetchInternalJson = typeof deps.fetchInternalJson === 'function'
    ? deps.fetchInternalJson
    : null;
  const fetchInternalRequest = typeof deps.fetchInternalRequest === 'function'
    ? deps.fetchInternalRequest
    : null;
  const fetchRadioStream = typeof deps.fetchRadioStream === 'function'
    ? deps.fetchRadioStream
    : (...args) => globalThis.fetch(...args);
  const enrichRadioMetadata = typeof deps.enrichRadioMetadata === 'function'
    ? deps.enrichRadioMetadata
    : null;
  const serveHomeArtwork = typeof deps.serveHomeArtwork === 'function'
    ? deps.serveHomeArtwork
    : null;

  const homeArtworkEntries = new Map();
  const podcastEntries = new Map();
  const radioEntries = new Map();

  let catalogCache = { index: null, builtAt: '', catalog: null };
  let albumAddedAtCache = { builtAt: '', values: null, task: null };
  let diagnosticsQueueCache = { expiresAt: 0, items: [], task: null };

  const loadCatalog = async () => {
    const index = await getIndex(mpdHost);
    const builtAt = text(index?.builtAt);
    if (!catalogCache.catalog || catalogCache.index !== index || catalogCache.builtAt !== builtAt) {
      catalogCache = {
        index,
        builtAt,
        catalog: buildMobileCatalog(index, { trackIdSecret }),
      };
    }
    return catalogCache.catalog;
  };

  const albumMetadataKey = (artist, album) => (
    `${text(artist).toLocaleLowerCase()}|${text(album).toLocaleLowerCase()}`
  );

  const ensureAlbumAddedAt = async (catalog) => {
    if (!fetchInternalJson) return;
    if (albumAddedAtCache.builtAt === catalog.builtAt && albumAddedAtCache.values) {
      return;
    }
    if (albumAddedAtCache.task) {
      await albumAddedAtCache.task;
      return;
    }

    const task = (async () => {
      const values = new Map();
      try {
        const result = await fetchInternalJson('/config/library-health/albums');
        const rows = Array.isArray(result?.json?.albums) ? result.json.albums : [];
        for (const row of rows) {
          const timestamp = Number(row?.addedTs || 0);
          const key = albumMetadataKey(row?.artist, row?.album);
          if (!key || !Number.isFinite(timestamp) || timestamp <= 0) continue;
          values.set(key, Math.max(values.get(key) || 0, timestamp));
        }
      } catch (_) {}

      for (const album of catalog.albums) {
        album.addedAt = values.get(albumMetadataKey(album.artist, album.album)) || null;
      }
      albumAddedAtCache = { builtAt: catalog.builtAt, values, task: null };
    })();
    albumAddedAtCache.task = task;
    try {
      await task;
    } finally {
      if (albumAddedAtCache.task === task) albumAddedAtCache.task = null;
    }
  };

  // Reuse the web diagnostics queue's station-name resolution when MPD gives
  // us a silent stream row. The mobile response still strips all internal
  // queue identity before it leaves this module.
  const loadDiagnosticsQueue = async () => {
    if (!fetchInternalJson) return [];
    const now = Date.now();
    if (diagnosticsQueueCache.expiresAt > now) return diagnosticsQueueCache.items;
    if (diagnosticsQueueCache.task) return diagnosticsQueueCache.task;

    const task = (async () => {
      try {
        const result = await fetchInternalJson('/config/diagnostics/queue');
        const items = Array.isArray(result?.json?.items) ? result.json.items : [];
        diagnosticsQueueCache = {
          expiresAt: Date.now() + 5000,
          items,
          task: null,
        };
        return items;
      } catch {
        diagnosticsQueueCache = { expiresAt: Date.now() + 2000, items: [], task: null };
        return [];
      }
    })();
    diagnosticsQueueCache.task = task;
    return task;
  };

  const loadMobilePlaylists = async () => {
    if (!getMobilePlaylists) throw new Error('mobile playlists are not configured');
    const rows = await getMobilePlaylists();
    const normalizedRows = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const source = typeof row === 'string' ? { name: row } : (row || {});
        const name = normalizeMobilePlaylistName(source.name);
        if (!name) return null;
        return {
          name,
          files: normalizeMobilePlaylistFiles(source.files),
          updatedAt: source.updatedAt || null,
        };
      })
      .filter(Boolean);
    return normalizedRows.filter((row) => !isPodcastPlaylist(row.name, row.files));
  };

  const mobilePlaylistSummary = (row, catalog = null, baseUrl = '') => {
    let updatedAt = null;
    if (row.updatedAt instanceof Date && Number.isFinite(row.updatedAt.getTime())) {
      updatedAt = row.updatedAt.toISOString();
    } else if (row.updatedAt) {
      const parsed = new Date(row.updatedAt);
      if (Number.isFinite(parsed.getTime())) updatedAt = parsed.toISOString();
    }
    const playlistId = createMobilePlaylistId({ secret: trackIdSecret, name: row.name });
    return {
      id: playlistId,
      name: row.name,
      trackCount: row.files.length,
      revision: createMobilePlaylistRevision({
        secret: trackIdSecret,
        name: row.name,
        files: row.files,
      }),
      updatedAt,
      artworkUrl: `${String(baseUrl || '').replace(/\/+$/, '')}/v1/mobile/playlists/${encodeURIComponent(playlistId)}/artwork`,
    };
  };

  const mobileArtist = (artist, catalog, baseUrl) => {
    const result = publicMobileArtist(artist);
    if (!result) return result;
    const firstTrack = artist.albumIds
      ?.map((albumId) => catalog?.byAlbumId?.get(albumId))
      .flatMap((album) => album?.trackIds || [])
      .map((trackId) => catalog?.byTrackId?.get(trackId))
      .find(Boolean);
    return {
      ...result,
      artworkUrl: firstTrack
        ? `${String(baseUrl || '').replace(/\/+$/, '')}/v1/mobile/artwork/${encodeURIComponent(firstTrack.id)}`
        : null,
    };
  };

  const makeHomeItemId = ({ source, kind, identity }) => createMobileTrackId({
    secret: trackIdSecret,
    trackIdentity: `mobile-home-item-v1:${String(source || '')}:${String(kind || '')}:${String(identity || '')}`,
  }).replace(/^trk_/, 'itm_');

  const artworkUrlFor = (req, descriptor) => {
    const kind = text(descriptor?.kind);
    const reference = text(descriptor?.reference);
    if (!kind || !reference) return null;
    const id = createMobileTrackId({
      secret: trackIdSecret,
      trackIdentity: `mobile-home-art-v1:${kind}:${reference}`,
    }).replace(/^trk_/, 'har_');
    homeArtworkEntries.set(id, { kind, reference });
    while (homeArtworkEntries.size > 512) {
      const first = homeArtworkEntries.keys().next().value;
      if (!first) break;
      homeArtworkEntries.delete(first);
    }
    return `${requestBaseUrl(req, mobileBaseUrl)}/v1/mobile/home/artwork/${encodeURIComponent(id)}`;
  };

  const loadMobileHomeRows = async (req) => {
    const profileResult = fetchInternalJson
      ? await fetchInternalJson('/config/controller-profile').catch(() => null)
      : null;
    const profile = sanitizeMobileHomeProfile(profileResult?.json?.profile || {});
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const sourcePayloads = new Map();
    await Promise.all(profile.recentRows.map(async (source) => {
      if (source === 'queue') {
        const queue = await loadMobileQueue(req).catch(() => null);
        sourcePayloads.set(source, {
          ok: Boolean(queue),
          payload: queue || {},
        });
        return;
      }
      const pathname = mobileHomeSourcePath(source, profile.recentCount);
      const result = pathname && fetchInternalJson
        ? await fetchInternalJson(pathname).catch(() => null)
        : null;
      sourcePayloads.set(source, {
        ok: result?.ok !== false,
        payload: result?.json || {},
      });
    }));

    const catalog = await loadCatalog();
    const playlistRows = await loadMobilePlaylists();
    const playlistSummaries = playlistRows.map((row) => mobilePlaylistSummary(row, catalog, baseUrl));
    return buildMobileHomeRows({
      profile,
      sourcePayloads,
      catalog,
      playlistSummaries,
      baseUrl,
      makeItemId: makeHomeItemId,
      artworkUrlFor: (descriptor) => artworkUrlFor(req, descriptor),
      podcastIdFor: (rss) => {
        const value = text(rss);
        if (!value) return '';
        const id = podcastIdFor(value);
        rememberOpaqueEntry(podcastEntries, id, value);
        return id;
      },
      radioStationIdFor: (file) => {
        const value = text(file);
        if (!value) return '';
        const id = radioIdFor(value);
        rememberOpaqueEntry(radioEntries, id, value);
        return id;
      },
    });
  };

  const loadMobileQueue = async (req) => {
    if (!mpdQueryRaw) throw new Error('mobile queue is not configured');
    const [playlistRaw, statusRaw] = await Promise.all([
      mpdQueryRaw('playlistinfo'),
      mpdQueryRaw('status'),
    ]);
    if (!playlistRaw || mpdHasACK(playlistRaw) || !statusRaw || mpdHasACK(statusRaw)) {
      throw new Error('MPD queue read failed');
    }

    const catalog = await loadCatalog();
    const status = parseMpdKeyVals(statusRaw);
    const currentSongId = Number(status.songid);
    const currentPosition = Number(status.song);
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    let canReadRatings = Boolean(getRatingForFile);
    if (canReadRatings && ratingsEnabled) {
      try {
        canReadRatings = Boolean(await ratingsEnabled());
      } catch {
        canReadRatings = true;
      }
    }
    const ratingByFile = new Map();
    const favoriteByFile = new Map();
    const queueRating = async (file, track, { isStream, isYoutube, isPodcast } = {}) => {
      const key = text(file);
      const disabled = !canReadRatings
        || !track
        || !key
        || isStream
        || isYoutube
        || isPodcast
        || isAirplayFile(key);
      if (disabled) return { rating: 0, ratingDisabled: true };
      if (ratingByFile.has(key)) return ratingByFile.get(key);

      let rating = 0;
      try {
        rating = Number(await getRatingForFile(key)) || 0;
      } catch {}
      const result = {
        rating: Number.isFinite(rating)
          ? Math.max(0, Math.min(5, Math.round(rating)))
          : 0,
        ratingDisabled: false,
      };
      ratingByFile.set(key, result);
      return result;
    };
    const queueFavorite = async (file, track, { isStream, isYoutube, isPodcast } = {}) => {
      const key = text(file);
      const disabled = !getFavoriteForFile
        || !track
        || !key
        || isStream
        || isYoutube
        || isPodcast
        || isAirplayFile(key);
      if (disabled) return { isFavorite: false, favoriteDisabled: true };
      if (favoriteByFile.has(key)) return favoriteByFile.get(key);

      let isFavorite = false;
      try {
        isFavorite = Boolean(await getFavoriteForFile(key));
      } catch {
        const result = { isFavorite: false, favoriteDisabled: true };
        favoriteByFile.set(key, result);
        return result;
      }
      const result = { isFavorite, favoriteDisabled: false };
      favoriteByFile.set(key, result);
      return result;
    };
    const playlistRows = parseMpdBlocks(playlistRaw);
    const streamRowsNeedDiagnostics = playlistRows.some((row) => {
      const file = text(row.file);
      const isStream = !catalog.byFile.get(file) || /^https?:\/\//i.test(file);
      const reportedStationName = text(row.name || row.station || row.streamtitle);
      return isStream && (!reportedStationName || genericRadioText(reportedStationName));
    });
    const diagnosticsItems = streamRowsNeedDiagnostics ? await loadDiagnosticsQueue() : [];
    const diagnosticsByFile = new Map(
      diagnosticsItems
        .map((item) => [text(item?.file), item])
        .filter(([file]) => Boolean(file))
    );
    const diagnosticsByPosition = new Map(
      diagnosticsItems
        .map((item) => [Number(item?.position), item])
        .filter(([position]) => Number.isFinite(position))
    );
    const items = [];
    for (const [index, row] of playlistRows.entries()) {
      const position = Number.isFinite(Number(row.pos)) ? Number(row.pos) + 1 : index + 1;
      const songId = Number(row.id);
      const track = catalog.byFile.get(row.file);
      const isStream = !track || /^https?:\/\//i.test(row.file);
      const rowMeta = `${row.file} ${row.name || ''} ${row.artist || ''} ${row.title || ''} ${row.album || ''}`;
      const isYoutube = /youtube|youtu\.be/i.test(rowMeta);
      const isPodcast = /\bpodcast\b|\/podcasts?\//i.test(rowMeta);
      const isRadio = isStream && !isYoutube && !isPodcast;
      const diagnostic = isStream
        ? (diagnosticsByFile.get(text(row.file)) || diagnosticsByPosition.get(position) || null)
        : null;
      const reportedStationName = text(row.name || row.station || row.streamtitle);
      const preferredStationName = genericRadioText(reportedStationName)
        ? text(diagnostic?.stationName || reportedStationName)
        : text(reportedStationName || diagnostic?.stationName);
      const stationName = isRadio
        ? await radioStationNameForFile(row.file, preferredStationName)
        : preferredStationName;
      const queueItemId = createMobileQueueItemId({
        secret: trackIdSecret,
        file: row.file,
        songId,
        position,
      });
      const artworkUrl = track
        ? `${baseUrl}/v1/mobile/artwork/${encodeURIComponent(track.id)}`
        : (isStream && row.file
          ? artworkUrlFor(req, { kind: 'radio-file', reference: row.file })
          : (stationName
            ? artworkUrlFor(req, { kind: 'radio', reference: stationName })
            : (diagnostic?.thumbUrl
              ? artworkUrlFor(req, { kind: 'url', reference: diagnostic.thumbUrl })
              : null)));
      const ratingState = await queueRating(row.file, track, { isStream, isYoutube, isPodcast });
      const favoriteState = await queueFavorite(row.file, track, { isStream, isYoutube, isPodcast });
      const title = isRadio
        ? stationName
        : text(
          track?.title
          || (genericRadioText(row.title) ? '' : row.title)
          || diagnostic?.title
          || (genericRadioText(row.name) ? '' : row.name)
          || stationName
        );
      const artist = isRadio
        ? ''
        : text(
          track?.artist
          || (genericRadioText(row.artist) ? '' : row.artist)
          || diagnostic?.artist
        );
      const album = isRadio
        ? ''
        : text(
          track?.album
          || (genericRadioText(row.album) ? '' : row.album)
          || diagnostic?.album
        );
      items.push({
        id: queueItemId,
        position,
        isCurrent: (Number.isFinite(currentSongId) && currentSongId === songId)
          || (Number.isFinite(currentPosition) && currentPosition + 1 === position),
        title,
        artist,
        album,
        stationName: stationName || null,
        isStream,
        isYoutube,
        isPodcast,
        ...ratingState,
        ...favoriteState,
        artworkUrl,
        track: track ? publicMobileTrack(track, { baseUrl }) : null,
        serverSongId: songId,
        serverPosition: position,
        file: row.file,
      });
    }
    const currentIndex = items.findIndex((item) => item?.isCurrent === true);
    const displayItems = currentIndex > 0
      ? [items[currentIndex], ...items.slice(currentIndex + 1), ...items.slice(0, currentIndex)]
      : items;
    return {
      headPos: Number.isFinite(currentPosition) ? currentPosition + 1 : null,
      playbackState: text(status.state),
      randomOn: mpdBoolean(status.random),
      repeatOn: mpdBoolean(status.repeat),
      singleOn: mpdBoolean(status.single),
      consumeOn: mpdBoolean(status.consume),
      crossfadeSec: Number(status.crossfade || 0) || 0,
      items: displayItems,
    };
  };

  // Keep the native Next Up surface aligned with the web controller's
  // authority rules. Normal playback uses the MPD successor. Alexa playback
  // uses the Alexa enqueue successor/queue-head payload instead; MPD's
  // ordinary next-song position is not reliable while Alexa is driving the
  // stream. The browser routes return internal file names, so resolve them to
  // canonical MobileTrack data or a safe display-only stream item before the
  // response leaves the mobile boundary.
  const loadMobileNextUp = async (req) => {
    if (!fetchInternalJson) throw new Error('mobile Next Up is not configured');

    const nowPlayingResult = await fetchInternalJson('/now-playing').catch(() => null);
    const nowPlaying = nowPlayingResult?.json && typeof nowPlayingResult.json === 'object'
      ? nowPlayingResult.json
      : {};

    let alexaMode = isMobileAlexaPayload(nowPlaying);
    if (!alexaMode) {
      const wasPlayingResult = await fetchInternalJson('/alexa/was-playing').catch(() => null);
      const wasPlayingPayload = wasPlayingResult?.json && typeof wasPlayingResult.json === 'object'
        ? wasPlayingResult.json
        : {};
      const wasPlaying = wasPlayingPayload.wasPlaying || {};
      const alexaNowPlaying = wasPlayingPayload.nowPlaying || {};
      alexaMode = isMobileAlexaPayload(wasPlaying) || isMobileAlexaPayload(alexaNowPlaying);

      if (!alexaMode) {
        const aliasResult = await fetchInternalJson('/alexa/now-playing?maxAgeMs=21600000').catch(() => null);
        const aliasPayload = aliasResult?.json && typeof aliasResult.json === 'object'
          ? aliasResult.json
          : {};
        const activePayload = aliasPayload.wasPlaying || aliasPayload.nowPlaying || {};
        alexaMode = Boolean(aliasPayload.fresh && isMobileAlexaPayload(activePayload));
      }
    }

    const routePath = alexaMode ? '/alexa/next-up' : '/next-up';
    const nextResult = await fetchInternalJson(routePath).catch(() => null);
    const nextPayload = nextResult?.json && typeof nextResult.json === 'object'
      ? nextResult.json
      : {};
    const candidate = nextPayload.next || nextPayload.item || nextPayload.now || nextPayload;
    const file = text(candidate?.file);

    let catalog = null;
    if (file) {
      try {
        catalog = await loadCatalog();
      } catch {}
    }
    const track = file ? catalog?.byFile?.get(file) || null : null;
    const isStream = Boolean(candidate?.isStream) || Boolean(file && isStreamFile(file));
    const isYoutube = Boolean(candidate?.isYoutube);
    const isPodcast = Boolean(candidate?.isPodcast);
    // A normal MPD successor that is an HTTP stream is a radio/station row,
    // not a reliable song row. Alexa can also supply streams, but only treat
    // those as station rows when its payload identifies them explicitly; this
    // preserves ordinary Alexa stream candidates that still carry valid title
    // metadata.
    const isRadio = Boolean(candidate?.isRadio)
      || (isStream && !isYoutube && !isPodcast && !alexaMode);
    let queueItem = null;
    if (isRadio && mpdQueryRaw) {
      const queue = await loadMobileQueue(req).catch(() => null);
      queueItem = queue?.items?.find((item) => text(item?.file) === file) || null;
    }
    const stationCandidates = [
      queueItem?.stationName,
      candidate?.stationName,
      candidate?.radioStationName,
      candidate?.displayStationName,
      candidate?.station,
    ];
    const rawStationName = stationCandidates
      .map(text)
      .find((value) => value && !genericRadioText(value))
      || stationCandidates.map(text).find(Boolean)
      || '';
    const stationName = isRadio
      ? await radioStationNameForFile(file, rawStationName)
      : '';
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const rawArtwork = [
      candidate?.artUrl,
      candidate?.thumbUrl,
      candidate?.albumArtUrl,
      candidate?.displayArtUrl,
      candidate?.altArtUrl,
      candidate?.coverUrl,
    ]
      .map((value) => safeArtworkReference(req, value))
      .find(Boolean);
    const stationArtwork = isRadio
      ? (queueItem?.artworkUrl || (file
        ? artworkUrlFor(req, { kind: 'radio-file', reference: file })
        : null))
      : null;
    const artworkUrl = track
      ? `${baseUrl}/v1/mobile/artwork/${encodeURIComponent(track.id)}`
      : (isRadio
        ? (stationArtwork || (rawArtwork ? artworkUrlFor(req, { kind: 'url', reference: rawArtwork }) : null))
        : (rawArtwork ? artworkUrlFor(req, { kind: 'url', reference: rawArtwork }) : null));
    const title = isRadio
      ? text(stationName)
      : text(track?.title || candidate?.title || (file ? file.split('/').at(-1) : ''));
    const artist = isRadio ? '' : text(track?.artist || candidate?.artist);
    const album = isRadio ? '' : text(track?.album || candidate?.album);
    const available = Boolean(title || artist || artworkUrl);

    return {
      ok: true,
      available,
      alexaMode,
      source: available
        ? text(nextPayload.source) || (alexaMode ? 'alexa-head' : 'mpd-next')
        : null,
      next: available
        ? {
          title: title || null,
          artist: artist || null,
          album: album || null,
          artworkUrl,
          stationName: stationName || null,
          stationLogoUrl: stationArtwork || null,
          isStream: Boolean(isStream),
          isRadio,
          isYoutube,
          isPodcast,
          track: track ? publicMobileTrack(track, { baseUrl }) : null,
        }
        : null,
    };
  };

  const safeArtworkReference = (req, value) => {
    const raw = text(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, requestBaseUrl(req, mobileBaseUrl));
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        return '';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  };

  const safeAnimatedMediaUrl = (req, value) => {
    const raw = safeArtworkReference(req, value);
    if (!raw) return null;

    try {
      const parsed = new URL(raw);
      const publicBase = new URL(requestBaseUrl(req, mobileBaseUrl));
      const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(
        String(parsed.hostname || '').toLowerCase()
      );
      const isAnimatedMediaPath = parsed.pathname.startsWith(
        '/config/library-health/animated-art/media/'
      );

      // The internal config-route bridge sees 127.0.0.1:3101, but that URL
      // cannot be opened by a paired iPhone/iPad. Re-home only the server's
      // own cached media path; preserve external Apple MP4 URLs unchanged.
      if (isLoopback && isAnimatedMediaPath) {
        parsed.protocol = publicBase.protocol;
        parsed.hostname = publicBase.hostname;
        parsed.port = publicBase.port;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  // Alexa playback has its own AudioPlayer authority. The ordinary
  // /now-playing snapshot can intentionally remain on the MPD priming item
  // while the Echo is playing, so native clients must use the same fresh
  // Alexa payload that drives the Alexa Next Up contract.
  const isMobileAlexaPayload = (payload) => {
    const playbackMode = text(payload?.playbackMode).toLowerCase();
    const playbackTarget = text(payload?.playbackTarget).toLowerCase();
    return Boolean(
      payload?.modeActive
      || payload?.alexaMode
      || playbackMode === 'alexa'
      || playbackTarget === 'echo'
    );
  };

  const loadMobileAlexaNowPlaying = async () => {
    if (!fetchInternalJson) {
      return { modeActive: false, fresh: false, active: false, payload: {} };
    }
    const result = await fetchInternalJson('/alexa/was-playing').catch(() => null);
    const wrapper = result?.json && typeof result.json === 'object'
      ? result.json
      : {};
    const wasPlaying = wrapper.wasPlaying && typeof wrapper.wasPlaying === 'object'
      ? wrapper.wasPlaying
      : {};
    const payload = wrapper.nowPlaying && typeof wrapper.nowPlaying === 'object'
      ? wrapper.nowPlaying
      : wasPlaying;
    const modeActive = isMobileAlexaPayload(wasPlaying) || isMobileAlexaPayload(payload);
    const fresh = wrapper.fresh === undefined ? payload.fresh !== false : Boolean(wrapper.fresh);
    const active = payload.active === undefined ? Boolean(wasPlaying.active) : Boolean(payload.active);
    return { modeActive, fresh, active, payload };
  };

  const shouldUseMobileAlexaNowPlaying = (snapshot) => Boolean(
    snapshot?.modeActive
      && snapshot?.fresh
      && snapshot?.active
      && (text(snapshot?.payload?.file) || text(snapshot?.payload?.title))
  );

  const resolveMobileCurrentTrack = async (candidateFile = '') => {
    let file = text(candidateFile);
    if (!file && getCurrentFile) {
      try {
        file = text(await getCurrentFile());
      } catch {}
    }
    if (!file || isStreamFile(file) || isAirplayFile(file)) {
      return { file, track: null, disabled: true };
    }

    let catalog;
    try {
      catalog = await loadCatalog();
    } catch {
      return { file, track: null, disabled: true };
    }
    const track = catalog?.byFile?.get(file) || null;
    return { file, track, disabled: !track };
  };

  const resolveMobileCurrentSnapshot = async (req) => {
    const nowPlayingResult = fetchInternalJson
      ? await fetchInternalJson('/now-playing').catch(() => null)
      : null;
    const canonicalPayload = nowPlayingResult?.json && typeof nowPlayingResult.json === 'object'
      ? nowPlayingResult.json
      : {};
    const alexaSnapshot = await loadMobileAlexaNowPlaying();
    const payload = shouldUseMobileAlexaNowPlaying(alexaSnapshot)
      ? alexaSnapshot.payload
      : canonicalPayload;

    // The canonical route owns the current-track identity. Only fall back to
    // the mobile queue when that snapshot has no file (for example while the
    // canonical route is temporarily unavailable). Never trust client input
    // for this resolution.
    let currentItem = null;
    if (!text(payload.file) && mpdQueryRaw) {
      const queue = await loadMobileQueue(req).catch(() => null);
      currentItem = queue?.items?.find((item) => item.isCurrent) || null;
    }
    const candidateFile = text(payload.file) || text(currentItem?.file);
    const current = await resolveMobileCurrentTrack(candidateFile);
    return { ...current, payload, currentItem };
  };

  const finiteNumberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const loadMobileNowPlaying = async (req) => {
    const nowPlayingResult = await fetchInternalJson('/now-playing').catch(() => null);
    const canonicalPayload = nowPlayingResult?.json && typeof nowPlayingResult.json === 'object'
      ? nowPlayingResult.json
      : {};
    const alexaSnapshot = await loadMobileAlexaNowPlaying();
    const useAlexaNowPlaying = shouldUseMobileAlexaNowPlaying(alexaSnapshot);
    const payload = useAlexaNowPlaying ? alexaSnapshot.payload : canonicalPayload;
    const queue = mpdQueryRaw
      ? await loadMobileQueue(req).catch(() => null)
      : null;
    const currentItem = useAlexaNowPlaying
      ? null
      : (queue?.items?.find((item) => item.isCurrent) || null);
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const state = text(payload.state || queue?.playbackState || 'stop').toLowerCase();
    const payloadTitle = text(payload.displayTitle || payload.title);
    const payloadArtist = text(payload.displayArtist || payload.artist);
    const payloadAlbum = text(payload.displayLine3 || payload.album);
    const candidateFile = text(payload.file) || text(currentItem?.file);
    const shouldUseQueueStreamMetadata = Boolean(currentItem?.isStream)
      && (payload.displayConfidence === 'fallback'
        || genericRadioText(payloadTitle)
        || genericRadioText(payloadArtist));
    const nonGenericPayloadArtist = genericRadioText(payloadArtist) ? '' : payloadArtist;
    const nonGenericPayloadAlbum = genericRadioText(payloadAlbum) ? '' : payloadAlbum;
    const stationCandidates = shouldUseQueueStreamMetadata
      ? [
        currentItem?.stationName,
        payload.stationName,
        payload.radioStationName,
        payload.displayStationName,
        payload.station,
      ]
      : [
        payload.stationName,
        payload.radioStationName,
        payload.displayStationName,
        payload.station,
        currentItem?.stationName,
      ];
    const rawStationName = stationCandidates.map(text).find((value) => value && !genericRadioText(value))
      || stationCandidates.map(text).find(Boolean)
      || '';
    const isStream = Boolean(payload.isStream) || Boolean(currentItem?.isStream);
    const isPodcast = Boolean(payload.isPodcast) || Boolean(currentItem?.isPodcast);
    const isRadio = Boolean(payload.isRadio) || (isStream && !isPodcast);
    const stationName = isRadio
      ? (await radioStationNameForFile(candidateFile, rawStationName)) || null
      : null;
    const title = text(shouldUseQueueStreamMetadata
      ? (genericRadioText(payloadTitle) || !payloadTitle ? 'Live Radio' : payloadTitle)
      : (payloadTitle || currentItem?.title));
    const artist = text(shouldUseQueueStreamMetadata
      ? (currentItem?.artist || nonGenericPayloadArtist || stationName)
      : (payloadArtist || currentItem?.artist));
    const album = text(shouldUseQueueStreamMetadata
      ? (currentItem?.album || nonGenericPayloadAlbum)
      : (payloadAlbum || currentItem?.album));

    const appleMusicUrl = isRadio
      ? safeAppleMusicUrl(
        payload.radioTrackUrl
        || payload.radioItunesUrl
        || payload.radioAlbumUrl
        || payload.radioAppleMusicUrl
      )
      : null;

    // Catalog-backed queue items already have a bearer-protected opaque art
    // URL. Streams, AirPlay, and rich /now-playing art are proxied through the
    // bearer-protected home artwork route so the client never receives a
    // Track-Key/admin URL or has to fetch moOde directly.
    // A verified radio match is the exception to the queue-row preference:
    // the queue only knows the station logo, while canonical /now-playing
    // carries the matched iTunes artwork in displayArtUrl.
    const canonicalRadioArtwork = isRadio && appleMusicUrl
      ? [payload.displayArtUrl, payload.albumArtUrl, payload.altArtUrl]
        .map((value) => safeArtworkReference(req, value))
        .find(Boolean)
      : '';
    let artworkUrl = canonicalRadioArtwork
      ? artworkUrlFor(req, { kind: 'url', reference: canonicalRadioArtwork })
      : currentItem?.artworkUrl || null;
    if (!artworkUrl) {
      const rawArtwork = [
        payload.displayArtUrl,
        payload.albumArtUrl,
        payload.altArtUrl,
        payload.stationLogoUrl,
        payload.aplArtUrl,
      ]
        .map((value) => safeArtworkReference(req, value))
        .find(Boolean);
      artworkUrl = rawArtwork
        ? artworkUrlFor(req, { kind: 'url', reference: rawArtwork })
        : (stationName
          ? artworkUrlFor(req, {
            kind: text(payload.file) || text(currentItem?.file) ? 'radio-file' : 'radio',
            reference: text(payload.file) || text(currentItem?.file) || stationName,
          })
          : null);
    }

    // Keep the station logo separate from matched radio artwork. Queue
    // entries already carry the opaque station-logo URL; when the queue is
    // unavailable, derive the same safe URL from the canonical payload or
    // station identity instead of asking the native client to guess it.
    const stationLogoUrl = isRadio
      ? (currentItem?.artworkUrl
        || (() => {
          const rawStationLogo = safeArtworkReference(req, payload.stationLogoUrl);
          if (rawStationLogo) {
            return artworkUrlFor(req, { kind: 'url', reference: rawStationLogo });
          }
          if (!stationName) return null;
          return artworkUrlFor(req, {
            kind: text(payload.file) || text(currentItem?.file) ? 'radio-file' : 'radio',
            reference: text(payload.file) || text(currentItem?.file) || stationName,
          });
        })())
      : null;

    const durationSec = finiteNumberOrNull(payload.durationSec ?? payload.duration);
    const elapsedSec = finiteNumberOrNull(payload.elapsedSec ?? payload.elapsed);
    const queueTrack = useAlexaNowPlaying
      ? null
      : (finiteNumberOrNull(payload.queueTrack) ?? currentItem?.position ?? null);
    // Alexa does not expose a reliable MPD position, but the logical Sonuvi
    // queue remains the source of truth for its count. Prefer the full queue
    // read used by Live Queue; fall back to Alexa's known current/enqueue
    // buffer only when that queue read is unavailable.
    const alexaQueueTotal = useAlexaNowPlaying
      ? (Array.isArray(queue?.items) && queue.items.length > 0
        ? queue.items.length
        : (text(payload.queuedNextToken) && text(payload.queuedNextForToken) ? 2 : 1))
      : null;
    const queueTotal = useAlexaNowPlaying
      ? alexaQueueTotal
      : (finiteNumberOrNull(payload.queueTotal) ?? queue?.items?.length ?? null);
    const backgroundArtworkUrl = artworkUrlFor(req, {
      kind: 'background',
      reference: 'current',
    });
    const isPlaying = Boolean(payload.isPlaying) || state === 'play';
    const currentMobileTrack = await resolveMobileCurrentTrack(candidateFile);
    const currentItemIsLocal = !payload.isAirplay
      && !currentMobileTrack.disabled
      && Boolean(currentMobileTrack.track);
    const canonicalRating = Number(payload.rating);
    const isFavorite = currentItemIsLocal ? Boolean(payload.isFavorite) : false;
    const rating = currentItemIsLocal && Number.isFinite(canonicalRating)
      ? Math.max(0, Math.min(5, Math.round(canonicalRating)))
      : 0;
    const ratingDisabled = currentItemIsLocal
      ? payload.ratingDisabled === undefined
        ? true
        : Boolean(payload.ratingDisabled)
      : true;
    const radioYear = isRadio ? (text(payload.radioYear) || null) : null;
    const personnel = Array.isArray(payload.personnel)
      ? payload.personnel.map((value) => text(value)).filter(Boolean)
      : [];
    const about = normalizeMobileAbout(payload.about);

    return {
      ok: true,
      available: Boolean(title || artist || album || artworkUrl || currentItem),
      title: title || null,
      artist: artist || null,
      album: album || null,
      displayLine3: text(payload.displayLine3 || album) || null,
      artworkUrl: artworkUrl || null,
      backgroundArtworkUrl,
      state,
      isPlaying,
      randomOn: queue?.randomOn ?? false,
      repeatOn: queue?.repeatOn ?? false,
      singleOn: queue?.singleOn ?? false,
      consumeOn: queue?.consumeOn ?? false,
      durationSec,
      elapsedSec,
      queueTrack,
      queueTotal,
      stationName,
      stationLogoUrl,
      isStream,
      isPodcast,
      isRadio,
      isAirplay: Boolean(payload.isAirplay),
      isUpnp: Boolean(payload.isUpnp),
      isYoutube: Boolean(payload.isYoutube) || Boolean(currentItem?.isYoutube),
      personnel,
      about,
      aboutStatus: text(payload.aboutStatus) || null,
      aboutProvider: text(payload.aboutProvider) || null,
      appleMusicUrl,
      radioYear,
      track: currentMobileTrack.track
        ? publicMobileTrack(currentMobileTrack.track, { baseUrl })
        : (currentItem?.track || null),
      isFavorite,
      rating,
      ratingDisabled,
    };
  };

  const matchingCanonicalRadioAbout = async ({
    artist = '',
    title = '',
    album = '',
    trackUrl = '',
    albumUrl = '',
  } = {}) => {
    if (!fetchInternalJson) return { about: null, aboutStatus: null, aboutProvider: null };
    const result = await fetchInternalJson('/now-playing').catch(() => null);
    const payload = result?.json && typeof result.json === 'object' ? result.json : null;
    if (!radioPayloadMatches(payload, { artist, title, album, trackUrl, albumUrl })) {
      return { about: null, aboutStatus: null, aboutProvider: null };
    }
    return {
      about: normalizeMobileAbout(payload.about),
      aboutStatus: text(payload.aboutStatus) || null,
      aboutProvider: text(payload.aboutProvider) || null,
    };
  };

  const readMobileTrackRating = async (track) => {
    if (!track || typeof getRatingForFile !== 'function') {
      return { rating: 0, ratingDisabled: true, disabled: true };
    }

    let enabled = true;
    if (ratingsEnabled) {
      try {
        enabled = Boolean(await ratingsEnabled());
      } catch {
        enabled = true;
      }
    }
    if (!enabled) {
      return { rating: 0, ratingDisabled: true, disabled: true };
    }

    let rating = 0;
    try {
      rating = Number(await getRatingForFile(track.file)) || 0;
    } catch {}
    return {
      rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0,
      ratingDisabled: false,
      disabled: false,
    };
  };

  const readMobileTrackFavorite = async (track) => {
    const file = text(track?.file);
    const unsupported = !track
      || typeof getFavoriteForFile !== 'function'
      || !file
      || isStreamFile(file)
      || isAirplayFile(file)
      || text(track?.id).startsWith('radio-')
      || text(track?.id).startsWith('podcast-');
    if (unsupported) return { isFavorite: false, disabled: true };

    try {
      return {
        isFavorite: Boolean(await getFavoriteForFile(file)),
        disabled: false,
      };
    } catch {
      return { isFavorite: false, disabled: true };
    }
  };

  const internalFeatureRequest = async (pathname, options = {}) => {
    if (fetchInternalRequest) return fetchInternalRequest(pathname, options);
    if ((!options.method || String(options.method).toUpperCase() === 'GET') && fetchInternalJson) {
      return fetchInternalJson(pathname);
    }
    throw new Error('mobile feature routes are not configured');
  };

  // Alexa remains a server-managed playback target. Mobile callers receive
  // only a bearer-authenticated capability; the Track Key and configured
  // Alexa/Homebridge webhook URLs stay inside the server-side diagnostics
  // route that already owns these actions.
  const alexaActionMap = {
    start: 'routealexa',
    // Keep a literal mobile Play action skill-backed as well. A Play intent
    // must establish the Alexa session; resume is only for an already-open
    // Echo stream.
    play: 'routealexa',
    stop: 'stopalexa',
    pause: 'pausealexa',
    resume: 'resumealexa',
    next: 'nextalexa',
  };

  const runAlexaAction = async (action) => {
    const normalized = text(action).toLocaleLowerCase();
    const diagnosticsAction = alexaActionMap[normalized];
    if (!diagnosticsAction) return { invalid: true, action: normalized };
    const result = await internalFeatureRequest('/config/diagnostics/playback', {
      method: 'POST',
      body: { action: diagnosticsAction },
    });
    return { action: normalized, diagnosticsAction, result };
  };

  const safeMobileEndlessVibeJob = (payload = {}) => {
    const jobId = text(payload.jobId);
    const active = payload.active === true;
    if (!jobId && !active) return null;

    const statusValue = text(payload.status);
    const status = ['running', 'done', 'error', 'cancelled'].includes(statusValue)
      ? statusValue
      : '';
    const phase = text(payload.phase).slice(0, 120);
    const targetQueue = Number(payload.targetQueue);
    const builtCount = Number(payload.builtCount);
    const updatedAt = Number(payload.updatedAt);
    return {
      ...(jobId ? { jobId } : {}),
      active,
      ...(status ? { status } : {}),
      ...(phase ? { phase } : {}),
      ...(Number.isFinite(targetQueue) ? { targetQueue: Math.max(0, Math.floor(targetQueue)) } : {}),
      ...(Number.isFinite(builtCount) ? { builtCount: Math.max(0, Math.floor(builtCount)) } : {}),
      ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
    };
  };

  const safeMobileVibeJob = (payload = {}, requestedJobId = '') => {
    const jobId = text(requestedJobId) || text(payload.jobId);
    const statusValue = text(payload.status);
    const status = ['running', 'done', 'error', 'cancelled'].includes(statusValue)
      ? statusValue
      : (payload.done === true ? 'done' : 'running');
    const phase = text(payload.phase).slice(0, 120);
    const targetQueue = Number(payload.targetQueue);
    const builtCount = Number(payload.builtCount);
    const rawLatest = Array.isArray(payload.added)
      ? payload.added[payload.added.length - 1]
      : payload.latest;
    const latestArtist = text(rawLatest?.artist).slice(0, 120);
    const latestTitle = text(rawLatest?.title).slice(0, 160);
    const latest = latestArtist || latestTitle
      ? {
        ...(latestArtist ? { artist: latestArtist } : {}),
        ...(latestTitle ? { title: latestTitle } : {}),
      }
      : null;

    return {
      ok: true,
      jobId,
      status,
      done: payload.done === true || ['done', 'error', 'cancelled'].includes(status),
      ...(phase ? { phase } : {}),
      ...(Number.isFinite(targetQueue) ? { targetQueue: Math.max(0, Math.floor(targetQueue)) } : {}),
      ...(Number.isFinite(builtCount) ? { builtCount: Math.max(0, Math.floor(builtCount)) } : {}),
      ...(latest ? { latest } : {}),
      ...(status === 'error' ? { error: 'Vibe build failed' } : {}),
      ...(status === 'cancelled' ? { error: 'Vibe build cancelled' } : {}),
    };
  };

  const loadMobileEndlessVibeJob = async () => {
    if (!fetchInternalJson) return null;
    try {
      const result = await internalFeatureRequest('/config/queue-wizard/endless-vibe-status');
      return result?.ok ? safeMobileEndlessVibeJob(result.json || {}) : null;
    } catch {
      return null;
    }
  };

  const mobileEndlessVibeResponse = async (enabled) => {
    const job = await loadMobileEndlessVibeJob();
    return {
      ok: true,
      enabled: enabled === true,
      active: job?.active === true,
      ...(job ? { job } : {}),
    };
  };

  const rememberOpaqueEntry = (store, id, value, max = 2048) => {
    store.set(id, value);
    while (store.size > max) {
      const first = store.keys().next().value;
      if (!first) break;
      store.delete(first);
    }
  };

  const opaqueFeatureId = (prefix, identity) => createMobileTrackId({
    secret: trackIdSecret,
    trackIdentity: `mobile-${prefix}-v1:${String(identity || '')}`,
  }).replace(/^trk_/, `${prefix}_`);

  const genreTokens = (value) => String(value || '')
    .split(/[;,|/]/)
    .map((part) => text(part).toLocaleLowerCase())
    .filter(Boolean);

  const mobileGenreRows = (catalog) => {
    const rows = new Map();
    for (const track of catalog?.tracks || []) {
      for (const token of genreTokens(track.genre)) {
        if (!rows.has(token)) rows.set(token, {
          id: opaqueFeatureId('gen', token),
          name: token,
          trackCount: 0,
          albumIds: new Set(),
        });
        const row = rows.get(token);
        row.trackCount += 1;
        if (track.albumId) row.albumIds.add(track.albumId);
      }
    }
    return Array.from(rows.values())
      .map((row) => ({
        id: row.id,
        name: row.name,
        trackCount: row.trackCount,
        albumCount: row.albumIds.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  };

  const podcastIdFor = (rss) => opaqueFeatureId('pod', text(rss));
  const radioIdFor = (file) => opaqueFeatureId('rad', text(file));

  const radioUrlFor = (file) => {
    try {
      const parsed = new URL(text(file));
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const radioContentTypeFor = (file) => {
    const cleanFile = text(file).split(/[?#]/, 1)[0];
    const detected = audioContentTypeForPath(cleanFile);
    return detected === 'application/octet-stream' ? 'audio/mpeg' : detected;
  };

  const publicArtworkUrl = (req, raw, kind = 'url') => {
    if (kind === 'radio') {
      const stationName = text(raw);
      return stationName ? artworkUrlFor(req, { kind, reference: stationName }) : null;
    }
    const value = safeArtworkReference(req, raw);
    return value ? artworkUrlFor(req, { kind, reference: value }) : null;
  };

  const loadPodcastSubscriptions = async (req) => {
    const result = await internalFeatureRequest('/podcasts');
    const rows = Array.isArray(result?.json?.items) ? result.json.items : [];
    return rows.map((row) => {
      const rss = text(row?.rss);
      if (!rss) return null;
      const id = podcastIdFor(rss);
      rememberOpaqueEntry(podcastEntries, id, rss);
      return {
        id,
        title: text(row?.title || row?.name || rss),
        autoDownload: Boolean(row?.autoDownload ?? row?.autoLatest),
        downloadedCount: Number(row?.items || 0) || 0,
        lastBuilt: text(row?.lastBuilt) || null,
        artworkUrl: publicArtworkUrl(req, row?.imageUrl),
      };
    }).filter(Boolean);
  };

  const resolvePodcast = async (req, podcastId) => {
    const wanted = text(podcastId);
    const known = podcastEntries.get(wanted);
    if (known) return { id: wanted, rss: known };
    const rows = await loadPodcastSubscriptions(req);
    const match = rows.find((row) => row.id === wanted);
    return match ? { id: match.id, rss: podcastEntries.get(match.id) } : null;
  };

  const loadPodcastEpisodePayload = async (req, podcastId, limit = 200) => {
    const podcast = await resolvePodcast(req, podcastId);
    if (!podcast?.rss) return null;
    const result = await internalFeatureRequest('/podcasts/episodes/list', {
      method: 'POST',
      body: { rss: podcast.rss, limit: Math.max(1, Math.min(250, Number(limit) || 200)) },
    });
    const episodes = Array.isArray(result?.json?.episodes) ? result.json.episodes : [];
    const summaryRows = await loadPodcastSubscriptions(req);
    const summary = summaryRows.find((row) => row.id === podcast.id) || {
      id: podcast.id,
      title: podcast.id,
      autoDownload: false,
      downloadedCount: 0,
      lastBuilt: null,
      artworkUrl: null,
    };
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    return {
      podcast: summary,
      rss: podcast.rss,
      episodes: episodes.map((episode) => {
        const id = text(episode?.id);
        const imageUrl = publicArtworkUrl(req, episode?.imageUrl) || summary.artworkUrl;
        const downloaded = Boolean(episode?.downloaded);
        return {
          id,
          title: text(episode?.title || '(untitled)'),
          date: text(episode?.date),
          published: Number.isFinite(Number(episode?.published)) ? Number(episode.published) : null,
          downloaded,
          downloadedAt: Number.isFinite(Number(episode?.downloadedAt)) ? Number(episode.downloadedAt) : null,
          imageUrl,
          mediaUrl: downloaded && id
            ? `${baseUrl}/v1/mobile/podcasts/${encodeURIComponent(podcast.id)}/episodes/${encodeURIComponent(id)}/media`
            : null,
        };
      }),
      rawEpisodes: episodes,
    };
  };

  const loadRadioStations = async (req, { genres = [], favoritesOnly = false, hqOnly = false } = {}) => {
    const result = await internalFeatureRequest('/config/queue-wizard/radio-preview', {
      method: 'POST',
      body: {
        genres: Array.isArray(genres) ? genres.map(text).filter(Boolean) : [],
        favoritesOnly: Boolean(favoritesOnly),
        hqOnly: Boolean(hqOnly),
        maxStations: 2000,
      },
    });
    const tracks = Array.isArray(result?.json?.tracks) ? result.json.tracks : [];
    return tracks.map((station) => {
      const file = text(station?.file);
      if (!file) return null;
      const id = radioIdFor(file);
      rememberOpaqueEntry(radioEntries, id, file);
      const name = text(station?.stationName || station?.artist || station?.album || 'Radio Station');
      const format = text(station?.format);
      const bitrate = text(station?.bitrate);
      const hq = Boolean(station?.isHq)
        || /flac|alac|wav|aiff|pcm/i.test(format)
        || (/opus/i.test(format) && Number.parseInt(bitrate, 10) >= 128)
        || (/(mp3|aac)/i.test(format) && Number.parseInt(bitrate, 10) >= 320);
      return {
        id,
        name,
        genre: text(station?.genre),
        bitrate,
        format,
        isFavorite: Boolean(station?.isFavoriteStation)
          || text(station?.radioType).toLocaleLowerCase() === 'f',
        isHighQuality: hq,
        // The preview already came from moOde's station catalog, so its logo
        // name is more reliable than asking the artwork endpoint to reverse
        // resolve the stream URL through a second SSH-backed catalog lookup.
        // Keep the stream URL opaque for playback, and use the catalog spelling
        // for artwork (including provider prefixes omitted from display text).
        artworkUrl: artworkUrlFor(req, {
          kind: 'radio',
          reference: text(station?.logoName || name),
        }),
      };
    }).filter(Boolean);
  };

  const resolveRadioFile = async (req, stationId) => {
    const wanted = text(stationId);
    const known = radioEntries.get(wanted);
    if (known) return known;
    const stations = await loadRadioStations(req);
    const match = stations.find((station) => station.id === wanted);
    return match ? radioEntries.get(match.id) : '';
  };

  const radioPlaybackTrack = ({ stationId, file, station } = {}) => {
    const resolvedStationId = text(stationId);
    const resolvedFile = text(file);
    if (!resolvedStationId || !resolvedFile) return null;
    const stationName = text(station?.name) || 'Radio Station';
    return {
      id: `radio-${resolvedStationId}`,
      file: resolvedFile,
      title: stationName,
      artist: stationName,
      albumArtist: stationName,
      album: 'Radio',
      track: '',
      genre: text(station?.genre),
      durationSec: 0,
      format: text(station?.format) || 'stream',
      stationName,
      stationLogoUrl: text(station?.artworkUrl),
    };
  };

  const queueWizardOptions = async (req) => {
    const catalog = await loadCatalog();
    const artists = Array.from(new Set(catalog.artists.map((artist) => text(artist.artist)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const genres = mobileGenreRows(catalog).map((genre) => genre.name);
    const albums = catalog.albums.map((album) => ({
      name: album.album,
      artist: album.artist,
    }));
    const playlists = await loadMobilePlaylists();
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    return {
      genres,
      artists,
      albums,
      playlists: playlists.map((playlist) => mobilePlaylistSummary(playlist, catalog, baseUrl)),
    };
  };

  const mobileQueueWizardTracks = async (req, body = {}) => {
    const catalog = await loadCatalog();
    const byFile = catalog.byFile;
    const tracks = [];
    const seen = new Set();
    const addFile = (file) => {
      const track = byFile.get(text(file));
      if (!track || seen.has(track.id)) return;
      seen.add(track.id);
      tracks.push(track);
    };

    const filtered = await internalFeatureRequest('/config/queue-wizard/preview', {
      method: 'POST',
      body: {
        genres: Array.isArray(body.genres) ? body.genres : [],
        artists: Array.isArray(body.artists) ? body.artists : [],
        albums: Array.isArray(body.albums) ? body.albums : [],
        excludeGenres: Array.isArray(body.excludeGenres) ? body.excludeGenres : [],
        minRating: Number(body.minRating || 0) || 0,
        maxTracks: Math.max(1, Math.min(5000, Number(body.maxTracks || 250) || 250)),
        varietyMode: body.varietyMode !== false,
      },
    });
    for (const row of (Array.isArray(filtered?.json?.tracks) ? filtered.json.tracks : [])) addFile(row?.file);

    const playlists = await loadMobilePlaylists();
    const wantedPlaylistIds = Array.isArray(body.playlistIds) ? new Set(body.playlistIds.map(text)) : new Set();
    for (const playlist of playlists) {
      const id = createMobilePlaylistId({ secret: trackIdSecret, name: playlist.name });
      if (!wantedPlaylistIds.has(id)) continue;
      for (const file of playlist.files) addFile(file);
    }

    if (body.shuffle === true) {
      for (let i = tracks.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
    }
    const maxTracks = Math.max(1, Math.min(5000, Number(body.maxTracks || 250) || 250));
    return { catalog, tracks: tracks.slice(0, maxTracks) };
  };

  const resolveQueueItem = async (req, queueItemId) => {
    const queue = await loadMobileQueue(req);
    const item = queue.items.find((candidate) => candidate.id === text(queueItemId));
    return { queue, item };
  };

  const mobileVibeSeedForQueueItem = (item) => {
    if (!item
      || !item.track
      || item.isStream
      || item.isYoutube
      || item.isPodcast
      || isAirplayFile(item.file)) {
      return null;
    }
    const artist = text(item.track.artist || item.artist);
    const title = text(item.track.title || item.title);
    if (!artist || !title) return null;
    return { artist, title };
  };

  const queueResponse = (res, action, queue) => res.json({
    ok: true,
    action,
    queue: {
      ...queue,
      count: queue.items.length,
      items: queue.items.map(({ file, serverSongId, serverPosition, ...safeItem }) => safeItem),
    },
  });

  const requireSession = (req, res) => {
    const claims = verifyMobileToken(readBearerToken(req), { secret: apiSecret, scope: 'mobile-api' });
    if (!claims) {
      errorResponse(res, 401, 'mobile session is missing or expired');
      return null;
    }
    return claims;
  };

  const requireEnabled = (res) => {
    if (enabled && apiSecret && trackIdSecret && apiSecret !== trackIdSecret) return true;
    errorResponse(res, 404, 'mobile API is not enabled');
    return false;
  };

  const issueMobileSession = (deviceId) => {
    const issuedAt = Date.now();
    return {
      accessToken: createMobileSessionToken({ secret: apiSecret, deviceId, ttlMs: SESSION_TTL_MS, now: issuedAt }),
      refreshToken: createMobileRefreshToken({ secret: apiSecret, deviceId, ttlMs: REFRESH_TTL_MS, now: issuedAt }),
      expiresAt: new Date(issuedAt + SESSION_TTL_MS).toISOString(),
      deviceId,
    };
  };

  const asyncRoute = (handler) => async (req, res) => {
    if (!requireEnabled(res)) return;
    try {
      return await handler(req, res);
    } catch (error) {
      log.error('[mobile-api] request failed', {
        method: text(req?.method) || 'UNKNOWN',
        path: text(req?.originalUrl || req?.url) || '/',
        error: error?.message || String(error),
      });
      return errorResponse(res, 500, 'mobile API request failed');
    }
  };

  app.get('/v1/mobile/animated-art', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson && !fetchInternalRequest) {
      return errorResponse(res, 503, 'mobile animated art is not configured');
    }

    const artist = text(req.query?.artist);
    const album = text(req.query?.album);
    const appleMusicUrl = safeAppleMusicUrl(
      req.query?.appleMusicUrl || req.query?.url
    );
    if ([artist, album].some((value) => value.length > 240)) {
      return errorResponse(res, 400, 'animated-art metadata is too long');
    }

    let pathname = '';
    if (appleMusicUrl) {
      pathname = `/config/library-health/animated-art/radio-lookup?url=${encodeURIComponent(appleMusicUrl)}&h264=1`;
    } else {
      if (!artist || !album) {
        return errorResponse(res, 400, 'artist and album or a valid Apple Music URL are required');
      }
      pathname = `/config/library-health/animated-art/lookup?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&h264=1`;
    }

    const result = await internalFeatureRequest(pathname);
    if (!result?.ok) return errorResponse(res, 502, 'animated-art lookup failed');

    const mediaUrl = safeAnimatedMediaUrl(req, result.json?.hit?.mp4);
    return res.json({
      ok: true,
      hasMotion: Boolean(mediaUrl),
      mediaUrl,
    });
  }));

  const pairingRoute = (handler) => async (req, res) => {
    if (!requireEnabled(res)) return;
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof MobilePairingError) {
        return errorResponse(res, error.status, error.code);
      }
      console.error('[mobile-pairing] request failed');
      return errorResponse(res, 500, 'mobile pairing request failed');
    }
  };

  const requirePairingCredential = (req, res) => {
    if (!pairingAuthConfigured) {
      errorResponse(res, 503, 'pairing display authorization is not configured');
      return false;
    }

    const suppliedTrackKey = text(req?.headers?.['x-track-key']);
    if (suppliedTrackKey) {
      if (!requireTrackKey) {
        errorResponse(res, 503, 'pairing display authorization is not configured');
        return false;
      }
      if (!requireTrackKey(req, res)) return false;
      return true;
    }

    const claims = verifyMobileToken(readBearerToken(req), {
      secret: apiSecret,
      scope: 'mobile-api',
    });
    if (!claims) {
      errorResponse(res, 403, 'Forbidden');
      return false;
    }
    return true;
  };

  const requirePairingDisplay = (req, res) => {
    if (!requirePairingCredential(req, res)) return null;
    const displayToken = text(req?.headers?.['x-mobile-pairing-display-token']);
    if (!displayToken) {
      errorResponse(res, 401, 'pairing display authorization is required');
      return null;
    }
    return displayToken;
  };

  const requirePairingAdmin = (req, res) => {
    return requirePairingCredential(req, res);
  };

  app.post('/v1/mobile/pairing/challenges', pairingRoute(async (req, res) => {
    if (!requirePairingAdmin(req, res)) return;
    const baseUrl = pairingBaseUrl(req, mobileBaseUrl);
    const created = pairingStore.createChallenge({ baseUrl });
    const qrPayload = {
      protocol: 'now-playing-mobile-pairing',
      version: MOBILE_PAIRING_PROTOCOL_VERSION,
      baseUrl: created.baseUrl,
      challenge: created.challenge,
      expiresAt: created.expiresAt,
    };
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 360,
    });
    return res.json({
      ok: true,
      protocolVersion: MOBILE_PAIRING_PROTOCOL_VERSION,
      baseUrl: created.baseUrl,
      challenge: created.challenge,
      expiresAt: created.expiresAt,
      qrPayload,
      qrDataUrl,
      displayToken: created.displayToken,
    });
  }));

  app.get('/v1/mobile/pairing/requests', pairingRoute(async (req, res) => {
    const displayToken = requirePairingDisplay(req, res);
    if (!displayToken) return;
    return res.json({ ok: true, ...pairingStore.listPending({ displayToken }) });
  }));

  app.post('/v1/mobile/pairing/requests', pairingRoute(async (req, res) => {
    const result = pairingStore.submitRequest({
      challenge: text(req?.body?.challenge),
      deviceId: req?.body?.deviceId,
      deviceName: req?.body?.deviceName,
      deviceModel: req?.body?.deviceModel,
      publicKey: req?.body?.publicKey,
      signature: req?.body?.signature,
      signatureAlgorithm: req?.body?.signatureAlgorithm,
    });
    return res.status(202).json({ ok: true, ...result });
  }));

  app.post('/v1/mobile/pairing/requests/:requestId/approve', pairingRoute(async (req, res) => {
    const displayToken = requirePairingDisplay(req, res);
    if (!displayToken) return;
    const result = pairingStore.approve({
      displayToken,
      requestId: req?.params?.requestId,
      verificationCode: req?.body?.verificationCode,
    });
    return res.json({ ok: true, ...result });
  }));

  app.post('/v1/mobile/pairing/requests/:requestId/reject', pairingRoute(async (req, res) => {
    const displayToken = requirePairingDisplay(req, res);
    if (!displayToken) return;
    const result = pairingStore.reject({
      displayToken,
      requestId: req?.params?.requestId,
      verificationCode: req?.body?.verificationCode,
    });
    return res.json({ ok: true, ...result });
  }));

  app.post('/v1/mobile/pairing/challenges/cancel', pairingRoute(async (req, res) => {
    const displayToken = requirePairingDisplay(req, res);
    if (!displayToken) return;
    return res.json({ ok: true, ...pairingStore.cancel({ displayToken }) });
  }));

  app.get('/v1/mobile/pairing/requests/:requestId/complete', pairingRoute(async (req, res) => {
    const pollToken = text(req?.headers?.['x-mobile-pairing-poll-token']);
    const result = pairingStore.complete({
      requestId: req?.params?.requestId,
      pollToken,
      issueSession: ({ deviceId }) => issueMobileSession(deviceId),
    });
    return res.json({ ok: true, ...result });
  }));

  app.post('/v1/mobile/session', asyncRoute(async (req, res) => {
    const suppliedCode = text(req?.headers?.['x-mobile-enrollment-code']);
    if (!enrollmentCode || !timingSafeEqualText(suppliedCode, enrollmentCode)) {
      return errorResponse(res, 403, 'invalid mobile enrollment code');
    }

    const deviceId = requestDeviceId(req?.body || {});
    if (!deviceId) return errorResponse(res, 400, 'deviceId is required');

    return res.json({ ok: true, tokenType: 'Bearer', ...issueMobileSession(deviceId) });
  }));

  app.post('/v1/mobile/session/refresh', asyncRoute(async (req, res) => {
    const refreshToken = text(req?.headers?.['x-mobile-refresh-token']);
    let claims = verifyMobileToken(refreshToken, { secret: apiSecret, scope: 'mobile-refresh' });
    if (!claims
      && !refreshToken
      && text(req?.headers?.['x-mobile-session-migration']) === '1') {
      claims = verifyMobileToken(readBearerToken(req), {
        secret: apiSecret,
        scope: 'mobile-api',
        allowExpired: true,
      });
    }
    const deviceId = text(claims?.deviceId);
    if (!deviceId) return errorResponse(res, 401, 'mobile refresh session is missing or expired');
    return res.json({
      ok: true,
      tokenType: 'Bearer',
      ...issueMobileSession(deviceId),
      ...(refreshToken ? { refreshToken } : {}),
    });
  }));

  app.post('/v1/mobile/push-tokens', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!pushTokenStore) return errorResponse(res, 503, 'mobile push registration is not configured');

    const body = req?.body && typeof req.body === 'object' ? req.body : {};
    const token = normalizeMobilePushToken(body.token);
    if (!token) return errorResponse(res, 400, 'a valid APNs device token is required');

    const environment = normalizeMobilePushEnvironment(body.environment);
    if (!environment) return errorResponse(res, 400, 'APNs environment must be development or production');

    const topic = text(body.topic || body.bundleId) || apnsTopic;
    if (topic !== apnsTopic) return errorResponse(res, 400, 'APNs topic does not match this app');

    await pushTokenStore.upsert({
      token,
      deviceId: text(session.deviceId),
      environment,
      topic,
    });
    log.info('[mobile/push] token registered', {
      deviceIdPresent: Boolean(text(session.deviceId)),
      tokenLength: token.length,
      environment,
      topic,
      apnsConfigured,
    });
    return res.json({
      ok: true,
      registered: true,
      apnsConfigured,
      environment,
      topic,
    });
  }));

  app.delete('/v1/mobile/push-tokens', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!pushTokenStore || typeof pushTokenStore.remove !== 'function') {
      return errorResponse(res, 503, 'mobile push registration is not configured');
    }

    const body = req?.body && typeof req.body === 'object' ? req.body : {};
    const token = body.token ? normalizeMobilePushToken(body.token) : '';
    if (body.token && !token) return errorResponse(res, 400, 'invalid APNs device token');
    const result = await pushTokenStore.remove({
      token,
      deviceId: text(session.deviceId),
    });
    return res.json({ ok: true, removed: Number(result?.removed || 0) });
  }));

  // Feature surfaces below reuse the existing controller services through
  // loopback requests. The bearer boundary is checked here first, and every
  // response is reduced to opaque mobile DTOs before it leaves the API.
  app.get('/v1/mobile/genres', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    return res.json({ ok: true, items: mobileGenreRows(catalog) });
  }));

  app.get('/v1/mobile/genres/:genre/albums', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    await ensureAlbumAddedAt(catalog);
    const wanted = text(req?.params?.genre).toLocaleLowerCase();
    const albumIds = new Set(
      catalog.tracks
        .filter((track) => genreTokens(track.genre).includes(wanted))
        .map((track) => track.albumId)
        .filter(Boolean)
    );
    const albums = catalog.albums
      .filter((album) => albumIds.has(album.id))
      .map((album) => publicMobileAlbum(album, catalog, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }));
    return res.json({ ok: true, genre: text(req?.params?.genre), ...page(albums, pageArgs(req.query)) });
  }));

  app.get('/v1/mobile/podcasts', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    return res.json({ ok: true, items: await loadPodcastSubscriptions(req) });
  }));

  app.get('/v1/mobile/podcasts/:podcastId/episodes', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const payload = await loadPodcastEpisodePayload(req, req?.params?.podcastId, req?.query?.limit);
    if (!payload) return errorResponse(res, 404, 'podcast not found');
    const { rawEpisodes, rss: _rss, ...safePayload } = payload;
    return res.json({ ok: true, ...safePayload });
  }));

  app.post('/v1/mobile/podcasts/subscribe', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const rss = text(req?.body?.rss);
    if (!/^https?:\/\//i.test(rss)) return errorResponse(res, 400, 'rss must be an http(s) URL');
    const result = await internalFeatureRequest('/podcasts/subscribe', {
      method: 'POST',
      body: {
        rss,
        limit: Math.max(1, Math.min(500, Number(req?.body?.limit || 200) || 200)),
        download: Math.max(0, Math.min(50, Number(req?.body?.download || 5) || 5)),
        autoDownload: Boolean(req?.body?.autoDownload),
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast subscribe failed');
    return res.json({ ok: true, items: await loadPodcastSubscriptions(req) });
  }));

  app.post('/v1/mobile/podcasts/refresh', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const result = await internalFeatureRequest('/podcasts/refresh', { method: 'GET' });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast refresh failed');
    return res.json({ ok: true, items: await loadPodcastSubscriptions(req) });
  }));

  app.post('/v1/mobile/podcasts/:podcastId/settings', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const podcast = await resolvePodcast(req, req?.params?.podcastId);
    if (!podcast) return errorResponse(res, 404, 'podcast not found');
    const result = await internalFeatureRequest('/podcasts/subscription/settings', {
      method: 'POST',
      body: { rss: podcast.rss, autoDownload: Boolean(req?.body?.autoDownload) },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast settings failed');
    return res.json({ ok: true, podcastId: podcast.id, autoDownload: Boolean(req?.body?.autoDownload) });
  }));

  app.delete('/v1/mobile/podcasts/:podcastId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const podcast = await resolvePodcast(req, req?.params?.podcastId);
    if (!podcast) return errorResponse(res, 404, 'podcast not found');
    const result = await internalFeatureRequest('/podcasts/unsubscribe', {
      method: 'POST',
      body: { rss: podcast.rss },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast unsubscribe failed');
    return res.json({ ok: true, podcastId: podcast.id, removed: true });
  }));

  const resolvePodcastEpisode = async (req, podcastId, episodeId) => {
    const payload = await loadPodcastEpisodePayload(req, podcastId, 250);
    if (!payload) return null;
    const rawEpisode = payload.rawEpisodes.find((episode) => text(episode?.id) === text(episodeId));
    const safeEpisode = payload.episodes.find((episode) => episode.id === text(episodeId));
    return rawEpisode && safeEpisode ? { ...payload, rawEpisode, safeEpisode } : null;
  };

  const podcastSubscriptionFor = async (rss) => {
    const result = await internalFeatureRequest('/podcasts');
    return (Array.isArray(result?.json?.items) ? result.json.items : [])
      .find((candidate) => text(candidate?.rss) === text(rss)) || null;
  };

  app.post('/v1/mobile/podcasts/:podcastId/episodes/:episodeId/download', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const found = await resolvePodcastEpisode(req, req?.params?.podcastId, req?.params?.episodeId);
    if (!found) return errorResponse(res, 404, 'podcast episode not found');
    const episode = found.rawEpisode;
    const result = await internalFeatureRequest('/podcasts/download-one', {
      method: 'POST',
      body: {
        rss: found.rss,
        id: found.safeEpisode.id,
        enclosure: text(episode?.enclosure),
        title: found.safeEpisode.title,
        date: found.safeEpisode.date,
        imageUrl: text(episode?.imageUrl),
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast download failed');
    return res.json({ ok: true, ...(await loadPodcastEpisodePayload(req, req?.params?.podcastId, 250)) });
  }));

  app.post('/v1/mobile/podcasts/:podcastId/episodes/:episodeId/delete', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const found = await resolvePodcastEpisode(req, req?.params?.podcastId, req?.params?.episodeId);
    if (!found) return errorResponse(res, 404, 'podcast episode not found');
    const episodeKey = text(found.rawEpisode?.enclosure) || `id:${found.safeEpisode.id}`;
    const result = await internalFeatureRequest('/podcasts/episodes/delete', {
      method: 'POST',
      body: { rss: found.rss, episodeUrls: [episodeKey] },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast delete failed');
    return res.json({ ok: true, ...(await loadPodcastEpisodePayload(req, req?.params?.podcastId, 250)) });
  }));

  app.get('/v1/mobile/podcasts/:podcastId/episodes/:episodeId/media', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const found = await podcastEpisodeFile(req, req?.params?.podcastId, req?.params?.episodeId);
    if (!found) return errorResponse(res, 404, 'downloaded podcast episode not found');

    // The web player and moOde both treat the episode's MPD path as the
    // authority. Resolve that same path locally for native playback instead
    // of reconstructing it from a possibly stale subscription directory.
    const row = await podcastSubscriptionFor(found.rss);
    const filename = path.basename(text(found.rawEpisode?.filename) || path.basename(found.file));
    const candidates = [
      mpdFileToLocalPath(found.file),
      row?.dir && filename && filename !== '.' && filename !== '..'
        ? path.join(text(row.dir), filename)
        : '',
    ].filter(Boolean);
    const mediaPath = candidates.find((candidate) => safeIsFile(candidate)) || '';
    if (!mediaPath) return errorResponse(res, 404, 'podcast media is unavailable');
    return serveFileWithRange(req, res, mediaPath, audioContentTypeForPath(mediaPath));
  }));

  const podcastEpisodeFile = async (req, podcastId, episodeId) => {
    const found = await resolvePodcastEpisode(req, podcastId, episodeId);
    if (!found || !found.safeEpisode.downloaded) return null;
    const row = await podcastSubscriptionFor(found.rss);
    const filename = path.basename(text(found.rawEpisode?.filename));
    const file = text(found.rawEpisode?.mpdPath)
      || (text(row?.mpdPrefix) && filename && filename !== '.' && filename !== '..'
        ? `${String(row.mpdPrefix).replace(/\/+$/, '')}/${filename}`
        : '');
    if (!file) return null;
    return { ...found, file };
  };

  // Native podcast playback keeps an opaque device-queue identity because a
  // podcast episode is not a music-catalog track. Resolve that identity back
  // to the server-owned downloaded episode before recording history or
  // sending the APNs track notification.
  const podcastPlaybackTrackForId = async (req, trackId) => {
    const value = text(trackId);
    const prefix = 'podcast-';
    if (!value.startsWith(prefix)) return null;

    const suffix = value.slice(prefix.length);
    const subscriptions = await loadPodcastSubscriptions(req);
    const podcast = subscriptions
      .filter((row) => suffix.startsWith(`${row.id}-`))
      .sort((left, right) => right.id.length - left.id.length)[0];
    if (!podcast) return null;

    const episodeId = suffix.slice(`${podcast.id}-`.length);
    if (!episodeId) return null;
    const found = await podcastEpisodeFile(req, podcast.id, episodeId);
    if (!found) return null;

    const showTitle = text(found.podcast?.title || podcast.title) || 'Podcast';
    const title = text(found.safeEpisode?.title || found.rawEpisode?.title) || `Episode ${episodeId}`;
    const format = path.extname(found.file).replace(/^\./, '').toLowerCase() || 'mp3';
    return {
      id: value,
      file: found.file,
      title,
      artist: showTitle,
      albumArtist: showTitle,
      album: showTitle,
      track: '',
      genre: 'Podcast',
      durationSec: Number(found.rawEpisode?.durationSec || found.safeEpisode?.durationSec || 0) || 0,
      format,
      // Prefer the original feed artwork for APNs. The protected mobile
      // artwork URL cannot be fetched by Apple's notification extension.
      artworkUrl: safeArtworkReference(req, found.rawEpisode?.imageUrl) || '',
    };
  };

  const playMpdFileAtFront = async (file) => {
    if (!mpdQueryRaw) return { ok: false, status: 503, error: 'mobile queue is not configured' };
    const addResult = await mpdQueryRaw(`addid ${mpdEscapeValue(file)}`);
    const songId = parseMpdId(addResult);
    if (!Number.isSafeInteger(songId) || songId < 0) {
      return { ok: false, status: 502, error: 'MPD rejected the queue item' };
    }
    const moveResult = await mpdQueryRaw(`moveid ${songId} 0`);
    if (!moveResult || mpdHasACK(moveResult)) {
      return { ok: false, status: 502, error: 'MPD rejected queue reorder' };
    }
    const playResult = await mpdQueryRaw(`playid ${songId}`);
    if (!playResult || mpdHasACK(playResult)) {
      return { ok: false, status: 502, error: 'MPD rejected queue playback' };
    }
    return { ok: true, songId };
  };

  app.post('/v1/mobile/podcasts/:podcastId/episodes/:episodeId/play', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const found = await podcastEpisodeFile(req, req?.params?.podcastId, req?.params?.episodeId);
    if (!found) return errorResponse(res, 404, 'downloaded podcast episode not found');
    const result = await internalFeatureRequest('/config/diagnostics/playback', {
      method: 'POST',
      body: { action: 'playfile', file: found.file },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast playback failed');
    return res.json({ ok: true, action: 'play', podcastId: req?.params?.podcastId, episodeId: req?.params?.episodeId });
  }));

  app.post('/v1/mobile/podcasts/:podcastId/episodes/:episodeId/queue', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const found = await podcastEpisodeFile(req, req?.params?.podcastId, req?.params?.episodeId);
    if (!found) return errorResponse(res, 404, 'downloaded podcast episode not found');
    const result = await internalFeatureRequest('/config/queue-wizard/apply', {
      method: 'POST',
      body: {
        mode: 'append',
        keepNowPlaying: false,
        tracks: [found.file],
        shuffle: false,
        forceRandomOff: false,
        fastStart: false,
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast queue action failed');
    return res.json({ ok: true, action: 'queue', podcastId: req?.params?.podcastId, episodeId: req?.params?.episodeId });
  }));

  app.post('/v1/mobile/podcasts/:podcastId/play-newest', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const payload = await loadPodcastEpisodePayload(req, req?.params?.podcastId, 250);
    if (!payload) return errorResponse(res, 404, 'podcast not found');
    const newest = [...payload.rawEpisodes]
      .sort((a, b) => (Number(b?.published) || 0) - (Number(a?.published) || 0))
      .map((rawEpisode) => payload.episodes.find((episode) => episode.id === text(rawEpisode?.id)))
      .map((safeEpisode) => safeEpisode && payload.rawEpisodes.find((episode) => text(episode?.id) === safeEpisode.id))
      .find((rawEpisode) => Boolean(rawEpisode?.mpdPath));
    if (!newest) return errorResponse(res, 404, 'no downloaded podcast episodes available');
    const result = await playMpdFileAtFront(text(newest.mpdPath));
    if (!result.ok) return errorResponse(res, result.status, result.error);
    if (req?.body?.alexa === true) {
      const outcome = await runAlexaAction('start');
      if (outcome.invalid || !outcome.result?.ok) {
        return errorResponse(res, Number(outcome.result?.status) || 502, 'Alexa could not be started');
      }
    }
    return res.json({
      ok: true,
      action: 'play-newest',
      podcastId: req?.params?.podcastId,
      episodeId: text(newest.id),
    });
  }));

  app.post('/v1/mobile/podcasts/:podcastId/load', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const payload = await loadPodcastEpisodePayload(req, req?.params?.podcastId, 250);
    if (!payload) return errorResponse(res, 404, 'podcast not found');
    const files = [...payload.rawEpisodes]
      .sort((a, b) => (Number(a?.published) || 0) - (Number(b?.published) || 0))
      .filter((episode) => text(episode?.mpdPath))
      .map((episode) => text(episode.mpdPath));
    if (!files.length) return errorResponse(res, 404, 'no downloaded podcast episodes available');
    const result = await internalFeatureRequest('/config/queue-wizard/apply', {
      method: 'POST',
      body: {
        mode: 'replace',
        keepNowPlaying: false,
        tracks: files,
        shuffle: false,
        forceRandomOff: false,
        fastStart: true,
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'podcast load failed');
    if (req?.body?.alexa === true) {
      const outcome = await runAlexaAction('start');
      if (outcome.invalid || !outcome.result?.ok) {
        return errorResponse(res, Number(outcome.result?.status) || 502, 'Alexa could not be started');
      }
    }
    return res.json({ ok: true, action: 'load', podcastId: req?.params?.podcastId, count: files.length });
  }));

  app.get('/v1/mobile/radio/options', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const result = await internalFeatureRequest('/config/queue-wizard/radio-options');
    return res.json({ ok: true, genres: Array.isArray(result?.json?.genres) ? result.json.genres.map(text).filter(Boolean) : [] });
  }));

  app.get('/v1/mobile/radio', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const genre = text(req?.query?.genre);
    const items = await loadRadioStations(req, {
      genres: genre ? [genre] : [],
      favoritesOnly: String(req?.query?.favoritesOnly || '') === 'true',
      hqOnly: String(req?.query?.hqOnly || '') === 'true',
    });
    return res.json({ ok: true, items });
  }));

  app.post('/v1/mobile/radio/stream-authorizations', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const stationId = text(req?.body?.stationId);
    if (!stationId) return errorResponse(res, 400, 'stationId is required');

    const file = await resolveRadioFile(req, stationId);
    if (!file) return errorResponse(res, 404, 'radio station not found');
    if (!radioUrlFor(file)) return errorResponse(res, 415, 'radio station has no playable stream URL');

    const ticket = createMobileRadioTicket({
      secret: apiSecret,
      deviceId: session.deviceId,
      stationId,
      ttlMs: RADIO_TICKET_TTL_MS,
    });
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const url = `${baseUrl}/v1/mobile/radio/stream/${encodeURIComponent(stationId)}?ticket=${encodeURIComponent(ticket)}`;
    return res.json({
      ok: true,
      stationId,
      isLive: true,
      contentType: radioContentTypeFor(file),
      url,
      expiresAt: new Date(Date.now() + RADIO_TICKET_TTL_MS).toISOString(),
    });
  }));

  app.get('/v1/mobile/radio/stream/:stationId', asyncRoute(async (req, res) => {
    const stationId = text(req?.params?.stationId);
    const claims = verifyMobileToken(text(req?.query?.ticket), { secret: apiSecret, scope: 'mobile-radio' });
    if (!claims || claims.stationId !== stationId) return errorResponse(res, 401, 'radio ticket is missing or expired');

    const file = await resolveRadioFile(req, stationId);
    const streamUrl = radioUrlFor(file);
    if (!streamUrl) return errorResponse(res, 404, 'radio station not found');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let upstream;
    try {
      upstream = await fetchRadioStream(streamUrl.toString(), {
        redirect: 'follow',
        headers: {
          'Icy-MetaData': '1',
          'User-Agent': 'Now-Playing-Mobile-Radio/1.0',
        },
        signal: controller.signal,
      });
    } catch {
      return errorResponse(res, 502, 'radio stream unavailable');
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream?.ok || !upstream.body) {
      try { await upstream?.body?.cancel?.(); } catch {}
      return errorResponse(res, 502, 'radio stream unavailable');
    }

    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    for (const header of ['content-type', 'icy-metaint', 'icy-name', 'icy-genre', 'icy-br']) {
      const value = upstream.headers?.get?.(header);
      if (value) res.setHeader(header, value);
    }

    const stream = Readable.fromWeb(upstream.body);
    const closeStream = () => {
      if (!stream.destroyed) stream.destroy();
    };
    res.on('close', closeStream);
    stream.on('end', () => res.off?.('close', closeStream));
    stream.on('error', (error) => {
      if (res.destroyed || res.writableEnded) return;
      console.error('[mobile-radio] stream failed:', error?.message || String(error));
      res.destroy(error);
    });
    stream.pipe(res);
    return res;
  }));

  app.post('/v1/mobile/radio/metadata', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!enrichRadioMetadata) return errorResponse(res, 503, 'radio metadata lookup is not configured');

    const stationId = text(req?.body?.stationId);
    const artist = text(req?.body?.artist);
    const title = text(req?.body?.title);
    const album = text(req?.body?.album);
    if (!stationId || !title) return errorResponse(res, 400, 'stationId and title are required');
    if ([artist, title, album].some((value) => value.length > 240)) {
      return errorResponse(res, 400, 'radio metadata is too long');
    }

    const file = await resolveRadioFile(req, stationId);
    if (!file) return errorResponse(res, 404, 'radio station not found');

    const stations = await loadRadioStations(req).catch(() => []);
    const station = stations.find((row) => row.id === stationId);
    const result = await enrichRadioMetadata({
      stationId,
      file,
      stationName: text(station?.name),
      artist,
      title,
      album,
    });
    const artworkReference = safeArtworkReference(req, result?.artworkUrl);
    const artworkUrl = artworkReference
      ? artworkUrlFor(req, { kind: 'url', reference: artworkReference })
      : null;
    const appleMusicUrl = safeAppleMusicUrl(
      result?.trackUrl
      || result?.itunesUrl
      || result?.albumUrl
    );
    const matchedTitle = text(result?.title || title) || null;
    const matchedArtist = text(result?.artist || artist) || null;
    const matchedAlbum = text(result?.album || album) || null;
    const directAbout = normalizeMobileAbout(result?.about);
    // The native player and moOde can report the same radio item at slightly
    // different moments. Apple enrichment may therefore be partial (or mark
    // a lookup as unmatched) even while the canonical /now-playing payload
    // already has verified About text. Ask the canonical path whenever the
    // direct lookup did not provide About; its title/artist/album or Apple URL
    // comparison is the safety boundary against copying unrelated text.
    const canonicalAbout = directAbout
      ? {
        about: directAbout,
        aboutStatus: text(result?.aboutStatus) || null,
        aboutProvider: text(result?.aboutProvider) || null,
      }
      : await matchingCanonicalRadioAbout({
        artist: matchedArtist || artist,
        title: matchedTitle || title,
        album: matchedAlbum || album,
        trackUrl: result?.trackUrl,
        albumUrl: result?.albumUrl,
      });
    const notificationTrack = radioPlaybackTrack({ stationId, file, station });
    if (notifyNativePlayback && notificationTrack) {
      const enrichedTrack = {
        ...notificationTrack,
        title: matchedTitle || notificationTrack.title,
        artist: matchedArtist || notificationTrack.artist,
        album: matchedAlbum || notificationTrack.album,
        // Keep the protected URL for the mobile response below, but give the
        // APNs sender the original safe external artwork URL. The iOS
        // notification-service extension cannot attach the app bearer token.
        artworkUrl: artworkReference || '',
        artworkMatched: Boolean(result?.matched && artworkReference),
        appleMusicUrl: appleMusicUrl || '',
      };
      Promise.resolve()
        .then(() => notifyNativePlayback({
          track: enrichedTrack,
          trackId: notificationTrack.id,
          sessionId: session.deviceId,
          deviceId: session.deviceId,
        }))
        .catch(() => {});
    }

    return res.json({
      ok: true,
      stationId,
      matched: Boolean(result?.matched),
      title: matchedTitle,
      artist: matchedArtist,
      album: matchedAlbum,
      year: text(result?.year) || null,
      artworkUrl,
      appleMusicUrl,
      about: canonicalAbout.about,
      aboutStatus: canonicalAbout.aboutStatus,
      aboutProvider: canonicalAbout.aboutProvider,
      radioProfile: text(result?.profile) || null,
      radioClassification: text(result?.classification) || null,
      radioConfidence: text(result?.confidence) || null,
      radioReasonCodes: Array.isArray(result?.reasonCodes) ? result.reasonCodes : [],
      radioLookup: result?.lookup || null,
      reason: text(result?.reason) || null,
    });
  }));

  const radioPresetRows = async (req) => {
    const result = await internalFeatureRequest('/config/queue-wizard/radio-presets');
    const presets = Array.isArray(result?.json?.presets) ? result.json.presets : [];
    return presets.map((preset) => ({
      id: text(preset?.id),
      name: text(preset?.name),
      stationIds: (Array.isArray(preset?.stations) ? preset.stations : [])
        .map((station) => {
          const file = text(station?.file || station?.url || station);
          if (!file) return '';
          const id = radioIdFor(file);
          rememberOpaqueEntry(radioEntries, id, file);
          return id;
        })
        .filter(Boolean),
    })).filter((preset) => preset.id && preset.name);
  };

  app.get('/v1/mobile/radio/presets', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    return res.json({ ok: true, items: await radioPresetRows(req) });
  }));

  app.post('/v1/mobile/radio/stations/:stationId/favorite', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const file = await resolveRadioFile(req, req?.params?.stationId);
    if (!file) return errorResponse(res, 404, 'radio station not found');
    const result = await internalFeatureRequest('/config/queue-wizard/radio-favorite', {
      method: 'POST',
      body: { file, favorite: req?.body?.favorite !== false },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'radio favorite update failed');
    return res.json({ ok: true, stationId: req?.params?.stationId, favorite: Boolean(result?.json?.favorite) });
  }));

  const applyRadioFiles = async (req, files, mode = 'replace') => internalFeatureRequest('/config/queue-wizard/apply', {
    method: 'POST',
    body: {
      mode: mode === 'append' ? 'append' : 'replace',
      keepNowPlaying: Boolean(req?.body?.keepNowPlaying),
      tracks: files,
      shuffle: false,
      forceRandomOff: false,
      fastStart: mode !== 'append',
    },
  });

  app.post('/v1/mobile/radio/play', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const file = await resolveRadioFile(req, req?.body?.stationId);
    if (!file) return errorResponse(res, 404, 'radio station not found');
    const result = await applyRadioFiles(req, [file], 'replace');
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'radio playback failed');
    return res.json({ ok: true, action: 'play', stationId: req?.body?.stationId });
  }));

  app.post('/v1/mobile/radio/play-front', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const stationId = text(req?.body?.stationId);
    const file = await resolveRadioFile(req, stationId);
    if (!file) return errorResponse(res, 404, 'radio station not found');
    const result = await playMpdFileAtFront(file);
    if (!result.ok) return errorResponse(res, result.status, result.error);
    if (req?.body?.alexa === true) {
      const outcome = await runAlexaAction('start');
      if (outcome.invalid || !outcome.result?.ok) {
        return errorResponse(res, Number(outcome.result?.status) || 502, 'Alexa could not be started');
      }
    }
    return res.json({ ok: true, action: 'play-front', stationId });
  }));

  app.post('/v1/mobile/radio/queue', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const ids = Array.isArray(req?.body?.stationIds) ? req.body.stationIds.map(text).filter(Boolean) : [];
    const files = [];
    for (const id of ids) {
      const file = await resolveRadioFile(req, id);
      if (file) files.push(file);
    }
    if (!files.length) return errorResponse(res, 400, 'stationIds is required');
    const result = await applyRadioFiles(req, files, req?.body?.mode);
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'radio queue action failed');
    return res.json({ ok: true, action: 'queue', count: files.length, mode: req?.body?.mode === 'append' ? 'append' : 'replace' });
  }));

  app.post('/v1/mobile/radio/presets', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const name = text(req?.body?.name);
    const ids = Array.isArray(req?.body?.stationIds) ? req.body.stationIds.map(text).filter(Boolean) : [];
    const stations = [];
    for (const id of ids) {
      const file = await resolveRadioFile(req, id);
      if (file) stations.push({ file, stationName: '' });
    }
    if (!name || !stations.length) return errorResponse(res, 400, 'name and stationIds are required');
    const result = await internalFeatureRequest('/config/queue-wizard/radio-presets', {
      method: 'POST',
      body: { name, stations },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'radio preset save failed');
    return res.json({ ok: true, items: await radioPresetRows(req) });
  }));

  app.get('/v1/mobile/queue-wizard/options', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    return res.json({ ok: true, ...(await queueWizardOptions(req)) });
  }));

  app.post('/v1/mobile/queue-wizard/preview', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { catalog, tracks } = await mobileQueueWizardTracks(req, req?.body || {});
    return res.json({
      ok: true,
      count: tracks.length,
      varietyMode: true,
      tracks: tracks.map((track) => publicMobileTrack(track, { baseUrl: requestBaseUrl(req, mobileBaseUrl) })),
      catalogBuiltAt: catalog.builtAt,
    });
  }));

  const resolveWizardTracks = async (req, body = {}) => {
    const catalog = await loadCatalog();
    let tracks = Array.isArray(body.trackIds)
      ? body.trackIds.map((id) => catalog.byTrackId.get(text(id))).filter(Boolean)
      : [];
    if (!tracks.length && body.filters) {
      tracks = (await mobileQueueWizardTracks(req, body.filters)).tracks;
    }
    return { catalog, tracks };
  };

  app.post('/v1/mobile/queue-wizard/collage-preview', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { catalog, tracks } = await resolveWizardTracks(req, req?.body || {});
    if (!tracks.length) return errorResponse(res, 400, 'trackIds is required');
    const result = await internalFeatureRequest('/config/queue-wizard/collage-preview', {
      method: 'POST',
      body: {
        playlistName: text(req?.body?.playlistName),
        tracks: tracks.map((track) => track.file),
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'collage preview failed');
    return res.json({
      ok: true,
      dataBase64: text(result?.json?.dataBase64),
      mimeType: text(result?.json?.mimeType) || 'image/jpeg',
      count: tracks.length,
      catalogBuiltAt: catalog.builtAt,
    });
  }));

  app.post('/v1/mobile/queue-wizard/apply', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { tracks } = await resolveWizardTracks(req, req?.body || {});
    if (!tracks.length) return errorResponse(res, 400, 'trackIds is required');
    const result = await internalFeatureRequest('/config/queue-wizard/apply', {
      method: 'POST',
      body: {
        mode: text(req?.body?.mode).toLocaleLowerCase() === 'append' ? 'append' : 'replace',
        keepNowPlaying: Boolean(req?.body?.keepNowPlaying),
        tracks: tracks.map((track) => track.file),
        shuffle: Boolean(req?.body?.shuffle),
        forceRandomOff: Boolean(req?.body?.forceRandomOff),
        fastStart: req?.body?.fastStart !== false,
        play: req?.body?.play !== false,
        playlistName: text(req?.body?.playlistName),
        saveOnly: Boolean(req?.body?.saveOnly),
        generateCollage: Boolean(req?.body?.generateCollage),
        previewCoverBase64: text(req?.body?.previewCoverBase64),
        previewCoverMimeType: text(req?.body?.previewCoverMimeType) || 'image/jpeg',
      },
    });
    if (result?.ok === false) return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'queue wizard apply failed');
    return res.json({
      ok: true,
      mode: result?.json?.mode || req?.body?.mode || 'replace',
      requested: tracks.length,
      added: Number(result?.json?.added || 0) || 0,
      playStarted: Boolean(result?.json?.playStarted),
      playlistSaved: Boolean(result?.json?.playlistSaved),
      playlistError: text(result?.json?.playlistError),
      collageGenerated: Boolean(result?.json?.collageGenerated),
      collageError: text(result?.json?.collageError),
    });
  }));

  app.post('/v1/mobile/alexa/actions', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile Alexa control is not configured');

    const action = text(req?.body?.action).toLocaleLowerCase();
    const outcome = await runAlexaAction(action);
    if (outcome.invalid) return errorResponse(res, 400, 'unsupported Alexa action');
    if (!outcome.result?.ok) {
      return errorResponse(
        res,
        Number(outcome.result?.status) || 502,
        text(outcome.result?.json?.error) || 'Alexa action failed',
      );
    }

    return res.json({
      ok: true,
      target: 'alexa',
      action,
      diagnosticsAction: outcome.diagnosticsAction,
    });
  }));

  app.post('/v1/mobile/alexa/queue', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile Alexa queue control is not configured');

    const { tracks } = await resolveWizardTracks(req, req?.body || {});
    if (!tracks.length) return errorResponse(res, 400, 'trackIds is required');

    const mode = text(req?.body?.mode).toLocaleLowerCase() === 'append' ? 'append' : 'replace';
    const applyResult = await internalFeatureRequest('/config/queue-wizard/apply', {
      method: 'POST',
      body: {
        mode,
        keepNowPlaying: Boolean(req?.body?.keepNowPlaying),
        tracks: tracks.map((track) => track.file),
        shuffle: Boolean(req?.body?.shuffle),
        forceRandomOff: Boolean(req?.body?.forceRandomOff),
        fastStart: req?.body?.fastStart !== false,
        play: req?.body?.play !== false,
      },
    });
    if (!applyResult?.ok) {
      return errorResponse(
        res,
        Number(applyResult?.status) || 502,
        text(applyResult?.json?.error) || 'Alexa queue update failed',
      );
    }

    let alexaStarted = false;
    if (req?.body?.play === true) {
      const outcome = await runAlexaAction('start');
      if (outcome.invalid || !outcome.result?.ok) {
        return errorResponse(
          res,
          Number(outcome.result?.status) || 502,
          text(outcome.result?.json?.error) || 'Alexa could not be started',
        );
      }
      alexaStarted = true;
    }

    return res.json({
      ok: true,
      target: 'alexa',
      mode,
      requested: tracks.length,
      added: Number(applyResult?.json?.added || 0) || 0,
      playStarted: Boolean(applyResult?.json?.playStarted),
      alexaStarted,
    });
  }));

  app.post('/v1/mobile/queue-wizard/add-to-playlist', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const playlistName = text(req?.body?.playlistName);
    if (!playlistName) return errorResponse(res, 400, 'playlistName is required');

    const { tracks } = await resolveWizardTracks(req, req?.body || {});
    if (!tracks.length) return errorResponse(res, 400, 'trackIds is required');

    const result = await internalFeatureRequest('/config/queue-wizard/add-to-playlist', {
      method: 'POST',
      body: {
        playlistName,
        tracks: tracks.map((track) => track.file),
      },
    });
    if (result?.ok === false) {
      return errorResponse(res, Number(result.status) || 502, result?.json?.error || 'playlist update failed');
    }
    return res.json({
      ok: true,
      playlistName: text(result?.json?.playlistName) || playlistName,
      added: Number(result?.json?.added || 0) || 0,
    });
  }));

  app.post('/v1/mobile/queue-wizard/vibe', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!startMobileVibe) return errorResponse(res, 501, 'mobile Vibe control is not configured');
    const result = await startMobileVibe({
      targetQueue: Math.max(1, Math.min(500, Number(req?.body?.targetQueue || 25) || 25)),
      minRating: Math.max(0, Math.min(5, Number(req?.body?.minRating || 0) || 0)),
      keepPlaying: Boolean(req?.body?.keepPlaying),
    });
    return res.json({ ok: true, ...result });
  }));

  app.post('/v1/mobile/queue/items', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!mpdQueryRaw) return errorResponse(res, 503, 'mobile queue is not configured');

    const mode = text(req?.body?.mode).toLocaleLowerCase();
    if (mode !== 'append') return errorResponse(res, 400, 'mode must be append');

    const trackId = text(req?.body?.trackId);
    if (!trackId) return errorResponse(res, 400, 'trackId is required');

    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(trackId);
    if (!track) return errorResponse(res, 404, 'track not found');

    const addResult = await mpdQueryRaw(`addid ${mpdEscapeValue(track.file)}`);
    if (!addResult || mpdHasACK(addResult)) {
      return errorResponse(res, 502, 'MPD rejected the queue item');
    }

    const mpdSongId = parseMpdId(addResult);
    if (!mpdSongId) return errorResponse(res, 502, 'MPD did not return a song ID');

    return res.status(201).json({
      ok: true,
      mode,
      trackId,
      mpdSongId,
      track: publicMobileTrack(track, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }),
    });
  }));

  // The native Live Queue uses bearer-authenticated opaque queue handles. The
  // MPD file path and song ID stay inside this route and are never returned to
  // the client.
  app.get('/v1/mobile/queue', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const queue = await loadMobileQueue(req);
    return queueResponse(res, 'list', queue);
  }));

  // The native queue sends only an opaque queue handle. Resolve the current
  // snapshot here, then reuse the established seeded Vibe route internally so
  // the app never receives or supplies a Track Key, file path, or MPD ID.
  app.post('/v1/mobile/queue/items/:queueItemId/vibe', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile Vibe control is not configured');

    const { queue, item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');

    const seed = mobileVibeSeedForQueueItem(item);
    if (!seed) return errorResponse(res, 400, 'queue item is not eligible for Vibe');

    const rawTargetQueue = Number(req?.body?.targetQueue);
    const targetQueue = Number.isFinite(rawTargetQueue)
      ? Math.max(1, Math.min(200, Math.floor(rawTargetQueue)))
      : 25;
    const playNow = req?.body?.playNow === true;
    const result = await internalFeatureRequest('/config/queue-wizard/vibe-seed-start', {
      method: 'POST',
      body: {
        targetQueue,
        playNow,
        seedArtist: seed.artist,
        seedTitle: seed.title,
      },
    });
    if (!result?.ok) {
      return errorResponse(
        res,
        Number(result?.status) || 502,
        text(result?.json?.error) || 'Vibe could not be started',
      );
    }

    const jobId = text(result?.json?.jobId);
    if (!jobId) return errorResponse(res, 502, 'Vibe did not return a job ID');
    return res.status(202).json({
      ok: true,
      accepted: true,
      jobId,
      queueCount: queue.items.length,
      targetQueue,
    });
  }));

  app.get('/v1/mobile/vibe/jobs/:jobId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson && !fetchInternalRequest) {
      return errorResponse(res, 503, 'mobile Vibe control is not configured');
    }

    const jobId = text(req?.params?.jobId);
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(jobId)) {
      return errorResponse(res, 400, 'invalid Vibe job ID');
    }

    const result = await internalFeatureRequest(
      '/config/queue-wizard/vibe-status/' + encodeURIComponent(jobId),
    );
    if (!result?.ok) {
      return errorResponse(
        res,
        Number(result?.status) === 404 ? 404 : 502,
        Number(result?.status) === 404 ? 'Vibe job not found' : 'Vibe status unavailable',
      );
    }

    return res.json(safeMobileVibeJob(result.json || {}, jobId));
  }));

  app.get('/v1/mobile/endless-vibe', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson) return errorResponse(res, 503, 'mobile Endless Vibe control is not configured');

    const result = await internalFeatureRequest('/config/endless-vibe');
    if (!result?.ok) {
      return errorResponse(
        res,
        Number(result?.status) || 502,
        text(result?.json?.error) || 'Endless Vibe setting could not be read',
      );
    }
    return res.json(await mobileEndlessVibeResponse(result?.json?.enabled === true));
  }));

  app.post('/v1/mobile/endless-vibe', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile Endless Vibe control is not configured');
    if (typeof req?.body?.enabled !== 'boolean') {
      return errorResponse(res, 400, 'enabled must be boolean');
    }

    const result = await internalFeatureRequest('/config/endless-vibe', {
      method: 'POST',
      body: { enabled: req.body.enabled },
    });
    if (!result?.ok) {
      return errorResponse(
        res,
        Number(result?.status) || 502,
        text(result?.json?.error) || 'Endless Vibe setting could not be saved',
      );
    }
    return res.json(await mobileEndlessVibeResponse(result?.json?.enabled === true));
  }));

  app.get('/v1/mobile/queue/items/:queueItemId/artwork', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!serveArtworkForTrack) return errorResponse(res, 503, 'mobile artwork is not configured');
    const { item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!item.track || !item.file) return errorResponse(res, 404, 'queue item has no cached artwork');
    return serveArtworkForTrack(res, item.file);
  }));

  app.post('/v1/mobile/queue/items/:queueItemId/play', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverSongId) || item.serverSongId < 0) {
      return errorResponse(res, 409, 'queue item cannot be played');
    }
    const result = await mpdQueryRaw(`playid ${item.serverSongId}`);
    if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected the queue item');
    return queueResponse(res, 'play', await loadMobileQueue(req));
  }));

  app.post('/v1/mobile/alexa/queue/items/:queueItemId/play', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!mpdQueryRaw || !fetchInternalRequest) {
      return errorResponse(res, 503, 'mobile Alexa queue control is not configured');
    }

    const { item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverSongId) || item.serverSongId < 0) {
      return errorResponse(res, 409, 'queue item cannot be played');
    }

    const result = await mpdQueryRaw(`playid ${item.serverSongId}`);
    if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected the queue item');

    const outcome = await runAlexaAction('start');
    if (outcome.invalid || !outcome.result?.ok) {
      return errorResponse(
        res,
        Number(outcome.result?.status) || 502,
        text(outcome.result?.json?.error) || 'Alexa could not be started',
      );
    }
    return queueResponse(res, 'alexa-play', await loadMobileQueue(req));
  }));

  app.delete('/v1/mobile/queue/items/:queueItemId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverSongId) || item.serverSongId < 0) {
      return errorResponse(res, 409, 'queue item cannot be removed');
    }
    const result = await mpdQueryRaw(`deleteid ${item.serverSongId}`);
    if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected queue removal');
    return queueResponse(res, 'remove', await loadMobileQueue(req));
  }));

  app.post('/v1/mobile/queue/items/:queueItemId/delete-below', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!mpdQueryRaw) return errorResponse(res, 503, 'mobile queue is not configured');
    const requestedTarget = text(req?.body?.target).toLocaleLowerCase();
    if (requestedTarget && requestedTarget !== 'home' && requestedTarget !== 'moode') {
      return errorResponse(res, 409, 'delete-below is supported only for the Home moOde queue');
    }

    // Resolve the signed handle against one fresh authoritative snapshot. The
    // handle includes the MPD position, so a reorder between snapshots is a
    // safe stale-handle failure rather than an accidental delete at a new
    // position.
    const { queue, item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverPosition) || item.serverPosition < 1) {
      return errorResponse(res, 409, 'queue item cannot be truncated');
    }

    const currentItem = queue.items.find((candidate) => candidate.isCurrent === true);
    if (currentItem && currentItem.serverPosition > item.serverPosition) {
      return errorResponse(res, 409, 'delete-below would remove the currently playing item');
    }

    // MPD positions are zero-based for ranged delete. The mobile DTO exposes
    // one-based positions, so the selected position is the first item removed.
    if (item.serverPosition < queue.items.length) {
      const result = await mpdQueryRaw(`delete ${item.serverPosition}`);
      if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected queue truncation');
    }
    return queueResponse(res, 'delete-below', await loadMobileQueue(req));
  }));

  app.post('/v1/mobile/queue/items/:queueItemId/delete-above', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!mpdQueryRaw) return errorResponse(res, 503, 'mobile queue is not configured');
    const requestedTarget = text(req?.body?.target).toLocaleLowerCase();
    if (requestedTarget && requestedTarget !== 'home' && requestedTarget !== 'moode') {
      return errorResponse(res, 409, 'delete-above is supported only for the Home moOde queue');
    }

    const { queue, item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverPosition) || item.serverPosition < 1) {
      return errorResponse(res, 409, 'queue item cannot be truncated');
    }

    const currentItem = queue.items.find((candidate) => candidate.isCurrent === true);
    if (currentItem && currentItem.serverPosition < item.serverPosition) {
      return errorResponse(res, 409, 'delete-above would remove the currently playing item');
    }

    // Delete by stable MPD song IDs rather than a range because deleting from
    // the front shifts every later position. The selected item and everything
    // after it remain untouched.
    for (const candidate of queue.items
      .filter((candidate) => candidate.serverPosition < item.serverPosition)
      .sort((a, b) => a.serverPosition - b.serverPosition)) {
      if (!Number.isSafeInteger(candidate.serverSongId) || candidate.serverSongId < 0) {
        return errorResponse(res, 409, 'queue item cannot be truncated');
      }
      const result = await mpdQueryRaw(`deleteid ${candidate.serverSongId}`);
      if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected queue truncation');
    }
    return queueResponse(res, 'delete-above', await loadMobileQueue(req));
  }));

  app.post('/v1/mobile/queue/items/:queueItemId/move', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const { queue, item } = await resolveQueueItem(req, req?.params?.queueItemId);
    if (!item) return errorResponse(res, 404, 'queue item not found');
    if (!Number.isSafeInteger(item.serverSongId) || item.serverSongId < 0) {
      return errorResponse(res, 409, 'queue item cannot be moved');
    }
    const rawPosition = Number(req?.body?.toPosition);
    const toPosition = Number.isFinite(rawPosition) ? Math.floor(rawPosition) : 0;
    if (toPosition < 1 || toPosition > queue.items.length) {
      return errorResponse(res, 400, 'toPosition must be within the current queue');
    }
    if (toPosition !== item.position) {
      const result = await mpdQueryRaw(`moveid ${item.serverSongId} ${toPosition - 1}`);
      if (!result || mpdHasACK(result)) return errorResponse(res, 502, 'MPD rejected queue reorder');
    }
    return queueResponse(res, 'move', await loadMobileQueue(req));
  }));

  app.post('/v1/mobile/queue/actions', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!mpdQueryRaw) return errorResponse(res, 503, 'mobile queue is not configured');
    const action = text(req?.body?.action).toLocaleLowerCase();

    if (action === 'vibe') {
      if (!startMobileVibe) return errorResponse(res, 501, 'mobile Vibe control is not configured');
      const result = await startMobileVibe(req?.body || {});
      return res.json({ ok: true, action, ...result });
    }

    if (!['clear', 'crop', 'shuffle', 'shufflequeue'].includes(action)) {
      return errorResponse(res, 400, 'unsupported queue action');
    }

    // Reuse the web controller's reliable crop path. Raw MPD `crop` rejects
    // queues that still have items but no current song (for example after a
    // stop or an Alexa handoff); the diagnostics route keeps the queue head
    // in that case and returns a clean result to both clients.
    if (action === 'crop' && fetchInternalRequest) {
      const reliableCrop = await internalFeatureRequest('/config/diagnostics/playback', {
        method: 'POST',
        body: { action: 'crop' },
      });
      if (!reliableCrop?.ok) {
        return errorResponse(
          res,
          Number(reliableCrop?.status) || 409,
          text(reliableCrop?.json?.error) || 'MPD rejected queue action: crop',
        );
      }
      return queueResponse(res, action, await loadMobileQueue(req));
    }

    // Shuffle always means a physical upcoming-queue reorder. This keeps the
    // visible queue and Alexa's next-track order aligned and never enables
    // Physical queue shuffle. Keep shufflequeue as a compatibility alias.
    if (action === 'shuffle' || action === 'shufflequeue') {
      if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile queue shuffle is not configured');
      const reliableShuffle = await internalFeatureRequest('/config/diagnostics/playback', {
        method: 'POST',
        body: { action: 'shufflequeue' },
      });
      if (!reliableShuffle?.ok) {
        return errorResponse(
          res,
          Number(reliableShuffle?.status) || 502,
          text(reliableShuffle?.json?.error) || 'MPD rejected queue action: shufflequeue',
        );
      }
      return queueResponse(res, 'shuffle', await loadMobileQueue(req));
    }

    const result = await mpdQueryRaw(action);
    if (!result || mpdHasACK(result)) {
      return errorResponse(res, action === 'crop' ? 409 : 502, `MPD rejected queue action: ${action}`);
    }
    return queueResponse(res, action, await loadMobileQueue(req));
  }));

  app.get('/v1/mobile/now-playing', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson) return errorResponse(res, 503, 'mobile now-playing is not configured');
    res.set('Cache-Control', 'no-store');
    return res.json(await loadMobileNowPlaying(req));
  }));

  app.get('/v1/mobile/next-up', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    res.set('Cache-Control', 'no-store');
    return res.json(await loadMobileNextUp(req));
  }));

  app.get('/v1/mobile/audio-info', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson) return errorResponse(res, 503, 'mobile audio info is not configured');

    // Keep the native client on the bearer-authenticated mobile contract. The
    // existing web route is Track-Key protected and may include internal
    // source metadata, so only forward its sanitized section/key/value rows.
    const result = await fetchInternalJson('/config/moode/audio-info?view=rows').catch(() => null);
    if (!result?.ok) {
      return errorResponse(
        res,
        Number(result?.status) || 502,
        text(result?.json?.error) || 'audio info unavailable',
      );
    }

    const rows = Array.isArray(result.json?.rows)
      ? result.json.rows
        .map((row) => ({
          section: text(row?.section) || 'General',
          key: text(row?.key),
          value: text(row?.value) || '—',
        }))
        .filter((row) => row.key)
      : [];

    return res.json({
      ok: true,
      rows,
      fetchedAt: text(result.json?.fetchedAt) || null,
    });
  }));

  app.post('/v1/mobile/now-playing/favorite', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (typeof req?.body?.favorite !== 'boolean') {
      return errorResponse(res, 400, 'favorite must be boolean');
    }

    const current = await resolveMobileCurrentSnapshot(req);
    if (current.payload?.isStream || current.payload?.isAirplay || current.disabled || !current.track) {
      return res.json({ ok: true, isFavorite: false, disabled: true });
    }
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile favorite control is not configured');

    const result = await internalFeatureRequest('/favorites/toggle', {
      method: 'POST',
      body: { file: current.file, favorite: req.body.favorite },
    });
    if (!result?.ok) return errorResponse(res, 502, 'favorite update failed');
    if (result.json?.disabled) {
      return res.json({ ok: true, isFavorite: false, disabled: true });
    }
    return res.json({
      ok: true,
      isFavorite: Boolean(result.json?.isFavorite),
      disabled: false,
    });
  }));

  app.post('/v1/mobile/now-playing/rating', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;

    const current = await resolveMobileCurrentSnapshot(req);
    if (current.payload?.isStream || current.payload?.isAirplay || current.disabled || !current.track) {
      return res.json({ ok: true, rating: 0, ratingDisabled: true, disabled: true });
    }
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile rating control is not configured');

    const result = await internalFeatureRequest('/rating', {
      method: 'POST',
      body: { file: current.file, rating: req?.body?.rating },
    });
    if (!result?.ok) {
      const status = Number(result?.status);
      return errorResponse(res, status >= 400 && status < 500 ? status : 502, 'rating update failed');
    }
    if (result.json?.disabled) {
      return res.json({ ok: true, rating: 0, ratingDisabled: true, disabled: true });
    }
    const numericRating = Number(result.json?.rating);
    return res.json({
      ok: true,
      rating: Number.isFinite(numericRating) ? Math.max(0, Math.min(5, Math.round(numericRating))) : 0,
      ratingDisabled: false,
      disabled: false,
    });
  }));

  app.get('/v1/mobile/home/rows', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson) return errorResponse(res, 503, 'mobile home rows are not configured');
    return res.json({ ok: true, ...(await loadMobileHomeRows(req)) });
  }));

  app.post('/v1/mobile/home/profile', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!fetchInternalJson || !fetchInternalRequest) {
      return errorResponse(res, 503, 'mobile home settings are not configured');
    }
    if (!Array.isArray(req?.body?.recentRows)) {
      return errorResponse(res, 400, 'recentRows must be an array');
    }

    const current = await fetchInternalJson('/config/controller-profile');
    if (!current?.ok || !current?.json?.profile) {
      return errorResponse(res, 503, 'home profile is unavailable');
    }

    const result = await internalFeatureRequest('/config/controller-profile', {
      method: 'POST',
      body: {
        profile: {
          ...current.json.profile,
          recentRows: req.body.recentRows,
        },
      },
    });
    if (!result?.ok) {
      const status = Number(result?.status);
      return errorResponse(res, status >= 400 && status < 600 ? status : 502, 'home profile update failed');
    }

    return res.json({
      ok: true,
      profile: sanitizeMobileHomeProfile(result.json?.profile || {
        ...current.json.profile,
        recentRows: req.body.recentRows,
      }),
    });
  }));

  app.get('/v1/mobile/home/artwork/:artworkId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const descriptor = homeArtworkEntries.get(text(req?.params?.artworkId));
    if (!descriptor) return errorResponse(res, 404, 'home artwork is unavailable');
    if (!serveHomeArtwork) return errorResponse(res, 503, 'mobile home artwork is not configured');
    return serveHomeArtwork(res, descriptor, req);
  }));

  app.get('/v1/mobile/catalog/stats', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    return res.json({ ok: true, builtAt: catalog.builtAt, counts: catalog.counts });
  }));

  app.get('/v1/mobile/playlists', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const playlists = await loadMobilePlaylists();
    return res.json({
      ok: true,
      ...page(playlists.map((playlist) => mobilePlaylistSummary(playlist, catalog, baseUrl)), pageArgs(req.query)),
    });
  }));

  app.get('/v1/mobile/playlists/:playlistId/artwork', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!servePlaylistArtwork) return errorResponse(res, 503, 'mobile playlist artwork is not configured');
    const playlistId = text(req?.params?.playlistId);
    const playlists = await loadMobilePlaylists();
    const playlist = playlists.find((row) => (
      createMobilePlaylistId({ secret: trackIdSecret, name: row.name }) === playlistId
    ));
    if (!playlist) return errorResponse(res, 404, 'playlist not found');
    return servePlaylistArtwork(res, playlist.name);
  }));

  app.get('/v1/mobile/playlists/:playlistId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const playlistId = text(req?.params?.playlistId);
    const playlists = await loadMobilePlaylists();
    const playlist = playlists.find((row) => (
      createMobilePlaylistId({ secret: trackIdSecret, name: row.name }) === playlistId
    ));
    if (!playlist) return errorResponse(res, 404, 'playlist not found');

    const catalog = await loadCatalog();
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const entries = playlist.files.map((file, index) => {
      const track = catalog.byFile.get(file);
      return {
        position: index + 1,
        available: Boolean(track),
        track: track ? publicMobileTrack(track, { baseUrl }) : null,
        unavailableReason: track ? null : 'track is unavailable in the mobile catalog',
      };
    });

    return res.json({
      ok: true,
      playlist: mobilePlaylistSummary(playlist, catalog, baseUrl),
      entries,
    });
  }));

  app.get('/v1/mobile/catalog/artists', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const q = text(req?.query?.q).toLocaleLowerCase();
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const artists = catalog.artists
      .filter((artist) => !q || text(artist.artist).toLocaleLowerCase().includes(q))
      .map((artist) => mobileArtist(artist, catalog, baseUrl));
    return res.json({ ok: true, ...page(artists, pageArgs(req.query)) });
  }));

  app.get('/v1/mobile/catalog/artists/:artistId/albums', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    await ensureAlbumAddedAt(catalog);
    const artist = catalog.byArtistId.get(text(req?.params?.artistId));
    if (!artist) return errorResponse(res, 404, 'artist not found');
    const albums = artist.albumIds
      .map((albumId) => catalog.byAlbumId.get(albumId))
      .filter(Boolean)
      .map((album) => publicMobileAlbum(album, catalog, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }));
    return res.json({
      ok: true,
      artist: mobileArtist(artist, catalog, requestBaseUrl(req, mobileBaseUrl)),
      ...page(albums, pageArgs(req.query)),
    });
  }));

  app.get('/v1/mobile/catalog/albums', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    await ensureAlbumAddedAt(catalog);
    const q = text(req?.query?.q).toLocaleLowerCase();
    const artistId = text(req?.query?.artistId);
    const albums = catalog.albums
      .filter((album) => !artistId || album.artistId === artistId)
      .filter((album) => !q || `${album.artist} ${album.album}`.toLocaleLowerCase().includes(q))
      .map((album) => publicMobileAlbum(album, catalog, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }));
    return res.json({ ok: true, ...page(albums, pageArgs(req.query)) });
  }));

  app.get('/v1/mobile/catalog/albums/:albumId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    await ensureAlbumAddedAt(catalog);
    const album = catalog.byAlbumId.get(text(req?.params?.albumId));
    if (!album) return errorResponse(res, 404, 'album not found');
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    return res.json({
      ok: true,
      album: publicMobileAlbum(album, catalog, { baseUrl }),
      tracks: album.trackIds
        .map((trackId) => catalog.byTrackId.get(trackId))
        .filter(Boolean)
        .map((track) => publicMobileTrack(track, { baseUrl })),
    });
  }));

  app.get('/v1/mobile/catalog/tracks/:trackId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');
    return res.json({ ok: true, track: publicMobileTrack(track, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }) });
  }));

  app.get('/v1/mobile/catalog/tracks/:trackId/rating', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');
    return res.json({ ok: true, ...(await readMobileTrackRating(track)) });
  }));

  app.post('/v1/mobile/catalog/tracks/:trackId/rating', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');

    const requestedRating = Number(req?.body?.rating);
    if (!Number.isInteger(requestedRating) || requestedRating < 0 || requestedRating > 5) {
      return errorResponse(res, 400, 'rating must be an integer 0..5');
    }

    const current = await readMobileTrackRating(track);
    if (current.disabled) return res.json({ ok: true, ...current });
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile rating control is not configured');

    const result = await internalFeatureRequest('/rating', {
      method: 'POST',
      body: { file: track.file, rating: requestedRating },
    });
    if (!result?.ok) {
      const status = Number(result?.status);
      return errorResponse(res, status >= 400 && status < 500 ? status : 502, 'rating update failed');
    }
    if (result.json?.disabled) {
      return res.json({ ok: true, rating: 0, ratingDisabled: true, disabled: true });
    }

    const rating = Number(result.json?.rating);
    return res.json({
      ok: true,
      rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : requestedRating,
      ratingDisabled: false,
      disabled: false,
    });
  }));

  app.get('/v1/mobile/catalog/tracks/:trackId/favorite', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');
    return res.json({ ok: true, ...(await readMobileTrackFavorite(track)) });
  }));

  app.post('/v1/mobile/catalog/tracks/:trackId/favorite', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (typeof req?.body?.favorite !== 'boolean') {
      return errorResponse(res, 400, 'favorite must be boolean');
    }

    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');

    const current = await readMobileTrackFavorite(track);
    if (current.disabled) return res.json({ ok: true, ...current });
    if (!fetchInternalRequest) return errorResponse(res, 503, 'mobile favorite control is not configured');

    const result = await internalFeatureRequest('/favorites/toggle', {
      method: 'POST',
      body: { file: track.file, favorite: req.body.favorite },
    });
    if (!result?.ok) return errorResponse(res, 502, 'favorite update failed');
    if (result.json?.disabled) {
      return res.json({ ok: true, isFavorite: false, disabled: true });
    }

    return res.json({
      ok: true,
      isFavorite: typeof result.json?.isFavorite === 'boolean'
        ? result.json.isFavorite
        : req.body.favorite,
      disabled: false,
    });
  }));

  app.get('/v1/mobile/search', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const q = text(req?.query?.q).toLocaleLowerCase();
    if (!q) return errorResponse(res, 400, 'q is required');
    const tracks = catalog.tracks
      .filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(q))
      .map((track) => publicMobileTrack(track, { baseUrl: requestBaseUrl(req, mobileBaseUrl) }));
    return res.json({ ok: true, ...page(tracks, pageArgs(req.query)) });
  }));

  // This is deliberately a resolver manifest rather than another catalog.
  // It exposes only the canonical track ID and the relative byte location
  // needed by a paired device that has cloned the music library.
  app.get('/v1/mobile/local-source/manifest', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!musicLibraryRoot) return errorResponse(res, 503, 'local source manifest is not configured');

    const catalog = await loadCatalog();
    const entries = [];
    for (const track of catalog.tracks) {
      const localPath = mpdFileToLocalPath(track.file);
      if (!localPath || !safeIsFile(localPath)) continue;

      const relativePath = path.relative(musicLibraryRoot, path.resolve(localPath));
      if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        continue;
      }

      const stat = await statLocalFile(localPath);
      const regularFile = typeof stat?.isFile === 'function'
        ? stat.isFile()
        : stat?.isFile !== false;
      if (!stat || !regularFile || !Number.isFinite(Number(stat.size))) {
        continue;
      }

      entries.push({
        trackId: track.id,
        relativePath: relativePath.split(path.sep).join('/'),
        contentPath: contentRelativePath(relativePath),
        sizeBytes: Math.max(0, Number(stat.size) || 0),
        durationSec: Math.max(0, Number(track.durationSec) || 0),
        format: track.format,
        musicBrainz: track.musicBrainz,
      });
    }

    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      schema: 'now-playing.mobile-local-source-manifest.v1',
      catalogRevision: catalog.builtAt || 'unknown',
      entries,
    });
  }));

  app.post('/v1/mobile/playback/events', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (!listeningHistory) return errorResponse(res, 503, 'mobile playback history is not configured');

    const body = req?.body && typeof req.body === 'object' ? req.body : {};
    const trackId = text(body.trackId);
    const sessionId = text(body.sessionId);
    const state = text(body.state).toLocaleLowerCase() || 'progress';
    const allowedStates = new Set(['start', 'playing', 'progress', 'pause', 'stop', 'ended']);
    if (!trackId) return errorResponse(res, 400, 'trackId is required');
    if (!sessionId || sessionId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) {
      return errorResponse(res, 400, 'sessionId is required');
    }
    if (!allowedStates.has(state)) return errorResponse(res, 400, 'unsupported playback state');

    const catalog = await loadCatalog();
    let track = catalog.byTrackId.get(trackId);
    const isRadioTrack = trackId.startsWith('radio-');
    if (!track && isRadioTrack) {
      const stationId = trackId.slice('radio-'.length);
      const file = await resolveRadioFile(req, stationId);
      if (file) {
        const stations = await loadRadioStations(req).catch(() => []);
        const station = stations.find((row) => row.id === stationId);
        track = radioPlaybackTrack({ stationId, file, station });
      }
    }
    if (!track && trackId.startsWith('podcast-')) {
      track = await podcastPlaybackTrackForId(req, trackId);
    }
    if (!track) return errorResponse(res, 404, 'track not found');

    const trackKind = trackId.startsWith('podcast-')
      ? 'podcast'
      : (trackId.startsWith('radio-') ? 'radio' : 'catalog');
    const playbackLog = {
      state,
      trackKind,
      sessionIdPresent: Boolean(sessionId),
      deviceIdPresent: Boolean(text(session.deviceId)),
      title: text(track.title) || 'unknown',
      filePresent: Boolean(text(track.file)),
    };
    if (state === 'start') {
      log.info('[mobile/playback] start accepted', playbackLog);
    } else {
      log.debug('[mobile/playback] event accepted', playbackLog);
    }

    const elapsedSec = Math.max(0, Number(body.elapsedSec) || 0);
    const durationSec = Math.max(0, Number(body.durationSec) || Number(track.durationSec) || 0);
    const requestedStartMs = Number(body.startedAtMs);
    const nowMs = Date.now();
    const startedAtMs = Number.isFinite(requestedStartMs) && requestedStartMs > 0
      ? Math.min(nowMs, Math.max(nowMs - (7 * 24 * 60 * 60 * 1000), requestedStartMs))
      : nowMs;
    const result = await listeningHistory.observe({
      status: {
        state,
        songid: `mobile:${sessionId}`,
        elapsedSec,
      },
      song: {
        trackKey: trackId,
        file: track.file,
        artist: track.artist,
        albumArtist: track.albumArtist,
        album: track.album,
        title: track.title,
        track: track.track,
        genre: track.genre,
        durationSec,
      },
      sessionId: `mobile:${sessionId}`,
      startedAtMs,
      eligible: true,
      source: 'ios-device',
      atMs: nowMs,
    });

    // Native radio sends a second request after the server-side iTunes/art
    // enrichment completes. Defer its APNs notification until that response
    // so the alert carries the verified song metadata and album artwork.
    if (state === 'start' && notifyNativePlayback && !isStreamFile(track.file)) {
      log.info('[mobile/playback] APNs bridge queued', {
        trackKind,
        title: text(track.title) || 'unknown',
        filePresent: Boolean(text(track.file)),
      });
      Promise.resolve()
        .then(() => notifyNativePlayback({
          track,
          trackId,
          sessionId,
          deviceId: session.deviceId,
        }))
        .catch((error) => {
          log.error('[mobile/playback] APNs bridge failed', {
            trackKind,
            title: text(track.title) || 'unknown',
            error: error?.message || String(error),
          });
        });
    } else if (state === 'start') {
      log.info('[mobile/playback] APNs bridge skipped', {
        reason: notifyNativePlayback ? 'stream_track' : 'bridge_unavailable',
        trackKind,
        title: text(track.title) || 'unknown',
      });
    }

    return res.json({
      ok: true,
      trackId,
      sessionId,
      state,
      recorded: Boolean(result?.recorded),
      reason: result?.reason || null,
    });
  }));

  // The native client uses this only to seed an empty display queue. It must
  // never be treated as a queue mutation or as the current playback state.
  app.get('/v1/mobile/history/recent', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    if (!listeningHistory || typeof listeningHistory.getEvents !== 'function') {
      return errorResponse(res, 503, 'mobile playback history is not configured');
    }

    const catalog = await loadCatalog();
    const events = await listeningHistory.getEvents({ limit: 25 });
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    for (const event of events) {
      const eventTrackID = text(event.trackKey);
      let track = eventTrackID ? catalog.byTrackId.get(eventTrackID) : null;
      if (!track && text(event.file)) {
        track = catalog.tracks.find((candidate) => candidate.file === event.file) || null;
      }
      if (!track && eventTrackID.startsWith('radio-')) {
        const stationId = eventTrackID.slice('radio-'.length);
        const file = await resolveRadioFile(req, stationId);
        if (file) {
          const stations = await loadRadioStations(req).catch(() => []);
          const station = stations.find((row) => row.id === stationId);
          track = radioPlaybackTrack({ stationId, file, station });
        }
      }
      if (!track) continue;

      return res.json({
        ok: true,
        track: publicMobileTrack(track, { baseUrl }),
        playedAt: event.playedAt || null,
      });
    }

    return res.json({ ok: true, track: null, playedAt: null });
  }));

  app.get('/v1/mobile/artwork/:trackId', asyncRoute(async (req, res) => {
    if (!requireSession(req, res)) return;
    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(text(req?.params?.trackId));
    if (!track) return errorResponse(res, 404, 'track not found');
    if (!serveArtworkForTrack) return errorResponse(res, 503, 'mobile artwork is not configured');
    return serveArtworkForTrack(res, track.file);
  }));

  app.post('/v1/mobile/media-authorizations', asyncRoute(async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const trackId = text(req?.body?.trackId);
    const requestedFormat = text(req?.body?.format).toLocaleLowerCase() || 'mp3';
    if (!trackId) return errorResponse(res, 400, 'trackId is required');
    if (!['mp3', 'original'].includes(requestedFormat)) return errorResponse(res, 400, 'unsupported format');

    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(trackId);
    if (!track) return errorResponse(res, 404, 'track not found');
    if (!extensionIsSupported(track.file)) return errorResponse(res, 415, 'unsupported source format');
    if (requestedFormat === 'mp3' && !transcodeTracks && !track.file.toLowerCase().endsWith('.mp3')) {
      return errorResponse(res, 415, 'mp3 transcoding is disabled');
    }

    const ticket = createMobileMediaTicket({
      secret: apiSecret,
      deviceId: session.deviceId,
      trackId,
      format: requestedFormat,
      ttlMs: MEDIA_TICKET_TTL_MS,
    });
    const baseUrl = requestBaseUrl(req, mobileBaseUrl);
    const url = `${baseUrl}/v1/mobile/media/${encodeURIComponent(trackId)}?ticket=${encodeURIComponent(ticket)}`;
    const contentType = requestedFormat === 'mp3' ? 'audio/mpeg' : audioContentTypeForPath(track.file);
    return res.json({
      ok: true,
      trackId,
      format: requestedFormat,
      contentType,
      supportsRange: true,
      url,
      expiresAt: new Date(Date.now() + MEDIA_TICKET_TTL_MS).toISOString(),
    });
  }));

  app.get('/v1/mobile/media/:trackId', asyncRoute(async (req, res) => {
    const trackId = text(req?.params?.trackId);
    const claims = verifyMobileToken(text(req?.query?.ticket), { secret: apiSecret, scope: 'mobile-media' });
    if (!claims || claims.trackId !== trackId) return errorResponse(res, 401, 'media ticket is missing or expired');

    const catalog = await loadCatalog();
    const track = catalog.byTrackId.get(trackId);
    if (!track) return errorResponse(res, 404, 'track not found');

    const localPath = mpdFileToLocalPath(track.file);
    if (!localPath || !safeIsFile(localPath)) return errorResponse(res, 404, 'track is unavailable');

    let servingPath = localPath;
    let contentType = audioContentTypeForPath(localPath);
    if (claims.format === 'mp3' && !localPath.toLowerCase().endsWith('.mp3')) {
      if (!transcodeTracks) return errorResponse(res, 415, 'mp3 transcoding is disabled');
      await fs.promises.mkdir(mobileTrackCacheDir, { recursive: true });
      const cachePath = path.join(mobileTrackCacheDir, `${cacheKeyFor(`mobile:${track.file}`, 0)}.mp3`);
      if (!safeIsFile(cachePath)) {
        await transcodeToMp3File({ inputPath: localPath, outputPath: cachePath, startSec: 0 });
      }
      servingPath = cachePath;
      contentType = 'audio/mpeg';
    }

    res.setHeader('Content-Disposition', 'inline');
    return serveFileWithRange(req, res, servingPath, contentType);
  }));
}
