/*
 * Optional Apple Music editorial metadata enrichment.
 *
 * The existing iTunes matcher remains authoritative for identity. This
 * service only follows an already-accepted Apple catalog URL/ID and never
 * performs a second fuzzy search. Without an Apple Music developer token it
 * is deliberately a no-op.
 */

const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_POSITIVE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_NEGATIVE_TTL_MS = 1000 * 60 * 60 * 12;

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstText(...values) {
  return values.map(text).find(Boolean) || '';
}

export function extractAppleCatalogId(url, kind = 'track') {
  const raw = text(url);
  if (!raw) return '';
  const query = raw.match(kind === 'album'
    ? /[?&]id=([0-9]+)/i
    : /[?&](?:i|id)=([0-9]+)/i);
  if (query) return query[1];
  const path = raw.match(new RegExp(`/${kind === 'album' ? 'album' : 'song'}/[^/?#]+/(\\d+)(?:[/?#]|$)`, 'i'));
  return path?.[1] || '';
}

export function normalizeEditorialNotes(editorialNotes, { type, sourceId } = {}) {
  const notes = editorialNotes && typeof editorialNotes === 'object' ? editorialNotes : {};
  const standard = firstText(notes.standard, notes.standard?.text, notes.standard?.value);
  const shortText = firstText(notes.short, notes.short?.text, notes.short?.value);
  const tagline = firstText(notes.tagline, notes.tagline?.text, notes.tagline?.value);
  const primary = standard || shortText || tagline;
  if (!primary) return null;
  return {
    type: type === 'album' ? 'album' : 'track',
    text: primary,
    ...(shortText ? { shortText } : {}),
    ...(tagline ? { tagline } : {}),
    source: 'apple',
    ...(sourceId ? { sourceId: text(sourceId) } : {}),
    match: { confidence: 'strong' },
  };
}

function extractEditorial(resource, type) {
  const attributes = resource?.attributes || {};
  return normalizeEditorialNotes(attributes.editorialNotes, {
    type,
    sourceId: resource?.id,
  });
}

function albumResourceFromSong(song) {
  const relationship = song?.relationships?.albums?.data?.[0];
  return relationship && typeof relationship === 'object' ? relationship : null;
}

export function createAppleAboutService({
  developerToken = '',
  tokenProvider = null,
  storefront = 'us',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  positiveTtlMs = DEFAULT_POSITIVE_TTL_MS,
  negativeTtlMs = DEFAULT_NEGATIVE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const token = text(developerToken);

  const getCached = (key) => {
    const hit = cache.get(key);
    if (!hit) return { found: false, value: null };
    const ttl = hit.value ? positiveTtlMs : negativeTtlMs;
    if (now() - hit.ts >= ttl) {
      cache.delete(key);
      return { found: false, value: null };
    }
    return { found: true, value: hit.value };
  };

  const setCached = (key, value) => {
    if (cache.size >= 2000) cache.delete(cache.keys().next().value);
    cache.set(key, { ts: now(), value: value || null });
  };

  async function fetchJson(url) {
    const activeToken = token || (typeof tokenProvider === 'function' ? await tokenProvider().catch(() => '') : '');
    if (!fetchImpl || !activeToken) return null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${activeToken}`, Accept: 'application/json' },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response?.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function getAbout({ trackUrl = '', albumUrl = '', identityKey = '' } = {}) {
    if (!token && typeof tokenProvider !== 'function') return null;
    const trackId = extractAppleCatalogId(trackUrl, 'track');
    const albumId = extractAppleCatalogId(albumUrl, 'album');
    if (!trackId && !albumId) return null;

    const key = `apple-about|${identityKey || ''}|track:${trackId}|album:${albumId}`;
    const cached = getCached(key);
    if (cached.found) return cached.value;

    let track = null;
    if (trackId) {
      const data = await fetchJson(`https://api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs/${encodeURIComponent(trackId)}?include=albums`);
      track = data?.data?.[0] || null;
      const trackAbout = extractEditorial(track, 'track');
      if (trackAbout) {
        setCached(key, trackAbout);
        return trackAbout;
      }
    }

    const relatedAlbum = albumResourceFromSong(track);
    const effectiveAlbumId = albumId || text(relatedAlbum?.id);
    let album = relatedAlbum;
    if (effectiveAlbumId && !extractEditorial(album, 'album')) {
      const data = await fetchJson(`https://api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/albums/${encodeURIComponent(effectiveAlbumId)}`);
      album = data?.data?.[0] || album;
    }
    const albumAbout = extractEditorial(album, 'album');
    setCached(key, albumAbout);
    return albumAbout;
  }

  return {
    getAbout,
    cache,
    clear: () => cache.clear(),
  };
}
