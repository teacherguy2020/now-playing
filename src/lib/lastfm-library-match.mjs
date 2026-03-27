import { getBrowseIndex } from './browse-index.mjs';

function norm(s = '') {
  return String(s || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’`´]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function createLastfmIndexResolver({ mpdHost = 'moode.local', baseUrl = '', trackKey = '' } = {}) {
  const idx = await getBrowseIndex(String(mpdHost || 'moode.local'));
  const tracks = Array.isArray(idx?.tracks) ? idx.tracks : [];

  const byTrackArtist = new Map();
  const byArtist = new Map();
  const byAlbumArtist = new Map();

  for (const t of tracks) {
    const file = String(t?.file || '').trim();
    if (!file) continue;
    const artist = String(t?.albumArtist || t?.artist || '').trim();
    const title = String(t?.title || '').trim();
    const album = String(t?.album || '').trim();

    const ak = norm(artist);
    if (ak && !byArtist.has(ak)) byArtist.set(ak, t);

    const tk = `${norm(title)}|${ak}`;
    if (title && ak && !byTrackArtist.has(tk)) byTrackArtist.set(tk, t);

    const albk = `${norm(album)}|${ak}`;
    if (album && ak && !byAlbumArtist.has(albk)) byAlbumArtist.set(albk, t);
  }

  const artFor = (file) => {
    const f = String(file || '').trim();
    if (!f || !baseUrl) return '/icons/icon-192.png';
    const u = new URL('/art/track_640.jpg', baseUrl);
    u.searchParams.set('file', f);
    if (trackKey) u.searchParams.set('k', trackKey);
    return u.toString();
  };

  return {
    resolveTrack({ track = '', artist = '' } = {}) {
      const hit = byTrackArtist.get(`${norm(track)}|${norm(artist)}`);
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
    resolveAlbum({ album = '', artist = '' } = {}) {
      const hit = byAlbumArtist.get(`${norm(album)}|${norm(artist)}`);
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
    resolveArtist({ artist = '' } = {}) {
      const hit = byArtist.get(norm(artist));
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
  };
}
